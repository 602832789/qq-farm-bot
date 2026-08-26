<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ActivityItemDto, WeatherActivityDto, WeatherFriendDto, WeatherResearchNodeDto } from '@/stores/activity-center'
import { computed } from 'vue'

const props = defineProps<{
  activity: WeatherActivityDto | null
  now: number
  pendingExchange: boolean
  pendingCollect: boolean
  pendingSummon: boolean
  pendingResearch: boolean
}>()

const emit = defineEmits<{
  exchange: []
  collect: [friendGid: string]
  summon: []
  advanceResearch: [nodeId: string]
}>()

const summonBottle = computed(() => itemById('5002'))
const ownRemainingSec = computed(() => remainingSeconds(props.activity?.ownWeather.endTime))
const ownDurationSec = computed(() => props.activity?.ownWeather.durationSec || 0)
const weatherProgress = computed(() => {
  if (!ownDurationSec.value)
    return 0
  return Math.min(100, Math.max(0, ownRemainingSec.value / ownDurationSec.value * 100))
})

function itemById(id: string): ActivityItemDto {
  return props.activity?.inventory.find(item => item.id === id) || {
    id,
    name: id === '1027' ? '雷电徽章' : `物品 ${id}`,
    count: '0',
    image: '',
    rarity: null,
  }
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
  if (hours > 0)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function rainStyle(index: number): CSSProperties {
  return {
    '--rain-left': `${(index * 17 + 7) % 101}%`,
    '--rain-delay': `${-((index * 0.37) % 2.8)}s`,
    '--rain-duration': `${1.35 + (index % 5) * 0.18}s`,
    '--rain-height': `${34 + (index % 4) * 9}px`,
  } as CSSProperties
}

function friendRemaining(friend: WeatherFriendDto) {
  return formatDuration(remainingSeconds(friend.weather.endTime))
}

function researchState(node: WeatherResearchNodeDto) {
  if (node.completed)
    return '已记录'
  if (node.availableByStatus)
    return node.affordable ? '可推进' : '徽章不足'
  return '待解锁'
}

function researchDisabled(node: WeatherResearchNodeDto) {
  return props.pendingResearch || !node.availableByStatus || !node.affordable || !props.activity?.research?.operateSupported
}
</script>

<template>
  <div class="weather-observatory">
    <section v-if="activity" class="weather-hero" :class="{ 'weather-hero--active': activity.ownWeather.isThunderstorm }">
      <div class="rain-field" aria-hidden="true">
        <i v-for="index in 24" :key="index" :style="rainStyle(index)" />
      </div>

      <div class="station-copy">
        <span class="station-kicker">WEATHER LOG · {{ activity.groupId }}</span>
        <h1>雨落成诗</h1>
        <p>
          雷雨经过农场时，成长中的作物有 {{ activity.mutation.baseRatePercent }}% 概率发生闪电变异。
          变异果实以 {{ activity.mutation.sellMultiplier }} 倍价格出售。
        </p>
        <div class="station-facts">
          <span><i class="i-carbon-flash" /> 变异编号 {{ activity.mutation.mutantConfigId }}</span>
          <span><i class="i-carbon-warning-alt" /> 1 品、2 品作物除外</span>
          <span><i class="i-carbon-time" /> 实测召唤持续 {{ Math.round((ownDurationSec || 7200) / 60) }} 分钟</span>
        </div>
      </div>

      <div class="weather-dial" :style="{ '--weather-progress': `${weatherProgress * 3.6}deg` } as CSSProperties">
        <div class="weather-dial__ticks" aria-hidden="true" />
        <div class="weather-dial__core">
          <span class="weather-dial__icon i-carbon-thunderstorm" />
          <small>{{ activity.ownWeather.isThunderstorm ? '雷雨剩余' : '本场观测' }}</small>
          <strong>{{ activity.ownWeather.isThunderstorm ? formatDuration(ownRemainingSec) : '待召唤' }}</strong>
          <em>{{ activity.ownWeather.isThunderstorm ? '闪电变异窗口开启' : '当前无特殊天气' }}</em>
        </div>
      </div>

      <div class="hero-command">
        <button
          type="button"
          :disabled="pendingSummon || !activity.actions.summonThunderstorm.enabled"
          @click="emit('summon')"
        >
          <span v-if="pendingSummon" class="i-carbon-circle-dash animate-spin" />
          <span v-else class="i-carbon-thunderstorm" />
          {{ pendingSummon ? '正在召唤' : activity.ownWeather.isThunderstorm ? '雷雨进行中' : '使用雷雨召唤瓶' }}
        </button>
        <span>{{ activity.actions.summonThunderstorm.reason || `可用 ${summonBottle.count} 瓶` }}</span>
      </div>
    </section>

    <section v-if="activity" class="instrument-strip" aria-label="活动道具库存">
      <div class="instrument-strip__label">
        <span class="i-carbon-inventory-management" />
        <div><strong>观测装备</strong><small>实时背包余额</small></div>
      </div>
      <div class="instrument-items">
        <article v-for="item in activity.inventory" :key="item.id" :class="{ 'instrument-item--badge': item.id === '1027' }">
          <img v-if="item.image" :src="item.image" alt="">
          <span v-else class="instrument-fallback i-carbon-flash-filled" />
          <div><small>{{ item.name }}</small><strong>{{ item.count }}</strong></div>
        </article>
      </div>
    </section>

    <section v-if="activity" class="operations-grid">
      <article class="operation-card exchange-station">
        <header>
          <div>
            <span class="panel-index">SUPPLY</span>
            <h2>观测站补给</h2>
          </div>
          <span class="panel-icon i-carbon-store" />
        </header>
        <div v-if="activity.shop" class="supply-ticket">
          <div class="supply-item">
            <img v-if="activity.shop.item.image" :src="activity.shop.item.image" alt="">
            <div>
              <strong>{{ activity.shop.item.name }}</strong>
              <span>每日限兑 {{ activity.shop.dailyLimit }} 次</span>
            </div>
          </div>
          <div class="ticket-rule" />
          <div class="supply-cost">
            <span>消耗</span>
            <strong>{{ activity.shop.cost.count }} {{ activity.shop.cost.name }}</strong>
            <small>当前 {{ activity.shop.balance }}</small>
          </div>
          <button
            type="button"
            :disabled="pendingExchange || !activity.actions.exchangeCollector.enabled"
            @click="emit('exchange')"
          >
            <span v-if="pendingExchange" class="i-carbon-circle-dash animate-spin" />
            <span v-else class="i-carbon-shopping-cart" />
            {{ pendingExchange ? '兑换中' : activity.shop.owned ? '今日已兑换' : '兑换采集瓶' }}
          </button>
          <p v-if="activity.shop.reason">
            {{ activity.shop.reason }}
          </p>
        </div>
        <div v-else class="panel-empty">
          服务端暂未返回补给目录
        </div>
      </article>

      <article class="operation-card friend-station">
        <header>
          <div>
            <span class="panel-index">REMOTE SITES</span>
            <h2>好友雷雨观测点</h2>
          </div>
          <span class="site-count">{{ activity.thunderstormFriends.length }} 处有效</span>
        </header>
        <p class="station-note">
          进入仍处于雷雨的好友农场使用天气采集瓶；成功采集必得雷雨召唤瓶 ×1。
        </p>
        <div v-if="activity.thunderstormFriends.length" class="friend-sites">
          <article v-for="friend in activity.thunderstormFriends" :key="friend.gid" class="friend-site">
            <div class="friend-avatar">
              <img v-if="friend.avatarUrl" :src="friend.avatarUrl" alt="">
              <span v-else class="i-carbon-user-avatar" />
              <i aria-hidden="true" />
            </div>
            <div class="friend-site__copy">
              <strong>{{ friend.name || '农场好友' }}</strong>
              <span>Lv.{{ friend.level || '--' }} · 雷雨剩余 {{ friendRemaining(friend) }}</span>
            </div>
            <button
              type="button"
              :disabled="pendingCollect || !activity.actions.collectWeather.enabled"
              @click="emit('collect', friend.gid)"
            >
              <span v-if="pendingCollect" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-bottles-container" />
              采集
            </button>
          </article>
        </div>
        <div v-else class="panel-empty panel-empty--weather">
          <span class="i-carbon-cloud-offline" />
          <strong>当前好友列表没有有效雷雨</strong>
          <small>保留天气采集瓶，刷新后会自动列出新观测点</small>
        </div>
      </article>
    </section>

    <section v-if="activity?.research" class="research-section">
      <header class="section-heading">
        <div>
          <span class="panel-index">RESEARCH TRANSECT</span>
          <h2>气象研究线路</h2>
          <p>按线路依次消耗雷电徽章，解锁并领取对应观测成果。</p>
        </div>
        <div class="badge-counter">
          <span class="i-carbon-flash-filled" />
          <div><small>雷电徽章</small><strong>{{ activity.research.badgeBalance }}</strong></div>
        </div>
      </header>

      <div class="research-track">
        <article
          v-for="(node, index) in activity.research.nodes"
          :key="node.id"
          class="research-node"
          :class="{
            'research-node--complete': node.completed,
            'research-node--current': node.availableByStatus,
            'research-node--locked': node.locked,
          }"
        >
          <div class="node-marker">
            <span v-if="node.completed" class="i-carbon-checkmark" />
            <strong v-else>{{ index + 1 }}</strong>
          </div>
          <div class="node-card">
            <header><span>节点 {{ node.id }}</span><strong>{{ researchState(node) }}</strong></header>
            <div class="node-reward">
              <img v-if="node.reward.image" :src="node.reward.image" alt="">
              <span v-else class="i-carbon-gift" />
              <div><small>观测成果</small><strong>{{ node.reward.name }} ×{{ node.reward.count }}</strong></div>
            </div>
            <footer>
              <span><i class="i-carbon-flash-filled" /> {{ node.cost.count }}</span>
              <button
                v-if="node.availableByStatus"
                type="button"
                :disabled="researchDisabled(node)"
                @click="emit('advanceResearch', node.id)"
              >
                <span v-if="pendingResearch" class="i-carbon-circle-dash animate-spin" />
                {{ pendingResearch ? '推进中' : '推进研究' }}
              </button>
            </footer>
          </div>
        </article>
      </div>
    </section>

    <section v-if="activity" class="field-notes">
      <article class="task-log">
        <header>
          <span class="panel-index">DAILY LOG</span>
          <h2>气象任务</h2>
        </header>
        <div class="task-list">
          <article v-for="task in activity.tasks" :key="task.id">
            <span class="task-check"><i class="i-carbon-checkbox" /></span>
            <div><strong>{{ task.title }}</strong><small>{{ task.dailyLimit && task.dailyLimit !== '0' ? `每日最多 ${task.dailyLimit} 次` : '完成后发放' }}</small></div>
            <span class="task-reward"><i class="i-carbon-flash-filled" /> {{ task.reward.count }}</span>
          </article>
        </div>
      </article>

      <details class="rules-log">
        <summary>
          <span><i class="i-carbon-notebook" /> {{ activity.rules.title || '活动说明' }}</span>
          <i class="i-carbon-chevron-down" />
        </summary>
        <p v-for="line in activity.rules.paragraphs" :key="line">
          {{ line }}
        </p>
      </details>
    </section>

    <div v-else class="weather-empty">
      <span class="i-carbon-radar-weather" />
      <strong>当前账号暂未发现雨落成诗活动</strong>
    </div>
  </div>
</template>

<style scoped>
.weather-observatory {
  --storm-ink: #1d3240;
  --storm-deep: #284b5d;
  --wet-sky: #5a8fa8;
  --rain-glass: #e7f3f4;
  --electric: #f2c14e;
  --moss: #6e8b57;
  --paper: #f7faf8;
  min-height: 100%;
  overflow: visible;
  padding: 86px 0 70px;
  color: var(--storm-ink);
  background: #edf3f2;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.weather-hero {
  position: relative;
  min-height: 390px;
  display: grid;
  grid-template-columns: minmax(250px, 1fr) minmax(270px, 0.72fr) minmax(170px, 0.42fr);
  align-items: center;
  gap: 30px;
  overflow: hidden;
  padding: 46px 42px;
  color: #f5fbfb;
  background: var(--storm-ink);
  isolation: isolate;
}
.weather-hero::before {
  position: absolute;
  z-index: -2;
  right: 18%;
  width: 420px;
  height: 420px;
  border: 1px solid rgba(184, 222, 226, 0.14);
  border-radius: 50%;
  box-shadow:
    0 0 0 72px rgba(184, 222, 226, 0.035),
    0 0 0 144px rgba(184, 222, 226, 0.025);
  content: '';
}
.weather-hero::after {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: linear-gradient(108deg, rgba(29, 50, 64, 0.08) 0 47%, rgba(90, 143, 168, 0.24) 100%);
  content: '';
}
.rain-field,
.rain-field i {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.rain-field {
  z-index: -1;
  overflow: hidden;
  opacity: 0.46;
}
.rain-field i {
  top: -70px;
  left: var(--rain-left);
  width: 1px;
  height: var(--rain-height);
  background: linear-gradient(transparent, rgba(220, 245, 247, 0.82));
  transform: rotate(17deg);
  animation: rainfall var(--rain-duration) linear var(--rain-delay) infinite;
}
.station-copy {
  position: relative;
  z-index: 2;
}
.station-kicker,
.panel-index {
  color: #9ec1c9;
  font-family: Bahnschrift, 'Roboto Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.station-copy h1 {
  margin: 12px 0 16px;
  font-family: 'STSong', 'Noto Serif SC', serif;
  font-size: clamp(42px, 6vw, 76px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 0.98;
}
.station-copy p {
  max-width: 530px;
  margin: 0;
  color: #c8dde0;
  font-size: 14px;
  line-height: 1.8;
}
.station-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}
.station-facts span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(205, 235, 237, 0.15);
  color: #d7e8e9;
  background: rgba(255, 255, 255, 0.04);
  font-size: 10px;
}
.station-facts i {
  color: var(--electric);
  font-size: 14px;
}
.weather-dial {
  --weather-progress: 0deg;
  position: relative;
  width: min(270px, 100%);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  justify-self: center;
  border-radius: 50%;
  background: conic-gradient(var(--electric) var(--weather-progress), rgba(213, 238, 240, 0.13) 0);
  box-shadow: 0 22px 70px rgba(4, 20, 29, 0.36);
}
.weather-dial::before {
  position: absolute;
  inset: 5px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: inherit;
  background: var(--storm-deep);
  content: '';
}
.weather-dial__ticks {
  position: absolute;
  inset: 17px;
  border: 1px dashed rgba(222, 242, 243, 0.25);
  border-radius: 50%;
}
.weather-dial__core {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-direction: column;
  text-align: center;
}
.weather-dial__icon {
  margin-bottom: 10px;
  color: var(--electric);
  font-size: 35px;
}
.weather-dial__core small,
.weather-dial__core em {
  color: #a9c9cf;
  font-size: 10px;
  font-style: normal;
}
.weather-dial__core strong {
  margin: 3px 0 5px;
  font-family: Bahnschrift, 'Roboto Condensed', monospace;
  font-size: clamp(26px, 4vw, 39px);
  letter-spacing: 0.05em;
}
.hero-command {
  align-self: end;
  display: flex;
  align-items: stretch;
  flex-direction: column;
  gap: 8px;
}
.hero-command button,
.supply-ticket button,
.friend-site button,
.node-card button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  font-weight: 700;
  cursor: pointer;
}
.hero-command button {
  min-height: 46px;
  padding: 0 14px;
  color: var(--storm-ink);
  background: var(--electric);
}
.hero-command > span {
  color: #9fbac0;
  font-size: 9px;
  text-align: center;
}
button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
button:focus-visible,
summary:focus-visible {
  outline: 3px solid rgba(242, 193, 78, 0.55);
  outline-offset: 2px;
}
.instrument-strip {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #cddcda;
  background: #f8fbfa;
}
.instrument-strip__label {
  min-width: 180px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 17px 24px;
  color: #eaf4f3;
  background: var(--storm-deep);
}
.instrument-strip__label > span {
  color: var(--electric);
  font-size: 22px;
}
.instrument-strip__label div,
.instrument-item div {
  display: flex;
  flex-direction: column;
}
.instrument-strip__label strong {
  font-size: 13px;
}
.instrument-strip__label small {
  margin-top: 2px;
  color: #a9c3c6;
  font-size: 9px;
}
.instrument-items {
  min-width: 0;
  display: grid;
  flex: 1;
  grid-auto-flow: column;
  grid-auto-columns: minmax(110px, 1fr);
  overflow-x: auto;
}
.instrument-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  border-right: 1px solid #dce7e4;
}
.instrument-item img,
.instrument-fallback {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  object-fit: contain;
}
.instrument-fallback {
  display: grid;
  place-items: center;
  color: #a67400;
  background: #fff3bf;
  font-size: 21px;
}
.instrument-item small {
  overflow: hidden;
  color: #6d8185;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.instrument-item strong {
  margin-top: 2px;
  font-family: Bahnschrift, sans-serif;
  font-size: 18px;
}
.instrument-item--badge {
  background: #fff9e8;
}
.operations-grid {
  display: grid;
  grid-template-columns: minmax(300px, 0.9fr) minmax(420px, 1.35fr);
  gap: 18px;
  padding: 28px;
}
.operation-card,
.research-section,
.task-log,
.rules-log {
  border: 1px solid #cbdad8;
  background: var(--paper);
}
.operation-card {
  min-width: 0;
  padding: 22px;
}
.operation-card > header,
.section-heading,
.task-log > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.operation-card h2,
.section-heading h2,
.task-log h2 {
  margin: 4px 0 0;
  font-family: 'STSong', 'Noto Serif SC', serif;
  font-size: 22px;
  letter-spacing: 0.04em;
}
.panel-icon {
  color: var(--wet-sky);
  font-size: 26px;
}
.supply-ticket {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1px minmax(115px, 0.7fr);
  gap: 16px;
  margin-top: 20px;
  padding: 18px;
  border: 1px solid #d1dfdc;
  background: #fff;
}
.supply-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.supply-item img {
  width: 58px;
  height: 58px;
  object-fit: contain;
}
.supply-item div,
.supply-cost {
  display: flex;
  flex-direction: column;
}
.supply-item strong {
  font-size: 15px;
}
.supply-item span,
.supply-cost span,
.supply-cost small {
  margin-top: 3px;
  color: #789094;
  font-size: 9px;
}
.ticket-rule {
  border-left: 1px dashed #c9d7d4;
}
.supply-cost {
  justify-content: center;
}
.supply-cost strong {
  margin-top: 2px;
  font-size: 13px;
}
.supply-ticket button {
  min-height: 40px;
  grid-column: 1 / -1;
  color: #fff;
  background: var(--storm-deep);
}
.supply-ticket p {
  grid-column: 1 / -1;
  margin: -6px 0 0;
  color: #8a5f45;
  font-size: 9px;
  text-align: center;
}
.site-count {
  padding: 6px 8px;
  color: #315c68;
  background: #deedef;
  font-size: 9px;
  font-weight: 700;
}
.station-note {
  margin: 14px 0;
  color: #647c80;
  font-size: 10px;
  line-height: 1.65;
}
.friend-sites {
  max-height: 260px;
  display: grid;
  gap: 8px;
  overflow: auto;
  padding-right: 3px;
}
.friend-site {
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 9px 10px;
  border: 1px solid #d6e1df;
  background: #fff;
}
.friend-avatar {
  position: relative;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  color: #789398;
  background: var(--rain-glass);
  font-size: 22px;
}
.friend-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.friend-avatar i {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 11px;
  height: 11px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--electric);
}
.friend-site__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.friend-site__copy strong,
.friend-site__copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.friend-site__copy strong {
  font-size: 12px;
}
.friend-site__copy span {
  margin-top: 3px;
  color: #71898c;
  font-family: Bahnschrift, sans-serif;
  font-size: 9px;
}
.friend-site button {
  min-height: 34px;
  padding: 0 12px;
  color: #fff;
  background: var(--moss);
  font-size: 11px;
}
.panel-empty {
  min-height: 170px;
  display: grid;
  place-content: center;
  color: #71868a;
  font-size: 11px;
  text-align: center;
}
.panel-empty--weather {
  justify-items: center;
  gap: 7px;
}
.panel-empty--weather > span {
  color: var(--wet-sky);
  font-size: 29px;
}
.panel-empty--weather small {
  color: #8da0a2;
  font-size: 9px;
}
.research-section {
  margin: 0 28px 28px;
  padding: 26px;
  background: #f8fbfa;
}
.section-heading p {
  margin: 6px 0 0;
  color: #6f8588;
  font-size: 10px;
}
.badge-counter {
  min-width: 128px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  color: #4c3a0c;
  background: #fff1ba;
}
.badge-counter > span {
  color: #bd8100;
  font-size: 23px;
}
.badge-counter div {
  display: flex;
  flex-direction: column;
}
.badge-counter small {
  font-size: 8px;
}
.badge-counter strong {
  font-family: Bahnschrift, sans-serif;
  font-size: 18px;
}
.research-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(9, minmax(130px, 1fr));
  gap: 12px;
  overflow-x: auto;
  margin-top: 26px;
  padding: 0 3px 12px;
}
.research-track::before {
  position: absolute;
  top: 19px;
  right: 65px;
  left: 20px;
  height: 2px;
  background: #c9d8d6;
  content: '';
}
.research-node {
  position: relative;
  min-width: 130px;
}
.node-marker {
  position: relative;
  z-index: 2;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  margin-bottom: 10px;
  border: 3px solid #f8fbfa;
  border-radius: 50%;
  color: #607b80;
  background: #cddbd9;
  font-family: Bahnschrift, sans-serif;
  font-size: 11px;
}
.research-node--complete .node-marker {
  color: #fff;
  background: var(--moss);
}
.research-node--current .node-marker {
  color: #4c3a0c;
  background: var(--electric);
  box-shadow: 0 0 0 5px rgba(242, 193, 78, 0.22);
}
.node-card {
  min-height: 160px;
  display: flex;
  flex-direction: column;
  padding: 11px;
  border: 1px solid #d0dedb;
  background: #fff;
}
.research-node--current .node-card {
  border-color: #d7a932;
  box-shadow: inset 0 3px var(--electric);
}
.research-node--locked .node-card {
  opacity: 0.62;
}
.node-card > header {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: #7c9194;
  font-size: 8px;
}
.node-card > header strong {
  color: #516c71;
}
.node-reward {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
}
.node-reward img,
.node-reward > span {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  object-fit: contain;
}
.node-reward > span {
  display: grid;
  place-items: center;
  color: #6e888d;
  background: #e8f1f0;
  font-size: 18px;
}
.node-reward div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.node-reward small {
  color: #87999b;
  font-size: 8px;
}
.node-reward strong {
  margin-top: 3px;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
}
.node-card footer > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #7d5e10;
  font-family: Bahnschrift, sans-serif;
  font-size: 10px;
}
.node-card button {
  min-height: 28px;
  padding: 0 8px;
  color: #fff;
  background: var(--storm-deep);
  font-size: 9px;
}
.field-notes {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 18px;
  padding: 0 28px;
}
.task-log,
.rules-log {
  min-width: 0;
  padding: 22px;
}
.task-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}
.task-list > article {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #d6e1df;
  background: #fff;
}
.task-check {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  color: var(--wet-sky);
  background: var(--rain-glass);
}
.task-list article > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.task-list strong,
.task-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-list strong {
  font-size: 10px;
}
.task-list small {
  margin-top: 3px;
  color: #87999b;
  font-size: 8px;
}
.task-reward {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #8d6505;
  font-family: Bahnschrift, sans-serif;
  font-size: 10px;
}
.rules-log summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #3b5960;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.rules-log summary span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.rules-log[open] summary > i {
  transform: rotate(180deg);
}
.rules-log p {
  margin: 12px 0 0;
  color: #6b8185;
  font-size: 9px;
  line-height: 1.8;
  white-space: pre-line;
}
.weather-empty {
  min-height: 520px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: #71878a;
}
.weather-empty > span {
  font-size: 36px;
}
@keyframes rainfall {
  from {
    transform: translate3d(0, 0, 0) rotate(17deg);
  }
  to {
    transform: translate3d(-75px, 540px, 0) rotate(17deg);
  }
}
@media (max-width: 1050px) {
  .weather-hero {
    grid-template-columns: minmax(250px, 1fr) minmax(240px, 0.72fr);
  }
  .hero-command {
    grid-column: 1 / -1;
    align-self: auto;
    flex-direction: row;
    align-items: center;
  }
  .hero-command > span {
    text-align: left;
  }
  .operations-grid,
  .field-notes {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .weather-observatory {
    padding-top: 72px;
  }
  .weather-hero {
    min-height: 0;
    grid-template-columns: 1fr;
    gap: 26px;
    padding: 34px 18px 26px;
  }
  .weather-dial {
    width: 230px;
  }
  .hero-command {
    flex-direction: column;
    align-items: stretch;
  }
  .hero-command > span {
    text-align: center;
  }
  .instrument-strip {
    flex-direction: column;
  }
  .instrument-strip__label {
    min-width: 0;
  }
  .instrument-items {
    grid-auto-columns: minmax(100px, 0.5fr);
  }
  .operations-grid {
    gap: 12px;
    padding: 16px;
  }
  .operation-card {
    padding: 17px;
  }
  .research-section {
    margin: 0 16px 16px;
    padding: 18px;
  }
  .section-heading {
    flex-direction: column;
  }
  .field-notes {
    gap: 12px;
    padding: 0 16px;
  }
  .task-list {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 420px) {
  .station-copy h1 {
    font-size: 46px;
  }
  .supply-ticket {
    grid-template-columns: 1fr;
  }
  .ticket-rule {
    height: 1px;
    border-top: 1px dashed #c9d7d4;
    border-left: 0;
  }
  .friend-site {
    grid-template-columns: 38px minmax(0, 1fr);
  }
  .friend-site button {
    grid-column: 1 / -1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rain-field i {
    animation: none;
  }
}
</style>
