import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/api'

export type ActivityTabKey = 'travel' | 'constellation' | 'shop' | 'solar' | 'qixi'
export type ActivityGameplayKey = 'stellar' | 'qixi'
export type ActivityVariant = 'blue' | 'violet' | 'gold' | 'green'
export type ActivityRecord = Record<string, unknown>

export interface ActivityDirectoryItemDto {
  id: string
  activityIds: string[]
  name: string
  startTime: number | null
  endTime: number | null
  gameplayKey: ActivityGameplayKey | null
  gameplayTargets: ActivityTabKey[]
  detailTarget: ActivityTabKey | null
}

export interface ActivityItemDto {
  id: string
  name: string
  count: string
  image: string
  rarity: string | number | null
}

export interface ActivityRewardDto extends ActivityItemDto {
  locked: boolean
  claimed: boolean
}

export interface ActivityRulesDto {
  title: string
  paragraphs: string[]
  lines?: string[]
}

export interface PassNodeDto {
  id: string
  level: string
  statusCode: string
  keyLevel: boolean
  locked: boolean
  claimed: boolean
  claimable: boolean
  current: boolean
  rewards: ActivityRewardDto[]
}

export interface TravelPassDto {
  activityId: string
  title: string
  description: string
  level: string | null
  progress: number | null
  progressMax: number | null
  claimedThroughLevel: string | null
  rules: ActivityRulesDto
  nodes: PassNodeDto[]
}

export interface ConstellationLinkDto {
  from: string
  to: string
}

export interface ConstellationNodeDto {
  id: string
  name: string
  description: string
  statusCode: string
  x: number | null
  y: number | null
  locked: boolean
  lit: boolean
  lightable: boolean
  current: boolean
  rewards: ActivityRewardDto[]
}

export type ConstellationVisualState = 'lit' | 'lightable' | 'claimableUnknown' | 'locked' | 'unknown'

export interface ConstellationGroupDto {
  id: string
  nodeId: string
  name: string
  category: string
  explain: string
  order: number | null
  chartIndex: number | null
  visualState: ConstellationVisualState
  opened: boolean | null
  lit: boolean | null
  stateKnown: boolean
  statusSource: string
  claimStatus: string
  nodeIds: string[]
  linksRaw: string
  rewards: ActivityRewardDto[]
  // Compatibility view for the current constellation component. Coordinates remain null
  // until an authoritative chart layout is supplied by the backend/catalog.
  current: boolean
  nodes: ConstellationNodeDto[]
  links: ConstellationLinkDto[]
}

export interface ConstellationDto {
  activityId: string
  typeCode: string
  displayName: string
  title: string
  serverName: string
  description: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  catalogStatus: string
  rules: ActivityRulesDto
  currentDay: number | null
  groups: ConstellationGroupDto[]
}

export interface SeasonDto {
  id: string
  title: string
  description: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  pass: TravelPassDto | null
}

export interface ShopCategoryDto {
  id: string
  name: string
}

export interface ShopGoodsDto {
  id: string
  name: string
  description: string
  categoryId: string
  categoryName: string
  item: ActivityItemDto
  cost: ActivityItemDto
  statusCode: string
  owned: boolean
  exchangeable: boolean
  soldOut: boolean
  balanceKnown: boolean
  maxExchangeCount: string
  maxExchangeCountKnown: boolean
}

export interface ShopCurrencyDto extends ActivityItemDto {
  balance: string | null
  balanceKnown: boolean
}

export interface ShopDto {
  activityId: string
  name: string
  title: string
  description: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  balance: string | null
  balanceKnown: boolean
  currency: ActivityItemDto
  currencies: ShopCurrencyDto[]
  categories: ShopCategoryDto[]
  goods: ShopGoodsDto[]
  action: ActivityActionDto
}

export interface SolarTermDto {
  id: string
  name: string
  title: string
  englishName: string
  description: string
  rewardTitle: string
  rewardDescription: string
  statusCode: string
  startTime: number | null
  endTime: number | null
  current: boolean
  locked: boolean
  claimed: boolean
  claimable: boolean
  rewards: ActivityRewardDto[]
}

export interface SolarTermsDto {
  title: string
  description: string
  rewardTitle: string
  rewardDescription: string
  serverTime: number | null
  currentTermId: string
  terms: SolarTermDto[]
}

export interface ActivityActionDto {
  enabled: boolean
  available: boolean
  attemptable?: boolean
  attemptableCount?: number | null
  availabilityKnown: boolean
  count: number | null
}

export interface ActivityActionsDto {
  claimPass: ActivityActionDto
  lightConstellation: ActivityActionDto
  claimSolar: ActivityActionDto
  exchange: ActivityActionDto
  qixiBridge: ActivityActionDto
  qixiGift: ActivityActionDto
  qixiDew: ActivityActionDto
}

export interface QixiBridgeStageDto {
  id: string
  stage: number
  statusCode: string
  completed: boolean
  claimed: boolean
  claimable: boolean
  current: boolean
  cost: ActivityItemDto
  rewards: ActivityItemDto[]
}

export interface QixiGiftExchangeDto {
  costItems: ActivityItemDto[]
  receiveItems: ActivityItemDto[]
  giftType: string
  content: string
}

export interface QixiDewDto extends ActivityItemDto {
  balance: string | null
  balanceKnown: boolean
  usable: boolean
  sellable: boolean
  sellStatus: string
  sellCondition: string
  sellPrice: {
    currencyId: string
    amount: string
    currencyName: string
    currencyImage: string
  } | null
}

export interface QixiDewLandTargetDto {
  id: string
  landId: string
  hostGid: string
  ownerName: string
  isSelf: boolean
  plantId: string
  plantName: string
  seedId: string
  seedImage: string
  landLevel: number
  landTypeName: string
  phaseCode: number
  phaseName: string
  mature: boolean
  occupiedLandIds: string[]
  activityMarker: string
}

export interface QixiDewTargetsDto {
  host: {
    gid: string
    name: string
    avatarUrl: string
    isSelf: boolean
  }
  lands: QixiDewLandTargetDto[]
  count: number
  serverValidationRequired: boolean
}

export interface QixiActivityDto {
  groupId: string
  activityId: string
  bridgeActivityId: string
  giftActivityId: string
  name: string
  title: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  active: boolean
  rules: ActivityRulesDto
  feather: ActivityItemDto
  sachet: ActivityItemDto
  receivedSachet: ActivityItemDto
  dew: QixiDewDto
  balances: {
    feather: string | null
    sachet: string | null
    receivedSachet: string | null
    dew: string | null
    known: boolean
  }
  bridge: {
    currentStage: number
    stages: QixiBridgeStageDto[]
    claimable: boolean
    rewardRedDot: boolean
    displayItems: ActivityItemDto[]
  }
  gift: {
    sentCount: string
    sendLimit: string
    receiveLimit: string
    exchanges: QixiGiftExchangeDto[]
    messageTextId: string
  }
  actions: {
    bridge: ActivityActionDto
    gift: ActivityActionDto
    dew: ActivityActionDto
  }
}

export interface QingMeiQuoteDto {
  round: number
  unitPrice: string
  totalGold: string
  doubled: boolean
}

export interface QingMeiIngredientDto extends ActivityItemDto {
  uid: string
  key: string
  mutantTypes: string[]
}

export interface QingMeiActivityDto {
  activityId: string
  name: string
  title: string
  startTime: number | null
  endTime: number | null
  rules: ActivityRulesDto
  ingredient: ActivityItemDto
  ingredients: QingMeiIngredientDto[]
  balance: string | null
  balanceKnown: boolean
  baseGold: string
  basePrice: string
  guaranteedPrice: string
  currentRound: number
  started: boolean
  maxRounds: number
  finished: boolean
  quotePrices: string[]
  quoteTotals: string[]
  quote: QingMeiQuoteDto | null
  dailySeed: { claimed: boolean, grantId: string, reward: ActivityItemDto } | null
  actions: {
    claimSeed: ActivityActionDto
    start: ActivityActionDto
    continue: ActivityActionDto
    settle: ActivityActionDto
  }
}

export interface ActivityCenterSnapshotDto {
  serverTime: number | null
  activities: ActivityDirectoryItemDto[]
  season: SeasonDto | null
  shop: ShopDto | null
  solarTerms: SolarTermsDto | null
  constellation: ConstellationDto | null
  qixi: QixiActivityDto | null
  qingMei: QingMeiActivityDto | null
  actions: ActivityActionsDto
}

export type ActivityMutationKey = 'claimPass' | 'lightConstellation' | 'claimSolar' | 'exchange' | 'claimQixiBridge' | 'giftQixiSachet' | 'useQixiDew' | 'claimQingMeiSeed' | 'startQingMeiBrew' | 'continueQingMeiBrew' | 'settleQingMeiBrew'

function isRecord(value: unknown): value is ActivityRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown): ActivityRecord {
  return isRecord(value) ? value : {}
}

function records(value: unknown): ActivityRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function text(...values: unknown[]): string {
  const value = first(...values)
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function bool(...values: unknown[]): boolean {
  const value = first(...values)
  if (typeof value === 'string')
    return ['1', 'true', 'yes'].includes(value.toLowerCase())
  return value === true || value === 1
}

function finiteNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined)
    return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toMilliseconds(value: unknown): number | null {
  if (value instanceof Date)
    return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value))
    return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric))
      return numeric < 1e12 ? numeric * 1000 : numeric
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function plainText(value: unknown): string {
  return text(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '\'')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .trim()
}

function descriptionOf(raw: ActivityRecord): string {
  const rules = record(first(raw.rules, raw.rule, raw.content))
  const paragraphs = Array.isArray(rules.paragraphs) && rules.paragraphs.length ? rules.paragraphs : first(rules.lines, raw.paragraphs, raw.lines)
  return plainText(first(raw.description, raw.subtitle, raw.explain, Array.isArray(paragraphs) ? paragraphs.filter(Boolean).map(plainText).join('\n') : '', rules.title))
}

function normalizeRules(value: unknown): ActivityRulesDto {
  const raw = record(value)
  const entries = Array.isArray(raw.paragraphs) && raw.paragraphs.length
    ? raw.paragraphs
    : Array.isArray(raw.lines) ? raw.lines : []
  const paragraphs = entries
    .filter((entry): entry is string | number => typeof entry === 'string' || typeof entry === 'number')
    .map(plainText)
    .filter(Boolean)
  return {
    title: plainText(raw.title),
    paragraphs,
    lines: [...paragraphs],
  }
}

function normalizeItem(value: unknown): ActivityItemDto {
  const raw = record(value)
  return {
    id: text(raw.id, raw.itemId, raw.item_id),
    name: text(raw.name, raw.itemName, raw.item_name, raw.title),
    count: text(raw.count, raw.quantity, raw.num, raw.amount),
    image: text(raw.image, raw.imageUrl),
    rarity: first(raw.rarity, raw.quality, raw.qualityCode) as string | number | null ?? null,
  }
}

function normalizeReward(value: unknown, inheritedLocked = false): ActivityRewardDto {
  const raw = record(value)
  const item = normalizeItem(isRecord(raw.item) ? { ...raw, ...raw.item } : raw)
  return {
    ...item,
    locked: inheritedLocked || bool(raw.locked, raw.isLocked),
    claimed: bool(raw.claimed, raw.received, raw.isClaimed),
  }
}

function statusIs(status: string, ...candidates: string[]): boolean {
  return candidates.includes(status.toLowerCase())
}

function normalizePass(value: unknown, seasonRaw: ActivityRecord): TravelPassDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const nodeValues = records(first(raw.nodes, raw.levels, raw.rewards, seasonRaw.rewards))
  const levelValue = first(raw.level, raw.currentLevel, raw.current_level, raw.field2Code, seasonRaw.level)
  const claimedThroughValue = first(raw.claimedThroughLevel, raw.claimed_through_level, raw.field9Code)
  const rules = normalizeRules(first(raw.rules, raw.rule, raw.content))
  return {
    activityId: text(raw.activityId, raw.activity_id, seasonRaw.activityId),
    title: text(raw.title, raw.name),
    description: descriptionOf(raw),
    level: levelValue === undefined || levelValue === null || levelValue === '' ? null : String(levelValue),
    progress: finiteNumber(first(raw.progress, raw.currentProgress, raw.current_progress, raw.points, raw.score, seasonRaw.progress)),
    progressMax: finiteNumber(first(raw.progressMax, raw.progressTarget, raw.progress_target, raw.progress_max, raw.target, raw.nextLevelProgress, seasonRaw.progressMax)),
    claimedThroughLevel: claimedThroughValue === undefined || claimedThroughValue === null || claimedThroughValue === '' ? null : String(claimedThroughValue),
    rules,
    nodes: nodeValues.map((node, index) => {
      const statusCode = text(node.statusCode, node.status, node.state)
      const claimed = bool(node.claimed, node.received, node.isClaimed) || statusIs(statusCode, '3', 'claimed', 'received')
      const explicitClaimable = bool(node.claimable, node.canClaim, node.available) || statusIs(statusCode, '2', 'claimable', 'available')
      const lockedValue = first(node.locked, node.isLocked)
      const locked = lockedValue === undefined || lockedValue === null || lockedValue === ''
        ? !claimed && !explicitClaimable
        : bool(lockedValue)
      return {
        id: text(node.id, node.nodeId, node.node_id, index),
        level: text(node.level, node.levelNo, node.level_no),
        statusCode,
        keyLevel: bool(node.keyLevel, node.key_level, node.isKeyLevel, node.is_key_level),
        locked,
        claimed,
        claimable: explicitClaimable && !claimed && !locked,
        current: bool(node.current, node.active, node.isCurrent),
        rewards: records(first(node.rewards, node.items, node.rewardList)).map(reward => normalizeReward(reward, locked)),
      }
    }),
  }
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || (typeof value === 'string' && ['1', 'true', 'yes'].includes(value.toLowerCase())))
    return true
  if (value === false || value === 0 || (typeof value === 'string' && ['0', 'false', 'no'].includes(value.toLowerCase())))
    return false
  return null
}

function constellationVisualState(value: unknown, opened: boolean | null, lit: boolean | null): ConstellationVisualState {
  if (value === 'lit' || value === 'lightable' || value === 'claimableUnknown' || value === 'locked' || value === 'unknown')
    return value
  // Compatibility for snapshots which expose the explicit booleans but not visualState.
  if (lit === true)
    return 'lit'
  if (opened === true)
    return 'lightable'
  if (opened === false)
    return 'locked'
  return 'unknown'
}

function normalizeConstellation(value: unknown): ConstellationDto | null {
  if (!isRecord(value))
    return null
  const raw = record(first(value.constellation, value.state, value))
  const activity = record(first(value.activity, value.activityInfo, value.activity_info))
  const rules = normalizeRules(first(raw.rules, value.rules))
  const currentDay = finiteNumber(first(raw.currentDay, raw.current_day))

  return {
    activityId: text(raw.activityId, raw.activity_id, value.activityId, value.activity_id, activity.id, activity.activityId),
    typeCode: text(raw.typeCode, raw.type_code, value.typeCode, activity.typeCode, activity.type),
    displayName: '观星礼录',
    title: '观星礼录',
    serverName: text(raw.serverName, raw.server_name, value.serverName, activity.name),
    description: rules.paragraphs.join('\n'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time, value.startTime, activity.startTime, activity.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time, value.endTime, activity.endTime, activity.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time, value.serverTime, value.server_time)),
    catalogStatus: text(raw.catalogStatus, raw.catalog_status),
    rules,
    currentDay,
    groups: records(first(raw.groups, value.groups)).map((group, groupIndex) => {
      const id = text(group.id, group.groupId, group.group_id, groupIndex + 1)
      const nodeId = text(group.nodeId, group.node_id, id)
      const order = finiteNumber(first(group.order, groupIndex + 1))
      const chartIndex = finiteNumber(first(group.chartIndex, group.chart_index))
      const opened = nullableBoolean(first(group.opened, group.isOpened, group.is_opened))
      const lit = nullableBoolean(first(group.lit, group.isLit, group.is_lit))
      const visualState = constellationVisualState(group.visualState, opened, lit)
      const stateKnownValue = nullableBoolean(first(group.stateKnown, group.state_known))
      const stateKnown = stateKnownValue ?? false
      const name = plainText(first(group.name, group.title))
      const explain = plainText(first(group.explain, group.description, group.subtitle))
      const rewards = records(first(group.rewards, group.items, group.rewardList)).map(reward => normalizeReward(reward))
      const current = currentDay !== null && order === currentDay
      const nodeIds = Array.isArray(group.nodeIds)
        ? group.nodeIds.map(nodeId => text(nodeId)).filter(Boolean)
        : []
      const compatibilityNode: ConstellationNodeDto = {
        id: nodeId,
        name,
        description: explain,
        statusCode: visualState,
        x: null,
        y: null,
        locked: visualState === 'locked',
        lit: lit === true,
        lightable: visualState === 'lightable',
        current,
        rewards,
      }
      return {
        id,
        nodeId,
        name,
        category: plainText(group.category),
        explain,
        order,
        chartIndex,
        visualState,
        opened,
        lit,
        stateKnown,
        statusSource: text(group.statusSource, group.status_source),
        claimStatus: text(group.claimStatus, group.claim_status),
        nodeIds,
        linksRaw: text(group.linksRaw, group.links_raw),
        rewards,
        current,
        nodes: [compatibilityNode],
        links: [],
      }
    }),
  }
}

function normalizeSeason(value: unknown): SeasonDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  return {
    id: text(raw.id, raw.seasonId, raw.season_id),
    title: text(raw.title, raw.name),
    description: descriptionOf(raw),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time, raw.beginTime, raw.begin_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    pass: normalizePass(first(raw.pass, raw.travelPass, raw.travel_pass), raw),
  }
}

function normalizeShop(value: unknown): ShopDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const goodsValues = records(first(raw.goods, raw.items, raw.products, raw.list))
  const rawCurrencies = records(raw.currencies)
  const currencyRaw = record(first(raw.currencyItem, raw.currency_item, raw.balanceItem, raw.balance_item, rawCurrencies[0], isRecord(raw.currency) ? raw.currency : null))
  const firstCost = record(goodsValues[0]?.cost)
  const currency = normalizeItem(Object.keys(currencyRaw).length ? currencyRaw : firstCost)
  const explicitBalanceKnown = nullableBoolean(first(raw.balanceKnown, raw.balance_known))
  const currencies = rawCurrencies.map((entry) => {
    const balanceValue = first(entry.balance, entry.count)
    const knownValue = nullableBoolean(first(entry.balanceKnown, entry.balance_known))
    const balanceKnown = knownValue ?? (balanceValue !== undefined && balanceValue !== null && balanceValue !== '')
    return {
      ...normalizeItem(entry),
      balance: balanceKnown ? text(balanceValue) : null,
      balanceKnown,
    }
  })
  const fallbackBalance = first(raw.balance, currencyRaw.balance, !isRecord(raw.currency) ? raw.currency : undefined)
  const balanceKnown = explicitBalanceKnown ?? currencies[0]?.balanceKnown ?? (fallbackBalance !== undefined && fallbackBalance !== null && fallbackBalance !== '')
  const balance = balanceKnown ? text(currencies[0]?.balance, fallbackBalance, currencyRaw.count) : null
  const explicitCategories = Array.isArray(raw.categories) ? raw.categories : []
  const categories = explicitCategories.map((entry, index) => {
    const category = record(entry)
    return typeof entry === 'string'
      ? { id: entry, name: entry }
      : { id: text(category.id, category.categoryId, category.value, index), name: text(category.name, category.title, category.label) }
  }).filter(category => category.name)
  const goods = goodsValues.map((entry) => {
    const itemSource = isRecord(entry.item) ? entry.item : entry
    const costSource = isRecord(entry.cost) ? entry.cost : record(first(entry.priceItem, entry.price_item))
    const statusCode = text(entry.statusCode, entry.status_code, entry.status, entry.state)
    const goodsBalanceKnown = nullableBoolean(first(entry.balanceKnown, entry.balance_known)) ?? balanceKnown
    const maxExchangeCountValue = first(entry.maxExchangeCount, entry.max_exchange_count)
    const maxExchangeCountKnown = nullableBoolean(first(entry.maxExchangeCountKnown, entry.max_exchange_count_known))
      ?? (maxExchangeCountValue !== undefined && maxExchangeCountValue !== null && maxExchangeCountValue !== '')
    return {
      id: text(entry.id, entry.goodsId, entry.goods_id),
      name: text(entry.name, entry.title, entry.goodsName),
      description: descriptionOf(entry),
      categoryId: text(entry.categoryId, entry.category_id, entry.type, entry.category),
      categoryName: text(entry.categoryName, entry.category, entry.typeName),
      item: normalizeItem(itemSource),
      cost: normalizeItem({ ...costSource, count: first(costSource.count, entry.price, entry.needCount, entry.costCount) }),
      statusCode,
      owned: bool(entry.owned, entry.isOwned, entry.is_owned),
      exchangeable: bool(entry.exchangeable, entry.canExchange, entry.can_exchange),
      soldOut: bool(entry.soldOut, entry.sold_out, entry.disabled) || statusCode.toLowerCase() === 'soldout',
      balanceKnown: goodsBalanceKnown,
      maxExchangeCount: text(maxExchangeCountValue),
      maxExchangeCountKnown,
    }
  })
  for (const item of goods) {
    const categoryName = item.categoryName
    if (categoryName && !categories.some(category => category.name === categoryName || category.id === item.categoryId))
      categories.push({ id: item.categoryId || categoryName, name: categoryName })
  }
  const name = text(raw.name, raw.title)
  return {
    activityId: text(raw.activityId, raw.activity_id, raw.id),
    name,
    title: text(raw.title, name),
    description: descriptionOf(raw),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time, raw.beginTime, raw.begin_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    balance,
    balanceKnown,
    currency,
    currencies,
    categories,
    goods,
    action: normalizeAction({ exchange: raw.action }, {}, ['exchange']),
  }
}

function normalizeSolarTerms(value: unknown): SolarTermsDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const currentTermId = text(raw.currentTermId, raw.current_term_id)
  return {
    title: text(raw.title, raw.name),
    description: descriptionOf(raw),
    rewardTitle: text(raw.rewardTitle, raw.reward_title),
    rewardDescription: text(raw.rewardDescription, raw.reward_description),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    currentTermId,
    terms: records(first(raw.terms, raw.items, raw.solarTerms, raw.solar_terms)).map((term) => {
      const statusCode = text(term.statusCode, term.status, term.state)
      const claimed = bool(term.claimed, term.received, term.isClaimed) || statusIs(statusCode, '3', 'claimed', 'received')
      const claimable = bool(term.claimable, term.canClaim, term.available) || statusCode === '2'
      return {
        id: text(term.id, term.termId, term.term_id),
        name: text(term.name, term.shortName),
        title: text(term.title, term.name),
        englishName: text(term.englishName, term.english_name, term.english),
        description: descriptionOf(term),
        rewardTitle: text(term.rewardTitle, term.reward_title),
        rewardDescription: text(term.rewardDescription, term.reward_description),
        statusCode,
        startTime: toMilliseconds(first(term.startTime, term.start_time, term.beginTime, term.begin_time)),
        endTime: toMilliseconds(first(term.endTime, term.end_time)),
        current: bool(term.current, term.active, term.isCurrent) || (!!currentTermId && text(term.id, term.termId, term.term_id) === currentTermId),
        locked: bool(term.locked, term.isLocked) || statusIs(statusCode, '0', 'locked'),
        claimed,
        claimable: claimable && !claimed,
        rewards: records(first(term.rewards, term.items, term.rewardList)).map(reward => normalizeReward(reward)),
      }
    }),
  }
}

function normalizeActivityDirectory(value: unknown): ActivityDirectoryItemDto[] {
  return records(value).map((entry) => {
    const detailTarget = text(entry.detailTarget, entry.detail_target)
    const normalizedDetailTarget = ['travel', 'constellation', 'shop', 'solar', 'qixi'].includes(detailTarget)
      ? detailTarget as ActivityTabKey
      : null
    const gameplayKey = text(entry.gameplayKey, entry.gameplay_key)
    const rawGameplayTargets = first(entry.gameplayTargets, entry.gameplay_targets)
    const gameplayTargets = Array.isArray(rawGameplayTargets)
      ? rawGameplayTargets.map(value => text(value)).filter((value): value is ActivityTabKey => ['travel', 'constellation', 'shop', 'solar', 'qixi'].includes(value))
      : []
    const id = text(entry.id, entry.activityId, entry.activity_id)
    const rawActivityIds = first(entry.activityIds, entry.activity_ids)
    const activityIds = Array.isArray(rawActivityIds)
      ? rawActivityIds.map(value => text(value)).filter(Boolean)
      : []
    return {
      id,
      activityIds: activityIds.length > 0 ? activityIds : [id].filter(Boolean),
      name: text(entry.name, entry.title),
      startTime: toMilliseconds(first(entry.startTime, entry.start_time, entry.beginTime, entry.begin_time)),
      endTime: toMilliseconds(first(entry.endTime, entry.end_time)),
      gameplayKey: gameplayKey === 'qixi' || normalizedDetailTarget === 'qixi'
        ? 'qixi' as const
        : gameplayKey === 'stellar' || normalizedDetailTarget
          ? 'stellar' as const
          : null,
      gameplayTargets: gameplayTargets.length > 0 ? gameplayTargets : normalizedDetailTarget ? [normalizedDetailTarget] : [],
      detailTarget: normalizedDetailTarget,
    }
  }).filter(entry => entry.id)
}

function normalizeQixi(value: unknown): QixiActivityDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const balances = record(raw.balances)
  const bridge = record(raw.bridge)
  const gift = record(raw.gift)
  const dew = record(raw.dew)
  const dewSellPrice = record(first(dew.sellPrice, dew.sell_price))
  const actions = record(raw.actions)
  const dewBalance = first(dew.balance, balances.dew)
  return {
    groupId: text(raw.groupId, raw.group_id),
    activityId: text(raw.activityId, raw.activity_id, raw.bridgeActivityId, raw.bridge_activity_id),
    bridgeActivityId: text(raw.bridgeActivityId, raw.bridge_activity_id),
    giftActivityId: text(raw.giftActivityId, raw.gift_activity_id),
    name: text(raw.name, '鹊桥寄情'),
    title: text(raw.title, raw.name, '鹊桥寄情'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    active: bool(raw.active),
    rules: normalizeRules(raw.rules),
    feather: normalizeItem(raw.feather),
    sachet: normalizeItem(raw.sachet),
    receivedSachet: normalizeItem(first(raw.receivedSachet, raw.received_sachet)),
    dew: {
      ...normalizeItem(dew),
      balance: dewBalance === null || dewBalance === undefined ? null : text(dewBalance),
      balanceKnown: bool(dew.balanceKnown, dew.balance_known, balances.known),
      usable: bool(dew.usable),
      sellable: bool(dew.sellable),
      sellStatus: text(dew.sellStatus, dew.sell_status),
      sellCondition: text(dew.sellCondition, dew.sell_condition),
      sellPrice: Object.keys(dewSellPrice).length
        ? {
            currencyId: text(dewSellPrice.currencyId, dewSellPrice.currency_id),
            amount: text(dewSellPrice.amount, dewSellPrice.price),
            currencyName: text(dewSellPrice.currencyName, dewSellPrice.currency_name),
            currencyImage: text(dewSellPrice.currencyImage, dewSellPrice.currency_image),
          }
        : null,
    },
    balances: {
      feather: balances.feather === null || balances.feather === undefined ? null : text(balances.feather),
      sachet: balances.sachet === null || balances.sachet === undefined ? null : text(balances.sachet),
      receivedSachet: balances.receivedSachet === null || balances.receivedSachet === undefined
        ? null
        : text(balances.receivedSachet),
      dew: balances.dew === null || balances.dew === undefined ? null : text(balances.dew),
      known: bool(balances.known),
    },
    bridge: {
      currentStage: finiteNumber(first(bridge.currentStage, bridge.current_stage)) || 0,
      stages: records(bridge.stages).map(stage => ({
        id: text(stage.id, stage.stage),
        stage: finiteNumber(stage.stage) || 0,
        statusCode: text(stage.statusCode, stage.status_code, stage.status),
        completed: bool(stage.completed),
        claimed: bool(stage.claimed),
        claimable: bool(stage.claimable),
        current: bool(stage.current),
        cost: normalizeItem(stage.cost),
        rewards: records(stage.rewards).map(normalizeItem),
      })),
      claimable: bool(bridge.claimable),
      rewardRedDot: bool(bridge.rewardRedDot, bridge.reward_red_dot),
      displayItems: records(first(bridge.displayItems, bridge.display_items)).map(normalizeItem),
    },
    gift: {
      sentCount: text(gift.sentCount, gift.sent_count),
      sendLimit: text(gift.sendLimit, gift.send_limit),
      receiveLimit: text(gift.receiveLimit, gift.receive_limit),
      exchanges: records(gift.exchanges).map(exchange => ({
        costItems: records(first(exchange.costItems, exchange.cost_items)).map(normalizeItem),
        receiveItems: records(first(exchange.receiveItems, exchange.receive_items)).map(normalizeItem),
        giftType: text(exchange.giftType, exchange.gift_type),
        content: text(exchange.content),
      })),
      messageTextId: text(gift.messageTextId, gift.message_text_id, 15),
    },
    actions: {
      bridge: normalizeAction(actions, {}, ['bridge']),
      gift: normalizeAction(actions, {}, ['gift']),
      dew: normalizeAction(actions, {}, ['dew']),
    },
  }
}

function normalizeQixiDewTargets(value: unknown): QixiDewTargetsDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const host = record(raw.host)
  const lands = records(raw.lands).map((land) => {
    const rawOccupiedLandIds = first(land.occupiedLandIds, land.occupied_land_ids)
    return {
      id: text(land.id, land.landId, land.land_id),
      landId: text(land.landId, land.land_id, land.id),
      hostGid: text(land.hostGid, land.host_gid, host.gid),
      ownerName: text(land.ownerName, land.owner_name, host.name),
      isSelf: bool(land.isSelf, land.is_self, host.isSelf, host.is_self),
      plantId: text(land.plantId, land.plant_id),
      plantName: text(land.plantName, land.plant_name, '未知作物'),
      seedId: text(land.seedId, land.seed_id),
      seedImage: text(land.seedImage, land.seed_image),
      landLevel: finiteNumber(first(land.landLevel, land.land_level)) || 0,
      landTypeName: text(land.landTypeName, land.land_type_name, '普通土地'),
      phaseCode: finiteNumber(first(land.phaseCode, land.phase_code)) || 0,
      phaseName: text(land.phaseName, land.phase_name),
      mature: bool(land.mature),
      occupiedLandIds: Array.isArray(rawOccupiedLandIds) ? rawOccupiedLandIds.map(value => text(value)).filter(Boolean) : [],
      activityMarker: text(land.activityMarker, land.activity_marker),
    }
  }).filter(land => land.landId)
  return {
    host: {
      gid: text(host.gid),
      name: text(host.name, host.remark),
      avatarUrl: text(host.avatarUrl, host.avatar_url),
      isSelf: bool(host.isSelf, host.is_self),
    },
    lands,
    count: finiteNumber(raw.count) ?? lands.length,
    serverValidationRequired: bool(raw.serverValidationRequired, raw.server_validation_required),
  }
}

function normalizeQingMei(value: unknown): QingMeiActivityDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const actions = record(raw.actions)
  const dailySeedRaw = record(raw.dailySeed)
  const quoteRaw = record(raw.quote)
  const action = (key: string) => normalizeAction(actions, {}, [key])
  return {
    activityId: text(raw.activityId, raw.activity_id),
    name: text(raw.name, '青酿换万金'),
    title: text(raw.title, raw.name, '青酿换万金'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    rules: normalizeRules(raw.rules),
    ingredient: normalizeItem(raw.ingredient),
    ingredients: records(raw.ingredients).map((entry) => {
      const uid = text(entry.uid)
      const mutantTypes = Array.isArray(entry.mutantTypes) ? entry.mutantTypes.map(String) : []
      return {
        ...normalizeItem(entry),
        uid,
        key: text(entry.key, `${uid}:${mutantTypes.join(',')}`),
        mutantTypes,
      }
    }),
    balance: raw.balance === null || raw.balance === undefined ? null : text(raw.balance),
    balanceKnown: bool(raw.balanceKnown),
    baseGold: text(raw.baseGold),
    basePrice: text(raw.basePrice),
    guaranteedPrice: text(raw.guaranteedPrice),
    currentRound: finiteNumber(raw.currentRound) || 0,
    started: bool(raw.started),
    maxRounds: finiteNumber(raw.maxRounds) || 3,
    finished: bool(raw.finished),
    quotePrices: Array.isArray(raw.quotePrices) ? raw.quotePrices.map(String) : [],
    quoteTotals: Array.isArray(raw.quoteTotals) ? raw.quoteTotals.map(String) : [],
    quote: Object.keys(quoteRaw).length
      ? {
          round: finiteNumber(quoteRaw.round) || 0,
          unitPrice: text(quoteRaw.unitPrice),
          totalGold: text(quoteRaw.totalGold),
          doubled: bool(quoteRaw.doubled),
        }
      : null,
    dailySeed: Object.keys(dailySeedRaw).length
      ? {
          claimed: bool(dailySeedRaw.claimed),
          grantId: text(dailySeedRaw.grantId),
          reward: normalizeItem(dailySeedRaw.reward),
        }
      : null,
    actions: {
      claimSeed: action('claimSeed'),
      start: action('start'),
      continue: action('continue'),
      settle: action('settle'),
    },
  }
}

function findAction(source: ActivityRecord, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (source[alias] !== undefined)
      return source[alias]
  }
  return undefined
}

function normalizeAction(actions: ActivityRecord, capabilities: ActivityRecord, aliases: string[]): ActivityActionDto {
  const actionValue = findAction(actions, aliases)
  const capabilityValue = findAction(capabilities, aliases)
  const action = record(actionValue)
  const capability = record(capabilityValue)
  const count = finiteNumber(first(action.count, action.badge, action.availableCount, action.available_count))
  const enabled = typeof actionValue === 'boolean'
    ? actionValue
    : typeof capabilityValue === 'boolean'
      ? capabilityValue
      : bool(action.enabled, action.allowed, capability.enabled, capability.allowed, capability.available)
  const explicitAvailable = nullableBoolean(action.available)
  const available = typeof actionValue === 'boolean'
    ? actionValue
    : explicitAvailable !== null
      ? explicitAvailable
      : bool(action.pending, action.redDot, action.red_dot, action.active) || (count !== null && count > 0)
  const attemptableValue = nullableBoolean(first(action.attemptable, capability.attemptable))
  const attemptableCount = finiteNumber(first(action.attemptableCount, action.attemptable_count, capability.attemptableCount, capability.attemptable_count))
  const availabilityKnownValue = first(action.availabilityKnown, action.availability_known, capability.availabilityKnown, capability.availability_known)
  const availabilityKnown = availabilityKnownValue === undefined || availabilityKnownValue === null || availabilityKnownValue === ''
    ? typeof actionValue === 'boolean' || action.available !== undefined || count !== null
    : bool(availabilityKnownValue)
  return {
    enabled,
    available,
    ...(attemptableValue !== null ? { attemptable: attemptableValue } : {}),
    ...(attemptableCount !== null ? { attemptableCount } : {}),
    availabilityKnown,
    count,
  }
}

export function normalizeActivitySnapshot(value: unknown): ActivityCenterSnapshotDto {
  const envelope = record(value)
  const root = record(first(envelope.snapshot, envelope.data, value))
  const seasonRaw = first(root.season, root.seasonEvent, root.season_event)
  const seasonRecord = record(seasonRaw)
  const actionsRaw = record(first(root.actions, seasonRecord.actions))
  const capabilitiesRaw = record(first(root.capabilities, seasonRecord.capabilities, record(root.shop).capabilities, record(first(root.solarTerms, root.solar)).capabilities))
  return {
    serverTime: toMilliseconds(first(root.serverTime, root.server_time)),
    activities: normalizeActivityDirectory(first(root.activities, root.activityList, root.activity_list)),
    season: normalizeSeason(seasonRaw),
    shop: normalizeShop(first(root.shop, root.starSandShop, root.star_sand_shop)),
    solarTerms: normalizeSolarTerms(first(root.solarTerms, root.solar_terms, root.solar)),
    constellation: normalizeConstellation(first(root.constellation, root.constellationActivity, seasonRecord.constellation, seasonRecord.constellationActivity, seasonRecord.starContract, seasonRecord.contract)),
    qixi: normalizeQixi(first(root.qixi, root.qiXi, root.qi_xi)),
    qingMei: normalizeQingMei(first(root.qingMei, root.qingmei, root.qing_mei)),
    actions: {
      claimPass: normalizeAction(actionsRaw, capabilitiesRaw, ['claimPass', 'passClaim', 'pass_claim']),
      lightConstellation: normalizeAction(actionsRaw, capabilitiesRaw, ['lightConstellation', 'constellationLight', 'constellation_light']),
      claimSolar: normalizeAction(actionsRaw, capabilitiesRaw, ['claimSolar', 'solarClaim', 'solar_claim']),
      exchange: normalizeAction(actionsRaw, capabilitiesRaw, ['exchange', 'shopExchange', 'shop_exchange']),
      qixiBridge: normalizeAction(actionsRaw, capabilitiesRaw, ['qixiBridge', 'qixi_bridge']),
      qixiGift: normalizeAction(actionsRaw, capabilitiesRaw, ['qixiGift', 'qixi_gift']),
      qixiDew: normalizeAction(actionsRaw, capabilitiesRaw, ['qixiDew', 'qixi_dew']),
    },
  }
}

const activityErrorMessages: Record<string, string> = {
  1034038: '当前没有可点亮或可领取的星宿奖励，可能已经领取过，请稍后或明天再来看看',
  1034001: '当前活动暂不可操作，请稍后再试',
  1034002: '活动尚未开放或已经结束',
  NO_PASS_REWARD: '当前没有可领取的游记奖励，请完成新的游记等级后再试',
  SOLAR_TERM_UNAVAILABLE: '当前节令奖励暂不可领取，请在开放后再试',
  CONSTELLATION_UNAVAILABLE: '观星礼录活动暂未开放或已经结束',
  PASS_UNAVAILABLE: '千星游记活动暂未开放或已经结束',
  SOLAR_TERM_NOT_FOUND: '未找到该节令活动，请刷新页面后再试',
  SHOP_UNAVAILABLE: '星砂商店暂未开放，请稍后再来看看',
  INVALID_EXCHANGE_COUNT: '兑换数量必须是正整数',
  INVALID_SHOP_GOODS_ID: '商品信息无效，请刷新商店后重试',
  SHOP_GOODS_NOT_FOUND: '该商品已不在当前商店目录中，请刷新后重试',
  SHOP_GOODS_UNAVAILABLE: '该商品当前不可兑换，请刷新商店后重试',
  SHOP_BALANCE_UNAVAILABLE: '暂时无法确认星砂余额，请稍后重试',
  INSUFFICIENT_STAR_SAND: '星砂余额不足，无法完成本次兑换',
  SHOP_RESPONSE_INVALID: '商店数据已经变化，请刷新页面后重试',
  QIXI_UNAVAILABLE: '鹊桥寄情活动暂未开放或已经结束',
  QIXI_BRIDGE_UNAVAILABLE: '当前没有可领取的鹊桥奖励',
  QIXI_GIFT_UNAVAILABLE: '当前无法赠送鹊羽香囊',
  INVALID_QIXI_FRIEND_GID: '好友信息无效，请重新选择',
  INVALID_QIXI_MESSAGE_TEXT_ID: '祝福文案信息无效，请刷新活动后重试',
  INSUFFICIENT_QIXI_SACHET: '鹊羽香囊数量不足',
  QIXI_RESPONSE_INVALID: '鹊桥活动数据已经变化，请刷新页面后重试',
  QIXI_GIFT_FAILED: '鹊羽香囊赠送失败，请刷新后重试',
  QIXI_DEW_ACCOUNT_UNAVAILABLE: '当前账号尚未就绪，请稍后重试',
  INVALID_QIXI_DEW_HOST_GID: '农场主人信息无效，请重新选择',
  INVALID_QIXI_DEW_LAND_ID: '地块信息无效，请刷新后重选',
  INVALID_QIXI_DEW_LAND_IDS: '请选择有效地块，单次最多选择 48 块',
  QIXI_DEW_UNAVAILABLE: '活动未进行，鹊羽灵露当前不可使用',
  INSUFFICIENT_QIXI_DEW: '背包中没有可用的鹊羽灵露',
  QIXI_DEW_SELECTION_EXCEEDS_BALANCE: '所选地块数量超过当前鹊羽灵露余额',
  QIXI_DEW_HOST_MISMATCH: '进入的农场与所选好友不一致，请刷新后重试',
  QIXI_DEW_TARGET_UNAVAILABLE: '所选地块已不再可用，请刷新后重选',
  SEASON_UNAVAILABLE: '当前活动数据暂未开放，请稍后刷新重试',
  INVALID_SOLAR_TERM: '节令信息已失效，请刷新页面后重试',
  ACCOUNT_OFFLINE: '当前账号尚未运行，请先启动账号后再试',
  GAME_OFFLINE: '游戏连接尚未就绪，请稍后重试',
  ACTIVITY_TIMEOUT: '活动服务响应超时，请稍后重试',
  ACTIVITY_BUSY: '活动操作过于频繁，请稍后再试',
  ACTIVITY_REQUEST_INTERRUPTED: '活动请求未能完成，请稍后重试',
  ACTIVITY_DATA_CHANGED: '活动数据已经更新，请刷新页面后再试',
  ACTIVITY_OPERATION_FAILED: '活动操作失败，请刷新页面后重试',
}

function errorMessage(error: unknown, fallback = '活动数据加载失败') {
  const candidate = error as { response?: { data?: { error?: unknown, message?: unknown, errorCode?: unknown } }, message?: unknown, code?: unknown }
  const rawMessage = String(candidate.response?.data?.error || candidate.response?.data?.message || candidate.message || '')
  const errorCode = String(candidate.response?.data?.errorCode || candidate.code || rawMessage.match(/\bcode=(\d+)\b/)?.[1] || '')
  if (activityErrorMessages[errorCode])
    return activityErrorMessages[errorCode]
  if (rawMessage.includes('当前无可领取的奖励节点'))
    return activityErrorMessages['1034038']!
  if (rawMessage.includes('当前没有可领取的游记奖励'))
    return activityErrorMessages.NO_PASS_REWARD!
  if (rawMessage.includes('指定节令当前不可领取'))
    return activityErrorMessages.SOLAR_TERM_UNAVAILABLE!
  if (/gamepb\.|code=\d+|GatewayError/.test(rawMessage))
    return fallback
  return rawMessage || fallback
}

function responsePayload(value: unknown): unknown {
  const response = record(value)
  if (response.ok === false) {
    const responseError = new Error(text(response.error, response.message, '活动接口返回失败')) as Error & { code?: string }
    responseError.code = text(response.errorCode, response.error_code, response.code)
    throw responseError
  }
  return response.data !== undefined ? response.data : value
}

export const useActivityCenterStore = defineStore('activity-center', () => {
  const snapshot = ref<ActivityCenterSnapshotDto>(normalizeActivitySnapshot({}))
  const loading = ref(false)
  const error = ref('')
  const actionError = ref('')
  const notice = ref('')
  const loadedAccountId = ref('')
  const serverClockOffset = ref(0)
  const requestVersion = ref(0)
  const dewTargets = ref<QixiDewTargetsDto | null>(null)
  const dewTargetsLoading = ref(false)
  const dewTargetsError = ref('')
  const dewUsedLandIdsByInstance = ref<Record<string, string[]>>({})
  let dewTargetsRequestVersion = 0
  const pendingLoads = new Map<string, Promise<boolean>>()
  const pendingActions = ref<Record<ActivityMutationKey, boolean>>({
    claimPass: false,
    lightConstellation: false,
    claimSolar: false,
    exchange: false,
    claimQixiBridge: false,
    giftQixiSachet: false,
    useQixiDew: false,
    claimQingMeiSeed: false,
    startQingMeiBrew: false,
    continueQingMeiBrew: false,
    settleQingMeiBrew: false,
  })

  const season = computed(() => snapshot.value.season)
  const activities = computed(() => snapshot.value.activities)
  const shop = computed(() => snapshot.value.shop)
  const solarTerms = computed(() => snapshot.value.solarTerms)
  const solar = solarTerms
  const constellation = computed(() => snapshot.value.constellation)
  const qixi = computed(() => snapshot.value.qixi)
  const qingMei = computed(() => snapshot.value.qingMei)
  const actions = computed(() => snapshot.value.actions)
  const serverNow = computed(() => Date.now() + serverClockOffset.value)
  const tabBadges = computed<Partial<Record<ActivityTabKey, boolean>>>(() => ({
    travel: actions.value.claimPass.available,
    constellation: actions.value.lightConstellation.available,
    solar: actions.value.claimSolar.available,
  }))

  function reset() {
    requestVersion.value += 1
    dewTargetsRequestVersion += 1
    snapshot.value = normalizeActivitySnapshot({})
    loading.value = false
    error.value = ''
    actionError.value = ''
    notice.value = ''
    loadedAccountId.value = ''
    serverClockOffset.value = 0
    dewTargets.value = null
    dewTargetsLoading.value = false
    dewTargetsError.value = ''
    dewUsedLandIdsByInstance.value = {}
    pendingActions.value = { claimPass: false, lightConstellation: false, claimSolar: false, exchange: false, claimQixiBridge: false, giftQixiSachet: false, useQixiDew: false, claimQingMeiSeed: false, startQingMeiBrew: false, continueQingMeiBrew: false, settleQingMeiBrew: false }
  }

  function clearActionMessages() {
    actionError.value = ''
    notice.value = ''
  }

  function isCurrent(version: number, accountId: string) {
    const storedAccountId = typeof localStorage === 'undefined' ? accountId : String(localStorage.getItem('current_account_id') || '')
    return requestVersion.value === version && storedAccountId === accountId
  }

  function applySnapshot(value: unknown, clientStartedAt = Date.now()) {
    const normalized = normalizeActivitySnapshot(value)
    snapshot.value = normalized
    const serverTime = [normalized.serverTime, normalized.season?.serverTime, normalized.shop?.serverTime, normalized.solarTerms?.serverTime, normalized.constellation?.serverTime, normalized.qixi?.serverTime]
      .find(value => value !== null && value !== undefined)
    if (serverTime !== undefined && serverTime !== null)
      serverClockOffset.value = serverTime - Math.round((clientStartedAt + Date.now()) / 2)
  }

  async function fetchSnapshot(accountId: string) {
    try {
      const response = await api.get('/api/activity-center/snapshot', {
        headers: { 'x-account-id': accountId },
        skipErrorToast: true,
      } as any)
      return responsePayload(response.data)
    }
    catch (snapshotError: any) {
      if (snapshotError?.response?.status !== 404)
        throw snapshotError
      const seasonResponse = await api.get('/api/activity-center/season', { headers: { 'x-account-id': accountId }, skipErrorToast: true } as any)
      const shopResponse = await api.get('/api/activity-center/shop', { headers: { 'x-account-id': accountId }, skipErrorToast: true } as any)
      const solarResponse = await api.get('/api/activity-center/solar-terms', { headers: { 'x-account-id': accountId }, skipErrorToast: true } as any)
      return {
        season: responsePayload(seasonResponse.data),
        shop: responsePayload(shopResponse.data),
        solarTerms: responsePayload(solarResponse.data),
      }
    }
  }

  async function performLoad(requestedAccountId: string, force: boolean) {
    if (!force && loadedAccountId.value === requestedAccountId)
      return true

    const version = ++requestVersion.value
    const clientStartedAt = Date.now()
    loading.value = true
    error.value = ''
    actionError.value = ''
    notice.value = ''
    if (loadedAccountId.value !== requestedAccountId) {
      snapshot.value = normalizeActivitySnapshot({})
      loadedAccountId.value = ''
      serverClockOffset.value = 0
    }

    try {
      const value = await fetchSnapshot(requestedAccountId)
      if (!isCurrent(version, requestedAccountId))
        return false
      applySnapshot(value, clientStartedAt)
      loadedAccountId.value = requestedAccountId
      return true
    }
    catch (loadError) {
      if (isCurrent(version, requestedAccountId)) {
        error.value = errorMessage(loadError)
        loadedAccountId.value = requestedAccountId
      }
      return false
    }
    finally {
      if (requestVersion.value === version)
        loading.value = false
    }
  }

  function load(accountId: string, force = false) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId) {
      reset()
      error.value = '请先选择账号'
      return Promise.resolve(false)
    }
    const pending = pendingLoads.get(requestedAccountId)
    if (pending)
      return pending

    const request = performLoad(requestedAccountId, force)
    pendingLoads.set(requestedAccountId, request)
    void request.finally(() => {
      if (pendingLoads.get(requestedAccountId) === request)
        pendingLoads.delete(requestedAccountId)
    })
    return request
  }

  function clearQixiDewTargets() {
    dewTargetsRequestVersion += 1
    dewTargets.value = null
    dewTargetsLoading.value = false
    dewTargetsError.value = ''
  }

  function qixiDewUsageKey(hostGid: string) {
    const activity = qixi.value
    return [
      loadedAccountId.value,
      activity?.activityId || activity?.groupId || '',
      activity?.startTime || '',
      String(hostGid || ''),
    ].join(':')
  }

  function getQixiDewUsedLandIds(hostGid: string) {
    return dewUsedLandIdsByInstance.value[qixiDewUsageKey(hostGid)] || []
  }

  function recordQixiDewUsage(result: ActivityRecord) {
    const hostGid = text(result.hostGid, result.host_gid)
    const rawIds = first(result.usedLandIds, result.used_land_ids)
    const usedLandIds = Array.isArray(rawIds) ? rawIds.map(value => text(value)).filter(Boolean) : []
    if (!hostGid || usedLandIds.length === 0)
      return
    const key = qixiDewUsageKey(hostGid)
    const merged = new Set([...(dewUsedLandIdsByInstance.value[key] || []), ...usedLandIds])
    dewUsedLandIdsByInstance.value = {
      ...dewUsedLandIdsByInstance.value,
      [key]: [...merged],
    }
  }

  async function fetchQixiDewTargets(accountId: string, hostGid = '') {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId) {
      clearQixiDewTargets()
      dewTargetsError.value = '请先选择账号'
      return false
    }

    const version = ++dewTargetsRequestVersion
    dewTargetsLoading.value = true
    dewTargetsError.value = ''
    try {
      const response = await api.get('/api/activity-center/qixi/dew/targets', {
        headers: { 'x-account-id': requestedAccountId },
        params: hostGid ? { hostGid } : {},
        skipErrorToast: true,
      } as any)
      const normalized = normalizeQixiDewTargets(responsePayload(response.data))
      if (version !== dewTargetsRequestVersion)
        return false
      dewTargets.value = normalized
      if (!normalized)
        dewTargetsError.value = '未能读取灵露候选地块'
      return !!normalized
    }
    catch (targetError) {
      if (version === dewTargetsRequestVersion) {
        dewTargets.value = null
        dewTargetsError.value = errorMessage(targetError, '加载灵露候选地块失败')
      }
      return false
    }
    finally {
      if (version === dewTargetsRequestVersion)
        dewTargetsLoading.value = false
    }
  }

  async function mutate(key: ActivityMutationKey, path: string, accountId: string, payload: ActivityRecord = {}) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId || pendingActions.value[key])
      return false
    const version = requestVersion.value
    pendingActions.value[key] = true
    actionError.value = ''
    notice.value = ''
    try {
      const response = await api.post(`/api/activity-center${path}`, payload, {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
      } as any)
      const result = responsePayload(response.data)
      if (!isCurrent(version, requestedAccountId))
        return false
      const resultRecord = record(result)
      const mutationSnapshot = first(resultRecord.snapshot, resultRecord.activityCenter, resultRecord.activity_center)
      if (mutationSnapshot)
        applySnapshot(mutationSnapshot)
      else
        await load(requestedAccountId, true)
      const rewards = records(resultRecord.rewards).map(normalizeItem).filter(item => item.id || item.name)
      const rewardSummary = rewards.map(item => `${item.name || item.id}${item.count ? ` ×${item.count}` : ''}`).join('、')
      notice.value = text(resultRecord.message, record(response.data).message, rewardSummary ? `获得 ${rewardSummary}` : '操作成功')
      return resultRecord
    }
    catch (mutationError) {
      if (isCurrent(version, requestedAccountId))
        actionError.value = errorMessage(mutationError, '活动操作失败')
      return false
    }
    finally {
      pendingActions.value[key] = false
    }
  }

  function claimPass(accountId: string) {
    return mutate('claimPass', '/pass/claim', accountId)
  }

  function lightConstellation(accountId: string) {
    return mutate('lightConstellation', '/constellation/light', accountId)
  }

  function claimSolarTerm(accountId: string, termId: string) {
    return mutate('claimSolar', `/solar-terms/${encodeURIComponent(termId)}/claim`, accountId)
  }

  function exchangeStarSandGoods(accountId: string, goodsId: string, count: number) {
    return mutate('exchange', '/shop/exchange', accountId, { goodsId, count })
  }

  function claimQixiBridgeRewards(accountId: string) {
    return mutate('claimQixiBridge', '/qixi/bridge/claim', accountId)
  }

  function giftQixiSachet(accountId: string, friendGid: string, messageTextId = 15) {
    return mutate('giftQixiSachet', '/qixi/gift', accountId, { friendGid, messageTextId })
  }

  async function useQixiDewBatch(accountId: string, hostGid: string, landIds: string[], refreshTargets = true) {
    const result = await mutate('useQixiDew', '/qixi/dew/use-batch', accountId, { hostGid, landIds })
    if (result) {
      recordQixiDewUsage(result)
      if (refreshTargets)
        await fetchQixiDewTargets(accountId, hostGid)
    }
    return result
  }

  function useQixiDew(accountId: string, hostGid: string, landId: string) {
    return useQixiDewBatch(accountId, hostGid, [landId])
  }

  function claimQingMeiDailySeed(accountId: string) {
    return mutate('claimQingMeiSeed', '/qingmei/daily-seed/claim', accountId)
  }

  function startQingMeiBrew(accountId: string, ingredients: Array<{ uid: string, count: number }>) {
    return mutate('startQingMeiBrew', '/qingmei/brew/start', accountId, { ingredients })
  }

  function continueQingMeiBrew(accountId: string) {
    return mutate('continueQingMeiBrew', '/qingmei/brew/continue', accountId)
  }

  function settleQingMeiBrew(accountId: string) {
    return mutate('settleQingMeiBrew', '/qingmei/brew/settle', accountId)
  }

  function lazyLoad(accountId: string) {
    return load(accountId, false)
  }

  function refresh(accountId: string) {
    return load(accountId, true)
  }

  return {
    snapshot,
    activities,
    season,
    shop,
    solar,
    solarTerms,
    constellation,
    qixi,
    qingMei,
    actions,
    tabBadges,
    loading,
    error,
    actionError,
    notice,
    loadedAccountId,
    serverClockOffset,
    serverNow,
    pendingActions,
    dewTargets,
    dewTargetsLoading,
    dewTargetsError,
    dewUsedLandIdsByInstance,
    lazyLoad,
    refresh,
    claimPass,
    lightConstellation,
    claimSolarTerm,
    exchangeStarSandGoods,
    claimQixiBridgeRewards,
    giftQixiSachet,
    fetchQixiDewTargets,
    clearQixiDewTargets,
    getQixiDewUsedLandIds,
    useQixiDew,
    useQixiDewBatch,
    claimQingMeiDailySeed,
    startQingMeiBrew,
    continueQingMeiBrew,
    settleQingMeiBrew,
    clearActionMessages,
    reset,
  }
})
