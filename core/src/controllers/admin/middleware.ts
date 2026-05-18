export {};
import type { Request, Response, NextFunction } from 'express';
import type { AdminContext } from './context';

/**
 * Admin middleware and helper functions.
 * Each function that needs shared state receives `ctx` as its first parameter.
 */
const crypto = require('node:crypto');

const store = require('../../models/store');
const { normalizeAccountRef, resolveAccountId } = require('../../services/account-resolver');

interface AuthenticatedRequest extends Request {
    adminToken?: string;
    currentUser?: any;
}

const hashPassword = (pwd: unknown): string => crypto.createHash('sha256').update(String(pwd || '')).digest('hex');

function getClientIp(req: Request): string {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return String(cfIp).trim();

    const xRealIp = req.headers['x-real-ip'];
    if (xRealIp) return String(xRealIp).trim();

    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        const ips = String(xForwardedFor).split(',').map(ip => ip.trim()).filter(Boolean);
        if (ips.length > 0) return ips[0];
    }

    if (req.ip && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
        return req.ip;
    }

    const remoteAddr = (req as any).connection?.remoteAddress || req.socket?.remoteAddress;
    if (remoteAddr) {
        if (remoteAddr.startsWith('::ffff:')) {
            return remoteAddr.substring(7);
        }
        return remoteAddr;
    }

    return 'unknown';
}

const issueToken = (): string => crypto.randomBytes(24).toString('hex');

function createAuthRequired(ctx: AdminContext) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        const token = req.headers['x-admin-token'] as string;
        if (!token || !ctx.tokens.has(token)) {
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }
        req.adminToken = token;
        req.currentUser = ctx.tokenUserMap.get(token);

        // 管理员不检查封禁和过期
        if (req.currentUser && req.currentUser.role !== 'admin') {
            // 检查用户状态（每次请求都检查）
            if (req.currentUser.card) {
                // 检查是否被封禁
                if (req.currentUser.card.enabled === false) {
                    console.log('[请求拒绝] 用户已被封禁:', req.currentUser.username);
                    ctx.tokens.delete(token);
                    ctx.tokenUserMap.delete(token);
                    res.status(403).json({ ok: false, error: '账号已被封禁，请联系管理员' });
                    return;
                }

                // 检查是否过期
                if (req.currentUser.card.expiresAt) {
                    const now = Date.now();
                    if (req.currentUser.card.expiresAt < now) {
                        console.log('[请求拒绝] 用户已过期:', req.currentUser.username);
                        ctx.tokens.delete(token);
                        ctx.tokenUserMap.delete(token);
                        res.status(403).json({ ok: false, error: '账号已过期，请续费后重新登录' });
                        return;
                    }
                }
            }
        }

        next();
    };
}

// checkUserAccess is functionally identical to authRequired in the original code
const createCheckUserAccess = createAuthRequired;

const adminRequired = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.currentUser || req.currentUser.role !== 'admin') {
        res.status(403).json({ ok: false, error: '需要管理员权限' });
        return;
    }
    next();
};

// 定期清理过期用户（每5分钟检查一次）
function createCleanupExpiredUsers(ctx: AdminContext): () => void {
    return () => {
        const now = Date.now();
        const usersToCleanup: Array<{ token: string; username: string; reason: string }> = [];

        for (const [token, user] of ctx.tokenUserMap.entries()) {
            if (user.role === 'admin') continue; // 管理员不检查

            // 检查是否被封禁
            if (user.card && user.card.enabled === false) {
                console.log(`[自动检查] 用户 ${user.username} 已被封禁，执行清理...`);
                usersToCleanup.push({ token, username: user.username, reason: 'banned' });
                continue;
            }

            // 检查是否过期
            if (user.card && user.card.expiresAt && user.card.expiresAt < now) {
                console.log(`[自动检查] 用户 ${user.username} 已过期，执行清理...`);
                usersToCleanup.push({ token, username: user.username, reason: 'expired' });
            }
        }

        for (const { token, username, reason } of usersToCleanup) {
            ctx.tokens.delete(token);
            ctx.tokenUserMap.delete(token);
            // 断开相关 socket 连接
            if (ctx.io) {
                for (const socket of ctx.io.sockets.sockets.values()) {
                    if (String((socket.data as any).adminToken || '') === String(token)) {
                        socket.disconnect(true);
                    }
                }
            }
            console.log(`[自动清理] 用户 ${username} 已${reason === 'banned' ? '被封禁' : '过期'}，已强制下线`);
        }
    };
}

function getAccountList(ctx: AdminContext, username: string | null = null): any[] {
    try {
        if (ctx.provider && typeof ctx.provider.getAccounts === 'function') {
            const data = ctx.provider.getAccounts();
            if (data && Array.isArray(data.accounts)) {
                if (username) {
                    return data.accounts.filter((a: any) => a.username === username);
                }
                return data.accounts;
            }
        }
    } catch {
        // ignore provider failures
    }
    const data = store.getAccounts ? store.getAccounts() : { accounts: [] };
    let accounts: any[] = Array.isArray(data.accounts) ? data.accounts : [];
    if (username) {
        accounts = accounts.filter((a: any) => a.username === username);
    }
    return accounts;
}

// 检查用户是否有权访问指定账号
function checkAccountAccess(ctx: AdminContext, req: AuthenticatedRequest, accountId: string): boolean {
    const currentUser = req.currentUser;
    if (!currentUser) return false;
    // 管理员可以访问所有账号
    if (currentUser.role === 'admin') return true;
    // 普通用户只能访问自己的账号
    const accounts = getAccountList(ctx);
    const account = accounts.find((a: any) => a.id === accountId);
    if (!account) return false;
    return account.username === currentUser.username;
}

// 获取当前用户可访问的账号ID列表
function getAccessibleAccountIds(ctx: AdminContext, req: AuthenticatedRequest): string[] {
    const currentUser = req.currentUser;
    if (!currentUser) return [];
    // 管理员可以访问所有账号
    if (currentUser.role === 'admin') {
        const accounts = getAccountList(ctx);
        return accounts.map((a: any) => a.id);
    }
    // 普通用户只能访问自己的账号
    const accounts = getAccountList(ctx, currentUser.username);
    return accounts.map((a: any) => a.id);
}

// 根据用户对象获取可访问的账号ID列表（用于WebSocket）
function getAccessibleAccountIdsForUser(ctx: AdminContext, user: any): string[] {
    if (!user) return [];
    // 管理员可以访问所有账号
    if (user.role === 'admin') {
        const accounts = getAccountList(ctx);
        return accounts.map((a: any) => a.id);
    }
    // 普通用户只能访问自己的账号
    const accounts = getAccountList(ctx, user.username);
    return accounts.map((a: any) => a.id);
}

const isSoftRuntimeError = (err: any): boolean => {
    const msg = String((err && err.message) || '');
    return msg === '账号未运行' || msg === 'API Timeout';
};

function handleApiError(res: Response, err: any): void {
    if (isSoftRuntimeError(err)) {
        res.json({ ok: false, error: err.message });
        return;
    }
    res.status(500).json({ ok: false, error: err.message });
}

function resolveAccId(ctx: AdminContext, rawRef: any): string {
    const input = normalizeAccountRef(rawRef);
    if (!input) return '';

    if (ctx.provider && typeof ctx.provider.resolveAccountId === 'function') {
        const resolvedByProvider = normalizeAccountRef(ctx.provider.resolveAccountId(input));
        if (resolvedByProvider) return resolvedByProvider;
    }

    const resolved = resolveAccountId(getAccountList(ctx), input);
    return resolved || input;
}

// Helper to get account ID from header
function getAccId(ctx: AdminContext, req: Request): string {
    return resolveAccId(ctx, req.headers['x-account-id']);
}

function buildKnownFriendGidSettings(accountId: string): {
    knownFriendGids: any[];
    knownFriendGidSyncCooldownSec: number;
    friendsListCacheTtlSec: number;
} {
    return {
        knownFriendGids: store.getKnownFriendGids ? store.getKnownFriendGids(accountId) : [],
        knownFriendGidSyncCooldownSec: store.getKnownFriendGidSyncCooldownSec
            ? store.getKnownFriendGidSyncCooldownSec(accountId)
            : 600,
        friendsListCacheTtlSec: store.getFriendsListCacheTtlSec
            ? store.getFriendsListCacheTtlSec(accountId)
            : 60,
    };
}

module.exports = {
    hashPassword,
    getClientIp,
    issueToken,
    createAuthRequired,
    createCheckUserAccess,
    adminRequired,
    createCleanupExpiredUsers,
    getAccountList,
    checkAccountAccess,
    getAccessibleAccountIds,
    getAccessibleAccountIdsForUser,
    isSoftRuntimeError,
    handleApiError,
    resolveAccId,
    getAccId,
    buildKnownFriendGidSettings,
};
