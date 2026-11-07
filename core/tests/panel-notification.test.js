const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

function harness() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-panel-notification-'));
    const mock = (name, exports) => {
        const id = require.resolve(name);
        require.cache[id] = { id, filename: id, loaded: true, exports };
    };
    mock('../dist/config/runtime-paths', { getDataFile: name => path.join(dataDir, name) });
    const serviceId = require.resolve('../dist/services/panel-notification');
    delete require.cache[serviceId];
    const service = require(serviceId);
    return {
        service,
        dataDir,
        cleanup: () => {
            delete require.cache[serviceId];
            delete require.cache[require.resolve('../dist/config/runtime-paths')];
            fs.rmSync(dataDir, { recursive: true, force: true });
        },
    };
}

const entry = (key, title = '神秘商人到货') => ({
    dedupeKey: key,
    type: 'mystery_arrival',
    title,
    content: '测试商品 x1\n价格 100 金币',
});

test('面板消息按账号隔离、最新在前、字段完整', () => {
    const h = harness();
    try {
        assert.deepEqual(h.service.getPanelNotifications('missing'), [], '无文件时为空数组');
        const first = h.service.appendPanelNotification('account-a', entry('arrival:1'));
        h.service.appendPanelNotification('account-a', entry('arrival:2', '神秘商人已自动购买'));
        const records = h.service.getPanelNotifications('account-a');
        assert.equal(records.length, 2);
        assert.equal(records[0].title, '神秘商人已自动购买', '最新排在最前');
        assert.equal(records[0].type, 'mystery_arrival');
        assert.match(records[0].content, /价格 100 金币/);
        assert.ok(records[0].id && records[0].createdAt > 0);
        assert.equal(first.dedupeKey, 'arrival:1');
        assert.deepEqual(h.service.getPanelNotifications('account-b'), [], '不同账号互相隔离');
    } finally {
        h.cleanup();
    }
});

test('同一 dedupeKey 只记一次，避免每轮巡查反复刷同一条到货消息', () => {
    const h = harness();
    try {
        assert.ok(h.service.appendPanelNotification('account-a', entry('arrival:7')));
        assert.equal(h.service.appendPanelNotification('account-a', entry('arrival:7')), null);
        assert.equal(h.service.getPanelNotifications('account-a').length, 1);
        assert.ok(h.service.appendPanelNotification('account-a', entry('purchase:7')), '购买事件与到货事件各记一条');
        assert.ok(h.service.appendPanelNotification('account-a', entry('arrival:8')), '换一批货可以再记一条');
        assert.equal(h.service.getPanelNotifications('account-a').length, 3);
    } finally {
        h.cleanup();
    }
});

test('面板消息最多保留 100 条，空内容不写入', () => {
    const h = harness();
    try {
        for (let i = 1; i <= 105; i++) h.service.appendPanelNotification('account-a', entry(`arrival:${i}`));
        const records = h.service.getPanelNotifications('account-a');
        assert.equal(records.length, 100);
        assert.equal(records[0].dedupeKey, 'arrival:105');
        assert.equal(records[99].dedupeKey, 'arrival:6');
        assert.equal(h.service.appendPanelNotification('account-a', { ...entry('empty'), title: '' }), null);
        assert.equal(h.service.appendPanelNotification('account-a', { ...entry('empty2'), content: '  ' }), null);
    } finally {
        h.cleanup();
    }
});

test('损坏文件降级为空数组，不抛异常', () => {
    const h = harness();
    try {
        const dir = path.join(h.dataDir, 'panel_notifications');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
        assert.deepEqual(h.service.getPanelNotifications('broken'), []);
        assert.ok(h.service.appendPanelNotification('broken', entry('arrival:1')), '损坏后可恢复写入');
    } finally {
        h.cleanup();
    }
});

test('站内消息从事件生成到前端读取的完整链路', () => {
    const auto = read('src/services/mystery-shop-auto.ts');
    const worker = read('src/core/worker.ts');
    const routes = read('src/controllers/admin/panel-notification-routes.ts');
    const index = read('src/controllers/admin/index.ts');
    const provider = read('src/runtime/data-provider.ts');
    const store = read('../web/src/stores/panel-notifications.ts');

    assert.match(auto, /buildMysteryShopPush\(shop, \{ arrival: !bought, purchase: bought \}\)/, '事件与提醒开关解耦生成');
    assert.match(auto, /type: bought \? 'mystery_purchase' : 'mystery_arrival'/);
    assert.match(worker, /appendPanelNotification\(/, 'worker 把事件写进本地消息');
    assert.match(worker, /sendToMaster\(\{ type: 'push_notify'/, '外部推送仍独立发送');
    assert.match(routes, /app\.get\('\/api\/panel-notifications'/);
    assert.match(index, /mountPanelNotificationRoutes\(app, ctx\)/, '路由已注册');
    assert.match(provider, /getPanelNotifications: \(accountRef: string\)/);
    assert.match(store, /api\.get\('\/api\/panel-notifications'/);
});
