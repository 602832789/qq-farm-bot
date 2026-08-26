/** 雨落成诗活动：协议查询、天气瓶操作与稳定 DTO。 */

export {};

const LongModule = require('long');
const { PlantPhase } = require('../config/config');
const { getItemById, getItemImageById } = require('../config/gameConfig');
const { sendMsgAsync, getUserState, networkEvents, GatewayError } = require('../utils/network');
const { types } = require('../utils/proto');
const { getServerTimeSec, toNum } = require('../utils/utils');
const { enterFriendFarm, leaveFriendFarm } = require('./friend/api');
const { getFriendsList } = require('./friend');
const { buildLandMap, getCurrentPhase, getDisplayLandContext } = require('./farm/land-analysis');
const { getBag, getBagItems } = require('./warehouse');

const WEATHER_GROUP_ID = '2026070300';
const WEATHER_SHOP_ACTIVITY_ID = '2026070301';
const WEATHER_MUTATION_ACTIVITY_ID = '2026070302';
const WEATHER_BOTTLE_ACTIVITY_ID = '2026070303';
const WEATHER_RESEARCH_ACTIVITY_ID = '2026070304';
const WEATHER_TASK_ACTIVITY_ID = '2026070305';
const EXCHANGE_SHOP_OPERATE_TYPE = 1;
const COLLECT_WEATHER_OPERATE_TYPE = 9;
const ADVANCE_RESEARCH_OPERATE_TYPE = 40;
const COLLECTOR_BOTTLE_ID = 5001;
const SUMMON_BOTTLE_ID = 5002;
const FROG_MISCHIEF_BOTTLE_ID = 5005;
const CLOUD_MISCHIEF_BOTTLE_ID = 5006;
const LIGHTNING_BADGE_ID = 1027;
const LIGHTNING_MUTANT_CONFIG_ID = 12;
const WEATHER_ITEM_IDS = [4002, 4003, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008];
const THUNDERSTORM_TYPE = 1;
// EnterReply.field 13.field 9 is scoped to the current thunderstorm instance.
// It is not a per-friend daily collection record and resets for a later storm.
const COLLECTED_THIS_CYCLE_MARKER = 4;
const FRIEND_WEATHER_CACHE_TTL_SEC = 90;
const COLLECT_DAILY_LIMIT = 10;
const MISCHIEF_DAILY_LIMIT = 100;
const MAX_SIGNED_INT64 = 9223372036854775807n;

class WeatherActivityBusinessError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'WeatherActivityBusinessError';
        this.code = code;
    }
}

function businessError(code: string, message: string): WeatherActivityBusinessError {
    return new WeatherActivityBusinessError(code, message);
}

function int64String(value: any): string {
    if (value == null) return '0';
    if (LongModule.isLong(value)) return value.toString();
    const normalized = String(value).trim();
    return /^-?\d+$/.test(normalized) ? normalized : '0';
}

function positiveDecimal(value: unknown, code: string, fieldName: string): string {
    let normalized = '';
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) normalized = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) normalized = String(value);
    if (!normalized || normalized.length > 19 || BigInt(normalized) > MAX_SIGNED_INT64) {
        throw businessError(code, `${fieldName} 必须是 int64 范围内的正十进制整数`);
    }
    return normalized;
}

function itemDto(item: any): any {
    const rawId = item?.item_id ?? item?.itemId ?? item?.id;
    const id = int64String(rawId);
    const numericId = Number(id) || 0;
    const metadata = numericId > 0 ? getItemById(numericId) : null;
    const fallbackName = numericId === LIGHTNING_BADGE_ID ? '雷电徽章' : `物品 ${id}`;
    return {
        id,
        count: int64String(item?.count),
        name: String(metadata?.name || fallbackName),
        image: numericId > 0 ? getItemImageById(numericId) || '' : '',
        rarity: Number(metadata?.rarity) || 0,
    };
}

function bytesToText(value: Uint8Array | Buffer | string | null | undefined): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return Buffer.from(value).toString('utf8');
}

function plainText(value: unknown): string {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .trim();
}

function activityRules(value: Uint8Array | Buffer | string | null | undefined): { title: string; paragraphs: string[] } {
    const source = bytesToText(value).trim();
    if (!source) return { title: '活动说明', paragraphs: [] };
    try {
        const parsed = JSON.parse(source);
        const tips = parsed && typeof parsed === 'object' ? parsed.tips : null;
        const paragraphs = (tips && Array.isArray(tips.txt) ? tips.txt : [])
            .filter((entry: unknown): entry is string => typeof entry === 'string')
            .map(plainText)
            .filter(Boolean);
        return {
            title: plainText(tips?.title) || '活动说明',
            paragraphs,
        };
    } catch {
        return { title: '活动说明', paragraphs: [plainText(source)].filter(Boolean) };
    }
}

function activityDto(activity: any): any {
    return {
        id: int64String(activity?.activity_id),
        groupId: int64String(activity?.group_id),
        typeCode: int64String(activity?.type),
        name: String(activity?.name || ''),
        startTime: int64String(activity?.begin_time),
        endTime: int64String(activity?.end_time),
    };
}

function activityIsActive(activity: any, serverTime = getServerTimeSec()): boolean {
    const startTime = toNum(activity?.begin_time);
    const endTime = toNum(activity?.end_time);
    return (!startTime || serverTime >= startTime) && (!endTime || serverTime <= endTime);
}

function weatherStatusDto(weather: any, hostGid: any = 0): any {
    const type = toNum(weather?.weather_type);
    const status = toNum(weather?.status);
    const beginTime = toNum(weather?.begin_time);
    const endTime = toNum(weather?.end_time);
    const now = getServerTimeSec();
    const active = type > 0 && status > 0 && (!endTime || endTime > now);
    return {
        hostGid: int64String(hostGid),
        type,
        status,
        beginTime,
        endTime,
        source: toNum(weather?.source),
        field8: toNum(weather?.field_8),
        friendMarker: toNum(weather?.field_9),
        active,
        isThunderstorm: active && type === THUNDERSTORM_TYPE,
        collectedThisCycle: toNum(weather?.field_9) === COLLECTED_THIS_CYCLE_MARKER,
        remainingSec: active && endTime > 0 ? Math.max(0, endTime - now) : 0,
    };
}

function findChild(groupReply: any, activityId: string): any | null {
    const children = Array.isArray(groupReply?.group?.children) ? groupReply.group.children : [];
    return children.find((child: any) => int64String(child?.activity?.activity_id) === activityId) || null;
}

function bagBalances(bagReply: any): Map<string, string> {
    const balances = new Map<string, bigint>();
    for (const item of getBagItems(bagReply)) {
        const id = int64String(item?.id ?? item?.item_id);
        if (!/^\d+$/.test(id) || id === '0') continue;
        const countText = int64String(item?.count);
        if (!/^-?\d+$/.test(countText)) continue;
        balances.set(id, (balances.get(id) || 0n) + BigInt(countText));
    }
    return new Map(Array.from(balances, ([id, count]) => [id, count.toString()]));
}

function inventoryDto(balances: Map<string, string>): any[] {
    return [...WEATHER_ITEM_IDS, LIGHTNING_BADGE_ID]
        .map((id: number) => itemDto({ id, count: balances.get(String(id)) || '0' }));
}

function shopDto(child: any, balances: Map<string, string>, active: boolean): any {
    const goods = Array.isArray(child?.catalog?.goods) ? child.catalog.goods : [];
    const entry = goods.find((goodsEntry: any) => int64String(goodsEntry?.goods_id) === '200') || goods[0] || null;
    if (!entry) return null;
    const item = itemDto(entry.item);
    const cost = itemDto(entry.cost);
    const balance = balances.get(cost.id) || '0';
    const owned = !!entry.owned;
    const available = active && !owned && int64String(entry.status) !== '0' && BigInt(balance) >= BigInt(cost.count || '0');
    return {
        activityId: WEATHER_SHOP_ACTIVITY_ID,
        goodsId: int64String(entry.goods_id),
        item,
        cost,
        balance,
        owned,
        statusCode: int64String(entry.status),
        dailyLimit: 1,
        available,
        reason: !active
            ? '活动尚未开放或已经结束'
            : owned
                ? '今日已经兑换过天气采集瓶'
                : BigInt(balance) < BigInt(cost.count || '0')
                    ? '金豆豆不足'
                    : '',
    };
}

function collectorConfigDto(child: any): any {
    const config = child?.weather_bottle;
    if (!config) return null;
    return {
        activityId: WEATHER_BOTTLE_ACTIVITY_ID,
        collectorItemId: int64String(config.collector_item_id),
        collectorItemCount: int64String(config.collector_item_count),
        field3: int64String(config.field_3),
        field4: int64String(config.field_4),
        field9: int64String(config.field_9),
        rewards: (Array.isArray(config.rewards) ? config.rewards : []).map((reward: any) => ({
            id: int64String(reward.reward_id),
            reward: itemDto(reward.reward),
            statusCode: int64String(reward.status),
            probability: String(reward.probability || ''),
        })),
    };
}

function tasksDto(child: any): any[] {
    return (Array.isArray(child?.weather_tasks?.tasks) ? child.weather_tasks.tasks : []).map((task: any) => ({
        id: int64String(task.task_id),
        triggerItemId: int64String(task.trigger_item_id),
        title: String(task.title || ''),
        reward: itemDto(task.reward),
        dailyLimit: int64String(task.daily_limit),
        current: int64String(task.current),
        progressKnown: true,
    }));
}

function researchDto(child: any, balances: Map<string, string>): any {
    const track = child?.weather_research?.track;
    if (!track) return null;
    const badgeBalance = balances.get(String(LIGHTNING_BADGE_ID)) || '0';
    const nodes = (Array.isArray(track.nodes) ? track.nodes : []).map((node: any) => {
        const cost = itemDto(node.cost);
        const statusCode = int64String(node.status);
        const availableByStatus = statusCode === '2';
        const completed = statusCode === '4' || !!node.claimed;
        return {
            id: int64String(node.node_id),
            prerequisiteNodeIds: (Array.isArray(node.prerequisite_node_ids) ? node.prerequisite_node_ids : []).map(int64String),
            statusCode,
            cost,
            reward: itemDto(node.reward),
            field5: int64String(node.field_5),
            field8: int64String(node.field_8),
            field9: int64String(node.field_9),
            availableByStatus,
            completed,
            locked: !completed && !availableByStatus,
            affordable: cost.id === String(LIGHTNING_BADGE_ID) && BigInt(badgeBalance) >= BigInt(cost.count || '0'),
        };
    });
    return {
        activityId: WEATHER_RESEARCH_ACTIVITY_ID,
        currentStage: int64String(track.current_stage),
        badgeBalance,
        nodes,
        nextNode: nodes.find((node: any) => node.availableByStatus) || null,
        operateSupported: true,
        operateReason: '',
    };
}

async function queryWeatherGroup(): Promise<any> {
    const body = Buffer.from(types.GetGroupRequest.encode(types.GetGroupRequest.create({
        group_id: WEATHER_GROUP_ID,
    })).finish());
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'GetGroup', body);
    return types.GetGroupReply.decode(replyBody);
}

async function getWeatherStatus(): Promise<any> {
    const body = Buffer.from(types.GetWeatherStatusRequest.encode(types.GetWeatherStatusRequest.create({})).finish());
    const { body: replyBody } = await sendMsgAsync('gamepb.weatherpb.WeatherService', 'GetWeatherStatus', body);
    return types.GetWeatherStatusReply.decode(replyBody);
}

const friendWeatherCache = new Map<string, any>();

function friendGid(friend: any): string {
    return int64String(friend?.gid ?? friend?.basic?.gid);
}

function cloudEligibleLandIds(lands: any[]): string[] {
    const source = Array.isArray(lands) ? lands : [];
    const landMap = buildLandMap(source);
    const result: string[] = [];
    const seen = new Set<string>();
    for (const land of source) {
        if (!land?.unlocked) continue;
        const context = getDisplayLandContext(land, landMap);
        if (context.occupiedByMaster) continue;
        const targetLand = context.sourceLand || land;
        const landId = int64String(targetLand?.id);
        if (landId === '0' || seen.has(landId)) continue;
        const plant = targetLand?.plant;
        if (!plant || toNum(plant.id) <= 0 || !Array.isArray(plant.phases) || plant.phases.length === 0) continue;
        const phase = toNum(getCurrentPhase(plant.phases, false, '')?.phase);
        if (phase <= PlantPhase.SEED || phase >= PlantPhase.MATURE) continue;
        const interactions = [
            ...(Array.isArray(plant.interaction_uses) ? plant.interaction_uses : []),
            ...(Array.isArray(plant.interaction_targets) ? plant.interaction_targets : []),
        ];
        if (interactions.some((entry: any) => toNum(entry?.item_id) === CLOUD_MISCHIEF_BOTTLE_ID)) continue;
        seen.add(landId);
        result.push(landId);
    }
    return result;
}

async function inspectFriendFarmWeather(friend: any, force = false): Promise<any> {
    const gid = friendGid(friend);
    if (gid === '0') return null;
    const now = getServerTimeSec();
    const cached = friendWeatherCache.get(gid);
    if (!force && cached && now - cached.inspectedAt <= FRIEND_WEATHER_CACHE_TTL_SEC) return cached;

    let entered = false;
    try {
        const reply = await enterFriendFarm(Number(gid), 'low');
        entered = true;
        const inspection = {
            gid,
            basic: reply?.basic || null,
            rawWeather: reply?.weather || null,
            lands: Array.isArray(reply?.lands) ? reply.lands : [],
            inspectedAt: now,
            error: '',
        };
        friendWeatherCache.set(gid, inspection);
        return inspection;
    } catch (error: any) {
        if (cached) return { ...cached, error: String(error?.message || error || '现场天气检查失败') };
        const inspection = {
            gid,
            basic: null,
            rawWeather: null,
            lands: [],
            inspectedAt: now,
            error: String(error?.message || error || '现场天气检查失败'),
        };
        friendWeatherCache.set(gid, inspection);
        return inspection;
    } finally {
        if (entered) await leaveFriendFarm(Number(gid), 'low');
    }
}

function weatherAvailability(weather: any, inspected: boolean): { state: string; reason: string } {
    if (!inspected) return { state: 'unknown', reason: '尚未进入好友农场检查现场天气' };
    if (weather.isThunderstorm && weather.collectedThisCycle) {
        return { state: 'collected', reason: '当前这轮雷雨已经采过，下轮雷雨可再次采集' };
    }
    if (weather.isThunderstorm) return { state: 'available', reason: '' };
    if (weather.type === THUNDERSTORM_TYPE && !weather.active) return { state: 'expired', reason: '这场雷雨已经结束' };
    return { state: 'unavailable', reason: '好友农场当前不是雷雨天气' };
}

function friendWeatherDto(friend: any, inspection: any): any {
    const gid = friendGid(friend);
    const scanError = String(inspection?.error || '');
    const inspected = !!inspection?.rawWeather && !scanError;
    const weather = weatherStatusDto(inspection?.rawWeather, gid);
    const availability = weatherAvailability(weather, inspected);
    const basic = inspection?.basic || {};
    return {
        gid,
        name: String(friend?.remark || friend?.name || basic?.name || ''),
        avatarUrl: String(friend?.avatarUrl || friend?.avatar_url || basic?.avatar_url || ''),
        level: toNum(friend?.level ?? basic?.level),
        inspected,
        inspectedAt: toNum(inspection?.inspectedAt),
        scanError,
        availability: availability.state,
        availabilityReason: availability.reason,
        canCollect: !scanError && availability.state === 'available',
        eligibleCloudLandIds: scanError ? [] : cloudEligibleLandIds(inspection?.lands),
        weather,
    };
}

async function weatherFriendDtos(friends: any[], scanFriends: boolean): Promise<any[]> {
    const result: any[] = [];
    for (const friend of Array.isArray(friends) ? friends : []) {
        const gid = friendGid(friend);
        if (gid === '0' || gid === int64String(getUserState()?.gid)) continue;
        const inspection = scanFriends
            ? await inspectFriendFarmWeather(friend, true)
            : friendWeatherCache.get(gid) || null;
        result.push(friendWeatherDto(friend, inspection));
    }
    return result;
}

async function buildWeatherActivitySnapshot(scanFriends = false): Promise<any> {
    // QQ 网关对活动读取的并发很敏感，按官方客户端顺序串行请求。
    const groupReply = await queryWeatherGroup();
    const bagReply = await getBag();
    const ownWeatherReply = await getWeatherStatus();
    const friends = await getFriendsList(false, 'normal');
    const group = groupReply?.group;
    if (!group || int64String(group?.activity?.activity_id) !== WEATHER_GROUP_ID) {
        throw businessError('WEATHER_ACTIVITY_UNAVAILABLE', '服务端未发现雨落成诗活动');
    }
    const balances = bagBalances(bagReply);
    const active = activityIsActive(group.activity);
    // 新版 GetGameFriends/SyncAll 不再稳定携带天气；只有 EnterReply.field 13
    // 是现场权威数据。普通活动快照只复用缓存，显式扫描时才按官方顺序逐个进入。
    const inspectedFriends = await weatherFriendDtos(friends, scanFriends);
    const weatherFriends = inspectedFriends
        .filter((friend: any) => ['available', 'collected', 'expired'].includes(friend.availability))
        .sort((left: any, right: any) => left.weather.endTime - right.weather.endTime);
    const shopChild = findChild(groupReply, WEATHER_SHOP_ACTIVITY_ID);
    const mutationChild = findChild(groupReply, WEATHER_MUTATION_ACTIVITY_ID);
    const bottleChild = findChild(groupReply, WEATHER_BOTTLE_ACTIVITY_ID);
    const researchChild = findChild(groupReply, WEATHER_RESEARCH_ACTIVITY_ID);
    const taskChild = findChild(groupReply, WEATHER_TASK_ACTIVITY_ID);
    const ownWeather = weatherStatusDto(ownWeatherReply?.weather, getUserState()?.gid);
    const shop = shopDto(shopChild, balances, active);
    const research = researchDto(researchChild, balances);
    const nextResearchNode = research?.nextNode || null;
    return {
        groupId: WEATHER_GROUP_ID,
        activity: activityDto(group.activity),
        rules: activityRules(shopChild?.activity?.extra),
        active,
        serverTime: getServerTimeSec(),
        mutation: {
            activityId: WEATHER_MUTATION_ACTIVITY_ID,
            active: !!mutationChild && activityIsActive(mutationChild.activity),
            mutantConfigId: LIGHTNING_MUTANT_CONFIG_ID,
            baseRatePercent: toNum(findChild(groupReply, WEATHER_SHOP_ACTIVITY_ID)?.activity?.field_21),
            sellMultiplier: 4,
            excludedCropQualities: [1, 2],
        },
        ownWeather,
        friends: inspectedFriends,
        thunderstormFriends: weatherFriends,
        shop,
        collector: collectorConfigDto(bottleChild),
        tasks: tasksDto(taskChild),
        research,
        inventory: inventoryDto(balances),
        actions: {
            exchangeCollector: {
                enabled: !!shopChild && !!shop?.available,
            },
            collectWeather: {
                enabled: active
                    && BigInt(balances.get(String(COLLECTOR_BOTTLE_ID)) || '0') > 0n
                    && weatherFriends.some((friend: any) => friend.canCollect),
                friendCount: weatherFriends.filter((friend: any) => friend.canCollect).length,
                dailyLimit: COLLECT_DAILY_LIMIT,
            },
            scanFriendWeather: {
                enabled: active && inspectedFriends.length > 0,
                friendCount: inspectedFriends.length,
                reason: inspectedFriends.length > 0 ? '' : '当前没有可检查的好友',
            },
            frogMischief: {
                enabled: active
                    && BigInt(balances.get(String(FROG_MISCHIEF_BOTTLE_ID)) || '0') > 0n
                    && inspectedFriends.length > 0,
                friendCount: inspectedFriends.length,
                dailyLimit: MISCHIEF_DAILY_LIMIT,
            },
            cloudMischief: {
                enabled: active
                    && BigInt(balances.get(String(CLOUD_MISCHIEF_BOTTLE_ID)) || '0') > 0n
                    && inspectedFriends.some((friend: any) => friend.eligibleCloudLandIds.length > 0),
                friendCount: inspectedFriends.filter((friend: any) => friend.eligibleCloudLandIds.length > 0).length,
                dailyLimit: MISCHIEF_DAILY_LIMIT,
            },
            summonThunderstorm: {
                enabled: active
                    && BigInt(balances.get(String(SUMMON_BOTTLE_ID)) || '0') > 0n
                    && !ownWeather.active,
                reason: !active
                    ? '活动尚未开放或已经结束'
                    : ownWeather.active
                        ? ownWeather.isThunderstorm ? '雷雨正在进行中' : '当前已有其他特殊天气'
                        : BigInt(balances.get(String(SUMMON_BOTTLE_ID)) || '0') <= 0n
                            ? '背包中没有可用的雷雨召唤瓶'
                            : '',
            },
            advanceResearch: {
                enabled: active && !!nextResearchNode?.availableByStatus && !!nextResearchNode?.affordable,
                nodeId: nextResearchNode?.id || '',
                reason: !active
                    ? '活动尚未开放或已经结束'
                    : !nextResearchNode
                        ? '气象研究已经全部完成'
                        : !nextResearchNode.affordable
                            ? '雷电徽章不足'
                            : '',
            },
        },
    };
}

let pendingSnapshot: Promise<any> | null = null;
let pendingFriendScan: Promise<any> | null = null;
let mutationTail: Promise<void> = Promise.resolve();

function getCurrentWeatherActivity(): Promise<any> {
    if (pendingSnapshot) return pendingSnapshot;
    const request = buildWeatherActivitySnapshot();
    pendingSnapshot = request;
    request.finally(() => {
        if (pendingSnapshot === request) pendingSnapshot = null;
    }).catch(() => {});
    return request;
}

function scanWeatherFriends(): Promise<any> {
    if (pendingFriendScan) return pendingFriendScan;
    const request = serializeMutation(async () => ({
        outcome: 'scanned',
        snapshot: await buildWeatherActivitySnapshot(true),
    }));
    pendingFriendScan = request;
    request.finally(() => {
        if (pendingFriendScan === request) pendingFriendScan = null;
    }).catch(() => {});
    return request;
}

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationTail.then(operation, operation);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
}

function availableStack(bagReply: any, itemId: number): any | null {
    return getBagItems(bagReply)
        .filter((item: any) => toNum(item?.id ?? item?.item_id) === itemId && toNum(item?.count) > 0)
        .sort((left: any, right: any) => {
            const leftExpire = toNum(left?.expire_time) || Number.MAX_SAFE_INTEGER;
            const rightExpire = toNum(right?.expire_time) || Number.MAX_SAFE_INTEGER;
            return leftExpire - rightExpire;
        })[0] || null;
}

async function sendBottleUse(itemId: number, stack: any, target: any = null): Promise<any> {
    const payload: any = {
        item: {
            id: itemId,
            count: 1,
            uid: stack.uid,
        },
    };
    if (target) payload.target = target;
    const body = Buffer.from(types.UseRequest.encode(types.UseRequest.create(payload)).finish());
    const { body: replyBody } = await sendMsgAsync('gamepb.itempb.ItemService', 'Use', body);
    return types.UseReply.decode(replyBody);
}

function useReplyDto(reply: any): any {
    const rewardSources = [
        ...(Array.isArray(reply?.items) ? reply.items : []),
        ...(Array.isArray(reply?.land_reward?.items) ? reply.land_reward.items : []),
        ...(Array.isArray(reply?.social_reward?.items) ? reply.social_reward.items : []),
    ];
    return {
        usedItems: (Array.isArray(reply?.used_items) ? reply.used_items : []).map(itemDto),
        rewards: rewardSources.map(itemDto),
        landId: int64String(reply?.land?.id ?? reply?.land_reward?.land_id),
        socialItemId: int64String(reply?.social_reward?.item_id),
    };
}

async function exchangeWeatherCollectorBottle(): Promise<any> {
    return serializeMutation(async () => {
        const groupReply = await queryWeatherGroup();
        const shopChild = findChild(groupReply, WEATHER_SHOP_ACTIVITY_ID);
        const bagReply = await getBag();
        const balances = bagBalances(bagReply);
        const shop = shopDto(shopChild, balances, activityIsActive(groupReply?.group?.activity));
        if (!shop) throw businessError('WEATHER_SHOP_UNAVAILABLE', '天气采集瓶商店暂不可用');
        if (shop.owned) throw businessError('WEATHER_SHOP_ALREADY_EXCHANGED', '今日已经兑换过天气采集瓶');
        if (!shop.available) throw businessError('WEATHER_SHOP_UNAVAILABLE', shop.reason || '天气采集瓶当前不可兑换');
        const body = Buffer.from(types.ExchangeShopRequest.encode(types.ExchangeShopRequest.create({
            activity_id: WEATHER_SHOP_ACTIVITY_ID,
            operate_type: EXCHANGE_SHOP_OPERATE_TYPE,
            exchange_shop_operate: {
                goods_id: shop.goodsId,
                count: 1,
            },
        })).finish());
        const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body);
        const reply = types.ActivityOperateReply.decode(replyBody);
        return {
            outcome: 'exchanged',
            rewards: (Array.isArray(reply?.rewards) ? reply.rewards : []).map(itemDto),
            activityId: int64String(reply?.activity_id),
            operateType: int64String(reply?.operate_type),
            snapshot: await buildWeatherActivitySnapshot(),
        };
    });
}

async function useWeatherCollectorBottle(friendGidInput: unknown): Promise<any> {
    return serializeMutation(async () => {
        const friendGid = positiveDecimal(friendGidInput, 'INVALID_WEATHER_FRIEND_GID', 'friendGid');
        if (friendGid === int64String(getUserState()?.gid)) {
            throw businessError('INVALID_WEATHER_FRIEND_GID', '天气采集瓶只能在好友农场使用');
        }
        const bagBefore = await getBag();
        const stack = availableStack(bagBefore, COLLECTOR_BOTTLE_ID);
        if (!stack) throw businessError('WEATHER_COLLECTOR_UNAVAILABLE', '背包中没有可用的天气采集瓶');

        let entered = false;
        let reply: any = null;
        let weatherBefore: any = null;
        try {
            const enterReply = await enterFriendFarm(Number(friendGid));
            entered = true;
            friendWeatherCache.set(friendGid, {
                gid: friendGid,
                basic: enterReply?.basic || null,
                rawWeather: enterReply?.weather || null,
                lands: Array.isArray(enterReply?.lands) ? enterReply.lands : [],
                inspectedAt: getServerTimeSec(),
                error: '',
            });
            weatherBefore = weatherStatusDto(enterReply?.weather, friendGid);
            if (!weatherBefore.isThunderstorm) {
                throw businessError('WEATHER_FRIEND_NOT_THUNDERSTORM', '该好友农场当前不是雷雨天气');
            }
            if (weatherBefore.collectedThisCycle) {
                throw businessError('WEATHER_ALREADY_COLLECTED', '当前这轮雷雨已经采过，下轮雷雨可再次采集');
            }
            const body = Buffer.from(types.CollectWeatherRequest.encode(types.CollectWeatherRequest.create({
                activity_id: WEATHER_BOTTLE_ACTIVITY_ID,
                operate_type: COLLECT_WEATHER_OPERATE_TYPE,
                weather_collect_operate: { host_gid: friendGid },
            })).finish());
            try {
                const { body: replyBody } = await sendMsgAsync(
                    'gamepb.activitypb.ActivityService',
                    'Operate',
                    body,
                    { expectedErrorCodes: [1034040] },
                );
                reply = types.ActivityOperateReply.decode(replyBody);
            } catch (error: any) {
                if (error instanceof GatewayError && error.code === 1034040) {
                    throw businessError('WEATHER_ALREADY_COLLECTED', '当前这轮雷雨已经采过，下轮雷雨可再次采集');
                }
                throw error;
            }
        } finally {
            if (entered) await leaveFriendFarm(Number(friendGid));
        }

        // 采集成功后按官方客户端方式再次进入，记录服务端更新后的现场标记。
        const weatherAfterInspection = await inspectFriendFarmWeather({ gid: friendGid }, true);
        const weatherAfter = weatherStatusDto(weatherAfterInspection?.rawWeather, friendGid);
        pendingSnapshot = null;
        return {
            outcome: 'collected',
            friendGid,
            activityId: int64String(reply?.activity_id),
            operateType: int64String(reply?.operate_type),
            rewards: (Array.isArray(reply?.rewards) ? reply.rewards : []).map(itemDto),
            weatherBefore,
            weatherAfter,
            snapshot: await buildWeatherActivitySnapshot(),
        };
    });
}

async function useWeatherSummonBottle(): Promise<any> {
    return serializeMutation(async () => {
        const weatherBeforeReply = await getWeatherStatus();
        const weatherBefore = weatherStatusDto(weatherBeforeReply?.weather, getUserState()?.gid);
        if (weatherBefore.active) {
            throw businessError('WEATHER_ALREADY_ACTIVE', '自己的农场当前已有特殊天气，暂时无法召唤雷雨');
        }
        const bagBefore = await getBag();
        const stack = availableStack(bagBefore, SUMMON_BOTTLE_ID);
        if (!stack) throw businessError('WEATHER_SUMMON_UNAVAILABLE', '背包中没有可用的雷雨召唤瓶');
        const selfGid = positiveDecimal(int64String(getUserState()?.gid), 'WEATHER_ACCOUNT_UNAVAILABLE', 'hostGid');
        const reply = await sendBottleUse(SUMMON_BOTTLE_ID, stack, {
            host_gid: selfGid,
            land_ids: [],
            use_config_id: 0,
        });
        const weatherAfterReply = await getWeatherStatus();
        return {
            outcome: 'summoned',
            ...useReplyDto(reply),
            weather: weatherStatusDto(weatherAfterReply?.weather, getUserState()?.gid),
            snapshot: await buildWeatherActivitySnapshot(),
        };
    });
}

async function useWeatherFrogBottle(friendGidInput: unknown): Promise<any> {
    return serializeMutation(async () => {
        const friendGid = positiveDecimal(friendGidInput, 'INVALID_WEATHER_FRIEND_GID', 'friendGid');
        if (friendGid === int64String(getUserState()?.gid)) {
            throw businessError('INVALID_WEATHER_FRIEND_GID', '青蛙使坏瓶只能在好友农场使用');
        }
        const stack = availableStack(await getBag(), FROG_MISCHIEF_BOTTLE_ID);
        if (!stack) throw businessError('WEATHER_FROG_UNAVAILABLE', '背包中没有可用的青蛙使坏瓶');

        let entered = false;
        let result: any = null;
        try {
            const enterReply = await enterFriendFarm(Number(friendGid));
            entered = true;
            friendWeatherCache.set(friendGid, {
                gid: friendGid,
                basic: enterReply?.basic || null,
                rawWeather: enterReply?.weather || null,
                lands: Array.isArray(enterReply?.lands) ? enterReply.lands : [],
                inspectedAt: getServerTimeSec(),
                error: '',
            });
            const reply = await sendBottleUse(FROG_MISCHIEF_BOTTLE_ID, stack, {
                host_gid: friendGid,
                use_config_id: 0,
            });
            pendingSnapshot = null;
            result = {
                outcome: 'frog-used',
                friendGid,
                ...useReplyDto(reply),
            };
        } finally {
            if (entered) await leaveFriendFarm(Number(friendGid));
        }
        return { ...result, snapshot: await buildWeatherActivitySnapshot() };
    });
}

async function useWeatherCloudBottle(friendGidInput: unknown, landIdInput: unknown = null): Promise<any> {
    return serializeMutation(async () => {
        const friendGid = positiveDecimal(friendGidInput, 'INVALID_WEATHER_FRIEND_GID', 'friendGid');
        if (friendGid === int64String(getUserState()?.gid)) {
            throw businessError('INVALID_WEATHER_FRIEND_GID', '乌云使坏瓶只能在好友农场使用');
        }
        const stack = availableStack(await getBag(), CLOUD_MISCHIEF_BOTTLE_ID);
        if (!stack) throw businessError('WEATHER_CLOUD_UNAVAILABLE', '背包中没有可用的乌云使坏瓶');

        let entered = false;
        let result: any = null;
        try {
            const enterReply = await enterFriendFarm(Number(friendGid));
            entered = true;
            const eligibleLandIds = cloudEligibleLandIds(enterReply?.lands);
            const requestedLandId = landIdInput == null || landIdInput === ''
                ? ''
                : positiveDecimal(landIdInput, 'INVALID_WEATHER_LAND_ID', 'landId');
            const landId = requestedLandId || eligibleLandIds[0] || '';
            if (!landId || !eligibleLandIds.includes(landId)) {
                throw businessError('WEATHER_CLOUD_TARGET_UNAVAILABLE', '好友当前没有可使用乌云使坏瓶的作物');
            }
            const inspection: any = {
                gid: friendGid,
                basic: enterReply?.basic || null,
                rawWeather: enterReply?.weather || null,
                lands: Array.isArray(enterReply?.lands) ? enterReply.lands : [],
                inspectedAt: getServerTimeSec(),
                error: '',
            };
            friendWeatherCache.set(friendGid, inspection);
            const reply = await sendBottleUse(CLOUD_MISCHIEF_BOTTLE_ID, stack, {
                host_gid: friendGid,
                land_ids: [landId],
            });
            if (reply?.land) {
                inspection.lands = inspection.lands.map((land: any) => (
                    int64String(land?.id) === landId ? reply.land : land
                ));
                inspection.inspectedAt = getServerTimeSec();
                friendWeatherCache.set(friendGid, inspection);
            }
            pendingSnapshot = null;
            result = {
                outcome: 'cloud-used',
                friendGid,
                landId,
                ...useReplyDto(reply),
            };
        } finally {
            if (entered) await leaveFriendFarm(Number(friendGid));
        }
        return { ...result, snapshot: await buildWeatherActivitySnapshot() };
    });
}

async function advanceWeatherResearch(nodeIdInput: unknown): Promise<any> {
    return serializeMutation(async () => {
        const nodeId = positiveDecimal(nodeIdInput, 'INVALID_WEATHER_RESEARCH_NODE', 'nodeId');
        const groupReply = await queryWeatherGroup();
        const group = groupReply?.group;
        if (!group || !activityIsActive(group.activity)) {
            throw businessError('WEATHER_ACTIVITY_UNAVAILABLE', '雨落成诗活动尚未开放或已经结束');
        }
        const researchChild = findChild(groupReply, WEATHER_RESEARCH_ACTIVITY_ID);
        const bagReply = await getBag();
        const research = researchDto(researchChild, bagBalances(bagReply));
        if (!research) throw businessError('WEATHER_RESEARCH_UNAVAILABLE', '服务端未返回气象研究数据');
        const node = research.nodes.find((entry: any) => entry.id === nodeId);
        if (!node) throw businessError('INVALID_WEATHER_RESEARCH_NODE', '气象研究节点不存在');
        if (node.completed) throw businessError('WEATHER_RESEARCH_ALREADY_COMPLETED', '该气象研究节点已经完成');
        if (!node.availableByStatus) throw businessError('WEATHER_RESEARCH_LOCKED', '请先完成前置气象研究节点');
        if (!node.affordable) throw businessError('INSUFFICIENT_LIGHTNING_BADGES', '雷电徽章不足');

        const body = Buffer.from(types.AdvanceWeatherResearchRequest.encode(types.AdvanceWeatherResearchRequest.create({
            activity_id: WEATHER_RESEARCH_ACTIVITY_ID,
            operate_type: ADVANCE_RESEARCH_OPERATE_TYPE,
            weather_research_operate: { node_id: nodeId },
        })).finish());
        const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body);
        const reply = types.ActivityOperateReply.decode(replyBody);
        pendingSnapshot = null;
        return {
            outcome: 'advanced',
            nodeId,
            activityId: int64String(reply?.activity_id),
            operateType: int64String(reply?.operate_type),
            rewards: node.reward?.id && node.reward.id !== '0' ? [node.reward] : [],
            snapshot: await buildWeatherActivitySnapshot(),
        };
    });
}

networkEvents.on('weatherChanged', () => {
    pendingSnapshot = null;
    friendWeatherCache.clear();
});
networkEvents.on('activitiesChanged', () => {
    pendingSnapshot = null;
});
networkEvents.on('disconnected', () => {
    pendingSnapshot = null;
    pendingFriendScan = null;
    friendWeatherCache.clear();
});

module.exports = {
    WEATHER_GROUP_ID,
    LIGHTNING_MUTANT_CONFIG_ID,
    getWeatherStatus,
    getCurrentWeatherActivity,
    scanWeatherFriends,
    exchangeWeatherCollectorBottle,
    useWeatherCollectorBottle,
    useWeatherSummonBottle,
    useWeatherFrogBottle,
    useWeatherCloudBottle,
    advanceWeatherResearch,
    // Exported for protocol-state regression tests.
    weatherStatusDto,
    weatherAvailability,
};
