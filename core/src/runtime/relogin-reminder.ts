export {};

interface ReloginReminderOptions {
    store: any;
    sendPushooMessage: (payload: any) => Promise<any>;
    log: (tag: string, msg: string, extra?: any) => void;
}

interface OfflineReminderPayload {
    accountId?: string;
    accountName?: string;
    reason?: string;
    offlineMs?: number;
}

function createReloginReminderService(options: ReloginReminderOptions) {
    const { store, sendPushooMessage, log } = options;

    function getOfflineAutoDeleteMs(): number {
        const cfg = store.getOfflineReminder ? store.getOfflineReminder() : null;
        const sec = Math.max(0, Number.parseInt(cfg?.offlineDeleteSec, 10) || 0);
        return sec === 0 ? Infinity : sec * 1000;
    }

    async function triggerOfflineReminder(payload: OfflineReminderPayload = {}): Promise<void> {
        try {
            const accountId = String(payload.accountId || '').trim();
            const accountName = String(payload.accountName || '').trim();
            const reason = String(payload.reason || 'unknown');
            log('系统', `触发下线提醒: 账号=${accountName || accountId}, 原因=${reason}`, { accountId, accountName, reason });

            const cfg = store.getOfflineReminder ? store.getOfflineReminder() : null;
            if (!cfg) {
                log('错误', '未找到下线提醒配置');
                return;
            }

            const channel = String(cfg.channel || '').trim().toLowerCase();
            const endpoint = String(cfg.endpoint || '').trim();
            const token = String(cfg.token || '').trim();
            const baseTitle = String(cfg.title || '').trim();
            const title = accountName ? `${baseTitle} ${accountName}` : baseTitle;
            const content = String(cfg.msg || '').trim();
            if (!channel || !token || !title || !content) {
                log('错误', '下线提醒配置不完整');
                return;
            }
            if (channel === 'webhook' && !endpoint) {
                log('错误', 'Webhook 渠道未设置接口地址');
                return;
            }

            const result = await sendPushooMessage({ channel, endpoint, token, title, content });
            if (result?.ok) {
                log('系统', `下线提醒发送成功: ${accountName || accountId}`);
            } else {
                log('错误', `下线提醒发送失败: ${result?.msg || 'unknown'}`);
            }
        } catch (e: any) {
            log('错误', `下线提醒发送异常: ${e.message}`);
        }
    }

    return { getOfflineAutoDeleteMs, triggerOfflineReminder };
}

module.exports = { createReloginReminderService };
