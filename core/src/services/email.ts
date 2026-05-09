export {};
/**
 * 邮箱系统 - 自动领取邮箱奖励
 */

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');

const DAILY_KEY: string = 'email_rewards';
let doneDateKey: string = '';
let lastCheckAt: number = 0;
const CHECK_COOLDOWN_MS: number = 5 * 60 * 1000;

function getDateKey(): string {
    const now: Date = new Date();
    const y: number = now.getFullYear();
    const m: string = String(now.getMonth() + 1).padStart(2, '0');
    const d: string = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function markDoneToday(): void {
    doneDateKey = getDateKey();
}

function isDoneToday(): boolean {
    return doneDateKey === getDateKey();
}

async function getEmailList(boxType: number = 1): Promise<any> {
    const body: Uint8Array = types.GetEmailListRequest.encode(types.GetEmailListRequest.create({
        box_type: Number(boxType) || 1,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'GetEmailList', body);
    return types.GetEmailListReply.decode(replyBody);
}

async function claimEmail(boxType: number = 1, emailId: string = ''): Promise<any> {
    const body: Uint8Array = types.ClaimEmailRequest.encode(types.ClaimEmailRequest.create({
        box_type: Number(boxType) || 1,
        email_id: String(emailId || ''),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'ClaimEmail', body);
    return types.ClaimEmailReply.decode(replyBody);
}

async function batchClaimEmail(boxType: number = 1, emailId: string = ''): Promise<any> {
    const body: Uint8Array = types.BatchClaimEmailRequest.encode(types.BatchClaimEmailRequest.create({
        box_type: Number(boxType) || 1,
        email_id: String(emailId || ''),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'BatchClaimEmail', body);
    return types.BatchClaimEmailReply.decode(replyBody);
}

function collectClaimableEmails(reply: any): any[] {
    const emails: any[] = (reply && Array.isArray(reply.emails)) ? reply.emails : [];
    return emails.filter((x: any) => x && x.id && x.has_reward === true && x.claimed !== true);
}

function normalizeBoxType(v: any): number {
    const n: number = Number(v);
    return (n === 1 || n === 2) ? n : 1;
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

async function checkAndClaimEmails(force: boolean = false): Promise<{ claimed: number; rewardItems: number }> {
    const now: number = Date.now();
    if (!force && isDoneToday()) return { claimed: 0, rewardItems: 0 };
    if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return { claimed: 0, rewardItems: 0 };
    lastCheckAt = now;

    try {
        const [box1, box2]: any[] = await Promise.all([
            getEmailList(1).catch(() => ({ emails: [] })),
            getEmailList(2).catch(() => ({ emails: [] })),
        ]);

        const merged: Map<string, any> = new Map();
        const fromBox1: any[] = (box1.emails || []).map((x: any) => ({ ...x, __boxType: 1 }));
        const fromBox2: any[] = (box2.emails || []).map((x: any) => ({ ...x, __boxType: 2 }));
        for (const x of [...fromBox1, ...fromBox2]) {
            if (!x || !x.id) continue;
            // 优先保留"有奖励且未领取"的版本
            if (!merged.has(x.id)) {
                merged.set(x.id, x);
                continue;
            }
            const old: any = merged.get(x.id);
            const oldClaimable: boolean = !!(old && old.has_reward === true && old.claimed !== true);
            const nowClaimable: boolean = !!(x && x.has_reward === true && x.claimed !== true);
            if (!oldClaimable && nowClaimable) merged.set(x.id, x);
        }

        const claimable: any[] = collectClaimableEmails({ emails: [...merged.values()] });
        if (claimable.length === 0) {
            markDoneToday();
            log('邮箱', '今日暂无可领取邮箱奖励', {
                module: 'task',
                event: DAILY_KEY,
                result: 'none',
            });
            return { claimed: 0, rewardItems: 0 };
        }

        const rewards: any[] = [];
        let claimed: number = 0;

        // 先按邮箱类型尝试批量领取，失败则继续单领
        const byBox: Map<number, any[]> = new Map();
        for (const m of claimable) {
            const boxType: number = normalizeBoxType(m && m.__boxType);
            if (!byBox.has(boxType)) byBox.set(boxType, []);
            (byBox.get(boxType) as any[]).push(m);
        }
        for (const [boxType, list] of byBox.entries()) {
            try {
                const firstId: string = String((list[0] && list[0].id) || '');
                if (firstId) {
                    const br: any = await batchClaimEmail(boxType, firstId);
                    if (Array.isArray(br.items) && br.items.length > 0) {
                        rewards.push(...br.items);
                    }
                    claimed += 1;
                }
            } catch {
                // 批量失败静默，继续单领
            }
        }

        for (const m of claimable) {
            const boxType: number = normalizeBoxType(m && m.__boxType);
            try {
                const rep: any = await claimEmail(boxType, String(m.id || ''));
                if (Array.isArray(rep.items) && rep.items.length > 0) {
                    rewards.push(...rep.items);
                }
                claimed += 1;
            } catch {
                // 单封失败静默
            }
        }

        if (claimed > 0) {
            const rewardStr: string = getRewardSummary(rewards);
            log('邮箱', rewardStr ? `[邮箱领取] 领取成功 ${claimed} 封 → ${rewardStr}` : `[邮箱领取] 领取成功 ${claimed} 封`, {
                module: 'task',
                event: DAILY_KEY,
                result: 'ok',
                count: claimed,
            });
            markDoneToday();
        }

        return { claimed, rewardItems: rewards.length };
    } catch (e: any) {
        log('邮箱', `领取邮箱奖励失败: ${e.message}`, {
            module: 'task',
            event: DAILY_KEY,
            result: 'error',
        });
        return { claimed: 0, rewardItems: 0 };
    }
}

async function batchDeleteEmail(boxType: number = 1, emailIds: string[] = []): Promise<any> {
    const body: Uint8Array = types.BatchDeleteEmailRequest.encode(types.BatchDeleteEmailRequest.create({
        box_type: Number(boxType) || 1,
        email_ids: emailIds.map(String),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'BatchDeleteEmail', body);
    return types.BatchDeleteEmailReply.decode(replyBody);
}

module.exports = {
    getEmailList,
    claimEmail,
    batchClaimEmail,
    batchDeleteEmail,
    checkAndClaimEmails,
    getEmailDailyState: () => ({
        key: DAILY_KEY,
        doneToday: isDoneToday(),
        lastCheckAt,
    }),
};
