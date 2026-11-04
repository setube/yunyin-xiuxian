/**
 * 胜率档位:曾经两处各写一份,现已合并到 ui/rateRank。
 *
 * 历史:compare.ts 与 lab.ts 各写了一份逐字相同的 RANK_TEXT 与阈值链,
 * expedition.ts 又内联了一遍三元链。当时的守卫本文件只要求「别漂移」,
 * 因为重构会牵动调用点;现在三处都已改走同一份实现,本文件改为钉住那次合并 ——
 * 合并的价值不在「少写几行」,在于「改阈值时三处必然一起动」。
 *
 * 判据:
 *   一 三处都不再有本地阈值链或文案表 —— 合并不许回退。
 *   二 三处都确实 import 了 ui/rateRank。
 *   三 合并只动位置不动措辞:五档说法逐项与历史一致。
 *   四 结构未改坏:四道线切五档、线严格递增、最低档兜底。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rateLabels, rateRank, rateText } from '@/ui/rateRank'

const src = (f: string): string =>
  readFileSync(resolve(__dirname, f), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

const COMPARE = src('compare.ts')
const LAB = src('lab.ts')
const EXPEDITION = src('expedition.ts')

const SITES = [
  [COMPARE, 'compare.ts'],
  [LAB, 'lab.ts'],
  [EXPEDITION, 'expedition.ts']
] as const

describe('胜率档位 · 合并已落地,不许回退', () => {
  it('三处都没有本地的 RANK_TEXT 数组了', () => {
    for (const [code, name] of SITES) {
      expect(code, `${name}又写回了 RANK_TEXT`).not.toMatch(/RANK_TEXT\s*=\s*\[/)
    }
  })

  it('三处都没有本地的阈值链了', () => {
    // 只查五档那条链的第一道线:0.85 是它独有的标志。
    // 0.6 不行 —— expedition 另有一条「天机胜算」的四档文案(0.9/0.6/0.35),
    // 那是**另一件事**(预演给玩家看的措辞),不是这里的五档,不该被这条判据波及。
    for (const [code, name] of SITES) {
      expect(code, `${name}又写回了 >= 0.85 ? … 这条链`).not.toMatch(/>=\s*0\.85\s*\?/)
      expect(code, `${name}又写回了四道线的组合`).not.toMatch(/>=\s*0\.4\s*\?\s*\d/) 
    }
  })

  it('三处都确实 import 了 ui/rateRank', () => {
    for (const [code, name] of SITES) {
      expect(code, `${name}没接上 ui/rateRank`).toMatch(/from ['"]@\/ui\/rateRank['"]/)
    }
  })

  it('compare.ts 仍导出 rateText(调用点不变)', () => {
    expect(COMPARE, 'compare.ts 该保留同名导出').toContain('rateText')
    expect(rateText(1)).toBe('稳操胜券')
  })
})

describe('胜率档位 · 合并只动位置不动行为', () => {
  it('五档说法逐项与历史一致', () => {
    expect([...rateLabels()]).toEqual(['九死一生', '凶险', '胜负各半', '略占上风', '稳操胜券'])
  })

  it('四道线切出五档,且线严格递增', () => {
    const jumps: number[] = []
    let prev = rateRank(0)
    for (let i = 0; i <= 1000; i++) {
      const r = i / 1000
      const now = rateRank(r)
      if (now !== prev) jumps.push(r)
      prev = now
    }
    expect(jumps, '四道线').toHaveLength(4)
    expect(rateLabels().length, '五档 = 四线 + 兜底').toBe(jumps.length + 1)
    for (let i = 1; i < jumps.length; i++) {
      expect(jumps[i]!, '档位线的顺序反了,三目链会短路').toBeGreaterThan(jumps[i - 1]!)
    }
  })

  it('四道线就是历史那四个数', () => {
    // 从档位跳变反推出的线,逐一等于 0.15 / 0.4 / 0.6 / 0.85(容差取步长)
    const jumps: number[] = []
    let prev = rateRank(0)
    for (let i = 0; i <= 1000; i++) {
      const r = i / 1000
      const now = rateRank(r)
      if (now !== prev) jumps.push(r)
      prev = now
    }
    const expected = [0.15, 0.4, 0.6, 0.85]
    for (const [i, line] of expected.entries()) {
      expect(Math.abs(jumps[i]! - line), `第 ${i + 1} 道线该是 ${line}`).toBeLessThanOrEqual(0.001)
    }
  })
})
