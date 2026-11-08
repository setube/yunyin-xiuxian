/* eslint-disable no-console -- 体检报告输出(test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { SIM_REFERENCE, auditAllWorlds, crossWorldUniversals, worldFoes } from './celestialSim'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { celestialAnchor, worldFoeLineup, worldFoeSnap } from './gauntlet'
import { celestialJudgement } from './gauntlet'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { MAX_MAJOR } from '@/data/realms'
import { gn } from '@/utils/gnum'

describe('终局世界守恒审计(Phase 20 —— 六项发布条件)', () => {
  const rows = auditAllWorlds()

  it('输出四天通关率矩阵', () => {
    console.log('\n—— 特殊世界 × 六大流派 通关率(各 25 次连战) ——')
    for (const row of rows) {
      const cells = row.byStyle.map(x => `${x.profile.name}${Math.round(x.clearRate * 100)}%`).join(' ')
      console.log(`  ${row.world.name}: ${cells} | 随机最优 ${Math.round(row.randomBest * 100)}%`)
    }
    expect(rows.length).toBe(4)
  })

  it('条件①:每个世界至少 3 个可行流派(通关率 ≥35%)', () => {
    for (const row of rows) {
      expect(row.viableCount, row.world.name).toBeGreaterThanOrEqual(3)
    }
  })

  it('条件②:跨界通吃构筑红线(≤2/120,指纹化追踪)', () => {
    // 已知残余:「镇岳印×满血斩杀」型,已立项终局再平衡;此红线防恶化
    const cross = crossWorldUniversals(120)
    console.log(`  跨界通吃: ${cross.count} · 最佳跨界下限 ${Math.round(cross.worstCaseBest * 100)}%`)
    expect(cross.count).toBeLessThanOrEqual(2)
  })

  it('条件③:不允许所有流派都低于 15%(世界必须可解)', () => {
    for (const row of rows) {
      const max = Math.max(...row.byStyle.map(x => x.clearRate))
      expect(max, row.world.name).toBeGreaterThanOrEqual(0.15)
    }
  })

  it('条件④⑤:存在明显优势与明显劣势流派(极差 ≥30%)', () => {
    for (const row of rows) {
      const rates = row.byStyle.map(x => x.clearRate)
      expect(Math.max(...rates) - Math.min(...rates), row.world.name).toBeGreaterThanOrEqual(0.3)
    }
  })

  it('条件⑥:四天的最优流派不趋同,且不全等于基础世界最优(罡盾)', () => {
    const bests = rows.map(r => r.bestStyleId)
    console.log(`  各天最优: ${rows.map(r => `${r.world.name}=${r.bestStyleId}`).join(' ')}`)
    expect(new Set(bests).size).toBeGreaterThanOrEqual(3)
    expect(bests.every(b => b === 'gangdun')).toBe(false)
  })
})

/**
 * `worldFoes` 的阵容形状与参照口径。
 *
 * 这段循环原先是 celestialSim 里自建的一份(与 challenge / endgameService / lab 三处逐字相同),
 * 已收进 gauntlet.worldFoeLineup。收进一处后要钉两件事:
 *  · 形状仍对:场数 = fights、末位是守关者
 *  · 参照仍用 SIM_REFERENCE,不是天界锚点 —— 模拟比的是构筑形状,
 *    换成锚点会让所有流派的通关率整体平移,而审计矩阵看不出这是错的
 *
 * 故障注入:把 SIM_REFERENCE 换成 celestialAnchor(world.anchorTier),本条红。
 */
describe('模拟阵容 · 形状与参照口径', () => {
  const world = CELESTIAL_WORLDS[0]!
  const snap = buildSnap(BUILD_PROFILES[0]!)

  it('场数等于 world.fights,末位是守关者', () => {
    const foes = worldFoes(world, snap)
    expect(foes.length, '阵容长度该等于 world.fights').toBe(world.fights)
    const judgement = celestialJudgement(snap.mods, MAX_MAJOR, world.anchorTier)
    const guardian = worldFoeLineup(world, SIM_REFERENCE, judgement)
    expect(foes[foes.length - 1]!.name, '末位该是守关者').toBe(guardian[guardian.length - 1]!.name)
  })

  it('参照用 SIM_REFERENCE,不是天界锚点', () => {
    /*
     * 独立构造期望值,不复用 worldFoeLineup —— 否则是拿它验它自己。
     * 这里逐场调 worldFoeSnap 手搭一遍:参照 = SIM_REFERENCE。
     */
    const judgement = celestialJudgement(snap.mods, MAX_MAJOR, world.anchorTier)
    const foes = worldFoes(world, snap)
    for (let i = 0; i < world.fights - 1; i += 1) {
      const expectFoe = worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE, 1, judgement)
      expect(JSON.stringify(foes[i]), `第 ${i} 场的参照不是 SIM_REFERENCE`).toBe(JSON.stringify(expectFoe))
    }
    const expectGuardian = worldFoeSnap(world.guardian, SIM_REFERENCE, 1, judgement)
    expect(JSON.stringify(foes[foes.length - 1]), '守关者的参照不是 SIM_REFERENCE').toBe(JSON.stringify(expectGuardian))

    // 反向:换成天界锚点必须算得出不同的阵容,否则说明参照根本没参与
    const anchored = worldFoeSnap(world.guardian, celestialAnchor(world.anchorTier), 1, judgement)
    expect(JSON.stringify(anchored), '两种参照算出了相同敌人 —— 参照没起作用').not.toBe(JSON.stringify(expectGuardian))
  })

  it('SIM_REFERENCE 三维仍是 buildSim 基准的三个有限数', () => {
    for (const [k, v] of Object.entries(SIM_REFERENCE)) {
      expect(Number.isFinite(v.m), `${k} 的尾数不是有限数`).toBe(true)
      expect(v.m, `${k} 不该是 0`).toBeGreaterThan(0)
    }
    expect(SIM_REFERENCE.attack).toEqual(gn(100))
    expect(SIM_REFERENCE.defense).toEqual(gn(55))
    expect(SIM_REFERENCE.maxHp).toEqual(gn(1400))
  })
})
