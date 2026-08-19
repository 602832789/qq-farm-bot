const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, test } = require('node:test');
const protobuf = require('protobufjs');

let root;

before(async () => {
    const protoDir = path.resolve(__dirname, '../src/proto');
    const protoFiles = fs.readdirSync(protoDir)
        .filter((name) => name.endsWith('.proto'))
        .map((name) => path.join(protoDir, name));
    root = new protobuf.Root();
    await root.load(protoFiles, { keepCase: true });
});

function type(name) {
    return root.lookupType(name);
}

function hex(value) {
    return Buffer.from(value, 'hex');
}

function number(value) {
    return Number(value && typeof value.toString === 'function' ? value.toString() : value);
}

test('all RPCs observed in the latest capture have request and reply types', () => {
    const pairs = [
        ['gamepb.userpb.LoginRequest', 'gamepb.userpb.LoginReply'],
        ['gamepb.userpb.GetUserSettingsRequest', 'gamepb.userpb.GetUserSettingsReply'],
        ['gamepb.userpb.SetDisplayInfoRequest', 'gamepb.userpb.SetDisplayInfoReply'],
        ['gamepb.userpb.BatchClientReportFlowRequest', 'gamepb.userpb.BatchClientReportFlowReply'],
        ['gamepb.userpb.HeartbeatRequest', 'gamepb.userpb.HeartbeatReply'],
        ['gamepb.mysteryshoppb.GetActiveNPCRequest', 'gamepb.mysteryshoppb.GetActiveNPCReply'],
        ['gamepb.friendpb.GetShareKeyRequest', 'gamepb.friendpb.GetShareKeyReply'],
        ['gamepb.friendpb.SyncAllRequest', 'gamepb.friendpb.SyncAllReply'],
        ['gamepb.qqvippb.GetQQVipRewardsStatusRequest', 'gamepb.qqvippb.GetQQVipRewardsStatusReply'],
        ['gamepb.qqvippb.RefreshVipInfoRequest', 'gamepb.qqvippb.RefreshVipInfoReply'],
        ['gamepb.qqvippb.ClaimQQVipRewardsRequest', 'gamepb.qqvippb.ClaimQQVipRewardsReply'],
        ['gamepb.uicproxypb.BatchModerateTextRequest', 'gamepb.uicproxypb.BatchModerateTextReply'],
        ['gamepb.acepb.AntiDataRequest', 'gamepb.acepb.AntiDataReply'],
        ['gamepb.plantpb.AllLandsRequest', 'gamepb.plantpb.AllLandsReply'],
        ['gamepb.dogpb.GetDogInfoRequest', 'gamepb.dogpb.GetDogInfoReply'],
        ['gamepb.taskpb.TaskInfoRequest', 'gamepb.taskpb.TaskInfoReply'],
        ['gamepb.skinpb.SkinsOwnedRequest', 'gamepb.skinpb.SkinsOwnedReply'],
        ['gamepb.skinpb.SkinsEquippedRequest', 'gamepb.skinpb.SkinsEquippedReply'],
        ['gamepb.skinpb.GetSkinEffectTypeParamsRequest', 'gamepb.skinpb.GetSkinEffectTypeParamsReply'],
        ['gamepb.activitypb.ActivityListRequest', 'gamepb.activitypb.ActivityListReply'],
        ['gamepb.activitypb.SetSplashedRequest', 'gamepb.activitypb.SetSplashedReply'],
        ['gamepb.activitypb.GetGroupRequest', 'gamepb.activitypb.GetGroupReply'],
        ['gamepb.seasonpb.GetSeasonInfoRequest', 'gamepb.seasonpb.GetSeasonInfoReply'],
        ['gamepb.solartermspb.GetSolarTermsRedDotRequest', 'gamepb.solartermspb.GetSolarTermsRedDotReply'],
        ['gamepb.emailpb.GetEmailListRequest', 'gamepb.emailpb.GetEmailListReply'],
        ['gamepb.emailpb.BatchClaimEmailRequest', 'gamepb.emailpb.BatchClaimEmailReply'],
        ['gamepb.emailpb.BatchDeleteEmailRequest', 'gamepb.emailpb.BatchDeleteEmailReply'],
        ['gamepb.sharepb.GetInviteInfoRequest', 'gamepb.sharepb.GetInviteInfoReply'],
        ['gamepb.paypb.GetRechargeInfoRequest', 'gamepb.paypb.GetRechargeInfoReply'],
        ['gamepb.bulletinboardpb.GetBulletinListRequest', 'gamepb.bulletinboardpb.GetBulletinListReply'],
        ['gamepb.bulletinboardpb.GetBulletinDetailRequest', 'gamepb.bulletinboardpb.GetBulletinDetailReply'],
        ['gamepb.redpacketpb.GetTodayClaimStatusRequest', 'gamepb.redpacketpb.GetTodayClaimStatusReply'],
        ['gamepb.marqueepb.GetMarqueeRequest', 'gamepb.marqueepb.GetMarqueeReply'],
        ['gamepb.avatarframepb.AvatarFramesOwnedRequest', 'gamepb.avatarframepb.AvatarFramesOwnedReply'],
        ['gamepb.rechargebonuspb.GetConfigRequest', 'gamepb.rechargebonuspb.GetConfigReply'],
        ['gamepb.miscpb.GetFollowGiftStatusRequest', 'gamepb.miscpb.GetFollowGiftStatusReply'],
        ['gamepb.mallpb.GetMallListBySlotTypeRequest', 'gamepb.mallpb.GetMallListBySlotTypeResponse'],
        ['gamepb.shoppb.ShopInfoRequest', 'gamepb.shoppb.ShopInfoReply'],
        ['gamepb.itempb.BagRequest', 'gamepb.itempb.BagReply'],
        ['gamepb.itempb.LockItemsRequest', 'gamepb.itempb.LockItemsReply'],
        ['gamepb.itempb.UnlockItemsRequest', 'gamepb.itempb.UnlockItemsReply'],
        ['gamepb.dogpb.ClaimSkillGiftsRequest', 'gamepb.dogpb.ClaimSkillGiftsReply'],
        ['gamepb.interactpb.GetInteractInfoRequest', 'gamepb.interactpb.GetInteractInfoReply'],
    ];

    for (const [request, reply] of pairs) {
        assert.ok(type(request), request);
        assert.ok(type(reply), reply);
    }
});

test('QQ VIP status and claim messages match captured wire data', () => {
    const statusHex = '080110012a2408011206088bf1041005120608b59706100118012801300138808bbfd20640ffb0f2d3062a220801120608b897061001180120fcd48dc6072802300138808bbfd20640ffb0f2d306';
    const status = type('gamepb.qqvippb.GetQQVipRewardsStatusReply').decode(hex(statusHex));
    assert.equal(status.is_qq_vip, true);
    assert.equal(status.is_super_vip, true);
    assert.deepEqual(status.reward_statuses.map((item) => item.reward_type), [1, 2]);
    assert.deepEqual(status.reward_statuses.map((item) => item.can_claim), [true, true]);

    const claimType = type('gamepb.qqvippb.ClaimQQVipRewardsRequest');
    const encoded = claimType.encode(claimType.create({ reward_types: [1, 2] })).finish();
    assert.equal(Buffer.from(encoded).toString('hex'), '0a020102');

    const replyHex = '1a14088bf1041005188092b8c398feffffff0130d83d1a1608b597061001188092b8c398feffffff0130943e38011a1608b897061001188092b8c398feffffff0130953e3801';
    const reply = type('gamepb.qqvippb.ClaimQQVipRewardsReply').decode(hex(replyHex));
    assert.equal(reply.items.length, 3);

    const notify = type('gamepb.qqvippb.VipInfoUpdatedNTF').decode(hex('08011009'));
    assert.equal(number(notify.vip_type), 1);
    assert.equal(number(notify.vip_level), 9);
});

test('system and daily email requests remain separate and batch all IDs', () => {
    const listType = type('gamepb.emailpb.GetEmailListRequest');
    assert.equal(Buffer.from(listType.encode({ box_type: 1 }).finish()).toString('hex'), '0801');
    assert.equal(Buffer.from(listType.encode({ box_type: 2 }).finish()).toString('hex'), '0802');

    const captured = '080212276d63353030345f313030313232373330325f313036303331323035355f3137383639383339323812276d63353030345f313030313232373330325f313036303331323035355f3137383639383339343412276d63353030345f313030313232373330325f313036303331323035355f31373837303139363038';
    const batchType = type('gamepb.emailpb.BatchClaimEmailRequest');
    const request = batchType.decode(hex(captured));
    assert.equal(request.box_type, 2);
    assert.equal(request.email_ids.length, 3);
    assert.equal(Buffer.from(batchType.encode(request).finish()).toString('hex'), captured);
});

test('email timestamps decode from the captured response fields', () => {
    const captured = '0a690a276d63353030345f313030313232373330325f313036303331323035355f3137383639383339323810021a12e6b4bbe58aa8e5a5bde58f8be8b5a0e7a4bc2001280130f8eb8cd4063a18e6b4bbe58aa8e5a5bde58f8be8b5a0e98081e7a4bce789a94087ab94d406';
    const reply = type('gamepb.emailpb.GetEmailListReply').decode(hex(captured));
    assert.equal(reply.emails.length, 1);
    assert.equal(reply.emails[0].claimed, true);
    assert.equal(reply.emails[0].has_reward, true);
    assert.equal(number(reply.emails[0].sent_at), 1786983928);
    assert.equal(number(reply.emails[0].status_time), 1787106695);
});

test('captured client report and text moderation fields decode correctly', () => {
    const reportHex = '0a77080210021a20434434354535313443343130433345323034384633413433453138463236453120f7a7ccf9032a04f09f8c9930ec878fd4063871b2060c4d41494e5f544f505f504f53e206106d61696e5769646765744368616e6765ea06023130f206013082070f5b6f626a656374204f626a6563745d';
    const report = type('gamepb.userpb.BatchClientReportFlowRequest').decode(hex(reportHex));
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0].field_1, 2);
    assert.equal(report.items[0].event_name, 'MAIN_TOP_POS');
    assert.equal(report.items[0].action, 'mainWidgetChange');

    const accepted = type('gamepb.userpb.BatchClientReportFlowReply').decode(hex('0802'));
    assert.equal(accepted.accepted_count, 2);

    const moderateHex = '0a1a0a0ce6989fe890bde69e95e79594120a31303032323938393237';
    const moderate = type('gamepb.uicproxypb.BatchModerateTextRequest').decode(hex(moderateHex));
    assert.equal(Buffer.from(moderate.items[0].text).toString('hex'), 'e6989fe890bde69e95e79594');
    assert.equal(moderate.items[0].uid, '1002298927');
});

test('new capture fields decode without falling through as unknown data', () => {
    const settings = type('gamepb.userpb.GetUserSettingsReply').decode(hex('0a021801'));
    assert.equal(settings.settings.field_3, true);

    const avatar = type('gamepb.avatarframepb.AvatarFramesOwnedRequest').decode(hex('0802'));
    assert.equal(avatar.frame_type, 2);

    const bulletin = type('gamepb.bulletinboardpb.GetBulletinDetailReply')
        .decode(hex('0a064e6f746963651204426f64791a04323032362204323032372a03696d67'));
    assert.equal(bulletin.title, 'Notice');
    assert.equal(bulletin.image_url, 'img');

    const group = type('gamepb.activitypb.GetGroupReply').decode(hex('0a060a0208011200'));
    assert.equal(number(group.group.activity.activity_id), 1);
    assert.equal(group.group.children.length, 1);

    const skinParams = type('gamepb.skinpb.GetSkinEffectTypeParamsReply').decode(hex('0a06080112020801'));
    assert.equal(number(skinParams.params[0].effect_type), 1);
    assert.equal(number(skinParams.params[0].params.value), 1);

    const interact = type('gamepb.interactpb.GetInteractInfoReply').decode(hex('10cb858fd406'));
    assert.equal(number(interact.server_time), 1787019979);

    const follow = type('gamepb.miscpb.GetFollowGiftStatusReply').decode(hex('08011001'));
    assert.equal(follow.followed, true);
    assert.equal(follow.can_claim, true);
});

test('bag, item display, task and season additions use the captured wire types', () => {
    const bag = type('corepb.ItemBag').decode(hex('10d2011841'));
    assert.equal(number(bag.capacity), 210);
    assert.equal(number(bag.used_slots), 65);

    const show = type('corepb.ItemShow').decode(hex('1a060a01411201422a0508e9071002'));
    assert.equal(show.restriction.text, 'A');
    assert.equal(show.restriction.activity_id, 'B');
    assert.equal(number(show.exchange_price.id), 1001);
    assert.equal(number(show.exchange_price.count), 2);

    const task = type('gamepb.taskpb.Task').decode(hex('720508e9071002'));
    assert.equal(task.extra_rewards.length, 1);
    assert.equal(number(task.extra_rewards[0].id), 1001);

    const pass = type('gamepb.seasonpb.SeasonPass').decode(hex('18076008'));
    assert.equal(number(pass.total_progress), 7);
    assert.equal(number(pass.field_12), 8);
});

test('received Qixi sachet preserves its captured sender, message selector and server sell price', () => {
    const captured = '0882081001188092b8c398feffffff0130f76352110a07e79da1e8a7892e10d7da90d406180ea20608220608e90710904e';
    const sachetType = type('corepb.Item');
    const sachet = sachetType.decode(hex(captured));

    assert.equal(number(sachet.id), 1026);
    assert.equal(number(sachet.uid), 12791);
    assert.equal(sachet.source_info.sender_name, '睡觉.');
    assert.equal(number(sachet.source_info.sent_at), 1787047255);
    assert.equal(number(sachet.source_info.source_type), 14);
    assert.equal(number(sachet.show.sell_price.id), 1001);
    assert.equal(number(sachet.show.sell_price.count), 10000);
    assert.equal(Buffer.from(sachetType.encode(sachet).finish()).toString('hex'), captured);
});

test('item lock and unlock use the captured packed UID payload and Item.locked field', () => {
    const payload = '0a02b564';
    for (const name of [
        'gamepb.itempb.LockItemsRequest',
        'gamepb.itempb.LockItemsReply',
        'gamepb.itempb.UnlockItemsRequest',
        'gamepb.itempb.UnlockItemsReply',
    ]) {
        const messageType = type(name);
        const message = messageType.decode(hex(payload));
        assert.deepEqual(message.item_uids.map(number), [12853]);
        assert.equal(Buffer.from(messageType.encode(message).finish()).toString('hex'), payload);
    }

    const itemType = type('corepb.Item');
    const lockedHex = '08b0cb01101a188092b8c398feffffff0130b5644801a20608220608e90710e807';
    const unlockedHex = '08b0cb01101a188092b8c398feffffff0130b564a20608220608e90710e807';
    const lockedItem = itemType.decode(hex(lockedHex));
    const unlockedItem = itemType.decode(hex(unlockedHex));
    assert.equal(number(lockedItem.id), 26032);
    assert.equal(number(lockedItem.uid), 12853);
    assert.equal(lockedItem.locked, true);
    assert.equal(unlockedItem.locked, false);
    assert.equal(Buffer.from(itemType.encode(lockedItem).finish()).toString('hex'), lockedHex);
    assert.equal(Buffer.from(itemType.encode(unlockedItem).finish()).toString('hex'), unlockedHex);
});

test('dog skill gifts preserve the captured pending count and owner claim response', () => {
    const dogInfoHex = '0a180891bf051209e794b0e59bade78aac18e8072001286438010a180892bf051209e789a7e7be8ae78aac18b8172001286438010a180893bf051209e69691e782b9e78b971888272001286438010a15089bbf051206e69fafe59fba1888272001286438010a1808a5bf051209e68aa4e4b8bbe78aac18882720012864380110a5bf0518d6dd6420809a9e012a080894bf051080a3052a080895bf051080e90f2a080896bf051080af1a3001380a420b08d10f100a181e20a5bf05';
    const dogInfo = type('gamepb.dogpb.GetDogInfoReply').decode(hex(dogInfoHex));
    assert.equal(number(dogInfo.pending_gift_count), 10);

    const requestType = type('gamepb.dogpb.ClaimSkillGiftsRequest');
    assert.equal(Buffer.from(requestType.encode(requestType.create({})).finish()).toString('hex'), '');

    const replyHex = '0a0608e79706100a180a';
    const replyType = type('gamepb.dogpb.ClaimSkillGiftsReply');
    const reply = replyType.decode(hex(replyHex));
    assert.equal(number(reply.item.id), 101351);
    assert.equal(number(reply.item.count), 10);
    assert.equal(number(reply.claimed_count), 10);
    assert.equal(Buffer.from(replyType.encode(reply).finish()).toString('hex'), replyHex);

    const notifyType = type('gamepb.dogpb.PendingGiftCountNotify');
    assert.equal(number(notifyType.decode(hex('0801')).count), 1);
    assert.equal(number(notifyType.decode(hex('')).count), 0);
});

test('land unlock and upgrade conditions match captured field meanings', () => {
    const unlock = type('gamepb.plantpb.LandUnlockCondition').decode(hex('08061005188827'));
    assert.equal(number(unlock.preceding_land_id), 6);
    assert.equal(number(unlock.need_level), 5);
    assert.equal(number(unlock.need_gold), 5000);

    const upgrade = type('gamepb.plantpb.LandUpgradeCondition').decode(hex(
        '08011093011a0908e90710808f85cd011a0608ed0710c879',
    ));
    assert.equal(number(upgrade.condition_type), 1);
    assert.equal(number(upgrade.condition_value), 147);
    assert.deepEqual(upgrade.required_items.map(item => ({
        id: number(item.id),
        count: number(item.count),
    })), [
        { id: 1001, count: 430000000 },
        { id: 1005, count: 15560 },
    ]);

    const jointPlantMaster = type('gamepb.plantpb.LandInfo').decode(hex('080572030106027802'));
    assert.equal(number(jointPlantMaster.id), 5);
    assert.deepEqual(jointPlantMaster.slave_land_ids.map(number), [1, 6, 2]);
    assert.equal(number(jointPlantMaster.land_size), 2);
});

test('Qixi bridge and gifting messages match the captured activity frames', () => {
    const bridge = type('gamepb.activitypb.QixiBridgeConfig').decode(hex(
        '0a0508810810010a0508ea071001121a08011205088008101e1a0508810810051a0608cd970610012002'
        + '121a0802120508800810321a0608ce970610011a0508810810052001121308031205088008104d1a0608ecbc18100120011801',
    ));
    assert.equal(number(bridge.current_stage), 1);
    assert.equal(number(bridge.stages[0].stage), 1);
    assert.equal(number(bridge.stages[0].cost.item_id), 1024);
    assert.equal(number(bridge.stages[0].status), 2);

    const gift = type('gamepb.activitypb.QixiGiftProgress').decode(hex(
        '0801100c183222120a0508810810011205088208100118012001',
    ));
    assert.equal(number(gift.total_send_count), 1);
    assert.equal(number(gift.total_send_limit), 12);
    assert.equal(number(gift.total_receive_limit), 50);
    assert.equal(number(gift.gifts[0].cost_items[0].item_id), 1025);
    assert.equal(number(gift.gifts[0].receive_items[0].item_id), 1026);
    assert.equal(number(gift.gifts[0].gift_type), 1);
    assert.equal(number(gift.gifts[0].content), 1);

    const giftRequestType = type('gamepb.activitypb.GiftQixiSachetRequest');
    const giftRequest = giftRequestType.create({
        activity_id: '2026081802',
        operate_type: 26,
        params: { target_gid: '1142601927', msg_text_id: 15 },
    });
    assert.equal(
        Buffer.from(giftRequestType.encode(giftRequest).finish()).toString('hex'),
        '088a9c8ec607101ae2070808c7f1eaa004100f',
    );

    const claimRequestType = type('gamepb.activitypb.ClaimQixiBridgeRewardsRequest');
    const claimRequest = claimRequestType.create({
        activity_id: '2026081801',
        operate_type: 25,
        params: { step: 0 },
    });
    assert.equal(
        Buffer.from(claimRequestType.encode(claimRequest).finish()).toString('hex'),
        '08899c8ec6071019ea07020800',
    );

    const rewardResult = type('gamepb.activitypb.QixiBridgeRewardResult').decode(hex(
        '0a010112130881081005188092b8c398feffffff0130962712160883f1041004188092b8c398feffffff0130ea263801'
        + '121108ea0710c801188092b8c398feffffff01',
    ));
    assert.deepEqual(rewardResult.unlocked_steps.map(number), [1]);
    assert.deepEqual(rewardResult.awards.map(item => number(item.id)), [1025, 80003, 1002]);
});

test('Qixi dew targets only the captured 2x2 master land', () => {
    const requestType = type('gamepb.itempb.UseRequest');
    const capturedRequest = '0a0908afb012100130a0641209089082b7e103120105';
    const decoded = requestType.decode(hex(capturedRequest));

    assert.equal(number(decoded.item.id), 301103);
    assert.equal(number(decoded.item.count), 1);
    assert.equal(number(decoded.item.uid), 12832);
    assert.equal(number(decoded.target.host_gid), 1009631504);
    assert.deepEqual(decoded.target.land_ids.map(number), [5]);
    assert.equal(number(decoded.target.use_config_id), 0);
    assert.equal(Buffer.from(requestType.encode(decoded).finish()).toString('hex'), capturedRequest);

    const reply = type('gamepb.itempb.UseReply').decode(hex(
        '0a0908afb012100130816322bc0108051001180520054a1008b0ea0110d00f18c41320e05d28a01f'
        + '529c0108c4ab3e1206e6a2a7e6a1902216080210cca891d406180c520a08cca891d406100d3003'
        + '220a080210ccde91d4061814220a080610cc9492d4061813280150a4c30258f80e6a010078808e02'
        + '8001018801019001f80ea201010db0018632d001a4c302d801f80e92020a08e90710c20318c4ab3e'
        + 'a2020d08fe071031183120fcd48dc607a8028f01c2020408091001ca020a08cca891d406100d3003'
        + '8001052a09080512050880081001',
    ));
    assert.equal(number(reply.land.id), 5);
    assert.equal(reply.land.plant.name, '梧桐');
    assert.deepEqual(reply.land.plant.mutant_config_ids.map(number), [13]);
    assert.deepEqual(reply.land.plant.extended_mutations.map(record => number(record.mutant_config_id)), [13]);
    assert.equal(number(reply.land_reward.land_id), 5);
    assert.deepEqual(reply.land_reward.items.map(item => number(item.id)), [1024]);
    assert.deepEqual(reply.land_reward.items.map(item => number(item.count)), [1]);
});

test('football and golden insect use the captured generic item target protocol', () => {
    const requestType = type('gamepb.itempb.UseRequest');
    const plantType = type('gamepb.plantpb.PlantInfo');
    const captures = [
        {
            hex: '0a0908aeb012100130f452120908db93dcdd03120106',
            itemId: 301102,
            uid: 10612,
            hostGid: 1001851355,
            landId: 6,
            effectType: 3,
            plantHex: '9a021408aeb01210011803209082b7e10328ee9d92d406b2021208aeb012109082b7e10318ee9d92d4062006c2020408021001',
        },
        {
            hex: '0a0908adb012100130ba3d120908db93dcdd03120114',
            itemId: 301101,
            uid: 7866,
            hostGid: 1001851355,
            landId: 20,
            effectType: 2,
            plantHex: '9a021408adb01210011802209082b7e10328a59e92d406b2021208adb012109082b7e10318a59e92d4062014c2020408011001',
        },
    ];

    for (const capture of captures) {
        const decoded = requestType.decode(hex(capture.hex));
        assert.equal(number(decoded.item.id), capture.itemId);
        assert.equal(number(decoded.item.count), 1);
        assert.equal(number(decoded.item.uid), capture.uid);
        assert.equal(number(decoded.target.host_gid), capture.hostGid);
        assert.deepEqual(decoded.target.land_ids.map(number), [capture.landId]);
        assert.equal(number(decoded.target.use_config_id), 0);
        assert.equal(Buffer.from(requestType.encode(decoded).finish()).toString('hex'), capture.hex);

        const plant = plantType.decode(hex(capture.plantHex));
        assert.equal(number(plant.interaction_uses[0].item_id), capture.itemId);
        assert.equal(number(plant.interaction_uses[0].effect_type), capture.effectType);
        assert.equal(number(plant.interaction_targets[0].item_id), capture.itemId);
        assert.equal(number(plant.interaction_targets[0].land_id), capture.landId);
        assert.equal(number(plant.field_40.value_2), 1);
        assert.equal(Buffer.from(plantType.encode(plant).finish()).toString('hex'), capture.plantHex);
    }
});
