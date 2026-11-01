/* eslint-disable no-console -- 品阶阶梯表给人复核 */
/**
 * 法宝品阶阶梯:同一效果族内按 (fromTier, 品阶) 排序后,玩家看到的数值与被动预算都不许回落。
 * 承诺见 data/artifacts 头部。
 */
import { describe, expect, it } from 'vitest'
import { ARTIFACTS, artifactQualityMult, artifactValue } from '@/data/artifacts'
import { qualityDef } from '@/data/qualities'
import { budgetOfMods } from './ruleBudget'
import type { ArtifactDef } from '@/types'

/** 被动预算容差,比取整粒度 0.1 宽得多:被动按身份设计,族内横比不是同一量纲,只拦半档以上的回落 */
const BUDGET_EPS = 0.5
/** 数值舍入容差:品阶倍率最后一位的舍入 */
const AMOUNT_EPS = 0.002

interface Row {
  def: ArtifactDef
  amount: number
  budget: number
  qualityRank: number
}

/** 同一效果族的阶梯(按 fromTier → 品阶排序) */
function ladders(): Map<string, Row[]> {
  const byType = new Map<string, ArtifactDef[]>()
  for (const def of ARTIFACTS) {
    const type = def.active.effect.type
    byType.set(type, [...(byType.get(type) ?? []), def])
  }
  const out = new Map<string, Row[]>()
  for (const [type, defs] of byType) {
    const rows = defs
      .map(def => {
        const v = artifactValue(def, 0)
        return { def, amount: v.active.amount, budget: budgetOfMods(v.passive), qualityRank: qualityDef(def.quality).rank }
      })
      .sort((a, b) => a.def.fromTier - b.def.fromTier || a.qualityRank - b.qualityRank)
    out.set(type, rows)
  }
  return out
}

describe('法宝品阶阶梯', () => {
  it('打印各族阶梯(数值口径:凡品零重 × 品阶) ', () => {
    console.log('\n—— 法宝阶梯(效果数值 / 被动预算;按层级→品阶排序) ——')
    for (const [type, rows] of ladders()) {
      console.log(`  ${type}:`)
      for (const r of rows) {
        console.log(
          `    t${String(r.def.fromTier).padStart(2)} ${qualityDef(r.def.quality).name} ` +
            `${r.def.name.padEnd(6)} 数值 ${r.amount.toFixed(3).padStart(6)} · 被动预算 ${r.budget.toFixed(1)}`
        )
      }
    }
    expect(ARTIFACTS.length).toBeGreaterThan(40)
  })

  it('同一效果族内,效果数值不随层级/品阶回落', () => {
    for (const [type, rows] of ladders()) {
      // 震慑没有数值,只守被动预算那条
      if (type === 'stun') continue
      for (let i = 1; i < rows.length; i += 1) {
        const prev = rows[i - 1]!
        const cur = rows[i]!
        expect(
          cur.amount,
          `${cur.def.name}(t${cur.def.fromTier} ${qualityDef(cur.def.quality).name}) 的数值 ${cur.amount.toFixed(3)} ` +
            `低于更浅/更低的 ${prev.def.name}(t${prev.def.fromTier} ${qualityDef(prev.def.quality).name}) ${prev.amount.toFixed(3)}`
        ).toBeGreaterThanOrEqual(prev.amount - AMOUNT_EPS)
      }
    }
  })

  it('同一效果族内,被动预算不随层级/品阶回落', () => {
    for (const rows of ladders().values()) {
      for (let i = 1; i < rows.length; i += 1) {
        const prev = rows[i - 1]!
        const cur = rows[i]!
        expect(
          cur.budget,
          `${cur.def.name}(t${cur.def.fromTier} ${qualityDef(cur.def.quality).name}) 的被动预算 ${cur.budget.toFixed(1)} ` +
            `低于更浅/更低的 ${prev.def.name}(t${prev.def.fromTier} ${qualityDef(prev.def.quality).name}) ${prev.budget.toFixed(1)}`
        ).toBeGreaterThanOrEqual(prev.budget - BUDGET_EPS)
      }
    }
  })

  /**
   * 阶梯「不回落」是不够的:t19 之后九件伤害法宝曾是 6.325 → 6.485(13 个层级只涨 2.5%),
   * 玩家拿到 t31 天品与 t23 灵品的感受没有区别 —— 这正是「神品名不副实」的来源。
   *
   * 根因是基线在高阶被写低、靠品阶倍率补偿,两者相抵后净增长归零。
   * 本条钉住「最深那件至少是最浅那件的 N 倍」,而不是只钉单调。
   *
   * 阈值取各族当前实测的保守下沿:调数值时若把高阶又压回去,这里先红。
   */
  const FLOOR: Record<string, number> = {
    damage: 3.5,
    heal: 4,
    shield: 2.2,
    weaken: 2,
    drain: 1.6
  }

  it('越深越高阶的那件,显著强于最浅那件 —— 品阶要能被感知,不能只保证不回落', () => {
    for (const [type, rows] of ladders()) {
      const floor = FLOOR[type]
      if (floor === undefined) continue
      const first = rows[0]!
      const last = rows[rows.length - 1]!
      const ratio = last.amount / first.amount
      expect(
        ratio,
        `${type} 族:最深的 ${last.def.name}(t${last.def.fromTier} ${qualityDef(last.def.quality).name}) ` +
          `只有最浅的 ${first.def.name}(t${first.def.fromTier}) 的 ${ratio.toFixed(2)} 倍,低于 ${floor} 倍 —— 高阶不划算`
      ).toBeGreaterThanOrEqual(floor)
    }
  })

  /**
   * 比的是**封顶前**的原始值。
   *
   * 护盾封在总盾上限 50%、削弱/破甲封在 50%、净念封在 90% —— 顶到上限的几件
   * 读出来的数当然一样,那是规则替它们做的收束,不是数据没写开。
   * 身份要看作者手里的那个数:原始值全同才是「深的那件等于白出」。
   */
  it('同一族内没有两件原始值相同 —— 数值全同即是身份全同', () => {
    const raw = (def: ArtifactDef): number => {
      const eff = def.active.effect
      if (eff.type === 'damage' || eff.type === 'drain') return eff.mult * artifactQualityMult(def.quality)
      if (eff.type === 'heal' || eff.type === 'shield') return eff.pctMaxHp * artifactQualityMult(def.quality)
      if (eff.type === 'weaken' || eff.type === 'sunder' || eff.type === 'purge') return eff.pct * artifactQualityMult(def.quality)
      return Number.NaN
    }
    const dupes: string[] = []
    for (const [type, rows] of ladders()) {
      if (type === 'stun') continue
      const seen = new Map<string, string[]>()
      for (const r of rows) {
        const v = raw(r.def)
        if (!Number.isFinite(v)) continue
        const key = v.toFixed(4)
        seen.set(key, [...(seen.get(key) ?? []), `${r.def.name}(t${r.def.fromTier})`])
      }
      for (const [v, names] of seen) {
        if (names.length > 1) dupes.push(`${type} ${v}: ${names.join(' / ')}`)
      }
    }
    expect(dupes, `同族内原始值完全相同的法宝(深的那件等于白出):\n${dupes.join('\n')}`).toEqual([])
  })

  /**
   * 同一族内不许有两个同名神通 —— 数值差一点不算区分。
   *
   * 240 轮实测:混沌开天斧与鸿蒙尺(仅有的两件天品)都叫「开天」、都是 damage、
   * 只差 410% / 430%。上一版守卫查的是「原始值完全相同」,这种「同形不同数」正好落在盲区。
   * 玩家看到的是两个一模一样的名字,那正是「各个法宝之间区分度不够」。
   *
   * 修法是让顶阶两件各领一族:开天斧守 damage,鸿蒙尺改削弱族(量天)。
   * 故障注入:把鸿蒙尺改回 damage + 「开天」,本条红。
   */
  it('同一效果族内没有同名神通', () => {
    const byType = new Map<string, Map<string, string[]>>()
    for (const def of ARTIFACTS) {
      const type = def.active.effect.type
      const name = def.active.name
      const inner = byType.get(type) ?? new Map<string, string[]>()
      inner.set(name, [...(inner.get(name) ?? []), `${def.name}(t${def.fromTier})`])
      byType.set(type, inner)
    }
    const dupes: string[] = []
    for (const [type, names] of byType) {
      for (const [name, owners] of names) {
        if (owners.length > 1) dupes.push(`${type} 族的「${name}」: ${owners.join(' / ')}`)
      }
    }
    expect(dupes, `同族内同名神通(玩家看到的是两个一模一样的名字):\n${dupes.join('\n')}`).toEqual([])
  })

  /** 上限 5,与 `ruleUniverse.spec` 的单件预算上限同源 */
  it('抬完阶梯仍在单件预算上限之内', () => {
    for (const def of ARTIFACTS) {
      const b = budgetOfMods(artifactValue(def, 0).passive)
      expect(b, `${def.name} 被动预算 ${b}`).toBeLessThan(5)
    }
  })
})
