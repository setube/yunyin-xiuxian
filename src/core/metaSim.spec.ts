/**
 * Meta 演化:每轮把上一轮最强流派的全词条累计 ×0.75,看最优解是否温和轮换、始终多解。
 * 结构不变式:轮次连续、nerfed 指向上轮冠军、viable 不超过流派总数、同参数可复现。
 *
 * 已知局限(实测得出,不是没试):**本文件证明不了「削弱真的生效」**。
 * 把 nerfLevel 的累加改成 +0(削弱永不叠加)后,这七条仍然全绿 —— 因为 nerfed 字段只抄 lastTop,
 * 与削弱系数无关。而端到端胜率又压不住:runsPerWorld=2 时噪声能把 0.88 顶到 1.00,
 * 加到 8 也只是 0.844→0.875 的抖动,削弱痕迹淹没在采样误差里。
 * 要真验这一层,得让 nerfMods 可测或把削弱系数暴露出来 —— 当前实现两者都没有,故不假造断言。
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
