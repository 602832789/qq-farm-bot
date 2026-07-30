const test = require('node:test');
const assert = require('node:assert/strict');

const { select2x2Reservations } = require('../src/services/planting-service');

function growingLand(id, matureAt) {
  return {
    id,
    unlocked: true,
    plant: {
      id: 1,
      season: 1,
      phases: [{ phase: 6, begin_time: matureAt }],
    },
  };
}

test('keeps an existing 2x2 reservation while its lands are cleared one by one', () => {
  const groupA = { key: '1-2-5-6', masterLandId: 5, landIds: [5, 6, 1, 2] };
  const groupB = { key: '3-4-7-8', masterLandId: 7, landIds: [7, 8, 3, 4] };

  const firstLands = [
    growingLand(1, 100),
    growingLand(2, 100),
    growingLand(5, 100),
    growingLand(6, 100),
    growingLand(3, 200),
    growingLand(4, 200),
    growingLand(7, 200),
    growingLand(8, 200),
  ];
  const first = select2x2Reservations([groupA, groupB], [], 1, firstLands);
  assert.deepEqual(first.map(group => group.key), [groupA.key]);

  // A 的一块地刚刚空出；即使 B 此时预计更早整体清空，也不能改换预留区，
  // 否则地块 1 会被后续普通种植流程立即塞入单格种子。
  const secondLands = [
    { id: 1, unlocked: true },
    growingLand(2, 300),
    growingLand(5, 300),
    growingLand(6, 300),
    growingLand(3, 150),
    growingLand(4, 150),
    growingLand(7, 150),
    growingLand(8, 150),
  ];
  const second = select2x2Reservations([groupA, groupB], [1], 1, secondLands);

  assert.deepEqual(second.map(group => group.key), [groupA.key]);
  assert.ok(second[0].landIds.includes(1));
});
