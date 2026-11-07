const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const {
    decideMysteryShopTick,
    isMysteryShopWatchEnabled,
    isCurrencyAllowed,
    DIAMOND_ITEM_ID,
} = require('../dist/services/mystery-shop-auto');

const diamondOffer = {
    active: true,
    npc: { id: 9, reward: { count: 1 }, price: { id: DIAMOND_ITEM_ID, name: '钻石', count: 10, balance: 100 } },
};

test('自动购买总开关与货币开关共同决定是否巡查、是否购买', () => {
    assert.equal(isMysteryShopWatchEnabled({}), false, '全部关闭时不启动巡查');
    assert.equal(isMysteryShopWatchEnabled({ mystery_shop_auto_buy: true }), true);
    assert.equal(isMysteryShopWatchEnabled({ mystery_shop_arrival_notify: true }), true);
    // 购买通知是附属开关，单独开启不会启动巡查（依赖自动购买 / 到货提醒）。
    assert.equal(isMysteryShopWatchEnabled({ mystery_shop_purchase_notify: true }), false);

    const off = decideMysteryShopTick(diamondOffer, { mystery_shop_allow_diamond: true });
    assert.equal(off.shouldBuy, false);
    assert.equal(off.skipBuyReason, 'auto_buy_off');

    const currencyOff = decideMysteryShopTick(diamondOffer, { mystery_shop_auto_buy: true });
    assert.equal(currencyOff.shouldBuy, false);
    assert.equal(currencyOff.skipBuyReason, 'currency_not_allowed');

    assert.equal(isCurrencyAllowed(DIAMOND_ITEM_ID, { mystery_shop_allow_diamond: true }), true, '钻石开关已接入判定');
    const on = decideMysteryShopTick(diamondOffer, { mystery_shop_auto_buy: true, mystery_shop_allow_diamond: true });
    assert.equal(on.shouldBuy, true, '总开关 + 钻石开关同时开启才会买钻石货品');

    const poor = decideMysteryShopTick({
        ...diamondOffer,
        npc: { ...diamondOffer.npc, price: { ...diamondOffer.npc.price, balance: 1 } },
    }, { mystery_shop_auto_buy: true, mystery_shop_allow_diamond: true });
    assert.equal(poor.shouldBuy, false);
    assert.equal(poor.skipBuyReason, 'insufficient');
});

test('开关从 UI 到 worker 的完整链路都有消费点', () => {
    const sharedState = read('src/models/store/shared-state.ts');
    const autoSrc = read('src/services/mystery-shop-auto.ts');
    const workerSrc = read('src/core/worker.ts');
    const settings = read('../web/src/components/settings/AccountFeatureSettings.vue');

    for (const key of [
        'mystery_shop_auto_buy',
        'mystery_shop_allow_gold',
        'mystery_shop_allow_coupon',
        'mystery_shop_allow_gold_bean',
        'mystery_shop_allow_diamond',
        'mystery_shop_arrival_notify',
        'mystery_shop_purchase_notify',
    ]) {
        assert.match(sharedState, new RegExp(`${key}:`), `${key} 在默认配置中，自动进入 ALLOWED_AUTOMATION_KEYS 白名单`);
    }
    assert.match(sharedState, /ALLOWED_AUTOMATION_KEYS.*Object\.keys\(DEFAULT_ACCOUNT_CONFIG\.automation\)/);
    assert.match(autoSrc, /\[DIAMOND_ITEM_ID\]: 'mystery_shop_allow_diamond'/);
    assert.match(autoSrc, /isCurrencyAllowed\(npc\.price\?\.id, automation\)/);
    assert.match(workerSrc, /startMysteryShopTimer\(\)/, '登录启动巡查定时器');
    assert.match(workerSrc, /mystery_shop_after_save/, '改开关后立即重查一次');
    assert.match(settings, /mystery_shop_allow_diamond/, '功能模块有钻石开关入口');
});
