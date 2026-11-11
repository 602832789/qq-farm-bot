export {};
const path = require('node:path');
const fs = require('node:fs');
const { getSystemDateKey } = require('../utils/utils');
function getStatsFilePath(accountId: string): string {
    const dataDir: string = process.env.FARM_DATA_DIR || path.join(__dirname, '../../data');
    return path.join(dataDir, 'stats', `${accountId}.json`);
}

function getTodayKey(): string {
    return getSystemDateKey();
}

function loadPersistedStats(accountId: string): any {
    try {
        const filePath: string = getStatsFilePath(accountId);
        if (!fs.existsSync(filePath)) return null;
        const raw: string = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function savePersistedStats(accountId: string, data: any): void {
    try {
        const filePath: string = getStatsFilePath(accountId);
        const dir: string = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const tmpPath: string = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpPath, filePath);
    } catch {
        // ignore
    }
}

interface OperationsMap {
    [key: string]: number;
    harvest: number;
    water: number;
    weed: number;
    bug: number;
    farming: number;
    fertilize: number;
    plant: number;
    steal: number;
    helpWater: number;
    helpWeed: number;
    helpBug: number;
    goldenBugClear: number;
    goldenBugPut: number;
    taskClaim: number;
    sell: number;
    upgrade: number;
    levelUp: number;
    tongQiGift: number;
}

// 键顺序与老版本一致：决定首页今日统计无记录折叠区的展示顺序。
const operations: OperationsMap = {
    harvest: 0,
    water: 0,
    weed: 0,
    bug: 0,
    farming: 0,
    fertilize: 0,
    plant: 0,
    steal: 0,
    helpWater: 0,
    helpWeed: 0,
    helpBug: 0,
    goldenBugClear: 0,
    goldenBugPut: 0,
    taskClaim: 0,
    sell: 0,
    upgrade: 0,
    levelUp: 0,
    tongQiGift: 0,
};

let currentDateKey: string | null = null;

interface LastState {
    gold: number;
    exp: number;
    coupon: number;
}

const lastState: LastState = {
    gold: -1,
    exp: -1,
    coupon: -1,
};

interface InitialState {
    gold: number | null;
    exp: number | null;
    coupon: number | null;
    goldBean: number | null;
}

const initialState: InitialState = {
    gold: null,
    exp: null,
    coupon: null,
    goldBean: null,
}

// 本次运行基线：每次登录/重启时重新记录，不做持久化恢复。
// 与 initialState（当日基线，同日重启恢复）互不影响，供资产卡片“本次运行”增量使用。
// 资产卡没有金豆的「本次运行」增量，这里不含 goldBean。
interface RunInitialState {
    gold: number | null;
    exp: number | null;
    coupon: number | null;
}

const runInitial: RunInitialState = {
    gold: null,
    exp: null,
    coupon: null,
};

interface SessionData {
    goldGained: number;
    expGained: number;
    couponGained: number;
    goldBeanGained: number;
    runGoldGained: number;
    runExpGained: number;
    runCouponGained: number;
    lastExpGain: number;
    lastGoldGain: number;
    lastExpTime?: number;
}

const session: SessionData = {
    goldGained: 0,
    expGained: 0,
    couponGained: 0,
    goldBeanGained: 0,
    runGoldGained: 0,
    runExpGained: 0,
    runCouponGained: 0,
    lastExpGain: 0,
    lastGoldGain: 0,
};

let currentAccountId: string | null = null;
let sessionStartedAt = Date.now();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function recordOperation(type: string, count: number = 1): void {
    checkAndResetDailyStats();
    if (operations[type] !== undefined) {
        operations[type] += count;
        scheduleSave();
    }
}

function checkAndResetDailyStats(): void {
    if (!currentAccountId) return;
    const todayKey: string = getTodayKey();
    if (currentDateKey && currentDateKey !== todayKey) {
        console.warn(`[统计] 检测到跨天，重置每日统计 (${currentDateKey} -> ${todayKey})`);
        Object.keys(operations).forEach((key: string) => {
            operations[key] = 0;
        });
        // 跨天后基线清空：下次 getStats/recomputeSessionTotals 以当时值重新起算，
        // 金币/经验/点券/金豆当日增量都从新的一天重新累计。
        initialState.gold = null;
        initialState.exp = null;
        initialState.coupon = null;
        initialState.goldBean = null;
        session.goldGained = 0;
        session.expGained = 0;
        session.couponGained = 0;
        session.goldBeanGained = 0;
    }
    currentDateKey = todayKey;
}

function scheduleSave(): void {
    if (!currentAccountId) return;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        doSave();
    }, 2000);
}

function doSave(): void {
    if (!currentAccountId) return;
    const todayKey: string = getTodayKey();
    const data: any = {
        date: todayKey,
        operations: { ...operations },
        initialState: { ...initialState },
        savedAt: Date.now(),
    };
    savePersistedStats(currentAccountId, data);
}

function initStats(gold: number, exp: number, coupon: number = 0): void {
    sessionStartedAt = Date.now();
    const g: number = Number.isFinite(Number(gold)) ? Number(gold) : 0;
    const e: number = Number.isFinite(Number(exp)) ? Number(exp) : 0;
    const c: number = Number.isFinite(Number(coupon)) ? Number(coupon) : 0;
    lastState.gold = g;
    lastState.exp = e;
    lastState.coupon = c;
    initialState.gold = g;
    initialState.exp = e;
    initialState.coupon = c;
    // 金豆余额在登录回调里可能还没同步完，不能拿 0 当今日起点（会把全部余额
    // 算成今日净增）。当日基线留空，由首次 getStats 观测到的真实余额初始化；
    // 同日重启时仍从持久化存档恢复，见 initStatsWithPersistence。
    initialState.goldBean = null;
    // 本次运行基线只在登录时重置：资产卡“本次运行”增量从这次登录起算。
    runInitial.gold = g;
    runInitial.exp = e;
    runInitial.coupon = c;
}

function initStatsWithPersistence(accountId: string, gold: number, exp: number, coupon: number = 0): void {
    currentAccountId = accountId;
    const todayKey: string = getTodayKey();
    currentDateKey = todayKey;
    const saved: any = loadPersistedStats(accountId);

    if (saved && saved.date === todayKey) {
        Object.keys(saved.operations || {}).forEach((key: string) => {
            if (operations[key] !== undefined) {
                operations[key] = Number(saved.operations[key]) || 0;
            }
        });
        console.warn(`[统计] 已恢复今日统计数据: ${JSON.stringify(saved.operations)}`);
    } else {
        Object.keys(operations).forEach((key: string) => {
            operations[key] = 0;
        });
        if (saved) {
            console.warn(`[统计] 日期已变更，重置统计 (${saved.date} -> ${todayKey})`);
        }
    }

    initStats(gold, exp, coupon);

    // 同日重启：用持久化里的当日基线覆盖刚设置的登录基线，
    // 金币/经验当日增量跨重启继续累计，不从头算。
    if (saved && saved.date === todayKey) {
        const savedInitial = saved.initialState || {};
        const restoredGold = Number(savedInitial.gold);
        const restoredExp = Number(savedInitial.exp);
        const restoredCoupon = Number(savedInitial.coupon);
        if (Number.isFinite(restoredGold) && restoredGold >= 0)
            initialState.gold = restoredGold;
        if (Number.isFinite(restoredExp) && restoredExp >= 0)
            initialState.exp = restoredExp;
        if (Number.isFinite(restoredCoupon) && restoredCoupon >= 0)
            initialState.coupon = restoredCoupon;
        // 金豆基线：旧存档没有该字段，或基线仍为空时保持 null 交给首次观测。
        // 必须显式排除 null/undefined —— Number(null) === 0 会通过上面的常规检查。
        const restoredGoldBean = savedInitial.goldBean;
        if (restoredGoldBean !== null && restoredGoldBean !== undefined
            && Number.isFinite(Number(restoredGoldBean)) && Number(restoredGoldBean) >= 0)
            initialState.goldBean = Number(restoredGoldBean);
    }
}

function updateStats(currentGold: number, currentExp: number): void {
    if (lastState.gold === -1) lastState.gold = currentGold;
    if (lastState.exp === -1) lastState.exp = currentExp;

    if (currentGold > lastState.gold) {
        const delta: number = currentGold - lastState.gold;
        session.lastGoldGain = delta;
    } else if (currentGold < lastState.gold) {
        session.lastGoldGain = 0;
    }
    lastState.gold = currentGold;

    if (currentExp > lastState.exp) {
        const delta: number = currentExp - lastState.exp;
        const now: number = Date.now();
        if (delta === session.lastExpGain && (now - (session.lastExpTime || 0) < 1000)) {
            // console.warn(`[系统] 忽略重复经验增量 +${delta}`);
        } else {
            session.lastExpGain = delta;
            session.lastExpTime = now;
            // console.warn(`[系统] 经验 +${delta} (总计: ${currentExp})`);
        }
    } else {
        session.lastExpGain = 0;
    }
    lastState.exp = currentExp;
}

function recordGoldExp(gold: number, exp: number): void {
    updateStats(gold, exp);
}

function setInitialValues(gold: number, exp: number, coupon: number = 0): void {
    initStats(gold, exp, coupon);
}

function resetSessionGains(): void {
    session.goldGained = 0;
    session.expGained = 0;
    session.couponGained = 0;
    session.goldBeanGained = 0;
    session.lastGoldGain = 0;
    session.lastExpGain = 0;
    session.lastExpTime = 0;
}

function recomputeSessionTotals(currentGold: number, currentExp: number, currentCoupon: number, currentGoldBean: number): void {
    if (initialState.gold === null || initialState.exp === null || initialState.coupon === null) {
        initialState.gold = currentGold;
        initialState.exp = currentExp;
        initialState.coupon = currentCoupon;
    }
    // 金豆单独按「首次观测」初始化当日基线，见 initStats 注释。
    if (initialState.goldBean === null)
        initialState.goldBean = currentGoldBean;
    session.goldGained = currentGold - (initialState.gold as number);
    session.expGained = currentExp - (initialState.exp as number);
    session.couponGained = currentCoupon - (initialState.coupon as number);
    // 与金币/点券同源的当日净值：消费后可为负，不做 clamp。
    session.goldBeanGained = currentGoldBean - (initialState.goldBean as number);
    // 本次运行增量：独立于当日增量，重启/重新登录后从新基线重新累计。
    session.runGoldGained = currentGold - (runInitial.gold ?? currentGold);
    session.runExpGained = currentExp - (runInitial.exp ?? currentExp);
    session.runCouponGained = currentCoupon - (runInitial.coupon ?? currentCoupon);
}

function getStats(statusData: any, userState: any, connected: boolean, limits: any): any {
    checkAndResetDailyStats();
    const statusObj: any = (statusData && typeof statusData === 'object') ? statusData : {};
    const userObj: any = (userState && typeof userState === 'object') ? userState : {};

    const rawGold: any = userObj.gold ?? statusObj.gold;
    const rawExp: any = userObj.exp ?? statusObj.exp;
    const rawCoupon: any = userObj.coupon ?? statusObj.coupon;
    const rawGoldBean: any = userObj.goldBean ?? statusObj.goldBean;
    const currentGold: number = Number.isFinite(Number(rawGold)) ? Number(rawGold) : 0;
    const currentExp: number = Number.isFinite(Number(rawExp)) ? Number(rawExp) : 0;
    const currentCoupon: number = Number.isFinite(Number(rawCoupon)) ? Number(rawCoupon) : 0;
    const currentGoldBean: number = Number.isFinite(Number(rawGoldBean)) ? Number(rawGoldBean) : 0;

    if (connected) {
        updateStats(currentGold, currentExp);
        recomputeSessionTotals(currentGold, currentExp, currentCoupon, currentGoldBean);
    }

    const operationsSnapshot: OperationsMap = { ...operations };
    return {
        connection: { connected },
        status: {
            name: userObj.name || statusObj.name,
            level: statusObj.level || userObj.level || 0,
            gold: currentGold,
            coupon: Number.isFinite(Number(userObj.coupon)) ? Number(userObj.coupon) : 0,
            goldBean: currentGoldBean,
            exp: currentExp,
            platform: statusObj.platform || userObj.platform || 'qq',
            avatarUrl: String(userObj.avatarUrl || statusObj.avatarUrl || '').trim(),
        },
        uptime: process.uptime(),
        sessionElapsedSeconds: Math.max(0, (Date.now() - sessionStartedAt) / 1000),
        operations: operationsSnapshot,
        sessionExpGained: session.expGained,
        sessionGoldGained: session.goldGained,
        sessionCouponGained: session.couponGained,
        sessionGoldBeanGained: session.goldBeanGained,
        runExpGained: session.runExpGained,
        runGoldGained: session.runGoldGained,
        runCouponGained: session.runCouponGained,
        lastExpGain: session.lastExpGain,
        lastGoldGain: session.lastGoldGain,
        limits,
    };
}

function saveStats(): void {
    doSave();
}

module.exports = {
    recordOperation,
    initStats,
    initStatsWithPersistence,
    updateStats,
    setInitialValues,
    recordGoldExp,
    resetSessionGains,
    getStats,
    saveStats,
    getTodayKey,
    loadPersistedStats,
    checkAndResetDailyStats,
};
