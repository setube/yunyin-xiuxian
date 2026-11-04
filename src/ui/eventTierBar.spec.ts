/**
 * 历练三档的分布条。
 *
 * 历练页原写三句独立的话(「际遇 · 约每 2 程一次 / 奇缘 · 约每 240 程一次 / …」),
 * 想比出哪档更常见,得先把三个数在脑子里排一下。
 * 而 core 的 tierChances 早算好了三档概率,那个函数至今没有任何界面读过。
 *
 * 判据:
 *   一 段长按三档之和归一,不按绝对概率 —— 否则整条九成是空的。
 *   二 段首尾相连、无空隙、合为一 —— 分段条的基本要求。
 *   三 全零时等分,不留一根空槽。
 *   四 稀度说法只在真差得多时才说「稀 N 倍」。
 *   五 概率取 core 原值,本层不另算。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EventTier } from '@/core/eventTier'
import { EVENT_TIERS, tierChances } from '@/core/eventTier'
import { dominantTier, rarityRatio, tierSegments } from './eventTierBar'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/AdventureView.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/eventTierBar.ts'), 'utf-8')

const chances = (o: Partial<Record<EventTier, number>>): Record<EventTier, number> => ({
  jingyu: 0,
  jiyuan: 0,
  qiyuan: 0,
  ...o
})

describe('三档分布条 · 一、按三档之和归一', () => {
  it('段长加起来恰好为一', () => {
    const segs = tierSegments(chances({ jingyu: 0.8, jiyuan: 0.15, qiyuan: 0.05 }))
    expect(segs.reduce((a, s) => a + s.length, 0)).toBeCloseTo(1, 10)
  })

  it('绝对概率全都很小也照样铺满 —— 不按绝对概率画', () => {
    // 真实量级:三档之和约 0.09
    const real = tierChances(false)
    const segs = tierSegments(real)
    expect(segs.reduce((a, s) => a + s.length, 0)).toBeCloseTo(1, 10)
    // 若按绝对概率画,最长那段也只有一成不到
    expect(Math.max(...segs.map(s => s.length))).toBeGreaterThan(0.5)
  })

  it('概率越大段越长', () => {
    const segs = tierSegments(chances({ jingyu: 0.9, jiyuan: 0.08, qiyuan: 0.02 }))
    const byId = Object.fromEntries(segs.map(s => [s.id, s.length]))
    expect(byId.jingyu!).toBeGreaterThan(byId.jiyuan!)
    expect(byId.jiyuan!).toBeGreaterThan(byId.qiyuan!)
  })

  it('原值原样带出,供文案用', () => {
    const segs = tierSegments(chances({ jingyu: 0.5, jiyuan: 0.3, qiyuan: 0.2 }))
    expect(segs.find(s => s.id === 'jingyu')!.chance).toBe(0.5)
  })
})

describe('三档分布条 · 二、段首尾相连', () => {
  it('每段的起点等于前一段的终点', () => {
    const segs = tierSegments(chances({ jingyu: 0.7, jiyuan: 0.2, qiyuan: 0.1 }))
    let cursor = 0
    for (const s of segs) {
      expect(s.start).toBeCloseTo(cursor, 10)
      cursor += s.length
    }
    expect(cursor).toBeCloseTo(1, 10)
  })

  it('按稀度排:常见在前', () => {
    const segs = tierSegments(chances({ jingyu: 0.7, jiyuan: 0.2, qiyuan: 0.1 }))
    const order = segs.map(s => s.id)
    // 数据层的 rarity:际遇 0 < 奇缘 1 < 机缘 2
    expect(order).toEqual(['jingyu', 'qiyuan', 'jiyuan'])
  })

  it('三档一档不落', () => {
    const segs = tierSegments(tierChances(false))
    expect(segs).toHaveLength(EVENT_TIERS.length)
    expect(new Set(segs.map(s => s.id)).size).toBe(EVENT_TIERS.length)
  })
})

describe('三档分布条 · 三、全零时等分', () => {
  it('没出事过也画得出形,不留空槽', () => {
    const segs = tierSegments(chances({}))
    expect(segs.reduce((a, s) => a + s.length, 0)).toBeCloseTo(1, 10)
    for (const s of segs) expect(s.length).toBeCloseTo(1 / 3, 10)
  })

  it('坏值当零处理,不产出 NaN', () => {
    const segs = tierSegments(chances({ jingyu: Number.NaN, jiyuan: 1, qiyuan: -5 }))
    for (const s of segs) {
      expect(Number.isFinite(s.length)).toBe(true)
      expect(s.length).toBeGreaterThanOrEqual(0)
    }
    expect(segs.reduce((a, s) => a + s.length, 0)).toBeCloseTo(1, 10)
  })
})

describe('三档分布条 · 四、稀度说法', () => {
  it('常见那档自身不报稀度', () => {
    const segs = tierSegments(chances({ jingyu: 0.9, jiyuan: 0.08, qiyuan: 0.02 }))
    const base = dominantTier(segs)!
    expect(rarityRatio(base, base)).toBe('')
  })

  it('差得多才说「稀 N 倍」', () => {
    const segs = tierSegments(chances({ jingyu: 0.9, jiyuan: 0.09, qiyuan: 0.01 }))
    const base = dominantTier(segs)!
    const rare = segs.find(s => s.id === 'qiyuan')!
    expect(rarityRatio(rare, base)).toBe('稀 90 倍')
  })

  it('差得不多就说「相当」,不夸大成倍', () => {
    const segs = tierSegments(chances({ jingyu: 0.4, jiyuan: 0.35, qiyuan: 0.25 }))
    const base = dominantTier(segs)!
    const near = segs.find(s => s.id === 'jiyuan')!
    expect(rarityRatio(near, base)).toBe('相当')
  })

  it('概率为零说「暂无」', () => {
    const segs = tierSegments(chances({ jingyu: 1, jiyuan: 0, qiyuan: 0 }))
    const base = dominantTier(segs)!
    const zero = segs.find(s => s.id === 'qiyuan')!
    expect(rarityRatio(zero, base)).toBe('暂无')
  })

  it('最常见那档就是最长那段', () => {
    const segs = tierSegments(chances({ jingyu: 0.2, jiyuan: 0.7, qiyuan: 0.1 }))
    expect(dominantTier(segs)!.id).toBe('jiyuan')
  })

  it('空表给 null', () => {
    expect(dominantTier([])).toBeNull()
  })
})

describe('三档分布条 · 五、取 core 的原值', () => {
  it('本层不自己算概率', () => {
    // 概率的三元拆分在 core:出事 → 奇缘 → 机缘 → 其余际遇
    expect(MODULE, '不该在本层重算概率').not.toContain('EXPLORE_EVENT_CHANCE')
    expect(MODULE, '不该在本层重算概率').not.toContain('FORTUNE_CHANCE')
    expect(MODULE, '概率须由调用方从 core 传入').toContain('chances: Record<EventTier, number>')
  })

  it('历练页接上了分布条', () => {
    expect(VIEW).toContain('tierSegments')
    expect(VIEW, '该有一根条').toContain('tier-bar')
    expect(VIEW, '该把稀度说出来').toContain('rarityRatio')
  })

  it('界面不再只给三句独立的话 —— 三档的相对关系要看得见', () => {
    expect(VIEW, '三档原先只拼成四个 chip').toContain('tierSegments(')
  })
})
