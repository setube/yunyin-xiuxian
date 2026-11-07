/**
 * Meta 演化:每轮把上一轮最强流派的全词条累计 ×0.75,看最优解是否温和轮换、始终多解。
 * 结构不变式:轮次连续、nerfed 指向上轮冠军、viable 不超过流派总数、同参数可复现。
 *
 * 「削弱真的生效」原本记作已知局限,现在测得出来了。
 *
 * 原判断是「端到端胜率压不住」—— 那是对**单轮**读数说的:runsPerWorld=2 时噪声能把 0.88 顶到 1.00。
 * 但把**轮次拉长到 8 轮**看,削弱痕迹就不再是噪声:
 *   正常(削弱累计):0.844 0.875 0.813 0.781 0.750 0.781 0.719 0.688
 *   注入 +0(永不叠加):0.844 0.938 0.813 0.875 0.844 0.938 0.906 0.875
 * 关键是末轮:正常版一轮轮压到 0.688,注入版始终在 0.84~0.94 高位震荡。
 * 故本文件用「末轮冠军胜率明显低于首轮」来钉这一层 —— 这是把削弱系数暴露出来之外的另一条路,
 * 不必为测试往生产代码加导出。
 */
import { describe, expect, it } from 'vitest'
import { BUILD_PROFILES } from './buildSim'
import { runMetaEvolution } from './metaSim'

describe('演化结构', () => {
  it('轮次从 1 连续到 rounds', () => {
    const rows = runMetaEvolution(3, 2)
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.round)).toEqual([1, 2, 3])
  })

  it('第一轮没有「被削流派」,之后每轮都指向上一轮冠军', () => {
    const rows = runMetaEvolution(4, 2)
    expect(rows[0]!.nerfed).toBeNull()
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.nerfed, `第 ${i + 1} 轮应削上一轮冠军`).toBe(rows[i - 1]!.topStyle)
    }
  })

  /**
   * 削弱必须真的生效。
   *
   * 判据取「8 轮演化后,末轮冠军胜率显著低于首轮」。实测两态:
   *   正常 0.844 → 0.688(跌 0.156);注入 +0 后 0.844 → 0.875(不跌反涨)。
   * 阈值取 0.05:正常态跌 0.156 有三倍余量,注入态是负数,两边都离阈值很远。
   * 只在末轮比,不比逐轮单调 —— 中段会因流派换人而反弹(第 6 轮背水流 0.781),
   * 那不是削弱失效,是冠军换人了。
   */
  it('8 轮演化后冠军胜率明显下降(削弱的直接证据)', () => {
    const rows = runMetaEvolution(8, 8)
    const first = rows[0]!.topRate
    const last = rows[rows.length - 1]!.topRate
    expect(first, '首轮胜率异常,后面那条判据就失去意义').toBeGreaterThan(0.6)
    expect(
      first - last,
      `削弱没生效:首轮 ${first.toFixed(3)} → 末轮 ${last.toFixed(3)},跌幅不足 0.05`
    ).toBeGreaterThan(0.05)
  })

  it('冠军胜率不低于次席,次席不低于 0', () => {
    for (const r of runMetaEvolution(3, 2)) {
      expect(r.topRate).toBeGreaterThanOrEqual(r.secondRate)
      expect(r.secondRate).toBeGreaterThanOrEqual(0)
      expect(r.topRate).toBeLessThanOrEqual(1)
    }
  })

  it('可行流派数不超过流派总数', () => {
    for (const r of runMetaEvolution(3, 2)) {
      expect(r.viable).toBeGreaterThanOrEqual(0)
      expect(r.viable).toBeLessThanOrEqual(BUILD_PROFILES.length)
    }
  })

  it('冠军名一定来自流派表', () => {
    const names = new Set(BUILD_PROFILES.map(p => p.name))
    for (const r of runMetaEvolution(3, 2)) {
      expect(names.has(r.topStyle), `「${r.topStyle}」不是流派表里的名字`).toBe(true)
    }
  })

  it('rounds=0 返回空表,不抛错', () => {
    expect(runMetaEvolution(0, 2)).toEqual([])
  })

  it('同参数两次调用结果一致(种子固定,不含墙钟)', () => {
    const a = runMetaEvolution(2, 2)
    const b = runMetaEvolution(2, 2)
    expect(a, '两次结果必须完全相同:种子写死在代码里').toEqual(b)
  })
})
