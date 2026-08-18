const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    buildActivityGameplayBindings,
    resolveActivityGameplays,
} = require('../dist/services/activity-gameplay-registry');

test('鹊桥活动组及子活动绑定到 qixi gameplay', () => {
    const bindings = buildActivityGameplayBindings({
        qixi: {
            groupId: '2026081800',
            bridgeActivityId: '2026081801',
            giftActivityId: '2026081802',
        },
    });

    for (const activityId of ['2026081800', '2026081801', '2026081802']) {
        assert.deepEqual(resolveActivityGameplays([activityId], bindings), {
            gameplayKey: 'qixi',
            gameplayKeys: ['qixi'],
            detailTarget: 'qixi',
            gameplayTargets: ['qixi'],
        });
    }
});
