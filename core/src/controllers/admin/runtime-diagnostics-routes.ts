import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';
export {};

const { getAccId, handleApiError } = require('./middleware');
const { getRuntimeDiagnosticsSnapshot } = require('../../services/runtime-diagnostics');

/** Worker 进程读数通过 IPC 获取，5 秒内复用，避免首页轮询放大 Worker 负担。 */
const WORKER_CACHE_MS = 5000;
let workerCache: { accountId: string, at: number, value: any } = { accountId: '', at: 0, value: null };

function mountRuntimeDiagnosticsRoutes(app: Application, ctx: AdminContext): void {
    app.get('/api/runtime-diagnostics', async (req: Request, res: Response) => {
        try {
            const accountId = getAccId(ctx, req);
            let accountWorker: any = null;
            if (accountId && ctx.provider && typeof ctx.provider.getSchedulerStatus === 'function') {
                const cached = workerCache.accountId === accountId && Date.now() - workerCache.at < WORKER_CACHE_MS;
                if (cached) {
                    accountWorker = workerCache.value;
                }
                else {
                    try {
                        const status = await ctx.provider.getSchedulerStatus(accountId);
                        accountWorker = status?.worker?.processMetrics || null;
                    } catch {
                        accountWorker = null;
                    }
                    workerCache = { accountId, at: Date.now(), value: accountWorker };
                }
            }
            return res.json({ ok: true, data: getRuntimeDiagnosticsSnapshot({ accountWorker }) });
        } catch (e: any) {
            return handleApiError(res, e);
        }
    });
}

module.exports = { mountRuntimeDiagnosticsRoutes };
