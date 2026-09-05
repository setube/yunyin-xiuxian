/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
/**
 * Phase 25 规则宇宙稳定性审计
 * 局部正确性此前各 spec 已管;本卷审计全局:
 * ① Meta 演化:连续削弱最强者,系统应温和轮换而非催生新霸主
 * ② 生态健康度:跨版本可比的仪表盘(红线管「不许坏」,健康度管「趋势」)
 * ③ 规则预算:内容复杂度同账管理
 * ④ 风险图谱覆盖:破墙结构必须在故障知识库有档案
 */
import { describe, expect, it } from 'vitest'
import { mulberry32, RandomService } from '@/utils/random'
import { gn } from '@/utils/gnum'
import { GONGFA } from '@/data/gongfa'
import { ARTIFACTS } from '@/data/artifacts'
import { TALENTS } from '@/data/talents'
import { TITLES } from '@/data/titles'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'
import { runMetaEvolution } from './metaSim'
import { computeEcosystemHealth } from './ecosystemHealth'
import { budgetOfMods, budgetOfRules, ITEM_BUDGET_CAP, WORLD_BUDGET_CAP } from './ruleBudget'
import { fingerprintOf, riskProfileOf } from './fingerprints'
import { searchBuilds } from './buildSearch'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE, worldClearRate, crossWorldUniversals } from './celestialSim'
import { worldFoeSnap } from './gauntlet'
import { resolveCombat } from './combat'

describe('① Meta 演化稳定性', () => {
  it('连续五轮削弱最强流派:始终多解、无新霸主、最优温和轮换', () => {
    const rounds = runMetaEvolution(5, 8)
    console.log('—— Meta 演化(每轮削弱上轮最强 ×0.75)——')
    for (const r of rounds) {
      console.log(
        `  第${r.round}轮${r.nerfed ? `(已削 ${r.nerfed})` : ''}:最强 ${r.topStyle} ${Math.round(r.topRate * 100)}% · 次优 ${Math.round(r.secondRate * 100)}% · 可行 ${r.viable}/6`
      )
    }
    const tops = new Set(rounds.map(r => r.topStyle))
    expect(tops.size, 'Meta 死锁:五轮削弱后最优从未轮换').toBeGreaterThanOrEqual(2)
    for (const r of rounds) {
      expect(r.viable, `第${r.round}轮可行流派塌陷`).toBeGreaterThanOrEqual(3)
      expect(r.topRate, `第${r.round}轮出现新霸主`).toBeLessThanOrEqual(0.97)
    }
  })
})

describe('② 生态健康度仪表盘 + ④ 风险图谱覆盖', () => {
  // 共享数据:轻量全链采样
  const search = searchBuilds(400, 12)
  const byWorld = CELESTIAL_WORLDS.map((w, wi) =>
    BUILD_PROFILES.map((p, i) => worldClearRate(w, buildSnap(p), 10, 96000 + wi * 71 + i)).sort((a, b) => b - a)
  )
  const cross = crossWorldUniversals(60)

  it('生态健康度 ≥70,分项落盘可跨版本比较', () => {
    // 二阶协同榜首(轻量重扫:速检定敌 + 30 场/对)
    const KEY_LEVELS: [string, number][] = [
      ['shieldPower', 0.3],
      ['speed', 0.21],
      ['armorPen', 0.18],
      ['stunRate', 0.09],
      ['comboRate', 0.33],
      ['comboDamage', 0.48],
      ['counterRate', 0.36],
      ['counterDamage', 0.9],
      ['damageReduction', 0.15],
      ['lowHpDamage', 0.6]
    ]
    // 纯净底座(与 synergyScan 同构:裸三维,无词条无法宝),避免基线失真
    const bare = (mods: Record<string, number>) => ({
      name: '扫描构筑',
      icon: 'user',
      isPlayer: true,
      attack: gn(100),
      defense: gn(55),
      maxHp: gn(1400),
      speed: 1 + (mods.speed ?? 0),
      mods,
      skills: [{ name: '扫描杀招', mult: 1.7, rate: 0.25 }]
    })
    let foe = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, 2)
    let baseW = 1
    for (const esc of [1.6, 2.0, 2.4]) {
      const f = worldFoeSnap(TRIAL_FOES[0]!, SIM_REFERENCE, esc)
      const rng = new RandomService(mulberry32(42))
      let wins = 0
      for (let i = 0; i < 80; i += 1) if (resolveCombat(bare({}), f, rng).win) wins += 1
      const w = wins / 80
      if (Math.abs(w - 0.5) < Math.abs(baseW - 0.5)) {
        foe = f
        baseW = w
      }
    }
    const logit = (w: number): number => {
      const c = Math.min(0.97, Math.max(0.03, w))
      return Math.log(c / (1 - c))
    }
    const wr = (mods: Record<string, number>, seed: number): number => {
      const rng = new RandomService(mulberry32(seed))
      let wins = 0
      for (let i = 0; i < 30; i += 1) if (resolveCombat(bare(mods), foe, rng).win) wins += 1
      return wins / 30
    }
    const b0 = logit(wr({}, 1))
    const single = KEY_LEVELS.map(([k, v], i) => logit(wr({ [k]: v }, 100 + i)) - b0)
    let maxSyn = 0
    for (let i = 0; i < KEY_LEVELS.length; i += 1) {
      for (let j = i + 1; j < KEY_LEVELS.length; j += 1) {
        const [ka, va] = KEY_LEVELS[i]!
        const [kb, vb] = KEY_LEVELS[j]!
        const wAB = wr({ [ka]: va, [kb]: vb }, 1000 + i * 31 + j)
        maxSyn = Math.max(maxSyn, logit(wAB) - (b0 + single[i]! + single[j]!))
      }
    }

    const report = computeEcosystemHealth({
      viablePerWorld: byWorld.map(rates => rates.filter(r => r >= 0.35).length),
      secondOverBest: byWorld.map(rates => (rates[0]! > 0 ? rates[1]! / rates[0]! : 1)),
      universalRate: search.universals.length / search.results.length,
      trapRate: search.traps.length / search.results.length,
      crossWorldCount: cross.count,
      maxPairSynergy: maxSyn
    })
    console.log(`—— 生态健康度 ${report.score}/100 ——`)
    for (const p of report.parts) console.log(`  ${p.name}: ${p.score}(${p.detail})`)
    expect(report.score, '生态健康度跌破基线').toBeGreaterThanOrEqual(70)
  })

  it('破墙构筑的机制结构必须在风险图谱有档案(故障知识库覆盖)', () => {
    let missing = 0
    for (const u of search.universals) {
      const fp = fingerprintOf(u.build.mods)
      if (fp.signature !== 'plain' && !riskProfileOf(fp.signature)) {
        missing += 1
        console.log(`  [图谱缺档] ${fp.name}(${fp.signature})——请在 RISK_ATLAS 登记语境/对策/事故`)
      }
    }
    expect(missing, '风险图谱出现缺档结构').toBeLessThanOrEqual(2)
  })
})

describe('③ 规则预算审计', () => {
  it('单件内容(功法/法宝被动/天赋/称号)预算不超上限', () => {
    const rows: { kind: string; name: string; budget: number }[] = []
    for (const g of GONGFA) rows.push({ kind: '功法', name: g.name, budget: budgetOfMods(g.baseMods) })
    for (const a of ARTIFACTS) rows.push({ kind: '法宝', name: a.name, budget: budgetOfMods(a.passive) })
    for (const t of TALENTS) rows.push({ kind: '天赋', name: t.name, budget: budgetOfMods(t.mods) })
    for (const t of TITLES) rows.push({ kind: '称号', name: t.name, budget: budgetOfMods(t.mods) })
    rows.sort((a, b) => b.budget - a.budget)
    console.log(`—— 规则预算 Top5(上限 ${ITEM_BUDGET_CAP})——`)
    for (const r of rows.slice(0, 5)) console.log(`  ${r.kind}《${r.name}》: ${r.budget}`)
    for (const r of rows) {
      expect(r.budget, `${r.kind}《${r.name}》超规则预算`).toBeLessThanOrEqual(ITEM_BUDGET_CAP)
    }
  })

  it('世界规则预算(手工与程序化同账)不超上限', () => {
    for (const w of CELESTIAL_WORLDS) {
      const b = budgetOfRules(w.rules)
      expect(b, `${w.name} 规则超预算`).toBeLessThanOrEqual(WORLD_BUDGET_CAP)
    }
  })
})
