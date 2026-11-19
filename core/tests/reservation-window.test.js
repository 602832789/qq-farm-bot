const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    WAIT_QUALIFY_WINDOW_SEC,
    WAIT_DEADLINE_SEC,
    FAIL_COOLDOWN_MS,
    PLANTING_ROUND_RECHECK_MS,
    FAR_FUTURE,
    buildLandMap,
    estimateLandClearAt,
    getLayoutClearMetrics,
    isQualifiedForWaiting,
    collectActive2x2Footprints,
    occupantsOf,
    isNewPlantingCycle,
    createReservationWindow,
    createFailureCooldown,
    buildPlantingRoundSignature,
    createPlantingRoundGate,
} = require('../dist/services/farm/reservation-window');
const { selectFutureLayoutReservation, layoutKey } = require('../dist/services/farm/layout-reservation');
const { getPlantById, getPlantGrowTime } = require('../dist/config/gameConfig');

const NOW = 1_700_000_000;
const MUSHROOM = 1020050;   // 蘑菇：2 季，单季 14400s
const DOGTAIL = 1020516;    // 狗尾草：1 季
const ALL_24 = Array.from({ length: 24 }, (_, i) => i + 1);
const sorted = ids => [...ids].sort((a, b) => a - b);

function emptyLand(id) {
    return { id, unlocked: true };
}

function growingLand(id, matureAt, { plantId = DOGTAIL, season = 1, plantedAt = matureAt - 3600 } = {}) {
    return {
        id, unlocked: true,
        plant: {
            id: plantId, season,
            phases: [
                { phase: 1, begin_time: plantedAt },
                { phase: 6, begin_time: matureAt },
            ],
        },
    };
}

/** 组 5/6/1/2 的三块植株 + 空地 1：老版本标准等待场景。 */
function waitingSquare(matureAt, extras = {}) {
    return [
        emptyLand(1),
        growingLand(2, matureAt, extras),
        growingLand(5, matureAt, extras),
        growingLand(6, matureAt, extras),
    ];
}

function fullLands(emptyIds, matureAtFor) {
    const empties = new Set(emptyIds);
    return ALL_24.map(id => (empties.has(id) ? emptyLand(id) : growingLand(id, matureAtFor(id))));
}

// ---------- 1. 清空时刻估算（老版本 getEstimatedLandClearAt） ----------

test('空地清空时刻为 0；缺阶段数据/缺成熟阶段为不可判定', () => {
    const empty = new Set([1]);
    assert.equal(estimateLandClearAt(emptyLand(1), empty, NOW), 0);
    assert.equal(estimateLandClearAt({ id: 2, plant: { id: DOGTAIL, season: 1, phases: [] } }, empty, NOW), FAR_FUTURE);
    assert.equal(estimateLandClearAt({ id: 2, plant: { id: DOGTAIL, season: 1, phases: [{ phase: 1, begin_time: NOW - 3600 }] } }, empty, NOW), FAR_FUTURE);
    assert.equal(estimateLandClearAt(null, empty, NOW), FAR_FUTURE);
});

test('一季作物按成熟时刻估算；已成熟按当前时刻估算', () => {
    const empty = new Set();
    assert.equal(estimateLandClearAt(growingLand(2, NOW + 60), empty, NOW), NOW + 60);
    assert.equal(estimateLandClearAt(growingLand(2, NOW - 10), empty, NOW), NOW);
});

test('多季作物必须等末季：第 1 季成熟后还要再长一整季', () => {
    const empty = new Set();
    const grow = getPlantGrowTime(MUSHROOM);
    assert.equal(getPlantById(MUSHROOM).seasons, 2);
    assert.ok(grow > WAIT_QUALIFY_WINDOW_SEC);
    const firstSeason = estimateLandClearAt(growingLand(2, NOW + 30, { plantId: MUSHROOM, season: 1 }), empty, NOW);
    const lastSeason = estimateLandClearAt(growingLand(2, NOW + 30, { plantId: MUSHROOM, season: 2 }), empty, NOW);
    assert.equal(firstSeason, NOW + 30 + grow);
    assert.equal(lastSeason, NOW + 30);
});

// ---------- 2. 60 秒资格窗口 ----------

test('资格窗口边界：60 秒整可等待，61 秒与远期/未知不可等待', () => {
    const lands = waitingSquare(NOW + 60);
    const landMap = buildLandMap(lands);
    const emptySet = new Set([1]);
    const at60 = getLayoutClearMetrics([5, 6, 1, 2], landMap, emptySet, NOW);
    assert.equal(at60.clearAt, NOW + 60);
    assert.equal(isQualifiedForWaiting(at60, NOW), true);

    const at61 = getLayoutClearMetrics([5, 6, 1, 2], buildLandMap(waitingSquare(NOW + 61)), emptySet, NOW);
    assert.equal(isQualifiedForWaiting(at61, NOW), false);

    const far = getLayoutClearMetrics([5, 6, 1, 2], buildLandMap(waitingSquare(NOW + 7200)), emptySet, NOW);
    assert.equal(isQualifiedForWaiting(far, NOW), false);

    const unknownLands = [
        emptyLand(1),
        ...[2, 5, 6].map(id => ({ id, plant: { id: DOGTAIL, season: 1, phases: [] } })),
    ];
    const unknown = getLayoutClearMetrics([5, 6, 1, 2], buildLandMap(unknownLands), emptySet, NOW);
    assert.equal(unknown.unknown, true);
    assert.equal(isQualifiedForWaiting(unknown, NOW), false);
});

test('完全空闲的组恒为合格，且锁地代价按各格差值累计', () => {
    const landMap = buildLandMap([1, 2, 5, 6].map(emptyLand));
    const metrics = getLayoutClearMetrics([5, 6, 1, 2], landMap, new Set([1, 2, 5, 6]), NOW);
    assert.equal(metrics.waiting, false);
    assert.equal(metrics.clearAt, 0);
    assert.equal(metrics.lockCost, 0);
    assert.equal(isQualifiedForWaiting(metrics, NOW), true);
});

// ---------- 3. 排除已有 2×2 占地 ----------

test('已有 2×2 footprint 会被收集；全部落在空地里的残留 footprint 不算占用', () => {
    const active = { id: 7, slave_land_ids: [8, 3, 4] };
    assert.equal(collectActive2x2Footprints([active, emptyLand(1)], new Set([1])).length, 1);
    assert.equal(collectActive2x2Footprints([active], new Set([7, 8, 3, 4])).length, 0);
    assert.equal(collectActive2x2Footprints([emptyLand(1)], new Set([1])).length, 0);
});

// ---------- 4. 占用者身份 / 新种植周期 ----------

test('收割让占用表变短、成熟时刻抖动都不算新周期；重种才算', () => {
    const lands = waitingSquare(NOW + 30);
    const landMap = buildLandMap(lands);
    const emptySet = new Set([1]);
    const before = occupantsOf([5, 6, 1, 2], landMap, emptySet);

    const harvested = [emptyLand(1), emptyLand(2), growingLand(5, NOW + 30), growingLand(6, NOW + 30)];
    assert.equal(isNewPlantingCycle(before, occupantsOf([5, 6, 1, 2], buildLandMap(harvested), new Set([1, 2]))), false);

    const jitter = [emptyLand(1), growingLand(2, NOW + 33, { plantedAt: NOW + 30 - 3600 }), growingLand(5, NOW + 30), growingLand(6, NOW + 30)];
    assert.equal(isNewPlantingCycle(before, occupantsOf([5, 6, 1, 2], buildLandMap(jitter), emptySet)), false);

    const replanted = [emptyLand(1), growingLand(2, NOW + 30), growingLand(5, NOW + 210, { plantedAt: NOW + 150 }), growingLand(6, NOW + 30)];
    assert.equal(isNewPlantingCycle(before, occupantsOf([5, 6, 1, 2], buildLandMap(replanted), emptySet)), true);
});

// ---------- 5. 首次预留 + 60 秒硬期限状态机 ----------

test('期限自首次圈地起算，轮询不续期；到期释放且同一停滞组合不再重圈', () => {
    const window = createReservationWindow();
    const occupants = new Map([[2, 'a'], [5, 'a'], [6, 'a']]);
    const t0 = NOW;

    const first = window.evaluate('1,2,5,6', occupants, t0);
    assert.deepEqual(first, { allowed: true, reason: 'new', deadlineSec: t0 + WAIT_DEADLINE_SEC });

    const later = window.evaluate('1,2,5,6', occupants, t0 + 30);
    assert.equal(later.reason, 'active');
    assert.equal(later.deadlineSec, t0 + WAIT_DEADLINE_SEC, '多次轮询不得续期');

    const atBoundary = window.evaluate('1,2,5,6', occupants, t0 + WAIT_DEADLINE_SEC);
    assert.equal(atBoundary.allowed, true);

    const expired = window.evaluate('1,2,5,6', occupants, t0 + WAIT_DEADLINE_SEC + 1);
    assert.deepEqual(expired, { allowed: false, reason: 'expired', deadlineSec: 0 });

    const repeated = window.evaluate('1,2,5,6', occupants, t0 + 121);
    assert.equal(repeated.reason, 'released');
    assert.equal(repeated.allowed, false);
});

test('释放后：收割/成熟时刻抖动仍拒绝，出现新播种时刻才重开窗口', () => {
    const window = createReservationWindow();
    const occupants = new Map([[2, 'a'], [5, 'a'], [6, 'a']]);
    window.evaluate('1,2,5,6', occupants, NOW);
    assert.equal(window.evaluate('1,2,5,6', occupants, NOW + 61).reason, 'expired');

    const harvested = new Map([[5, 'a'], [6, 'a']]);
    assert.equal(window.evaluate('1,2,5,6', harvested, NOW + 121).reason, 'released');

    const replanted = new Map([[2, 'a'], [5, 'b'], [6, 'a']]);
    const fresh = window.evaluate('1,2,5,6', replanted, NOW + 200);
    assert.equal(fresh.reason, 'new');
    assert.equal(fresh.deadlineSec, NOW + 200 + WAIT_DEADLINE_SEC);
});

test('资格变化主动释放（invalidate）同样记住占用者，避免立刻重圈；换组则重置', () => {
    const window = createReservationWindow();
    const occupants = new Map([[2, 'a'], [5, 'a'], [6, 'a']]);
    window.evaluate('1,2,5,6', occupants, NOW);
    assert.deepEqual(window.activeKeys(), ['1,2,5,6']);
    window.invalidate(occupants);
    assert.equal(window.evaluate('1,2,5,6', occupants, NOW + 10).reason, 'released');
    assert.equal(window.evaluate('3,4,7,8', new Map([[4, 'b']]), NOW + 10).reason, 'new');
    window.clear();
    assert.deepEqual(window.snapshot().active, []);
});

test('硬期限越界可被整轮闸门感知，避免到期后仍被跳过', () => {
    const window = createReservationWindow();
    const occupants = new Map([[2, 'a']]);
    window.evaluate('1,2,5,6', occupants, NOW);
    assert.equal(window.hasExpiredWindow(NOW + 60), false);
    assert.equal(window.hasExpiredWindow(NOW + 61), true);
    window.evaluate('1,2,5,6', occupants, NOW + 61);
    assert.equal(window.hasExpiredWindow(NOW + 62), false, '已释放的组不再计入');
});

test('过期窗口被闸门读走后必须清理，否则后续凑齐布局的轮次会被永久放行', () => {
    const window = createReservationWindow();
    const occupants = new Map([[2, 'a']]);
    window.evaluate('1,2,5,6', occupants, NOW);
    assert.equal(window.hasExpiredWindow(NOW + 61), true);
    // 模拟后续轮次没走到 evaluate（凑齐布局 / 没有种子 / 不再预留）：
    // active 里若还留着过期组，hasExpiredWindow 会永远为 true，30 秒整轮节流被击穿。
    assert.equal(window.hasExpiredWindow(NOW + 62), false);
    assert.deepEqual(window.activeKeys(), []);
    assert.equal(window.evaluate('1,2,5,6', occupants, NOW + 63).reason, 'released', '仍按同一批占用者记住释放态');
});

test('释放态在整组占用者全部清空后可以自愈', () => {
    const window = createReservationWindow();
    const occupants = new Map([[2, 'a']]);
    window.evaluate('1,2,5,6', occupants, NOW);
    window.release('1,2,5,6', occupants);
    assert.equal(window.evaluate('1,2,5,6', occupants, NOW + 1).reason, 'released');
    assert.equal(window.evaluate('1,2,5,6', new Map(), NOW + 2).reason, 'new');
});

test('多个等待组各自独立记账，不互相重置期限', () => {
    const window = createReservationWindow();
    const a = window.evaluate('1,2,5,6', new Map([[2, 'a']]), NOW);
    const b = window.evaluate('3,4,7,8', new Map([[4, 'b']]), NOW + 20);
    assert.equal(a.deadlineSec, NOW + WAIT_DEADLINE_SEC);
    assert.equal(b.deadlineSec, NOW + 20 + WAIT_DEADLINE_SEC);
    assert.equal(window.evaluate('1,2,5,6', new Map([[2, 'a']]), NOW + 30).deadlineSec, a.deadlineSec);
    assert.equal(window.evaluate('1,2,5,6', new Map([[2, 'a']]), NOW + 61).reason, 'expired');
    assert.equal(window.evaluate('3,4,7,8', new Map([[4, 'b']]), NOW + 61).reason, 'active');
    assert.equal(window.evaluate('3,4,7,8', new Map([[4, 'b']]), NOW + 81).reason, 'expired');
});

// ---------- 6. 失败冷却 ----------

test('种植失败按组冷却 30 秒，过期后自动解除', () => {
    const cooldown = createFailureCooldown();
    const t0 = 1_000_000;
    cooldown.mark('1,2,5,6', t0);
    assert.equal(cooldown.isBlocked('1,2,5,6', t0 + FAIL_COOLDOWN_MS - 1), true);
    assert.deepEqual([...cooldown.blockedKeys(t0 + 1)], ['1,2,5,6']);
    assert.equal(cooldown.isBlocked('1,2,5,6', t0 + FAIL_COOLDOWN_MS + 1), false);
    assert.equal(cooldown.blockedKeys(t0 + FAIL_COOLDOWN_MS + 1).size, 0);
});

// ---------- 7. 整轮状态闸门 ----------

test('土地状态签名稳定：同一作物周期内不因服务器时间推进而变化', () => {
    const lands = waitingSquare(NOW + 30);
    const a = buildPlantingRoundSignature([1], ALL_24, lands);
    const b = buildPlantingRoundSignature([1], ALL_24, waitingSquare(NOW + 30));
    assert.equal(a, b);
    assert.notEqual(a, buildPlantingRoundSignature([1, 2], ALL_24, lands), '空地变化必须放行');
});

test('状态不变时跳过整轮，签名变化或超过 30 秒强制重查', () => {
    const gate = createPlantingRoundGate();
    const signature = buildPlantingRoundSignature([1], ALL_24, waitingSquare(NOW + 30));
    const noop = { plantedLandIds: [], deferredLandIds: [1] };

    assert.equal(gate.shouldSkip(signature, 1_000), false);
    gate.commit(signature, noop, 1_000);
    assert.equal(gate.shouldSkip(signature, 1_000 + PLANTING_ROUND_RECHECK_MS - 1), true);
    assert.deepEqual(gate.cached(signature, 1_000 + 1), noop);
    assert.equal(gate.shouldSkip(signature, 1_000 + PLANTING_ROUND_RECHECK_MS + 1), false, '周期性重查背包');
    assert.equal(gate.shouldSkip('changed', 1_001), false);

    gate.commit(signature, { plantedLandIds: [5], deferredLandIds: [] }, 2_000);
    assert.equal(gate.shouldSkip(signature, 2_001), false, '有实际种植后立即失效');
});

// ---------- 8. 选组接入时间窗口 ----------

const timeWindowFor = (lands, nowSec = NOW, extra = {}) => ({
    lands, nowSec, emptyLandIds: lands.filter(l => !l.plant).map(l => l.id), ...extra,
});

test('远期成熟组不再被选中：空地交回普通种植', () => {
    const lands = fullLands([1], () => NOW + 7200);
    const reservation = selectFutureLayoutReservation([1], ALL_24, 2, {
        timeWindow: timeWindowFor(lands),
    });
    assert.equal(reservation, null);
});

test('60 秒内清空的组可预留，返回清空时刻/锁地代价/组 key', () => {
    const lands = fullLands([1], id => ([2, 5, 6].includes(id) ? NOW + 30 : NOW + 7200));
    const reservation = selectFutureLayoutReservation([1], ALL_24, 2, {
        timeWindow: timeWindowFor(lands),
    });
    assert.ok(reservation);
    assert.equal(reservation.key, '1,2,5,6');
    assert.equal(reservation.clearAt, NOW + 30);
    assert.deepEqual(sorted(reservation.reservedLandIds), [1]);
    assert.ok(Number.isFinite(reservation.lockCost));
});

test('最早清空优先：10 秒组胜过 50 秒组，不按锚点回退', () => {
    const lands = fullLands([1, 3], id => {
        if ([4, 7, 8].includes(id)) return NOW + 10;
        if ([2, 5, 6].includes(id)) return NOW + 50;
        return NOW + 7200;
    });
    const reservation = selectFutureLayoutReservation([1, 3], ALL_24, 2, {
        timeWindow: timeWindowFor(lands),
    });
    assert.ok(reservation);
    assert.equal(reservation.key, '3,4,7,8');
    assert.equal(reservation.clearAt, NOW + 10);
    assert.deepEqual(sorted(reservation.reservedLandIds), [3]);
});

test('已有 2×2 占地的组被排除，改选另一组合格布局', () => {
    const lands = fullLands([1, 3], id => {
        if ([4, 7, 8].includes(id)) return NOW + 10;
        if ([2, 5, 6].includes(id)) return NOW + 50;
        return NOW + 7200;
    });
    lands.find(l => l.id === 7).slave_land_ids = [8, 3, 4];
    const reservation = selectFutureLayoutReservation([1, 3], ALL_24, 2, {
        timeWindow: timeWindowFor(lands),
    });
    assert.ok(reservation);
    assert.equal(reservation.key, '1,2,5,6', '与 footprint 重叠的 7/3 组都要排除');
});

test('失败冷却中的布局不会被重复选为等待目标', () => {
    const lands = fullLands([1], id => ([2, 5, 6].includes(id) ? NOW + 30 : NOW + 7200));
    const reservation = selectFutureLayoutReservation([1], ALL_24, 2, {
        timeWindow: timeWindowFor(lands),
    });
    assert.equal(reservation.key, '1,2,5,6');
    const cooled = selectFutureLayoutReservation([1], ALL_24, 2, {
        timeWindow: timeWindowFor(lands, NOW, { cooldownKeys: new Set(['1,2,5,6']) }),
    });
    assert.equal(cooled, null);
});

test('不传 timeWindow 时保持旧纯几何行为与返回形状', () => {
    const reservation = selectFutureLayoutReservation([1, 2, 3], Array.from({ length: 15 }, (_, i) => i + 1), 2);
    assert.deepEqual(Object.keys(reservation).sort(), ['layout', 'reservedLandIds']);
    assert.deepEqual(reservation, {
        layout: { anchorLandId: 5, landIds: [5, 6, 1, 2] },
        reservedLandIds: [1, 2],
    });
    assert.equal(layoutKey(reservation.layout), '1,2,5,6');
});

// ---------- 9. 接线静态断言 ----------

test('主链路接线：时间窗口、硬期限、整轮闸门、预留不计 hadWork', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/services/farm/planting.ts'), 'utf8');
    const scheduler = fs.readFileSync(path.join(__dirname, '../src/services/farm/scheduler.ts'), 'utf8');
    assert.match(src, /timeWindow:\s*\{/);
    assert.match(src, /reservationWindow\.evaluate\(/);
    assert.match(src, /plantingRoundGate\.cached\(/);
    assert.match(src, /emptyLandIds:\s*\[\.\.\.qualifyEmptyIds\]/);
    assert.match(src, /lands:\s*latestLands/);
    assert.match(src, /reservationWindow\.hasExpiredWindow\(/);
    assert.match(src, /!options\.force && Array\.isArray\(options\.lands\)/);
    assert.match(scheduler, /force:\s*opType !== 'all'/);
    assert.match(scheduler, /预留 N 块地/);
    assert.doesNotMatch(scheduler, /actions\.push\(`预留/);
    // 闸门必须早于 getBagSeeds()：命中时连 Bag 协议请求都不发。
    const gateIdx = src.indexOf('if (cached && !reservationWindow.hasExpiredWindow(');
    const bagIdx = src.indexOf('const bagSeeds = await getBagSeeds()');
    assert.ok(gateIdx > -1 && bagIdx > gateIdx, '整轮闸门必须在读取背包之前');
});
