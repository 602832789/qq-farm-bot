import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';
export {};

const { getAccId } = require('./middleware');

/** 面板内消息（局内通知）：读取本地 JSON，不依赖任何外部推送渠道配置。 */
function mountPanelNotificationRoutes(app: Application, ctx: AdminContext): void {
    app.get('/api/panel-notifications', async (req: Request, res: Response) => {
        const accountId = getAccId(ctx, req);
        if (!accountId) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        try {
            const data = await ctx.provider.getPanelNotifications(accountId);
            return res.json({ ok: true, data: Array.isArray(data) ? data : [] });
        } catch {
            // 通知是附加信息，读取失败时降级为空列表，不打断面板其它请求。
            return res.json({ ok: true, data: [] });
        }
    });
}

module.exports = { mountPanelNotificationRoutes };
