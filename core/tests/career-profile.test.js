const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function read(rel) {
    return readFileSync(path.join(__dirname, rel), 'utf8');
}

const career = read('../src/services/career.ts');
const careerRoutes = read('../src/controllers/admin/career-routes.ts');
const adminIndex = read('../src/controllers/admin/index.ts');
const provider = read('../src/runtime/data-provider.ts');
const worker = read('../src/core/worker.ts');
const proto = read('../src/proto/careerpb.proto');

// vm 里创建的对象属于另一个 realm，先 JSON 往返再与本地对象做严格比较。
const plain = value => JSON.parse(JSON.stringify(value));

/** 转译 TS 并注入依赖桩，真实执行 buildCareerProfile 纯函数。 */
function loadCareerModule() {
    const ts = require('typescript');
    const js = ts.transpileModule(career, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const stubs = {
        '../utils/network': { sendMsgAsync: async () => ({ body: Buffer.alloc(0) }) },
        '../utils/proto': { types: {} },
        '../utils/utils': { toLong: v => v, toNum: v => Number(v) || 0, logWarn: () => {} },
        '../config/gameConfig': {
            getItemById: id => (id === 2001 ? { name: '草莓' } : undefined),
            getPlantByFruitId: id => (id === 2002 ? { name: '番茄' } : undefined),
            getItemImageById: id => `/game-config/seed_images_named/seed_images/${id}.png`,
        },
    };
    const mod = { exports: {} };
    vm.runInNewContext(js, {
        module: mod,
        exports: mod.exports,
        require: id => stubs[id] || {},
        Buffer,
        Uint8Array,
        console,
    });
    return mod.exports;
}

test('career 服务在保留简版接口的同时导出个人页完整结构', () => {
    assert.match(career, /export function buildCareerProfile\(/);
    assert.match(career, /async function getCareerProfile\(/);
    assert.match(career, /module\.exports = \{ getCareerInfo, getCareerInfoOrNull, getCareerProfile, buildCareerProfile \}/);
    assert.match(career, /types\.CareerInfoGetRequest\.encode/);
    assert.match(career, /types\.CareerInfoGetReply\.toObject/);
    assert.match(career, /getItemById\(fruitId\)/);
    assert.match(career, /getItemImageById\(fruitId\)/);
    assert.match(career, /getPlantByFruitId\(fruitId\)/);
    // 简版接口仍供偷菜过滤 / 土地详情使用
    assert.match(career, /async function getCareerInfo\(gid: number\): Promise<CareerInfo>/);
    assert.match(career, /async function getCareerInfoOrNull\(/);
});

test('buildCareerProfile 把协议回包映射成老版本 /api/career 的字段', () => {
    const { buildCareerProfile } = loadCareerModule();
    const profile = buildCareerProfile({
        harvest_items: [
            { fruit_id: 2001, harvest_count: 120 },
            { fruit_id: 2002, harvest_count: 30 },
            { fruit_id: 9999, harvest_count: 0 },
        ],
        total_harvest_count: 12345,
        total_steal_count: 678,
        name: '农场主阿花',
        avatar_url: 'https://example.com/avatar.png',
        level: 13,
        exp: 8888,
        gid: 10001,
        platform: 2,
        open_id: 'open-1',
    }, 10001);

    assert.equal(profile.totalHarvestCount, 12345);
    assert.equal(profile.totalStealCount, 678);
    assert.equal(profile.name, '农场主阿花');
    assert.equal(profile.avatar, 'https://example.com/avatar.png');
    assert.equal(profile.level, 13);
    assert.equal(profile.exp, 8888);
    assert.equal(profile.gid, 10001);
    assert.equal(profile.platform, 2);
    assert.equal(profile.openId, 'open-1');
    assert.equal(profile.items.length, 3);
    assert.deepStrictEqual(plain(profile.items[0]), {
        seedId: 2001,
        fruitId: 2001,
        name: '草莓',
        image: '/game-config/seed_images_named/seed_images/2001.png',
        harvestCount: 120,
    });
    assert.equal(profile.items[1].name, '番茄', '找不到道具配置时回退作物表');
    assert.equal(profile.items[2].name, '果实9999', '都查不到时用果实 ID 兜底');
});

test('buildCareerProfile 兼容驼峰回包与空回包', () => {
    const { buildCareerProfile } = loadCareerModule();
    const camel = buildCareerProfile({
        harvestItems: [{ fruitId: 2001, harvestCount: 5 }],
        totalHarvestCount: 5,
        totalStealCount: 2,
        avatarUrl: 'u',
        openId: 'o',
    }, 777);
    assert.equal(camel.items[0].harvestCount, 5);
    assert.equal(camel.totalStealCount, 2);
    assert.equal(camel.avatar, 'u');
    assert.equal(camel.openId, 'o');
    assert.equal(camel.gid, 777, '回包缺 gid 时用请求时的 GID 兜底');

    const empty = buildCareerProfile(null, 0);
    assert.deepStrictEqual(plain(empty.items), []);
    assert.equal(empty.totalHarvestCount, 0);
    assert.equal(empty.totalStealCount, 0);
    assert.equal(empty.gid, 0);
});

test('proto 定义了个人页需要的全部字段', () => {
    for (const field of ['harvest_items', 'total_harvest_count', 'total_steal_count', 'avatar_url', 'level', 'exp', 'gid', 'platform', 'open_id'])
        assert.match(proto, new RegExp(field), `缺少字段 ${field}`);
    assert.match(proto, /repeated CareerHarvestItem harvest_items = 1/);
});

test('GET /api/career 按账号分发并在 SPA fallback 之前挂载', () => {
    assert.match(careerRoutes, /app\.get\('\/api\/career'/);
    assert.match(careerRoutes, /getAccId\(ctx, req\)/);
    assert.match(careerRoutes, /ctx\.provider\.getCareerProfile\(id\)/);
    assert.match(careerRoutes, /handleApiError\(res, e\)/);
    assert.match(careerRoutes, /res\.json\(\{ ok: true, data \}\)/);
    assert.match(adminIndex, /const \{ mountCareerRoutes \} = require\('\.\/career-routes'\)/);
    assert.match(adminIndex, /mountCareerRoutes\(app, ctx\)/);
    assert.ok(
        adminIndex.indexOf('mountCareerRoutes(app, ctx)') < adminIndex.indexOf("app.get('*'"),
        '生涯路由必须注册在 SPA fallback 之前',
    );
    assert.match(provider, /getCareerProfile: \(accountRef: string\) => callWorkerApi\(resolveAccountRefId\(accountRef\), 'getCareerProfile'\)/);
    assert.match(worker, /case 'getCareerProfile':/);
    assert.match(worker, /getCareerProfile\(getUserState\(\)\.gid\)/);
});
