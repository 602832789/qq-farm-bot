<script setup lang="ts">
import type { RanchView } from '@/utils/ranch'
import { computed, ref } from 'vue'
import PersonalResourceStrip from '@/components/PersonalResourceStrip.vue'
import RanchActivitiesPanel from '@/components/ranch/RanchActivitiesPanel.vue'
import RanchAnimalsPanel from '@/components/ranch/RanchAnimalsPanel.vue'
import RanchBagPanel from '@/components/ranch/RanchBagPanel.vue'
import RanchCansPanel from '@/components/ranch/RanchCansPanel.vue'
import RanchFacilitiesPanel from '@/components/ranch/RanchFacilitiesPanel.vue'
import RanchFriendsPanel from '@/components/ranch/RanchFriendsPanel.vue'
import RanchIllustratedPanel from '@/components/ranch/RanchIllustratedPanel.vue'
import RanchMarketPanel from '@/components/ranch/RanchMarketPanel.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'
import RanchShopPanel from '@/components/ranch/RanchShopPanel.vue'
import RanchTasksPanel from '@/components/ranch/RanchTasksPanel.vue'
import { RANCH_VIEW_LABELS, RANCH_VIEWS } from '@/utils/ranch'

// 牧场在协议上是独立场景（game_scene_id=2），每个分区都要临时切场景再切回来，
// 所以这里只保留分区与查询参数，读取、缓存与待核对账本全部交给 RanchSceneHost。
const view = ref<RanchView>('animals')
const shopId = ref<number | null>(null)
const cansSlot = ref<number | null>(null)
const hostGid = ref('')

// 商店/罐头/好友各有自己的查询参数，只在本分区生效，避免串到别的分区。
const params = computed(() => {
  if (view.value === 'shop' && shopId.value !== null)
    return { shopId: shopId.value }
  if (view.value === 'cans' && cansSlot.value !== null)
    return { shopId: cansSlot.value }
  if (view.value === 'friends' && hostGid.value)
    return { hostGid: hostGid.value }
  return {}
})

function switchView(next: RanchView) {
  view.value = next
  shopId.value = null
  cansSlot.value = null
  hostGid.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <!-- 与「我的农场」同一份资产条：等级 / 金币 / 点券 / 化肥，切场景时不用换地方看。 -->
    <PersonalResourceStrip />

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="item in RANCH_VIEWS"
        :key="item"
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm transition"
        :class="view === item
          ? 'text-white shadow-sm'
          : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        :style="view === item ? { backgroundColor: 'var(--theme-primary)' } : {}"
        @click="switchView(item)"
      >
        {{ RANCH_VIEW_LABELS[item] }}
      </button>
    </div>

    <RanchSceneHost
      :view="view"
      :params="params"
      title="我的牧场"
      icon="i-carbon-wheat"
    >
      <template #default="{ state, onRequest, activeView }">
        <RanchAnimalsPanel v-if="activeView === 'animals'" :state="state" @request="onRequest" />
        <RanchFacilitiesPanel v-else-if="activeView === 'facilities'" :state="state" @request="onRequest" />
        <RanchBagPanel v-else-if="activeView === 'bag'" :state="state" @request="onRequest" />
        <RanchShopPanel
          v-else-if="activeView === 'shop'"
          :state="state"
          @request="onRequest"
          @shop-id="shopId = $event"
        />
        <RanchMarketPanel v-else-if="activeView === 'market'" :state="state" @request="onRequest" />
        <RanchCansPanel
          v-else-if="activeView === 'cans'"
          :state="state"
          @request="onRequest"
          @slot-type="cansSlot = $event"
        />
        <RanchTasksPanel v-else-if="activeView === 'tasks'" :state="state" @request="onRequest" />
        <RanchIllustratedPanel v-else-if="activeView === 'illustrated'" :state="state" @request="onRequest" />
        <RanchFriendsPanel
          v-else-if="activeView === 'friends'"
          :state="state"
          @request="onRequest"
          @host-gid="hostGid = $event"
        />
        <RanchActivitiesPanel v-else-if="activeView === 'activities'" :state="state" @request="onRequest" />
      </template>
    </RanchSceneHost>
  </div>
</template>
