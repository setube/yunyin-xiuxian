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

/**
 * 资质下限(转世宿慧带来)再大也越不过 growthMult 的上界。
 *
 * `aptitudeFloorNow` 是 `Math.max(byCount, byInsight)` —— **没有上界**,
 * 坏档把宿慧写成极大值时它也跟着极大,直接喂进 `rollLinggen`。
 *
 * 这里钉住:生成器内部对资质做了 `Math.min(100, …)` 的钳制,
 * 所以不论下限多大,掷出来的生长倍率都不会越过 GROWTH_MULT_MAX。
 * 这条不是「顺手加的」—— 它证明了**只有读档那条路**需要上界,
 * 生成路径本身是收得住的。
 */
describe('灵根生成 · 极大资质下限也越不过上界', () => {
  /*
   * 判据必须先证明「下限确实被用上了」,再证明「用上了也越不过上限」。
   *
   * 只断言「倍率 ≤ 4」是不够的:若哪天 `rollLinggen` 干脆**忽略** aptitudeFloor,
   * 倍率同样 ≤ 4,判据照样绿 —— 而那时「下行给资质兜底」这个功能已经坏了。
   * 故用同一个种子跑两遍(下限 0 与下限 1e6),要求后者掷出的资质**整体更高**。
   */
  it('资质下限真的抬高资质(否则下面的上限判据是空转)', () => {
    const floor0 = Array.from({ length: 200 }, () => 0)
    const rngA = new RandomService(mulberry32(7))
    const rngB = new RandomService(mulberry32(7))
    const aptOf = (rng: RandomService, floor: number): number[] =>
      floor0.map(() => {
        const p = rollLinggen(rng, floor)
        return p.roots.reduce((sum, r) => sum + r.aptitude, 0) / p.roots.length
      })
    const low = aptOf(rngA, 0)
    const high = aptOf(rngB, 1e6)
    const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(high), '极大下限没把资质抬高 —— 下限被忽略了,下面那条上限判据就证明不了任何事').toBeGreaterThan(
      avg(low) + 10
    )
    // 且一条都不许越过 100 的钳制
    expect(Math.max(...high), '资质越过了 100').toBeLessThanOrEqual(100)
  })

  it('资质下限被钳到 100,倍率封顶在 4.0', () => {
    const rng = new RandomService(mulberry32(7))
    let max = 0
    for (let i = 0; i < 500; i += 1) {
      const p = rollLinggen(rng, 1e6)
      max = Math.max(max, p.growthMult)
    }
    expect(max, '极大下限掷出的倍率越过了生成器的理论上限').toBeLessThanOrEqual(4)
    expect(max, '一次都没掷到高位,判据没跑到东西').toBeGreaterThan(2)
  })

  it('该值仍在 GROWTH_MULT_MAX 之内 —— 生成路径不需要读档守卫兜', () => {
    const rng = new RandomService(mulberry32(11))
    for (let i = 0; i < 200; i += 1) {
      expect(rollLinggen(rng, 1e6).growthMult).toBeLessThanOrEqual(GROWTH_MULT_MAX)
    }
  })
})
