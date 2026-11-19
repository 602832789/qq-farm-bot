import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';
export {};

/**
 * 个人页（角色生涯）接口：移植老版本 /api/career。
 * 按账号把请求分发到对应 worker，返回收获明细、累计收获/偷菜与角色资料。
 */

const { getAccId, handleApiError } = require('./middleware');

function mountCareerRoutes(app: Application, ctx: AdminContext): void {
    app.get('/api/career', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });

        try {
            const data = await ctx.provider.getCareerProfile(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });
}

module.exports = { mountCareerRoutes };
