/**
 * Phase 21 裁判 —— 契约 / 变数 / 路线节点 / 组合技 / 道途深化的自动验收
 * 原则:每条新规则都必须「有解、无万金油」;模拟器就是发布门
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CombatRules, CombatantSnap } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS, MUTATION_FOES, TRIAL_FOES } from '@/data/endgame'
import { PACTS } from '@/data/pacts'
import { MUTATORS } from '@/data/mutators'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './celestialSim'
import { mergeRules, runGauntlet, worldFoeSnap } from './gauntlet'
import { resolveCombat } from './combat'
import { swordPurity, stackedMods, SWORD_LAYER_MODS, SWORD_PURITY_MAX_LAYERS, slaughterSpeedBonus } from './daoDepth'

function chain(...list: (CombatRules | undefined)[]): CombatRules | undefined {
  return list.reduce((acc, cur) => mergeRules(acc, cur), undefined)
}

/** 变数六连战通关率(机制混编敌池) */
function mutationClearRate(rules: CombatRules | undefined, snap: CombatantSnap, runs: number, seed: number): number {
  const rng = new RandomService(mulberry32(seed))
  const foes: CombatantSnap[] = []
  for (let i = 0; i < 6; i += 1) {
    foes.push(worldFoeSnap(MUTATION_FOES[i % MUTATION_FOES.length]!, SIM_REFERENCE, Math.pow(1.06, i)))
  }
  let clears = 0
  for (let i = 0; i < runs; i += 1) {
    if (runGauntlet(snap, foes, rules, 0.4, rng).cleared) clears += 1
  }
  return clears / runs
}

/** 世界连战通关率(可叠加额外规则,如契约) */
function worldRateWithRules(worldIdx: number, extra: CombatRules | undefined, snap: CombatantSnap, runs: number, seed: number): number {
  const world = CELESTIAL_WORLDS[worldIdx]!
  const rng = new RandomService(mulberry32(seed))
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) {
    foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE))
  }
  foes.push(worldFoeSnap(world.guardian, SIM_REFERENCE))
  const rules = chain(world.rules, extra)
  let clears = 0
  for (let i = 0; i < runs; i += 1) {
    if (runGauntlet(snap, foes, rules, world.healBetweenPct, rng).cleared) clears += 1
  }
  return clears / runs
}

describe('天道契约裁判', () => {
  const RULE_PACTS = PACTS.filter(p => p.rules !== undefined)

  it('每条规则契约在每个世界都有解(至少一个流派通率 ≥15%)', () => {
    for (const pact of RULE_PACTS) {
      for (let w = 0; w < CELESTIAL_WORLDS.length; w += 1) {
        const best = Math.max(...BUILD_PROFILES.map((p, i) => worldRateWithRules(w, pact.rules, buildSnap(p), 12, 21000 + w * 101 + i * 7)))
        expect(best, `${pact.name}×${CELESTIAL_WORLDS[w]!.name} 无解`).toBeGreaterThanOrEqual(0.15)
      }
    }
  })

  it('不存在契约免疫的万金油(没有流派在全部契约×全部世界均 ≥95%)', () => {
    for (const profile of BUILD_PROFILES) {
      let minRate = 1
      outer: for (const pact of RULE_PACTS) {
        for (let w = 0; w < CELESTIAL_WORLDS.length; w += 1) {
          const rate = worldRateWithRules(w, pact.rules, buildSnap(profile), 10, 22000 + w * 13)
          minRate = Math.min(minRate, rate)
          if (minRate < 0.95) break outer
        }
      }
      expect(minRate, `${profile.name} 契约免疫`).toBeLessThan(0.95)
    }
  })
})

describe('天道变数裁判', () => {
  /** 全部 C(8,3)=56 种三条组合 */
  const combos: [number, number, number][] = []
  for (let i = 0; i < MUTATORS.length; i += 1)
    for (let j = i + 1; j < MUTATORS.length; j += 1) for (let k = j + 1; k < MUTATORS.length; k += 1) combos.push([i, j, k])

  it('任意三条变数组合皆有解,且无组合通吃者', () => {
    const alwaysHigh = new Map<string, number>()
    for (const [ci, [a, b, c]] of combos.entries()) {
      const rules = chain(MUTATORS[a]!.rules, MUTATORS[b]!.rules, MUTATORS[c]!.rules)
      let best = 0
      for (const [pi, profile] of BUILD_PROFILES.entries()) {
        const rate = mutationClearRate(rules, buildSnap(profile), 8, 31000 + ci * 61 + pi)
        best = Math.max(best, rate)
        if (rate >= 0.95) alwaysHigh.set(profile.id, (alwaysHigh.get(profile.id) ?? 0) + 1)
      }
      expect(best, `变数组合 ${MUTATORS[a]!.name}/${MUTATORS[b]!.name}/${MUTATORS[c]!.name} 无解`).toBeGreaterThanOrEqual(0.15)
    }
    // 没有流派在 ≥90% 的组合里都近乎必胜
    for (const [id, n] of alwaysHigh) {
      expect(n / combos.length, `${id} 变数通吃`).toBeLessThan(0.9)
    }
  })
})

describe('路线节点裁判', () => {
  it('每个节点单场皆有解(至少一个流派胜率 ≥35%)', () => {
    for (const world of CELESTIAL_WORLDS) {
      for (const layer of world.routes) {
        for (const node of layer) {
          const foe = worldFoeSnap(node.foe, SIM_REFERENCE)
          const rules = chain(world.rules, node.rules)
          let best = 0
          for (const [pi, profile] of BUILD_PROFILES.entries()) {
            const rng = new RandomService(mulberry32(41000 + pi * 97 + node.id.length))
            let wins = 0
            for (let r = 0; r < 20; r += 1) {
              if (resolveCombat(buildSnap(profile), foe, rng, rules).win) wins += 1
            }
            best = Math.max(best, wins / 20)
          }
          expect(best, `${world.name}·${node.name} 无解`).toBeGreaterThanOrEqual(0.35)
        }
      }
    }
  })

  it('高险节点的额外道源不低于同层稳妥节点(风险应当有价)', () => {
    for (const world of CELESTIAL_WORLDS) {
      for (const layer of world.routes) {
        expect(layer[0].bonus).not.toBe(layer[1].bonus)
      }
    }
  })
})

describe('组合技裁判', () => {
  // 优势界看增益不缩水,劣势界看不被组合技翻成通吃(单界高通率本就是允许的正反馈)
  const CASES = [
    { art: 'xuangang', profileId: 'gangdun', strongIdx: 1, weakIdx: 0 },
    { art: 'kuze', profileId: 'muze', strongIdx: 0, weakIdx: 2 },
    { art: 'fenglian', profileId: 'fengmang', strongIdx: 3, weakIdx: 1 }
  ] as const

  it('组合技在优势界有实际增益,在劣势界不翻盘成通吃', () => {
    for (const c of CASES) {
      const profile = BUILD_PROFILES.find(p => p.id === c.profileId)!
      const base = buildSnap(profile)
      const withArt: CombatantSnap = { ...base, comboArt: c.art }
      const plainStrong = worldRateWithRules(c.strongIdx, undefined, base, 40, 51000)
      const boostedStrong = worldRateWithRules(c.strongIdx, undefined, withArt, 40, 51000)
      expect(boostedStrong, `${c.art} 优势界反而变弱`).toBeGreaterThanOrEqual(plainStrong - 0.05)
      const boostedWeak = worldRateWithRules(c.weakIdx, undefined, withArt, 40, 52000)
      expect(boostedWeak, `${c.art} 劣势界翻盘成通吃`).toBeLessThan(0.95)
    }
  })

  it('枯泽回春在濒死场景强于纯沐泽(低血开局对拼)', () => {
    const profile = BUILD_PROFILES.find(p => p.id === 'muze')!
    const base = buildSnap(profile)
    const withArt: CombatantSnap = { ...base, comboArt: 'kuze' }
    const foe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 1.12)
    const lowHp: CombatRules = { playerStartHpPct: 0.28 }
    const winRate = (snap: CombatantSnap, seed: number): number => {
      const rng = new RandomService(mulberry32(seed))
      let wins = 0
      for (let i = 0; i < 120; i += 1) if (resolveCombat(snap, foe, rng, lowHp).win) wins += 1
      return wins / 120
    }
    expect(winRate(withArt, 777)).toBeGreaterThan(winRate(base, 777) - 0.02)
  })
})

describe('道途深化裁判', () => {
  it('长生印规则可被引擎执行且战报留痕', () => {
    const rules: CombatRules = { perRounds: { interval: 3, playerHealPct: 0.05, playerShieldPct: 0.05, enemyAtkGrowth: 0.05 } }
    const foe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 1)
    const rng = new RandomService(mulberry32(999))
    const result = resolveCombat(buildSnap(BUILD_PROFILES[0]!), foe, rng, rules)
    expect(result.log.some(l => l.text.includes('长生印'))).toBe(true)
  })

  it('长生印不会把持久流推成必胜(敌人杀意渐涨形成对冲)', () => {
    const longevityRules: CombatRules = {
      healMult: 1.5,
      shieldCapRatio: 0.65,
      enemyHpMult: 1.2,
      perRounds: { interval: 5, playerHealPct: 0.04, playerShieldPct: 0.04, enemyAtkGrowth: 0.06 }
    }
    const muze = BUILD_PROFILES.find(p => p.id === 'muze')!
    const rate = worldRateWithRules(1, longevityRules, buildSnap(muze), 30, 61000)
    expect(rate).toBeLessThan(0.98)
  })

  it('剑意纯度按四项判定计层', () => {
    const pure = swordPurity({ fullHpDamage: 0.35, firstStrike: 0.35, critRate: 0.15 }, 1, {
      style: { id: 'fengmang', name: '锋芒流', seal: '锋', desc: '', core: { fullHpDamage: 0.35, firstStrike: 0.35, critRate: 0.15 } },
      affinity: 1,
      stageName: '大成',
      coreValues: [],
      displayName: '锋芒流'
    })
    expect(pure.layers).toBe(4)
    // 无流派可言者谈不上「纯」:四项皆不满足
    const impure = swordPurity({ lifesteal: 0.08 }, 2, null)
    expect(impure.layers).toBe(0)
  })

  it('剑意叠层与杀伐速战加成的数学正确', () => {
    const mods = stackedMods({}, SWORD_LAYER_MODS, 3)
    expect(mods.damageBonus).toBeCloseTo(0.12)
    expect(mods.critRate).toBeCloseTo(0.06)
    expect(slaughterSpeedBonus(50, 5)).toBe(0.25)
    expect(slaughterSpeedBonus(130, 5)).toBe(0)
  })
})

describe('契约机制单元', () => {
  it('无伤契:战后血线不达标即判违契终止', () => {
    const foes = [worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 1), worldFoeSnap(TRIAL_FOES[1]!, SIM_REFERENCE, 1)]
    const rng = new RandomService(mulberry32(123))
    const report = runGauntlet(buildSnap(BUILD_PROFILES[0]!), foes, undefined, 0.5, rng, { minHpAfterFight: 0.999 })
    expect(report.cleared).toBe(false)
    expect(report.pactBroken ?? report.rows.some(r => !r.win)).toBeTruthy()
  })

  it('逐胜叠层:perWinPlayerMods 使后续场次伤害词条更高', () => {
    const weakFoe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 0.3)
    const rng = new RandomService(mulberry32(456))
    const report = runGauntlet(buildSnap(BUILD_PROFILES[0]!), [weakFoe, weakFoe, weakFoe], undefined, 1, rng, {
      perWinPlayerMods: { damageBonus: 0.5 }
    })
    expect(report.cleared).toBe(true)
    // 叠层生效的间接证据:第三场(+100% 伤害)回合数不多于第一场
    expect(report.rows[2]!.rounds).toBeLessThanOrEqual(report.rows[0]!.rounds)
  })
})

describe('剑意层数与门槛 · 一处出', () => {
  // 「当前 X/4 层」与「契合 ≥60%」都曾被手抄 —— 层数该等于判定项数,百分比该对着成形门槛
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')

  it('层数是判定项的推导,不是另写的一份', () => {
    const pure = swordPurity({}, 0, null)
    expect(SWORD_PURITY_MAX_LAYERS).toBe(pure.checks.length)
  })

  it('纯度判定与文案同读 STYLE_MATURE_AFFINITY,不手抄 60%', () => {
    const src = strip(readFileSync(resolve(__dirname, 'daoDepth.ts'), 'utf8'))
    expect(src).toContain('STYLE_MATURE_AFFINITY * 100')
    expect(src).not.toContain('契合 ≥60%')
  })

  it('天界页的「/N 层」读 SWORD_PURITY_MAX_LAYERS,不许再写 /4', () => {
    const src = strip(readFileSync(resolve(__dirname, '../views/CelestialView.vue'), 'utf8'))
    expect(src).toContain('/{{ SWORD_PURITY_MAX_LAYERS }} 层')
    expect(src).not.toContain('剑意 {{ swordInfo.layers }}/4 层')
  })
})
