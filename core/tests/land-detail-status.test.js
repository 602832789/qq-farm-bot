const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildLandDetail,
    getPlantInteractionEffects,
    getPlantMutantConfigIds,
    getPlantStatusFlags,
} = require('../dist/services/farm/land-analysis');

test('土地普通状态同时接受计数、owner 列表和当前阶段时间', () => {
    const flags = getPlantStatusFlags({
        dry_num: 1,
        weed_owners: [0],
        insect_owners: [],
    }, {
        dry_time: 500,
        weeds_time: 500,
        insect_time: 90,
    }, 100);

    assert.deepEqual(flags, {
        needWater: true,
        needWeed: true,
        needBug: true,
    });
});

test('变异状态合并协议中的三个已确认来源并去重', () => {
    const ids = getPlantMutantConfigIds({
        mutant_config_ids: [13],
        extended_mutations: [{ mutant_config_id: 14 }, { mutant_config_id: 13 }],
    }, {
        mutants: [{ mutant_config_id: 15 }, { mutant_config_id: 14 }],
    });

    assert.deepEqual(ids, ['13', '15', '14']);
});

test('特殊道具状态只读取抓包确认的 field 35/38，不解释 field 40', () => {
    const effects = getPlantInteractionEffects({
        interaction_uses: [{
            item_id: 301102,
            count: 1,
            effect_type: 3,
            host_gid: 1009631504,
            timestamp: 1787072238,
        }],
        interaction_targets: [{
            item_id: 301102,
            host_gid: 1009631504,
            timestamp: 1787072238,
            land_id: 6,
        }],
        field_40: { value_1: 2, value_2: 1 },
    });

    assert.deepEqual(effects, [{
        itemId: '301102',
        itemName: '足球',
        effectType: 3,
        landId: '6',
        hostGid: '1009631504',
        usedAt: '1787072238',
        confirmed: true,
        source: 'protocol-land',
    }]);
});

test('好友土地详情保留 2x2 主从关系、变异和普通状态', () => {
    const detail = buildLandDetail({
        id: 5,
        unlocked: true,
        level: 5,
        land_size: 2,
        slave_land_ids: [1, 6, 2],
        plant: {
            id: 1029003,
            name: '星语铃花',
            phases: [{
                phase: 1,
                begin_time: 1,
                dry_time: 10,
                weeds_time: 20,
                insect_time: 30,
                mutants: [{ mutant_config_id: 13 }],
            }],
            season: 1,
            mutant_config_ids: [13],
            field_40: { value_1: 10, value_2: 1 },
        },
    }, { friendMode: true, nowSec: 100 });

    assert.equal(detail.id, 5);
    assert.equal(detail.status, 'growing');
    assert.equal(detail.plantSize, 2);
    assert.deepEqual(detail.occupiedLandIds, [5, 1, 6, 2]);
    assert.equal(detail.needWater, true);
    assert.equal(detail.needWeed, true);
    assert.equal(detail.needBug, true);
    assert.equal(detail.isMutated, true);
    assert.deepEqual(detail.mutantConfigIds, ['13']);
    assert.deepEqual(detail.protocolField40, { value1: '10', value2: '1' });
});
