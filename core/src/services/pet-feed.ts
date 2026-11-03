export {};

/**
 * 自动喂狗粮。
 *
 * 目标：保持上场宠物的看护时长（protect_time）不低于一周；
 * 不足一周时用背包狗粮补齐；狗粮不足时按开关自动从商城购买狗粮礼包。
 * 检查与喂食节奏固定 1 小时一次，注册定时器时立即执行一次（覆盖上线检查）。
 *
 * 协议依据：
 * - GetDogInfo.protect_time / max_protect_time（看护时长，秒）
 * - DogService.AddFood（pets.useDogFood 封装，含 30 天上限与背包库存校验）
 * - MallService.GetMallListBySlotType / Purchase（商城购买狗粮礼包）
 */

const { isAutomationOn } = require('../models/store');
const { log, logWarn, sleep } = require('../utils/utils');
const { createScheduler } = require('./scheduler');
const { runExclusiveAutomationTask } = require('./automation-lock');
const { getPetInfo, useDogFood, DOG_FOOD_DURATIONS } = require('./pets');
const { getMallGoodsList, purchaseMallGoods, parseMallPriceValue } = require('./mall');
const { getUserState } = require('../utils/network');

const PET_FEED_CHECK_INTERVAL_MS: number = 60 * 60 * 1000;
// 看护时长保底目标：一周
const TARGET_PROTECT_SECONDS: number = 7 * 24 * 60 * 60;
// 单次检查最多购买的狗粮礼包数量，避免余额被连续购买耗空
const MAX_PURCHASE_PER_CHECK: number = 2;
// 单次检查最多执行多少次 AddFood，防御异常数据下的死循环
const MAX_FEED_OPS_PER_CHECK: number = 10;

interface FoodStock {
    id: number;
    duration: number;
    count: number;
}

interface DogFoodPlan {
    feeds: Array<{ id: number; count: number }>;
    sufficient: boolean;
}

const petScheduler = createScheduler('pet');

/**
 * 按缺口规划喂食：优先用大粒度狗粮凑满缺口；大粒度不足时允许用剩余最小粒度
 * 狗粮超出目标补齐（AddFood 本身有 30 天上限保护）。
 * 纯函数，便于单测。
 */
function planDogFoodFeeds(gapSeconds: number, foods: FoodStock[]): DogFoodPlan {
    let remaining: number = Math.max(0, Math.ceil(gapSeconds));
    const feeds: Array<{ id: number; count: number }> = [];
    if (remaining <= 0) return { feeds, sufficient: true };

    const stock: FoodStock[] = (Array.isArray(foods) ? foods : [])
        .map((food: any) => ({
            id: Math.floor(Number(food && food.id) || 0),
            duration: Math.max(0, Math.floor(Number(food && food.duration) || 0)) || (DOG_FOOD_DURATIONS.get(Math.floor(Number(food && food.id) || 0)) || 0),
            count: Math.max(0, Math.floor(Number(food && food.count) || 0)),
        }))
        .filter((food: FoodStock) => food.id > 0 && food.duration > 0 && food.count > 0)
        .sort((a: FoodStock, b: FoodStock) => b.duration - a.duration || a.id - b.id);

    const counts = new Map<number, number>(stock.map((food: FoodStock) => [food.id, food.count]));

    // 第一轮：大粒度优先，每档一次 AddFood 尽量凑满缺口
    for (const food of stock) {
        if (remaining <= 0) break;
        const available: number = counts.get(food.id) || 0;
        if (available <= 0) continue;
        const usable: number = Math.min(available, Math.ceil(remaining / food.duration));
        if (usable <= 0) continue;
        feeds.push({ id: food.id, count: usable });
        remaining -= usable * food.duration;
        counts.set(food.id, available - usable);
    }

    // 第二轮：仍有缺口时，用剩余最小粒度狗粮逐个补（允许超出目标一周）
    for (const food of [...stock].reverse()) {
        if (remaining <= 0) break;
        const available: number = counts.get(food.id) || 0;
        if (available <= 0) continue;
        feeds.push({ id: food.id, count: 1 });
        remaining -= food.duration;
        counts.set(food.id, available - 1);
    }

    return { feeds, sufficient: remaining <= 0 };
}

/** 在商城商品列表里找狗粮礼包：名称含「狗粮」，可用、非广告专属、非分享专属。 */
function findDogFoodMallGoods(goodsList: any[]): any[] {
    const list: any[] = Array.isArray(goodsList) ? goodsList : [];
    return list
        .filter((goods: any) => {
            const name: string = String((goods && goods.name) || '');
            if (!name.includes('狗粮')) return false;
            if (goods && goods.is_available === false) return false;
            if (goods && (goods.ad_only === true || goods.share?.share_only === true)) return false;
            return Math.floor(Number(goods && goods.goods_id) || 0) > 0;
        })
        .sort((a: any, b: any) => parseMallPriceValue(a && a.price) - parseMallPriceValue(b && b.price));
}

/** 当前点券余额是否够买一件商品；价格字段缺失时按可买处理（购买失败会再兜底）。 */
function canAfford(goods: any): boolean {
    const price: number = parseMallPriceValue(goods && goods.price);
    if (price <= 0) return true;
    const ticket: number = Math.max(0, Number((getUserState() || {}).ticket) || 0);
    return ticket <= 0 || ticket >= price;
}

async function buyDogFoodGiftPack(): Promise<boolean> {
    const goodsList: any[] = await getMallGoodsList(1);
    const candidates: any[] = findDogFoodMallGoods(goodsList);
    if (candidates.length === 0) {
        logWarn('宠物', '商城未找到可购买的狗粮礼包', {
            module: 'pet-feed',
            event: '购买狗粮礼包',
            result: 'none',
        });
        return false;
    }
    const goods = candidates[0];
    const goodsId: number = Math.floor(Number(goods.goods_id) || 0);
    if (!canAfford(goods)) {
        logWarn('宠物', `点券余额不足，跳过购买狗粮礼包：${goods.name || goodsId}`, {
            module: 'pet-feed',
            event: '购买狗粮礼包',
            result: 'error',
            goodsId,
        });
        return false;
    }
    try {
        await purchaseMallGoods(goodsId, 1);
        log('宠物', `自动购买狗粮礼包：${goods.name || `#${goodsId}`}`, {
            module: 'pet-feed',
            event: '购买狗粮礼包',
            result: 'ok',
            goodsId,
            goodsName: String(goods.name || ''),
        });
        return true;
    } catch (error: any) {
        logWarn('宠物', `购买狗粮礼包失败: ${goods.name || goodsId}: ${error?.message || error}`, {
            module: 'pet-feed',
            event: '购买狗粮礼包',
            result: 'error',
            goodsId,
            error: String((error && error.message) || error),
        });
        return false;
    }
}

async function feedToTarget(): Promise<{ fed: boolean; protectDuration: number; purchased: number }> {
    let snapshot: any = await getPetInfo();
    let fed: boolean = false;
    let purchased: number = 0;

    for (let op = 0; op < MAX_FEED_OPS_PER_CHECK; op++) {
        if (!snapshot.activeDogId) {
            logWarn('宠物', '当前没有上场宠物，跳过喂狗粮检查', {
                module: 'pet-feed',
                event: '喂狗粮检查',
                result: 'none',
            });
            return { fed, protectDuration: Math.max(0, Number(snapshot.protectDuration) || 0), purchased };
        }

        const protectDuration: number = Math.max(0, Number(snapshot.protectDuration) || 0);
        if (protectDuration >= TARGET_PROTECT_SECONDS) {
            return { fed, protectDuration, purchased };
        }

        const gapSeconds: number = TARGET_PROTECT_SECONDS - protectDuration;
        const bagFoods: FoodStock[] = Array.isArray(snapshot.foods) ? snapshot.foods : [];
        const plan: DogFoodPlan = planDogFoodFeeds(gapSeconds, bagFoods);

        if (!plan.sufficient && isAutomationOn('pet_feed_dog_food_auto_buy')) {
            // 库存不够补满一周：先买礼包再重算（礼包内容入包后才统计得到）。
            // 每次检查最多买 MAX_PURCHASE_PER_CHECK 个，避免余额被连续购买耗空。
            if (purchased >= MAX_PURCHASE_PER_CHECK) {
                logWarn('宠物', `本次检查已购买 ${purchased} 个狗粮礼包仍不足一周，下次检查再补`, {
                    module: 'pet-feed',
                    event: '喂狗粮检查',
                    result: 'none',
                    purchased,
                });
                if (plan.feeds.length === 0) return { fed, protectDuration, purchased };
            } else {
                const bought: boolean = await buyDogFoodGiftPack();
                if (!bought) return { fed, protectDuration, purchased };
                purchased += 1;
                snapshot = await getPetInfo();
                continue;
            }
        }

        if (!plan.sufficient) {
            logWarn('宠物', `背包狗粮不足以补满一周看护（剩余缺口 ${Math.ceil(gapSeconds / 3600)} 小时），且未开启自动购买`, {
                module: 'pet-feed',
                event: '喂狗粮检查',
                result: 'none',
                protectDuration,
            });
            if (plan.feeds.length === 0) return { fed, protectDuration, purchased };
            // 有计划就先把能喂的喂掉
        }

        const step = plan.feeds[0];
        try {
            snapshot = await useDogFood(step.id, step.count);
            fed = true;
        } catch (error: any) {
            logWarn('宠物', `自动喂狗粮失败（${step.id} x${step.count}）: ${error?.message || error}`, {
                module: 'pet-feed',
                event: '喂狗粮',
                result: 'error',
                itemId: step.id,
                count: step.count,
                error: String((error && error.message) || error),
            });
            // 该档喂不进去（库存变化/超上限），换下一档
            snapshot = { ...snapshot, foods: (snapshot.foods || []).map((food: any) => (
                Math.floor(Number(food && food.id) || 0) === step.id ? { ...food, count: 0 } : food)) };
        }
        await sleep(400 + Math.floor(Math.random() * 400));
    }

    return { fed, protectDuration: Math.max(0, Number(snapshot?.protectDuration) || 0), purchased };
}

async function checkAndFeedDogOnce(): Promise<void> {
    if (!isAutomationOn('pet_feed_dog_food')) return;
    try {
        const result = await feedToTarget();
        const days = (result.protectDuration / 86400).toFixed(2);
        if (result.fed || result.purchased > 0) {
            log('宠物', `自动喂狗粮完成${result.purchased > 0 ? `（购买礼包 ${result.purchased} 个）` : ''}，当前看护时长约 ${days} 天`, {
                module: 'pet-feed',
                event: '喂狗粮检查',
                result: 'ok',
                protectDuration: result.protectDuration,
                purchased: result.purchased,
            });
        }
    } catch (error: any) {
        logWarn('宠物', `自动喂狗粮检查失败: ${error?.message || error}`, {
            module: 'pet-feed',
            event: '喂狗粮检查',
            result: 'error',
            error: String((error && error.message) || error),
        });
    }
}

function startPetFeedCheckTimer(): void {
    petScheduler.clear('pet_feed_dog_food_check');
    if (!isAutomationOn('pet_feed_dog_food')) return;
    // runImmediately：注册即执行一次，覆盖「上线时检查」
    petScheduler.setIntervalTask('pet_feed_dog_food_check', PET_FEED_CHECK_INTERVAL_MS, () => {
        runExclusiveAutomationTask('pet_feed_dog_food_check', checkAndFeedDogOnce).catch(() => null);
    }, { runImmediately: true });
}

function stopPetFeedCheckTimer(): void {
    petScheduler.clear('pet_feed_dog_food_check');
}

module.exports = {
    PET_FEED_CHECK_INTERVAL_MS,
    TARGET_PROTECT_SECONDS,
    planDogFoodFeeds,
    findDogFoodMallGoods,
    checkAndFeedDogOnce,
    startPetFeedCheckTimer,
    stopPetFeedCheckTimer,
};
