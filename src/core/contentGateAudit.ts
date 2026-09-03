/**
 * 内容可达性审计
 *
 * 深修补偿审计已证明:A/B 两条可折算路线都走不通,深修回报的成立条件变成
 * **必须是金丹路线无法通过重复轮回获得,或至少无法以同等方式获得**。
 *
 * 本模块回答四件事,全部追代码而非看 UI:
 *   1. 逐类内容列出真实存在的境界门槛
 *   2. 金丹无限轮回能否最终把它们全部拿走
 *   3. 是否存在绕过路径(师承/奇遇/掉落/知识继承)
 *   4. 汇成「不可替代内容矩阵」——谁真有资格作深修独有回报
 *
 * 关键背景(取自 reincarnation.confirmReincarnation):
 * 认知层(lore:丹方掌握度、材料药性、器纹、敌手路数)与成就图鉴**完全跨世保留**,
 * 功法层数折半但已学门类保留。这意味着境界门槛只需**跨过一次**,
 * 此后无限轮回都留在账上——门槛是一次性的,不是每世重置的。
 */
import { PILLS } from '@/data/pills'
import { GONGFA } from '@/data/gongfa'
import { REGIONS } from '@/data/regions'
import { EVENTS } from '@/data/events'
import { PETS } from '@/data/pets'
import { MENTORS } from '@/data/mentors'
import { MAX_MAJOR } from '@/data/realms'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'

/** 门槛的三种性质——它们可能完全不同 */
export type GateKind =
  /** 最低获得境界:低于此境界拿不到 */
  | 'acquire'
  /** 最低使用境界:能拿到但用不了 */
  | 'use'
  /** 最低触发境界:内容存在但事件不会出现 */
  | 'trigger'
  /** 无门槛 */
  | 'none'

export interface ContentGate {
  id: string
  name: string
  /** 门槛性质 */
  kind: GateKind
  /** 最低境界(none 时为 0) */
  minMajor: number
  /** 代码依据 */
  evidence: string
  /** 金丹玩家无限轮回是否最终能全部拿到 */
  reachableByGoldRebirth: boolean
  /** 是否存在绕过门槛的路径 */
  bypass: string | null
  /** 能否作为深修独有回报 */
  qualifies: boolean
}

const GOLD = MANUAL_REBIRTH_MIN_MAJOR

/** 某类内容中,超出金丹可达范围的条目数 */
function beyondGold(items: readonly { minRealm?: number }[]): number {
  return items.filter(x => (x.minRealm ?? 0) > GOLD).length
}

/**
 * 逐类内容的门槛清单。
 * 每条都对照代码核实,不采信 UI 文案或设计文档
 */
export const CONTENT_GATES: ContentGate[] = [
  {
    id: 'pet',
    name: '灵兽',
    kind: 'none',
    minMajor: 0,
    evidence: 'PetDef 无境界字段;两个发放事件(ev_wounded_beast / ft_beast_pledge)均无 minRealm,标签 general/forest',
    reachableByGoldRebirth: true,
    bypass: '青云山麓即可触发,金丹前就能集齐',
    qualifies: false
  },
  {
    id: 'mentor',
    name: '师承',
    kind: 'none',
    minMajor: 0,
    evidence: 'adoptMentor 仅判断「是否已拜」,mentorChoices 无条件返回全部 MENTORS',
    reachableByGoldRebirth: true,
    bypass: '第一世即可拜师,且 rebirth() 未重置 mentor,跨世保留',
    qualifies: false
  },
  {
    id: 'recipe',
    name: '丹方',
    kind: 'acquire',
    minMajor: 7,
    evidence: `PILLS 中 ${PILLS.filter(p => p.recipe).length} 个有方子,minRealm 分布至大乘;studiableRecipes 按 p.minRealm <= major 过滤`,
    reachableByGoldRebirth: false,
    bypass: 'STUDY_REACH_OVER 允许预支一阶,但 minRealm 是硬过滤,不可绕',
    qualifies: true
  },
  {
    id: 'gongfa',
    name: '功法',
    kind: 'acquire',
    minMajor: 7,
    evidence: `GONGFA ${GONGFA.length} 门,minRealm 分布至大乘;gongfaService 用 minRealm <= major + 1,可预支一境`,
    reachableByGoldRebirth: false,
    bypass: '可预支一境(金丹能学元婴功法),故实际门槛比标称低一档',
    qualifies: true
  },
  {
    id: 'region',
    name: '区域与敌手认知',
    kind: 'acquire',
    minMajor: 8,
    evidence: `REGIONS ${REGIONS.length} 个,金丹可进 ${REGIONS.filter(r => r.minRealm <= GOLD).length} 个,其余 ${beyondGold(REGIONS)} 个有更高 minRealm`,
    reachableByGoldRebirth: false,
    bypass: '无。区域是硬门槛,且敌手认知只能靠实战积累',
    qualifies: true
  },
  {
    id: 'event',
    name: '奇遇事件',
    kind: 'trigger',
    minMajor: 3,
    evidence: `EVENTS ${EVENTS.length} 个中仅 ${EVENTS.filter(e => e.minRealm !== undefined).length} 个带 minRealm(心魔叩关/问道石)`,
    reachableByGoldRebirth: false,
    bypass: '绝大多数事件无门槛;仅问道石(元婴)真正需要深修',
    qualifies: false
  },
  {
    id: 'celestial',
    name: '天界与道痕',
    kind: 'acquire',
    minMajor: MAX_MAJOR,
    evidence: 'endgameUnlocked() 要求 major >= MAX_MAJOR(真仙),无任何替代入口',
    reachableByGoldRebirth: false,
    bypass: '无',
    qualifies: true
  }
]

export interface ReachabilityRow {
  gate: ContentGate
  /** 金丹可达的条目占比(仅对可计数的内容有效) */
  goldShare: number | null
  /** 深修专属的条目数 */
  deepOnly: number | null
}

/** 可计数内容的金丹可达比例 */
export function reachabilityTable(): ReachabilityRow[] {
  const counts: Record<string, { total: number; gold: number }> = {
    recipe: {
      total: PILLS.filter(p => p.recipe).length,
      gold: PILLS.filter(p => p.recipe && p.minRealm <= GOLD).length
    },
    // 功法可预支一境,故金丹实际能学到 minRealm <= GOLD+1
    gongfa: { total: GONGFA.length, gold: GONGFA.filter(g => g.minRealm <= GOLD + 1).length },
    region: { total: REGIONS.length, gold: REGIONS.filter(r => r.minRealm <= GOLD).length },
    pet: { total: PETS.length, gold: PETS.length },
    mentor: { total: MENTORS.length, gold: MENTORS.length },
    event: { total: EVENTS.length, gold: EVENTS.filter(e => (e.minRealm ?? 0) <= GOLD).length }
  }
  return CONTENT_GATES.map(gate => {
    const c = counts[gate.id]
    return {
      gate,
      goldShare: c ? c.gold / c.total : null,
      deepOnly: c ? c.total - c.gold : null
    }
  })
}

/** 有资格作深修独有回报的内容 */
export function qualifiedRewards(): ContentGate[] {
  return CONTENT_GATES.filter(g => g.qualifies)
}

/** 被证伪的候选——看着像深修专属,实际金丹就能拿全 */
export function disqualified(): ContentGate[] {
  return CONTENT_GATES.filter(g => !g.qualifies)
}
