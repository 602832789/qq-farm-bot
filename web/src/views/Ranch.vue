<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import RanchActivity from './ranch/RanchActivity.vue'
import RanchAnalytics from './ranch/RanchAnalytics.vue'
import RanchFriends from './ranch/RanchFriends.vue'
import RanchIllustrated from './ranch/RanchIllustrated.vue'
import RanchOverview from './ranch/RanchOverview.vue'
import RanchPersonal from './ranch/RanchPersonal.vue'
import RanchShop from './ranch/RanchShop.vue'

/**
 * 牧场场景外壳：按 `:section` 只决定渲染哪一个子页。
 *
 * 牧场是独立场景（game_scene_id=2），侧栏整套换成 ranch-menu，
 * 每个子页都是独立路由，不再用一个页面里的十个页签堆在一起。
 * 协议读取、缓存与待核对账本仍然收在各子页的 RanchSceneHost 里。
 */
const route = useRoute()

const SECTIONS = {
  overview: RanchOverview,
  personal: RanchPersonal,
  friends: RanchFriends,
  activity: RanchActivity,
  shop: RanchShop,
  illustrated: RanchIllustrated,
  analytics: RanchAnalytics,
} as const

type RanchSection = keyof typeof SECTIONS

const component = computed(() => {
  const section = String(route.params.section || 'overview') as RanchSection
  return SECTIONS[section] || RanchOverview
})
</script>

<template>
  <component :is="component" />
</template>
