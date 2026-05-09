export {};
/**
 * QQ 会员每日礼包
 */

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');

const DAILY_KEY: string = 'vip_daily_gift';
const CHECK_COOLDOWN_MS: number = 10 * 60 * 1000;

let doneDateKey: string = '';
let lastCheckAt: number = 0;
let lastClaimAt: number = 0;
let lastResult: string = '';
let lastHasGift: boolean | null = null;
let lastCanClaim: boolean | null = null;

function getDateKey(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function markDoneToday(): void {
    doneDateKey = getDateKey();
}

function isDoneToday(): boolean {
    return doneDateKey === getDateKey();
}

function getRewardSummary(items: any[]): string {
    const list: any[] = Array.isArray(items) ? items : [];
    const summary: string[] = [];
    for (const it of list) {
        const id: number = toNum(it.id);
        const count: number = toNum(it.count);
        if (count <= 0) continue;
        if (id === 1 || id === 1001) summary.push(`金币${count}`);
        else if (id === 2 || id === 1101) summary.push(`经验${count}`);
        else if (id === 1002) summary.push(`点券${count}`);
        else summary.push(`物品#${id}x${count}`);
    }
    return summary.join('/');
}

function isAlreadyClaimedError(err: any): boolean {
    const msg: string = String((err && err.message) || '');
    return msg.includes('code=1021002') || msg.includes('今日已领取') || msg.includes('已领取');
}

async function getDailyGiftStatus(): Promise<any> {
    const body: Uint8Array = types.GetDailyGiftStatusRequest.encode(types.GetDailyGiftStatusRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.qqvippb.QQVipService', 'GetDailyGiftStatus', body);
    return types.GetDailyGiftStatusReply.decode(replyBody);
}

async function claimDailyGift(): Promise<any> {
    const body: Uint8Array = types.ClaimDailyGiftRequest.encode(types.ClaimDailyGiftRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.qqvippb.QQVipService', 'ClaimDailyGift', body);
    return types.ClaimDailyGiftReply.decode(replyBody);
}

async function performDailyVipGift(force: boolean = false): Promise<boolean> {
    const now: number = Date.now();
    if (!force && isDoneToday()) return false;
    if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return false;
    lastCheckAt = now;

    try {
        const status: any = await getDailyGiftStatus();
        lastHasGift = !!(status && status.has_gift);
        lastCanClaim = !!(status && status.can_claim);
        if (!status || !status.can_claim) {
            markDoneToday();
            lastResult = 'none';
            log('会员', '今日暂无可领取会员礼包', {
                module: 'task',
                event: DAILY_KEY,
                result: 'none',
            });
            return false;
        }
        const rep: any = await claimDailyGift();
        const items: any[] = Array.isArray(rep && rep.items) ? rep.items : [];
        const reward: string = getRewardSummary(items);
        log('会员', reward ? `领取成功 → ${reward}` : '领取成功', {
            module: 'task',
            event: DAILY_KEY,
            result: 'ok',
            count: items.length,
        });
        lastClaimAt = Date.now();
        markDoneToday();
        lastResult = 'ok';
        return true;
    } catch (e: any) {
        if (isAlreadyClaimedError(e)) {
            markDoneToday();
            lastClaimAt = Date.now();
            lastResult = 'ok';
            log('会员', '今日会员礼包已领取', {
                module: 'task',
                event: DAILY_KEY,
                result: 'ok',
            });
            return false;
        }
        lastResult = 'error';
        log('会员', `领取会员礼包失败: ${e.message}`, {
            module: 'task',
            event: DAILY_KEY,
            result: 'error',
        });
        return false;
    }
}

module.exports = {
    performDailyVipGift,
    getVipDailyState: () => ({
        key: DAILY_KEY,
        doneToday: isDoneToday(),
        lastCheckAt,
        lastClaimAt,
        result: lastResult,
        hasGift: lastHasGift,
        canClaim: lastCanClaim,
    }),
};
