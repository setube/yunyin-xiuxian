/**
 * 玩家决策质量审计
 * ① 最优解塌缩:可行 Build 的性能分布须足够分散
 * ② 契约答案化:最优契约须随 Build×世界变化,无全局答案契约
 * ③ 逆命第二答案:混合构筑在主派被封后须显著优于纯构筑
 * ④ 词条递减:同词条多来源按 100/75/50/25 计入
 */
import { describe, expect, it } from 'vitest'
import type { CombatRules, CombatantSnap, StatMods } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { PACTS } from '@/data/pacts'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { BUILD_STYLES } from './buildDetect'
import { SIM_REFERENCE } from './gauntlet'
import { mergeRules, runGauntlet, worldFoeSnap, type GauntletOpts } from './gauntlet'
import { resolveCombat } from './combat'
import { mergeMods } from './statsCalc'
import { sealStyleMods } from './resilience'

function worldFoes(worldIdx: number): CombatantSnap[] {
  const world = CELESTIAL_WORLDS[worldIdx]!
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) {
    foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE))
  }
  foes.push(worldFoeSnap(world.guardian, SIM_REFERENCE))
  return foes
}

function clearRate(
  worldIdx: number,
  snap: CombatantSnap,
  extra: CombatRules | undefined,
  runs: number,
  seed: number,
  opts: GauntletOpts = {}
): number {
  const world = CELESTIAL_WORLDS[worldIdx]!
  const rng = new RandomService(mulberry32(seed))
  const foes = worldFoes(worldIdx)
  const rules = mergeRules(world.rules, extra)
  let clears = 0
  for (let i = 0; i < runs; i += 1) {
    if (runGauntlet(snap, foes, rules, world.healBetweenPct, rng, opts).cleared) clears += 1
  }
  return clears / runs
}

describe('① 最优解塌缩检测', () => {
  it('每个世界:可行流派 ≥3,且次优通率 ≥ 最优 ×0.55(有真选择,不是唯一答案)', () => {
    for (let w = 0; w < CELESTIAL_WORLDS.length; w += 1) {
      const rates = BUILD_PROFILES.map((p, i) => ({
        name: p.name,
        rate: clearRate(w, buildSnap(p), undefined, 25, 91000 + w * 71 + i)
      })).sort((a, b) => b.rate - a.rate)
      const [top1, top2] = [rates[0]!, rates[1]!]
      const viable = rates.filter(r => r.rate >= 0.35).length
      expect(viable, `${CELESTIAL_WORLDS[w]!.name} 可行流派不足`).toBeGreaterThanOrEqual(3)
      expect(
        top2.rate,
        `${CELESTIAL_WORLDS[w]!.name} 塌缩:${top1.name} ${top1.rate} 独走(次优 ${top2.name} ${top2.rate})`
      ).toBeGreaterThanOrEqual(top1.rate * 0.55)
    }
  })
})

describe('② 契约答案化检测', () => {
  // 可模拟的契约选项;孤剑契对单法宝模拟构筑无差别、逆命契依赖玩家构筑结构,不列入
  interface PactOption {
    id: string
    mult: number
    rules?: CombatRules
    opts?: GauntletOpts
  }
  const OPTIONS: PactOption[] = [
    { id: 'none', mult: 1 },
    ...PACTS.filter(p => p.rules !== undefined).map(p => ({ id: p.id, mult: p.sourceMult, rules: p.rules })),
    { id: 'wushang', mult: 3.0, opts: { minHpAfterFight: 0.8 } }
  ]

  it('最优契约随 Build×世界 变化:每个世界至少 2 种流派最优契不同,且无全局答案契约', () => {
    const globalBest = new Map<string, number>()
    let cells = 0
    for (let w = 0; w < CELESTIAL_WORLDS.length; w += 1) {
      const bestPerStyle = new Set<string>()
      for (const [pi, profile] of BUILD_PROFILES.entries()) {
        const snap = buildSnap(profile)
        let best: { id: string; value: number } = { id: 'none', value: -1 }
        for (const opt of OPTIONS) {
          const rate = clearRate(w, snap, opt.rules, 12, 93000 + w * 131 + pi * 17, opt.opts ?? {})
          const value = rate * opt.mult
          if (value > best.value) best = { id: opt.id, value }
        }
        bestPerStyle.add(best.id)
        globalBest.set(best.id, (globalBest.get(best.id) ?? 0) + 1)
        cells += 1
      }
      expect(bestPerStyle.size, `${CELESTIAL_WORLDS[w]!.name} 存在人人皆签的答案契`).toBeGreaterThanOrEqual(2)
    }
    for (const [id, n] of globalBest) {
      expect(n / cells, `契约 ${id} 成为全局答案(${n}/${cells})`).toBeLessThanOrEqual(0.75)
    }
  })
})

describe('③ 逆命契第二答案检测', () => {
  it('混合构筑在主派核心被封后,显著优于同样被封的纯构筑(冗余必须有价值)', () => {
    const gangdun = BUILD_PROFILES.find(p => p.id === 'gangdun')!
    const fanzhen = BUILD_PROFILES.find(p => p.id === 'fanzhen')!
    const gangdunStyle = BUILD_STYLES.find(s => s.id === 'gangdun')!

    // 纯罡盾全预算押主派;混合同预算分给罡盾 + 反震副体系(词条经真实递减聚合)
    const pureMods = mergeMods([gangdun.mods, { shieldOnStart: 0.15, shieldPower: 0.2 }])
    const halfFanzhen: StatMods = {
      counterRate: (fanzhen.mods.counterRate ?? 0) * 0.55,
      counterDamage: (fanzhen.mods.counterDamage ?? 0) * 0.55
    }
    const mixedMods = mergeMods([gangdun.mods, halfFanzhen])

    const base = buildSnap(gangdun)
    const pure: CombatantSnap = { ...base, mods: sealStyleMods(pureMods, gangdunStyle) }
    const mixed: CombatantSnap = { ...base, mods: sealStyleMods(mixedMods, gangdunStyle) }

    // 对手取万刃天界主(等比 1.15),厚血消耗墙:封盾后纯罡盾超时判负,混合的反击伤害恰好跨过 DPS 阈值
    const foe = worldFoeSnap(CELESTIAL_WORLDS[1]!.guardian, SIM_REFERENCE, 1.15)
    const winRate = (snap: CombatantSnap, seed: number): number => {
      const rng = new RandomService(mulberry32(seed))
      let wins = 0
      for (let i = 0; i < 80; i += 1) if (resolveCombat(snap, foe, rng, CELESTIAL_WORLDS[1]!.rules).win) wins += 1
      return wins / 80
    }
    const pureSealed = winRate(pure, 95001)
    const mixedSealed = winRate(mixed, 95002)
    expect(mixedSealed, `副体系没有形成第二答案(纯 ${pureSealed} vs 混 ${mixedSealed})`).toBeGreaterThan(pureSealed + 0.1)
  })
})

describe('④ 词条叠加递减数学', () => {
  it('同一条件词条多来源按 100%/75%/50%/25% 降序计入', () => {
    const merged = mergeMods([{ critRate: 0.2 }, { critRate: 0.3 }, { critRate: 0.1 }, { critRate: 0.08 }])
    // 0.3×1 + 0.2×0.75 + 0.1×0.5 + 0.08×0.25 = 0.52
    expect(merged.critRate).toBeCloseTo(0.52)
  })

  it('非条件词条(三维百分比/经济词条)不受递减影响', () => {
    const merged = mergeMods([
      { attackPct: 0.2, cultivationSpeed: 0.1 },
      { attackPct: 0.3, cultivationSpeed: 0.2 }
    ])
    expect(merged.attackPct).toBeCloseTo(0.5)
    expect(merged.cultivationSpeed).toBeCloseTo(0.3)
  })

  it('负值词条(道途代价等)不参与递减,直接相加', () => {
    const merged = mergeMods([{ critRate: 0.2 }, { critRate: -0.1 }])
    expect(merged.critRate).toBeCloseTo(0.1)
  })
})
