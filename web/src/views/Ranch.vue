<script setup lang="ts">
import type { RanchView } from '@/utils/ranch'
import { ref } from 'vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'
import { RANCH_VIEW_LABELS, RANCH_VIEWS } from '@/utils/ranch'

// 牧场在协议上是独立场景（game_scene_id=2），每个分区都要临时切场景再切回来，
// 所以这里只保留一个分区状态，读取与缓存判定全部交给 RanchSceneHost。
const view = ref<RanchView>('animals')
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="item in RANCH_VIEWS"
        :key="item"
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm transition"
        :class="view === item
          ? 'bg-primary text-white'
          : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="view = item"
      >
        {{ RANCH_VIEW_LABELS[item] }}
      </button>
    </div>

    <RanchSceneHost :view="view" title="牧场" />
  </div>
</template>
