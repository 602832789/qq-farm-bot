import type { ActivityGameplayModule } from '../types'

export const weatherGameplay = {
  key: 'weather',
  defaultTab: 'weather',
  tabs: ['weather'],
} as const satisfies ActivityGameplayModule
