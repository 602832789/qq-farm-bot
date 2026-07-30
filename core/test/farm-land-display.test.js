const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLandMap,
  getDisplayLandContext
} = require('../src/services/farm-land-analyzer');

test('2x2 plant display context merges slave lands into the master land', () => {
  const plant = { id: 1001, phases: [{ phase: 1, begin_time: 1 }] };
  const lands = [
    { id: 1, plant, slave_land_ids: [2, 3, 4] },
    { id: 2, master_land_id: 1 },
    { id: 3, master_land_id: 1 },
    { id: 4, master_land_id: 1 }
  ];
  const landMap = buildLandMap(lands);

  const master = getDisplayLandContext(lands[0], landMap);
  assert.equal(master.occupiedByMaster, false);
  assert.equal(master.masterLandId, 1);
  assert.deepEqual(master.occupiedLandIds, [1, 2, 3, 4]);

  for (const slaveLand of lands.slice(1)) {
    const slave = getDisplayLandContext(slaveLand, landMap);
    assert.equal(slave.occupiedByMaster, true);
    assert.equal(slave.masterLandId, 1);
    assert.equal(slave.sourceLand, lands[0]);
    assert.deepEqual(slave.occupiedLandIds, [1, 2, 3, 4]);
  }
});

test('2x2 protocol master keeps all four occupied ids regardless of slave order', () => {
  const plant = { id: 1001, phases: [{ phase: 1, begin_time: 1 }] };
  const lands = [
    { id: 1, master_land_id: 5 },
    { id: 2, master_land_id: 5 },
    { id: 5, plant, slave_land_ids: [6, 1, 2] },
    { id: 6, master_land_id: 5 }
  ];
  const landMap = buildLandMap(lands);
  const master = getDisplayLandContext(lands[2], landMap);

  assert.equal(master.masterLandId, 5);
  assert.deepEqual(master.occupiedLandIds, [5, 6, 1, 2]);
});

test('slave lands are found from the master slave list when master_land_id is absent', () => {
  const plant = { id: 1029003, phases: [{ phase: 1, begin_time: 1 }] };
  const lands = [
    { id: 5, plant, slave_land_ids: [7, 13, 14] },
    { id: 7, plant },
    { id: 13, plant },
    { id: 14, plant }
  ];
  const landMap = buildLandMap(lands);

  for (const slaveLand of lands.slice(1)) {
    const context = getDisplayLandContext(slaveLand, landMap);
    assert.equal(context.occupiedByMaster, true);
    assert.equal(context.masterLandId, 5);
    assert.equal(context.sourceLand, lands[0]);
    assert.deepEqual(context.occupiedLandIds, [5, 7, 13, 14]);
  }
});

test('single-grid plant keeps only its own land id', () => {
  const land = {
    id: 8,
    plant: { id: 1002, phases: [{ phase: 1, begin_time: 1 }] }
  };
  const context = getDisplayLandContext(land, buildLandMap([land]));

  assert.equal(context.occupiedByMaster, false);
  assert.deepEqual(context.occupiedLandIds, [8]);
});
