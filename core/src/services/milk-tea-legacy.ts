/**
 * 奶茶热销中「老版 UI 形状」快照服务。
 *
 * 老版活动页（MilkTeaActivityPanel）消费的 TeaState 形状：
 * 原始协议字段 + 少量装饰（items/costs 补名称图片、goods 补 remaining/affordable 等）。
 * 这里按当前协议字段名（activity_id / operate_type）重建同一形状，
 * 协议数据源与 milk-tea.ts 相同（同一个 gamepb.activitypb 服务）。
 */
import config from '../activity-data/milk-tea-20261015.json';

export {};

const { types } = require('../utils/proto');
const { sendMsgAsync, getUserState } = require('../utils/network');
const { getServerTimeSec, toNum } = require('../utils/utils');
const { getItemById, getItemImageById } = require('../config/gameConfig');
const warehouse = require('./warehouse');
const { util } = require('protobufjs');

const GROUP = '2026110100';
const MAIN = '2026110101';
const SHOP = '2026110102';
const FUND = '2026110103';
const HAPPY = '2026110104';
const SERVICE = 'gamepb.activitypb.ActivityService';

const ACTIONS: Record<string, [number, string]> = {
    create: [53, 'milk_tea_create_shop'], rename: [54, 'milk_tea_rename_shop'],
    shop: [55, 'milk_tea_get_shop'], hireList: [56, 'milk_tea_get_hire_list'],
    hire: [57, 'milk_tea_hire'], workshop: [58, 'milk_tea_get_workshop'],
    cashier: [59, 'milk_tea_claim_cashier'], boost: [60, 'milk_tea_boost'],
    upgrade: [61, 'milk_tea_upgrade'], craft: [62, 'milk_tea_craft'],
    work: [63, 'milk_tea_get_work_page'], wages: [64, 'milk_tea_claim_wages'],
    interact: [65, 'milk_tea_interact'], rank: [66, 'milk_tea_get_rank'],
    sales: [67, 'milk_tea_get_sales_log'], hireDisabled: [68, 'milk_tea_set_hire_disable'],
};
const SHARE_ACTIONS: Record<string, { cmd: number; field: string }> = {
    share: { cmd: 70, field: 'share_reward_share' },
    shareRewards: { cmd: 71, field: 'share_reward_claim_milestones' },
    shareDaily: { cmd: 74, field: 'share_reward_claim_daily' },
};
const READ_ONLY_ACTIONS = new Set(['shop', 'workshop', 'work', 'rank', 'sales', 'hireList']);
const ACTION_LABELS: Record<string, string> = {
    create: '开业', rename: '修改店名', hire: '雇佣员工', cashier: '领取收益', boost: '使用宣传喇叭',
    upgrade: '升级店铺', craft: '制作奶茶', wages: '领取工资', interact: '打工互动',
    hireDisabled: '设置被雇佣状态', buy: '购买商品', share: '首次分享',
    shareDaily: '领取每日快乐值', shareRewards: '领取快乐值奖励', fundRewards: '领取成长基金奖励',
};

function fail(message: string): never { throw new Error(message); }
function list(value: any) { return Array.isArray(value) ? value : []; }
/**
 * 在 group 树里按 activity_id 找节点（递归）。
 * 奶茶组 2026110100 的子活动不一定都在第一层：快乐不独享(0104) 会挂在更深一层，
 * 只查一层 children 会读不到它的 share_reward.summary。
 */
function findGroupNode(nodes: any, activityId: string): any {
    for (const node of list(nodes)) {
        if (String(node?.head?.activity_id) === activityId) return node;
        const found = findGroupNode(node?.children, activityId);
        if (found) return found;
    }
    return null;
}
function plain(type: any, value: any) { return type.toObject(value, { longs: String, defaults: true }); }
/** protobufjs map 字段的 hash 键还原成十进制字符串。 */
function normalizeWireMaps(value: any): any {
    if (Array.isArray(value)) return value.map(normalizeWireMaps);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
        const normalized = key.length === 8 && [...key].some(char => char.charCodeAt(0) < 32)
            ? util.longFromHash(key, false).toString()
            : key;
        return [normalized, normalizeWireMaps(entry)];
    }));
}
function itemDto(value: any) {
    const id = toNum(value?.id);
    return { id: String(id), count: String(toNum(value?.count)), name: getItemById(id)?.name || `物品 #${id}`, image: getItemImageById(id) };
}
/**
 * 原始 protobuf 消息里的 int64 是 { low, high, unsigned } 对象，
 * 直接展开给前端会被渲染成 "[object Object]"（成长基金档位描述、快乐值档位都用得到）。
 */
function int64Value(value: any): number {
    if (value && typeof value === 'object' && 'low' in value) {
        return Number(value.low || 0) + Number(value.high || 0) * 4294967296;
    }
    return toNum(value);
}
/**
 * 把 protobuf int64 可能出现的各种形态（Long / {low,high} / number / string）
 * 统一成十进制字符串，用于商品编号这类必须精确匹配的字段。
 */
function idText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'object') {
        if ('low' in value) return String(int64Value(value));
        const text = typeof value.toString === 'function' ? value.toString() : '';
        return text && text !== '[object Object]' ? text : '';
    }
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
}
/**
 * 配方配置里的 drink_icon 是游戏资源路径（gui/texture/icon/icon_s4_milktea_1/spriteFrame），
 * 前端只有 config.image 一个入口。这里按原名映射到本地素材 /activity/milk-tea/<name>.png，
 * 让在售库存 / 配方列表 / 制作弹窗都显示对应品种的杯子图标（而不是共用一张主视觉图）。
 */
function recipeImageFromIcon(icon: any): string {
    const matched = /(\w+)\/spriteFrame$/.exec(String(icon || ''));
    return matched ? `/activity/milk-tea/${matched[1]}.png` : '';
}
function withRecipeImage(row: any): any {
    if (!row) return row;
    return { ...row, image: recipeImageFromIcon(row.drink_icon) };
}
function phase(now: number, window: { startTime: number; settleTime: number; endTime: number }) {
    if (![now, window.startTime, window.settleTime, window.endTime].every(Number.isFinite)
        || window.startTime <= 0 || window.settleTime < window.startTime || window.endTime < window.settleTime)
        return 'ended';
    return now < window.startTime ? 'upcoming' : now > window.endTime ? 'ended' : now >= window.settleTime ? 'settling' : 'business';
}
/** 官方 S4ShopUI 排序：可兑换 → 售罄 → 未解锁，再按配置 order。 */
function compareShopGoods(a: any, b: any) {
    const group = (goods: any) => !goods.unlocked ? 3 : goods.remaining != null && Number(goods.remaining) === 0 ? 2 : 1;
    return group(a) - group(b) || Number(a.order || 0) - Number(b.order || 0);
}
function available(costs: any[], inventory: any[], count = 1) {
    return costs.length > 0 && costs.every((cost: any) => toNum(cost.id) !== 1004 && BigInt(toNum(cost.count) || 0) > 0n
        && inventory.filter((x: any) => String(x.id) === String(cost.id))
            .reduce((sum: bigint, x: any) => sum + BigInt(toNum(x.count) || 0), 0n) >= BigInt(toNum(cost.count) || 0) * BigInt(count));
}
function maximumPurchase(goods: any, inventory: any[]) {
    if (!goods.unlocked || goods.paid || !goods.costs.length) return 0;
    // remaining = null 表示官方没设限购（purchase_limit <= 0），只受余额约束。
    let maximum = goods.remaining == null ? BigInt(Number.MAX_SAFE_INTEGER) : BigInt(goods.remaining);
    for (const cost of goods.costs) {
        if (toNum(cost.id) === 1004 || BigInt(toNum(cost.count) || 0) <= 0n) return 0;
        const owned = inventory.filter((item: any) => String(item.id) === String(cost.id))
            .reduce((sum: bigint, item: any) => sum + BigInt(toNum(item.count) || 0), 0n);
        const affordable = owned / BigInt(toNum(cost.count) || 1);
        if (affordable < maximum) maximum = affordable;
    }
    return Number(maximum);
}
function normalizeHireOptions(input: any = {}) {
    const primaryInput = input.primaryTalentId ?? input.talentId;
    const backupInput = input.backupTalentId;
    const primaryTalentId = [0, 9001, 9002, 9003, 9004].includes(Number(primaryInput)) ? Number(primaryInput) : 0;
    return {
        durationId: [1, 2, 3].includes(Number(input.durationId)) ? Number(input.durationId) : 1,
        primaryTalentId,
        backupTalentId: primaryTalentId === 0 ? 0
            : ([0, 9001, 9002, 9003, 9004].includes(Number(backupInput)) ? Number(backupInput) : 0),
        talentId: primaryTalentId,
    };
}
function selectHireCandidate(candidates: any, input: any, now: number) {
    const { primaryTalentId, backupTalentId } = normalizeHireOptions(input);
    const idle = (entry: any) => entry?.friend?.gid && toNum(entry.state) === 0
        && toNum(entry.state_until_at || 0) <= now && toNum(entry.rehire_available_at || 0) <= now;
    const friends = list(candidates.friends).filter((entry: any) => !entry.is_robot && idle(entry));
    const robots = list(candidates.robots).filter(idle);
    const findByTalent = (talentId: number) => talentId === 9004
        ? robots[0]
        : talentId === 0
            ? (friends[0] || robots[0])
            : friends.find((entry: any) => toNum(entry.talent_id) === talentId);
    return findByTalent(primaryTalentId) || (backupTalentId !== primaryTalentId ? findByTalent(backupTalentId) : undefined);
}

async function groupChildren() {
    const body = types.GetGroupRequest.encode({ group_id: GROUP }).finish();
    const reply = await sendMsgAsync(SERVICE, 'GetGroup', body);
    const group = types.MilkTeaGetGroupReply.decode(reply.body).group;
    if (String(group?.head?.activity_id) !== GROUP) fail('未读取到奶茶热销中活动');
    return list(group.children);
}
/** milk_tea 子活动的 Operate 请求（读/写共用）。 */
async function op(action: string, params: any = {}) {
    const entry = ACTIONS[action];
    if (!entry) fail('活动操作无效');
    const [cmd, field] = entry;
    const request = { activity_id: MAIN, operate_type: cmd, [field]: params };
    const reply = await sendMsgAsync(SERVICE, 'Operate', types.MilkTeaOperateRequest.encode(request).finish());
    const decoded = types.MilkTeaOperateReply.decode(reply.body);
    if (String(decoded.activity_id) !== MAIN || toNum(decoded.operate_type) !== cmd || !decoded[field]) {
        fail('活动响应不匹配，请刷新后查看');
    }
    // 老版 rpc() 统一对整个应答套 normalizeWireMaps：protobufjs map<int64,…> 字段
    // （如营业记录 cups_by_recipe）的 hash 键必须还原成十进制字符串，
    // 否则前端拿到的键是乱码、配方查找失败，营业记录表格数据残缺。
    return normalizeWireMaps(plain(types.MilkTeaOperateReply, { [field]: decoded[field] }))[field];
}
/** 快乐不独享（2026110104）的分享类请求走通用 ActivityOperate。 */
async function shareOp(action: string) {
    const entry = SHARE_ACTIONS[action];
    const request = { activity_id: HAPPY, operate_type: entry.cmd, [entry.field]: {} };
    const reply = await sendMsgAsync(SERVICE, 'Operate', types.AutumnOperateRequest.encode(request).finish());
    const decoded = types.ActivityOperateReply.decode(reply.body);
    if (String(decoded.activity_id) !== HAPPY || toNum(decoded.operate_type) !== entry.cmd || !decoded[entry.field]) {
        fail('活动响应不匹配，请刷新后查看');
    }
    return normalizeWireMaps(plain(types.ActivityOperateReply, { [entry.field]: decoded[entry.field] }))[entry.field];
}
async function bag() {
    const inventory = [...list(warehouse.getBagItems(await warehouse.getBag()))];
    // 基础货币可能只在账号状态里而不在背包回包里。
    const account = getUserState() || {};
    if (!inventory.some((item: any) => String(item.id) === '1001') && account.gold != null)
        inventory.push({ id: '1001', count: String(toNum(account.gold)) });
    return inventory;
}

let pendingRead: Promise<any> | null = null;
let mutationTail: Promise<any> = Promise.resolve();

async function read() {
    const children = await groupChildren();
    const entry = children.find((x: any) => String(x.head?.activity_id) === MAIN);
    if (!entry?.milk_tea?.summary) fail('活动协议读取失败');
    const head = entry.head;
    const now = getServerTimeSec();
    const window = { startTime: toNum(head.begin_time), settleTime: toNum(head.settle_start_time), endTime: toNum(head.end_time) };
    if (!window.startTime || !window.endTime || !window.settleTime) fail('活动时间无效');
    const summary = plain(types.MilkTeaGetGroupReply, { group: { children: [entry] } }).group.children[0].milk_tea.summary;
    const state: any = {
        id: MAIN, title: String(head.name || '奶茶热销中'), ...window, serverTime: now,
        phase: phase(now, window), summary, rules: String(head.desc || ''),
    };
    if (!['business', 'settling'].includes(state.phase)) return state;
    const opened = toNum(summary.shop_open_at) > 0;
    const shop = opened ? await op('shop') : { shop: null };
    const workshop = opened ? await op('workshop') : { recipes: [] };
    const work: any = await op('work');
    const inventory = await bag();
    const recipes = list(workshop.recipes).map((recipe: any) => {
        const row: any = config.MilkTeaRecipeConfig.find((x: any) => String(x.recipe_id) === String(recipe.recipe_id));
        return {
            ...recipe, config: withRecipeImage(row),
            fruits: inventory.filter((x: any) => String(x.id) === String(row?.fruit_item_id?.split(':')[0]))
                .map((x: any) => ({ ...itemDto(x), uid: String(x.uid) })),
        };
    });
    const goods = list(children.find((x: any) => String(x.head?.activity_id) === SHOP)?.shop?.goods).map((g: any) => {
        const limit = toNum(g.purchase_limit);
        return {
            // 这里是整棵树里唯一没走 plain() 的节点：protobuf 的 int64 解码后是 Long 对象，
            // 经 worker IPC / res.json 序列化会变成 {low,high,unsigned}，前端拿到 goods.id
            // 就是 “[object Object]”，兑换时再传回来永远匹配不到商品（手动购买必失败）。
            // 所以像老版 normalizeGoods 一样，把商品字段一次性收敛成 string / number。
            id: idText(g.id),
            name: String(g.name || ''),
            desc: String(g.desc || ''),
            category_tag: String(g.category_tag || ''),
            order: toNum(g.order),
            purchase_limit: limit,
            purchased_count: toNum(g.purchased_count),
            restriction_type: toNum(g.restriction_type),
            diamond_cost_count: toNum(g.diamond_cost_count),
            background_type: toNum(g.background_type),
            items: list(g.item).map(itemDto),
            costs: list(g.cost).map(itemDto),
            cond_hints: list(g.cond_hints).map((x: any) => ({
                cond_type: String(x?.cond_type || ''), params: String(x?.params || ''),
                satisfied: !!x?.satisfied, current: toNum(x?.current), target: toNum(x?.target),
            })),
            // 老版口径：purchase_limit > 0 才是有限限购，0 表示不限购（remaining = null）。
            remaining: limit > 0 ? Math.max(0, limit - toNum(g.purchased_count)) : null,
            unlocked: list(g.cond_hints).every((x: any) => !!x.satisfied),
            affordable: available(list(g.cost), inventory),
            paid: toNum(g.diamond_cost_count) > 0 || list(g.cost).some((x: any) => toNum(x.id) === 1004),
            maxPurchasable: 0,
        };
    });
    for (const good of goods) good.maxPurchasable = state.phase !== 'business' && good.category_tag === 'seed' ? 0 : maximumPurchase(good, inventory);
    goods.sort(compareShopGoods);
    // QQ 原生订阅链接带签名，不下发到 web 与日志。
    delete work.hire_subscribe_qq_jump_url;
    delete work.hire_subscribe_template_id;
    const shareNode = findGroupNode(children, HAPPY);
    const fundNode = findGroupNode(children, FUND);
    const share = shareNode?.share_reward?.summary;
    const fund = fundNode?.growth_fund;
    // 奶茶组的节点结构（MilkTeaActivityData）里没有 share_reward 字段，快乐不独享
    // 拿不到 summary。老版面板这里一直是「尚未读取到快乐值活动数据」。
    // 分享奖励服务用 activitypb 的 ActivityData（含 tag 120）能读到，这里回退取一次并映射成面板形状。
    let shareFallback: any = null;
    if (!share) {
        const shareReward = require('./share-reward-activity');
        const detail = await shareReward.getShareRewardActivity(HAPPY).catch(() => null);
        if (detail?.active) {
            shareFallback = {
                current_score: String(detail.score ?? 0),
                score_item_id: String(detail.scoreItemId ?? 0),
                daily_reward: String(detail.dailyReward ?? 0),
                first_share_reward: String(detail.firstShareReward ?? 0),
                daily: {
                    claimed_count: String(detail.claimedCount ?? 0),
                    claim_limit: String(detail.claimLimit ?? 0),
                    daily_reward_claimed: detail.canClaimDaily === false,
                    first_share_awarded: detail.firstShareAwarded === true,
                },
                my_pool: {
                    claimed_count: String(detail.poolClaimedCount ?? 0),
                    claim_limit: String(detail.poolClaimLimit ?? 0),
                },
                milestones: list(detail.milestones).map((tier: any) => ({
                    tier_id: toNum(tier.id),
                    threshold: toNum(tier.threshold),
                    state: toNum(tier.state),
                    rewards: list(tier.rewards).map(itemDto),
                })),
            };
        }
    }
    const levels = (config.MilkTeaStoreLevelConfig as any[]).map((level: any) => ({
        ...level,
        rewards: String(level.rewards || '').split(';').filter(Boolean).map((pair: string) => {
            const [id, count] = pair.split(':');
            return itemDto({ id, count });
        }),
        recipe_names: String(level.recipe_ids_string || '').split(';').map((id: string) =>
            (config.MilkTeaRecipeConfig as any[]).find((recipe: any) => String(recipe.recipe_id) === id)?.recipe_name).filter(Boolean),
    }));
    const shareView = share
        ? { ...plain(types.MilkTeaGetGroupReply, { group: { children: [shareNode] } }).group.children[0].share_reward.summary, milestones: list(share.milestones).map((tier: any) => ({ ...tier, tier_id: int64Value(tier.tier_id), threshold: int64Value(tier.threshold), state: int64Value(tier.state), rewards: list(tier.rewards).map(itemDto) })) }
        : (shareFallback || null);
    const fundView = fund ? {
        ...plain(types.MilkTeaGetGroupReply, { group: { children: [fundNode] } }).group.children[0].growth_fund,
        unlock_cost: list(fund.unlock_cost).map(itemDto),
        tiers: list(fund.tiers).map((tier: any) => ({
            ...tier,
            tier_id: int64Value(tier.tier_id),
            state: int64Value(tier.state),
            conditions: list(tier.conditions).map((condition: any) => ({
                ...condition,
                current_value: int64Value(condition.current_value),
                target_value: int64Value(condition.target_value),
            })),
            reward: list(tier.reward).map(itemDto),
        })),
    } : null;
    return {
        ...state, share: shareView, fund: fundView, shop: shop.shop, recipes, work, goods,
        balances: ['1001', '1004', '1041', '1042'].map((id: string) => itemDto({
            id,
            count: inventory.filter((x: any) => String(x.id) === id).reduce((sum: bigint, x: any) => sum + BigInt(toNum(x.count) || 0), 0n).toString(),
        })),
        levels, durations: config.MilkTeaHireDurationConfig, interactions: config.MilkTeaInteractionType,
    };
}

function getMilkTea() {
    if (!pendingRead) pendingRead = read().finally(() => { pendingRead = null; });
    return pendingRead;
}

const skippedLogs = new Map<string, number>();

async function mutate(action: string, input: any = {}) {
    if (!ACTIONS[action] && !['buy', 'share', 'shareDaily', 'shareRewards', 'fundRewards'].includes(action))
        fail('活动操作无效');
    const state = await getMilkTea();
    const inventory = await bag();
    const now = getServerTimeSec();
    state.phase = phase(now, state);
    if (!['business', 'settling'].includes(state.phase)) fail('活动未开始或已结束');
    if (state.phase !== 'business' && !['cashier', 'wages', 'buy', 'share', 'shareDaily', 'shareRewards', 'fundRewards'].includes(action))
        fail('结算期不支持此操作');
    if (!['create', 'share', 'shareDaily', 'shareRewards', 'fundRewards'].includes(action) && !toNum(state.summary.shop_open_at))
        fail('请先开业');
    let params: any = {};
    let detail: any = {};
    if (action === 'create' || action === 'rename') {
        const name = String(input.shopName || '').trim();
        const cfg: any = (config.MilkTeaActivityConfig as any[])[0];
        if ([...name].length < cfg.name_min_length || [...name].length > cfg.name_max_length || /[<>]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32))
            fail('店名需为2至8个字符');
        if (action === 'create' && toNum(state.summary.shop_open_at)) fail('店铺已开业');
        if (action === 'rename' && now < toNum(state.summary.rename_cd_until_at)) fail('店名修改冷却中');
        params = { shop_name: name };
    }
    if (action === 'cashier' && !list(state.shop?.pending_rewards).some((x: any) => BigInt(toNum(x.count) || 0) > 0n))
        fail('暂无可领取收益');
    if (action === 'wages' && !state.summary.has_unclaimed_wage) fail('暂无可领取工资');
    if (action === 'upgrade' && (!state.summary.can_upgrade || BigInt(toNum(state.shop?.total_revenue) || 0) < BigInt(toNum(state.shop?.next_level_revenue) || 0) || !toNum(state.shop?.next_level_revenue)))
        fail('营业额未达到升级要求');
    if (action === 'boost') {
        const count = Number(input.count ?? 1);
        if (!Number.isSafeInteger(count) || count < 1 || !available([{ id: state.shop.sales_item_id, count: '1' }], inventory, count))
            fail('宣传喇叭数量不足');
        params = { count };
    }
    if (action === 'craft') {
        const eligible = new Set(state.recipes.filter((x: any) => x.unlocked && x.is_advanced).map((x: any) => x.config?.fruit_item_id?.split(':')[0]));
        const fruits = inventory.filter((x: any) => eligible.has(String(x.id)) && BigInt(toNum(x.count) || 0) > 0n && toNum(x.uid) > 0);
        const wanted = input.fruitUids == null
            ? fruits.map((x: any) => String(x.uid))
            : list(input.fruitUids).map((x: any) => {
                const uid = String(x).trim();
                if (!/^\d+$/.test(uid)) fail('果实UID无效');
                return uid;
            });
        if (!wanted.length || wanted.some((uid: string) => !fruits.some((x: any) => String(x.uid) === uid)))
            fail('没有可加工的已解锁活动果实');
        params = { fruit_uids: [...new Set(wanted)] };
    }
    if (action === 'hire') {
        const duration = (config.MilkTeaHireDurationConfig as any[]).find((x: any) => x.duration_id === Number(input.durationId || 1));
        if (!duration || state.settleTime - now < toNum(duration.min_remaining_business_sec)) fail('剩余营业时间不足');
        const slot = Number(input.slotIndex ?? 0);
        const count = (config.MilkTeaStoreLevelConfig as any[]).find((x: any) => x.level === toNum(state.shop.level))?.employee_slot_count || 0;
        if (!Number.isInteger(slot) || slot < 0 || slot >= count || list(state.shop.slots).some((x: any) => toNum(x.slot_index) === slot && toNum(x.end_at) > now))
            fail('员工位置不可用');
        const candidates = await op('hireList', { duration_id: duration.duration_id });
        const target = input.autoSelect === true
            ? selectHireCandidate(candidates, input, now)
            : input.targetGid == null
                ? list(candidates.robots).find((x: any) => toNum(x.state) === 0)
                : [...list(candidates.friends), ...list(candidates.robots)]
                    .find((x: any) => String(x.friend?.gid) === String(input.targetGid) && toNum(x.state) === 0);
        if (!target && input.autoSelect === true) return { ok: true, skipped: true, reason: '没有符合策略的空闲员工' };
        if (!target || !available([{ id: '1041', count: candidates.wage_total }], inventory))
            fail('没有可雇佣员工或奶茶券不足');
        const hireOptions = normalizeHireOptions(input);
        detail = {
            // \p{Cc}（Unicode 控制类）含 C0 U+0000–U+001F、U+007F–U+009F，比手写区间更彻底，
            // 也避开 no-control-regex 规则；名字里出现控制字符只可能是脏数据。
            employeeName: String(target.friend.name || '').replace(/\p{Cc}/gu, '').slice(0, 60),
            slotIndex: slot, durationId: duration.duration_id, hours: toNum(duration.duration_sec) / 3600,
            talentId: toNum(target.talent_id), employeeType: target.is_robot ? '实习员工' : '好友',
            fallbackUsed: input.autoSelect === true && hireOptions.primaryTalentId !== 0 && toNum(target.talent_id) !== hireOptions.primaryTalentId,
            wage: String(candidates.wage_total),
        };
        params = { hires: [{ slot_index: slot, duration_id: duration.duration_id, target_gid: String(target.friend.gid) }] };
    }
    if (action === 'interact') {
        const shift = state.work?.my_shift;
        if (!shift || toNum(shift.begin_at) > now || toNum(shift.end_at) <= now || state.work.interact_done || toNum(shift.interact_count) >= toNum(shift.interact_limit))
            fail('当前班次不可互动');
        const type = Number(input.interactionType);
        if (!(config.MilkTeaInteractionType as any[]).some((x: any) => x.interaction_id === type)) fail('互动类型无效');
        params = { target_gid: String(shift.employer?.gid || ''), interaction_type: type };
    }
    if (READ_ONLY_ACTIONS.has(action)) fail('只读动作请使用查询接口');
    if (action === 'hireDisabled') params = { hire_disabled: input.disabled === true };
    if (['share', 'shareDaily', 'shareRewards', 'fundRewards'].includes(action)) {
        if (action === 'share') {
            if (state.share?.daily?.first_share_awarded) fail('首次分享奖励今日已领取');
            await shareOp('share');
        } else {
            if (action === 'shareDaily' && (!state.share?.daily || state.share.daily.daily_reward_claimed)) fail('今日已领取');
            if (action === 'shareRewards' && !state.share?.milestones?.some((x: any) => toNum(x.state) === 2)) fail('暂无可领取档位');
            if (action === 'fundRewards') {
                if (!state.fund?.unlocked) fail('尚未购买成长基金');
                if (!state.fund.tiers.some((x: any) => toNum(x.state) === 2)) fail('暂无可领取基金奖励');
            }
            if (action === 'fundRewards') {
                await opWith(FUND, 76, 'growth_fund_claim', {});
            } else {
                await shareOp(action);
            }
        }
    } else if (action === 'buy') {
        // goodsId 兼容 string / number / Long / {low,high}：前端经过一次 JSON 往返，
        // 老版本缓存也可能带着 Long 对象，这里统一按十进制字符串比对。
        const wantedId = idText(input.goodsId);
        const goods = state.goods.find((x: any) => String(x.id) === wantedId);
        const count = Number(input.count ?? 1);
        // 逐项给出原因：合成一句「商品未解锁、限购已用完或资源不足」时，
        // 用户无法判断到底卡在哪一条，也不知道该刷新、攒券还是放弃。
        if (!goods) fail('商品不存在或已下架，请刷新兑换商店');
        if (!Number.isSafeInteger(count) || count < 1) fail('兑换数量无效');
        if (goods.paid) fail('该商品不支持钻石购买');
        if (!goods.unlocked) {
            const unmet = list(goods.cond_hints).find((x: any) => !x.satisfied);
            fail(unmet?.cond_type === 'milk_tea_store_level' && toNum(unmet?.target) > 0
                ? `店铺 ${toNum(unmet.target)} 级解锁`
                : '商品解锁条件未达成');
        }
        const remaining = goods.remaining == null ? null : toNum(goods.remaining);
        if (remaining !== null && remaining <= 0) fail('该商品限购已用完');
        if (remaining !== null && count > remaining) fail(`购买数量超过剩余限购（剩余 ${remaining}）`);
        if (!available(goods.costs, inventory, count)) fail('奶茶券或道具数量不足');
        if (state.phase !== 'business' && goods.category_tag === 'seed') fail('结算期不能购买活动种子');
        await opWith(SHOP, 1, 'shop_buy', { goods_id: String(goods.id), count });
    } else {
        const result = await op(action, params);
        if (action === 'hire' && (!list(result.results).length || list(result.results).some((entry: any) => !entry.success)))
            fail('雇佣失败，请刷新员工列表后重试');
    }
    pendingRead = null;
    return { ok: true, detail, activity: await getMilkTea() };
}

/** 其它子活动（兑换商店/成长基金）的 Operate。 */
async function opWith(id: string, cmd: number, field: string, params: any) {
    const request = { activity_id: id, operate_type: cmd, [field]: params };
    const reply = await sendMsgAsync(SERVICE, 'Operate', types.MilkTeaOperateRequest.encode(request).finish());
    const decoded = types.MilkTeaOperateReply.decode(reply.body);
    if (String(decoded.activity_id) !== id || toNum(decoded.operate_type) !== cmd || !decoded[field]) {
        fail('活动响应不匹配，请刷新后查看');
    }
    return normalizeWireMaps(plain(types.MilkTeaOperateReply, { [field]: decoded[field] }))[field];
}

const { log } = require('../utils/utils');

function operateMilkTea(action: string, params: any) {
    const run = async () => {
        const label = ACTION_LABELS[action] || '未知操作';
        const meta = { module: 'activity', event: `奶茶热销中${label}` };
        try {
            const result = await mutate(action, params);
            if (result.skipped) {
                const now = getServerTimeSec();
                if (!skippedLogs.has(action) || now - (skippedLogs.get(action) || 0) >= 600) {
                    log('活动', `奶茶热销中${label}跳过：${result.reason}`, { ...meta, result: 'skip' });
                    skippedLogs.set(action, now);
                }
            } else {
                skippedLogs.delete(action);
                const detail = result.detail || {};
                const hire = action === 'hire'
                    ? `：${detail.employeeType}${detail.employeeName ? `「${detail.employeeName}」` : ''}，${(config.MilkTeaTalentConfig as any[]).find((x: any) => x.talent_id === detail.talentId)?.talent_name || '未知类型'}，${detail.hours}小时，奶茶券${detail.wage}${detail.fallbackUsed ? '（已兜底）' : ''}`
                    : '';
                log('活动', `奶茶热销中${label}完成${hire}`, { ...meta, result: 'success', ...detail });
            }
            return result;
        } catch (error: any) {
            log('活动', `奶茶热销中${label}失败：${String(error?.message || error)}`, { ...meta, result: 'error' });
            throw error;
        }
    };
    const result = mutationTail.then(run);
    mutationTail = result.catch(() => {});
    return result;
}

async function milkTeaRecords(kind: string, input: any = {}) {
    const state = await getMilkTea();
    if (!['business', 'settling'].includes(state.phase)) fail('活动无效');
    if (kind === 'rank') return op('rank', { page: Math.max(1, Math.min(100, Number(input.page) || 1)) });
    if (kind === 'sales') {
        const salesLog: any = await op('sales', { day: Number(input.day) || 0 });
        const rewards = list(salesLog.items).map(itemDto);
        for (const [id, count] of [['1041', salesLog.token], ['1001', salesLog.coin]] as Array<[string, any]>) {
            if (BigInt(toNum(count) || 0) > 0n && !rewards.some((item: any) => String(item.id) === id))
                rewards.unshift(itemDto({ id, count }));
        }
        return {
            ...salesLog, rewards,
            drinks: Object.entries(salesLog.cups_by_recipe || {}).map(([id, cups]) => {
                const recipe = (config.MilkTeaRecipeConfig as any[]).find((item: any) => String(item.recipe_id) === id);
                return { recipe_id: id, cups, name: recipe?.recipe_name || '', image: recipe?.image || '' };
            }),
        };
    }
    if (kind === 'hireList') return op('hireList', { duration_id: Number(input.durationId) || 1 });
    fail('查询类型无效');
}

module.exports = { getMilkTea, operateMilkTea, milkTeaRecords };
