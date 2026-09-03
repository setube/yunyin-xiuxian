/**
 * 诸界总览「出发」的必要性审计
 *
 * 路线自带解锁之后,历练页上存在两条出发路径:
 *
 *   本世路线 → 出发     准入看 canEnterNode(route index)
 *   诸界总览 → 出发     准入看 adventure.unlocked(旧解锁链)
 *
 * 只回答一个问题:**在已有本世路线的前提下,总览出发是否仍提供
 * 不可替代的功能?**
 *
 * 三种情形分别看:
 *   A 路线未开放该区域   总览是否有合理用途(退路?还是绕过?)
 *   B 路线已覆盖该区域   总览是否只是重复入口
 *   C 路线不含该区域     玩家是否真的需要回去
 *
 * 判据不靠感觉:比较两条路径在**同一个区域**上能拿到什么。
 * 若总览拿到的一切路线都能给,且不含路线给不了的东西,它就是重复入口。
 */
import { REGIONS } from '@/data/regions'
import type { MortalWorld } from './mortalWorldGen'

/** 玩家想去某个区域时,面对的三种情形 */
export type AccessCase =
  /** A 在本世路线里,但前一段未通 */
  | 'routeLocked'
  /** B 在本世路线里,且已开放 */
  | 'routeOpen'
  /** C 不在本世路线里 */
  | 'offRoute'

export interface CaseFacts {
  case: AccessCase
  /** 本世路线能否进入 */
  viaRoute: boolean
  /** 总览能否进入(旧解锁链) */
  viaOverview: boolean
  /** 总览是否提供了路线给不了的东西 */
  overviewAdds: boolean
  note: string
}

/**
 * 逐情形的事实表。
 *
 * 关键在最后一列:只有 `overviewAdds` 为真,总览出发才不可替代
 */
export function caseFacts(): CaseFacts[] {
  return [
    {
      case: 'routeLocked',
      viaRoute: false,
      viaOverview: true,
      overviewAdds: true,
      note: '总览能绕过本世路线的推进顺序 —— 这不是退路,是绕过。老存档解锁越多,绕得越远'
    },
    {
      case: 'routeOpen',
      viaRoute: true,
      viaOverview: true,
      overviewAdds: false,
      note: '两条路径进同一个区域、打同一批敌人、拿同一份奖励,纯重复入口'
    },
    {
      case: 'offRoute',
      viaRoute: false,
      viaOverview: true,
      overviewAdds: true,
      note: '路线之外的区域只有总览能去 —— 但「这一世走不到那里」本就是世界的一部分'
    }
  ]
}

// ============ 两条路径的实际差异 ============

/** 一条出发路径能提供的东西 */
export interface PathCapability {
  path: string
  /** 能进入的区域数(以某世为例) */
  reach: number
  /** 战斗数据来源 */
  combatSource: string
  /** 准入依据 */
  gate: string
  /** 是否受本世路线约束 */
  respectsRoute: boolean
}

export function capabilities(w: MortalWorld, unlockedCount: number): PathCapability[] {
  return [
    {
      path: '本世路线',
      reach: w.chain.length,
      combatSource: 'REGIONS[fromId]',
      gate: 'route index(前一段已通)',
      respectsRoute: true
    },
    {
      path: '诸界总览',
      reach: unlockedCount,
      combatSource: 'REGIONS[id]',
      gate: 'adventure.unlocked(旧链)',
      respectsRoute: false
    }
  ]
}

/**
 * 两条路径的战斗数据是否同源。
 *
 * 这是判定「重复入口」的核心:若同源,总览出发给不了任何
 * 路线给不了的**内容**,差别只在准入条件
 */
export function sameCombatSource(caps: PathCapability[]): boolean {
  return new Set(caps.map(c => c.combatSource.replace(/\[.*\]/, ''))).size === 1
}

// ============ 总览的只读价值 ============

/** 总览除出发之外还承载什么 */
export interface OverviewRole {
  id: string
  name: string
  /** 需要「出发」按钮才能实现吗 */
  needsDepart: boolean
  evidence: string
}

export const OVERVIEW_ROLES: OverviewRole[] = [
  {
    id: 'catalog',
    name: '世界知识索引',
    needsDepart: false,
    evidence: '二十处地界的名字、层级、险恶度、前置关系 —— 纯查阅'
  },
  {
    id: 'history',
    name: '历世足迹',
    needsDepart: false,
    evidence: 'adventure.cleared 记录哪些地方通过了首领,是跨世的历史'
  },
  {
    id: 'suppress',
    name: '区域镇压状态',
    needsDepart: false,
    evidence: 'player.suppressedRegions 与复苏计时,只需展示'
  },
  {
    id: 'escape',
    name: '脱困退路',
    needsDepart: true,
    evidence: '若本世路线首段过不去,玩家是否需要别处可打 —— 见下方可行性分析'
  }
]

/** 需要「出发」才能实现的职责 */
export function rolesNeedingDepart(): OverviewRole[] {
  return OVERVIEW_ROLES.filter(r => r.needsDepart)
}

/**
 * 「脱困退路」这一条是否成立。
 *
 * 前提:本世路线首段天然可进入(canEnterNode 的 i===0 分支)。
 * 故不存在「路线一段都进不去」的状态 —— 退路的前提不成立。
 *
 * 唯一残留的情形是首段太难打不过。但那是难度问题,
 * 用旧区域刷等级等于绕过世界,与「本世路线决定本世可玩什么」冲突
 */
export function escapeRouteNeeded(w: MortalWorld): boolean {
  // 首段永远可进入,故不需要退路
  return w.chain.length === 0
}

/** 建议的处置 */
export type Disposition = 'keep' | 'demote' | 'remove'

export interface Recommendation {
  disposition: Disposition
  reason: string
  /** 保留下来的总览承担什么 */
  keptRoles: string[]
}

/**
 * 结论由事实推出,不预设。
 *
 * 若总览出发的全部「不可替代」情形都是「绕过路线」,
 * 而它承载的其余职责都不需要出发按钮,则应降级为只读
 */
export function recommend(w: MortalWorld): Recommendation {
  const adds = caseFacts().filter(c => c.overviewAdds)
  const bypassOnly = adds.every(c => c.case !== 'routeOpen')
  const needsDepart = rolesNeedingDepart().filter(() => escapeRouteNeeded(w))
  if (needsDepart.length > 0) {
    return { disposition: 'keep', reason: '存在路线进不去的状态,退路必要', keptRoles: OVERVIEW_ROLES.map(r => r.name) }
  }
  return {
    disposition: bypassOnly ? 'demote' : 'keep',
    reason: bypassOnly
      ? '总览出发的全部增量都是「绕过本世路线」;其余职责(索引/历史/镇压)均为只读'
      : '总览出发提供了路线之外的实际内容',
    keptRoles: OVERVIEW_ROLES.filter(r => !r.needsDepart).map(r => r.name)
  }
}

export { REGIONS }
