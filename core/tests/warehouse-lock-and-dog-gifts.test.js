const assert = require('node:assert/strict');
const test = require('node:test');

function loadedModule(filename, exports) {
    return { id: filename, filename, loaded: true, exports };
}

function installWarehouseMocks(options = {}) {
    const servicePath = require.resolve('../dist/services/warehouse');
    const gameConfigPath = require.resolve('../dist/config/gameConfig');
    const storePath = require.resolve('../dist/models/store');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const utilsPath = require.resolve('../dist/utils/utils');
    const activityWindowsPath = require.resolve('../dist/services/activity-windows');
    const statusPath = require.resolve('../dist/services/status');
    const mockedPaths = [
        gameConfigPath,
        storePath,
        networkPath,
        protoPath,
        utilsPath,
        activityWindowsPath,
        statusPath,
    ];
    const previous = new Map(mockedPaths.map(path => [path, require.cache[path]]));
    const calls = [];
    const payloads = [];
    const bagItems = options.bagItems || [];
    const metadata = new Map((options.metadata || []).map(item => [Number(item.id), item]));

    const messageType = (name, replyFactory = () => ({})) => ({
        create: value => value,
        encode: (value) => {
            payloads.push({ name, value });
            return { finish: () => Buffer.alloc(0) };
        },
        decode: () => replyFactory(),
    });

    require.cache[gameConfigPath] = loadedModule(gameConfigPath, {
        getFruitName: id => `果实${id}`,
        getPlantByFruitId: id => Number(id) === 60001 ? { id: 1 } : null,
        getPlantBySeedId: id => Number(id) === 26032 ? { id: 26032, name: '测试种子', size: 1 } : null,
        getItemById: id => metadata.get(Number(id)) || null,
        getItemImageById: id => `/item/${id}.png`,
        getSeedImageBySeedId: id => `/seed/${id}.png`,
        getEffectiveSellInfo: () => ({ sellable: true, status: 'available', condition: '', sells: [{ currencyId: 1001, price: 1 }] }),
    });
    require.cache[storePath] = loadedModule(storePath, { isAutomationOn: () => false });
    require.cache[networkPath] = loadedModule(networkPath, {
        networkEvents: { emit() {} },
        getUserState: () => ({ gold: 0, exp: 0 }),
        sendMsgAsync: async (service, method) => {
            calls.push(`${service}.${method}`);
            return { body: Buffer.alloc(0) };
        },
    });
    require.cache[protoPath] = loadedModule(protoPath, {
        types: {
            BagRequest: messageType('BagRequest'),
            BagReply: { decode: () => ({ item_bag: { items: bagItems } }) },
            LockItemsRequest: messageType('LockItemsRequest'),
            LockItemsReply: { decode: () => ({ item_uids: options.replyUids || [12853] }) },
            UnlockItemsRequest: messageType('UnlockItemsRequest'),
            UnlockItemsReply: { decode: () => ({ item_uids: options.replyUids || [12853] }) },
            SellRequest: messageType('SellRequest'),
            SellReply: { decode: () => ({ sell_items: [], get_items: [] }) },
            UseRequest: messageType('UseRequest'),
            UseReply: { decode: () => ({ used_items: [], items: [] }) },
            BatchUseRequest: messageType('BatchUseRequest'),
            BatchUseReply: { decode: () => ({ used_items: [], items: [] }) },
        },
    });
    require.cache[utilsPath] = loadedModule(utilsPath, {
        toLong: value => String(value),
        toNum: value => Number(value?.toString?.() ?? value) || 0,
        toTimeSec: value => Number(value?.toString?.() ?? value) || 0,
        log() {},
        logWarn() {},
        sleep: async () => {},
        getSystemDateKey: () => '2026-08-19',
    });
    require.cache[activityWindowsPath] = loadedModule(activityWindowsPath, {
        getSellConditionContext: async () => ({ nowSec: 0, activityWindows: new Map(), activityWindowsLoaded: true }),
    });
    require.cache[statusPath] = loadedModule(statusPath, { updateStatusGold() {} });

    delete require.cache[servicePath];
    const service = require('../dist/services/warehouse');
    return {
        service,
        calls,
        payloads,
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

test('warehouse only sends lock RPCs for captured lockable item types', { concurrency: false }, async () => {
    const bagItems = [
        { id: 26032, count: 26, uid: 12853, locked: false },
        { id: 101351, count: 10, uid: 999, locked: false },
    ];
    const mock = installWarehouseMocks({
        bagItems,
        metadata: [{ id: 26032, type: 5, name: '测试种子' }, { id: 101351, type: 11, name: '同气连枝礼包' }],
    });

    try {
        const locked = await mock.service.setItemsLocked([12853, 12853], true);
        assert.deepEqual(locked, { locked: true, changed: 1, itemUids: [12853] });
        assert.deepEqual(mock.payloads.find(item => item.name === 'LockItemsRequest').value.item_uids, ['12853']);
        assert.equal(mock.calls.at(-1), 'gamepb.itempb.ItemService.LockItems');

        await assert.rejects(
            () => mock.service.setItemsLocked([999], true),
            /同气连枝礼包不支持锁定/,
        );
        assert.equal(mock.calls.filter(call => call.endsWith('.LockItems')).length, 1);
    } finally {
        mock.restore();
    }
});

test('locked state is exposed in bag DTOs and locked seeds are excluded from planting inventory', { concurrency: false }, async () => {
    const mock = installWarehouseMocks({
        bagItems: [{ id: 26032, count: 26, uid: 12853, locked: true }],
        metadata: [{ id: 26032, type: 5, name: '测试种子' }],
    });

    try {
        const bag = await mock.service.getBagDetail();
        assert.equal(bag.items[0].locked, true);
        assert.equal(bag.originalItems[0].locked, true);
        assert.deepEqual(await mock.service.getBagSeeds(), []);
    } finally {
        mock.restore();
    }
});

function installDogGiftMocks(options = {}) {
    const servicePath = require.resolve('../dist/services/dog-skill-gifts');
    const gameConfigPath = require.resolve('../dist/config/gameConfig');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const utilsPath = require.resolve('../dist/utils/utils');
    const mockedPaths = [gameConfigPath, networkPath, protoPath, utilsPath];
    const previous = new Map(mockedPaths.map(path => [path, require.cache[path]]));
    const calls = [];
    const logs = [];
    const type = reply => ({
        create: value => value,
        encode: () => ({ finish: () => Buffer.alloc(0) }),
        decode: () => reply,
    });

    require.cache[gameConfigPath] = loadedModule(gameConfigPath, {
        getItemById: id => Number(id) === 101351 ? { id: 101351, name: '同气连枝礼包' } : null,
    });
    require.cache[networkPath] = loadedModule(networkPath, {
        sendMsgAsync: async (service, method) => {
            calls.push(`${service}.${method}`);
            return { body: Buffer.alloc(0) };
        },
    });
    require.cache[protoPath] = loadedModule(protoPath, {
        types: {
            GetDogInfoRequest: type({}),
            GetDogInfoReply: { decode: () => ({ pending_gift_count: options.pendingCount || 0 }) },
            ClaimSkillGiftsRequest: type({}),
            ClaimSkillGiftsReply: { decode: () => ({ item: { id: 101351, count: options.pendingCount || 0 }, claimed_count: options.pendingCount || 0 }) },
        },
    });
    require.cache[utilsPath] = loadedModule(utilsPath, {
        toNum: value => Number(value?.toString?.() ?? value) || 0,
        log: (...args) => logs.push(args),
        logWarn: (...args) => logs.push(args),
    });

    delete require.cache[servicePath];
    const service = require('../dist/services/dog-skill-gifts');
    return {
        service,
        calls,
        logs,
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

test('owner gift fallback queries once on demand and claims the captured item without opening it', { concurrency: false }, async () => {
    const mock = installDogGiftMocks({ pendingCount: 10 });
    try {
        const result = await mock.service.checkAndClaimDogSkillGifts();
        assert.equal(result.claimed, 10);
        assert.equal(Number(result.item.id), 101351);
        assert.deepEqual(mock.calls, [
            'gamepb.dogpb.DogService.GetDogInfo',
            'gamepb.dogpb.DogService.ClaimSkillGifts',
        ]);
        assert.equal(mock.calls.some(call => call.includes('ItemService.Use')), false);
    } finally {
        mock.restore();
    }
});

test('owner gift status query does not claim until the user requests it', { concurrency: false }, async () => {
    const mock = installDogGiftMocks({ pendingCount: 10 });
    try {
        const info = await mock.service.getDogInfo();
        assert.equal(mock.service.getPendingGiftCount(info), 10);
        assert.deepEqual(mock.calls, ['gamepb.dogpb.DogService.GetDogInfo']);
        assert.equal(mock.calls.some(call => call.endsWith('.ClaimSkillGifts')), false);
    } finally {
        mock.restore();
    }
});

test('visitor reward detection only counts the server-granted dog skill gift item', { concurrency: false }, () => {
    const mock = installDogGiftMocks();
    try {
        assert.equal(mock.service.getFarmingSkillGiftCount({
            results: [
                { reward: { id: 101351, count: 1 } },
                { reward: { id: 1101, count: 5 } },
                { reward: { id: 101351, count: 2 } },
            ],
        }), 3);
    } finally {
        mock.restore();
    }
});
