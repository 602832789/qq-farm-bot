<script setup lang="ts">
import type { QixiActivityDto, QixiDewLandTargetDto, QixiDewTargetsDto } from '@/stores/activity-center'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  activity: QixiActivityDto
  targets: QixiDewTargetsDto | null
  loading: boolean
  pending: boolean
  error: string
  usedLandIds: string[]
}>()

const emit = defineEmits<{
  loadTargets: [hostGid: string]
  use: [payload: { hostGid: string, landIds: string[] }]
}>()

const selectedLandIds = ref(new Set<string>())

const usedLandIdSet = computed(() => new Set(props.usedLandIds.map(String)))
const dewBalance = computed(() => {
  const value = Number(props.activity.dew.balance || 0)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
})
const selectableTargets = computed(() => (props.targets?.lands || []).filter(target => !usedLandIdSet.value.has(target.landId)))
const selectedTargets = computed(() => (props.targets?.lands || [])
  .filter(target => selectedLandIds.value.has(target.landId) && !usedLandIdSet.value.has(target.landId))
  .sort((left, right) => Number(left.landId) - Number(right.landId)))
const lifecycle = computed(() => {
  const now = props.activity.serverTime || Date.now()
  if (props.activity.startTime && now < props.activity.startTime)
    return { key: 'upcoming', label: '活动尚未开始', detail: '灵露使用入口暂时关闭' }
  if (props.activity.active)
    return { key: 'active', label: '活动期间可使用', detail: '仓库会阻止误售灵露' }
  if (props.activity.dew.sellable)
    return { key: 'sellable', label: '活动已结束 · 可手动出售', detail: '不会自动出售，便于保留验证样本' }
  return { key: 'waiting', label: '活动已结束 · 等待售卖条件', detail: '以服务端 sell_cond 状态为准' }
})
const sellPriceText = computed(() => {
  const price = props.activity.dew.sellPrice
  if (!price)
    return ''
  return `${price.amount} ${price.currencyName || '金币'}/份`
})
const useDisabled = computed(() => (
  selectedTargets.value.length === 0
  || props.pending
  || props.loading
  || !props.activity.actions.dew.enabled
  || !props.activity.dew.usable
))

watch(() => props.targets?.host.gid, () => {
  selectedLandIds.value = new Set()
})

watch([() => props.targets?.lands, usedLandIdSet], () => {
  const available = new Set(selectableTargets.value.map(target => target.landId))
  selectedLandIds.value = new Set([...selectedLandIds.value].filter(landId => available.has(landId)))
})

function reloadTargets() {
  emit('loadTargets', '')
}

function chooseLand(target: QixiDewLandTargetDto) {
  if (usedLandIdSet.value.has(target.landId))
    return
  const next = new Set(selectedLandIds.value)
  if (next.has(target.landId)) {
    next.delete(target.landId)
  }
  else if (!props.activity.dew.balanceKnown || next.size < dewBalance.value) {
    next.add(target.landId)
  }
  selectedLandIds.value = next
}

function selectAllAvailable() {
  const limit = props.activity.dew.balanceKnown ? dewBalance.value : selectableTargets.value.length
  selectedLandIds.value = new Set(selectableTargets.value.slice(0, limit).map(target => target.landId))
}

function clearSelection() {
  selectedLandIds.value = new Set()
}

function useDew() {
  const targets = selectedTargets.value
  if (targets.length === 0 || useDisabled.value)
    return
  emit('use', { hostGid: targets[0]!.hostGid, landIds: targets.map(target => target.landId) })
}
</script>

<template>
  <section class="dew-panel">
    <header class="dew-heading">
      <div class="dew-title">
        <span class="dew-orb"><img :src="activity.dew.image" alt=""></span>
        <div>
          <small>限时交互道具</small>
          <h2>{{ activity.dew.name || '鹊羽灵露' }}</h2>
          <p>活动页操作自己的土地；好友土地与其他特殊道具统一在好友页使用</p>
        </div>
      </div>
      <div class="dew-balance">
        <span>当前持有</span>
        <strong>{{ activity.dew.balanceKnown ? (activity.dew.balance || '0') : '--' }}</strong>
        <small>份</small>
      </div>
    </header>

    <div class="dew-lifecycle" :data-state="lifecycle.key">
      <span class="lifecycle-mark" />
      <div>
        <strong>{{ lifecycle.label }}</strong>
        <small>{{ lifecycle.detail }}</small>
      </div>
      <span v-if="sellPriceText" class="sell-price">活动后 {{ sellPriceText }}</span>
    </div>

    <div v-if="activity.active" class="dew-workbench">
      <aside class="dew-protocol">
        <span class="protocol-index">01</span>
        <h3>使用范围</h3>
        <div class="farm-scope">
          <div class="farm-scope__current">
            <span class="i-carbon-home" />
            <div>
              <strong>我的农场</strong>
              <small>在这里选择自己的地块</small>
            </div>
          </div>
          <RouterLink class="friend-entry" :to="{ name: 'friends' }">
            <span class="i-carbon-user-multiple" />
            <span>
              <strong>前往好友页使用</strong>
              <small>灵露、黄金虫、足球等统一入口</small>
            </span>
            <span class="i-carbon-arrow-right" />
          </RouterLink>
        </div>

        <div class="server-note">
          <span class="i-carbon-security" />
          <p>这里只筛选自己农场中“已有作物”的候选地块。作物品级（2 品及以下不可用）与重复使用状态由服务器在提交时最终校验。</p>
        </div>
      </aside>

      <div class="land-stage">
        <div class="land-toolbar">
          <div>
            <span class="protocol-index">02</span>
            <h3>选择地块</h3>
            <small v-if="targets">{{ targets.host.name || (targets.host.isSelf ? '我的农场' : targets.host.gid) }} · {{ targets.count }} 块候选地</small>
          </div>
          <div class="land-toolbar-actions">
            <button type="button" :disabled="loading || selectableTargets.length === 0" @click="selectAllAvailable">
              全选可用
            </button>
            <button type="button" :disabled="selectedTargets.length === 0" @click="clearSelection">
              清空
            </button>
            <button type="button" class="reload-command" :disabled="loading" title="重新读取我的农场" @click="reloadTargets">
              <span v-if="loading" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-renew" />
            </button>
          </div>
        </div>

        <div v-if="loading" class="land-state">
          <span class="i-svg-spinners-90-ring-with-bg" />
          <strong>正在读取最新地块</strong>
          <small>正在同步我的农场土地状态</small>
        </div>
        <div v-else-if="error" class="land-state land-state--error">
          <span class="i-carbon-warning-alt" />
          <strong>{{ error }}</strong>
          <button type="button" @click="reloadTargets">
            重新读取
          </button>
        </div>
        <div v-else-if="targets && targets.lands.length === 0" class="land-state">
          <span class="i-carbon-sprout" />
          <strong>当前没有已种作物的候选地块</strong>
          <small>种植后刷新，最终可用性仍以服务器为准</small>
        </div>
        <div v-else-if="targets" class="land-grid">
          <button
            v-for="target in targets.lands"
            :key="`${target.hostGid}-${target.landId}`"
            type="button"
            class="land-card"
            :class="{ selected: selectedLandIds.has(target.landId), used: usedLandIdSet.has(target.landId) }"
            :disabled="usedLandIdSet.has(target.landId)"
            @click="chooseLand(target)"
          >
            <span class="land-number">#{{ target.landId }}</span>
            <img v-if="target.seedImage" :src="target.seedImage" alt="">
            <span v-else class="seed-fallback i-carbon-sprout" />
            <strong>{{ target.plantName }}</strong>
            <small>{{ target.landTypeName }} · {{ target.phaseName || (target.mature ? '成熟' : '生长中') }}</small>
            <span v-if="usedLandIdSet.has(target.landId)" class="land-used">本次已使用</span>
            <span v-else-if="selectedLandIds.has(target.landId)" class="land-check i-carbon-checkmark-filled" />
            <span v-else class="land-check i-carbon-radio-button" />
          </button>
        </div>

        <footer class="dew-submit">
          <div>
            <span>即将操作</span>
            <strong v-if="selectedTargets.length">已选 {{ selectedTargets.length }} 块，将按 #{{ selectedTargets.map(target => target.landId).join(' → #') }} 顺序使用</strong>
            <strong v-else>尚未选择地块</strong>
          </div>
          <button type="button" :disabled="useDisabled" @click="useDew">
            <span v-if="pending" class="i-carbon-circle-dash animate-spin" />
            <span v-else class="i-carbon-rain-drop" />
            {{ pending ? '正在按顺序使用' : `一键使用 ${selectedTargets.length || ''} 份灵露` }}
          </button>
        </footer>
      </div>
    </div>
    <div v-else class="dew-archive">
      <span class="i-carbon-archive" />
      <div>
        <strong>活动专属入口已收起</strong>
        <p>好友页仍会列出背包中可提交的特殊互动道具，能否继续使用由服务端回包判断。剩余材料不会自动出售；满足出售条件后可在仓库中手动处理。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dew-panel {
  --dew-ink: #243f41;
  --dew-green: #2c6663;
  --dew-pale: #edf5ef;
  --dew-gold: #c8923b;
  padding: 26px 28px 28px;
  border-bottom: 1px solid #cad8d2;
  color: var(--dew-ink);
  background:
    radial-gradient(circle at 90% 0%, rgba(124, 184, 163, 0.2), transparent 27%),
    linear-gradient(135deg, #f8fbf7 0%, #edf4ee 100%);
}
.dew-heading,
.dew-title,
.dew-lifecycle,
.land-toolbar,
.dew-submit {
  display: flex;
  align-items: center;
}
.dew-heading {
  justify-content: space-between;
  gap: 18px;
}
.dew-title {
  min-width: 0;
  gap: 14px;
}
.dew-orb {
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid rgba(44, 102, 99, 0.24);
  border-radius: 50% 50% 46% 54%;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 10px 24px rgba(44, 102, 99, 0.12);
}
.dew-orb img {
  width: 50px;
  height: 50px;
  object-fit: contain;
}
.dew-title small,
.protocol-index {
  color: #8b6152;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.dew-title h2,
.dew-protocol h3,
.land-toolbar h3 {
  margin: 2px 0 0;
  font-size: 20px;
}
.dew-title p {
  margin: 4px 0 0;
  color: #6e7d79;
  font-size: 11px;
}
.dew-balance {
  min-width: 104px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  padding: 10px 14px;
  border-left: 2px solid var(--dew-gold);
  background: rgba(255, 255, 255, 0.66);
}
.dew-balance span {
  grid-column: 1 / -1;
  color: #71807d;
  font-size: 9px;
}
.dew-balance strong {
  color: var(--dew-green);
  font-size: 25px;
  line-height: 1;
}
.dew-balance small {
  margin-left: 4px;
  color: #71807d;
  font-size: 9px;
}
.dew-lifecycle {
  gap: 9px;
  margin-top: 16px;
  padding: 9px 12px;
  border: 1px solid rgba(44, 102, 99, 0.17);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.68);
}
.lifecycle-mark {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #83928f;
}
.dew-lifecycle[data-state='active'] .lifecycle-mark {
  background: #2d8d70;
  box-shadow: 0 0 0 4px rgba(45, 141, 112, 0.13);
}
.dew-lifecycle[data-state='sellable'] .lifecycle-mark {
  background: var(--dew-gold);
}
.dew-lifecycle div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dew-lifecycle strong {
  font-size: 11px;
}
.dew-lifecycle small {
  margin-top: 1px;
  color: #71807d;
  font-size: 9px;
}
.sell-price {
  margin-left: auto;
  color: #805f29;
  font-size: 10px;
  font-weight: 700;
}
.dew-workbench {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 18px;
  margin-top: 16px;
}
.dew-protocol,
.land-stage {
  min-width: 0;
  border: 1px solid #d4dfda;
  background: rgba(255, 255, 255, 0.82);
}
.dew-protocol {
  padding: 15px;
}
.dew-protocol h3,
.land-toolbar h3 {
  font-size: 15px;
}
.farm-scope {
  display: grid;
  gap: 8px;
  margin-top: 13px;
}
.friend-entry,
.reload-command,
.land-state button {
  border: 1px solid #c9d7d1;
  color: #496360;
  background: #f7faf8;
  cursor: pointer;
}
.farm-scope__current,
.friend-entry {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 4px;
}
.farm-scope__current {
  color: #fff;
  background: var(--dew-green);
}
.farm-scope__current > span,
.friend-entry > span:first-child {
  flex: 0 0 auto;
  font-size: 18px;
}
.farm-scope__current div,
.friend-entry > span:nth-child(2) {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}
.farm-scope strong {
  font-size: 10px;
}
.farm-scope small {
  margin-top: 2px;
  font-size: 8px;
  opacity: 0.78;
}
.friend-entry {
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}
.friend-entry:hover {
  border-color: var(--dew-green);
  background: #eff7f2;
}
.friend-entry > span:last-child {
  flex: 0 0 auto;
  font-size: 14px;
}
.server-note {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #cbd8d2;
  color: #687975;
}
.server-note > span {
  flex: 0 0 auto;
  color: var(--dew-green);
  font-size: 16px;
}
.server-note p {
  margin: 0;
  font-size: 9px;
  line-height: 1.55;
}
.land-stage {
  display: flex;
  flex-direction: column;
}
.land-toolbar {
  min-height: 64px;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #d8e1dd;
}
.land-toolbar small {
  display: block;
  margin-top: 3px;
  color: #778682;
  font-size: 9px;
}
.reload-command {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 4px;
}
.land-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.land-toolbar-actions > button:not(.reload-command) {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid #c9d7d1;
  border-radius: 4px;
  color: #496360;
  background: #f7faf8;
  font-size: 9px;
  cursor: pointer;
}
.land-toolbar-actions > button:disabled {
  opacity: 0.46;
  cursor: not-allowed;
}
.land-grid {
  min-height: 164px;
  max-height: 258px;
  display: grid;
  grid-template-columns: repeat(4, minmax(92px, 1fr));
  gap: 7px;
  overflow: auto;
  padding: 12px;
}
.land-card {
  position: relative;
  min-width: 0;
  min-height: 116px;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding: 14px 8px 9px;
  border: 1px solid #d4dfda;
  border-radius: 5px;
  color: var(--dew-ink);
  background: #f8faf8;
  cursor: pointer;
}
.land-card:hover,
.land-card.selected {
  border-color: var(--dew-green);
  background: #eff7f2;
}
.land-card.selected {
  box-shadow: inset 0 0 0 1px var(--dew-green);
}
.land-card.used {
  border-style: dashed;
  color: #74817d;
  background: #edf0ee;
  cursor: not-allowed;
  filter: saturate(0.55);
}
.land-card img,
.seed-fallback {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.seed-fallback {
  display: grid;
  place-items: center;
  color: #79a38f;
  font-size: 29px;
}
.land-card strong {
  max-width: 100%;
  margin-top: 5px;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.land-card small {
  margin-top: 2px;
  color: #788783;
  font-size: 8px;
}
.land-number {
  position: absolute;
  top: 6px;
  left: 7px;
  color: #7c8a87;
  font-size: 8px;
  font-weight: 700;
}
.land-check {
  position: absolute;
  top: 6px;
  right: 7px;
  color: var(--dew-green);
  font-size: 13px;
}
.land-used {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 5px;
  border-radius: 8px;
  color: #5d6b67;
  background: #dfe5e2;
  font-size: 7px;
  font-weight: 700;
}
.land-state {
  min-height: 164px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 5px;
  padding: 18px;
  color: #71807d;
  text-align: center;
}
.land-state > span {
  color: #79a38f;
  font-size: 25px;
}
.land-state strong {
  max-width: 420px;
  font-size: 11px;
}
.land-state small {
  font-size: 9px;
}
.land-state--error > span {
  color: #b55f54;
}
.land-state button {
  margin-top: 5px;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 9px;
}
.dew-submit {
  min-height: 62px;
  justify-content: space-between;
  gap: 14px;
  margin-top: auto;
  padding: 10px 12px;
  border-top: 1px solid #d8e1dd;
  background: #f4f7f5;
}
.dew-submit div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dew-submit div span {
  color: #778682;
  font-size: 8px;
}
.dew-submit div strong {
  max-width: 100%;
  margin-top: 3px;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dew-submit button {
  min-width: 132px;
  height: 38px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 4px;
  color: #fff;
  background: var(--dew-green);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.dew-submit button:disabled,
.reload-command:disabled {
  opacity: 0.46;
  cursor: not-allowed;
}
.dew-archive {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  border: 1px dashed #c6d2cd;
  border-radius: 6px;
  color: #5f6f6b;
  background: rgba(255, 255, 255, 0.58);
}
.dew-archive > span {
  flex: 0 0 auto;
  color: #8b6d3c;
  font-size: 22px;
}
.dew-archive strong {
  color: var(--dew-ink);
  font-size: 12px;
}
.dew-archive p {
  margin: 4px 0 0;
  font-size: 9px;
  line-height: 1.6;
}
@media (max-width: 900px) {
  .dew-panel {
    padding: 22px 16px;
  }
  .dew-workbench {
    grid-template-columns: 1fr;
  }
  .land-grid {
    grid-template-columns: repeat(3, minmax(86px, 1fr));
  }
  .land-toolbar {
    align-items: flex-start;
  }
  .land-toolbar-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
@media (max-width: 520px) {
  .dew-heading,
  .dew-submit {
    align-items: stretch;
    flex-direction: column;
  }
  .dew-balance {
    width: 100%;
  }
  .sell-price {
    display: none;
  }
  .land-grid {
    grid-template-columns: repeat(2, minmax(86px, 1fr));
  }
  .dew-submit button {
    width: 100%;
  }
}
</style>
