/** 成就方向:未达成者不现名目,只给一条方向标签;方向由条件本身推出,不另写清单 */
import type { AchvCond, CounterKey } from '@/types'
import { REALMS } from '@/data/realms'
import { QUALITIES } from '@/data/qualities'

/** 计数器 → 方向。新增 CounterKey 须在此补齐(spec 钉:achievementHint.spec) */
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

/** 成就条件对应的方向 */
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

/**
 * 未达成成就的引导语:「方向 + 这道门槛」。
 *
 * 原先进给方向(「境界精进」),同一组里六条未达成成就写成完全一样的字 ——
 * 「???」不现名目是防剧透,六条提示一字不差却让人无从分辨它们差在哪。
 * 条件本身带着门槛(`major` / `rank` / `value`),那是**要走到哪**而不是**叫什么名字**:
 * 说出来不剧透名目,却让人知道还差什么。
 *
 * 门槛名一律取数据层(REALMS / qualityDef),不在这里手抄。
 */
export function achievementGuide(cond: AchvCond): string {
  const dir = achievementDirection(cond)
  switch (cond.type) {
    case 'counter':
      // 计数类的门槛是「多少次」,写出来比只写方向有用
      return cond.value > 0 ? `${dir} · ${cond.value} 次` : dir
    case 'realm': {
      const realm = REALMS[cond.major]
      return realm ? `${dir} · ${realm.name}` : dir
    }
    case 'quality': {
      const q = QUALITIES.find(x => x.rank === cond.rank)
      return q ? `${dir} · ${q.name}` : dir
    }
    case 'custom':
      // custom 的 key 是历程节点标识,写出来会剧透;只留方向
      return dir
  }
}

/** 成就主题(分组展示用) */
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

/** 计数器 → 主题(与 COUNTER_DIRECTIONS 同键,归得更粗);导出供 spec 核验 CounterKey 全覆盖 */
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

/** 成就归属的主题,只依条件推出,不另抄「成就→主题」清单 */
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
