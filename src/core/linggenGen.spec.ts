import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mulberry32, RandomService } from '@/utils/random'
import { rollLinggen } from './linggenGen'

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
