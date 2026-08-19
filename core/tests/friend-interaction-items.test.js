const assert = require('node:assert/strict');
const test = require('node:test');

function loadedModule(filename, exports) {
    return { id: filename, filename, loaded: true, exports };
}

function installMocks(options = {}) {
    const servicePath = require.resolve('../dist/services/friend-interaction-items');
    const configPath = require.resolve('../dist/config/config');
    const gameConfigPath = require.resolve('../dist/config/gameConfig');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const utilsPath = require.resolve('../dist/utils/utils');
    const activityWindowsPath = require.resolve('../dist/services/activity-windows');
    const landAnalysisPath = require.resolve('../dist/services/farm/land-analysis');
    const friendApiPath = require.resolve('../dist/services/friend/api');
    const warehousePath = require.resolve('../dist/services/warehouse');
    const mockedPaths = [
        configPath,
        gameConfigPath,
        networkPath,
        protoPath,
        utilsPath,
        activityWindowsPath,
        landAnalysisPath,
        friendApiPath,
        warehousePath,
    ];
    const previous = new Map(mockedPaths.map(path => [path, require.cache[path]]));
    const calls = [];
    const encodedUseRequests = [];

    class MockGatewayError extends Error {
        constructor(code, errorMessage) {
            super(`code=${code} ${errorMessage}`);
            this.code = code;
            this.errorMessage = errorMessage;
        }
    }

    const metadata = new Map((options.metadata || []).map(item => [Number(item.id), item]));
    const bagItems = options.bagItems || [];
    const lands = options.lands || [
        { id: 1, unlocked: true, plant: { id: 9001, phases: [{ phase: 2 }] } },
        { id: 2, unlocked: true, plant: { id: 9002, phases: [{ phase: 2 }] } },
        { id: 3, unlocked: true, plant: { id: 9003, phases: [{ phase: 2 }] } },
    ];

    require.cache[configPath] = loadedModule(configPath, {
        PlantPhase: { DEAD: 7 },
    });
    require.cache[gameConfigPath] = loadedModule(gameConfigPath, {
        getItemById: id => metadata.get(Number(id)),
        getItemImageById: id => `/item/${id}.png`,
    });
    require.cache[networkPath] = loadedModule(networkPath, {
        GatewayError: MockGatewayError,
        sendMsgAsync: async (serviceName, methodName) => {
            calls.push(`ItemUse:${serviceName}.${methodName}`);
            const request = encodedUseRequests.at(-1);
            if (typeof options.onItemUse === 'function') await options.onItemUse(request, MockGatewayError);
            return { body: Buffer.alloc(0) };
        },
    });
    require.cache[protoPath] = loadedModule(protoPath, {
        types: {
            UseRequest: {
                create: value => value,
                encode: (value) => {
                    encodedUseRequests.push(value);
                    return { finish: () => Buffer.alloc(0) };
                },
            },
            UseReply: {
                decode: () => typeof options.useReply === 'function'
                    ? options.useReply(encodedUseRequests.at(-1))
                    : (options.useReply || { used_items: [], items: [] }),
            },
        },
    });
    require.cache[utilsPath] = loadedModule(utilsPath, {
        toNum: value => Number(value?.toString?.() ?? value) || 0,
    });
    require.cache[activityWindowsPath] = loadedModule(activityWindowsPath, {
        getSellConditionContext: async () => options.sellContext || {
            nowSec: 200,
            activityWindows: new Map(),
            activityWindowsLoaded: true,
        },
    });
    require.cache[landAnalysisPath] = loadedModule(landAnalysisPath, {
        buildLandMap: values => new Map(values.map(land => [Number(land.id), land])),
        getCurrentPhase: phases => phases[0] || null,
        getDisplayLandContext: land => ({
            sourceLand: land,
            occupiedByMaster: false,
            occupiedLandIds: [Number(land.id)],
        }),
        getPlantInteractionEffects: (plant) => {
            const uses = Array.isArray(plant?.interaction_uses) ? plant.interaction_uses : [];
            const targets = Array.isArray(plant?.interaction_targets) ? plant.interaction_targets : [];
            return uses.map(use => {
                const target = targets.find(value => Number(value.item_id) === Number(use.item_id)) || {};
                return {
                    itemId: String(use.item_id),
                    itemName: Number(use.item_id) === 301101 ? '黄金虫' : `道具${use.item_id}`,
                    effectType: Number(use.effect_type) || 0,
                    landId: String(target.land_id || ''),
                    usedAt: String(use.timestamp || ''),
                    confirmed: true,
                    source: 'protocol-land',
                };
            });
        },
        buildLandDetail: land => ({
            id: Number(land.id),
            unlocked: !!land.unlocked,
            status: 'growing',
            plantName: land?.plant?.name || '',
            occupiedLandIds: [Number(land.id)],
            mutantConfigIds: [],
            isMutated: false,
            interactionEffects: [],
        }),
    });
    require.cache[friendApiPath] = loadedModule(friendApiPath, {
        enterFriendFarm: async (gid) => {
            calls.push('Enter');
            return { basic: { gid, name: '好友甲' }, lands };
        },
        leaveFriendFarm: async () => calls.push('Leave'),
    });
    require.cache[warehousePath] = loadedModule(warehousePath, {
        getBag: async () => ({ item_bag: { items: bagItems } }),
        getBagItems: reply => reply?.item_bag?.items || [],
    });

    delete require.cache[servicePath];
    const service = require('../dist/services/friend-interaction-items');
    return {
        service,
        calls,
        getEncodedUseRequests: () => encodedUseRequests,
        restore() {
            delete require.cache[servicePath];
            for (const path of mockedPaths) {
                const cached = previous.get(path);
                if (cached) require.cache[path] = cached;
                else delete require.cache[path];
            }
        },
    };
}

const specialItem = (id, name, extra = {}) => ({
    id,
    type: 23,
    name,
    interaction_type: 'additemuseItem',
    can_use: 1,
    desc: '可在好友农场的作物上使用。',
    ...extra,
});

test('特殊互动库存保留满足出售条件的道具，并单独标记供使用前提示', { concurrency: false }, async () => {
    const mock = installMocks({
        metadata: [
            specialItem(301101, '黄金虫'),
            specialItem(301102, '足球', { activity_id: 2026071501 }),
            specialItem(301103, '鹊羽灵露', { sell_cond: '活动结束后:2026081801' }),
            specialItem(5003, '闪电变异瓶', { desc: '使自己的未成熟作物发生变异。' }),
            specialItem(5004, '霹雳引雷瓶', { sell_cond: '道具过期后:expire_time' }),
        ],
        bagItems: [
            { id: 301101, count: 2, uid: 11 },
            { id: 301102, count: 3, uid: 12 },
            { id: 301103, count: 4, uid: 13 },
            { id: 5003, count: 5, uid: 14 },
            { id: 5004, count: 6, uid: 15, expire_time: 150 },
        ],
        sellContext: {
            nowSec: 200,
            activityWindows: new Map([
                ['2026081801', { id: '2026081801', beginTime: 50, endTime: 100 }],
            ]),
            activityWindowsLoaded: true,
        },
    });

    try {
        const result = await mock.service.getFriendInteractionItems();
        assert.deepEqual(result.items.map(item => item.itemId), ['5004', '301103', '301102', '301101']);
        assert.equal(result.items.find(item => item.itemId === '5004').count, 6);
        assert.equal(result.items.find(item => item.itemId === '5004').saleConditionSatisfiedCount, 6);
        assert.equal(result.items.find(item => item.itemId === '301103').count, 4);
        assert.equal(result.items.find(item => item.itemId === '301103').saleConditionSatisfiedCount, 4);
        assert.equal(result.items.find(item => item.itemId === '301102').count, 3);
        assert.equal(result.items.find(item => item.itemId === '301102').activityId, '2026071501');
        assert.equal(result.items.find(item => item.itemId === '301101').saleConditionSatisfiedCount, 0);
        assert.equal(result.items.find(item => item.itemId === '301101').protocol, 'item-use');
    } finally {
        mock.restore();
    }
});

test('黄金虫在一次好友会话内按地块编号顺序使用，服务端单块拒绝后继续', { concurrency: false }, async () => {
    const mock = installMocks({
        metadata: [specialItem(301101, '黄金虫')],
        bagItems: [{ id: 301101, count: 3, uid: 11 }],
        useReply: request => ({
            used_items: [{ id: 301101, count: 1 }],
            land: {
                id: Number(request.target.land_ids[0]),
                unlocked: true,
                plant: {
                    id: 9001,
                    name: '测试作物',
                    phases: [{ phase: 2 }],
                    interaction_uses: [{
                        item_id: 301101,
                        count: 1,
                        effect_type: 2,
                        host_gid: 999,
                        timestamp: 123,
                    }],
                    interaction_targets: [{
                        item_id: 301101,
                        host_gid: 999,
                        timestamp: 123,
                        land_id: Number(request.target.land_ids[0]),
                    }],
                },
            },
        }),
        onItemUse: (request, MockGatewayError) => {
            if (Number(request.target.land_ids[0]) === 2) {
                throw new MockGatewayError(1003008, '达到使用限制');
            }
        },
    });

    try {
        const result = await mock.service.useFriendInteractionItemBatch('200', '301101', ['3', '1', '2', '2']);
        assert.deepEqual(mock.calls.filter(call => call === 'Enter' || call === 'Leave' || call.startsWith('ItemUse:')), [
            'Enter',
            'ItemUse:gamepb.itempb.ItemService.Use',
            'ItemUse:gamepb.itempb.ItemService.Use',
            'ItemUse:gamepb.itempb.ItemService.Use',
            'Leave',
        ]);
        assert.deepEqual(mock.getEncodedUseRequests().map(request => request.target.land_ids), [['1'], ['2'], ['3']]);
        assert.equal(result.protocol, 'item-use');
        assert.deepEqual(result.requestedLandIds, ['1', '2', '3']);
        assert.deepEqual(result.usedLandIds, ['1', '3']);
        assert.deepEqual(result.failedLandIds, ['2']);
        assert.match(result.results[1].message, /达到.*使用限制/);
        assert.deepEqual(result.updatedLands.map(land => land.id), [1, 3]);
        assert.deepEqual(result.interactionEffects.map(effect => effect.landId), ['1', '3']);
        assert.equal(result.results[0].interactionEffects[0].effectType, 2);
        assert.equal(result.results[0].interactionEffects[0].source, 'protocol-land');
    } finally {
        mock.restore();
    }
});

test('灵露在售卖条件已满足时仍提交 ItemService.Use，由服务端判断是否可用', { concurrency: false }, async () => {
    const mock = installMocks({
        metadata: [specialItem(301103, '鹊羽灵露', { sell_cond: '活动结束后:2026081801' })],
        bagItems: [{ id: 301103, count: 1, uid: 77 }],
        useReply: request => ({
            used_items: [{ id: 301103, count: 1 }],
            land: {
                id: Number(request.target.land_ids[0]),
                unlocked: true,
                plant: {
                    id: 9003,
                    name: '活动作物',
                    phases: [{ phase: 2 }],
                    interaction_uses: [{ item_id: 301102, effect_type: 3, timestamp: 100 }],
                    interaction_targets: [{ item_id: 301102, land_id: 3, timestamp: 100 }],
                },
            },
        }),
        sellContext: {
            nowSec: 200,
            activityWindows: new Map([
                ['2026081801', { id: '2026081801', beginTime: 50, endTime: 100 }],
            ]),
            activityWindowsLoaded: true,
        },
    });

    try {
        const inventory = await mock.service.getFriendInteractionItems();
        assert.equal(inventory.items[0].count, 1);
        assert.equal(inventory.items[0].saleConditionSatisfiedCount, 1);

        const result = await mock.service.useFriendInteractionItemBatch('200', '301103', ['3']);
        const [request] = mock.getEncodedUseRequests();
        assert.equal(result.protocol, 'item-use');
        assert.equal(request.item.id, 301103);
        assert.equal(request.item.uid, 77);
        assert.deepEqual(request.target, {
            host_gid: '200',
            land_ids: ['3'],
            use_config_id: 0,
        });
        assert.equal(mock.calls.some(call => call.startsWith('PlantSocial:')), false);
        assert.equal(mock.calls.filter(call => call === 'Enter').length, 1);
        assert.equal(mock.calls.filter(call => call === 'Leave').length, 1);
        assert.equal(result.updatedLands[0].id, 3);
        assert.deepEqual(result.interactionEffects[0], {
            landId: '3',
            itemId: '301103',
            itemName: '鹊羽灵露',
            plantId: '9003',
            effectType: 0,
            confirmed: true,
            source: 'use-reply',
        });
    } finally {
        mock.restore();
    }
});
