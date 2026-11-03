import type { Application, Request, Response } from 'express';
import type { AdminContext } from './context';
export {};

const { getAccId } = require('./middleware');
const { getItemById, getSeedImageBySeedId, getSeedHarvestInfo } = require('../../config/gameConfig');
const { toNum } = require('../../utils/utils');

const PET_ITEM_IDS = [90011, 90002, 90003];
const PET_ITEM_ORDER: Record<number, number> = { 90011: 1, 90002: 2, 90003: 3 };
const DECORATION_ITEM_IDS = [2130, 2131];
const DECORATION_SHOP_ID = 4;
const SEED_SHOP_ID = 2;
const PET_SHOP_ID = 3;

function readConditionLevel(goods: any): number {
    for (const condition of goods?.conds || []) {
        if (toNum(condition?.type) === 1) return toNum(condition?.param) || 0;
    }
    return 0;
}

function getOwnedItemIds(bag: any): Set<number> {
    const items = Array.isArray(bag?.originalItems)
        ? bag.originalItems
        : Array.isArray(bag?.items) ? bag.items : [];
    return new Set(items
        .filter((item: any) => Number(item?.count) > 0)
        .map((item: any) => Number(item?.id) || 0));
}


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

    app.get('/api/solar-calendar', withAccount((accountId: string) => ctx.provider.getSolarCalendar(accountId)));
    app.post('/api/solar-calendar/:action', withAccount((accountId: string, req: Request) => ctx.provider.operateSolarCalendar(accountId, req.params.action, req.body)));
    app.post('/api/illustrated/claim', withAccount((accountId: string, req: Request) => ctx.provider.claimIllustratedRewards(accountId, req.body?.type)));

    app.get('/api/activities/milk-tea', withAccount((accountId: string, req: Request) => ctx.provider.getMilkTeaActivity(accountId, req.query.page || 'shop', req.query)));
    app.post('/api/activities/milk-tea/:action', withAccount((accountId: string, req: Request) => ctx.provider.operateMilkTeaActivity(accountId, req.params.action, req.body)));

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

    app.post('/api/mystery-shop/purchase', withAccount((accountId: string, req: Request) => (
        ctx.provider.purchaseMysteryOffer(accountId, req.body?.npcId)
    )));

    // ============ 农场商店（老版移植）：种子 / 宠物 / 装扮 ============

    app.get('/api/shop/seed', withAccount(async (accountId: string) => {
        const status = ctx.provider.getStatus(accountId);
        const userLevel = status?.status?.level || 0;
        const userGold = status?.status?.gold || 0;
        const shopReply = await ctx.provider.getShopInfo(accountId, SEED_SHOP_ID);
        if (!shopReply?.goods_list) return [];

        const seeds = [];
        for (const goods of shopReply.goods_list) {
            const itemId = toNum(goods?.item_id) || 0;
            const itemConfig = getItemById(itemId);
            if (!itemConfig || Number(itemConfig.type) !== 5) continue;

            const requiredLevel = readConditionLevel(goods);
            const limitCount = toNum(goods?.limit_count) || 0;
            const boughtNum = toNum(goods?.bought_num) || 0;
            const isSoldOut = limitCount > 0 && boughtNum >= limitCount;
            const harvestInfo = getSeedHarvestInfo(itemId);
            const price = toNum(goods?.price) || 0;

            seeds.push({
                id: toNum(goods?.id) || 0,
                itemId,
                itemCount: toNum(goods?.item_count) || 1,
                price,
                limitCount,
                boughtNum,
                unlocked: !!goods?.unlocked,
                requiredLevel,
                seedLevel: Number(itemConfig.level) || 0,
                name: itemConfig.effectDesc || itemConfig.name || `种子${itemId}`,
                image: getSeedImageBySeedId(itemId),
                canBuy: goods?.unlocked && userLevel >= requiredLevel && !isSoldOut && userGold >= price,
                isSoldOut,
                expPerSeason: harvestInfo.expPerSeason,
                seasons: harvestInfo.seasons,
                incomePerSeason: harvestInfo.incomePerSeason,
            });
        }

        seeds.sort((left: any, right: any) => left.requiredLevel - right.requiredLevel);
        return seeds;
    }));

    app.get('/api/shop/pet', withAccount(async (accountId: string) => {
        const status = ctx.provider.getStatus(accountId);
        const userLevel = status?.status?.level || 0;
        const userGold = status?.status?.gold || 0;
        const userGoldBean = status?.status?.goldBean || 0;
        const shopReply = await ctx.provider.getShopInfo(accountId, PET_SHOP_ID);
        if (!shopReply?.goods_list) return [];

        const goods = [];
        for (const entry of shopReply.goods_list) {
            const itemId = toNum(entry?.item_id) || 0;
            if (!PET_ITEM_IDS.includes(itemId)) continue;
            const itemConfig = getItemById(itemId);
            if (!itemConfig) continue;

            const requiredLevel = readConditionLevel(entry);
            const limitCount = toNum(entry?.limit_count) || 0;
            const boughtNum = toNum(entry?.bought_num) || 0;
            const isSoldOut = limitCount > 0 && boughtNum >= limitCount;
            const price = toNum(entry?.price) || 0;
            const isGoldenBean = itemId === 90011;

            goods.push({
                id: toNum(entry?.id) || 0,
                itemId,
                itemCount: toNum(entry?.item_count) || 1,
                price,
                limitCount,
                boughtNum,
                unlocked: !!entry?.unlocked,
                requiredLevel,
                name: itemConfig.name || `宠物${itemId}`,
                image: getSeedImageBySeedId(itemId),
                desc: itemConfig.desc || '',
                isGoldenBean,
                canBuy: entry?.unlocked && userLevel >= requiredLevel && !isSoldOut
                    && (isGoldenBean ? userGoldBean >= price : userGold >= price),
                isSoldOut,
            });
        }

        goods.sort((left: any, right: any) => (PET_ITEM_ORDER[left.itemId] || 99) - (PET_ITEM_ORDER[right.itemId] || 99));
        return goods;
    }));

    app.get('/api/shop/decoration', withAccount(async (accountId: string) => {
        const status = ctx.provider.getStatus(accountId);
        if (!status?.connection?.connected) {
            throw Object.assign(new Error('获取装扮商城失败: 账号未运行'), { code: 'ACCOUNT_OFFLINE' });
        }

        const userGoldBean = status?.status?.goldBean || 0;
        const [bag, shopReply] = await Promise.all([
            ctx.provider.getBag(accountId),
            ctx.provider.getShopInfo(accountId, DECORATION_SHOP_ID),
        ]);
        const ownedDecorationIds = getOwnedItemIds(bag);
        const goodsByItemId = new Map();
        for (const goods of shopReply?.goods_list || []) {
            const itemId = toNum(goods?.item_id) || 0;
            if (DECORATION_ITEM_IDS.includes(itemId)) goodsByItemId.set(itemId, goods);
        }

        const decorations = [];
        for (const itemId of DECORATION_ITEM_IDS) {
            const itemConfig = getItemById(itemId);
            if (!itemConfig) continue;
            const goods = goodsByItemId.get(itemId);
            const price = toNum(goods?.price) || Number(itemConfig.price) || 0;
            const limitCount = toNum(goods?.limit_count) || 0;
            const boughtNum = toNum(goods?.bought_num) || 0;
            const soldOut = limitCount > 0 && boughtNum >= limitCount;
            // 已使用的头像框会从背包消失，购买记录才是所有权权威来源。
            const owned = soldOut || ownedDecorationIds.has(itemId);

            decorations.push({
                id: toNum(goods?.id) || itemId,
                itemId,
                itemCount: toNum(goods?.item_count) || 1,
                price,
                limitCount,
                boughtNum,
                name: itemConfig.name || `装扮${itemId}`,
                image: getSeedImageBySeedId(itemId),
                desc: itemConfig.desc || '',
                effectDesc: itemConfig.effectDesc || '',
                owned,
                canBuy: !owned && goods?.unlocked !== false && userGoldBean >= price,
            });
        }

        return decorations;
    }));

    app.post('/api/shop/buy', withAccount(async (accountId: string, req: Request) => {
        const goodsId = toNum(req.body?.goodsId) || 0;
        const num = toNum(req.body?.num) || 0;
        const price = req.body?.price === undefined || req.body?.price === null ? NaN : toNum(req.body?.price);
        if (!goodsId || !num || Number.isNaN(price)) {
            throw Object.assign(new Error('参数不完整'), { code: 'INVALID_GOODS_ID' });
        }

        const buyResult = await ctx.provider.buyGoods(accountId, goodsId, num, price);
        return {
            goods: buyResult?.goods,
            getItems: Array.isArray(buyResult?.get_items)
                ? buyResult.get_items.map((item: any) => ({ id: toNum(item?.id) || 0, count: toNum(item?.count) || 0 }))
                : [],
            costItems: Array.isArray(buyResult?.cost_items)
                ? buyResult.cost_items.map((item: any) => ({ id: toNum(item?.id) || 0, count: toNum(item?.count) || 0 }))
                : [],
        };
    }));
}

module.exports = { mountCommerceRoutes };
