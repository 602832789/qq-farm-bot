export {};
/**
 * Socket.IO setup and realtime emit functions.
 */
import type { AdminContext } from './context';

const { Server } = require('socket.io');
const SocketIOServer = Server;

const {
    resolveAccId,
    getAccountList,
    getAccessibleAccountIdsForUser,
} = require('./middleware');

function applySocketSubscription(ctx: AdminContext, socket: any, accountRef: string = ''): void {
    const incoming = String(accountRef || '').trim();
    const resolved = incoming && incoming !== 'all' ? resolveAccId(ctx, incoming) : '';

    // 获取当前用户信息
    const token = socket.data.adminToken;
    const currentUser = token ? ctx.tokenUserMap.get(token) : null;

    // 检查权限：如果指定了账号ID，检查用户是否有权访问
    if (resolved && currentUser) {
        // 管理员可以访问所有账号
        if (currentUser.role !== 'admin') {
            const accounts = getAccountList(ctx);
            const account = accounts.find((a: any) => a.id === resolved);
            if (!account || account.username !== currentUser.username) {
                // 无权访问，拒绝订阅
                socket.emit('subscribed', { accountId: 'all', error: '无权访问此账号' });
                // 只订阅all频道（空数据）
                for (const room of socket.rooms) {
                    if (room.startsWith('account:')) socket.leave(room);
                }
                socket.join('account:all');
                socket.data.accountId = '';
                return;
            }
        }
    }

    for (const room of socket.rooms) {
        if (room.startsWith('account:')) socket.leave(room);
    }
    if (resolved) {
        socket.join(`account:${resolved}`);
        socket.data.accountId = resolved;
    } else {
        socket.join('account:all');
        socket.data.accountId = '';
    }
    socket.emit('subscribed', { accountId: socket.data.accountId || 'all' });

    try {
        const targetId = socket.data.accountId || '';
        const user = socket.data.user;

        if (targetId && ctx.provider && typeof ctx.provider.getStatus === 'function') {
            const currentStatus = ctx.provider.getStatus(targetId);
            socket.emit('status:update', { accountId: targetId, status: currentStatus });
        }
        if (ctx.provider && typeof ctx.provider.getLogs === 'function') {
            let currentLogs: any[] = ctx.provider.getLogs(targetId, { limit: 100 });
            if (!Array.isArray(currentLogs)) currentLogs = [];

            // 过滤日志：只返回用户有权限访问的账号的日志
            if (user) {
                const accessibleIds = getAccessibleAccountIdsForUser(ctx, user);
                currentLogs = currentLogs.filter((log: any) => {
                    const logAccountId = log.accountId || log.id;
                    // 如果没有账号ID，只返回给用户自己的日志（系统日志）
                    if (!logAccountId) return true;
                    return accessibleIds.includes(logAccountId);
                });
            }

            socket.emit('logs:snapshot', {
                accountId: targetId || 'all',
                logs: currentLogs,
            });
        }
        if (ctx.provider && typeof ctx.provider.getAccountLogs === 'function') {
            let currentAccountLogs: any[] = ctx.provider.getAccountLogs(100);
            if (!Array.isArray(currentAccountLogs)) currentAccountLogs = [];

            // 过滤账号操作日志：只返回用户有权限访问的账号的日志
            if (user) {
                const accessibleIds = getAccessibleAccountIdsForUser(ctx, user);
                currentAccountLogs = currentAccountLogs.filter((log: any) => {
                    const logAccountId = log.accountId || log.id;
                    return accessibleIds.includes(logAccountId);
                });
            }

            socket.emit('account-logs:snapshot', {
                logs: currentAccountLogs,
            });
        }
    } catch {
        // ignore snapshot push errors
    }
}

function setupSocketIO(ctx: AdminContext): void {
    ctx.io = new SocketIOServer(ctx.server as any, {
        path: '/socket.io',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['x-admin-token', 'x-account-id'],
        },
    });

    ctx.io.use((socket: any, next: (err?: Error) => void) => {
        const authToken = socket.handshake.auth && socket.handshake.auth.token
            ? String(socket.handshake.auth.token)
            : '';
        const headerToken = socket.handshake.headers && socket.handshake.headers['x-admin-token']
            ? String(socket.handshake.headers['x-admin-token'])
            : '';
        const token = authToken || headerToken;
        if (!token || !ctx.tokens.has(token)) {
            return next(new Error('Unauthorized'));
        }
        socket.data.adminToken = token;
        // 存储用户信息到socket
        socket.data.user = ctx.tokenUserMap.get(token);
        return next();
    });

    ctx.io.on('connection', (socket: any) => {
        const initialAccountRef = (socket.handshake.auth && socket.handshake.auth.accountId)
            || (socket.handshake.query && socket.handshake.query.accountId)
            || '';
        applySocketSubscription(ctx, socket, initialAccountRef);
        socket.emit('ready', { ok: true, ts: Date.now() });

        socket.on('subscribe', (payload: any) => {
            const body = (payload && typeof payload === 'object') ? payload : {};
            applySocketSubscription(ctx, socket, body.accountId || '');
        });
    });
}

function emitRealtimeStatus(ctx: AdminContext, accountId: string, status: any): void {
    if (!ctx.io) return;
    const id = String(accountId || '').trim();
    if (!id) return;

    // 推送到特定账号房间（只有订阅了该账号的用户能收到）
    ctx.io.to(`account:${id}`).emit('status:update', { accountId: id, status });
}

function emitRealtimeLog(ctx: AdminContext, entry: any): void {
    if (!ctx.io) return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();

    // 如果没有指定账号ID，不推送给任何人（防止数据泄露）
    if (!id) return;

    // 推送到特定账号房间（只有订阅了该账号的用户能收到）
    ctx.io.to(`account:${id}`).emit('log:new', payload);
}

function emitRealtimeAccountLog(ctx: AdminContext, entry: any): void {
    if (!ctx.io) return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();

    // 如果没有指定账号ID，不推送给任何人（防止数据泄露）
    if (!id) return;

    // 推送到特定账号房间（只有订阅了该账号的用户能收到）
    ctx.io.to(`account:${id}`).emit('account-log:new', payload);
}

module.exports = {
    setupSocketIO,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
};
