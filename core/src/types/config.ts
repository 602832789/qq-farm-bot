export {};
export type PlantingStrategy =
  | 'preferred'
  | 'level'
  | 'max_exp'
  | 'max_fert_exp'
  | 'max_profit'
  | 'max_fert_profit'
  | 'bag_priority';

export type BagSeedFallbackStrategy = Exclude<PlantingStrategy, 'bag_priority'>;

export type FertilizerMode = 'both' | 'normal' | 'organic' | 'smart' | 'none';

export type FertilizerLandType = 'blue-crystal' | 'purple-gold' | 'gold' | 'black' | 'red' | 'normal';

export interface AutomationConfig {
  farm: boolean;
  farm_harvest_tiangong: boolean;
  farm_push: boolean;
  land_upgrade: boolean;
  friend: boolean;
  friend_auto_accept: boolean;
  friend_help_exp_limit: boolean;
  friend_steal: boolean;
  friend_help: boolean;
  friend_bad: boolean;
  friend_help_protect_dog_ignore_exp_limit: boolean;
  task: boolean;
  fertilizer_gift: boolean;
  fertilizer_buy_organic: boolean;
  fertilizer_buy_normal: boolean;
  mystery_shop_auto_buy: boolean;
  mystery_shop_allow_gold: boolean;
  mystery_shop_allow_coupon: boolean;
  mystery_shop_allow_gold_bean: boolean;
  mystery_shop_allow_diamond: boolean;
  mystery_shop_arrival_notify: boolean;
  mystery_shop_purchase_notify: boolean;
  sell: boolean;
  fertilizer: FertilizerMode;
  fertilizer_multi_season: boolean;
  fertilizer_land_types: FertilizerLandType[];
  fertilizer_smart_seconds: number;
  skip_own_weed_bug: boolean;
  show_manual_fertilizer: boolean;

  // ---- 宠物（自动喂狗粮） ----
  pet_feed_dog_food: boolean;
  pet_feed_dog_food_auto_buy: boolean;

  // ---- 收藏图鉴（每天检查一次） ----
  illustrated_auto_claim_rewards: boolean;
  illustrated_auto_buy_missing_seeds: boolean;
  illustrated_buy_skip_bag: boolean;

  // ---- 活动自动化（旧版功能模块「日常与活动」） ----
  task_after_farm: boolean;
  fertilizer_2x2_ripen: boolean;
  friend_golden_bug: boolean;
  golden_bug_clear: boolean;
  mall_coupon_gift_buy: boolean;

  // 观星 / 星砂集市 / 节气
  star_passport_claim: boolean;
  star_solar_claim: boolean;
  star_solar_quiz_claim: boolean;
  star_record_claim: boolean;
  // 青莓酒馆
  qingmei_seed_claim: boolean;
  qingmei_wine_brew: boolean;
  // 七夕
  qixi_dew_use: boolean;
  qixi_bridge_build: boolean;
  qixi_sachet_gift: boolean;
  qixi_friend_priority: number[];
  // 雨落成诗
  rain_poem_bottle_buy: boolean;
  rain_poem_weather_collect: boolean;
  rain_poem_summon_use: boolean;
  rain_poem_prank_use: boolean;
  rain_poem_research_unlock: boolean;
  // 公益红花
  charity_flower_share_claim: boolean;
  charity_flower_donate: boolean;
  charity_flower_reward_claim: boolean;
  charity_flower_public_fund_claim: boolean;
  // 许愿签
  wish_sign_draw: boolean;
  wish_sign_choice: number;
  wish_sign_claim: boolean;
  // 分享奖励
  share_reward_share: boolean;
  share_reward_daily: boolean;
  share_reward_milestones: boolean;
  // 萌宠成长日记
  pet_diary_adopt: boolean;
  pet_diary_feed: boolean;
  pet_diary_draw: boolean;
  pet_diary_story_claim: boolean;
  pet_diary_seed_claim: boolean;
  pet_diary_solar_claim: boolean;
  pet_diary_treasure_open: boolean;
  pet_diary_compensation_claim: boolean;
  pet_diary_charm_equip: boolean;
  pet_diary_battle: boolean;
  // 奶茶店
  milk_tea_share: boolean;
  milk_tea_share_daily: boolean;
  milk_tea_share_rewards: boolean;
  milk_tea_fund_rewards: boolean;
  milk_tea_cashier: boolean;
  milk_tea_wages: boolean;
  milk_tea_upgrade: boolean;
  milk_tea_craft: boolean;
  milk_tea_boost: boolean;
  milk_tea_interact: boolean;
  milk_tea_interaction_type: number;
  milk_tea_hire: boolean;
  milk_tea_hire_duration: number;
  milk_tea_hire_talent: number;
  milk_tea_hire_primary_talent: number;
  milk_tea_hire_backup_talent: number;
  milk_tea_seed_buy: boolean;
  /** 仅在 milk_tea_seed_buy 开启时生效：默认不买金币果/经验蘑菇种子。 */
  milk_tea_seed_buy_coin: boolean;
  milk_tea_seed_buy_exp: boolean;
  /** 兑换商店化肥：两个独立开关，不受其它开关影响。 */
  milk_tea_fertilizer_buy_normal: boolean;
  milk_tea_fertilizer_buy_organic: boolean;
  milk_tea_auto_open: boolean;
  milk_tea_work_interaction_type: number;
  milk_tea_seed_policy: Record<string, unknown>;
  milk_tea_hire_policy: Record<string, unknown>;
}

export interface IntervalConfig {
  farm: number;
  farmMin: number;
  farmMax: number;
  friendMin: number;
  friendMax: number;
  helpMin: number;
  helpMax: number;
  stealMin: number;
  stealMax: number;
  [key: string]: number;
}

export interface QuietHoursConfig {
  enabled: boolean;
  start: string;
  end: string;
  continueFarm: boolean;
}

/** 宠物资本模式：成熟前 leadSeconds 秒自动派出守护宠物，收获 5 秒后召回。 */
export interface CapitalModeConfig {
  enabled: boolean;
  dogId: number;
  leadSeconds: number;
}

export interface AccountConfig {
  automation: AutomationConfig;
  plantingStrategy: PlantingStrategy;
  preferredSeedId: number;
  /** 宠物资本模式：按作物成熟时间自动派出守护宠物。 */
  capitalMode: CapitalModeConfig;
  intervals: IntervalConfig;
  friendQuietHours: QuietHoursConfig;
  knownFriendGids: number[];
  knownFriendGidSyncCooldownSec: number;
  friendsListCacheTtlSec: number;
  friendBlacklist: number[];
  plantBlacklist: number[];
  stealDelaySeconds: number;
  plantOrderRandom: boolean;
  plantDelaySeconds: number;
  fertilizerBuyOrganicCount: number;
  fertilizerBuyOrganicThresholdHours: number;
  fertilizerBuyNormalCount: number;
  fertilizerBuyNormalThresholdHours: number;
  fertilizerBuyCheckIntervalMinutes: number;
  /** 每天检查邮箱奖励的时间（0-23 点，默认 10 点）；到点后每天只触发一次。 */
  emailClaimHour: number;
  /** 放黄金虫时背包里保留不投放的数量。 */
  goldenBugKeepCount: number;
  /** 放黄金虫单轮最多投放个数（1-100）。 */
  goldenBugRoundLimit: number;
  bagSeedPriority: number[];
  /** 是否为明确排在前面的多格背包种子保留尚未连成布局的空地。 */
  bagSeedMultiLandReservationEnabled: boolean;
  /** seedId -> 允许种植的土地类型。缺 key 视为不限制。 */
  bagSeedLandTypes: Record<string, FertilizerLandType[]>;
  bagSeedFallbackStrategy: BagSeedFallbackStrategy;
  /** 选种时把多格（2×2）作物排在单格作物前面。 */
  prioritize2x2Crops: boolean;
  autoAcceptFriendMinLevel: number;
  autoAcceptRequireOwnLevel: boolean;
  autoAcceptHarvestStealEnabled: boolean;
  autoAcceptHarvestStealHarvest: number;
  autoAcceptHarvestStealSteal: number;
}

export interface OfflineReminder {
  channel: string;
  endpoint: string;
  token: string;
  secret: string;
  title: string;
  msg: string;
  offlineDeleteSec: number;
}

export interface UIConfig {
  theme: 'light' | 'dark';
}

export interface LoginSettings {
  wechatQrLogin: boolean;
  qqQrLogin: boolean;
  napCatEndpoint: string;
  napCatSignature: string;
}

export interface DeviceInfo {
  os: string;
  clientVersion: string;
  sysSoftware: string;
  network: string;
  memory: string;
  deviceId: string;
  userAgent: string;
}

export interface AutoCodeRefreshConfig {
  /** 掉线重登：账号掉线后等待一段时间自动续期并重登。 */
  offlineEnabled: boolean;
  offlineDelaySeconds: number;
}

export interface SystemConfig {
  serverUrl: string;
  clientVersion: string;
  clientVersionUpdatedAt?: number;
  wxClientVersion: string;
  wxClientVersionUpdatedAt?: number;
  platform: string;
  os: string;
  timeZone: string;
  deviceInfo: DeviceInfo;
  autoCodeRefresh?: AutoCodeRefreshConfig;
  /** 服务启动后自动登录已保存的账号（默认开启）。 */
  autoStartAccounts?: boolean;
}

export interface GlobalConfig {
  accountConfigs: Record<string, AccountConfig>;
  defaultAccountConfig: AccountConfig;
  ui: UIConfig;
  loginSettings: LoginSettings;
  offlineReminder: OfflineReminder;
  systemConfig: SystemConfig | null;
}
