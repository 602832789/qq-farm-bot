export {};
import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';

/**
 * Auth-related routes: login, register, login-logs, card info, user renew,
 * change-password, auth gate, utility routes, user/me, QR.
 */

const fetch = require('node-fetch');
const { version } = require('../../../package.json');
const { getRuntimeConfig } = require('../../config/config');
const { getSchedulerRegistrySnapshot } = require('../../services/scheduler');
const { createModuleLogger } = require('../../services/logger');
const { MiniProgramLoginSession } = require('../../services/qrlogin');
const store = require('../../models/store');
const userStore = require('../../models/user-store');

const {
    getClientIp,
    issueToken,
    createAuthRequired,
    createCheckUserAccess,
    adminRequired,
    getAccId,
    checkAccountAccess,
    handleApiError,
} = require('./middleware');

const adminLogger = createModuleLogger('admin');

function mountAuthRoutes(app: Application, ctx: AdminContext): void {
    const authRequired = createAuthRequired(ctx);
    const checkUserAccess = createCheckUserAccess(ctx);

    // 登录与鉴权
    app.post('/api/login', (req: Request, res: Response) => {
        const { username, password } = req.body || {};
        const clientIp = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';

        if (username && password) {
            const user = userStore.validateUser(username, password, clientIp);

            if (user && user.error) {
                const statusCode = user.error === 'rate_limit' ? 429 :
                                   user.error === 'locked' ? 423 : 401;

                adminLogger.warn('登录失败', {
                    username,
                    error: user.error,
                    ip: clientIp,
                    message: user.message
                });

                userStore.addLoginLog({
                    event: 'login_failed',
                    username,
                    errorType: user.error,
                    ip: clientIp,
                    userAgent
                });

                return res.status(statusCode).json({
                    ok: false,
                    error: user.message,
                    errorType: user.error,
                    remainingMs: user.remainingMs
                });
            }

            if (!user) {
                adminLogger.warn('登录失败', { username, ip: clientIp, reason: 'invalid_credentials' });

                userStore.addLoginLog({
                    event: 'login_failed',
                    username,
                    errorType: 'invalid_credentials',
                    ip: clientIp,
                    userAgent
                });

                return res.status(401).json({ ok: false, error: '用户名或密码错误' });
            }

            adminLogger.info('登录检查', { username, role: user.role, cardInfo: user.card ? 'exists' : 'none' });

            if (user.role !== 'admin') {
                if (user.card && user.card.enabled === false) {
                    adminLogger.warn('登录拒绝', { username, reason: 'banned' });
                    return res.status(403).json({ ok: false, error: '账号已被封禁，请联系管理员' });
                }

                if (user.card && user.card.expiresAt) {
                    const now = Date.now();
                    if (user.card.expiresAt < now) {
                        adminLogger.warn('登录拒绝', { username, reason: 'expired' });
                        return res.status(403).json({ ok: false, error: '账号已过期，请续费后重新登录' });
                    }
                }
            }

            const token = issueToken();
            ctx.tokens.add(token);
            ctx.tokenUserMap.set(token, user);

            adminLogger.info('登录成功', { username, role: user.role, ip: clientIp });

            userStore.addLoginLog({
                event: 'login_success',
                username,
                errorType: null,
                ip: clientIp,
                userAgent
            });

            return res.json({
                ok: true,
                data: {
                    token,
                    role: user.role,
                    card: user.card,
                    accountLimit: user.accountLimit || userStore.DEFAULT_ACCOUNT_LIMIT || 2,
                    user: { username: user.username },
                    mustChangePassword: user.mustChangePassword || false
                }
            });
        }

        return res.status(401).json({ ok: false, error: '请输入用户名和密码' });
    });

    // 注册接口
    app.post('/api/register', (req: Request, res: Response) => {
        const { username, password, cardCode } = req.body || {};
        if (!username || !password || !cardCode) {
            return res.status(400).json({ ok: false, error: '请填写完整信息' });
        }
        const result = userStore.registerUser(username, password, cardCode);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        res.json({ ok: true, data: result.user });
    });

    // 获取登录日志（管理员）
    app.get('/api/admin/login-logs', authRequired, (req: Request, res: Response) => {
        if (!(req as any).currentUser || (req as any).currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: '无权限访问' });
        }

        const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string) || 100, 1), 500);
        const offset = Math.max(Number.parseInt(req.query.offset as string) || 0, 0);

        const result = userStore.getLoginLogs(limit, offset);
        res.json({ ok: true, data: result });
    });

    // 清空登录日志（管理员）
    app.delete('/api/admin/login-logs', authRequired, (req: Request, res: Response) => {
        if (!(req as any).currentUser || (req as any).currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: '无权限访问' });
        }

        const result = userStore.clearLoginLogs();
        adminLogger.info('登录日志已清空', { admin: (req as any).currentUser.username });
        res.json(result);
    });

    // 查询卡密信息接口（用于续费前预览）
    app.get('/api/card/info/:code', (req: Request, res: Response) => {
        try {
            const { code } = req.params;
            const cards = userStore.getAllCards();
            const card = cards.find((c: any) => c.code === code);

            if (!card) {
                return res.status(404).json({ ok: false, error: '卡密不存在' });
            }

            if (!card.enabled) {
                return res.status(400).json({ ok: false, error: '卡密已被禁用' });
            }

            if (card.usedBy) {
                return res.status(400).json({ ok: false, error: '卡密已被使用' });
            }

            res.json({
                ok: true,
                data: {
                    type: card.type || 'time',
                    days: card.days,
                    description: card.description
                }
            });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 用户续费接口
    app.post('/api/user/renew', checkUserAccess, (req: Request, res: Response) => {
        const { cardCode } = req.body || {};
        const username = (req as any).currentUser?.username;

        if (!username) {
            return res.status(401).json({ ok: false, error: '未登录' });
        }

        if (!cardCode) {
            return res.status(400).json({ ok: false, error: '请提供卡密' });
        }

        const result = userStore.renewUser(username, cardCode);
        if (!result.ok) {
            return res.status(400).json(result);
        }

        // 更新 token 中的用户信息
        for (const [token, user] of ctx.tokenUserMap.entries()) {
            if (user.username === username) {
                user.card = result.card;
                user.accountLimit = result.accountLimit;
                ctx.tokenUserMap.set(token, user);
                break;
            }
        }

        res.json({ ok: true, data: { card: result.card, accountLimit: result.accountLimit, cardType: result.cardType } });
    });

    // 修改密码接口
    app.post('/api/user/change-password', checkUserAccess, (req: Request, res: Response) => {
        const { oldPassword, newPassword } = req.body || {};
        const username = (req as any).currentUser?.username;

        if (!username) {
            return res.status(401).json({ ok: false, error: '未登录' });
        }

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ ok: false, error: '请提供原密码和新密码' });
        }

        const result = userStore.changePassword(username, oldPassword, newPassword);
        res.json(result);
    });

    app.use('/api', (req: Request, res: Response, next: any) => {
        if (req.path === '/login' || req.path === '/qr/create' || req.path === '/qr/check' || req.path === '/card-claim/status' || req.path === '/card-claim/claim' || req.path === '/game-version') return next();
        return authRequired(req, res, next);
    });

    // 管理员密码修改已移除，统一使用 /api/user/change-password 接口

    app.get('/api/ping', (_req: Request, res: Response) => {
        res.json({ ok: true, data: { ok: true, uptime: process.uptime(), version } });
    });

    app.get('/api/game-version', (_req: Request, res: Response) => {
        const runtimeConfig = getRuntimeConfig();
        res.json({ ok: true, clientVersion: runtimeConfig.clientVersion });
    });

    app.get('/api/auth/validate', (_req: Request, res: Response) => {
        res.json({ ok: true, data: { valid: true } });
    });

    // API: 调度任务快照（用于调度收敛排查）
    app.get('/api/scheduler', async (req: Request, res: Response) => {
        try {
            const id = getAccId(ctx, req);

            // 检查权限（如果指定了账号ID）
            if (id && !checkAccountAccess(ctx, req as any, id)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            if (ctx.provider && typeof ctx.provider.getSchedulerStatus === 'function') {
                const data = await ctx.provider.getSchedulerStatus(id);
                return res.json({ ok: true, data });
            }
            return res.json({ ok: true, data: { runtime: getSchedulerRegistrySnapshot(), worker: null, workerError: 'DataProvider does not support scheduler status' } });
        } catch (e: any) {
            return handleApiError(res, e);
        }
    });

    app.post('/api/logout', (req: Request, res: Response) => {
        const token = (req as any).adminToken;
        if (token) {
            ctx.tokens.delete(token);
            ctx.tokenUserMap.delete(token);
            if (ctx.io) {
                for (const socket of ctx.io.sockets.sockets.values()) {
                    if (String((socket.data as any).adminToken || '') === String(token)) {
                        socket.disconnect(true);
                    }
                }
            }
        }
        res.json({ ok: true });
    });

    // 获取当前登录用户信息
    app.get('/api/user/me', authRequired, (req: Request, res: Response) => {
        try {
            const user = (req as any).currentUser;
            if (!user) {
                return res.status(401).json({ ok: false, error: '未登录' });
            }
            res.json({
                ok: true,
                data: {
                    username: user.username,
                    role: user.role,
                    card: user.card,
                    accountLimit: user.accountLimit || userStore.DEFAULT_ACCOUNT_LIMIT || 2
                }
            });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ QR Code Login APIs (无需账号选择) ============
    // 这些接口不需要 authRequired 也能调用（用于登录流程）
    app.post('/api/qr/create', async (_req: Request, res: Response) => {
        try {
            const result = await MiniProgramLoginSession.requestLoginCode();
            res.json({ ok: true, data: result });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/qr/check', async (req: Request, res: Response) => {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Missing code' });
        }

        try {
            const result = await MiniProgramLoginSession.queryStatus(code);

            if (result.status === 'OK') {
                const ticket = result.ticket;
                const uin = result.uin || '';
                const nickname = result.nickname || ''; // 获取昵称
                const appid = '1112386029'; // Farm appid

                const authCode = await MiniProgramLoginSession.getAuthCode(ticket, appid);

                let avatar = '';
                if (uin) {
                    avatar = `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
                }

                res.json({ ok: true, data: { status: 'OK', code: authCode, uin, avatar, nickname } });
            } else if (result.status === 'Used') {
                res.json({ ok: true, data: { status: 'Used' } });
            } else if (result.status === 'Wait') {
                res.json({ ok: true, data: { status: 'Wait' } });
            } else {
                res.json({ ok: true, data: { status: 'Error', error: result.msg } });
            }
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

}

module.exports = { mountAuthRoutes };
