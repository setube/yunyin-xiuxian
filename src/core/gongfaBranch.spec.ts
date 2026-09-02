/**
 * Phase 31.0 A3:功法悟道分支 —— 满级后择一,改变成长方向
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivationStore } from '@/stores/cultivation'
import { branchesFor, canEnlighten, gongfaBranchDef, GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { GONGFA, gongfaDef } from '@/data/gongfa'
import { AFFIXES } from '@/data/affixes'
import { qualityDef } from '@/data/qualities'
import { STAT_NAMES } from '@/ui/statNames'
import type { AnyStatKey } from '@/types'
import { modOf } from './statsCalc'

describe('功法悟道分支(gongfaBranch)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('太玄引气诀满级前不可选分支', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    cul.upgrade('m_taixuan') // 2 层
    expect(cul.chooseBranch('m_taixuan', 'b_taixuan_sha')).toBe(false)
  })

  it('满级后可选分支,且分支词条并入功法属性', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    for (let i = 0; i < 9; i++) cul.upgrade('m_taixuan') // 1 + 9 = 10 层(>= maxLevel 9)
    const ok = cul.chooseBranch('m_taixuan', 'b_taixuan_sha')
    expect(ok).toBe(true)
    // 分支词条(attackPct +0.1, damageBonus +0.05)已并入
    expect(modOf(cul.gongfaMods, 'attackPct')).toBeCloseTo(0.1, 5)
    expect(modOf(cul.gongfaMods, 'damageBonus')).toBeCloseTo(0.05, 5)
  })

  it('分支一经选择不可更改', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    for (let i = 0; i < 8; i++) cul.upgrade('m_taixuan')
    cul.chooseBranch('m_taixuan', 'b_taixuan_sha')
    expect(cul.chooseBranch('m_taixuan', 'b_taixuan_shou')).toBe(false)
    expect(cul.gongfaBranch.m_taixuan).toBe('b_taixuan_sha')
  })

  it('分支表完整:每个分支可回查,分支属于正确功法', () => {
    for (const b of branchesFor('m_taixuan')) {
      expect(gongfaBranchDef(b.id)?.gongfaId).toBe('m_taixuan')
    }
    expect(branchesFor('m_taixuan').length).toBe(3)
  })
})

/**
 * 「可悟道」不得虚指。
 *
 * 曾经界面只判满级就挂出「可悟道」,而全书三十余部功法里只有三部写了分支——
 * 玩家练满其余任意一部,都会看到一个点开即空的提示,这正是「不知道什么意思、也没法悟道」的由来。
 * 判据自此收归 canEnlighten 一处,下面这几条守着它别再散开。
 */
describe('悟道提示与实际可选项同源', () => {
  it('全书功法尽数写有分支,练满哪一部都真能悟道', () => {
    // Phase 32.4 补全前只有三部写了分支,其余练满都是空头支票。
    // 这条守的是「全书无遗漏」,新增功法若忘了配分支,会在此处被拦下。
    for (const def of GONGFA) {
      expect(branchesFor(def.id).length, `${def.name} 没有悟道分支`).toBeGreaterThanOrEqual(2)
      expect(canEnlighten(def.id, def.maxLevel), `${def.name} 满级却不可悟道`).toBe(true)
    }
  })

  it('有分支的功法满级才可悟道,未满级不可', () => {
    const max = gongfaDef('m_taixuan')?.maxLevel ?? 9
    expect(canEnlighten('m_taixuan', max - 1)).toBe(false)
    expect(canEnlighten('m_taixuan', max)).toBe(true)
  })

  it('不存在的功法一律不可悟道', () => {
    expect(canEnlighten('m_not_a_real_gongfa', 99)).toBe(false)
  })

  it('凡可悟道者必给得出至少两条路 —— 只有一条不叫「择一」', () => {
    const withBranch = new Set(GONGFA_BRANCHES.map(b => b.gongfaId))
    expect(withBranch.size).toBeGreaterThan(0)
    for (const id of withBranch) {
      expect(gongfaDef(id), `分支表引用了不存在的功法 ${id}`).toBeDefined()
      expect(branchesFor(id).length, `${id} 只有一条分支`).toBeGreaterThanOrEqual(2)
    }
  })

  it('每条分支都实给词条 —— 选了等于没选是欺骗', () => {
    for (const b of GONGFA_BRANCHES) {
      const entries = Object.entries(b.mods)
      expect(entries.length, `${b.name} 无任何词条`).toBeGreaterThan(0)
      for (const [k, v] of entries) {
        expect(v, `${b.name} 的 ${k} 非正值`).toBeGreaterThan(0)
      }
    }
  })

  it('分支 id 全局唯一(回查不会串味)', () => {
    const ids = GONGFA_BRANCHES.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/**
 * Phase 32.4 分支平衡审计。
 *
 * 分支给多少不该拍脑袋,标尺取自游戏已有的词条经济:每个词条在 data/affixes.ts 里
 * 都有一档最低值(如 attackPct 最低档 2%),记作一个「词条单位」;
 * 一条分支的份量 = 各词条值 ÷ 各自单位,再相加。
 *
 * 标尺随词条池一起演化,不是另写一张会与数据脱节的权重表。
 * 它对发育向词条(修炼速度、灵气)的估值偏保守 —— 这类词条的真实价值随进度浮动,
 * 装备档位量不出来,所以下面的比值阈值留了余量,不追求小数点上的精确。
 */
describe('悟道分支平衡审计', () => {
  /** 各词条在装备池里的最低档(单位)与最高档(封顶),已换算为 StatMods 的小数口径 */
  const SCALE = (() => {
    const out = new Map<string, { unit: number; cap: number }>()
    for (const a of AFFIXES) {
      // 装备词条以百分数书写(2 表示 2%),分支词条以小数书写(0.02),故除以 100 对齐
      const min = a.min / 100
      const max = a.max / 100
      const cur = out.get(a.key)
      out.set(a.key, cur ? { unit: Math.min(cur.unit, min), cap: Math.max(cur.cap, max) } : { unit: min, cap: max })
    }
    return out
  })()

  /** 一条分支折算成多少个词条单位 */
  function weightOf(mods: Record<string, number | undefined>): number {
    let sum = 0
    for (const [k, v] of Object.entries(mods)) {
      const s = SCALE.get(k)
      if (s) sum += (v ?? 0) / s.unit
    }
    return sum
  }

  it('分支不越过装备的天花板 —— 悟道是一条路,不是一件神装', () => {
    for (const br of GONGFA_BRANCHES) {
      for (const [k, v] of Object.entries(br.mods)) {
        const s = SCALE.get(k)
        expect(s, `${br.name} 用了装备池里没有的词条 ${k},无从校准`).toBeDefined()
        expect(v ?? 0, `${br.name} 的 ${k}=${v} 超过装备同名词条上限 ${s!.cap}`).toBeLessThanOrEqual(s!.cap)
      }
    }
  })

  it('同一功法各分支份量相当 —— 「择一」得是真选择,不能有一条明显是陷阱', () => {
    for (const def of GONGFA) {
      const ws = branchesFor(def.id).map(b => weightOf(b.mods))
      if (ws.length < 2) continue
      const hi = Math.max(...ws)
      const lo = Math.min(...ws)
      expect(hi / lo, `${def.name} 的分支强弱悬殊(${lo.toFixed(2)} vs ${hi.toFixed(2)})`).toBeLessThanOrEqual(2)
    }
  })

  it('份量随品质递增 —— 高阶功法的悟道该更有分量', () => {
    const byRank = new Map<number, number[]>()
    for (const br of GONGFA_BRANCHES) {
      const def = gongfaDef(br.gongfaId)
      if (!def) continue
      const rank = qualityDef(def.quality).rank
      byRank.set(rank, [...(byRank.get(rank) ?? []), weightOf(br.mods)])
    }
    const ranks = [...byRank.keys()].sort((a, b) => a - b)
    expect(ranks.length).toBeGreaterThan(3)
    let prev = 0
    for (const r of ranks) {
      const ws = byRank.get(r)!
      const avg = ws.reduce((s, w) => s + w, 0) / ws.length
      expect(avg, `品质 rank ${r} 的分支均值 ${avg.toFixed(2)} 反低于前一档 ${prev.toFixed(2)}`).toBeGreaterThanOrEqual(prev)
      prev = avg
    }
  })

  it('每条分支的词条都显示得出中文名(界面不漏内部键名)', () => {
    for (const br of GONGFA_BRANCHES) {
      for (const k of Object.keys(br.mods)) {
        expect(STAT_NAMES[k as AnyStatKey], `${br.name} 的 ${k} 没有中文名,界面会漏出内部键名`).toBeTruthy()
      }
    }
  })
})
