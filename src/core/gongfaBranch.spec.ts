/** 功法悟道分支:满级后择一 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivationStore } from '@/stores/cultivation'
import { branchEffective, branchesFor, canEnlighten, gongfaBranchDef, GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { carryGongfa } from './reincarnation'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GONGFA, gongfaDef, gongfaMaxLevel } from '@/data/gongfa'
import { AFFIXES } from '@/data/affixes'
import { qualityDef } from '@/data/qualities'
import { STAT_NAMES } from '@/data/statNames'
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

/** 「可悟道」不得虚指(满级却无分支可选);判据只在 canEnlighten 一处 */
describe('悟道提示与实际可选项同源', () => {
  it('全书功法尽数写有分支,练满哪一部都真能悟道', () => {
    // 新增功法忘配分支,此处红
    for (const def of GONGFA) {
      expect(branchesFor(def.id).length, `${def.name} 没有悟道分支`).toBeGreaterThanOrEqual(2)
      expect(canEnlighten(def.id, def.maxLevel), `${def.name} 满级却不可悟道`).toBe(true)
    }
  })

  it('有分支的功法满级才可悟道,未满级不可', () => {
    const max = gongfaMaxLevel(gongfaDef('m_taixuan'))
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
 * 分支平衡审计。标尺取自 data/affixes.ts:各词条最低档记作一个「词条单位」(如 attackPct 2%),
 * 分支份量 = Σ 词条值 ÷ 各自单位。发育向词条(修炼速度、灵气)估值偏保守,比值阈值留了余量。
 */
describe('悟道分支平衡审计', () => {
  /** 各词条在装备池里的最低档(单位)与最高档(封顶),已换算为 StatMods 的小数口径 */
  const SCALE = (() => {
    const out = new Map<string, { unit: number; cap: number }>()
    for (const a of AFFIXES) {
      // 装备词条为百分数(2 即 2%),分支词条为小数(0.02)
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

  it('悟道分支风味对上已经改名的机制', () => {
    for (const br of GONGFA_BRANCHES) {
      expect(br.desc, br.id).not.toMatch(/出手愈快|出手更疾/)
      expect(br.desc, br.id).not.toMatch(/关隘自消|天数可移/)
      if (br.mods.eventLuck) expect(br.desc, br.id).not.toContain('机缘自来')
      if (!br.mods.tribulationResist) expect(br.name, br.id).not.toBe('应劫')
      if (br.mods.explorationSpeed) expect(br.desc, br.id).not.toContain('福地自现')
    }
  })
})

/**
 * 「转世不失」的分支,转世后其实不生效。
 *
 * 两处条件不一致:
 * - `sanitize` 里保留分支只要求「已习得、层数 ≥ 1」(注释:`不要求满级`)
 * - `gongfaMods` 里并进词条却要求 `lv >= gongfaMaxLevel`(9 层)
 *
 * 而转世只留一门功法的等级、其余落回 1 层(`carryGongfa`)。于是那条分支
 * 会留在界面上 —— 界面上还写着「不可更改 · 转世不失」—— 却一点属性都不加。
 *
 * 这份判据钉住两件事:分支词条确实要求满级;UI 侧对未满级的分支要给出提示
 * (由 `GongfaSection` 的 `branchActive` 负责,下面是源码守卫)。
 */
describe('悟道分支 · 转世后未满级则不生效', () => {
  /**
   * 这条原先在用例里**自己**按「非最高落 1 层」造了一遍结果,再断言自己造的 `after` ——
   * carryGongfa 改成保留全部等级也照样绿,等于没测。现在走真实转世路径。
   */
  it('转世只保留一门功法的等级,其余落到 1 层', () => {
    const learned = { m_taixuan: 9, m_qingmu: 5, m_lihuo: 3 }
    // keepOne:只有修为最深的那门按原等级带走,其余门类留下但落回 1 层
    expect(carryGongfa(learned, true), '只留最高那门').toEqual({ m_taixuan: 9, m_qingmu: 1, m_lihuo: 1 })
    // keepOne=false:全部落回 1 层
    expect(carryGongfa(learned, false), '不保留时全部落回 1 层').toEqual({
      m_taixuan: 1,
      m_qingmu: 1,
      m_lihuo: 1
    })
    // 大乘道统:全部按原等级带走
    expect(carryGongfa(learned, false, true), '持传承者全部带走').toEqual(learned)
  })

  it('每条分支的宿主功法都存在,且满级线不是 1(否则转世也算满级)', () => {
    for (const b of GONGFA_BRANCHES) {
      const def = gongfaDef(b.gongfaId)
      expect(def, `分支 ${b.name} 的宿主功法 ${b.gongfaId} 不存在`).toBeTruthy()
      // 满级线因功法而异(秘典只有 3 层、主流 9 层),只要 > 1 就有「转世后不满级」的情形
      expect(gongfaMaxLevel(def!), `${b.name} 的宿主满级线异常`).toBeGreaterThan(1)
    }
  })

  it('满级线不止一种 —— 说明不能把它当成常量来判', () => {
    const levels = new Set(GONGFA_BRANCHES.map(b => gongfaMaxLevel(gongfaDef(b.gongfaId)!)))
    expect(levels.size, '所有分支的满级线都一样,那这条判据可以简化').toBeGreaterThan(1)
  })

  /**
   * 原先只查源码里有没有 `branchActive` / `gongfaMaxLevel(` / `未满级` 这几个字面量 ——
   * 把满级比较由 `>=` 改成 `>` 也照样绿,而刚好满级的分支会被显示成不生效。
   * 现在直接调 `branchEffective` 做行为断言,界面与 store 都读它。
   */
  it('分支生效判据:满级 + 装配缺一不可,边界不含糊', () => {
    const max = gongfaMaxLevel(gongfaDef('m_taixuan')!)
    const base = { hasBranch: true, isMain: true, isEffectiveSub: false }
    expect(branchEffective('m_taixuan', { ...base, level: max }), '刚好满级 + 主修,应生效').toBe(true)
    expect(branchEffective('m_taixuan', { ...base, level: max - 1 }), '差一层就不该生效').toBe(false)
    expect(
      branchEffective('m_taixuan', { level: max, hasBranch: true, isMain: false, isEffectiveSub: true }),
      '满级 + 有效辅修席,应生效'
    ).toBe(true)
    expect(
      branchEffective('m_taixuan', { level: max, hasBranch: true, isMain: false, isEffectiveSub: false }),
      '满级但两个装配席都让出去了,不该生效'
    ).toBe(false)
    expect(
      branchEffective('m_taixuan', { level: max, hasBranch: false, isMain: true, isEffectiveSub: false }),
      '没择分支就谈不上生效'
    ).toBe(false)
    expect(branchEffective('m_not_a_gongfa', { ...base, level: 9 }), '认不出的功法不该生效').toBe(false)
  })

  it('界面与 store 读的是同一条生效判据,不是各写一遍', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/cultivation/GongfaSection.vue'), 'utf-8')
    expect(src, 'GongfaSection 应读 branchEffective').toMatch(/branchEffective\(/)
    // 只看 branchActive 自己的函数体:别的地方(满级线文案、canEnlighten)用 gongfaMaxLevel 是正当的
    const body = src.slice(src.indexOf('function branchActive'), src.indexOf('function branchInactiveReason'))
    expect(body.length, 'branchActive 没找到,守卫空转').toBeGreaterThan(0)
    expect(body, 'branchActive 自己又判了一次满级线 —— 会和 store 的 gongfaMods 分叉').not.toMatch(
      /gongfaMaxLevel\(/
    )
  })
})
