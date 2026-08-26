import type { ActivityGameplayModule, ResolvedActivityGameplay } from './types'
import type { ActivityDirectoryItemDto, ActivityGameplayKey } from '@/stores/activity-center'
import { qixiGameplay } from './qixi'
import { stellarGameplay } from './stellar'
import { weatherGameplay } from './weather'

const gameplayModules: Record<ActivityGameplayKey, ActivityGameplayModule> = {
  stellar: stellarGameplay,
  qixi: qixiGameplay,
  weather: weatherGameplay,
}

export function resolveActivityGameplay(activity: ActivityDirectoryItemDto): ResolvedActivityGameplay | null {
  const gameplayKey = activity.gameplayKey || (activity.detailTarget === 'weather' ? 'weather' : activity.detailTarget === 'qixi' ? 'qixi' : activity.detailTarget ? 'stellar' : null)
  if (!gameplayKey)
    return null
  const module = gameplayModules[gameplayKey]
  if (!module)
    return null
  const entryTab = activity.detailTarget && module.tabs.includes(activity.detailTarget)
    ? activity.detailTarget
    : activity.gameplayTargets.find(tab => module.tabs.includes(tab)) || module.defaultTab
  return { module, entryTab, activity }
}

export function activityHasGameplay(activity: ActivityDirectoryItemDto) {
  return resolveActivityGameplay(activity) !== null
}
