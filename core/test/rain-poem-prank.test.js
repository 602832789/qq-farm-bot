const assert = require('node:assert/strict');
const test = require('node:test');

const { loadProto } = require('../src/utils/proto');
const {
  encodeRainPoemPrankRequest,
  getPrankBottleInventory,
} = require('../src/services/rain-poem-prank-service');

test.before(async () => {
  await loadProto();
});

test('prank bottle inventory keeps frog and cloud bottles separate', () => {
  assert.deepEqual(getPrankBottleInventory([
    { id: 5005, count: 2 },
    { id: 5006, count: 3 },
    { id: 5002, count: 9 },
  ]), { frog: 2, cloud: 3 });
});

test('frog and cloud bottles use the social-item placement protocol', () => {
  const frog = encodeRainPoemPrankRequest(1212748551, 24, 5005);
  const cloud = encodeRainPoemPrankRequest(1212748551, 25, 5006);

  assert.equal(Buffer.from(frog).toString('hex'), '0887a6a4c204120118188d272803');
  assert.equal(Buffer.from(cloud).toString('hex'), '0887a6a4c204120119188e272804');
});

test('unknown items cannot be sent through the prank placement helper', () => {
  assert.throws(() => encodeRainPoemPrankRequest(1, 1, 5002), /不支持的使坏瓶/);
});
