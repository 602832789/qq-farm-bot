const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

function harness() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-mystery-history-'));
    const mock = (name, exports) => {
        const id = require.resolve(name);
        require.cache[id] = { id, filename: id, loaded: true, exports };
    };
    mock('../dist/config/runtime-paths', { getDataFile: name => path.join(dataDir, name) });
    const serviceId = require.resolve('../dist/services/mystery-shop-history');
    delete require.cache[serviceId];
    const service = require(serviceId);
    return {
        service,
        cleanup: () => {
            delete require.cache[serviceId];
            fs.rmSync(dataDir, { recursive: true, force: true });
        },
    };
}

const offer = {
    npcId: 7, itemId: 42, itemName: '测试商品', itemImage: '/item.png', itemCount: 2,
    currencyId: 1001, currencyName: '金币', price: 88, originalPrice: 100, discount: 80,
};

test('神秘商人购买记录按账号隔离、最新在前并标记手动/自动来源', () => {
    const h = harness();
    try {
        h.service.appendMysteryShopHistory('account-a', offer, { reward: { itemId: 42, count: 2 } }, 'auto');
        h.service.appendMysteryShopHistory('account-a', { ...offer, npcId: 8 }, { reward: { itemId: 42, count: 3 } }, 'manual');
        const records = h.service.getMysteryShopHistory('account-a');
        assert.equal(records.length, 2);
        assert.equal(records[0].npcId, 8, '最新记录排在最前');
        assert.equal(records[0].source, 'manual');
        assert.equal(records[0].itemCount, 3, '数量优先取购买回包');
        assert.equal(records[0].itemName, '测试商品');
        assert.equal(records[0].itemImage, '/item.png');
        assert.equal(records[0].currencyId, 1001);
        assert.equal(records[0].price, 88);
        assert.equal(records[0].discount, 80);
        assert.equal(records[1].source, 'auto');
        assert.deepEqual(h.service.getMysteryShopHistory('account-b'), [], '不同账号互相隔离');
    } finally {
        h.cleanup();
    }
});

test('购买记录最多保留 100 条', () => {
    const h = harness();
    try {
        for (let i = 1; i <= 105; i++) {
            h.service.appendMysteryShopHistory('account-a', { ...offer, npcId: i }, { reward: { itemId: 42, count: 1 } }, 'auto');
        }
        const records = h.service.getMysteryShopHistory('account-a');
        assert.equal(records.length, 100);
        assert.equal(records[0].npcId, 105);
        assert.equal(records[99].npcId, 6);
    } finally {
        h.cleanup();
    }
});

test('记录文件损坏或不存在时读取返回空数组', () => {
    const h = harness();
    try {
        const file = require.resolve('../dist/config/runtime-paths');
        assert.ok(file);
        const { getDataFile } = require('../dist/config/runtime-paths');
        fs.mkdirSync(getDataFile('mystery_shop_history'), { recursive: true });
        fs.writeFileSync(path.join(getDataFile('mystery_shop_history'), 'broken.json'), '{ not json');
        assert.deepEqual(h.service.getMysteryShopHistory('broken'), []);
        assert.deepEqual(h.service.getMysteryShopHistory('missing'), []);
    } finally {
        h.cleanup();
    }
});

test('手动与自动购买共用同一条记录写入链路（老版 /api/shop/mystery/history 口径）', () => {
    const commerce = read('src/services/commerce.ts');
    const auto = read('src/services/mystery-shop-auto.ts');
    const worker = read('src/core/worker.ts');
    const routes = read('src/controllers/admin/commerce-routes.ts');
    const provider = read('src/runtime/data-provider.ts');

    assert.match(commerce, /appendMysteryShopHistory\(accountId,/, '购买成功后落记录');
    assert.match(commerce, /purchaseMysteryOffer\(npcIdInput: unknown, source: string = 'manual'\)/, '来源由调用方指定');
    assert.match(auto, /purchaseMysteryOffer\(npcId, 'auto'\)/, '自动巡查标记为 auto');
    assert.match(worker, /purchaseMysteryOffer\(args\[0\], 'manual'\)/, '后台 API 固定为手动购买');
    assert.match(routes, /app\.get\('\/api\/mystery-shop\/history'/, '读取记录的路由存在');
    assert.match(provider, /getMysteryShopHistory: \(accountRef: string\)/, 'provider 暴露记录读取');
});
