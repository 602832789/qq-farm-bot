<script setup lang="ts">
import type { ActivityTab } from '@/components/activity/BottomNav.vue'
import type { ActivityDirectoryItemDto, ActivityGameplayKey, ShopGoodsDto } from '@/stores/activity-center'
import { useNotification } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ActivityHeader from '@/components/activity/ActivityHeader.vue'
import ActivityShell from '@/components/activity/ActivityShell.vue'
import BottomNav from '@/components/activity/BottomNav.vue'
import { activityHasGameplay, resolveActivityGameplay } from '@/components/activity/gameplays'
import QixiActivityView from '@/components/activity/gameplays/qixi/QixiActivityView.vue'
import { ConstellationTab, SolarTermsTab, StarSandExchangeDialog, StarSandShopTab, TravelPassTab } from '@/components/activity/gameplays/stellar'
import { useAccountStore } from '@/stores/account'
import { useActivityCenterStore } from '@/stores/activity-center'
import { useFriendStore } from '@/stores/friend'

const router = useRouter()
const notification = useNotification()
const accountStore = useAccountStore()
const activityStore = useActivityCenterStore()
const friendStore = useFriendStore()
const { currentAccountId } = storeToRefs(accountStore)
const { activities, season, shop, solarTerms, constellation, qixi, actions, tabBadges, loading, error, actionError, notice, loadedAccountId, serverClockOffset, pendingActions, dewTargets, dewTargetsLoading, dewTargetsError } = storeToRefs(activityStore)
const { friends, loading: friendsLoading } = storeToRefs(friendStore)
const activeTab = ref<ActivityTab>('travel')
const selectedActivity = ref<ActivityGameplayKey | null>(null)
const selectedShopGoods = ref<ShopGoodsDto | null>(null)
const clockNow = ref(Date.now())
let clockTimer: number | undefined

type ActivityStatus = 'active' | 'upcoming' | 'ended'

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const currentData = computed(() => activeTab.value === 'shop' ? shop.value : activeTab.value === 'solar' ? solarTerms.value : activeTab.value === 'constellation' ? constellation.value : season.value)
const serverNow = computed(() => clockNow.value + serverClockOffset.value)
const accountDataLoaded = computed(() => !!currentAccountId.value && loadedAccountId.value === String(currentAccountId.value))
const stellarDetailsAvailable = computed(() => !!(season.value || shop.value || constellation.value || solarTerms.value))
const displayActivities = computed<ActivityDirectoryItemDto[]>(() => {
  const entries = activities.value.length > 0
    ? [...activities.value]
    : stellarDetailsAvailable.value
      ? [{
        id: season.value?.pass?.activityId || season.value?.id || 'stellar',
        activityIds: [season.value?.pass?.activityId || season.value?.id || 'stellar'],
        name: season.value?.title || '千星游记',
        startTime: season.value?.startTime || null,
        endTime: season.value?.endTime || null,
        gameplayKey: 'stellar',
        gameplayTargets: ['travel', 'constellation', 'shop', 'solar'],
        detailTarget: season.value?.pass ? 'travel' : constellation.value ? 'constellation' : shop.value ? 'shop' : 'solar',
      } satisfies ActivityDirectoryItemDto]
      : []

  const statusRank: Record<ActivityStatus, number> = { active: 0, upcoming: 1, ended: 2 }
  return entries.sort((left, right) => {
    const leftStatus = activityStatus(left)
    const rightStatus = activityStatus(right)
    if (leftStatus !== rightStatus)
      return statusRank[leftStatus] - statusRank[rightStatus]
    if (leftStatus === 'ended')
      return (right.endTime || 0) - (left.endTime || 0)
    return (left.startTime || 0) - (right.startTime || 0)
  })
})
const hasActivities = computed(() => displayActivities.value.length > 0)
const pageTitle = computed(() => currentData.value?.title || season.value?.title || '—')
const theme = computed(() => activeTab.value === 'solar' ? 'day' : 'night')
const endTime = computed(() => {
  if (activeTab.value === 'shop')
    return shop.value?.endTime
  if (selectedActivity.value === 'qixi')
    return qixi.value?.endTime
  if (activeTab.value === 'constellation')
    return constellation.value?.endTime || season.value?.endTime
  if (activeTab.value === 'solar')
    return season.value?.endTime
  return season.value?.endTime
})
const remaining = computed(() => {
  if (!endTime.value)
    return ''
  const diff = Math.max(0, endTime.value - serverNow.value)
  if (diff === 0)
    return '活动已结束'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff % 86400000 / 3600000)
  const minutes = Math.floor(diff % 3600000 / 60000)
  return days > 0 ? `剩余：${days}天${hours}小时` : `剩余：${hours}小时${minutes}分钟`
})
const dewUsedLandIds = computed(() => {
  const hostGid = dewTargets.value?.host.gid || ''
  return hostGid ? activityStore.getQixiDewUsedLandIds(hostGid) : []
})
const balanceVisible = computed(() => activeTab.value === 'travel' || activeTab.value === 'shop')

function accountId() {
  return String(currentAccountId.value || '')
}
function load(force = false) {
  return force ? activityStore.refresh(accountId()) : activityStore.lazyLoad(accountId())
}
function activityStatus(activity: ActivityDirectoryItemDto): ActivityStatus {
  if (activity.endTime && serverNow.value >= activity.endTime)
    return 'ended'
  if (activity.startTime && serverNow.value < activity.startTime)
    return 'upcoming'
  return 'active'
}
function activityStatusLabel(activity: ActivityDirectoryItemDto) {
  return { active: '进行中', upcoming: '未开始', ended: '已结束' }[activityStatus(activity)]
}
function formatActivityPeriod(activity: ActivityDirectoryItemDto) {
  const start = activity.startTime ? dateFormatter.format(activity.startTime) : ''
  const end = activity.endTime ? dateFormatter.format(activity.endTime) : ''
  if (start && end)
    return `${start} - ${end}`
  if (start)
    return `${start} 开始`
  if (end)
    return `${end} 结束`
  return '活动时间待定'
}
async function openActivity(activity: ActivityDirectoryItemDto) {
  const gameplay = resolveActivityGameplay(activity)
  if (!gameplay)
    return
  if (gameplay.module.key === 'stellar')
    activeTab.value = gameplay.entryTab as ActivityTab
  selectedActivity.value = gameplay.module.key
  if (gameplay.module.key === 'qixi' && currentAccountId.value) {
    await activityStore.fetchQixiDewTargets(String(currentAccountId.value), '')
    await friendStore.fetchFriends(String(currentAccountId.value))
  }
}
function goBack() {
  if (selectedActivity.value) {
    if (selectedActivity.value === 'qixi')
      activityStore.clearQixiDewTargets()
    selectedActivity.value = null
    return
  }
  router.back()
}
function claimPass() {
  activityStore.claimPass(accountId())
}
function lightConstellation() {
  activityStore.lightConstellation(accountId())
}
function claimSolar(termId: string) {
  activityStore.claimSolarTerm(accountId(), termId)
}
function claimQixiBridge() {
  activityStore.claimQixiBridgeRewards(accountId())
}
function giftQixiSachet(friendGid: string) {
  activityStore.giftQixiSachet(accountId(), friendGid)
}
function loadQixiDewTargets(hostGid: string) {
  activityStore.fetchQixiDewTargets(accountId(), hostGid)
}
function useQixiDew(hostGid: string, landIds: string[]) {
  activityStore.useQixiDewBatch(accountId(), hostGid, landIds)
}
function refreshQixiFriends() {
  if (currentAccountId.value)
    friendStore.fetchFriends(String(currentAccountId.value), true)
}
async function refreshQixiActivity() {
  await load(true)
  await activityStore.fetchQixiDewTargets(accountId(), '')
}
function selectShopGoods(goods: ShopGoodsDto) {
  selectedShopGoods.value = goods
}
function closeExchangeDialog() {
  if (!pendingActions.value.exchange)
    selectedShopGoods.value = null
}
async function exchangeShopGoods(goodsId: string, count: number) {
  const succeeded = await activityStore.exchangeStarSandGoods(accountId(), goodsId, count)
  if (succeeded)
    selectedShopGoods.value = null
}

watch(currentAccountId, () => {
  selectedShopGoods.value = null
  load(true)
}, { flush: 'post' })
watch(activeTab, (tab) => {
  if (tab !== 'shop' && !pendingActions.value.exchange)
    selectedShopGoods.value = null
})
watch([notice, actionError], ([successMessage, failureMessage]) => {
  if (!selectedActivity.value)
    return

  if (failureMessage) {
    notification.error({
      title: '操作失败',
      content: failureMessage,
      duration: 5000,
      keepAliveOnHover: true,
    })
  }
  else if (successMessage) {
    notification.success({
      title: '操作成功',
      content: successMessage,
      duration: 3500,
      keepAliveOnHover: true,
    })
  }
  else {
    return
  }

  activityStore.clearActionMessages()
})
watch(stellarDetailsAvailable, (available) => {
  if (selectedActivity.value === 'stellar' && !available)
    selectedActivity.value = null
})
watch(qixi, (activity) => {
  if (selectedActivity.value === 'qixi' && !activity && !loading.value)
    selectedActivity.value = null
})
onMounted(() => {
  load(true)
  clockTimer = window.setInterval(() => clockNow.value = Date.now(), 1000)
})
onUnmounted(() => {
  if (clockTimer)
    window.clearInterval(clockTimer)
})
</script>

<template>
  <section v-if="!selectedActivity" class="activity-picker">
    <button type="button" class="picker-back" aria-label="返回" @click="goBack">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
    </button>
    <header class="picker-heading">
      <span>活动中心</span>
      <h1>{{ accountDataLoaded && !loading && !hasActivities ? '当前无活动' : '活动列表' }}</h1>
    </header>
    <div v-if="!currentAccountId" class="picker-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
      <span>选择账号后查看当前活动</span>
    </div>
    <div v-else-if="loading && !accountDataLoaded" class="picker-state">
      <div class="activity-spinner picker-spinner" />
      <strong>正在加载活动</strong>
    </div>
    <div v-else-if="error && !hasActivities" class="picker-state">
      <div class="i-carbon-warning-alt" />
      <strong>活动加载失败</strong>
      <span>{{ error }}</span>
      <button type="button" :disabled="loading" @click="load(true)">
        重新加载
      </button>
    </div>
    <div v-else-if="accountDataLoaded && !loading && !hasActivities" class="picker-state empty-activities">
      <div class="i-carbon-calendar" />
      <strong>当前无活动</strong>
      <span>服务器暂未返回活动配置</span>
      <button type="button" @click="load(true)">
        刷新活动
      </button>
    </div>
    <div v-else class="picker-list">
      <button
        v-for="activity in displayActivities"
        :key="activity.id"
        type="button"
        class="activity-entry"
        :class="[`activity-entry--${activityStatus(activity)}`, { 'activity-entry--supported': activityHasGameplay(activity) }]"
        :disabled="!activityHasGameplay(activity)"
        @click="openActivity(activity)"
      >
        <span class="activity-entry__topline">
          <span class="activity-entry__icon"><span class="i-carbon-calendar" /></span>
          <span class="activity-entry__status">{{ activityStatusLabel(activity) }}</span>
        </span>
        <strong>{{ activity.name }}</strong>
        <span class="activity-entry__period">{{ formatActivityPeriod(activity) }}</span>
        <span class="activity-entry__footer">
          <small>{{ activity.id }}</small>
          <span v-if="activityHasGameplay(activity)">查看详情 <span class="i-carbon-arrow-right" /></span>
          <span v-else>暂未支持详情 <span class="i-carbon-locked" /></span>
        </span>
      </button>
    </div>
  </section>

  <ActivityShell v-else-if="selectedActivity === 'stellar'" :theme="theme">
    <div class="activity-center">
      <ActivityHeader :title="pageTitle" :remaining="remaining" :balance="balanceVisible ? (shop?.balanceKnown ? (shop.balance ?? '0') : '--') : undefined" :currency-image="shop?.currency.image" :currency-name="shop?.currency.name" :loading="loading" :show-refresh="activeTab !== 'constellation'" @back="goBack" @refresh="load(true)" />
      <div v-if="!currentAccountId" class="activity-state">
        <strong>请先选择账号</strong><span>活动数据按当前账号加载</span>
      </div>
      <div v-else-if="loading && !season && !shop && !solarTerms && !constellation" class="activity-state">
        <div class="activity-spinner" /><strong>正在加载活动</strong>
      </div>
      <template v-else>
        <div v-if="error" class="activity-message" role="status">
          <span>{{ error }}</span><button type="button" :disabled="loading" @click="load(true)">
            重试
          </button>
        </div>
        <main class="activity-content" :class="{ 'activity-content--travel': activeTab === 'travel' }">
          <TravelPassTab v-if="activeTab === 'travel'" :season="season" :enabled="actions.claimPass.enabled" :pending="pendingActions.claimPass" @claim="claimPass" />
          <ConstellationTab v-else-if="activeTab === 'constellation'" :constellation="constellation" :enabled="actions.lightConstellation.enabled" :pending="pendingActions.lightConstellation" @light="lightConstellation" />
          <StarSandShopTab v-else-if="activeTab === 'shop'" :shop="shop" :enabled="actions.exchange.enabled" :pending="pendingActions.exchange" @select="selectShopGoods" />
          <SolarTermsTab v-else :solar="solarTerms" :now="serverNow" :pending="pendingActions.claimSolar" @claim="claimSolar" />
        </main>
      </template>
      <BottomNav v-model="activeTab" :badges="tabBadges" />
      <StarSandExchangeDialog
        :open="!!selectedShopGoods"
        :goods="selectedShopGoods"
        :shop="shop"
        :pending="pendingActions.exchange"
        @close="closeExchangeDialog"
        @confirm="exchangeShopGoods"
      />
    </div>
  </ActivityShell>

  <ActivityShell v-else-if="selectedActivity === 'qixi'" theme="day">
    <div class="activity-center">
      <ActivityHeader
        :title="qixi?.title || '鹊桥寄情'"
        :remaining="remaining"
        :balance="qixi?.balances.known ? (qixi.balances.feather || '0') : '--'"
        :currency-image="qixi?.feather.image"
        :currency-name="qixi?.feather.name || '鹊羽'"
        :loading="loading"
        show-refresh
        @back="goBack"
        @refresh="refreshQixiActivity"
      />
      <div v-if="!currentAccountId" class="activity-state qixi-state">
        <strong>请先选择账号</strong><span>活动数据按当前账号加载</span>
      </div>
      <div v-else-if="loading && !qixi" class="activity-state qixi-state">
        <div class="activity-spinner" /><strong>正在加载鹊桥活动</strong>
      </div>
      <template v-else>
        <div v-if="error || actionError || notice" class="activity-message" :class="{ success: notice && !error && !actionError }" role="status">
          <span>{{ actionError || error || notice }}</span><button v-if="error" type="button" :disabled="loading" @click="load(true)">
            重试
          </button>
        </div>
        <main class="activity-content qixi-content">
          <QixiActivityView
            :activity="qixi"
            :friends="friends"
            :friends-loading="friendsLoading"
            :pending-bridge="pendingActions.claimQixiBridge"
            :pending-gift="pendingActions.giftQixiSachet"
            :pending-dew="pendingActions.useQixiDew"
            :dew-targets="dewTargets"
            :dew-targets-loading="dewTargetsLoading"
            :dew-targets-error="dewTargetsError"
            :dew-used-land-ids="dewUsedLandIds"
            @claim-bridge="claimQixiBridge"
            @gift="giftQixiSachet"
            @load-dew-targets="loadQixiDewTargets"
            @use-dew="useQixiDew"
            @refresh-friends="refreshQixiFriends"
          />
        </main>
      </template>
    </div>
  </ActivityShell>
</template>

<style scoped>
.activity-picker {
  position: relative;
  width: 100%;
  min-height: calc(100dvh - 48px);
  overflow: auto;
  padding: 30px;
  border: 1px solid rgba(44, 78, 66, 0.12);
  border-radius: 16px;
  color: #173b31;
  background: #e8f2e8;
}
.picker-back {
  position: absolute;
  top: 28px;
  left: 30px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #aec7b8;
  border-radius: 50%;
  color: #315d4c;
  background: #fff;
  line-height: 0;
  cursor: pointer;
}
.picker-back svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.picker-heading {
  width: 100%;
  margin: 62px 0 22px;
}
.picker-heading span {
  color: #6e8579;
  font-size: 12px;
  font-weight: 700;
}
.picker-heading h1 {
  margin: 3px 0 0;
  font-size: 32px;
  letter-spacing: 0;
}
.picker-list {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
}
.picker-state {
  width: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 auto;
  padding: 30px;
  color: #587165;
  text-align: center;
}
.picker-state > div {
  font-size: 38px;
}
.picker-state strong {
  font-size: 18px;
}
.picker-state span {
  max-width: 420px;
  color: #72877d;
  font-size: 12px;
}
.picker-state button {
  height: 36px;
  margin-top: 8px;
  padding: 0 15px;
  border: 1px solid #9eb9aa;
  border-radius: 6px;
  color: #315d4c;
  background: white;
  font-weight: 700;
  cursor: pointer;
}
.picker-state button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.picker-state .picker-spinner {
  width: 42px;
  height: 42px;
  border-color: rgba(49, 93, 76, 0.2);
  border-top-color: #315d4c;
  font-size: 0;
}
.empty-activities > div {
  color: #71897d;
}
.activity-entry {
  position: relative;
  min-height: 260px;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 20px;
  border: 1px solid rgba(25, 73, 53, 0.18);
  border-radius: 8px;
  color: #fff;
  text-align: left;
  box-shadow: 0 8px 24px rgba(34, 68, 48, 0.14);
  cursor: pointer;
}
.activity-entry::after {
  content: '';
  position: absolute;
  inset: 35% 0 0;
  background: linear-gradient(transparent, rgba(7, 40, 29, 0.88));
}
.activity-entry img {
  position: absolute;
  inset: 20px 18px auto;
  width: calc(100% - 36px);
  height: 145px;
  object-fit: contain;
}
.activity-entry span,
.activity-entry small {
  position: relative;
  z-index: 1;
}
.activity-entry span {
  font-size: 21px;
  font-weight: 800;
}
.activity-entry small {
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
}
.activity-center {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.activity-content {
  position: absolute;
  inset: calc(110px + env(safe-area-inset-top)) 24px 24px 260px;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid rgba(48, 79, 68, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.42);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(172, 224, 246, 0.5) transparent;
}
.activity-message {
  position: absolute;
  z-index: 25;
  top: calc(102px + env(safe-area-inset-top));
  left: 272px;
  right: 36px;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  border: 1px solid rgba(255, 220, 142, 0.6);
  border-radius: 10px;
  color: #fff0c2;
  background: rgba(88, 51, 28, 0.86);
  font-size: 10px;
}
.activity-message.success {
  border-color: rgba(179, 242, 202, 0.65);
  color: #e5ffed;
  background: rgba(30, 91, 67, 0.83);
}
.activity-message button {
  flex: none;
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 8px;
  color: white;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
}
.activity-state {
  position: absolute;
  z-index: 5;
  inset: calc(110px + env(safe-area-inset-top)) 24px 24px 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #c9e7f7;
  text-align: center;
}
.activity-state strong {
  margin-top: 12px;
  font-size: 16px;
}
.activity-state span {
  margin-top: 4px;
  color: #9ec7dc;
  font-size: 11px;
}
.activity-spinner {
  width: 43px;
  height: 43px;
  border: 3px solid rgba(180, 232, 250, 0.25);
  border-top-color: #dff9ff;
  border-radius: 50%;
  animation: spin 0.85s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.qixi-content {
  inset: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}
.qixi-state {
  inset: calc(86px + env(safe-area-inset-top)) 0 0;
}
@media (max-width: 1100px) and (min-width: 901px) {
  .picker-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .activity-picker {
    padding-top: 76px;
  }
  .picker-list {
    grid-template-columns: 1fr;
  }
  .activity-entry {
    min-height: 220px;
  }
  .activity-entry img {
    height: 120px;
  }
}

@media (max-width: 900px) {
  .activity-picker {
    min-height: calc(100dvh - 72px);
    padding: 18px 12px 24px;
    border-radius: 12px;
  }
  .picker-back {
    top: 16px;
    left: 14px;
  }
  .picker-heading {
    margin-top: 58px;
  }
  .activity-content,
  .activity-state {
    inset: calc(136px + env(safe-area-inset-top)) 10px 10px;
    border-radius: 12px;
  }
  .activity-content--travel {
    overflow: hidden;
  }
  .activity-message {
    top: calc(128px + env(safe-area-inset-top));
    right: 18px;
    left: 18px;
  }
  .qixi-content {
    inset: 0;
    border-radius: 0;
  }
  .qixi-state {
    inset: calc(72px + env(safe-area-inset-top)) 0 0;
  }
}

.activity-picker {
  color: #172b25;
  background: linear-gradient(
    145deg,
    rgba(225, 241, 235, 0.96),
    rgba(246, 248, 247, 0.98) 48%,
    rgba(235, 239, 247, 0.96)
  );
}
.picker-back {
  border-color: rgba(41, 78, 65, 0.18);
  color: #25483c;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 8px 24px rgba(31, 66, 53, 0.1);
  backdrop-filter: blur(18px) saturate(130%);
}
.picker-heading,
.picker-list,
.picker-state {
  width: 100%;
}
.picker-heading {
  margin-bottom: 18px;
}
.picker-heading span {
  color: #61766e;
}
.picker-heading h1 {
  color: #172b25;
  font-size: 28px;
}
.picker-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.activity-entry {
  min-height: 176px;
  justify-content: flex-start;
  gap: 0;
  padding: 16px;
  border: 1px solid rgba(48, 73, 64, 0.14);
  border-radius: 8px;
  color: #172b25;
  background: rgba(255, 255, 255, 0.64);
  box-shadow:
    0 10px 30px rgba(31, 55, 47, 0.08),
    inset 0 1px rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px) saturate(135%);
  appearance: none;
}
.activity-entry::after {
  display: none;
}
.activity-entry span,
.activity-entry small {
  position: static;
  z-index: auto;
}
.activity-entry span {
  font-size: inherit;
  font-weight: inherit;
}
.activity-entry small {
  margin: 0;
  color: #73817c;
  font-size: 10px;
}
.activity-entry--active {
  border-color: rgba(27, 139, 99, 0.34);
}
.activity-entry--upcoming {
  border-color: rgba(186, 125, 27, 0.3);
}
.activity-entry--ended {
  border-color: rgba(89, 102, 97, 0.18);
  background: rgba(245, 247, 246, 0.58);
}
.activity-entry--supported {
  cursor: pointer;
}
.activity-entry--supported:hover {
  border-color: rgba(35, 112, 86, 0.44);
  box-shadow:
    0 14px 34px rgba(31, 74, 58, 0.14),
    inset 0 1px rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}
.activity-entry:disabled {
  cursor: default;
  opacity: 1;
}
.activity-entry__topline,
.activity-entry__footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.activity-entry__topline {
  margin-bottom: 17px;
}
.activity-entry__icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: #27684f;
  background: rgba(207, 235, 224, 0.8);
}
.activity-entry__icon > span {
  font-size: 16px;
}
.activity-entry--upcoming .activity-entry__icon {
  color: #8a5b13;
  background: rgba(246, 226, 187, 0.82);
}
.activity-entry--ended .activity-entry__icon {
  color: #68736f;
  background: rgba(224, 229, 227, 0.9);
}
.activity-entry__status {
  padding: 3px 8px;
  border: 1px solid rgba(33, 127, 91, 0.2);
  border-radius: 999px;
  color: #20724f;
  background: rgba(226, 245, 237, 0.72);
  font-size: 10px !important;
  font-weight: 700 !important;
}
.activity-entry--upcoming .activity-entry__status {
  border-color: rgba(177, 118, 23, 0.2);
  color: #8c5a0c;
  background: rgba(250, 237, 209, 0.74);
}
.activity-entry--ended .activity-entry__status {
  border-color: rgba(95, 107, 102, 0.15);
  color: #68736f;
  background: rgba(231, 235, 233, 0.76);
}
.activity-entry > strong {
  width: 100%;
  overflow: hidden;
  color: #172b25;
  font-size: 17px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-entry__period {
  margin-top: 5px;
  color: #65756f;
  font-size: 11px !important;
}
.activity-entry__footer {
  margin-top: auto;
  padding-top: 15px;
  color: #65756f;
}
.activity-entry__footer > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
}
.activity-entry--supported .activity-entry__footer > span {
  color: #27684f;
}
.activity-entry__footer .i-carbon-arrow-right,
.activity-entry__footer .i-carbon-locked {
  font-size: 13px;
}

@media (max-width: 620px) {
  .picker-heading h1 {
    font-size: 25px;
  }
  .picker-list {
    grid-template-columns: 1fr;
  }
  .activity-entry {
    min-height: 164px;
  }
}

.activity-picker {
  min-height: calc(100dvh - 72px);
  padding: 24px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-card);
  color: var(--ui-ink);
  background: rgba(255, 255, 255, 0.58);
  box-shadow: var(--ui-shadow-sm);
}
.picker-back {
  top: 22px;
  left: 24px;
  width: 38px;
  height: 38px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  color: var(--ui-primary);
  background: var(--ui-surface);
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.picker-heading {
  margin: 54px 0 18px;
}
.picker-heading span {
  color: var(--ui-primary);
}
.picker-heading h1 {
  color: var(--ui-ink);
  font-size: 27px;
}
.picker-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.activity-entry {
  min-height: 168px;
  padding: 16px;
  border-color: var(--ui-border);
  color: var(--ui-ink);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.activity-entry--supported:hover {
  border-color: rgba(67, 141, 99, 0.3);
  box-shadow: var(--ui-shadow-md);
}
.activity-entry__icon {
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
}
.activity-entry__status {
  border-color: rgba(67, 141, 99, 0.18);
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
}
.activity-entry--upcoming .activity-entry__icon,
.activity-entry--upcoming .activity-entry__status {
  color: #93651e;
  background: var(--ui-warning-soft);
}
.activity-entry--ended .activity-entry__icon,
.activity-entry--ended .activity-entry__status {
  color: var(--ui-muted);
  background: var(--ui-bg-soft);
}
.activity-entry > strong {
  color: var(--ui-ink);
}
.activity-entry__period,
.activity-entry__footer,
.activity-entry small {
  color: var(--ui-muted);
}
.activity-entry--supported .activity-entry__footer > span {
  color: var(--ui-primary);
}
.activity-content {
  border-color: var(--ui-border);
  border-radius: var(--ui-radius-card);
  background: rgba(255, 255, 255, 0.54);
}
.activity-message {
  border-color: rgba(201, 95, 102, 0.2);
  color: #9a4048;
  background: rgba(250, 233, 234, 0.94);
}
.activity-message.success {
  border-color: rgba(67, 141, 99, 0.2);
  color: #2e714b;
  background: rgba(228, 241, 231, 0.94);
}
.activity-message button {
  border-color: currentColor;
  color: inherit;
  background: transparent;
}
.activity-state {
  color: var(--ui-ink);
}
.activity-state span {
  color: var(--ui-muted);
}
.activity-spinner {
  border-color: rgba(67, 141, 99, 0.18);
  border-top-color: var(--ui-primary);
}
@media (max-width: 1100px) and (min-width: 621px) {
  .picker-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .activity-picker {
    min-height: auto;
    padding: 18px 12px 24px;
  }
  .activity-content,
  .activity-state {
    border-radius: var(--ui-radius-card);
  }
}
@media (max-width: 620px) {
  .picker-list {
    grid-template-columns: 1fr;
  }
}
.qixi-content {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}
.qixi-state {
  border-radius: 0 !important;
}
</style>
