// 催熟全部（老版 farm-ripen-all 移植）：
// 先预览「普通肥一次 + 连续有机肥」组合的总消耗（按生长阶段秒数计），确认后逐批执行。
const { randomUUID } = require('node:crypto');
const { getAllLands, fertilizeBatch, NORMAL_FERTILIZER_ID, ORGANIC_FERTILIZER_ID } = require('./api');
const { buildLandDetail } = require('./land-analysis');
const { getBag, getBagItems } = require('../warehouse');
const { toNum, toTimeSec, getServerTimeSec, randomDelay, log } = require('../../utils/utils');

function cropKey(land: any) {
    return JSON.stringify([toNum(land?.id), toNum(land?.plant?.id), toNum(land?.plant?.season),
        (land?.plant?.phases || []).map((p: any) => [toNum(p?.phase), toNum(p?.phase_id), toTimeSec(p?.begin_time)])]);
}

function fertilizerInventory(items: any) {
    if (!Array.isArray(items)) throw new Error('化肥库存读取失败');
    const inventory = { normal: 0, organic: 0 };
    for (const item of items) {
        const type = toNum(item?.id) === NORMAL_FERTILIZER_ID ? 'normal'
            : toNum(item?.id) === ORGANIC_FERTILIZER_ID ? 'organic' : null;
        if (type) {
            const count = toNum(item?.count);
            if (!Number.isFinite(count) || count < 0) throw new Error('化肥库存无效');
            inventory[type as 'normal' | 'organic'] += count;
        }
    }
    return inventory;
}

function nextRipenBatch(targets: any[]) {
    const remaining = targets.filter(target => !target.done && target.step < target.steps.length);
    const type = remaining.some(target => target.steps[target.step].type === 'normal') ? 'normal' : 'organic';
    return { type, targets: remaining.filter((target: any) => target.steps[target.step].type === type) };
}

function countRipenBatches(targets: any[]) {
    const simulated = targets.map(target => ({ steps: target.steps, step: 0 }));
    let count = 0;
    for (let batch = nextRipenBatch(simulated); batch.targets.length; batch = nextRipenBatch(simulated)) {
        for (const target of batch.targets) target.step++;
        count++;
    }
    return count;
}

function buildRipenAllPlan(snapshot: any, items: any, now: number = getServerTimeSec()) {
    if (!Array.isArray(snapshot?.lands)) throw new Error('土地或化肥库存读取失败');
    const inventory = fertilizerInventory(items);
    const targets: any[] = [];
    const skipped: { landId: number, reason: string }[] = [];
    const cost = { normal: 0, organic: 0 };
    const details = snapshot.lands.map((land: any) => buildLandDetail(land, { nowSec: now }));
    for (const detail of details) {
        if (!detail?.unlocked || detail.status !== 'growing' || !(detail.matureInSec > 0)) continue;
        const raw = snapshot.lands.find((land: any) => toNum(land?.id) === detail.id);
        const phases = raw?.plant?.phases || [];
        const durations = phases.slice(1).map((phase: any, index: number) =>
            toTimeSec(phase?.begin_time) - (index === 0 ? now : toTimeSec(phases[index]?.begin_time)));
        let reason = '';
        if (!durations.length || durations.some((value: number) => !Number.isFinite(value) || value <= 0))
            reason = '阶段时间不完整，请刷新后重试';
        else if (durations.length === 1 && !(detail.leftInorcFertTimes > 0))
            reason = '最后阶段的普通化肥次数已用尽或未知';
        if (reason) {
            skipped.push({ landId: detail.id, reason });
            continue;
        }
        const steps = durations.map((seconds: number, index: number) => {
            const type = (durations.length === 1 || index === 1) && detail.leftInorcFertTimes > 0
                ? 'normal' : 'organic';
            cost[type as 'normal' | 'organic'] += seconds;
            return { type, seconds };
        });
        targets.push({ landId: detail.id, key: cropKey(raw), steps, step: 0, done: false });
    }
    return { targets, skipped, cost, inventory,
        batchCount: countRipenBatches(targets),
        sufficient: inventory.normal >= cost.normal && inventory.organic >= cost.organic };
}

// worker 与账号一一对应，确认计划保持单次有效、账号本地。
let session: any = null;
let pending = false;

async function previewRipenAll() {
    if (pending) throw new Error('催熟操作正在执行');
    pending = true;
    session = null;
    try {
        const [snapshot, bag] = await Promise.all([getAllLands(), getBag()]);
        const plan = buildRipenAllPlan(snapshot, getBagItems(bag));
        session = { ...plan, token: randomUUID(), expiresAt: Date.now() + 60000,
            cursor: 0, completed: 0, used: { normal: 0, organic: 0 } };
        return { token: session.token, expiresAt: session.expiresAt, targetCount: plan.targets.length,
            actionCount: plan.batchCount,
            applicationCount: plan.targets.reduce((sum: number, target: any) => sum + target.steps.length, 0),
            skipped: plan.skipped, cost: plan.cost, inventory: plan.inventory, sufficient: plan.sufficient };
    } finally {
        pending = false;
    }
}

async function ripenAllStep(token: string, cursor: number) {
    if (pending) throw new Error('催熟操作正在执行，请勿重复提交');
    const current = session;
    if (!current || token !== current.token || cursor !== current.cursor || Date.now() >= current.expiresAt)
        throw new Error('催熟预览已失效，请重新预览');
    if (!current.sufficient || !current.targets.length) throw new Error('没有可执行的催熟计划或化肥不足');
    pending = true;
    try {
        if (current.cursor > 0)
            await randomDelay(600, 1200);
        const batch = nextRipenBatch(current.targets);
        if (!batch.targets.length) throw new Error('催熟计划已完成');
        let snapshot = await getAllLands();
        const rawLand = (target: any) => snapshot?.lands?.find((land: any) => toNum(land?.id) === target.landId);
        const hasKnownStaleLand = () => batch.targets.some((target: any) => {
            const raw = rawLand(target);
            return raw && target.previousKey && cropKey(raw) === target.previousKey;
        });
        // 只对已知施过肥的旧快照做重试，绝不因无关作物变化而重试。
        for (let retry = 0; hasKnownStaleLand() && retry < 3; retry++) {
            await randomDelay(300, 500);
            snapshot = await getAllLands();
        }
        const details = new Map<number, any>(snapshot.lands.map((land: any) => {
            const detail = buildLandDetail(land);
            return [detail.id, detail] as [number, any];
        }));
        let estimatedSeconds = 0;
        for (const target of batch.targets) {
            const raw = rawLand(target);
            const detail = details.get(target.landId);
            if (!raw || !detail?.unlocked || detail.status !== 'growing' || cropKey(raw) !== target.key)
                throw new Error(`土地 ${target.landId} 作物状态已变化，已停止催熟，请重新预览`);
            if (batch.type === 'normal' && !(detail.leftInorcFertTimes > 0))
                throw new Error(`土地 ${target.landId} 普通化肥次数已变化，请重新预览`);
            const seconds = toTimeSec(raw?.plant?.phases?.[1]?.begin_time) - getServerTimeSec();
            if (!(seconds > 0) || seconds > target.steps[target.step].seconds)
                throw new Error(`土地 ${target.landId} 阶段时间已变化，请重新预览`);
            estimatedSeconds += seconds;
        }
        const inventory = fertilizerInventory(getBagItems(await getBag()));
        if (inventory[batch.type as 'normal' | 'organic'] < estimatedSeconds) throw new Error('化肥库存不足，已停止催熟');
        if (current.used[batch.type] + estimatedSeconds > current.cost[batch.type])
            throw new Error('本批预计消耗超出已确认预览，请重新预览');
        const landIds: number[] = batch.targets.map((target: any) => target.landId);
        const fertilizerId = batch.type === 'normal' ? NORMAL_FERTILIZER_ID : ORGANIC_FERTILIZER_ID;
        const reply = await fertilizeBatch(landIds, fertilizerId, {
            validateBeforeSend() {
                if (batch.targets.some((target: any) => toTimeSec(rawLand(target)?.plant?.phases?.[1]?.begin_time) <= getServerTimeSec()))
                    throw new Error('阶段时间已变化，请重新预览');
            },
        });
        const updatedDetails = new Map<number, any>((reply?.land || []).map((land: any) => {
            const detail = buildLandDetail(land);
            return [detail.id, detail] as [number, any];
        }));
        const updatedLands: any[] = [];
        let stopped = '';
        for (const target of batch.targets) {
            const raw = rawLand(target);
            const detail = details.get(target.landId);
            const updatedRaw = reply?.land?.find((land: any) => toNum(land?.id) === target.landId);
            const updatedLand = updatedDetails.get(target.landId);
            if (!updatedRaw || !updatedLand || updatedLand.plantId !== detail?.plantId
                || updatedLand.currentSeason !== detail?.currentSeason) {
                stopped ||= `土地 ${target.landId} 未返回同一作物的最新状态，已停止催熟，请刷新土地`;
                continue;
            }
            updatedLands.push(updatedLand);
            if (updatedLand.status !== 'harvestable' && (updatedLand.status !== 'growing'
                || updatedRaw.plant.phases.length !== raw.plant.phases.length - 1)) {
                stopped ||= `土地 ${target.landId} 未确认预期阶段推进，已停止催熟，请重新预览`;
                continue;
            }
            target.step++;
            target.previousKey = target.key;
            target.key = cropKey(updatedRaw);
            if (updatedLand.status === 'harvestable') {
                target.done = true;
                current.completed++;
            } else if (target.step >= target.steps.length) {
                stopped ||= `土地 ${target.landId} 尚未成熟，已停止催熟，请重新预览`;
            }
        }
        const consumed = reply?.fertilizer_use?.consumed;
        current.used[batch.type] += consumed && Object.hasOwn(consumed, 'count') ? toNum(consumed.count) : estimatedSeconds;
        if (current.used[batch.type] > current.cost[batch.type])
            stopped ||= '实际消耗超出预估，已停止催熟，请重新预览';
        current.cursor++;
        current.expiresAt = Date.now() + 60000;
        const done = !stopped && current.completed === current.targets.length;
        log('施肥', `催熟全部：${landIds.length} 块土地批量施${batch.type === 'normal' ? '普通' : '有机'}化肥${stopped ? '后停止' : ''}`, {
            module: 'farm', event: '催熟全部', landIds, fertilizerType: batch.type, result: stopped ? 'partial' : 'ok', stopped,
        });
        if (done || stopped) session = null;
        return { success: true, landIds, updatedLands, fertilizerType: batch.type, cursor: current.cursor, done, stopped,
            completed: current.completed, total: current.targets.length, used: { ...current.used } };
    } catch (error) {
        session = null;
        throw error;
    } finally {
        pending = false;
    }
}

module.exports = { buildRipenAllPlan, previewRipenAll, ripenAllStep };
