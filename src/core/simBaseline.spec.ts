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
 * buildSearch.ts 的 BASE 是模块私有常量,取不到值 —— 但取得到源码文本,
 * 底下第三条判据就是从源码里读它,不必为一条测试把生产常量导出去。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toNum } from '@/utils/gnum'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './gauntlet'

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

  /**
   * 第三处:buildSearch.ts 的 BASE。
   *
   * 原注释写「它是模块私有常量,没有 public API 能取到,故本条盖不到它;
   * 要真守住需要把它导出,属于生产改动」—— 那个判断过于保守:
   * 常量取不到,但**源码文本取得到**。为一条判据把模块内部常量导出去,
   * 反而会被 deadExportAudit 判为「为测试而生的导出」,那才是错的取舍。
   *
   * 这里的正则只认 `const BASE = { attack: N, defense: N, maxHp: N }` 这一种写法,
   * 改写法会先让本判据报「读不到」而不是静默放绿。
   */
  it('buildSearch 的 BASE 也只能是同一组基准三维', () => {
    const src = readFileSync(resolve(__dirname, 'buildSearch.ts'), 'utf8')
    const m = /const BASE = \{ attack: ([\d.]+), defense: ([\d.]+), maxHp: ([\d.]+) \}/.exec(src)
    expect(m, 'buildSearch 的 BASE 写法变了,正则读不到 —— 请按新写法更新本条').not.toBeNull()
    const [, atk, def, hp] = m!
    const base = buildSnap(unityProfile())
    expect(Number(atk), 'buildSearch 的攻击基准与 buildSim 分叉').toBeCloseTo(toNum(base.attack))
    expect(Number(def), 'buildSearch 的防御基准与 buildSim 分叉').toBeCloseTo(toNum(base.defense))
    expect(Number(hp), 'buildSearch 的气血基准与 buildSim 分叉').toBeCloseTo(toNum(base.maxHp))
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
