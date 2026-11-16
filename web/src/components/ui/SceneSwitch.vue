<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSceneStore } from '@/stores/scene'

/**
 * 全局场景开关。
 *
 * 农场（game_scene_id=1）和牧场（game_scene_id=2）是同一个账号下的两个场景，背包、商店、
 * 图鉴、好友在两边各有一套协议。这里切的是整个应用的浏览场景：标题与页面内容一起换，
 * 不在每个页面里各放一个开关——否则在商店切到牧场、到好友页看到的还是农场好友。
 * 后端没有可长期停留的场景，每次请求都要重新进场景再切回来，所以这里只登记浏览偏好，
 * 不发任何请求，也不能被当成服务端状态读。
 *
 * 本地是页面式信息架构（牧场是独立页），所以切场景同时负责跳到对应页面；
 * 反过来，路由变化也会把场景同步回来（见 DefaultLayout）。
 */
const sceneStore = useSceneStore()
const router = useRouter()
const { scene } = storeToRefs(sceneStore)

const target = computed(() => (scene.value === 'farm'
  ? { value: 'ranch' as const, label: '去牧场', icon: 'i-carbon-wheat', path: '/ranch' }
  : { value: 'farm' as const, label: '去农场', icon: 'i-carbon-sprout', path: '/personal' }))

function go() {
  sceneStore.setScene(target.value.value)
  void router.push(target.value.path)
}
</script>

<template>
  <button
    type="button"
    class="scene-switch"
    :style="{ color: 'var(--theme-primary)' }"
    :title="target.label"
    :aria-label="target.label"
    @click="go"
  >
    <span :class="target.icon" class="text-lg" aria-hidden="true" />
    <span class="scene-switch__label">{{ target.label }}</span>
  </button>
</template>

<style scoped>
.scene-switch {
  height: 36px;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 150ms ease;
}

.scene-switch:hover {
  background: var(--ui-hover, rgb(0 0 0 / 6%));
}

.scene-switch__label {
  display: none;
}

@media (min-width: 640px) {
  .scene-switch__label {
    display: inline;
  }
}
</style>
