const assert = require('node:assert/strict');
const test = require('node:test');

const {
    GATEWAY_STALL_PENDING_MS,
    LOW_PRIORITY_QUEUE_WAIT_MS,
    LOW_PRIORITY_IDLE_WAIT_MAX_MS,
    isGatewayIdleForLowPriority,
    isGatewayYieldError,
} = require('../dist/utils/low-priority-gate');

test('网关空闲判定：只有完全没有主流程流量时才允许后台请求', () => {
    assert.ok(isGatewayIdleForLowPriority({ blockingQueued: 0, businessPending: 0, backgroundPending: 0, heartbeatMisses: 0 }));
    // 心跳 / ACE 有独立保留槽位，不影响后台请求
    assert.ok(isGatewayIdleForLowPriority({ blockingQueued: 0, businessPending: 0, backgroundPending: 0, heartbeatMisses: 0, criticalPending: 2 }));

    assert.equal(isGatewayIdleForLowPriority({ blockingQueued: 1 }), false);
    assert.equal(isGatewayIdleForLowPriority({ businessPending: 1 }), false);
    // 已经有后台扫描占着唯一的 background 槽位时不再叠加
    assert.equal(isGatewayIdleForLowPriority({ backgroundPending: 1 }), false);
    // 心跳漏过说明连接本身可疑，后台请求一律不发
    assert.equal(isGatewayIdleForLowPriority({ heartbeatMisses: 1 }), false);
    assert.equal(isGatewayIdleForLowPriority(null), false);
});

test('在途请求卡住就算网关静默，后台探测必须停手', () => {
    // 服务端静默时主流程请求会挂十几秒，这种连接上一个后台请求都不该再加
    assert.equal(isGatewayIdleForLowPriority({ oldestPendingAgeMs: GATEWAY_STALL_PENDING_MS }), false);
    assert.equal(isGatewayIdleForLowPriority({ oldestPendingAgeMs: 18136 }), false);
    // 刚发出去的心跳还在正常等回包，不算静默
    assert.ok(isGatewayIdleForLowPriority({ oldestPendingAgeMs: 200 }));
});

test('让路错误识别：让路、队列已满、连接断开都算「该整轮让路」', () => {
    const busy = new Error('网关繁忙，后台请求已让路: Enter (waited=8000ms)');
    busy.name = 'GatewayBusyError';
    assert.ok(isGatewayYieldError(busy));
    assert.ok(isGatewayYieldError(new Error('请求等待队列已满: Enter (queued=100, pending=4)')));
    assert.ok(isGatewayYieldError(new Error('请求超时: Enter (stage=queued, pending=3, queued=1)')));
    assert.ok(isGatewayYieldError(new Error('请求已中断: 93s 无入站数据，连续 3 次心跳失败')));
    assert.ok(isGatewayYieldError(new Error('连接未打开: Enter')));
    assert.ok(isGatewayYieldError(new Error('账号尚未登录: Enter')));

    // 好友维度的真实失败仍要交给 handleFriendEnterError 处理，不能被当成让路
    assert.equal(isGatewayYieldError(new Error('VisitService.Enter 错误: code=1001 好友不存在')), false);
    assert.equal(isGatewayYieldError(new Error('请求超时: Enter (stage=pending)')), false);
    assert.equal(isGatewayYieldError(null), false);
});

test('让路参数是有限正数，避免后台任务无限等待', () => {
    assert.ok(LOW_PRIORITY_QUEUE_WAIT_MS > 0 && Number.isFinite(LOW_PRIORITY_QUEUE_WAIT_MS));
    assert.ok(LOW_PRIORITY_IDLE_WAIT_MAX_MS > 0 && Number.isFinite(LOW_PRIORITY_IDLE_WAIT_MAX_MS));
});