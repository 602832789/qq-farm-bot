export {};
/**
 * 反作弊服务 - 定期上报 AntiData
 * 从抓包看，客户端每 ~5 秒发送一次
 */

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log } = require('../utils/utils');

let antiDataTimer: ReturnType<typeof setInterval> | null = null;
const ANTI_DATA_INTERVAL = 5000; // 5秒

async function sendAntiData(): Promise<void> {
    try {
        const body: Uint8Array = types.AntiDataRequest.encode(types.AntiDataRequest.create({
            data: '{}',
            timestamp: Date.now(),
            device_id: '',
            platform: 0,
        })).finish();
        await sendMsgAsync('gamepb.acepb.AceService', 'AntiData', body, 5000);
    } catch {
        // 静默失败，不影响主流程
    }
}

function startAntiDataLoop(): void {
    stopAntiDataLoop();
    antiDataTimer = setInterval(() => {
        sendAntiData();
    }, ANTI_DATA_INTERVAL);
    // 启动时立即发一次
    sendAntiData();
}

function stopAntiDataLoop(): void {
    if (antiDataTimer) {
        clearInterval(antiDataTimer);
        antiDataTimer = null;
    }
}

module.exports = {
    sendAntiData,
    startAntiDataLoop,
    stopAntiDataLoop,
};
