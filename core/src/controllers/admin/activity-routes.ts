export {};
import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';

const { getAccId, checkAccountAccess, handleApiError } = require('./middleware');

function mountActivityRoutes(app: Application, ctx: AdminContext): void {

    // 获取活动组
    app.get('/api/activity/group/:groupId', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const groupId = Number(req.params.groupId) || 0;
            const data = await ctx.provider.getActivityGroup(id, groupId);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // 获取活动列表
    app.get('/api/activity/list', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const data = await ctx.provider.getActivityList(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // 活动操作（抽奖/兑换/领取）
    app.post('/api/activity/operate', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const { activityId, operateType, param } = req.body || {};
            const data = await ctx.provider.operateActivity(id, activityId, operateType, param || 0);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // 获取节令活动
    app.get('/api/activity/solar-terms', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const data = await ctx.provider.getSolarTerms(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // 获取赛季信息
    app.get('/api/activity/season', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const data = await ctx.provider.getSeasonInfo(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });
}

module.exports = { mountActivityRoutes };
