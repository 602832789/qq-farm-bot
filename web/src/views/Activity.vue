<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/api'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const activeTab = ref<'lottery' | 'battlepass' | 'shop' | 'solar'>('lottery')
const loading = ref(false)

// 活动组数据
const activities = ref<any[]>([])
const groupId = ref(2026060100)

// 赛季数据
const seasonInfo = ref<any>(null)

// 节令数据
const solarTerms = ref<any[]>([])

// 操作结果
const operateResult = ref<any>(null)
const operateLoading = ref(false)

// 抽奖信息
const drawInfo = ref<any>(null)

// 付费确认弹窗
const showPaidConfirm = ref(false)
const pendingDrawType = ref(0)
const pendingActivityId = ref(0)

// 品质标签
function qualityLabel(q: number): string {
  const map: Record<number, string> = { 1: '普通', 2: '稀有', 3: '史诗', 4: '传说' }
  return map[q] || `品质${q}`
}

// 格式化日期
function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

// 解析 extra JSON
function parseExtra(extra: any): any {
  if (!extra) return null
  if (typeof extra === 'object') return extra
  try { return JSON.parse(extra) } catch { return null }
}

// 获取 accountId
function getAccountId(): string {
  return localStorage.getItem('current_account_id') || ''
}

// 获取活动组
async function fetchActivityGroup() {
  loading.value = true
  try {
    const { data } = await api.get(`/api/activity/group/${groupId.value}`, {
      headers: { 'x-account-id': getAccountId() },
    })
    if (data.ok) {
      activities.value = data.data || []
      // 从活动组中直接获取抽奖信息
      const lottery = activities.value.find(a => a.type === 8)
      if (lottery?.drawInfo) {
        drawInfo.value = lottery.drawInfo
      }
    }
  } catch {}
  loading.value = false
}

// 获取赛季信息
async function fetchSeasonInfo() {
  try {
    const { data } = await api.get('/api/activity/season', {
      headers: { 'x-account-id': getAccountId() },
    })
    if (data.ok) {
      seasonInfo.value = data.data
    }
  } catch {}
}

// 获取节令活动
async function fetchSolarTerms() {
  try {
    const { data } = await api.get('/api/activity/solar-terms', {
      headers: { 'x-account-id': getAccountId() },
    })
    if (data.ok) {
      solarTerms.value = data.data?.terms || []
    }
  } catch {}
}

// 抽奖按钮点击
function onDrawClick(activityId: number, operateType: number) {
  // drawInfo 未加载或免费次数还有，直接抽
  if (!drawInfo.value || freeRemain.value > 0) {
    doOperate(activityId, operateType)
    return
  }
  // 免费用完，需要付费确认
  pendingActivityId.value = activityId
  pendingDrawType.value = operateType
  showPaidConfirm.value = true
}

// 确认付费抽奖
function confirmPaidDraw() {
  showPaidConfirm.value = false
  doOperate(pendingActivityId.value, pendingDrawType.value)
}

// 付费次数
function paidDrawCount(operateType: number): number {
  if (operateType === 7) return 1
  if (operateType === 9) return Math.min(drawInfo.value?.paidRemaining || 0, 4)
  return 1
}

// 活动操作
async function doOperate(activityId: number, operateType: number) {
  operateLoading.value = true
  operateResult.value = null
  try {
    const { data } = await api.post('/api/activity/operate', {
      activityId,
      operateType,
    }, {
      headers: { 'x-account-id': getAccountId() },
    })
    if (data.ok) {
      operateResult.value = data.data
      // 更新抽奖信息
      if (data.data?.drawInfo) {
        drawInfo.value = data.data.drawInfo
      }
    } else {
      toast.error(data.error || '操作失败')
    }
  } catch (e: any) {
    const errData = e.response?.data
    toast.error(errData?.error || e.message || '网络错误')
  }
  operateLoading.value = false
}

// 按类型筛选活动
const lotteryActivities = computed(() =>
  activities.value.filter(a => a.type === 8)
)
const shopActivities = computed(() =>
  activities.value.filter(a => a.type === 3)
)

// 总剩余次数
const totalRemaining = computed(() => {
  if (!drawInfo.value) return '-'
  return freeRemain.value + paidRemain.value
})

// 免费剩余 (只用 freeRemaining，不回退到 freeLimit)
const freeRemain = computed(() => {
  if (!drawInfo.value) return 0
  return drawInfo.value.freeRemaining ?? 0
})

// 付费剩余 (只用 paidRemaining，不回退到 paidLimit)
const paidRemain = computed(() => {
  if (!drawInfo.value) return 0
  return drawInfo.value.paidRemaining ?? 0
})


onMounted(() => {
  fetchActivityGroup()
  fetchSeasonInfo()
  fetchSolarTerms()
})
</script>

<template>
  <div class="activity-page">
    <!-- Tab 栏 -->
    <div class="tabs">
      <button
        v-for="tab in [
          { key: 'lottery', label: '奇遇礼莲', icon: '🎰' },
          { key: 'battlepass', label: '荷风游记', icon: '📜' },
          { key: 'shop', label: '荷露商店', icon: '🛒' },
          { key: 'solar', label: '节令小礼', icon: '🌿' },
        ]"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key as any"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="content">
      <!-- 奇遇礼莲 (抽奖) -->
      <div v-if="activeTab === 'lottery'" class="tab-content">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="lotteryActivities.length === 0" class="empty">暂无抽奖活动</div>
        <div v-else>
          <div v-for="act in lotteryActivities" :key="act.activityId" class="lottery-card">
            <div class="card-header">
              <div class="card-title">{{ act.name }}</div>
              <div v-if="act.beginTime" class="card-time">
                {{ formatDate(act.beginTime) }} ~ {{ formatDate(act.endTime) }}
              </div>
            </div>

            <!-- 抽奖次数 -->
            <div class="lottery-limits">
              <div class="limit-item">
                <span class="limit-label">免费</span>
                <span class="limit-value" :class="freeRemain > 0 ? 'free' : 'used'">{{ freeRemain }} / {{ drawInfo?.freeLimit ?? '-' }}</span>
              </div>
              <div class="limit-item">
                <span class="limit-label">付费</span>
                <span class="limit-value" :class="paidRemain > 0 ? 'paid' : 'used'">{{ paidRemain }} / {{ drawInfo?.paidLimit ?? '-' }}</span>
              </div>
              <div class="limit-hint">付费抽奖每次需要30点券</div>
            </div>

            <!-- 活动说明 -->
            <div v-if="act.extra" class="activity-desc">
              <div v-for="(txt, i) in parseExtra(act.extra)?.tips?.txt || []" :key="i" v-html="txt" />
            </div>

            <!-- 抽奖按钮 -->
            <div class="card-actions" v-if="totalRemaining > 0">
              <button
                class="btn btn-primary"
                :disabled="operateLoading"
                @click="onDrawClick(act.activityId, 7)"
              >
                {{ operateLoading ? '抽奖中...' : '单抽' }}
              </button>
              <button
                class="btn btn-accent"
                :disabled="operateLoading"
                @click="onDrawClick(act.activityId, 9)"
              >
                {{ operateLoading ? '抽奖中...' : '连抽' }}
              </button>
            </div>
            <div v-else class="draw-empty">今日次数已用完</div>

            <!-- 付费确认弹窗 -->
            <Teleport to="body">
              <div v-if="showPaidConfirm" class="modal-overlay" @click.self="showPaidConfirm = false">
                <div class="modal-box">
                  <div class="modal-title">确认抽奖</div>
                  <div class="modal-body">
                    当前免费次数已用完，将消耗付费次数。
                    <br/><br/>
                    本次抽奖将花费 <b>{{ paidDrawCount(pendingDrawType) * 30 }}</b> 点券
                  </div>
                  <div class="modal-actions">
                    <button class="btn btn-secondary" @click="showPaidConfirm = false">取消</button>
                    <button class="btn btn-primary" @click="confirmPaidDraw">确认</button>
                  </div>
                </div>
              </div>
            </Teleport>

            <!-- 奖品池 -->
            <div v-if="drawInfo?.prizes?.length" class="prize-pool">
              <div class="prize-title">奖品池</div>
              <div class="prize-list">
                <div
                  v-for="(prize, i) in drawInfo.prizes"
                  :key="i"
                  class="prize-item"
                  :class="'quality-' + prize.quality"
                >
                  <div class="prize-name">{{ prize.seedName || `种子#${prize.seedId}` }}</div>
                  <div class="prize-meta">
                    <span class="prize-quality">{{ qualityLabel(prize.quality) }}</span>
                    <span class="prize-prob">{{ prize.probability }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 抽奖结果 -->
          <div v-if="operateResult" class="result-card">
            <div class="result-title">抽奖结果</div>
            <div class="result-data">
              <template v-if="operateResult.rewards?.length">
                获得: {{ operateResult.rewards.map((p: any) => (p.seedName || `#${p.seedId}`) + (p.count > 1 ? ` x${p.count}` : '')).join(', ') }}
              </template>
              <template v-else>
                操作成功
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 荷风游记 (战令) -->
      <div v-if="activeTab === 'battlepass'" class="tab-content">
        <div v-if="!seasonInfo" class="loading">加载中...</div>
        <div v-else class="season-card">
          <div class="card-title">{{ seasonInfo.name }}</div>
          <div class="season-info">
            <div>状态: {{ seasonInfo.status }}</div>
            <div>开始: {{ new Date(seasonInfo.start_time * 1000).toLocaleDateString() }}</div>
            <div>结束: {{ new Date(seasonInfo.end_time * 1000).toLocaleDateString() }}</div>
          </div>
          <div v-if="seasonInfo.battle_pass" class="battlepass-data">
            战令数据: {{ seasonInfo.battle_pass.length }} 字节
          </div>
        </div>
      </div>

      <!-- 荷露商店 (兑换) -->
      <div v-if="activeTab === 'shop'" class="tab-content">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="shopActivities.length === 0" class="empty">暂无商店活动</div>
        <div v-else>
          <div v-for="act in shopActivities" :key="act.activityId" class="shop-card">
            <div class="card-title">{{ act.name }}</div>
            <div class="activity-info">
              <div v-if="act.beginTime" class="info-row">
                <span class="info-label">活动时间</span>
                <span class="info-value">{{ formatDate(act.beginTime) }} ~ {{ formatDate(act.endTime) }}</span>
              </div>
            </div>
            <div class="card-actions">
              <button
                class="btn btn-primary"
                :disabled="operateLoading"
                @click="doOperate(act.activityId, 1)"
              >
                {{ operateLoading ? '兑换中...' : '兑换' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 节令小礼 -->
      <div v-if="activeTab === 'solar'" class="tab-content">
        <div v-if="solarTerms.length === 0" class="empty">暂无节令活动</div>
        <div v-else>
          <div v-for="term in solarTerms" :key="term.term_id" class="solar-card">
            <div class="card-title">{{ term.name }}</div>
            <div class="solar-info">
              <div>状态: {{ term.status === 1 ? '进行中' : '已结束' }}</div>
              <div>开始: {{ new Date(term.start_time * 1000).toLocaleDateString() }}</div>
              <div>结束: {{ new Date(term.end_time * 1000).toLocaleDateString() }}</div>
            </div>
            <div v-if="term.rewards?.length" class="solar-rewards">
              <div class="rewards-title">节令奖励</div>
              <div v-for="(r, i) in term.rewards" :key="i" class="reward-item">
                物品 #{{ r.item_id }} x{{ r.count }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  background: var(--bg-primary, #fff);
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  background: var(--bg-hover, #f3f4f6);
}

.tab-btn.active {
  background: var(--accent-bg, #ecfdf5);
  border-color: var(--accent-color, #059669);
  color: var(--accent-color, #059669);
  font-weight: 600;
}

.tab-icon {
  font-size: 18px;
}

.content {
  flex: 1;
  overflow-y: auto;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, #9ca3af);
}

.lottery-card, .shop-card, .season-card, .solar-card, .result-card {
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 20px;
}

.card-header {
  margin-bottom: 16px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.card-time {
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 4px;
}

.activity-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #6b7280);
  padding: 12px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  margin-bottom: 16px;
}

.activity-desc :deep(b) {
  color: var(--text-primary, #111827);
  font-weight: 600;
}

.activity-desc :deep(br) {
  display: block;
  margin-top: 4px;
}

.card-actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-color, #059669);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover, #047857);
}

.btn-accent {
  background: #8b5cf6;
  color: #fff;
}

.btn-accent:hover:not(:disabled) {
  background: #7c3aed;
}

.season-info, .solar-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
}

.battlepass-data {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

.solar-rewards {
  margin-top: 12px;
}

.rewards-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-primary, #111827);
}

.reward-item {
  padding: 6px 12px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 4px;
}

.lottery-limits {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.limit-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
}

.limit-label {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.limit-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color, #059669);
}

.limit-value.free {
  color: var(--accent-color, #059669);
}

.limit-value.paid {
  color: #f59e0b;
}

.limit-value.used {
  color: var(--text-secondary, #9ca3af);
  text-decoration: line-through;
}

.limit-hint {
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  margin-left: 4px;
  align-self: center;
}

.draw-empty {
  font-size: 14px;
  color: var(--text-secondary, #9ca3af);
  padding: 10px 0;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: var(--bg-primary, #fff);
  border-radius: 16px;
  padding: 24px;
  width: 320px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary, #111827);
}

.modal-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 20px;
}

.modal-body b {
  color: #f59e0b;
  font-weight: 700;
  font-size: 16px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-secondary {
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-secondary, #6b7280);
}

.prize-pool {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.prize-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary, #111827);
}

.prize-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.prize-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-secondary, #f9fafb);
  border-left: 3px solid #9ca3af;
}

.prize-item.quality-2 {
  border-left-color: #3b82f6;
}

.prize-item.quality-3 {
  border-left-color: #a855f7;
}

.prize-item.quality-4 {
  border-left-color: #f59e0b;
}

.prize-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #111827);
  margin-bottom: 4px;
}

.prize-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.prize-quality {
  color: var(--text-secondary, #6b7280);
}

.prize-prob {
  font-weight: 600;
  color: var(--accent-color, #059669);
}

.result-card {
  background: #f0fdf4;
  border-color: #86efac;
}

.result-title {
  font-size: 16px;
  font-weight: 600;
  color: #166534;
  margin-bottom: 12px;
}

.result-data {
  font-size: 14px;
  color: #15803d;
}

</style>
