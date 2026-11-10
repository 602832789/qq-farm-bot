import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';
export {};

const { getAccId } = require('./middleware');

const ERROR_MESSAGES: Record<string, string> = {
    INVALID_GOODS_ID: '商品信息无效，请刷新商城后重试',
    INVALID_PURCHASE_COUNT: '购买数量必须是有效的正整数',
    GOODS_NOT_FOUND: '商品已不在当前商城中，请刷新后重试',
    GOODS_UNAVAILABLE: '商品当前不可购买',
    PURCHASE_LIMIT_EXCEEDED: '购买数量超过剩余限购数量',
    INSUFFICIENT_BALANCE: '货币余额不足，无法完成购买',
    INVALID_MYSTERY_NPC_ID: '神秘商人信息无效，请刷新后重试',
    MYSTERY_OFFER_STALE: '神秘商人货品已变化，请刷新后重试',
    MYSTERY_PURCHASE_NOT_CONFIRMED: '购买结果未确认，请刷新后查看',
};

function friendlyError(error: any): { code: string; message: string } {
    const raw = String(error?.message || error || '操作失败');
    const code = String(error?.code || raw.match(/\bcode=(\d+)\b/)?.[1] || 'COMMERCE_OPERATION_FAILED');
    if (ERROR_MESSAGES[code]) return { code, message: ERROR_MESSAGES[code] };
    const protocolMessage = String(error?.errorMessage || '').trim()
        || raw.match(/\bcode=\d+\b(.*)$/)?.[1]?.trim();
    if (protocolMessage) return { code, message: protocolMessage };
    if (raw.includes('账号未运行') || raw.includes('账号已离线') || raw.includes('连接未打开') || raw.includes('账号尚未登录')) {
        return { code: 'ACCOUNT_OFFLINE', message: '当前账号尚未运行，请启动账号后重试' };
    }
    if (raw.includes('请求超时') || raw === 'API Timeout') {
        return { code: 'COMMERCE_TIMEOUT', message: '游戏服务响应超时，请稍后重试' };
    }
    // 网关日志中文化后抛的是「请求等待队列已满」/「请求已中断」。
    // 少了这两类，购买请求会被当成普通失败，把网关内部长串原文直接吐给前端，无法分流重试。
    if (raw.includes('请求等待队列已满')) {
        return { code: 'COMMERCE_BUSY', message: '游戏服务繁忙，请稍后重试' };
    }
    if (raw.includes('发送失败') || raw.includes('请求已中断') || raw.includes('请求被中断')) {
        return { code: 'COMMERCE_REQUEST_INTERRUPTED', message: '购买请求未能完成，请稍后重试' };
    }
    return { code, message: raw || '操作失败，请刷新后重试' };
}

function mountCommerceRoutes(app: Application, ctx: AdminContext): void {
    const withAccount = (handler: (accountId: string, req: Request) => Promise<any>) => {
        return async (req: Request, res: Response) => {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
            try {
                const data = await handler(accountId, req);
                return res.json({ ok: true, data });
            } catch (error: any) {
                const result = friendlyError(error);
                return res.json({ ok: false, error: result.message, errorMessage: result.message, errorCode: result.code });
            }
        };
    };

    // 老版形状路由专用：直接以 handler 返回值作为响应体（{ok, activity} / 平铺字段），
    // 不套 {ok, data} 外壳——老版 MilkTeaActivityPanel 读的是顶层形状。
    const withAccountRaw = (handler: (accountId: string, req: Request) => Promise<any>) => {
        return async (req: Request, res: Response) => {
            const accountId = getAccId(ctx, req);
            if (!accountId) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
            try {
                return res.json(await handler(accountId, req));
            } catch (error: any) {
                const result = friendlyError(error);
                return res.json({ ok: false, error: result.message, errorMessage: result.message, errorCode: result.code });
            }
        };
    };

    app.get('/api/solar-calendar', withAccount((accountId: string) => ctx.provider.getSolarCalendar(accountId)));
    app.post('/api/solar-calendar/:action', withAccount((accountId: string, req: Request) => ctx.provider.operateSolarCalendar(accountId, req.params.action, req.body)));
    app.post('/api/illustrated/claim', withAccount((accountId: string, req: Request) => ctx.provider.claimIllustratedRewards(accountId, req.body?.type)));

    app.get('/api/activities/milk-tea', withAccount((accountId: string, req: Request) => ctx.provider.getMilkTeaActivity(accountId, req.query.page || 'shop', req.query)));
    app.post('/api/activities/milk-tea/:action', withAccount((accountId: string, req: Request) => ctx.provider.operateMilkTeaActivity(accountId, req.params.action, req.body)));

    // 老版奶茶热销页面（MilkTeaActivityPanel）专用：TeaState 形状快照 + 操作 + 显式查询。
    // 响应体保持老版形状（{ok, activity} / 平铺字段），走 withAccountRaw 不套外壳。
    app.get('/api/activity/milk-tea', withAccountRaw(async (accountId: string) => (
        { ok: true, activity: await ctx.provider.getMilkTeaLegacy(accountId) }
    )));
    app.post('/api/activity/milk-tea/operate', withAccountRaw(async (accountId: string, req: Request) => {
        const action = String(req.body?.action || '').trim();
        const params = req.body?.params && typeof req.body.params === 'object' ? req.body.params : {};
        const result = await ctx.provider.operateMilkTeaLegacy(accountId, action, params);
        return { ok: true, ...(result || {}) };
    }));
    app.post('/api/activity/milk-tea/records', withAccountRaw(async (accountId: string, req: Request) => {
        const kind = String(req.body?.kind || '').trim();
        const params = req.body?.params && typeof req.body.params === 'object' ? req.body.params : {};
        const records = await ctx.provider.milkTeaRecordsLegacy(accountId, kind, params);
        // 老版形状：字段平铺在响应体上（friends/robots/rank/sales…）。
        return { ok: true, ...(records && typeof records === 'object' ? records : {}) };
    }));

    app.get('/api/activities/share-reward/:activityId', withAccount((accountId: string, req: Request) => (
        ctx.provider.getShareRewardActivity(accountId, req.params.activityId)
    )));
    app.post('/api/activities/share-reward/:activityId/:action', withAccount((accountId: string, req: Request) => (
        ctx.provider.operateShareRewardActivity(accountId, req.params.activityId, req.params.action, req.body)
    )));

    app.get('/api/activities/autumn/:key', withAccount((accountId: string, req: Request) => (
        ctx.provider.getAutumnActivity(accountId, req.params.key)
    )));
    app.post('/api/activities/autumn/:key/:action', withAccount((accountId: string, req: Request) => (
        ctx.provider.operateAutumnActivity(accountId, req.params.key, req.params.action, req.body)
    )));

    app.get('/api/props-shop', withAccount((accountId: string) => ctx.provider.getPropsShop(accountId)));
    app.post('/api/props-shop/purchase', withAccount((accountId: string, req: Request) => (
        ctx.provider.purchaseProps(accountId, req.body?.goodsId, req.body?.count, req.body?.expectedOffer)
    )));

    app.get('/api/game-mall', withAccount((accountId: string, req: Request) => (
        ctx.provider.getMallCatalog(accountId, req.query.slotType, req.query.subSlotType)
    )));

    app.post('/api/game-mall/purchase', withAccount((accountId: string, req: Request) => (
        ctx.provider.purchaseMallProduct(accountId, req.body?.goodsId, req.body?.count, req.body?.slotType, req.body?.expectedPrice)
    )));

    app.get('/api/mystery-shop', withAccount((accountId: string) => (
        ctx.provider.getMysteryShop(accountId)
    )));

    // 老版 /api/shop/mystery/history：按账号读取本地交易记录（手动 + 自动购买）。
    app.get('/api/mystery-shop/history', withAccount(async (accountId: string) => (
        ctx.provider.getMysteryShopHistory(accountId)
    )));

    app.post('/api/mystery-shop/purchase', withAccount((accountId: string, req: Request) => (
        ctx.provider.purchaseMysteryOffer(accountId, req.body?.npcId)
    )));
}

module.exports = { mountCommerceRoutes };
