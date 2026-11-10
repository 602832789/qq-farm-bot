/**
 * 点券限时礼包自动购买（老版 mall-gift-auto-buy.js 移植并泛化）。
 *
 * 老版把 goods_id 写死成 1061、并锁死活动起止时间戳；本版改为「任何以『点券』(currency 1002)
 * 计价、带限购、且仍在活动期内的有限礼包」都自动买满，更通用也不会随活动切换而失效。
 * 开关 mall_coupon_gift_buy 控制是否启用。
 */
export {};

const { getAutomation } = require('../models/store');
const { getUserState } = require('../utils/network');
const { log, toNum } = require('../utils/utils');
const { getMallGoodsList, purchaseMallGoods } = require('./mall');

const COUPON_CURRENCY_ID = 1002; // 点券
const MALL_COUPON_SLOT_TYPE = 5; // 点券礼包所在货架（老版 getMallGoodsList(5)）
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** 当前账号的点券余额。 */
function getCouponBalance(state: any): number {
    return Math.max(0, toNum(state && state.coupon));
}

/**
 * 返回该礼包这一轮应购买的数量；条件不满足（非点券计价 / 不可售 / 无限购 / 已过期 / 点券不足）返回 0。
 * @param goods 商城货架条目（取 price.id / price.count / purchase_limit / is_available）。
 * @param balance 当前点券余额；Infinity 时只用于「只算差额提示」的探测。
 * @param nowSec 服务器时间（秒），用于判断活动是否已结束。
 */
function getCouponGiftPurchase(goods: any, balance: number, nowSec: number): number {
    const price = goods && goods.price;
    const currencyId = toNum(price && price.id);
    const unitPrice = toNum(price && price.count);
    const limit = goods && goods.purchase_limit;
    if (currencyId !== COUPON_CURRENCY_ID) return 0;
    if (!toNum(goods.is_available)) return 0;
    if (unitPrice <= 0) return 0;
    if (!limit || toNum(limit.limit_count) <= 0) return 0;
    const remaining = Math.max(0, toNum(limit.limit_count) - toNum(limit.bought_count));
    if (remaining <= 0) return 0;
    const endTime = Math.max(toNum(goods.discount_end_time), toNum(goods.promotion_end_time));
    if (endTime > 0 && nowSec > endTime) return 0;
    return balance >= remaining * unitPrice ? remaining : 0;
}

function createCouponGiftBuyer(
    deps: {
        getAutomation: () => any;
        getBalance: () => number;
        getGoods: () => Promise<any[]>;
        purchase: (goodsId: number, count: number) => Promise<any>;
        report: (message: string, result: string) => void;
        now?: () => number;
    },
): () => Promise<number> {
    let busy = false;
    let lastCheck = -Infinity;
    return async function autoBuyCouponGifts(force: boolean = false): Promise<number> {
        const now = deps.now || Date.now;
        if (busy || deps.getAutomation().mall_coupon_gift_buy !== true || (!force && now() - lastCheck < CHECK_INTERVAL_MS)) return 0;
        busy = true;
        lastCheck = now();
        let bought = 0;
        try {
            const goods = await deps.getGoods();
            let balance = deps.getBalance();
            for (const item of Array.isArray(goods) ? goods : []) {
                if (deps.getAutomation().mall_coupon_gift_buy !== true) break;
                const count = getCouponGiftPurchase(item, balance, Math.floor(now() / 1000));
                if (!count) {
                    const requiredCount = getCouponGiftPurchase(item, Number.MAX_SAFE_INTEGER, Math.floor(now() / 1000));
                    if (requiredCount > 0) {
                        deps.report(`点券礼包购买已跳过：需要 ${toNum(item.price && item.price.count) * requiredCount} 点券，当前 ${balance}`, 'skip');
                    }
                    continue;
                }
                await deps.purchase(toNum(item.goods_id), count);
                balance -= toNum(item.price && item.price.count) * count;
                bought += count;
                deps.report(`自动购买点券限时礼包：${item.name} x${count}`, 'success');
            }
        } catch (error: any) {
            deps.report(`自动购买点券限时礼包失败：${error && error.message || error}`, 'error');
        } finally {
            busy = false;
        }
        return bought;
    };
}

const autoBuyCouponGifts = createCouponGiftBuyer({
    getAutomation,
    getBalance: () => getCouponBalance(getUserState()),
    getGoods: () => getMallGoodsList(MALL_COUPON_SLOT_TYPE),
    purchase: purchaseMallGoods,
    report: (message: string, result: string) => log('商城', message, { module: 'shop', event: '点券限时礼包自动购买', result }),
});

module.exports = {
    COUPON_CURRENCY_ID,
    MALL_COUPON_SLOT_TYPE,
    getCouponBalance,
    getCouponGiftPurchase,
    createCouponGiftBuyer,
    autoBuyCouponGifts,
};
