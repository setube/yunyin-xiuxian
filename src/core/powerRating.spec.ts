/**
 * 战力五维评级审计
 *
 * powerRating 自 Phase 30.2 起就在代码里(进攻/生存/身法/恢复/机制),
 * 却一直没有界面在用 —— 等于没接线。接到流派页之后补上行为验证:
 * 星级要真的随词条形状分化,而不是人人一串三星。
 */
import { describe, expect, it } from 'vitest'
import { ratePower, ratingStars } from './powerRating'
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
 * 五维的「为什么」—— 与属性来源明细同一条规矩:解释这个数,就得算得回这个数。
 *
 * 星级是结果,词条才是原因。面板若只给一串星,玩家看到「生存 ★★☆☆☆」也不知道
 * 差在哪一条词条;而如果给的明细相加对不上得分,那还不如不给。
 *
 * 故障注入:从任一一维里删掉一条 term(例如进攻少算破甲),本文件立刻变红。
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
    // 堆一路核心词条到成路,机制维明细里应当出现该路的名字
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
})
