<script setup lang="ts">
import type { QixiActivityDto, QixiDewTargetsDto } from '@/stores/activity-center'
import { computed, ref } from 'vue'
import QixiDewPanel from './QixiDewPanel.vue'

interface FriendOption {
  gid?: string | number
  name?: string
  remark?: string
  avatarUrl?: string
  avatar_url?: string
  level?: string | number
}

const props = defineProps<{
  activity: QixiActivityDto | null
  friends: FriendOption[]
  friendsLoading: boolean
  pendingBridge: boolean
  pendingGift: boolean
  pendingDew: boolean
  dewTargets: QixiDewTargetsDto | null
  dewTargetsLoading: boolean
  dewTargetsError: string
}>()

const emit = defineEmits<{
  claimBridge: []
  gift: [friendGid: string]
  loadDewTargets: [hostGid: string]
  useDew: [hostGid: string, landId: string]
  refreshFriends: []
}>()

const search = ref('')
const selectedFriendGid = ref('')
const failedAvatars = ref(new Set<string>())

const sachetBalance = computed(() => {
  const value = Number(props.activity?.balances.sachet || 0)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
})

const filteredFriends = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  const source = props.friends.filter(friend => Number(friend.gid) > 0)
  if (!keyword)
    return source.slice(0, 60)
  return source.filter((friend) => {
    const name = String(friend.remark || friend.name || '').toLowerCase()
    return name.includes(keyword) || String(friend.gid || '').includes(keyword)
  }).slice(0, 60)
})

const selectedFriend = computed(() => props.friends.find(friend => String(friend.gid || '') === selectedFriendGid.value) || null)
const giftDisabled = computed(() => !selectedFriend.value || sachetBalance.value < 1 || props.pendingGift || !props.activity?.actions.gift.enabled)

function friendName(friend: FriendOption) {
  return String(friend.remark || friend.name || `好友 ${friend.gid || ''}`)
}

function friendAvatar(friend: FriendOption) {
  return String(friend.avatarUrl || friend.avatar_url || '')
}

function chooseFriend(friend: FriendOption) {
  selectedFriendGid.value = String(friend.gid || '')
}

function submitGift() {
  if (!giftDisabled.value)
    emit('gift', selectedFriendGid.value)
}

function markAvatarFailed(friend: FriendOption) {
  failedAvatars.value = new Set(failedAvatars.value).add(String(friend.gid || ''))
}

function stageState(stage: QixiActivityDto['bridge']['stages'][number]) {
  if (stage.claimable)
    return '待领取'
  if (stage.claimed)
    return '已完成'
  if (stage.current)
    return '建设中'
  return stage.completed ? '已达成' : '未达成'
}
</script>

<template>
  <div class="qixi-page">
    <section v-if="activity" class="resource-band">
      <div class="resource-band__title">
        <span class="i-carbon-event-schedule" />
        <div>
          <strong>鹊桥进度</strong>
          <span>当前第 {{ activity.bridge.currentStage || 0 }} 阶段</span>
        </div>
      </div>
      <div class="resource-list">
        <div class="resource-item">
          <img :src="activity.feather.image" alt="">
          <span>{{ activity.feather.name || '鹊羽' }}</span>
          <strong>{{ activity.balances.known ? (activity.balances.feather || '0') : '--' }}</strong>
        </div>
        <div class="resource-item">
          <img :src="activity.sachet.image" alt="">
          <span>{{ activity.sachet.name || '鹊羽香囊' }}</span>
          <strong>{{ activity.balances.known ? (activity.balances.sachet || '0') : '--' }}</strong>
        </div>
        <div class="resource-item">
          <img :src="activity.receivedSachet.image" alt="">
          <span>获赠香囊</span>
          <strong>{{ activity.balances.known ? (activity.balances.receivedSachet || '0') : '--' }}</strong>
        </div>
        <div class="resource-item resource-item--count">
          <span class="i-carbon-user-favorite" />
          <span>已赠好友</span>
          <strong>{{ activity.gift.sentCount || '0' }}</strong>
        </div>
      </div>
    </section>

    <template v-if="activity">
      <QixiDewPanel
        :activity="activity"
        :friends="friends"
        :friends-loading="friendsLoading"
        :targets="dewTargets"
        :loading="dewTargetsLoading"
        :pending="pendingDew"
        :error="dewTargetsError"
        @load-targets="emit('loadDewTargets', $event)"
        @use="emit('useDew', $event.hostGid, $event.landId)"
        @refresh-friends="emit('refreshFriends')"
      />

      <section class="qixi-section bridge-section">
        <div class="section-heading">
          <div>
            <small>三阶段建设</small>
            <h2>筑建鹊桥</h2>
          </div>
          <button
            type="button"
            class="primary-command"
            :disabled="pendingBridge || !activity.actions.bridge.enabled"
            @click="emit('claimBridge')"
          >
            <span v-if="pendingBridge" class="i-carbon-circle-dash animate-spin" />
            <span v-else class="i-carbon-gift" />
            {{ pendingBridge ? '领取中' : activity.bridge.claimable ? '筑桥并领取' : '暂无奖励' }}
          </button>
        </div>

        <div class="bridge-track" aria-hidden="true">
          <span
            v-for="stage in activity.bridge.stages"
            :key="`track-${stage.id}`"
            :class="{ complete: stage.completed, current: stage.current }"
          />
        </div>

        <div class="stage-grid">
          <article
            v-for="stage in activity.bridge.stages"
            :key="stage.id"
            class="stage-card"
            :class="{ 'stage-card--complete': stage.completed, 'stage-card--current': stage.current }"
          >
            <header>
              <span>第 {{ stage.stage }} 阶段</span>
              <strong>{{ stageState(stage) }}</strong>
            </header>
            <div class="stage-cost">
              <img :src="stage.cost.image" alt="">
              <span>需要 {{ stage.cost.name || '鹊羽' }}</span>
              <b>{{ stage.cost.count }}</b>
            </div>
            <div class="reward-list">
              <div v-for="reward in stage.rewards" :key="`${stage.id}-${reward.id}`" class="reward-item">
                <img :src="reward.image" alt="">
                <span>{{ reward.name || reward.id }}</span>
                <b>×{{ reward.count }}</b>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="qixi-section gift-section">
        <div class="section-heading">
          <div>
            <small>佳节情谊</small>
            <h2>赠送鹊羽香囊</h2>
          </div>
          <button type="button" class="icon-command" :disabled="friendsLoading" title="刷新好友" @click="emit('refreshFriends')">
            <span v-if="friendsLoading" class="i-carbon-circle-dash animate-spin" />
            <span v-else class="i-carbon-renew" />
          </button>
        </div>

        <div class="gift-workspace">
          <div class="friend-picker">
            <label class="search-field">
              <span class="i-carbon-search" />
              <input v-model="search" type="search" placeholder="搜索好友昵称或 GID">
            </label>
            <div v-if="friendsLoading && friends.length === 0" class="friend-state">
              正在加载好友
            </div>
            <div v-else-if="filteredFriends.length === 0" class="friend-state">
              未找到可赠送好友
            </div>
            <div v-else class="friend-list">
              <button
                v-for="friend in filteredFriends"
                :key="String(friend.gid)"
                type="button"
                class="friend-option"
                :class="{ selected: selectedFriendGid === String(friend.gid) }"
                @click="chooseFriend(friend)"
              >
                <img
                  v-if="friendAvatar(friend) && !failedAvatars.has(String(friend.gid))"
                  :src="friendAvatar(friend)"
                  alt=""
                  @error="markAvatarFailed(friend)"
                >
                <span v-else class="friend-avatar-fallback i-carbon-user-avatar" />
                <span class="friend-option__name">
                  <strong>{{ friendName(friend) }}</strong>
                  <small>GID {{ friend.gid }}<template v-if="friend.level"> · Lv.{{ friend.level }}</template></small>
                </span>
                <span v-if="selectedFriendGid === String(friend.gid)" class="friend-option__mark i-carbon-checkmark-filled" />
                <span v-else class="friend-option__mark i-carbon-chevron-right" />
              </button>
            </div>
          </div>

          <div class="gift-composer">
            <div v-if="selectedFriend" class="selected-friend">
              <span>赠送给</span>
              <strong>{{ friendName(selectedFriend) }}</strong>
              <small>GID {{ selectedFriend.gid }}</small>
            </div>
            <div v-else class="selected-friend selected-friend--empty">
              <span class="i-carbon-user-follow" />
              <strong>选择一位好友</strong>
            </div>

            <div class="gift-item">
              <img :src="activity.sachet.image" alt="">
              <div>
                <span>{{ activity.sachet.name || '鹊羽香囊' }}</span>
                <strong>可用 {{ activity.balances.known ? (activity.balances.sachet || '0') : '--' }}</strong>
              </div>
            </div>

            <div class="gift-protocol-note">
              <span class="i-carbon-information" />
              <div>
                <strong>每次固定赠送 1 个</strong>
                <small>使用官方默认祝福文案（ID 15）</small>
              </div>
            </div>

            <button type="button" class="gift-command" :disabled="giftDisabled" @click="submitGift">
              <span v-if="pendingGift" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-send-alt" />
              {{ pendingGift ? '赠送中' : '赠送 1 个香囊' }}
            </button>
          </div>
        </div>
      </section>

      <details v-if="activity.rules.paragraphs.length" class="rules-section">
        <summary>{{ activity.rules.title || '活动说明' }}</summary>
        <p v-for="line in activity.rules.paragraphs" :key="line">
          {{ line }}
        </p>
      </details>
    </template>

    <div v-else class="qixi-empty">
      <span class="i-carbon-calendar-heat-map" />
      <strong>当前账号暂未发现鹊桥寄情活动</strong>
    </div>
  </div>
</template>

<style scoped>
.qixi-page {
  min-height: 100%;
  overflow: visible;
  padding: 86px 0 60px;
  color: #26373a;
  background: #f3f5f2;
}
.resource-band {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 28px;
  color: #f8faf7;
  background: #214a50;
}
.resource-band__title {
  min-width: 170px;
  display: flex;
  align-items: center;
  gap: 11px;
}
.resource-band__title > span {
  font-size: 26px;
  color: #f2c66e;
}
.resource-band__title div,
.resource-item {
  display: flex;
  flex-direction: column;
}
.resource-band__title strong {
  font-size: 17px;
}
.resource-band__title span,
.resource-item span {
  color: #c9d9d7;
  font-size: 11px;
}
.resource-list {
  min-width: 0;
  display: grid;
  flex: 1;
  grid-template-columns: repeat(4, minmax(110px, 1fr));
  gap: 10px;
}
.resource-item {
  position: relative;
  min-height: 58px;
  justify-content: center;
  padding: 8px 10px 8px 54px;
  border-left: 1px solid rgba(255, 255, 255, 0.18);
}
.resource-item img,
.resource-item--count > :first-child {
  position: absolute;
  left: 10px;
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.resource-item--count > :first-child {
  display: grid;
  place-items: center;
  color: #f2c66e;
  font-size: 26px;
}
.resource-item strong {
  margin-top: 2px;
  font-size: 19px;
}
.qixi-section {
  padding: 26px 28px;
  border-bottom: 1px solid #d8dfdc;
  background: #fff;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.section-heading div {
  min-width: 0;
}
.section-heading small {
  color: #8a5c52;
  font-size: 10px;
  font-weight: 700;
}
.section-heading h2 {
  margin: 2px 0 0;
  color: #26373a;
  font-size: 20px;
  letter-spacing: 0;
}
.primary-command,
.gift-command {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  background: #b14f53;
  font-weight: 700;
  cursor: pointer;
}
.primary-command:disabled,
.gift-command:disabled,
.icon-command:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.bridge-track {
  height: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 0 4px 14px;
}
.bridge-track span {
  border-radius: 4px;
  background: #dde3e0;
}
.bridge-track span.complete {
  background: #d8a443;
}
.bridge-track span.current {
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3px #b8772c;
}
.stage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.stage-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid #d6ddda;
  border-radius: 8px;
  background: #f7f9f7;
}
.stage-card--complete {
  border-color: #d7bd82;
  background: #fffaf0;
}
.stage-card--current {
  box-shadow: inset 0 0 0 1px #b8772c;
}
.stage-card header,
.stage-cost,
.reward-item {
  display: flex;
  align-items: center;
}
.stage-card header {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.stage-card header span {
  font-size: 13px;
  font-weight: 700;
}
.stage-card header strong {
  color: #8a5c52;
  font-size: 10px;
}
.stage-cost {
  gap: 7px;
  padding-bottom: 10px;
  border-bottom: 1px solid #dde2df;
  color: #657275;
  font-size: 11px;
}
.stage-cost img,
.reward-item img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.stage-cost b,
.reward-item b {
  margin-left: auto;
  color: #26373a;
}
.reward-list {
  display: grid;
  gap: 7px;
  padding-top: 10px;
}
.reward-item {
  min-width: 0;
  gap: 7px;
  font-size: 11px;
}
.reward-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gift-section {
  background: #f9faf8;
}
.icon-command {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #cdd7d3;
  border-radius: 6px;
  color: #315d63;
  background: #fff;
  cursor: pointer;
}
.gift-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.75fr);
  gap: 20px;
}
.friend-picker {
  min-width: 0;
}
.search-field {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid #ccd6d2;
  border-radius: 6px;
  color: #6d7c7d;
  background: #fff;
}
.search-field input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #26373a;
  background: transparent;
}
.friend-list {
  max-height: 318px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  overflow: auto;
  margin-top: 10px;
  padding-right: 3px;
}
.friend-option {
  min-width: 0;
  height: 62px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 1px solid #d5ddda;
  border-radius: 7px;
  color: #314245;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.friend-option.selected {
  border-color: #b14f53;
  box-shadow: inset 0 0 0 1px #b14f53;
  background: #fff6f5;
}
.friend-option img,
.friend-avatar-fallback {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.friend-avatar-fallback {
  display: grid;
  place-items: center;
  color: #7c8e8d;
  background: #e7ecea;
  font-size: 22px;
}
.friend-option__name {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.friend-option__name strong,
.friend-option__name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.friend-option__name strong {
  font-size: 12px;
}
.friend-option__name small {
  margin-top: 3px;
  color: #80908f;
  font-size: 9px;
}
.friend-option__mark {
  color: #b14f53;
}
.friend-state {
  height: 180px;
  display: grid;
  place-items: center;
  color: #7b8989;
  font-size: 12px;
}
.gift-composer {
  min-width: 0;
  align-self: start;
  padding: 16px;
  border: 1px solid #d5ddda;
  border-radius: 8px;
  background: #fff;
}
.selected-friend {
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e5e3;
}
.selected-friend span,
.selected-friend small {
  color: #7b8989;
  font-size: 10px;
}
.selected-friend strong {
  margin: 3px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-friend--empty {
  align-items: center;
  flex-direction: row;
  gap: 8px;
  color: #80908f;
}
.gift-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
}
.gift-item img {
  width: 46px;
  height: 46px;
  object-fit: contain;
}
.gift-item div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.gift-item span {
  color: #7b8989;
  font-size: 10px;
}
.gift-item strong {
  margin-top: 3px;
  font-size: 14px;
}
.gift-protocol-note {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 11px;
  border: 1px solid #d8dfdc;
  border-radius: 6px;
  color: #315d63;
  background: #f4f8f6;
}
.gift-protocol-note > span {
  flex: 0 0 auto;
  font-size: 18px;
}
.gift-protocol-note div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.gift-protocol-note strong {
  font-size: 11px;
}
.gift-protocol-note small {
  margin-top: 2px;
  color: #72817f;
  font-size: 9px;
}
.gift-command {
  width: 100%;
  margin-top: 10px;
  background: #315d63;
}
.rules-section {
  padding: 18px 28px 28px;
  color: #657275;
  background: #eef1ee;
  font-size: 11px;
  line-height: 1.7;
}
.rules-section summary {
  color: #314245;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.rules-section p {
  margin: 7px 0 0;
}
.qixi-empty {
  min-height: 440px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: #748483;
}
.qixi-empty > span {
  font-size: 34px;
}
@media (max-width: 900px) {
  .qixi-page {
    padding-top: 72px;
  }
  .resource-band {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  .resource-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .resource-item {
    border-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.16);
  }
  .qixi-section {
    padding: 20px 16px;
  }
  .stage-grid,
  .gift-workspace {
    grid-template-columns: 1fr;
  }
  .friend-list {
    grid-template-columns: 1fr;
  }
  .gift-composer {
    padding: 14px;
  }
  .rules-section {
    padding: 16px;
  }
}
@media (max-width: 380px) {
  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .primary-command {
    width: 100%;
  }
  .resource-list {
    grid-template-columns: 1fr;
  }
}
</style>
