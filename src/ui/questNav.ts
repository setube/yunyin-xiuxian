/** 修行志「去办」导航(纯函数):按任务条件给直达页;拿不准返回 null */
import type { AchvCond, CounterKey } from '@/types'

/** 命名路由 + 可选查询,与 vue-router 的 to 同形 */
export type QuestNav = { name: string; query?: Record<string, string> } | null

function navForCond(cond: AchvCond): QuestNav {
  if (cond.type === 'realm') return { name: 'cultivation' }
  // 品质型成就无固定去处
  if (cond.type === 'quality') return null
  // 境界里程碑的 custom 键 realm_<major>_<sub>;须与 checkAchievements 的识别同式
  if (cond.type === 'custom' && /^realm_\d+_\d+$/.test(cond.key)) return { name: 'cultivation' }
  switch (cond.key) {
    case 'kills':
    case 'bossKills':
    case 'explores':
    // 获得装备靠历练掉落(不是行囊 —— 那儿只能看与拆)
    case 'equipsGained':
      return { name: 'adventure' }
    case 'pillsUsed':
    case 'pillsCrafted':
      return { name: 'inventory', query: { tab: 'pill' } }
    case 'upgrades':
      return { name: 'inventory', query: { tab: 'equip' } }
    case 'buildingUpgrades':
      return { name: 'dongfu' }
    case 'gongfaLearned':
    case 'breakthroughs':
      return { name: 'cultivation' }
    default:
      return null
  }
}

export function mainQuestNav(cond: AchvCond): QuestNav {
  return navForCond(cond)
}

export function dailyTaskNav(counterKey: CounterKey): QuestNav {
  return navForCond({ type: 'counter', key: counterKey, value: 0 })
}
