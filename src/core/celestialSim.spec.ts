/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { auditAllWorlds, crossWorldUniversals } from './celestialSim'

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
    // 单天存在高通率专精解是终局 farm 的正反馈;跨天皆必胜才是万金油。
    // 已知残余:「镇岳印×满血斩杀」型(输出期望极高、无衔接依赖),
    // 已立项终局再平衡(候选:输出型法宝天界降效/满血斩杀对天主失效);此红线防恶化。
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
    // 至少出现 3 种不同的最优流派
    expect(new Set(bests).size).toBeGreaterThanOrEqual(3)
    // 不允许四天最优全部与基础世界相同
    expect(bests.every(b => b === 'gangdun')).toBe(false)
  })
})
