const assert = require('node:assert/strict');
const test = require('node:test');

function loadedModule(filename, exports) {
    return { id: filename, filename, loaded: true, exports };
}

test('activity snapshots are single-flight and serialize gateway reads', async () => {
    const activityPath = require.resolve('../dist/services/activity-center');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const warehousePath = require.resolve('../dist/services/warehouse');
    const windowsPath = require.resolve('../dist/services/activity-windows');
    const registryPath = require.resolve('../dist/services/activity-gameplay-registry');
    const sharePath = require.resolve('../dist/services/share');
    const statePath = require.resolve('../dist/services/activity-center-state');
    const gameConfigPath = require.resolve('../dist/config/gameConfig');
    const utilsPath = require.resolve('../dist/utils/utils');
    const mockedPaths = [
        networkPath,
        protoPath,
        warehousePath,
        windowsPath,
        registryPath,
        sharePath,
        statePath,
        gameConfigPath,
        utilsPath,
    ];
    const previous = new Map(mockedPaths.map(path => [path, require.cache[path]]));
    const calls = [];
    let active = 0;
    let maxActive = 0;

    const tracked = async (method, value) => {
        calls.push(method);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
        return value;
    };
    const messageType = decodeValue => ({
        create: value => value,
        encode: () => ({ finish: () => Buffer.alloc(0) }),
        decode: () => decodeValue,
    });
    const seasonReply = {
        season_info: {
            season_id: '1',
            name: Buffer.from('season'),
            status: 1,
            begin_time: 0,
            end_time: 0,
            server_time: 1,
            activities: [],
        },
    };
    const solarReply = { server_time: 1, terms: [], configs: [] };
    const qixiActivity = activityId => ({
        activity_id: activityId,
        name: Buffer.from('qixi'),
        begin_time: 0,
        end_time: 0,
        field_23: 0,
    });
    const groupReply = {
        group: {
            children: [
                { activity: qixiActivity('2026081801'), qixi_bridge: { stages: [], display_items: [] } },
                { activity: qixiActivity('2026081802'), qixi_gift: {} },
            ],
        },
    };
    const types = {
        GetSeasonInfoRequest: messageType(null),
        GetSeasonInfoReply: messageType(seasonReply),
        GetSolarTermsRequest: messageType(null),
        GetSolarTermsReply: messageType(solarReply),
        GetGroupRequest: messageType(null),
        GetGroupReply: messageType(groupReply),
    };

    require.cache[networkPath] = loadedModule(networkPath, {
        GatewayError: class GatewayError extends Error {},
        sendMsgAsync: async (_service, method) => tracked(method, { body: Buffer.alloc(0), meta: {} }),
    });
    require.cache[protoPath] = loadedModule(protoPath, { types });
    require.cache[warehousePath] = loadedModule(warehousePath, {
        getBag: () => tracked('Bag', { item_bag: { items: [] } }),
        getBagItems: reply => reply?.item_bag?.items || [],
    });
    require.cache[windowsPath] = loadedModule(windowsPath, {
        getActivityWindows: () => tracked('ActivityList', []),
    });
    require.cache[registryPath] = loadedModule(registryPath, {
        buildActivityGameplayBindings: () => ({}),
        resolveActivityGameplays: () => ({ gameplayKey: null, gameplayTargets: [] }),
    });
    require.cache[sharePath] = loadedModule(sharePath, { reportActivityShare: async () => ({}) });
    require.cache[statePath] = loadedModule(statePath, {
        mergeConstellationStates: () => null,
        stateRecordKey: () => '',
        loadConstellationState: () => null,
        persistConstellationState: () => {},
        stateFromDynamicNodes: () => null,
        stateWithNoClaimableDay: () => null,
    });
    require.cache[gameConfigPath] = loadedModule(gameConfigPath, {
        getItemById: () => null,
        getItemImageById: () => '',
    });
    require.cache[utilsPath] = loadedModule(utilsPath, { getServerTimeSec: () => 1 });

    delete require.cache[activityPath];
    try {
        const activity = require('../dist/services/activity-center');
        const first = activity.getActivityCenterSnapshot();
        const second = activity.getActivityCenterSnapshot();

        assert.equal(first, second);
        await Promise.all([first, second]);
        assert.equal(maxActive, 1);
        assert.deepEqual(calls, ['GetSeasonInfo', 'GetSolarTerms', 'ActivityList', 'GetGroup', 'Bag']);
    } finally {
        delete require.cache[activityPath];
        for (const path of mockedPaths) {
            const cached = previous.get(path);
            if (cached) require.cache[path] = cached;
            else delete require.cache[path];
        }
    }
});
