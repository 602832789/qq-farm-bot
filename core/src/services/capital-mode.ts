export {};

/**
 * 宠物资本模式（老版本移植）。
 *
 * 按作物成熟时间自动派出守护宠物：一键务农/收获时若最近一块地在
 * leadSeconds 秒内成熟，则派出配置的宠物；收获完成 5 秒后自动召回；
 * 120 秒安全兜底召回，防止收获流程异常中断后宠物一直挂在外面。
 *
 * 手动派出的宠物不会被自动替换：手动 deployDog 会触发 releaseForManualCommand。
 */

const { PlantPhase } = require('../config/config');
const { getCapitalMode } = require('../models/store');
const { getServerTimeSec, log, logWarn, toNum, toTimeSec } = require('../utils/utils');
const { createScheduler } = require('./scheduler');
const { getPetInfo, deployDog, withdrawDog } = require('./pets');

const capitalScheduler = createScheduler('capital-mode');

const state = {
    phase: 'idle' as 'idle' | 'deploying' | 'deployed' | 'withdrawing',
    autoDogId: 0,
    lastAttemptAt: 0,
};

function findNearestMatureSeconds(lands: any[], analysis: any): number | null {
    if (analysis && Array.isArray(analysis.harvestable) && analysis.harvestable.length) return 0;
    const now = getServerTimeSec();
    let nearest = Infinity;
    for (const land of Array.isArray(lands) ? lands : []) {
        const phases = Array.isArray(land && land.plant && land.plant.phases) ? land.plant.phases : [];
        const mature = phases.find((phase: any) => toNum(phase && phase.phase) === PlantPhase.MATURE);
        const at = toTimeSec(mature && mature.begin_time);
        if (at > now) nearest = Math.min(nearest, at - now);
    }
    return Number.isFinite(nearest) ? nearest : null;
}

function clearOwnership(): void {
    capitalScheduler.clear('withdraw_after_harvest');
    capitalScheduler.clear('withdraw_safety');
    state.phase = 'idle';
    state.autoDogId = 0;
}

function releaseForManualCommand(): void {
    clearOwnership();
}

/** 收获前调用：临近成熟时自动派出守护宠物。 */
async function prepareForFarmOperation({ lands, analysis, opType }: { lands?: any[]; analysis?: any; opType?: string }): Promise<boolean> {
    if (opType !== 'all' && opType !== 'harvest') return false;
    const config = getCapitalMode();
    if (!config.enabled || !config.dogId || state.phase !== 'idle') return false;
    const matureIn = findNearestMatureSeconds(lands || [], analysis);
    if (matureIn === null || matureIn > config.leadSeconds || Date.now() - state.lastAttemptAt < 5000) return false;
    state.lastAttemptAt = Date.now();
    state.phase = 'deploying';
    try {
        const overview = await getPetInfo();
        if (overview.activeDogId) {
            state.phase = 'idle';
            return false;
        }
        const dog = (overview.dogs || []).find((item: any) => Number(item && item.id) === config.dogId && item.owned);
        if (!dog) {
            state.phase = 'idle';
            return false;
        }
        await deployDog(config.dogId);
        state.autoDogId = config.dogId;
        state.phase = 'deployed';
        capitalScheduler.setTimeoutTask('withdraw_safety', 120000, async () => {
            if (!state.autoDogId || state.phase !== 'deployed') return;
            const dogId = state.autoDogId;
            state.phase = 'withdrawing';
            try {
                const latest = await getPetInfo();
                if (latest.activeDogId === dogId) await withdrawDog();
            } catch (error: any) {
                logWarn('宠物', `资本模式安全召回失败: ${error?.message || error}`, {
                    module: 'pet',
                    event: '资本模式召回',
                    result: 'error',
                    dogId,
                });
            } finally {
                clearOwnership();
            }
        });
        log('宠物', `资本模式已派出${dog.name}`, {
            module: 'pet',
            event: '资本模式派出',
            result: 'ok',
            matureIn,
        });
        return true;
    } catch (error: any) {
        clearOwnership();
        logWarn('宠物', `资本模式派出失败: ${error?.message || error}`, {
            module: 'pet',
            event: '资本模式派出',
            result: 'error',
        });
        return false;
    }
}

/** 收获成功后调用：5 秒后自动召回。 */
function handleFarmHarvested(): void {
    if (!state.autoDogId || state.phase !== 'deployed') return;
    capitalScheduler.setTimeoutTask('withdraw_after_harvest', 5000, async () => {
        const dogId = state.autoDogId;
        state.phase = 'withdrawing';
        try {
            const overview = await getPetInfo();
            if (overview.activeDogId === dogId) await withdrawDog();
            log('宠物', '资本模式已在收获后召回宠物', {
                module: 'pet',
                event: '资本模式召回',
                result: 'ok',
                dogId,
            });
        } catch (error: any) {
            logWarn('宠物', `资本模式召回失败: ${error?.message || error}`, {
                module: 'pet',
                event: '资本模式召回',
                result: 'error',
                dogId,
            });
        } finally {
            clearOwnership();
        }
    });
}

/** 配置变更后调用：关闭或换狗时收回自动派出的宠物。 */
async function reconcileConfigChange(previous: any, next: any): Promise<void> {
    if (!state.autoDogId) return;
    if (next && next.enabled === true && Number(next.dogId) === state.autoDogId) return;
    try {
        const overview = await getPetInfo();
        if (overview.activeDogId === state.autoDogId) await withdrawDog();
    } finally {
        clearOwnership();
    }
}

module.exports = {
    findNearestMatureSeconds,
    prepareForFarmOperation,
    handleFarmHarvested,
    reconcileConfigChange,
    releaseForManualCommand,
    _state: state,
};
