<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ActivityItemDto, WeatherActivityDto, WeatherFriendDto, WeatherResearchNodeDto } from '@/stores/activity-center'
import { computed, ref } from 'vue'

const props = defineProps<{
  activity: WeatherActivityDto | null
  now: number
  pendingExchange: boolean
  pendingScan: boolean
  pendingCollect: boolean
  pendingFrog: boolean
  pendingCloud: boolean
  pendingSummon: boolean
  pendingResearch: boolean
}>()

const emit = defineEmits<{
  exchange: []
  scanFriends: []
  collect: [friendGid: string]
  frog: [friendGid: string]
  cloud: [friendGid: string, landId: string]
  summon: []
  advanceResearch: [nodeId: string]
}>()

const failedAvatars = ref(new Set<string>())
const primaryItemIds = ['1027', '5001', '5002', '5005', '5006']
const knownItemNames: Record<string, string> = {
  1027: '雷电徽章',
  5001: '天气采集瓶',
  5002: '雷雨召唤瓶',
  5003: '闪电变异瓶',
  5004: '雷击木瓶',
  5005: '青蛙使坏瓶',
  5006: '乌云使坏瓶',
  5007: '雷纹礼盒',
  5008: '天气礼盒',
}

const resourceItems = computed(() => primaryItemIds.map(itemById))
const summonBottle = computed(() => itemById('5002'))
const collectorBottle = computed(() => itemById('5001'))
const frogBottle = computed(() => itemById('5005'))
const cloudBottle = computed(() => itemById('5006'))
const ownRemainingSec = computed(() => remainingSeconds(props.activity?.ownWeather.endTime))
const ownDurationSec = computed(() => props.activity?.ownWeather.durationSec || 7200)
const weatherProgress = computed(() => {
  if (!props.activity?.ownWeather.isThunderstorm || !ownDurationSec.value)
    return 0
  return Math.min(100, Math.max(0, ownRemainingSec.value / ownDurationSec.value * 100))
})
const friendActionPending = computed(() => props.pendingCollect || props.pendingFrog || props.pendingCloud)
const inspectedCount = computed(() => props.activity?.friends.filter(friend => friend.inspected).length || 0)
const availableFriendCount = computed(() => props.activity?.friends.filter(friend => friend.canCollect).length || 0)
const weatherState = computed(() => {
  if (!props.activity?.active)
    return { label: '活动已结束', detail: '活动天气操作已关闭', className: 'ended', icon: 'i-carbon-time' }
  if (props.activity.ownWeather.isThunderstorm)
    return { label: '雷雨进行中', detail: '闪电变异窗口开启', className: 'storm', icon: 'i-carbon-thunderstorm' }
  if (props.activity.ownWeather.active)
    return { label: '特殊天气进行中', detail: '结束前不能重复召唤雷雨', className: 'special', icon: 'i-carbon-cloud' }
  return { label: '当前无雷雨', detail: '作物按普通天气生长', className: 'clear', icon: 'i-carbon-sun' }
})
const mutationName = computed(() => {
  const id = props.activity?.mutation.mutantConfigId || 0
  return ({ 12: '闪电', 13: '喜鹊', 14: '晶辉' } as Record<number, string>)[id] || '活动'
})

function itemById(id: string): ActivityItemDto {
  const source = props.activity?.inventory.find(item => item.id === id)
  return source
    ? { ...source, name: source.name || knownItemNames[id] || `物品 ${id}` }
    : { id, name: knownItemNames[id] || `物品 ${id}`, count: '0', image: '', rarity: null }
}

function countOf(item: ActivityItemDto) {
  const value = Number(item.count || 0)
  return Number.isFinite(value) ? value : 0
}

function remainingSeconds(endTime: number | null | undefined) {
  if (!endTime)
    return 0
  return Math.max(0, Math.ceil((endTime - props.now) / 1000))
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor(safe % 3600 / 60)
  const secs = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function friendRemaining(friend: WeatherFriendDto) {
  return formatDuration(remainingSeconds(friend.weather.endTime))
}

function friendState(friend: WeatherFriendDto) {
  if (friend.scanError)
    return { label: '检查失败', className: 'error', detail: friend.scanError }
  if (friend.availability === 'available')
    return { label: '可采雨', className: 'available', detail: `雷雨剩余 ${friendRemaining(friend)}` }
  if (friend.availability === 'collected')
    return { label: '今日已采', className: 'collected', detail: '今天不能再次采集' }
  if (friend.availability === 'expired')
    return { label: '已失效', className: 'expired', detail: '这场雷雨已经结束' }
  if (friend.availability === 'unavailable')
    return { label: '晴天', className: 'clear', detail: '当前不是雷雨天气' }
  return { label: '待检查', className: 'unknown', detail: '扫描后确认现场天气' }
}

function collectDisabled(friend: WeatherFriendDto) {
  return friendActionPending.value || !props.activity?.active || !friend.canCollect || countOf(collectorBottle.value) < 1
}

function frogDisabled(friend: WeatherFriendDto) {
  return friendActionPending.value || !props.activity?.active || !friend.gid || countOf(frogBottle.value) < 1
}

function cloudDisabled(friend: WeatherFriendDto) {
  return friendActionPending.value || !props.activity?.active || countOf(cloudBottle.value) < 1 || friend.eligibleCloudLandIds.length < 1
}

function markAvatarFailed(friend: WeatherFriendDto) {
  failedAvatars.value = new Set(failedAvatars.value).add(friend.gid)
}

function researchState(node: WeatherResearchNodeDto) {
  if (node.completed)
    return '已完成'
  if (node.availableByStatus)
    return node.affordable ? '可推进' : '徽章不足'
  return '待解锁'
}

function researchDisabled(node: WeatherResearchNodeDto) {
  return props.pendingResearch || !node.availableByStatus || !node.affordable || !props.activity?.research?.operateSupported
}

function rainStyle(index: number): CSSProperties {
  return {
    '--rain-left': `${(index * 19 + 5) % 103}%`,
    '--rain-delay': `${-((index * 0.31) % 2.4)}s`,
    '--rain-duration': `${1.45 + (index % 4) * 0.17}s`,
  } as CSSProperties
}
</script>

<template>
  <div class="weather-page">
    <section v-if="activity" class="resource-band" aria-label="活动物资">
      <div class="resource-band__title">
        <span class="i-carbon-rain-drop" />
        <div>
          <strong>活动物资</strong>
          <small>实时背包数量</small>
        </div>
      </div>
      <div class="resource-list">
        <article v-for="item in resourceItems" :key="item.id" class="resource-item">
          <img v-if="item.image" :src="item.image" alt="">
          <span v-else-if="item.id === '1027'" class="resource-fallback i-carbon-flash-filled" />
          <span v-else class="resource-fallback i-carbon-bottles-container" />
          <div>
            <small>{{ item.name }}</small>
            <strong>{{ item.count || '0' }}</strong>
          </div>
        </article>
      </div>
    </section>

    <template v-if="activity">
      <section class="weather-section own-weather-section">
        <div class="storm-board" :class="`storm-board--${weatherState.className}`">
          <div class="rain-field" aria-hidden="true">
            <i v-for="index in 18" :key="index" :style="rainStyle(index)" />
          </div>
          <div class="storm-copy">
            <span class="section-kicker">自家实时天气</span>
            <div class="weather-state-line">
              <span class="weather-state-icon" :class="weatherState.icon" />
              <div>
                <strong>{{ weatherState.label }}</strong>
                <small>{{ weatherState.detail }}</small>
              </div>
            </div>
            <div class="weather-clock" :aria-label="weatherState.label">
              {{ activity.ownWeather.isThunderstorm ? formatDuration(ownRemainingSec) : '--:--:--' }}
            </div>
            <div class="weather-progress" aria-hidden="true">
              <span :style="{ width: `${weatherProgress}%` }" />
            </div>
            <p>
              {{ activity.ownWeather.isThunderstorm ? '倒计时结束前，成长中的作物均处于闪电变异判定窗口。' : '可等待系统随机雷雨，或使用雷雨召唤瓶开启一场 2 小时雷雨。' }}
            </p>
          </div>

          <div class="mutation-sheet">
            <span class="mutation-sheet__eyebrow">本次活动变异</span>
            <strong>{{ mutationName }}变异 <em>#{{ activity.mutation.mutantConfigId }}</em></strong>
            <dl>
              <div><dt>基础概率</dt><dd>{{ activity.mutation.baseRatePercent }}%</dd></div>
              <div><dt>成熟售价</dt><dd>{{ activity.mutation.sellMultiplier }} 倍</dd></div>
              <div><dt>不参与</dt><dd>1 品、2 品</dd></div>
              <div><dt>天气时长</dt><dd>2 小时</dd></div>
            </dl>
            <p v-if="activity.mutation.mutantConfigId === 12">
              #14“晶辉”属于紫晶土地变异，不是本活动的闪电变异。
            </p>
          </div>
        </div>

        <aside class="weather-command-card">
          <span class="section-kicker">主动召唤</span>
          <div class="command-item">
            <img v-if="summonBottle.image" :src="summonBottle.image" alt="">
            <span v-else class="i-carbon-thunderstorm" />
            <div><strong>{{ summonBottle.name }}</strong><small>可用 {{ summonBottle.count || '0' }} 瓶</small></div>
          </div>
          <p>仅自己的农场可用；已有特殊天气时不能重复召唤。</p>
          <button
            type="button"
            class="primary-command"
            :disabled="pendingSummon || !activity.actions.summonThunderstorm.enabled"
            @click="emit('summon')"
          >
            <span v-if="pendingSummon" class="i-carbon-circle-dash animate-spin" />
            <span v-else class="i-carbon-thunderstorm" />
            {{ pendingSummon ? '正在召唤' : activity.ownWeather.isThunderstorm ? '雷雨进行中' : activity.ownWeather.active ? '已有特殊天气' : '召唤 2 小时雷雨' }}
          </button>
          <small class="command-reason">{{ activity.actions.summonThunderstorm.reason }}</small>
        </aside>
      </section>

      <section class="weather-section friend-weather-section">
        <header class="section-heading">
          <div>
            <span class="section-kicker">好友现场天气</span>
            <h2>找一场可以采的雨</h2>
            <p>现场天气以进入好友农场后的实时状态为准；同一好友当天采过后不能再次采集。</p>
          </div>
          <button
            type="button"
            class="scan-command"
            :disabled="pendingScan || !activity.actions.scanFriendWeather.enabled"
            @click="emit('scanFriends')"
          >
            <span v-if="pendingScan" class="i-carbon-circle-dash animate-spin" />
            <span v-else class="i-carbon-radar" />
            {{ pendingScan ? `正在检查 ${activity.friends.length} 位好友` : '重新扫描现场天气' }}
          </button>
        </header>

        <div class="friend-summary" role="status">
          <span><i class="status-dot status-dot--available" /> 可采 {{ availableFriendCount }}</span>
          <span><i class="status-dot status-dot--checked" /> 已检查 {{ inspectedCount }}/{{ activity.friends.length }}</span>
          <span><i class="i-carbon-bottles-container" /> 采集瓶 {{ collectorBottle.count || '0' }} · 每日上限 {{ activity.actions.collectWeather.dailyLimit || 10 }}</span>
          <span><i class="i-carbon-information" /> 采雨成功必得雷雨召唤瓶 ×1</span>
        </div>

        <div v-if="pendingScan && activity.friends.length === 0" class="friend-empty">
          <span class="i-carbon-circle-dash animate-spin" />
          <strong>正在逐个检查好友农场</strong>
          <small>扫描按官方客户端顺序进入并离开好友农场</small>
        </div>
        <div v-else-if="activity.friends.length" class="friend-grid">
          <article v-for="friend in activity.friends" :key="friend.gid" class="friend-card" :class="`friend-card--${friendState(friend).className}`">
            <header>
              <div class="friend-avatar">
                <img v-if="friend.avatarUrl && !failedAvatars.has(friend.gid)" :src="friend.avatarUrl" alt="" @error="markAvatarFailed(friend)">
                <span v-else class="i-carbon-user-avatar" />
              </div>
              <div class="friend-name">
                <strong>{{ friend.name || `好友 ${friend.gid}` }}</strong>
                <small>Lv.{{ friend.level || '--' }} · GID {{ friend.gid }}</small>
              </div>
              <span class="friend-state">{{ friendState(friend).label }}</span>
            </header>
            <p>{{ friendState(friend).detail }}</p>
            <div class="friend-actions">
              <button type="button" class="collect-command" :disabled="collectDisabled(friend)" @click="emit('collect', friend.gid)">
                <span v-if="pendingCollect" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-rain-drop" />
                {{ friend.availability === 'collected' ? '今日已采' : '采雨' }}
              </button>
              <button type="button" :disabled="frogDisabled(friend)" :title="`青蛙使坏瓶：库存 ${frogBottle.count}，每日上限 ${activity.actions.frogMischief.dailyLimit || 100}`" @click="emit('frog', friend.gid)">
                <span v-if="pendingFrog" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-pedestrian-child" />
                青蛙 · 30经验
              </button>
              <button type="button" :disabled="cloudDisabled(friend)" :title="friend.eligibleCloudLandIds.length ? `乌云使坏瓶：库存 ${cloudBottle.count}，每日上限 ${activity.actions.cloudMischief.dailyLimit || 100}` : '当前没有可放乌云的作物'" @click="emit('cloud', friend.gid, friend.eligibleCloudLandIds[0] || '')">
                <span v-if="pendingCloud" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-cloud" />
                乌云 · 30经验
              </button>
            </div>
          </article>
        </div>
        <div v-else class="friend-empty">
          <span class="i-carbon-cloud-offline" />
          <strong>还没有现场天气记录</strong>
          <small>点击“重新扫描现场天气”检查好友列表</small>
        </div>
      </section>

      <section class="support-grid">
        <article class="weather-section supply-section">
          <header class="compact-heading">
            <div><span class="section-kicker">每日补给</span><h2>观测站商城</h2></div>
            <span class="i-carbon-store" />
          </header>
          <div v-if="activity.shop" class="supply-card">
            <div class="supply-product">
              <img v-if="activity.shop.item.image" :src="activity.shop.item.image" alt="">
              <span v-else class="i-carbon-bottles-container" />
              <div><strong>{{ activity.shop.item.name || '天气采集瓶' }}</strong><small>每日限兑 {{ activity.shop.dailyLimit }} 次</small></div>
            </div>
            <div class="supply-cost">
              <span>需要</span>
              <strong>{{ activity.shop.cost.count }} {{ activity.shop.cost.name }}</strong>
              <small>现有 {{ activity.shop.balance }}</small>
            </div>
            <button type="button" :disabled="pendingExchange || !activity.actions.exchangeCollector.enabled" @click="emit('exchange')">
              <span v-if="pendingExchange" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-shopping-cart" />
              {{ pendingExchange ? '兑换中' : activity.shop.owned ? '今日已兑换' : '兑换采集瓶' }}
            </button>
            <p v-if="activity.shop.reason">{{ activity.shop.reason }}</p>
          </div>
          <div v-else class="compact-empty">服务端暂未返回观测站商品</div>
        </article>

        <article class="weather-section task-section">
          <header class="compact-heading">
            <div><span class="section-kicker">每日任务</span><h2>获取雷电徽章</h2></div>
            <span class="i-carbon-task-complete" />
          </header>
          <div v-if="activity.tasks.length" class="task-list">
            <article v-for="task in activity.tasks" :key="task.id">
              <span class="task-icon i-carbon-flash-filled" />
              <div><strong>{{ task.title }}</strong><small>{{ task.dailyLimit && task.dailyLimit !== '0' ? `每日最多 ${task.dailyLimit} 次` : '完成后发放' }}</small></div>
              <span class="task-reward">{{ task.reward.name || '雷电徽章' }} ×{{ task.reward.count }}</span>
            </article>
          </div>
          <div v-else class="compact-empty">当前没有可展示的气象任务</div>
        </article>
      </section>

      <section v-if="activity.research" class="weather-section research-section">
        <header class="section-heading">
          <div>
            <span class="section-kicker">依次解锁</span>
            <h2>气象研究线路</h2>
            <p>完成活动任务获得雷电徽章，再按节点顺序推进研究并领取奖励。</p>
          </div>
          <div class="badge-balance">
            <span class="i-carbon-flash-filled" />
            <div><small>雷电徽章</small><strong>{{ activity.research.badgeBalance }}</strong></div>
          </div>
        </header>
        <div class="research-track">
          <article
            v-for="(node, index) in activity.research.nodes"
            :key="node.id"
            class="research-node"
            :class="{ complete: node.completed, current: node.availableByStatus, locked: node.locked }"
          >
            <span class="node-index"><i v-if="node.completed" class="i-carbon-checkmark" /><template v-else>{{ index + 1 }}</template></span>
            <div class="node-card">
              <header><span>研究 {{ node.id }}</span><strong>{{ researchState(node) }}</strong></header>
              <div class="node-reward">
                <img v-if="node.reward.image" :src="node.reward.image" alt="">
                <span v-else class="i-carbon-gift" />
                <div><small>节点奖励</small><strong>{{ node.reward.name || node.reward.id }} ×{{ node.reward.count }}</strong></div>
              </div>
              <footer>
                <span><i class="i-carbon-flash-filled" /> {{ node.cost.count }}</span>
                <button v-if="node.availableByStatus" type="button" :disabled="researchDisabled(node)" @click="emit('advanceResearch', node.id)">
                  <span v-if="pendingResearch" class="i-carbon-circle-dash animate-spin" />
                  {{ pendingResearch ? '推进中' : '推进研究' }}
                </button>
              </footer>
            </div>
          </article>
        </div>
        <p v-if="!activity.research.operateSupported" class="research-note">{{ activity.research.operateReason }}</p>
      </section>

      <details class="rules-section" open>
        <summary>
          <span><i class="i-carbon-notebook" /> {{ activity.rules.title || '活动说明' }}</span>
          <i class="i-carbon-chevron-down" />
        </summary>
        <div v-if="activity.rules.paragraphs.length" class="rules-copy">
          <p v-for="(line, index) in activity.rules.paragraphs" :key="`${index}-${line}`">{{ line }}</p>
        </div>
        <div v-else class="rules-copy">
          <p>活动期间农场会随机迎来雷雨；成长中的作物有机会发生闪电变异，1 品和 2 品作物除外，变异果实售价为普通果实的 4 倍。</p>
          <p>天气采集瓶在雷雨好友农场使用；雷雨召唤瓶在自己的农场使用；青蛙和乌云使坏瓶在好友农场使用并各获得 30 经验。</p>
        </div>
      </details>
    </template>

    <div v-else class="weather-empty">
      <span class="i-carbon-radar-weather" />
      <strong>当前账号暂未发现雨落成诗活动</strong>
    </div>
  </div>
</template>

<style scoped>
.weather-page {
  --ink: #26373a;
  --muted: #6f7f81;
  --line: #d5ddda;
  --paper: #fff;
  --page: #f2f5f3;
  --storm: #243e4a;
  --storm-soft: #355e6d;
  --rain: #9fc9d2;
  --electric: #f0c349;
  --green: #4f7c68;
  min-height: 100%;
  overflow: visible;
  padding: 86px 0 60px;
  color: var(--ink);
  background: var(--page);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.resource-band {
  display: flex;
  align-items: stretch;
  gap: 20px;
  padding: 18px 28px;
  color: #f7fbfa;
  background: var(--storm);
}
.resource-band__title {
  min-width: 168px;
  display: flex;
  align-items: center;
  gap: 11px;
}
.resource-band__title > span {
  color: var(--electric);
  font-size: 28px;
}
.resource-band__title div,
.resource-item div,
.command-item div,
.friend-name,
.supply-product div,
.badge-balance div,
.task-list article > div,
.node-reward div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.resource-band__title strong { font-size: 16px; }
.resource-band__title small,
.resource-item small { color: #bcd0d3; font-size: 10px; }
.resource-list {
  min-width: 0;
  display: grid;
  flex: 1;
  grid-template-columns: repeat(5, minmax(105px, 1fr));
}
.resource-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.16);
}
.resource-item img,
.resource-fallback { width: 38px; height: 38px; flex: 0 0 auto; object-fit: contain; }
.resource-fallback { display: grid; place-items: center; color: var(--electric); font-size: 23px; }
.resource-item small,
.resource-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-item strong { margin-top: 2px; font-family: Bahnschrift, sans-serif; font-size: 18px; }
.weather-section { border-bottom: 1px solid var(--line); background: var(--paper); }
.own-weather-section {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(250px, 0.55fr);
  gap: 18px;
  padding: 26px 28px;
}
.storm-board {
  position: relative;
  min-height: 300px;
  display: grid;
  grid-template-columns: minmax(250px, 1fr) minmax(240px, 0.75fr);
  align-items: stretch;
  gap: 28px;
  overflow: hidden;
  padding: 30px;
  color: #f5faf9;
  background: var(--storm);
  isolation: isolate;
}
.storm-board::after {
  position: absolute;
  z-index: -1;
  top: -20%;
  right: 34%;
  width: 7px;
  height: 145%;
  background: rgba(240, 195, 73, 0.82);
  clip-path: polygon(0 0, 100% 0, 45% 45%, 100% 45%, 0 100%, 35% 54%, 0 54%);
  content: '';
  transform: rotate(10deg);
}
.storm-board--clear { background: #426a74; }
.storm-board--special { background: #4f6270; }
.storm-board--ended { background: #4d5b5e; }
.storm-board--clear::after,
.storm-board--special::after,
.storm-board--ended::after { display: none; }
.storm-board--clear .rain-field,
.storm-board--special .rain-field,
.storm-board--ended .rain-field { opacity: 0; }
.rain-field,
.rain-field i { position: absolute; pointer-events: none; }
.rain-field { z-index: -2; inset: 0; overflow: hidden; opacity: 0.4; }
.rain-field i {
  top: -45px;
  left: var(--rain-left);
  width: 1px;
  height: 35px;
  background: linear-gradient(transparent, rgba(217, 241, 243, 0.8));
  transform: rotate(16deg);
  animation: rainfall var(--rain-duration) linear var(--rain-delay) infinite;
}
.section-kicker { color: #7d9899; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; }
.storm-copy .section-kicker,
.mutation-sheet__eyebrow { color: #a9c8ce; }
.weather-state-line { display: flex; align-items: center; gap: 11px; margin-top: 12px; }
.weather-state-icon { color: var(--electric); font-size: 29px; }
.weather-state-line div { display: flex; flex-direction: column; }
.weather-state-line strong { font-size: 20px; }
.weather-state-line small { margin-top: 2px; color: #b8ced2; font-size: 10px; }
.weather-clock {
  margin: 18px 0 10px;
  font-family: Bahnschrift, 'Roboto Condensed', monospace;
  font-size: clamp(38px, 5.5vw, 68px);
  font-weight: 700;
  letter-spacing: 0.035em;
  line-height: 1;
}
.weather-progress { height: 5px; overflow: hidden; background: rgba(255, 255, 255, 0.12); }
.weather-progress span { height: 100%; display: block; background: var(--electric); transition: width 0.4s linear; }
.storm-copy > p { margin: 13px 0 0; color: #bfd2d5; font-size: 10px; line-height: 1.65; }
.mutation-sheet {
  align-self: center;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}
.mutation-sheet > strong { display: block; margin: 7px 0 16px; font-family: 'STSong', 'Noto Serif SC', serif; font-size: 24px; }
.mutation-sheet > strong em { color: var(--electric); font-family: Bahnschrift, sans-serif; font-size: 15px; font-style: normal; }
.mutation-sheet dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }
.mutation-sheet dl div { padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.13); }
.mutation-sheet dt { color: #aac0c4; font-size: 9px; }
.mutation-sheet dd { margin: 3px 0 0; font-size: 12px; font-weight: 700; }
.mutation-sheet > p { margin: 14px 0 0; color: #d1dfe1; font-size: 9px; line-height: 1.55; }
.weather-command-card {
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  padding: 22px;
  border: 1px solid var(--line);
  background: #f8faf8;
}
.command-item { display: flex; align-items: center; gap: 11px; margin-top: 18px; }
.command-item img,
.command-item > span { width: 52px; height: 52px; flex: 0 0 auto; object-fit: contain; }
.command-item > span { display: grid; place-items: center; color: #315c68; background: #e2eff0; font-size: 27px; }
.command-item strong { font-size: 14px; }
.command-item small,
.weather-command-card > p,
.command-reason { color: var(--muted); font-size: 9px; }
.command-item small { margin-top: 3px; }
.weather-command-card > p { margin: 18px 0; line-height: 1.7; }
.primary-command,
.scan-command,
.supply-card button,
.node-card button,
.friend-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; font-weight: 700; cursor: pointer; }
.primary-command { min-height: 42px; margin-top: auto; color: #fff; background: var(--storm-soft); }
.command-reason { min-height: 14px; margin-top: 8px; color: #945d43; text-align: center; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button:focus-visible,
summary:focus-visible { outline: 3px solid rgba(240, 195, 73, 0.62); outline-offset: 2px; }
.friend-weather-section,
.research-section { padding: 26px 28px; }
.section-heading,
.compact-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.section-heading h2,
.compact-heading h2 { margin: 3px 0 0; font-family: 'STSong', 'Noto Serif SC', serif; font-size: 21px; }
.section-heading p { margin: 7px 0 0; color: var(--muted); font-size: 10px; line-height: 1.6; }
.scan-command { min-height: 38px; flex: 0 0 auto; padding: 0 13px; border: 1px solid #cbd6d2; color: #315d63; background: #fff; font-size: 11px; }
.friend-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin: 18px 0 12px;
  padding: 10px 12px;
  border: 1px solid #d8e0dd;
  color: #657577;
  background: #f4f7f5;
  font-size: 10px;
}
.friend-summary span { display: inline-flex; align-items: center; gap: 5px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot--available { background: #4f8c6a; }
.status-dot--checked { background: #6d93a0; }
.friend-grid { max-height: 520px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; overflow: auto; padding-right: 3px; }
.friend-card { min-width: 0; padding: 12px; border: 1px solid var(--line); background: #fff; }
.friend-card--available { border-color: #84ad96; box-shadow: inset 3px 0 #4f8c6a; }
.friend-card--collected { background: #f7f8f6; }
.friend-card--expired,
.friend-card--clear,
.friend-card--unknown { color: #637174; }
.friend-card--error { border-color: #d8a489; }
.friend-card > header { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.friend-avatar {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  color: #6e898e;
  background: #e6efee;
  font-size: 22px;
}
.friend-avatar img { width: 100%; height: 100%; object-fit: cover; }
.friend-name strong,
.friend-name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.friend-name strong { font-size: 12px; }
.friend-name small { margin-top: 3px; color: #879496; font-size: 8px; }
.friend-state { padding: 5px 7px; color: #657577; background: #edf1ef; font-size: 9px; font-weight: 800; }
.friend-card--available .friend-state { color: #35634d; background: #e1f0e6; }
.friend-card--collected .friend-state { color: #815f28; background: #f6ebd5; }
.friend-card > p { min-height: 16px; margin: 9px 0; overflow: hidden; color: #718083; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.friend-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.friend-actions button { min-width: 0; min-height: 32px; padding: 0 7px; color: #465b5e; background: #edf2f0; font-size: 9px; }
.friend-actions .collect-command { color: #fff; background: var(--green); }
.friend-empty,
.compact-empty { display: grid; place-content: center; justify-items: center; color: #768587; text-align: center; }
.friend-empty { min-height: 220px; gap: 8px; border: 1px dashed #cad5d2; }
.friend-empty > span { font-size: 30px; }
.friend-empty strong { font-size: 12px; }
.friend-empty small { font-size: 9px; }
.support-grid { display: grid; grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.15fr); gap: 18px; padding: 26px 28px; border-bottom: 1px solid var(--line); }
.support-grid > .weather-section { min-width: 0; padding: 20px; border: 1px solid var(--line); }
.compact-heading > span { color: #6e9095; font-size: 25px; }
.supply-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; margin-top: 18px; }
.supply-product { min-width: 0; display: flex; align-items: center; gap: 10px; }
.supply-product img,
.supply-product > span { width: 52px; height: 52px; flex: 0 0 auto; object-fit: contain; }
.supply-product > span { display: grid; place-items: center; color: #3c7180; background: #e5f0f1; font-size: 25px; }
.supply-product strong { font-size: 13px; }
.supply-product small,
.supply-cost span,
.supply-cost small { color: #7f8d8f; font-size: 9px; }
.supply-product small { margin-top: 3px; }
.supply-cost { display: flex; flex-direction: column; justify-content: center; padding-left: 14px; border-left: 1px dashed #cbd5d2; text-align: right; }
.supply-cost strong { margin: 3px 0; font-size: 12px; }
.supply-card button { min-height: 38px; grid-column: 1 / -1; color: #fff; background: var(--storm-soft); }
.supply-card > p { grid-column: 1 / -1; margin: -7px 0 0; color: #8c6546; font-size: 9px; text-align: center; }
.task-list { display: grid; gap: 7px; margin-top: 14px; }
.task-list article { min-width: 0; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px; border: 1px solid #dde3e0; background: #f9faf9; }
.task-icon { width: 30px; height: 30px; display: grid; place-items: center; color: #a87800; background: #fff1ba; }
.task-list strong { font-size: 10px; }
.task-list small { margin-top: 2px; color: #879496; font-size: 8px; }
.task-reward { color: #795f1e; font-size: 9px; font-weight: 700; }
.compact-empty { min-height: 130px; font-size: 10px; }
.research-section { border-top: 1px solid var(--line); }
.badge-balance { min-width: 124px; display: flex; align-items: center; gap: 9px; padding: 8px 11px; color: #5d470f; background: #fff0b8; }
.badge-balance > span { color: #b37d00; font-size: 22px; }
.badge-balance small { font-size: 8px; }
.badge-balance strong { margin-top: 1px; font-family: Bahnschrift, sans-serif; font-size: 17px; }
.research-track { position: relative; display: grid; grid-template-columns: repeat(9, minmax(132px, 1fr)); gap: 10px; overflow-x: auto; margin-top: 22px; padding: 0 2px 12px; }
.research-track::before { position: absolute; top: 17px; right: 60px; left: 18px; height: 2px; background: #d0dad7; content: ''; }
.research-node { position: relative; min-width: 132px; }
.node-index {
  position: relative;
  z-index: 1;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  margin-bottom: 8px;
  border: 3px solid #fff;
  border-radius: 50%;
  color: #607174;
  background: #d3dcda;
  font-family: Bahnschrift, sans-serif;
  font-size: 10px;
}
.research-node.complete .node-index { color: #fff; background: var(--green); }
.research-node.current .node-index { color: #594408; background: var(--electric); box-shadow: 0 0 0 4px rgba(240, 195, 73, 0.2); }
.node-card { min-height: 156px; display: flex; flex-direction: column; padding: 10px; border: 1px solid #d6dfdc; background: #f9faf9; }
.research-node.current .node-card { border-color: #d4ab38; box-shadow: inset 0 3px var(--electric); }
.research-node.locked .node-card { opacity: 0.6; }
.node-card > header { display: flex; justify-content: space-between; gap: 6px; color: #829092; font-size: 8px; }
.node-card > header strong { color: #566b6e; }
.node-reward { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.node-reward img,
.node-reward > span { width: 34px; height: 34px; flex: 0 0 auto; object-fit: contain; }
.node-reward > span { display: grid; place-items: center; color: #6d8588; background: #e6eeec; font-size: 17px; }
.node-reward small { color: #8a9698; font-size: 8px; }
.node-reward strong { margin-top: 2px; overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.node-card footer { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 10px; }
.node-card footer > span { display: inline-flex; align-items: center; gap: 3px; color: #7c601a; font-size: 9px; }
.node-card button { min-height: 28px; padding: 0 7px; color: #fff; background: var(--storm-soft); font-size: 8px; }
.research-note { margin: 9px 0 0; color: #8b6347; font-size: 9px; }
.rules-section { padding: 20px 28px 28px; color: #667678; background: #edf1ef; font-size: 10px; line-height: 1.75; }
.rules-section summary { display: flex; align-items: center; justify-content: space-between; color: #344b4f; font-size: 13px; font-weight: 700; cursor: pointer; list-style: none; }
.rules-section summary span { display: inline-flex; align-items: center; gap: 7px; }
.rules-section[open] summary > i { transform: rotate(180deg); }
.rules-copy { display: grid; gap: 6px; margin-top: 12px; }
.rules-copy p { margin: 0; white-space: pre-line; }
.weather-empty { min-height: 520px; display: grid; place-content: center; justify-items: center; gap: 10px; color: #748486; }
.weather-empty > span { font-size: 35px; }
@keyframes rainfall {
  from { transform: translate3d(0, 0, 0) rotate(16deg); }
  to { transform: translate3d(-55px, 390px, 0) rotate(16deg); }
}
@media (max-width: 1050px) {
  .own-weather-section { grid-template-columns: 1fr; }
  .weather-command-card { min-height: 220px; }
  .support-grid { grid-template-columns: 1fr; }
}
@media (max-width: 820px) {
  .weather-page { padding-top: 72px; }
  .resource-band { align-items: stretch; flex-direction: column; gap: 11px; padding: 16px; }
  .resource-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .resource-item { border-top: 1px solid rgba(255, 255, 255, 0.14); border-left: 0; }
  .own-weather-section,
  .friend-weather-section,
  .research-section,
  .support-grid { padding: 18px 16px; }
  .storm-board { grid-template-columns: 1fr; padding: 24px 20px; }
  .storm-board::after { right: 13%; opacity: 0.45; }
  .friend-grid { grid-template-columns: 1fr; }
  .section-heading { align-items: stretch; flex-direction: column; }
  .scan-command { align-self: flex-start; }
  .rules-section { padding: 18px 16px 24px; }
}
@media (max-width: 460px) {
  .resource-list { grid-template-columns: 1fr; }
  .weather-clock { font-size: 43px; }
  .mutation-sheet dl { grid-template-columns: 1fr; }
  .friend-card > header { grid-template-columns: 40px minmax(0, 1fr); }
  .friend-state { grid-column: 1 / -1; justify-self: start; }
  .friend-actions { grid-template-columns: 1fr; }
  .supply-card { grid-template-columns: 1fr; }
  .supply-cost { padding: 10px 0 0; border-top: 1px dashed #cbd5d2; border-left: 0; text-align: left; }
}
@media (prefers-reduced-motion: reduce) {
  .rain-field i { animation: none; }
  .weather-progress span { transition: none; }
}
</style>
