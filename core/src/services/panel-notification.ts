export {};

const path = require('node:path');
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');

/**
 * 面板内消息（局内通知）：只存本地 JSON，不依赖 Bark / 钉钉 / Webhook 等外部推送渠道。
 * worker 追加、主进程读取；每账号一个文件，保留最近 100 条。
 * 未读状态由前端按账号记录在本地，避免两个进程同时改同一个文件。
 */
const MAX_NOTIFICATIONS = 100;

interface PanelNotificationRecord {
    id: string;
    createdAt: number;
    dedupeKey: string;
    type: string;
    title: string;
    content: string;
}

function safeAccountId(accountId: string): string {
    return String(accountId || '').trim().replace(/[^\w-]/g, '_');
}

function getNotificationFile(accountId: string): string {
    const id = safeAccountId(accountId);
    if (!id) throw new Error('缺少账号 ID');
    return path.join(getDataFile('panel_notifications'), `${id}.json`);
}

function getPanelNotifications(accountId: string): PanelNotificationRecord[] {
    const data = readJsonFile(getNotificationFile(accountId), () => ({ records: [] }));
    return Array.isArray(data?.records) ? data.records.slice(0, MAX_NOTIFICATIONS) : [];
}

/** 同一事件的 dedupeKey 只记一次，避免 10 分钟一轮的巡查反复刷同一条到货消息。 */
function appendPanelNotification(accountId: string, entry: any = {}): PanelNotificationRecord | null {
    const title = String(entry?.title || '').trim();
    const content = String(entry?.content || '').trim();
    const dedupeKey = String(entry?.dedupeKey || '').trim();
    if (!title || !content) return null;
    const records = getPanelNotifications(accountId);
    if (dedupeKey && records.some(record => record?.dedupeKey === dedupeKey)) return null;
    const record: PanelNotificationRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        dedupeKey,
        type: String(entry?.type || 'info'),
        title,
        content,
    };
    writeJsonFileAtomic(getNotificationFile(accountId), {
        records: [record, ...records].slice(0, MAX_NOTIFICATIONS),
    });
    return record;
}

module.exports = {
    MAX_NOTIFICATIONS,
    getPanelNotifications,
    appendPanelNotification,
};
