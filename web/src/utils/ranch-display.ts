/** 牧场动作的中文名与图标，供概览的「今日统计」网格展示。 */
export const ranchActionLabels: Record<string, string> = {
  buy: '购买商品',
  buyCan: '购买罐头',
  place: '放入幼崽',
  addGrass: '补充牧草',
  useCan: '装填罐头',
  feed: '使用罐头',
  produce: '开始生产',
  harvest: '收获动物',
  sell: '出售产物',
  clean: '清理灾害',
  activateShed: '激活棚舍',
  upgrade: '升级设施',
  completeUpgrade: '完成升级',
  claimTasks: '领取任务',
  reportEntry: '上报进度',
  exchange: '兑换商品',
  claimIllustrated: '图鉴领奖',
  claimDailyShare: '每日分享',
  steal: '偷取产物',
  stroke: '照料动物',
  release: '放生动物',
  putMosquito: '放蚊子',
  cleanFriend: '帮好友清理',
}

export const ranchActionIcons: Record<string, string> = {
  buy: 'i-carbon-shopping-cart',
  buyCan: 'i-carbon-shopping-cart',
  place: 'i-fas-paw',
  addGrass: 'i-carbon-sprout',
  useCan: 'i-carbon-chemistry',
  feed: 'i-carbon-chemistry',
  produce: 'i-carbon-play',
  harvest: 'i-carbon-crop-growth',
  sell: 'i-carbon-shopping-cart',
  clean: 'i-carbon-clean',
  activateShed: 'i-carbon-building',
  upgrade: 'i-carbon-arrow-up',
  completeUpgrade: 'i-carbon-checkmark',
  claimTasks: 'i-carbon-task-complete',
  reportEntry: 'i-carbon-document',
  exchange: 'i-carbon-arrows-horizontal',
  claimIllustrated: 'i-carbon-gift',
  claimDailyShare: 'i-carbon-share',
  steal: 'i-carbon-run',
  stroke: 'i-carbon-favorite',
  release: 'i-carbon-walk',
  putMosquito: 'i-carbon-pest',
  cleanFriend: 'i-carbon-user-multiple',
}

/**
 * 今日统计网格：始终展示全部动作（含 0），老版本也是这个效果 ——
 * 空白网格比一排 0 更容易让人以为页面坏了。
 */
export function ranchTodayOperations(
  operations: Record<string, number> | null | undefined,
  operationsDate: string | undefined,
  todayKey: string,
): Record<string, number> {
  const defaults = Object.fromEntries(Object.keys(ranchActionLabels).map(key => [key, 0]))
  return operationsDate === todayKey ? { ...defaults, ...operations } : defaults
}
