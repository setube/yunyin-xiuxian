import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mulberry32, RandomService } from '@/utils/random'
import { rollLinggen, sanitizeLinggen, GROWTH_MULT_MAX } from './linggenGen'

describe('灵根生成', () => {
  it('灵根数量与资质范围合法', () => {
    const rng = new RandomService(mulberry32(2024))
    for (let i = 0; i < 300; i += 1) {
      const p = rollLinggen(rng)
      expect(p.roots.length).toBeGreaterThanOrEqual(1)
      expect(p.roots.length).toBeLessThanOrEqual(5)
      for (const r of p.roots) {
        expect(r.aptitude).toBeGreaterThanOrEqual(40)
        expect(r.aptitude).toBeLessThanOrEqual(100)
      }
      expect(p.growthMult).toBeGreaterThan(0.3)
      expect(p.growthMult).toBeLessThanOrEqual(4.5)
      expect(p.gradeName.length).toBeGreaterThan(1)
    }
  })

  it('转世资质保底生效', () => {
    const rng = new RandomService(mulberry32(7))
    for (let i = 0; i < 100; i += 1) {
      const p = rollLinggen(rng, 30)
      for (const r of p.roots) {
        expect(r.aptitude).toBeGreaterThanOrEqual(70)
      }
    }
  })

  it('元素不重复', () => {
    const rng = new RandomService(mulberry32(13))
    for (let i = 0; i < 200; i += 1) {
      const p = rollLinggen(rng)
      const els = p.roots.map(r => r.element)
      expect(new Set(els).size).toBe(els.length)
    }
  })
})

/**
 * 鉴定动画报出的品阶名,必须是生成器真能产出的那些。
 *
 * SpiritRootReveal 的注释写着「灵根品阶全集,须与 linggenGen.ts 的 gradeName 取值一致」,
 * 但没有任何判据。两处各写一份字符串列表时,改一处忘了另一处:
 *   - 动画里少一档 → 掷到该档的玩家在鉴定时闪到最后一帧却**停在别的名字上**;
 *   - 动画里多一档 → 那一档永远闪不到(无害但是死数据)。
 *
 * 判据取「生成器可能产出的全部品阶名」与「动画的 GRADES 全集」互相比对。
 */
describe('灵根鉴定动画 · 品阶名与生成器一致', () => {
  const SRC = readFileSync(resolve(__dirname, './linggenGen.ts'), 'utf-8')
  const VUE = readFileSync(resolve(__dirname, '../components/common/SpiritRootReveal.vue'), 'utf-8')

  /** 生成器能产出的全部品阶名:rollLinggen 的混沌支 + gradeName 的七个分支 */
  function producedNames(): string[] {
    const names = new Set<string>()
    // 混沌灵根那条早退分支
    for (const m of SRC.matchAll(/gradeName: '([^']+)'/g)) names.add(m[1]!)
    // gradeName() 里的所有字面量
    const from = SRC.indexOf('function gradeName')
    const body = SRC.slice(from, SRC.indexOf('\nfunction ', from + 1))
    for (const m of body.matchAll(/'([\u4e00-\u9fa5]+灵根)'/g)) names.add(m[1]!)
    return [...names]
  }

  /** 鉴定动画的品阶全集 */
  function revealedNames(): string[] {
    const start = VUE.indexOf('const GRADES')
    const arr = VUE.slice(start, VUE.indexOf('\n  ]', start))
    return [...arr.matchAll(/name: '([^']+)'/g)].map(m => m[1]!)
  }

  it('两边都读到了东西(防空转)', () => {
    expect(producedNames().length, '生成器一个品阶名都没抽到').toBeGreaterThan(3)
    expect(revealedNames().length, '动画一个品阶名都没抽到').toBeGreaterThan(3)
  })

  it('生成器产出的每一档,动画都有', () => {
    const shown = new Set(revealedNames())
    const missing = producedNames().filter(n => !shown.has(n))
    expect(missing, `这些品阶生成得出来、动画却闪不到:${missing.join('、')}`).toEqual([])
  })

  it('动画里的每一档,生成器都真的产出', () => {
    const produced = new Set(producedNames())
    const phantom = revealedNames().filter(n => !produced.has(n))
    expect(phantom, `动画里有生成器从不产出的品阶:${phantom.join('、')}`).toEqual([])
  })

  it('集合对得上(不是靠一边空集蒙混)', () => {
    expect([...producedNames()].sort()).toEqual([...revealedNames()].sort())
  })
})

/**
 * 读档守卫:修行倍率必须有上界。
 *
 * `toFixed(2)` 在 1e21 起改用**科学计数法** —— 坏档写 `growthMult: 1e300` 时,
 * 角色页那一格印出「×1e+300」(真浏览器实测),而它不是 NaN/Infinity,
 * 原来的 `Number.isFinite(v) && v > 0` 拦不住它。
 *
 * 上界取生成器的理论最大:混沌灵根 1.6 ×(100/60)× 1.5 = 4.0;
 * 普通单根带特殊 (100/60)× 1.6 × 1.2 = 3.2。留一档余量到 5。
 */
describe('灵根读档 · 修行倍率的上界', () => {
  const withMult = (v: unknown) =>
    sanitizeLinggen({ roots: [{ element: 'fire', aptitude: 80 }], gradeName: '天灵根', growthMult: v })

  it('大于上界的有限值被夹到上界', () => {
    for (const v of [1e300, 1e21, 5.0001, 1e9]) {
      expect(withMult(v)?.growthMult, `${v} 没被夹住`).toBe(GROWTH_MULT_MAX)
    }
  })

  it('上界之内原样保留', () => {
    for (const v of [1, 2.5, 3.2, 4, GROWTH_MULT_MAX]) {
      expect(withMult(v)?.growthMult, `${v} 被误改`).toBe(v)
    }
  })

  it('非有限 / 非正仍归 1', () => {
    for (const v of [NaN, Infinity, -5, 0, null, undefined, 'x']) {
      expect(withMult(v)?.growthMult, `${String(v)} 没归 1`).toBe(1)
    }
  })

  it('上界本身要能被 toFixed 正常显示,不能进科学计数法', () => {
    // 1e21 是 toFixed 改用科学计数法的门槛 —— 上界必须远低于它
    expect(GROWTH_MULT_MAX, '上界太高,toFixed(2) 会印出 1e+21 这种').toBeLessThan(1e21)
    expect(GROWTH_MULT_MAX.toFixed(2)).toBe('5.00')
  })

  it('上界覆盖得住生成器真实掷出的最大值', () => {
    // 混沌灵根:1.6 ×(100/60)× 1.5 = 4.0;普通单根特殊:3.2
    expect(GROWTH_MULT_MAX, '上界小于混沌灵根的 4.0,正常档会被夹').toBeGreaterThanOrEqual(4)
  })
})
