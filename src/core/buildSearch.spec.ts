/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { ENEMY_ARCHETYPES } from './buildSim'
import { searchBuilds } from './buildSearch'
import { fingerprintOf, FINGERPRINT_NAMES } from './fingerprints'

describe('随机构筑搜索与异常检测(Phase 19)', () => {
  // 1000 构筑(属性预算守恒) × 7 原型 × 20 场 = 140,000 场真实战斗
  const report = searchBuilds(1000, 20)

  it('输出涌现构筑榜与体检报告', () => {
    console.log('\n—— 随机构筑搜索(1000 构筑 × 140 场/构筑,预算守恒) ——')
    console.log(`  战力-胜率相关系数 r = ${report.powerCorrelation.toFixed(2)}`)
    console.log(`  万金油构筑: ${report.universals.length} · 陷阱构筑: ${report.traps.length}`)
    console.log('  涌现构筑前五(平均胜率 | 流派识别 | 各场景):')
    const names = ENEMY_ARCHETYPES.map(a => a.name)
    for (const r of report.results.slice(0, 5)) {
      const cells = r.cells.map((c, i) => `${names[i]}${Math.round(c * 100)}`).join(' ')
      console.log(`    ${(r.avg * 100).toFixed(0)}% | ${r.identity} | ${cells}`)
    }
    expect(report.results.length).toBe(1000)
  })

  it('万金油红线:破墙构筑占比 ≤1.5%,且按机制指纹归类追踪', () => {
    const sigCount = new Map<string, number>()
    let unknown = 0
    for (const u of report.universals) {
      const fp = fingerprintOf(u.build.mods)
      sigCount.set(fp.signature, (sigCount.get(fp.signature) ?? 0) + 1)
      if (!fp.known) unknown += 1
      console.log(
        `  [破墙构筑] ${u.identity} · 指纹「${fp.name}」(${fp.signature}): ${u.cells.map(c => Math.round(c * 100)).join('/')} mods=${JSON.stringify(u.build.mods)}`
      )
    }
    console.log(`  [指纹分布] ${[...sigCount.entries()].map(([s, n]) => `${FINGERPRINT_NAMES[s] ?? s}×${n}`).join(' · ')}`)
    // Phase 19 发现:盾系厚血混合在中期预算下偏强(~1.2%);P19.5 证实为减伤×续航的横向协同;
    // 此红线防止其恶化——一旦超过 1.5% 说明改动加剧了问题
    expect(report.universals.length / report.results.length).toBeLessThanOrEqual(0.015)
    // 指纹注册表覆盖:破墙结构必须是已命名的已知风险家族;冒出 ≥3 个未名结构 = 出现了新的风险类型
    expect(unknown, '出现未命名的破墙机制结构,请在 FINGERPRINT_NAMES 中登记并评估').toBeLessThanOrEqual(2)
  })

  it('最强构筑必须留有短板(最弱场景 ≤92%)', () => {
    expect(Math.min(...report.results[0]!.cells)).toBeLessThanOrEqual(0.92)
  })

  it('战力与胜率:相关但不决定(0.15 < r < 0.92)', () => {
    expect(report.powerCorrelation).toBeGreaterThan(0.15)
    expect(report.powerCorrelation).toBeLessThan(0.92)
  })

  it('陷阱构筑存在但占比有限(随机垃圾 < 15%)', () => {
    expect(report.traps.length / report.results.length).toBeLessThan(0.15)
  })
})
