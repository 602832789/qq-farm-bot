export {};

/**
 * 网关诊断文案的中文化工具。
 *
 * 运行日志面板是给人看的，`pending=3, queued=1, active=AllLands#251:18136ms` 这种键值对
 * 只有写代码时顺手，事后排查读起来很费劲（尤其是浮点毫秒一长串小数）。
 * 这里统一把计数、耗时、列表换成中文短句；方法名（AllLands、Bag）和请求序号（#251）
 * 保持原样——它们是对着抓包和网关日志定位用的标识，翻译了反而对不上。
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
/** 列表为空时各 describe 函数统一返回的占位词。 */
const EMPTY_LIST_TEXT = '无';

/**
 * 耗时的人类可读形式：`850 毫秒` / `3.3 秒` / `12 秒` / `1 分 5 秒`。
 * 十秒以上直接取整，避免日志里出现 `12.327675000065938 秒` 这种没有意义的小数尾巴。
 */
function formatDurationZh(ms: number): string {
    const value = Math.max(0, Number(ms) || 0);
    if (value < MS_PER_SECOND) return `${Math.round(value)} 毫秒`;
    if (value < MS_PER_MINUTE) {
        const seconds = value / MS_PER_SECOND;
        return `${seconds >= 10 ? Math.round(seconds) : Number(seconds.toFixed(1))} 秒`;
    }
    const totalSeconds = Math.round(value / MS_PER_SECOND);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes} 分钟` : `${minutes} 分 ${seconds} 秒`;
}

/** 把 `无` / `none` / 空串都当成「没有内容」，避免日志里出现「回包中：无」。 */
function cleanListText(text: any): string {
    const value = String(text === null || text === undefined ? '' : text).trim();
    if (!value || value === EMPTY_LIST_TEXT || value === 'none') return '';
    return value;
}

/** `等待回包 3 个、排队 1 个`；两边都是 0 时说「队列空闲」。 */
function formatGatewayCounts(pending: any, queued: any): string {
    const inflight = Math.max(0, Number(pending) || 0);
    const waiting = Math.max(0, Number(queued) || 0);
    if (inflight === 0 && waiting === 0) return '队列空闲';
    return `等待回包 ${inflight} 个、排队 ${waiting} 个`;
}

/** `；回包中：AllLands#1（1.1 秒）`，没有在途请求时返回空串，父级不用再判断。 */
function formatInflightSegment(active: any, pending: any): string {
    const list = cleanListText(active);
    if (!list || Number(pending) <= 0) return '';
    return `；回包中：${list}`;
}

/** 在途请求列表项：`AllLands#515（1.1 秒）`。 */
function formatPendingItem(method: any, seq: any, ageMs: any): string {
    const name = String(method || '未知请求');
    const id = seq === null || seq === undefined ? '' : `#${seq}`;
    return `${name}${id}（${formatDurationZh(Number(ageMs) || 0)}）`;
}

/** 排队请求列表项：`Bag（前台）`。 */
function formatQueuedItem(method: any, classLabel: any): string {
    const name = String(method || '未知请求');
    const label = String(classLabel || '').trim();
    return label ? `${name}（${label}）` : name;
}

function joinListZh(items: readonly string[]): string {
    const list = (items || []).filter(Boolean);
    return list.length ? list.join('、') : EMPTY_LIST_TEXT;
}

/**
 * 整行压力日志：
 * `网关请求压力：等待回包 3 个、排队 1 个；回包中：…；排队中：…`。
 * 只有对应计数大于 0 才带那一段，避免「回包中：无；排队中：无」这种凑字数的尾巴。
 */
function formatRequestPressureZh(input: {
    pending?: any;
    queued?: any;
    active?: any;
    queuedMethods?: any;
} = {}): string {
    const pending = Math.max(0, Number(input.pending) || 0);
    const queued = Math.max(0, Number(input.queued) || 0);
    const segments = [`网关请求压力：${formatGatewayCounts(pending, queued)}`];
    const inflight = pending > 0 ? cleanListText(input.active) : '';
    if (inflight) segments.push(`回包中：${inflight}`);
    const waiting = queued > 0 ? cleanListText(input.queuedMethods) : '';
    if (waiting) segments.push(`排队中：${waiting}`);
    return segments.join('；');
}

/** 流量额度的让路原因：这些枚举值只有代码里见过，面板上直接翻成人话。 */
const BUDGET_REASON_LABEL: Readonly<Record<string, string>> = {
    budget_total: '总量额度用尽',
    budget_method: '单方法额度用尽',
    foreground: '前台请求不限额',
    critical: '心跳/ACE 不限额',
    ok: '额度充足',
};

/** 连接健康档位，见 utils/request-governor.ts 的 FlowMode。 */
const FLOW_MODE_LABEL: Readonly<Record<string, string>> = {
    healthy: '连接正常',
    cautious: '连接受限（降速）',
    stall: '连接无响应',
};

function describeBudgetReasonZh(reason: any): string {
    const key = String(reason === null || reason === undefined ? '' : reason);
    return BUDGET_REASON_LABEL[key] || key || '未知';
}

function describeFlowModeZh(mode: any): string {
    const key = String(mode === null || mode === undefined ? '' : mode);
    return FLOW_MODE_LABEL[key] || key || '未知';
}

module.exports = {
    EMPTY_LIST_TEXT,
    formatDurationZh,
    cleanListText,
    formatGatewayCounts,
    formatInflightSegment,
    formatPendingItem,
    formatQueuedItem,
    joinListZh,
    formatRequestPressureZh,
    describeBudgetReasonZh,
    describeFlowModeZh,
};
