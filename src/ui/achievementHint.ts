/**
 * 成就的「方向」—— 未达成者不现名目,但总得让人知道往哪使劲
 *
 * 未达成的成就在界面上是「???」+「尚未达成 · 成时自见」。藏名字是有意的(成时自现,
 * 免得把内容提前说破),但**连方向都不给**就过头了:六十多个「???」摆在那里,
 * 玩家不知道哪一条跟自己正在做的事有关,这一页对他就是一张白纸。
 *
 * 故按条件给一条方向(「历练际遇」「炼丹」「渡劫与突破」…)。方向由**条件本身**推出,
 * 不是另写一张清单 —— 后者迟早与新条件脱节。achievementHint.spec 会扫 CounterKey
 * 的联合类型,要求每一个计数器都有方向:新增计数器却忘了给它定方向,测试直接点名。
 */
import type { AchvCond, CounterKey } from '@/types'

/** 计数器 → 方向。新增 CounterKey 必须在此补齐(由 achievementHint.spec 守着) */
export const COUNTER_DIRECTIONS: Record<CounterKey, string> = {
  kills: '历练征战',
  bossKills: '地界首领',
  battles: '历练征战',
  explores: '历练',
  events: '历练际遇',
  equipsGained: '装备',
  upgrades: '装备',
  decomposed: '装备',
  pillsUsed: '丹药',
  pillsCrafted: '炼丹',
  pillsFailed: '炼丹',
  gongfaLearned: '功法参悟',
  breakthroughs: '突破与渡劫',
  breakthroughFails: '突破与渡劫',
  tribulations: '突破与渡劫',
  reincarnations: '轮回转世',
  soulsRefined: '器魂',
  offlineClaims: '离府归来',
  buildingUpgrades: '洞府经营'
}

/** 一条成就条件对应的方向 —— 未达成的条目靠它指路 */
export function achievementDirection(cond: AchvCond): string {
  switch (cond.type) {
    case 'counter':
      return COUNTER_DIRECTIONS[cond.key]
    case 'realm':
      return '境界精进'
    case 'quality':
      return '掉落与鉴宝'
    case 'custom':
      return '历程节点'
  }
}

/** 成就的「主题」—— 62 条平铺一列难回看,先按主题归成几段再铺 */
export type AchievementGroup =
  | 'realm'
  | 'breakthrough'
  | 'quest'
  | 'gear'
  | 'pill'
  | 'gongfa'
  | 'dongfu'
  | 'reinc'
  | 'milestone'

export const ACHIEVEMENT_GROUP_LABEL: Record<AchievementGroup, string> = {
  realm: '境界',
  breakthrough: '突破与渡劫',
  quest: '历练与征战',
  gear: '装备',
  pill: '丹药',
  gongfa: '功法',
  dongfu: '洞府',
  reinc: '转世',
  milestone: '历程'
}

/** 展示顺序:境界先行,往下是各玩法面,最后是特殊历程 */
export const ACHIEVEMENT_GROUP_ORDER: AchievementGroup[] = [
  'realm',
  'breakthrough',
  'quest',
  'gear',
  'pill',
  'gongfa',
  'dongfu',
  'reinc',
  'milestone'
]

/** 计数器 → 主题(与 COUNTER_DIRECTIONS 同键,但归得更粗,供分组标题用)。
 * 导出它供 spec 扫 CounterKey 联合类型核验,与方向表同等守则。 */
export const COUNTER_GROUPS: Record<CounterKey, AchievementGroup> = {
  kills: 'quest',
  bossKills: 'quest',
  battles: 'quest',
  explores: 'quest',
  events: 'quest',
  equipsGained: 'gear',
  upgrades: 'gear',
  decomposed: 'gear',
  pillsUsed: 'pill',
  pillsCrafted: 'pill',
  pillsFailed: 'pill',
  gongfaLearned: 'gongfa',
  breakthroughs: 'breakthrough',
  breakthroughFails: 'breakthrough',
  tribulations: 'breakthrough',
  reincarnations: 'reinc',
  soulsRefined: 'dongfu',
  offlineClaims: 'dongfu',
  buildingUpgrades: 'dongfu'
}

/** 一条成就归属的主题(条件是唯一依据,不另抄一张「成就→主题」清单) */
export function achievementGroup(cond: AchvCond): AchievementGroup {
  switch (cond.type) {
    case 'counter':
      return COUNTER_GROUPS[cond.key] ?? 'milestone'
    case 'realm':
      return 'realm'
    case 'quality':
      return 'gear'
    case 'custom':
      return 'milestone'
  }
}
