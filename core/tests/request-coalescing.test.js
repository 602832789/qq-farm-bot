const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

test('concurrent bag reads share one gateway request', async (t) => {
    const proto = require('../dist/utils/proto');
    await proto.loadProto();

    const networkPath = require.resolve('../dist/utils/network');
    const warehousePath = require.resolve('../dist/services/warehouse');
    const previousNetwork = require.cache[networkPath];
    const previousWarehouse = require.cache[warehousePath];

    let requestCount = 0;
    let releaseRequest;
    const requestGate = new Promise((resolve) => {
        releaseRequest = resolve;
    });
    const replyBody = Buffer.from(proto.types.BagReply.encode(
        proto.types.BagReply.create({}),
    ).finish());

    require.cache[networkPath] = {
        id: networkPath,
        filename: networkPath,
        loaded: true,
        exports: {
            sendMsgAsync: async () => {
                requestCount += 1;
                await requestGate;
                return { body: replyBody, meta: {} };
            },
            networkEvents: new EventEmitter(),
            getUserState: () => ({ gold: 0, exp: 0 }),
        },
    };
    delete require.cache[warehousePath];

    t.after(() => {
        delete require.cache[warehousePath];
        if (previousWarehouse) require.cache[warehousePath] = previousWarehouse;
        if (previousNetwork) require.cache[networkPath] = previousNetwork;
        else delete require.cache[networkPath];
    });

    const warehouse = require('../dist/services/warehouse');
    const first = warehouse.getBag();
    const second = warehouse.getBag();

    assert.equal(requestCount, 1);
    releaseRequest();

    const [firstReply, secondReply] = await Promise.all([first, second]);
    assert.strictEqual(firstReply, secondReply);

    await warehouse.getBag();
    assert.equal(requestCount, 2);
});

test('organic fertilizer loop stops at its per-run limit', async (t) => {
    const apiPath = require.resolve('../dist/services/farm/api');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const utilsPath = require.resolve('../dist/utils/utils');
    const previousApi = require.cache[apiPath];
    const previousNetwork = require.cache[networkPath];
    const previousProto = require.cache[protoPath];
    const previousUtils = require.cache[utilsPath];

    let requestCount = 0;
    const warnings = [];
    require.cache[networkPath] = {
        id: networkPath,
        filename: networkPath,
        loaded: true,
        exports: {
            sendMsgAsync: async () => {
                requestCount += 1;
                return { body: Buffer.alloc(0), meta: {} };
            },
            getUserState: () => ({ gid: 1 }),
        },
    };
    require.cache[protoPath] = {
        id: protoPath,
        filename: protoPath,
        loaded: true,
        exports: {
            types: {
                FertilizeRequest: {
                    create: value => value,
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
            },
        },
    };
    require.cache[utilsPath] = {
        id: utilsPath,
        filename: utilsPath,
        loaded: true,
        exports: {
            toLong: value => value,
            sleep: async () => {},
            randomDelay: async () => {},
            logWarn: (_tag, message) => warnings.push(message),
        },
    };
    delete require.cache[apiPath];

    t.after(() => {
        const entries = [
            [apiPath, previousApi],
            [networkPath, previousNetwork],
            [protoPath, previousProto],
            [utilsPath, previousUtils],
        ];
        for (const [modulePath, previous] of entries) {
            if (previous) require.cache[modulePath] = previous;
            else delete require.cache[modulePath];
        }
    });

    const { fertilizeOrganicLoop } = require('../dist/services/farm/api');
    const fertilized = await fertilizeOrganicLoop([1]);

    assert.equal(fertilized, 20);
    assert.equal(requestCount, 20);
    assert.match(warnings[0], /20/);
});
