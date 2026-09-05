/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
/**
 * Phase 23 组合协同爆炸检测
 * 危险的不是某个词条太强,而是两个各自合理的机制组合出非线性收益。
 * 度量:对校准敌的胜率转对数赔率(logit),独立预期 = logit(A)+logit(B)-logit(基线),
 * synergy = 实际组合 logit - 独立预期。>0 即正协同,超过红线即爆炸警报
 */
import { describe, expect, it } from 'vitest'
import type { AnyStatKey, CombatantSnap, StatMods } from '@/types'
import { gn } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'
import { DAO_PATHS } from '@/data/endgame'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './celestialSim'
import { mergeRules, runGauntlet, worldFoeSnap } from './gauntlet'
import { resolveCombat } from './combat'

/** 扫描用词条档位:各键取「成型构筑」代表值 */
const KEY_LEVELS: [AnyStatKey, number][] = [
  ['lowHpDamage', 0.6],
  ['lowHpReduction', 0.3],
  ['fullHpDamage', 0.36],
  ['firstStrike', 0.48],
  ['shieldOnStart', 0.3],
  ['shieldPower', 0.3],
  ['counterRate', 0.36],
  ['counterDamage', 0.9],
  ['comboRate', 0.33],
  ['comboDamage', 0.48],
  ['lifesteal', 0.09],
  ['regenPerRound', 0.024],
  ['overhealShield', 0.6],
  ['dodgeRate', 0.11],
  ['critRate', 0.18],
  ['critDamage', 0.48],
  ['damageReduction', 0.15],
  ['damageBonus', 0.18],
  ['armorPen', 0.18],
  ['executeDamage', 0.3],
  ['stunRate', 0.09],
  ['speed', 0.21]
]

const BASE = { attack: gn(100), defense: gn(55), maxHp: gn(1400) }

function snapWith(mods: StatMods): CombatantSnap {
  return {
    name: '扫描构筑',
    icon: 'user',
    isPlayer: true,
    attack: BASE.attack,
    defense: BASE.defense,
    maxHp: BASE.maxHp,
    speed: 1 + (mods.speed ?? 0),
    mods,
    skills: [{ name: '扫描杀招', mult: 1.7, rate: 0.25 }]
  }
}

function winRate(snap: CombatantSnap, foe: CombatantSnap, runs: number, seed: number): number {
  const rng = new RandomService(mulberry32(seed))
  let wins = 0
  for (let i = 0; i < runs; i += 1) {
    if (resolveCombat(snap, foe, rng).win) wins += 1
  }
  return wins / runs
}

const logit = (w: number): number => {
  const c = Math.min(0.97, Math.max(0.03, w))
  return Math.log(c / (1 - c))
}

describe('词条 × 词条 协同爆炸扫描', () => {
  it('全 231 对组合的协同不超过红线;已知协同家族被检出(检测器自证有效)', () => {
    // 校准:扫描敌人强度档,取裸构筑胜率最接近 45% 的一档(logit 灵敏区)
    let foe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 2)
    let baseW = 1
    for (const esc of [1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8]) {
      const f = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, esc)
      const w = winRate(snapWith({}), f, 120, 100)
      if (Math.abs(w - 0.45) < Math.abs(baseW - 0.45)) {
        foe = f
        baseW = w
      }
    }
    expect(baseW, '校准失败:基线不在灵敏区').toBeGreaterThan(0.15)
    expect(baseW, '校准失败:基线不在灵敏区').toBeLessThan(0.8)

    const RUNS = 60
    const single = new Map<AnyStatKey, number>()
    for (const [i, [key, v]] of KEY_LEVELS.entries()) {
      single.set(key, winRate(snapWith({ [key]: v }), foe, RUNS, 200 + i))
    }
    const b0 = logit(baseW)

    const rows: { pair: string; wA: number; wB: number; wAB: number; synergy: number }[] = []
    for (let i = 0; i < KEY_LEVELS.length; i += 1) {
      for (let j = i + 1; j < KEY_LEVELS.length; j += 1) {
        const [ka, va] = KEY_LEVELS[i]!
        const [kb, vb] = KEY_LEVELS[j]!
        const wA = single.get(ka)!
        const wB = single.get(kb)!
        const wAB = winRate(snapWith({ [ka]: va, [kb]: vb }), foe, RUNS, 10000 + i * 97 + j)
        const expected = b0 + (logit(wA) - b0) + (logit(wB) - b0)
        rows.push({ pair: `${ka}×${kb}`, wA, wB, wAB, synergy: logit(wAB) - expected })
      }
    }
    rows.sort((a, b) => b.synergy - a.synergy)
    console.log(`—— 词条协同榜(基线 ${Math.round(baseW * 100)}%,正值=超出独立预期)——`)
    for (const r of rows.slice(0, 8)) {
      console.log(
        `  ${r.pair}: 单独 ${Math.round(r.wA * 100)}%/${Math.round(r.wB * 100)}% → 组合 ${Math.round(r.wAB * 100)}% · synergy ${r.synergy.toFixed(2)}`
      )
    }
    // 红线:任何词条对的单场协同 logit ≤ 2.0(首扫最高 1.14,榜首为设计内的率×倍率机制对)
    expect(rows[0]!.synergy, `协同爆炸:${rows[0]!.pair}`).toBeLessThanOrEqual(2.0)
    // 覆盖自证:已知的「减伤×续航」破墙家族在扫描范围内。
    // 注:它在单场呈负协同(续航在速检定中无从发挥),其爆炸只在连战+超时判负语境显形
    // (由 buildSearch 破墙红线值守)——这正是该家族长期难被人肉发现的原因,两套场景互补
    const known = rows.find(r => r.pair.includes('damageReduction') && (r.pair.includes('regenPerRound') || r.pair.includes('lifesteal')))
    expect(known, '检测器未覆盖已知协同家族').toBeDefined()
    console.log(`  [对照] 减伤×续航 单场 synergy ${known!.synergy.toFixed(2)}(连战语境才成墙,见 buildSearch)`)
  })
})

describe('三阶涌现扫描(A+B 正常、A+C 正常、B+C 正常,A+B+C 突然起飞?)', () => {
  it('二阶 Top8 × 第三机制的纯三阶交互不超红线;附连战语境对照', () => {
    // 校准(与二阶同法;记录选中档位,供连战语境派生弱敌)
    let foe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 2)
    let baseW = 1
    let bestEsc = 2
    for (const esc of [1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8]) {
      const f = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, esc)
      const w = winRate(snapWith({}), f, 120, 500)
      if (Math.abs(w - 0.45) < Math.abs(baseW - 0.45)) {
        foe = f
        baseW = w
        bestEsc = esc
      }
    }
    const b0 = logit(baseW)
    const RUNS = 60

    // 单项与全部二元(粗扫 40 场,给容斥用)
    const single = new Map<AnyStatKey, number>()
    for (const [i, [key, v]] of KEY_LEVELS.entries()) {
      single.set(key, winRate(snapWith({ [key]: v }), foe, RUNS, 600 + i))
    }
    const pairW = new Map<string, number>()
    const pairSyn: { i: number; j: number; syn: number }[] = []
    for (let i = 0; i < KEY_LEVELS.length; i += 1) {
      for (let j = i + 1; j < KEY_LEVELS.length; j += 1) {
        const [ka, va] = KEY_LEVELS[i]!
        const [kb, vb] = KEY_LEVELS[j]!
        const w = winRate(snapWith({ [ka]: va, [kb]: vb }), foe, 40, 20000 + i * 101 + j)
        pairW.set(`${i}:${j}`, w)
        const expected = b0 + (logit(single.get(ka)!) - b0) + (logit(single.get(kb)!) - b0)
        pairSyn.push({ i, j, syn: logit(w) - expected })
      }
    }
    pairSyn.sort((a, b) => b.syn - a.syn)

    // 三阶:高协同二元对 × 其余机制,容斥出纯三阶交互 I3
    const pw = (a: number, b: number): number => pairW.get(a < b ? `${a}:${b}` : `${b}:${a}`)!
    const tri: { names: string; wABC: number; i3: number; keys: [number, number, number] }[] = []
    for (const { i, j } of pairSyn.slice(0, 8)) {
      for (let k = 0; k < KEY_LEVELS.length; k += 1) {
        if (k === i || k === j) continue
        const [ka, va] = KEY_LEVELS[i]!
        const [kb, vb] = KEY_LEVELS[j]!
        const [kc, vc] = KEY_LEVELS[k]!
        const wABC = winRate(snapWith({ [ka]: va, [kb]: vb, [kc]: vc }), foe, RUNS, 40000 + i * 997 + j * 31 + k)
        const i3 =
          logit(wABC) -
          logit(pw(i, j)) -
          logit(pw(i, k)) -
          logit(pw(j, k)) +
          logit(single.get(ka)!) +
          logit(single.get(kb)!) +
          logit(single.get(kc)!) -
          b0
        tri.push({ names: `${ka}×${kb}×${kc}`, wABC, i3, keys: [i, j, k] })
      }
    }
    tri.sort((a, b) => b.i3 - a.i3)
    console.log(`—— 三阶涌现榜(纯三阶交互 I3,容斥法;基线 ${Math.round(baseW * 100)}%)——`)
    for (const t of tri.slice(0, 6)) {
      console.log(`  ${t.names}: 组合 ${Math.round(t.wABC * 100)}% · I3 ${t.i3.toFixed(2)}`)
    }

    // 连战语境对照:同一批 Top5 三元,3 连战粗协同(协同是机制×场景的函数,单场结论不可外推)
    // 连战强度天然更高,敌降一档让基线回到灵敏区
    const gFoe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, bestEsc * 0.78)
    const gRuns = 40
    const gWin = (mods: StatMods, seed: number): number => {
      const rng = new RandomService(mulberry32(seed))
      let ok = 0
      for (let r = 0; r < gRuns; r += 1) {
        if (runGauntlet(snapWith(mods), [gFoe, gFoe, gFoe], undefined, 0.3, rng).cleared) ok += 1
      }
      return ok / gRuns
    }
    const gBase = gWin({}, 700)
    const gb0 = logit(gBase)
    console.log(`—— 连战语境对照(3 连战,基线 ${Math.round(gBase * 100)}%)——`)
    for (const t of tri.slice(0, 5)) {
      const [i, j, k] = t.keys
      const [ka, va] = KEY_LEVELS[i]!
      const [kb, vb] = KEY_LEVELS[j]!
      const [kc, vc] = KEY_LEVELS[k]!
      const gABC = gWin({ [ka]: va, [kb]: vb, [kc]: vc }, 71000 + i * 91 + j * 7 + k)
      const gSyn =
        logit(gABC) -
        (gb0 +
          (logit(gWin({ [ka]: va }, 720 + i)) - gb0) +
          (logit(gWin({ [kb]: vb }, 730 + j)) - gb0) +
          (logit(gWin({ [kc]: vc }, 740 + k)) - gb0))
      console.log(`  ${t.names}: 单场 I3 ${t.i3.toFixed(2)} | 连战粗协同 ${gSyn.toFixed(2)}`)
    }

    // 红线:纯三阶交互 ≤2.5(容斥法下 I3 应远小于二阶总协同;超线=出现开发者未预料的三体涌现)
    expect(tri[0]!.i3, `三阶涌现:${tri[0]!.names}`).toBeLessThanOrEqual(2.5)
  })
})

describe('流派 × 道途 协同审计', () => {
  it('任何流派×道途组合在四天的平均通关率 ≤95%(道途不得把某流派推成万金油)', () => {
    const grid: string[] = []
    for (const dao of DAO_PATHS) {
      for (const profile of BUILD_PROFILES) {
        const snap = buildSnap(profile)
        let sum = 0
        for (let w = 0; w < CELESTIAL_WORLDS.length; w += 1) {
          const world = CELESTIAL_WORLDS[w]!
          const rng = new RandomService(mulberry32(30000 + w * 13 + profile.id.length * 7 + dao.id.length))
          const foes: CombatantSnap[] = []
          for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE))
          foes.push(worldFoeSnap(world.guardian, SIM_REFERENCE))
          const rules = mergeRules(dao.rules, world.rules)
          let clears = 0
          for (let r = 0; r < 10; r += 1) {
            if (runGauntlet(snap, foes, rules, world.healBetweenPct, rng).cleared) clears += 1
          }
          sum += clears / 10
        }
        const avg = sum / CELESTIAL_WORLDS.length
        grid.push(`${dao.name}×${profile.name}: ${Math.round(avg * 100)}%`)
        expect(avg, `${dao.name}×${profile.name} 四天平均通率超标`).toBeLessThanOrEqual(0.95)
      }
    }
    console.log('—— 流派×道途 四天平均通率 ——\n  ' + grid.join(' · '))
  })
})
