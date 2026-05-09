export {};
/**
 * 推送接口封装（基于 pushoo）
 */

const pushoo = require('pushoo').default;

function assertRequiredText(name: string, value: any): string {
    const text: string = String(value || '').trim();
    if (!text) {
        throw new Error(`${name} 不能为空`);
    }
    return text;
}

/**
 * 发送推送
 * @param payload
 * @param payload.channel 必填 推送渠道（pushoo 平台名，如 webhook）
 * @param payload.endpoint webhook 接口地址（channel=webhook 时使用）
 * @param payload.token 必填 推送 token
 * @param payload.title 必填 推送标题
 * @param payload.content 必填 推送内容
 * @returns 推送结果
 */
async function sendPushooMessage(payload: any = {}): Promise<{ ok: boolean; code: string; msg: string; raw: any }> {
    const channel: string = assertRequiredText('channel', payload.channel);
    const endpoint: string = String(payload.endpoint || '').trim();
    const rawToken: string = String(payload.token || '').trim();
    const token: string = channel === 'webhook' ? rawToken : assertRequiredText('token', rawToken);
    const title: string = assertRequiredText('title', payload.title);
    const content: string = assertRequiredText('content', payload.content);

    const options: any = {};
    if (channel === 'webhook') {
        const url: string = assertRequiredText('endpoint', endpoint);
        options.webhook = { url, method: 'POST' };
    }

    const request: any = { title, content };
    if (token) request.token = token;
    if (channel === 'webhook') request.options = options;

    const result: any = await pushoo(channel, request);

    const raw: any = (result && typeof result === 'object') ? result : { data: result };
    const hasError: boolean = !!(raw && raw.error);
    const code: string = String(raw.code || raw.errcode || (hasError ? 'error' : 'ok'));
    const message: string = String(raw.msg || raw.message || (hasError ? (raw.error.message || 'push failed') : 'ok'));
    const ok: boolean = !hasError && (code === 'ok' || code === '0' || code === '' || String(raw.status || '').toLowerCase() === 'success');

    return {
        ok,
        code,
        msg: message,
        raw,
    };
}

module.exports = {
    sendPushooMessage,
};
