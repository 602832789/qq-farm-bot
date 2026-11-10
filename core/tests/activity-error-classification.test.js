const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { handleActivityApiError } = require('../dist/controllers/admin/activity-center/error-handler');

const src = (file) => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');

function classify(message) {
    let payload = null;
    handleActivityApiError({ json: (value) => { payload = value; return value; } }, new Error(message));
    return payload;
}

// 回归：网关日志中文化后，活动接口的错误分类仍必须跟着实际文案走。
// 曾经 error-handler 判断「请求队列已满」「请求被中断」，而 network.ts 抛的是
// 「请求等待队列已满」「请求已中断」，两个分支永远命中不了。
test('队列满与连接中断的中文文案能被正确分类', () => {
    assert.equal(classify('请求等待队列已满：GetAllFriends（班次=后台业务）').errorCode, 'ACTIVITY_BUSY');
    assert.equal(classify('请求已中断：连接已关闭').errorCode, 'ACTIVITY_REQUEST_INTERRUPTED');
    assert.equal(classify('前序请求被中断，本地未继续提交该地块').errorCode, 'ACTIVITY_REQUEST_INTERRUPTED');
    assert.equal(classify('发送失败').errorCode, 'ACTIVITY_REQUEST_INTERRUPTED');
    assert.equal(classify('请求超时').errorCode, 'ACTIVITY_TIMEOUT');
});

test('网关让路日志的分类关键字也跟着中文化后的文案走', () => {
    const utils = src('utils/utils.ts');
    assert.doesNotMatch(utils, /msg\.includes\('网关请求超预算'\)/);
    assert.match(utils, /总量额度用尽/);
    assert.match(utils, /单方法额度用尽/);
    assert.match(utils, /请求等待队列已满/);
});

test('静态锁：四类消费方的关键字与网关真实文案一致', () => {
    const handler = src('controllers/admin/activity-center/error-handler.ts');
    const network = src('utils/network.ts');
    const commerce = src('controllers/admin/commerce-routes.ts');
    assert.match(network, /请求等待队列已满/);
    assert.match(network, /请求已中断/);
    assert.match(handler, /includes\('请求等待队列已满'\)/);
    assert.match(handler, /includes\('请求已中断'\)/);
    // 商城路由也是中文关键字消费方。体检修 activity-center 时漏了它：
    // 队列满 / 连接中断会被当成普通失败，网关内部长串原文直接吐给前端且无法分流重试。
    assert.match(commerce, /includes\('请求等待队列已满'\)/);
    assert.match(commerce, /includes\('请求已中断'\)/);
    assert.match(commerce, /COMMERCE_BUSY/);
    assert.match(commerce, /COMMERCE_REQUEST_INTERRUPTED/);
    // 三个消费中文关键字的模块都不能残留旧串作为唯一判断
    for (const file of [
        'utils/low-priority-gate.ts',
        'services/friend/visit-strategy.ts',
        'controllers/admin/commerce-routes.ts',
    ]) {
        assert.doesNotMatch(src(file), /请求队列已满/);
    }
});
