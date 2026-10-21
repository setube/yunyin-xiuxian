/* eslint-disable no-console -- 卦象与卦力是过程性验收,打印摇卦轨迹 */
/**
 * 问卦验收(Phase 34.3)
 *
 * 界域志里的「周易」原先只写着"未实装"。本轮把它接成一条真链路:
 *
 *   摇卦(三钱六爻)→ 本卦与之卦(八八相叠)→ 卦力(下卦为己、上卦为境)
 *   → 并入最终属性 → 时限一到自散
 *
 * 三条不变量必须成立,否则就是又一个"看得见拿不到":
 *   一 六十四卦是八八之全(不多不少,不重不漏);
 *   二 卦力由上下卦推出,不手写 64 套数值(手写必与卦义打架);
 *   三 卦真的进了 finalStats —— 不是只在界面上画了个卦。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { RandomService, mulberry32 } from '@/utils/random'
import { HEXAGRAMS, TRIGRAMS, hexagramOf, trigramOfLines } from '@/data/yijing'
import {
  CHANGING_TIERS,
  DIVINATION_COST,
  castLines,
  drawLines,
  drawHexagram,
  readingCounsel,
  readingFromState,
  readingMinutes,
  readingMods,
  readingOfLines
} from './divination'
import { askDivination } from './divinationService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useGameStore } from '@/stores/game'

const seeded = (seed = 20260912) => new RandomService(mulberry32(seed))

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('六十四卦 · 八八之全', () => {
  it('八八六十四卦,每一对上下卦恰好出现一次(不重不漏)', () => {
    expect(HEXAGRAMS.length).toBe(64)
    const seen = new Set<string>()
    for (const x of HEXAGRAMS) seen.add(`${x.upper}/${x.lower}`)
    const expected = new Set<string>()
    for (const u of TRIGRAMS) for (const l of TRIGRAMS) expected.add(`${u.id}/${l.id}`)
    expect([...seen].sort()).toEqual([...expected].sort())
  })

  it('卦名不重复,卦序 1~64 不缺号', () => {
    expect(new Set(HEXAGRAMS.map(x => x.name)).size).toBe(64)
    expect(HEXAGRAMS.map(x => x.order)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1))
  })

  it('每卦都有卦辞大意,且不只写一个卦名', () => {
    for (const x of HEXAGRAMS) expect(x.gist.length, `${x.name} 缺大意`).toBeGreaterThan(6)
  })

  it('上下卦相叠取卦:查得到每一卦', () => {
    for (const x of HEXAGRAMS) {
      expect(hexagramOf(x.upper, x.lower)?.name).toBe(x.name)
    }
    expect(hexagramOf('qian', 'kun')?.name).toBe('否')
    expect(hexagramOf('kun', 'qian')?.name).toBe('泰')
  })
})

describe('八卦 · 爻与象', () => {
  it('三爻取象覆盖全部八种爻形', () => {
    const shapes = new Set<string>()
    for (let a = 0; a < 2; a += 1)
      for (let b = 0; b < 2; b += 1)
        for (let c = 0; c < 2; c += 1) {
          const t = trigramOfLines([a, b, c])
          expect(t, `爻形 ${a}${b}${c} 无对应单卦`).toBeDefined()
          shapes.add(t!.id)
        }
    expect(shapes.size).toBe(8)
  })

  it('乾三阳、坤三阴 —— 爻序自下而上', () => {
    expect(trigramOfLines([1, 1, 1])?.id).toBe('qian')
    expect(trigramOfLines([0, 0, 0])?.id).toBe('kun')
    expect(trigramOfLines([1, 0, 0])?.id).toBe('zhen')
    expect(trigramOfLines([0, 0, 1])?.id).toBe('gen')
  })

  it('每个单卦都有象、性、宜、忌与可用通道', () => {
    for (const t of TRIGRAMS) {
      expect(t.image.length).toBeGreaterThan(0)
      expect(t.nature.length).toBeGreaterThan(0)
      expect(t.good.length).toBeGreaterThan(0)
      expect(t.bad.length).toBeGreaterThan(0)
      expect(Object.keys(t.mods).length, `${t.name} 无可用通道`).toBeGreaterThan(0)
    }
  })
})

describe('摇卦 · 三钱六爻', () => {
  it('同一种子必得同一卦(可复现)', () => {
    const a = drawHexagram(seeded(7))
    const b = drawHexagram(seeded(7))
    expect(b.hexagram.name).toBe(a.hexagram.name)
    expect(b.lines).toEqual(a.lines)
    expect(b.changingAt).toEqual(a.changingAt)
  })

  it('六爻只有阴阳两值,动爻位置在 1~6 之间', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const { lines, changingAt } = castLines(seeded(seed))
      expect(lines.length).toBe(6)
      for (const v of lines) expect([0, 1]).toContain(v)
      for (const at of changingAt) expect(at).toBeGreaterThanOrEqual(1)
      for (const at of changingAt) expect(at).toBeLessThanOrEqual(6)
    }
  })

  it('下三爻为内卦,上三爻为外卦', () => {
    // 下乾(111) 上坤(000) → 地天泰
    const reading = readingOfLines([1, 1, 1, 0, 0, 0], [])!
    expect(reading.lower.id).toBe('qian')
    expect(reading.upper.id).toBe('kun')
    expect(reading.hexagram.name).toBe('泰')
  })

  it('动爻反向即成之卦;六爻不动则无之卦', () => {
    const still = readingOfLines([1, 1, 1, 0, 0, 0], [])!
    expect(still.changed).toBeNull()
    const moved = readingOfLines([1, 1, 1, 0, 0, 0], [1])!
    expect(moved.changed?.name).toBe('升') // 泰之初爻动,成地风升
  })
})

describe('卦力 · 由上下卦推出', () => {
  it('一卦之力 = 下卦(己身)+ 上卦(境遇),按动爻数换挡', () => {
    const reading = readingOfLines([1, 1, 1, 0, 0, 0], [])! // 静卦
    const mods = readingMods(reading)
    expect(mods.breakthroughRate).toBeCloseTo((reading.lower.mods.breakthroughRate ?? 0) + (reading.upper.mods.breakthroughRate ?? 0), 6)
    expect(mods.maxHpPct).toBeCloseTo((reading.lower.mods.maxHpPct ?? 0) + (reading.upper.mods.maxHpPct ?? 0), 6)
  })

  it('动得越多,卦力越盛而时限越短(单调)', () => {
    for (let i = 1; i < CHANGING_TIERS.length; i += 1) {
      expect(CHANGING_TIERS[i]!.power).toBeGreaterThan(CHANGING_TIERS[i - 1]!.power)
      expect(CHANGING_TIERS[i]!.minutes).toBeLessThan(CHANGING_TIERS[i - 1]!.minutes)
    }
    const still = readingOfLines([1, 1, 1, 1, 1, 1], [])!
    const moved = readingOfLines([1, 1, 1, 1, 1, 1], [1, 2, 3])!
    expect(readingMods(moved).breakthroughRate!).toBeGreaterThan(readingMods(still).breakthroughRate!)
    expect(readingMinutes(moved)).toBeLessThan(readingMinutes(still))
  })

  it('卦象白话把内外与动爻都说明白', () => {
    const reading = readingOfLines([1, 1, 1, 0, 0, 0], [2])!
    const lines = readingCounsel(reading)
    expect(lines.length).toBeGreaterThanOrEqual(4)
    expect(lines.join()).toContain('内卦')
    expect(lines.join()).toContain('外卦')
    console.log(`\n${reading.hexagram.name}之${reading.changed?.name}:${lines.join(' ')}`)
  })

  it('存档复原:由爻与动爻重算出同一卦', () => {
    const reading = readingOfLines([0, 1, 0, 1, 0, 0], [4])!
    const back = readingFromState({
      upper: reading.upper.id,
      lower: reading.lower.id,
      changing: reading.changing,
      changingAt: reading.changingAt,
      lines: reading.lines
    })!
    expect(back.hexagram.name).toBe(reading.hexagram.name)
    expect(back.changed?.name).toBe(reading.changed?.name)
  })

  it('卦画:六爻自下而上,动爻另标', () => {
    const reading = readingOfLines([1, 0, 1, 0, 1, 0], [2, 5])!
    const drawn = drawLines(reading)
    expect(drawn.length).toBe(6)
    expect(drawn[1]).toContain('动')
    expect(drawn[4]).toContain('动')
    expect(drawn[0]).not.toContain('动')
  })
})

describe('问卦 · 真的进了属性汇总', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function withWudao(n: number): void {
    const resources = useResourcesStore()
    resources.addSmall('wudao', n)
  }

  it('悟道点不足则不受卦,也不扣', () => {
    const resources = useResourcesStore()
    const out = askDivination(seeded())
    expect(out.ok).toBe(false)
    expect(resources.wudao).toBe(0)
  })

  it('成卦:扣悟道点、卦在身、卦力入 finalStats', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    const player = usePlayerStore()
    const resources = useResourcesStore()
    withWudao(DIVINATION_COST)
    const out = askDivination(seeded(11))
    expect(out.ok).toBe(true)
    expect(resources.wudao).toBe(0)
    expect(player.activeDivination?.hexagram).toBe(out.reading!.hexagram.name)
    // 卦力真的进了最终属性(挑一个该卦必有的通道)
    const keys = Object.keys(readingMods(out.reading!)) as (keyof typeof player.finalStats.mods)[]
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) expect(player.finalStats.mods[k] ?? 0).not.toBe(0)
  })

  it('一事不二卜:卦未过不再受卦', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    withWudao(DIVINATION_COST * 3)
    expect(askDivination(seeded(3)).ok).toBe(true)
    const again = askDivination(seeded(4))
    expect(again.ok).toBe(false)
    expect(again.reason).toContain('一事不二卜')
    expect(useResourcesStore().wudao).toBe(DIVINATION_COST * 2)
  })

  it('时限一到,卦自散,finalStats 复原', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    withWudao(DIVINATION_COST)
    const out = askDivination(seeded(5))
    const player = usePlayerStore()
    const before = JSON.stringify(player.finalStats.mods)
    expect(before).not.toBe(JSON.stringify({}))
    vi.setSystemTime(1_700_000_000_000 + readingMinutes(out.reading!) * 60_000 + 1)
    // 引擎心跳:卦的过期判定挂在修行时长上,须由心跳带出来(而非只在界面上碰巧重算)
    useGameStore().addPlayTime(1)
    expect(player.activeDivination).toBeNull()
    expect(player.divinationMods).toEqual({})
  })

  it('卦已到期但修行心跳尚未推进,也能立刻再问一卦', () => {
    vi.useFakeTimers()
    const t0 = 1_700_000_000_000
    vi.setSystemTime(t0)
    withWudao(DIVINATION_COST * 2)
    const first = askDivination(seeded(13))
    expect(first.ok).toBe(true)
    // 先读一次派生值,把「卦在身」这个 computed 结果缓存下来;
    // 旧实现随后只让游戏时钟走过有效期、不推进 totalPlaySec,就会继续读到旧的 true。
    expect(usePlayerStore().activeDivination).not.toBeNull()

    // 只让游戏时钟走过有效期,不调用 addPlayTime:
    // 旧实现读 activeDivination 的缓存,会在这段 5 秒心跳间隙继续拒绝问卦。
    vi.setSystemTime(t0 + readingMinutes(first.reading!) * 60_000 + 1)
    const second = askDivination(seeded(14))
    expect(second.ok).toBe(true)
    expect(useResourcesStore().wudao).toBe(0)
    expect(usePlayerStore().divination?.hexagram).toBe(second.reading!.hexagram.name)
  })

  it('转世不留卦:卦是此一时的时机,不是我是谁', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    withWudao(DIVINATION_COST)
    askDivination(seeded(9))
    const player = usePlayerStore()
    expect(player.activeDivination).not.toBeNull()
    player.rebirth(player.linggen!)
    expect(player.divination).toBeNull()
    expect(player.divinationMods).toEqual({})
  })
})
