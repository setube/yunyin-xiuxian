/** 战力五维评级审计:星级须随词条形状分化。 */
import { describe, expect, it } from 'vitest'
import { ratePower, ratingStars } from './powerRating'
import { starsText } from './buildAdvisor'
import { ratingGauges } from '@/ui/ratingGauge'
import { STAT_NAMES } from '@/data/statNames'
import type { FinalStats, StatMods } from '@/types'

const statsWith = (mods: StatMods): FinalStats => ({ mods }) as FinalStats

describe('战力五维评级', () => {
  it('五个维度齐全、星级落在 1~5', () => {
    const r = ratePower(statsWith({}))
    expect(r.labels.map(l => l.name)).toEqual(['进攻', '生存', '身法', '恢复', '机制'])
    for (const l of r.labels) {
      expect(l.stars, `${l.name} 星级越界`).toBeGreaterThanOrEqual(1)
      expect(l.stars, `${l.name} 星级越界`).toBeLessThanOrEqual(5)
    }
  })

  it('星级随构筑形状分化:进攻堆叠抬高进攻星,守御堆叠抬高生存星', () => {
    const atk = ratePower(statsWith({ attackPct: 0.35, damageBonus: 0.2, critRate: 0.25, critDamage: 0.6, armorPen: 0.2 }))
    const def = ratePower(statsWith({ defensePct: 0.35, maxHpPct: 0.3, damageReduction: 0.25, shieldOnStart: 0.25, dodgeRate: 0.2 }))
    expect(atk.attack).toBeGreaterThan(def.attack)
    expect(def.survival).toBeGreaterThan(atk.survival)
  })

  it('恢复与身法各有各的轴,不互相冒充', () => {
    const heal = ratePower(statsWith({ lifesteal: 0.15, regenPerRound: 0.06, lowHpReduction: 0.3 }))
    const swift = ratePower(statsWith({ speed: 0.3, firstStrike: 0.3, comboRate: 0.2 }))
    expect(heal.recovery).toBeGreaterThan(swift.recovery)
    expect(swift.speed).toBeGreaterThan(heal.speed)
  })

  it('空构筑是低星而非零值;★ 串长度恒为 5', () => {
    const bare = ratePower(statsWith({}))
    expect(bare.attack).toBe(1)
    expect(bare.mechanics).toBe(1)
    for (const n of [-3, 0, 1, 3, 5, 9]) {
      const s = ratingStars(n)
      expect(s.length, `ratingStars(${n}) 长度`).toBe(5)
      expect(s).toMatch(/^[★]+[☆]*$/)
    }
    expect(ratingStars(0)).toBe('★☆☆☆☆')
    expect(ratingStars(9)).toBe('★★★★★')
  })
})

/**
 * 五维评级的来路:明细之和须等于得分。
 * 故障注入:从任一维删掉一条 term(如进攻少算破甲),本文件红。
 */
describe('五维评级的来路', () => {
  const SAMPLE: StatMods[] = [
    {},
    { attackPct: 0.35, damageBonus: 0.2, critRate: 0.25, critDamage: 0.6, armorPen: 0.2, executeDamage: 0.15 },
    { defensePct: 0.3, maxHpPct: 0.25, damageReduction: 0.2, shieldOnStart: 0.3, shieldPower: 0.2, dodgeRate: 0.15 },
    {
      lifesteal: 0.12,
      regenPerRound: 0.05,
      overhealShield: 0.4,
      lowHpReduction: 0.3,
      speed: 0.2,
      comboRate: 0.15,
      lowHpDamage: 0.4,
      fullHpDamage: 0.3,
      comboDamage: 0.35,
      counterRate: 0.2,
      counterDamage: 0.4
    }
  ]

  it('每一维:贡献之和 = 得分', () => {
    for (const mods of SAMPLE) {
      const r = ratePower(statsWith(mods))
      for (const dim of r.labels) {
        const sum = dim.terms.reduce((s, t) => s + t.contribution, 0)
        expect(sum, `${dim.name} 的明细之和 ${sum} 与得分 ${dim.score} 不符`).toBeCloseTo(dim.score, 10)
      }
    }
  })

  it('明细里不许有白板条目,每一条都得有名字与来路', () => {
    for (const mods of SAMPLE) {
      const r = ratePower(statsWith(mods))
      for (const dim of r.labels) {
        for (const t of dim.terms) {
          expect(t.label.length, `${dim.name} 里有一条没有名字的贡献`).toBeGreaterThan(0)
          expect(t.contribution, `${dim.name}·${t.label} 是 0 却仍列着`).not.toBe(0)
        }
      }
    }
  })

  it('星级就是得分跨过阈值的结果 —— 面板给的分档与实际判定同源', () => {
    for (const mods of SAMPLE) {
      const r = ratePower(statsWith(mods))
      for (const dim of r.labels) {
        const expected = 1 + r.thresholds[dim.key].filter(t => dim.score >= t).length
        expect(dim.stars, `${dim.name} 的星级与分档不符(得分 ${dim.score.toFixed(2)})`).toBe(expected)
      }
    }
  })

  it('机制维点名是哪一路 —— 成路与副系各算各的', () => {
    const r = ratePower(statsWith({ lowHpDamage: 0.6, lowHpReduction: 0.35, executeDamage: 0.4, lifesteal: 0.16 }))
    const mech = r.labels.find(l => l.key === 'mechanics')!
    expect(mech.terms.length, '成路之后机制维却没有任何来路').toBeGreaterThan(0)
    expect(mech.terms[0]!.label.startsWith('成路·'), `机制维第一条应是成路,实际 ${mech.terms[0]!.label}`).toBe(true)
  })

  it('词条名与 STAT_NAMES 同源,不另叫闪避率或连击率', () => {
    const r = ratePower(
      statsWith({
        dodgeRate: 0.1,
        comboRate: 0.1,
        shieldPower: 0.15,
        overhealShield: 0.4,
        lowHpReduction: 0.2,
        maxHpPct: 0.1,
        damageBonus: 0.1
      })
    )
    const labels = r.labels.flatMap(l => l.terms.map(t => t.label))
    expect(labels).toContain(STAT_NAMES.dodgeRate)
    expect(labels).toContain(STAT_NAMES.comboRate)
    expect(labels).toContain(STAT_NAMES.shieldPower)
    expect(labels).toContain(STAT_NAMES.overhealShield)
    expect(labels).toContain(STAT_NAMES.lowHpReduction)
    expect(labels).toContain(STAT_NAMES.maxHpPct)
    expect(labels).toContain(STAT_NAMES.damageBonus)
    expect(labels).not.toContain('闪避率')
    expect(labels).not.toContain('连击率')
    expect(labels).not.toContain('护盾强度')
    expect(labels).not.toContain('溢疗转盾')
  })

  it('背水锋芒反震连击的核心词条会抬进攻或身法,不成路却零星', () => {
    const scoreOf = (r: ReturnType<typeof ratePower>, key: 'attack' | 'speed'): number =>
      r.labels.find(l => l.key === key)!.score
    const bare = ratePower(statsWith({}))
    const beishui = ratePower(statsWith({ lowHpDamage: 0.6 }))
    const fengmang = ratePower(statsWith({ fullHpDamage: 0.5 }))
    const fanzhen = ratePower(statsWith({ counterRate: 0.3, counterDamage: 0.5 }))
    const lianji = ratePower(statsWith({ comboRate: 0.3, comboDamage: 0.4 }))
    expect(scoreOf(beishui, 'attack')).toBeGreaterThan(scoreOf(bare, 'attack'))
    expect(scoreOf(fengmang, 'attack')).toBeGreaterThan(scoreOf(bare, 'attack'))
    expect(scoreOf(fanzhen, 'attack')).toBeGreaterThan(scoreOf(bare, 'attack'))
    expect(scoreOf(fanzhen, 'speed')).toBeGreaterThan(scoreOf(bare, 'speed'))
    expect(scoreOf(lianji, 'attack')).toBeGreaterThan(scoreOf(bare, 'attack'))
    expect(scoreOf(lianji, 'speed')).toBeGreaterThan(scoreOf(bare, 'speed'))
  })

/**
 * 小数入参。
 *
 * 原实现只钳不取整:`'☆'.repeat(5 - 2.4)` 会按 repeat(2.6) 截断为 2,
 * 产出 ★★☆☆ 四个字符 —— tabular 列里五星文案长度不固定就会错位。
 * 生产路径的 toStars 恒返回整数,故这条是健壮性补丁的守卫。
 */
describe('五星文案 · 小数与跨模块一致', () => {
  it('小数入参也恒为五个字符', () => {
    for (const n of [1.4, 2.4, 2.5, 2.6, 3.5, 4.9]) {
      const s = ratingStars(n)
      expect(s.length, `ratingStars(${n}) 长度`).toBe(5)
      expect(s).toMatch(/^[★]+[☆]*$/)
    }
  })

  it('小数按四舍五入定星,与钳制取法一致', () => {
    expect(ratingStars(2.4)).toBe('★★☆☆☆')
    expect(ratingStars(2.5)).toBe('★★★☆☆')
    expect(ratingStars(2.6)).toBe('★★★☆☆')
    expect(ratingStars(3.5)).toBe('★★★★☆')
  })

  it('与 buildAdvisor.starsText 结果完全一致(同一套五星口径,不许两个模块各写一套)', () => {
    for (const n of [-3, 0, 1, 1.4, 2.5, 3, 5, 9, 2.5, 4.9]) {
      expect(ratingStars(n), `入参 ${n} 时两个模块给出的星串不同`).toBe(starsText(n))
    }
  })
})
})

/**
 * 坏值不许穿到五维得分上。
 *
 * `v()` 原先写的是 `Math.max(0, modOf(m, k))` —— 而 `Math.max` **挡不住 NaN**,
 * 它原样穿过(AGENTS.md 反复点过的那条)。`mods` 是各大来源合并出来的公共汇合点,
 * 任一处混进坏值,NaN 就会一路进 score:界面 `score.toFixed(2)` 印出「NaN」。
 *
 * 实测(修复前):把 `mods.attackPct` 写成 NaN,
 *   `ratePower` 的 attack.score = **NaN**
 *   同一份数据经 `ratingGauges` 的 gauge.score = **0**
 * 面板上同一个数字两种说法 —— 而 `ratingGauge` 那边其实已经用 `Number.isFinite`
 * 兜过一道,只有 `ratePower` 漏了。
 *
 * 正常路径造不出 NaN(各 modSource 都由数据表派生,装备词条的 roll 过
 * `asFiniteNumber(a.roll, 0, 0, 1)`),故这是第二道防线,不是可达分支;
 * 但它便宜,而且让两个算出同一件事的地方口径一致。
 */
describe('五维评级 · 坏值不许穿到得分', () => {
  it('mods 里某一项是 NaN 时,该维得分是有限数', () => {
    const r = ratePower(statsWith({ attackPct: NaN } as StatMods))
    const atk = r.labels.find(l => l.key === 'attack')!
    expect(Number.isFinite(atk.score), 'NaN 穿过来了 —— 界面会印「NaN」').toBe(true)
    expect(atk.score.toFixed(2), 'toFixed 不该印出 NaN').not.toContain('NaN')
  })

  it('所有维度的得分与明细贡献都是有限数', () => {
    const bad = { attackPct: NaN, defensePct: NaN, speed: NaN, lifesteal: NaN } as StatMods
    const r = ratePower(statsWith(bad))
    for (const l of r.labels) {
      expect(Number.isFinite(l.score), `${l.name} 得分不是有限数`).toBe(true)
      for (const t of l.terms) {
        expect(Number.isFinite(t.raw), `${l.name}/${t.label} 的 raw 不是有限数`).toBe(true)
        expect(Number.isFinite(t.contribution), `${l.name}/${t.label} 的贡献不是有限数`).toBe(true)
      }
    }
  })

  it('与 ratingGauge 口径一致:同一份数据,两边说的得分相同', () => {
    /*
     * 这是本条的真正价值:两个模块各算一遍同一件事(`ratingGauge` 早就用
     * `Number.isFinite` 兜过,`ratePower` 没有),分叉时光看各自的判据都发现不了。
     */
    const r = ratePower(statsWith({ attackPct: NaN } as StatMods))
    const gauge = ratingGauges(r).find(g => g.key === 'attack')!
    const label = r.labels.find(l => l.key === 'attack')!
    expect(label.score, 'ratePower 与 ratingGauge 对同一份数据给了两个数').toBe(gauge.score)
  })
})
