/**
 * 修行志的「去办」导航 —— 任务只报「做什么」,玩家还得自己找地方。
 * 这里按任务条件的性质给出直达页;拿不准的地方一律不给,不赌。
 * 纯函数:给条件/计数键,回来页面或 null。
 */
import type { AchvCond, CounterKey } from '@/types'

/** 命名路由 + 可选查询,与 vue-router 的 to 同形 */
export type QuestNav = { name: string; query?: Record<string, string> } | null

function navForCond(cond: AchvCond): QuestNav {
  if (cond.type === 'realm') return { name: 'cultivation' }
  // 品质型成就没有固定去处,拿不准就 null
  if (cond.type === 'quality') return null
  // 境界里程碑多用 realm_<major>_<sub> 的 custom 键(如开局主线 realm_0_2)——
  // 与 checkAchievements 的识别同一式,落到修炼页
  if (cond.type === 'custom' && /^realm_\d+_\d+$/.test(cond.key)) return { name: 'cultivation' }
  switch (cond.key) {
    // 战斗与历练都落在历练页
    case 'kills':
    case 'bossKills':
    case 'explores':
      return { name: 'adventure' }
    // 服丹 / 炼丹 → 行囊丹药签
    case 'pillsUsed':
    case 'pillsCrafted':
      return { name: 'inventory', query: { tab: 'pill' } }
    // 强化装备 → 行囊装备签
    case 'upgrades':
      return { name: 'inventory', query: { tab: 'equip' } }
    // 营建 → 洞府;功法 / 突破 → 修炼页
    case 'buildingUpgrades':
      return { name: 'dongfu' }
    case 'gongfaLearned':
    case 'breakthroughs':
      return { name: 'cultivation' }
    default:
      return null
  }
}

/** 主线:按它的条件给直达页 */
export function mainQuestNav(cond: AchvCond): QuestNav {
  return navForCond(cond)
}

/** 日课:只按计数键给直达页(每日任务的判据本质就是计数器) */
export function dailyTaskNav(counterKey: CounterKey): QuestNav {
  return navForCond({ type: 'counter', key: counterKey, value: 0 })
}
