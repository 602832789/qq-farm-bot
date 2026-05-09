export {};
import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';

/**
 * Farm-related routes: status, automation, fertilizer, lands, seeds, bag,
 * daily-gifts, accounts start/stop, farm operate, analytics, plant-blacklist.
 */

const { getLevelExpProgress } = require('../../config/gameConfig');
const store = require('../../models/store');

const {
    createAuthRequired,
    getAccId,
    checkAccountAccess,
    handleApiError,
    resolveAccId,
} = require('./middleware');

function mountFarmRoutes(app: Application, ctx: AdminContext): void {
    const authRequired = createAuthRequired(ctx);

    // API: 完整状态
    app.get('/api/status', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.json({ ok: false, error: 'Missing x-account-id' });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const data = ctx.provider.getStatus(id);
            if (data && data.status) {
                const { level, exp } = data.status;
                const progress = getLevelExpProgress(level, exp);
                data.levelProgress = progress;
            }
            res.json({ ok: true, data });
        } catch (e: any) {
            res.json({ ok: false, error: e.message });
        }
    });

    app.post('/api/automation', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            let lastData = null;
            for (const [k, v] of Object.entries(req.body)) {
                lastData = await ctx.provider.setAutomation(id, k, v);
            }
            res.json({ ok: true, data: lastData || {} });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/fertilizer/buy', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }

        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const type = String(req.body?.type || 'organic');
            const count = Number(req.body?.count) || 0;
            const bought = await ctx.provider.buyFertilizer(id, type, count);
            res.json({ ok: true, bought });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 检测化肥容器并自动购买
    app.post('/api/fertilizer/check-and-buy', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }

        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const buyOrganic = req.body?.buyOrganic ?? false;
            const buyNormal = req.body?.buyNormal ?? false;
            const organicCount = Number(req.body?.organicCount) || 0;
            const organicThresholdHours = Number(req.body?.organicThresholdHours) || 0;
            const normalCount = Number(req.body?.normalCount) || 0;
            const normalThresholdHours = Number(req.body?.normalThresholdHours) || 0;

            const result = await ctx.provider.checkAndBuyFertilizer(id, {
                buyOrganic,
                buyNormal,
                organicCount,
                organicThresholdHours,
                normalCount,
                normalThresholdHours,
            });
            res.json({ ok: true, ...result });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农田详情
    app.get('/api/lands', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const data = await ctx.provider.getLands(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 蔬菜黑名单
    app.get('/api/plant-blacklist', authRequired, (req: Request, res: Response) => {
        try {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing accountId' });

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            const list = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
            res.json({ ok: true, data: list });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    app.post('/api/plant-blacklist', authRequired, (req: Request, res: Response) => {
        try {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing accountId' });

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            const seedId = Number((req.body || {}).seedId);
            if (!seedId) return res.status(400).json({ ok: false, error: 'Missing seedId' });

            const current = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];

            if (!current.includes(seedId)) {
                const next = [...current, seedId];
                if (store.setPlantBlacklist) {
                    store.setPlantBlacklist(accountId, next);
                }
            }

            if (ctx.provider && typeof ctx.provider.broadcastConfig === 'function') {
                ctx.provider.broadcastConfig(accountId);
            }

            const saved = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
            res.json({ ok: true, data: saved });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    app.delete('/api/plant-blacklist/:seedId', authRequired, (req: Request, res: Response) => {
        try {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing accountId' });

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            const seedId = Number(req.params.seedId);
            if (!seedId) return res.status(400).json({ ok: false, error: 'Missing seedId' });

            const current = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
            const next = current.filter((id: number) => id !== seedId);

            if (store.setPlantBlacklist) {
                store.setPlantBlacklist(accountId, next);
            }

            if (ctx.provider && typeof ctx.provider.broadcastConfig === 'function') {
                ctx.provider.broadcastConfig(accountId);
            }

            const saved = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
            res.json({ ok: true, data: saved });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 批量添加蔬菜黑名单
    app.post('/api/plant-blacklist/batch', authRequired, (req: Request, res: Response) => {
        try {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing accountId' });

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            const seedIds = (req.body || {}).seedIds || [];
            if (!Array.isArray(seedIds)) {
                return res.status(400).json({ ok: false, error: 'seedIds must be an array' });
            }

            const current = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
            const merged = [...new Set([...current, ...seedIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)])];

            if (store.setPlantBlacklist) {
                store.setPlantBlacklist(accountId, merged);
            }

            if (ctx.provider && typeof ctx.provider.broadcastConfig === 'function') {
                ctx.provider.broadcastConfig(accountId);
            }

            const saved = store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
            res.json({ ok: true, data: saved });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 清空蔬菜黑名单
    app.delete('/api/plant-blacklist', authRequired, (req: Request, res: Response) => {
        try {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing accountId' });

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            if (store.setPlantBlacklist) {
                store.setPlantBlacklist(accountId, []);
            }

            if (ctx.provider && typeof ctx.provider.broadcastConfig === 'function') {
                ctx.provider.broadcastConfig(accountId);
            }

            res.json({ ok: true, data: [] });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 种子列表
    app.get('/api/seeds', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const data = await ctx.provider.getSeeds(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 背包物品
    app.get('/api/bag', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const data = await ctx.provider.getBag(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 使用背包物品
    app.post('/api/bag/use', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const { itemId, count } = req.body;
            if (!itemId) return res.status(400).json({ ok: false, error: '缺少 itemId' });
            const data = await ctx.provider.useItem(id, Number(itemId), Math.max(1, Number(count) || 1));
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 出售背包物品
    app.post('/api/bag/sell', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ ok: false, error: '缺少出售物品列表' });
            }
            const data = await ctx.provider.sellItems(id, items);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 获取背包种子列表
    app.get('/api/bag/seeds', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const data = await ctx.provider.getBagSeeds(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 每日礼包状态总览
    app.get('/api/daily-gifts', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const data = await ctx.provider.getDailyGifts(id);
            res.json({ ok: true, data });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 启动账号
    app.post('/api/accounts/:id/start', (req: Request, res: Response) => {
        try {
            const accountId = resolveAccId(ctx, req.params.id);

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            const ok = ctx.provider.startAccount(accountId);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 停止账号
    app.post('/api/accounts/:id/stop', (req: Request, res: Response) => {
        try {
            const accountId = resolveAccId(ctx, req.params.id);

            // 检查权限
            if (!checkAccountAccess(ctx, req as any, accountId)) {
                return res.status(403).json({ ok: false, error: '无权访问此账号' });
            }

            const ok = ctx.provider.stopAccount(accountId);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农场一键操作
    app.post('/api/farm/operate', async (req: Request, res: Response) => {
        const id = getAccId(ctx, req);
        if (!id) return res.status(400).json({ ok: false });

        // 检查权限
        if (!checkAccountAccess(ctx, req as any, id)) {
            return res.status(403).json({ ok: false, error: '无权访问此账号' });
        }

        try {
            const { opType } = req.body; // 'harvest', 'clear', 'plant', 'all'
            await ctx.provider.doFarmOp(id, opType);
            res.json({ ok: true });
        } catch (e: any) {
            handleApiError(res, e);
        }
    });

    // API: 数据分析
    app.get('/api/analytics', async (req: Request, res: Response) => {
        try {
            const sortBy = req.query.sort || 'exp';
            const { getPlantRankings } = require('../../services/analytics');
            const data = getPlantRankings(sortBy);
            res.json({ ok: true, data });
        } catch (e: any) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = { mountFarmRoutes };
