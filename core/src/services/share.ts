export {};
/**
 * 分享状态（只读检查）
 */

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log } = require('../utils/utils');

const DAILY_KEY: string = 'daily_share';
const CHECK_COOLDOWN_MS: number = 10 * 60 * 1000;

type ShareCheckStatus = 'unchecked' | 'entry_available' | 'entry_unavailable' | 'check_failed';

let checkedDateKey: string = '';
let lastCheckAt: number = 0;
let checkStatus: ShareCheckStatus = 'unchecked';
let canShare: boolean | null = null;

function getDateKey(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isCheckedToday(): boolean {
    return checkedDateKey === getDateKey();
}

async function checkCanShare(): Promise<any> {
    const body: Uint8Array = types.CheckCanShareRequest.encode(types.CheckCanShareRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.sharepb.ShareService', 'CheckCanShare', body);
    return types.CheckCanShareReply.decode(replyBody);
}

async function getInviteInfo(): Promise<any> {
    const body: Uint8Array = types.GetInviteInfoRequest.encode(types.GetInviteInfoRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.sharepb.ShareService', 'GetInviteInfo', body);
    return types.GetInviteInfoReply.decode(replyBody);
}

async function checkDailyShareStatus(force: boolean = false): Promise<boolean> {
    const now: number = Date.now();
    if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return false;
    lastCheckAt = now;
    try {
        const reply: any = await checkCanShare();
        canShare = !!(reply && reply.can_share);
        checkStatus = canShare ? 'entry_available' : 'entry_unavailable';
        checkedDateKey = getDateKey();
        log('分享', canShare ? '分享入口可用，奖励状态待人工确认' : '分享入口暂不可用，奖励状态待人工确认', {
            module: 'task',
            event: DAILY_KEY,
            result: 'checked',
            canShare,
        });
        return true;
    } catch (e: any) {
        canShare = null;
        checkStatus = 'check_failed';
        log('分享', `状态检查失败: ${e.message}`, {
            module: 'task',
            event: DAILY_KEY,
            result: 'error',
        });
        return false;
    }
}

module.exports = {
    checkDailyShareStatus,
    getInviteInfo,
    getShareDailyState: () => ({
        key: DAILY_KEY,
        mode: 'check_only',
        checkedToday: isCheckedToday(),
        checkStatus,
        canShare,
        doneToday: false,
        lastCheckAt,
        lastClaimAt: 0,
    }),
};
