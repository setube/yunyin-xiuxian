/**
 * 三个平衡模拟器各自写了一份「基准三维」:
 *   buildSim.ts:BASE = { 100, 55, 1400 }
 *   buildSearch.ts:BASE = { 100, 55, 1400 }
 *   celestialSim.ts:SIM_REFERENCE = { gn(100), gn(55), gn(1400) },注释写着「须与 buildSim 基准一致」。
 *
 * 三处不一致的后果:同一条构筑在不同模拟器里被换算成不同强度,汇总出的平衡结论互相打架,
 * 而单一模块的测试各自都是绿的。本条把「必须一致」钉住。
 *
 * 只从 public API 取数,不复制常量值 —— 基准该多大由各处自己决定,本条只管它们彼此相同。
 *
 * 已知局限:buildSearch.ts 的 BASE 是模块私有常量,没有 public API 能取到,故本条盖不到它。
 * 它当前与另两处同值,但要真守住需要把它导出,属于生产改动,本轮不动。
 */
import { describe, expect, it } from 'vitest'
import { toNum } from '@/utils/gnum'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './celestialSim'

/** 取一个三维倍率全为 1 的 profile,其快照三维即基准三维 */
function unityProfile(): (typeof BUILD_PROFILES)[number] {
  const p = BUILD_PROFILES.find(x => x.atkMult === 1 && x.defMult === 1 && x.hpMult === 1)
  if (!p) throw new Error('没有倍率全 1 的 profile,基准三维取不到')
  return p
}

describe('平衡模拟器基准三维 · 三处必须同值', () => {
  it('存在倍率全 1 的 profile(取基准的前提)', () => {
    expect(unityProfile()).toBeDefined()
  })

  it('celestialSim.SIM_REFERENCE 与 buildSim 的基准三维一致', () => {
    const base = buildSnap(unityProfile())
    expect(toNum(SIM_REFERENCE.attack), '攻击基准不许分叉').toBeCloseTo(toNum(base.attack))
    expect(toNum(SIM_REFERENCE.defense), '防御基准不许分叉').toBeCloseTo(toNum(base.defense))
    expect(toNum(SIM_REFERENCE.maxHp), '气血基准不许分叉').toBeCloseTo(toNum(base.maxHp))
  })

  it('基准三维都是正数(为 0 或负数会让模拟全失真)', () => {
    const base = buildSnap(unityProfile())
    for (const [k, v] of Object.entries(base)) {
      if (k !== 'attack' && k !== 'defense' && k !== 'maxHp') continue
      expect(toNum(v as never), `${k} 基准须为正`).toBeGreaterThan(0)
    }
    expect(toNum(SIM_REFERENCE.attack)).toBeGreaterThan(0)
    expect(toNum(SIM_REFERENCE.defense)).toBeGreaterThan(0)
    expect(toNum(SIM_REFERENCE.maxHp)).toBeGreaterThan(0)
  })
})
