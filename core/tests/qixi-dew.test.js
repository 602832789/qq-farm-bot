const assert = require('node:assert/strict');
const test = require('node:test');

function loadedModule(filename, exports) {
    return { id: filename, filename, loaded: true, exports };
}

test('鹊羽灵露在好友访问会话内定向使用，并保留服务器最终资格校验', async () => {
    const dewPath = require.resolve('../dist/services/qixi-dew');
    const configPath = require.resolve('../dist/config/config');
    const gameConfigPath = require.resolve('../dist/config/gameConfig');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const utilsPath = require.resolve('../dist/utils/utils');
    const farmApiPath = require.resolve('../dist/services/farm/api');
    const landAnalysisPath = require.resolve('../dist/services/farm/land-analysis');
    const friendApiPath = require.resolve('../dist/services/friend/api');
    const warehousePath = require.resolve('../dist/services/warehouse');
    const activityPath = require.resolve('../dist/services/activity-center');
    const mockedPaths = [
        configPath,
        gameConfigPath,
        networkPath,
        protoPath,
        utilsPath,
        farmApiPath,
        landAnalysisPath,
        friendApiPath,
        warehousePath,
        activityPath,
    ];
    const previous = new Map(mockedPaths.map(path => [path, require.cache[path]]));
    const calls = [];
    let encodedRequest = null;
    const encodedRequests = [];
    let rejectedLandId = '';
    class MockGatewayError extends Error {
        constructor(code, errorMessage) {
            super(`code=${code} ${errorMessage}`);
            this.code = code;
            this.errorMessage = errorMessage;
        }
    }
    const plantedLands = [1, 2, 3].map(id => ({
        id,
        unlocked: true,
        plant: { id: 9000 + id, name: `测试作物${id}`, phases: [{ phase: 2 }] },
    }));

    require.cache[configPath] = loadedModule(configPath, {
        PHASE_NAMES: { 2: '发芽', 6: '成熟', 7: '枯死' },
        PlantPhase: { UNKNOWN: 0, SEED: 1, MATURE: 6, DEAD: 7 },
    });
    require.cache[gameConfigPath] = loadedModule(gameConfigPath, {
        getItemById: id => ({ id, name: id === 301103 ? '鹊羽灵露' : `物品${id}` }),
        getItemImageById: id => `/item/${id}.png`,
        getPlantById: () => ({ seed_id: 5001 }),
        getPlantName: () => '测试作物',
        getSeedImageBySeedId: id => `/seed/${id}.png`,
    });
    require.cache[networkPath] = loadedModule(networkPath, {
        getUserState: () => ({ gid: 100, name: '自己' }),
        GatewayError: MockGatewayError,
        sendMsgAsync: async () => {
            calls.push('Use');
            const landId = String(encodedRequest?.target?.land_ids?.[0] || '');
            if (landId && landId === rejectedLandId)
                throw new MockGatewayError(1001065, '地块不符合使用条件');
            return { body: Buffer.alloc(0) };
        },
    });
    require.cache[protoPath] = loadedModule(protoPath, {
        types: {
            UseRequest: {
                create: value => value,
                encode: (value) => {
                    encodedRequest = value;
                    encodedRequests.push(value);
                    return { finish: () => Buffer.alloc(0) };
                },
            },
            UseReply: {
                decode: () => ({
                    used_items: [{ id: 301103, count: 1, uid: 77 }],
                    land: { id: 3 },
                    land_reward: {
                        land_id: 3,
                        items: [{ id: 1024, count: 1 }],
                    },
                }),
            },
        },
    });
    require.cache[utilsPath] = loadedModule(utilsPath, {
        toNum: value => Number(value?.toString?.() ?? value) || 0,
    });
    require.cache[farmApiPath] = loadedModule(farmApiPath, {
        getAllLands: async () => ({ lands: plantedLands }),
    });
    require.cache[landAnalysisPath] = loadedModule(landAnalysisPath, {
        buildLandMap: lands => new Map(lands.map(land => [Number(land.id), land])),
        getCurrentPhase: phases => phases[0] || null,
        getDisplayLandContext: land => ({
            sourceLand: land,
            occupiedByMaster: false,
            masterLandId: Number(land.id),
            occupiedLandIds: [Number(land.id)],
        }),
    });
    require.cache[friendApiPath] = loadedModule(friendApiPath, {
        enterFriendFarm: async (gid) => {
            calls.push('Enter');
            return { basic: { gid, name: '好友甲' }, lands: plantedLands };
        },
        leaveFriendFarm: async () => calls.push('Leave'),
    });
    require.cache[warehousePath] = loadedModule(warehousePath, {
        getBag: async () => {
            calls.push('Bag');
            return { item_bag: { items: [{ id: 301103, count: 5, uid: 77 }] } };
        },
        getBagItems: reply => reply?.item_bag?.items || [],
    });
    require.cache[activityPath] = loadedModule(activityPath, {
        getCurrentQixiActivity: async () => {
            calls.push('Activity');
            return { active: true };
        },
        getActivityCenterSnapshot: async () => {
            calls.push('Snapshot');
            return { qixi: {} };
        },
    });

    delete require.cache[dewPath];
    try {
        const dew = require('../dist/services/qixi-dew');
        const result = await dew.useQixiDew('200', '3');

        assert.deepEqual(calls, ['Activity', 'Bag', 'Enter', 'Use', 'Leave', 'Snapshot']);
        assert.equal(encodedRequest.item.id, 301103);
        assert.equal(encodedRequest.item.count, 1);
        assert.equal(encodedRequest.item.uid, 77);
        assert.deepEqual(encodedRequest.target, {
            host_gid: '200',
            land_ids: ['3'],
            use_config_id: 0,
        });
        assert.equal(result.target.plantName, '测试作物');
        assert.equal(result.updatedLand.id, 3);
        assert.equal(result.rewardLandId, '3');
        assert.equal(result.rewards[0].id, '1024');

        calls.length = 0;
        encodedRequests.length = 0;
        rejectedLandId = '2';
        const batch = await dew.useQixiDewBatch('200', ['3', '1', '2', '2']);

        assert.deepEqual(calls, ['Activity', 'Bag', 'Enter', 'Use', 'Use', 'Use', 'Leave', 'Snapshot']);
        assert.deepEqual(encodedRequests.map(request => request.target.land_ids[0]), ['1', '2', '3']);
        assert.deepEqual(batch.requestedLandIds, ['1', '2', '3']);
        assert.deepEqual(batch.usedLandIds, ['1', '3']);
        assert.deepEqual(batch.failedLandIds, ['2']);
        assert.equal(batch.successCount, 2);
        assert.equal(batch.failureCount, 1);
        assert.match(batch.results[1].message, /品级不足|状态已变化/);
    } finally {
        delete require.cache[dewPath];
        for (const path of mockedPaths) {
            const cached = previous.get(path);
            if (cached) require.cache[path] = cached;
            else delete require.cache[path];
        }
    }
});
