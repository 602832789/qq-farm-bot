import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAccountStore } from '@/stores/account'

export type GameScene = 'farm' | 'ranch'

/** 整站按场景换皮：侧栏品牌与控制台读这一份，避免两处各写一套中文名。 */
export const SCENE_BRAND: Record<GameScene, { title: string, subtitle: string }> = {
  farm: { title: 'QQ农场智能助手', subtitle: 'QQ FARM ASSISTANT' },
  ranch: { title: 'QQ牧场智能助手', subtitle: 'QQ RANCH ASSISTANT' },
}

/** 每个账号单独记浏览场景，切号回来仍停在上次看的那个庄园。 */
const SCENE_KEY = 'account_web_scenes'

export const useSceneStore = defineStore('scene', () => {
  const accountStore = useAccountStore()
  const selections = useStorage<Record<string, GameScene>>(SCENE_KEY, {})

  const selectionKey = computed(() => String(accountStore.currentAccountId || '_default'))
  const scene = computed<GameScene>(() => (selections.value[selectionKey.value] === 'ranch' ? 'ranch' : 'farm'))

  /** 侧栏「农场 / 牧场」分段开关：只改浏览偏好，跳转由调用方负责。 */
  function select(value: GameScene) {
    selections.value = { ...selections.value, [selectionKey.value]: value }
  }

  /** 路由反向同步用：只有值真的变化才写盘，避免每次导航都触发一次存储写入。 */
  function setScene(value: GameScene) {
    if (scene.value !== value)
      select(value)
  }

  return {
    scene,
    select,
    setScene,
  }
})
