/**
 * 天劫波次形制。
 *
 * 渡劫弹窗原先只有一串同形灰字:「第 N 道天雷落下,你咬牙硬撼,气血余 X%。」
 * 二十道雷就是二十行,哪一道最险、从第几道开始吃紧,只能逐行读百分数自己比。
 *
 * 四条判据:
 *   一 只认战报原文里的数字,不从别处推算 —— 柱与字必须同源。
 *   二 坠地那一格是真实的一格(归零),不是「余血很少」。
 *   三 顶端取本场最险的那道:以 100% 为顶会让开头几道挤成等高柱。
 *   四 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tribBarPct, tribPeak, tribWaves, tribWorst, TRIB_DANGER_PCT } from './tribWave'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/cultivation/BreakthroughResultDialog.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const CORE = readFileSync(resolve(ROOT, 'src/core/breakthrough.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

/** 造一行「活下来」的天雷战报 */
function wave(n: number, pct: number): string {
  return `第 ${n} 道天雷落下,你咬牙硬撼,气血余 ${pct}%。`
}
/** 造一行「坠地」的天雷战报 */
function fell(n: number): string {
  return `第 ${n} 道天雷轰然落下,你护体灵光崩碎,重伤坠地。`
}

describe('天劫波次 · 一、只认战报原文', () => {
  it('按道次解出余血,顺序按第几道排', () => {
    const w = tribWaves([wave(1, 88), wave(2, 61), wave(3, 34)])
    expect(w.map(x => x.index)).toEqual([1, 2, 3])
    expect(w.map(x => x.hpPct)).toEqual([0.88, 0.61, 0.34])
  })

  it('乱序的战报也按道次排 —— 柱子顺序即真实顺序', () => {
    const w = tribWaves([wave(3, 34), wave(1, 88), wave(2, 61)])
    expect(w.map(x => x.index)).toEqual([1, 2, 3])
  })

  it('叙述行(引劫 / 灵根相应 / 渡劫已成)不算波次', () => {
    const w = tribWaves([
      '乌云压顶,筑基劫将至。青雷之劫,共 4 道。',
      '你体内灵根与此劫气机相应。',
      wave(1, 90),
      wave(2, 40),
      '雷云散尽,你于劫灰中立起,渡劫已成。'
    ])
    expect(w).toHaveLength(2)
  })

  it('不调用别的数:战报里没写余血的行,不凭空补一格', () => {
    const w = tribWaves(['第 1 道天雷落下,你咬牙硬撼。'])
    expect(w).toHaveLength(0)
  })

  it('坏值不 produce 出 NaN 高度', () => {
    for (const bad of ['', '第 道天雷', '第 x 道天雷,气血余 abc%', null, undefined]) {
      expect(() => tribWaves([bad as string])).not.toThrow()
      expect(tribWaves([bad as string])).toHaveLength(0)
    }
  })
})

describe('天劫波次 · 二、坠地是真实的一格', () => {
  it('坠地那道记成余血归零', () => {
    const w = tribWaves([wave(1, 80), fell(2)])
    expect(w).toHaveLength(2)
    expect(w[1]!.hpPct).toBe(0)
    expect(w[1]!.index).toBe(2)
  })

  it('坠地那道不算「最险一道」—— 它是到此为止,不是余血很少', () => {
    const w = tribWaves([wave(1, 80), wave(2, 35), fell(3)])
    const worst = tribWorst(w)
    expect(worst?.index).toBe(2)
    expect(worst?.hpPct).toBeCloseTo(0.35, 6)
  })

  it('全为归零时没有「最险一道」可说', () => {
    expect(tribWorst(tribWaves([fell(1)]))).toBeNull()
    expect(tribWorst([])).toBeNull()
  })
})

describe('天劫波次 · 三、柱高以最险的那道为满格', () => {
  it('顶端取本场最高余血,不是写死的 100%', () => {
    // 若以 1.0 为顶,88/85/84 会挤成三根几乎等高的柱
    const w = tribWaves([wave(1, 88), wave(2, 85), wave(3, 84)])
    const peak = tribPeak(w)
    expect(peak).toBeCloseTo(0.88, 6)
    expect(tribBarPct(w[0]!, peak)).toBe(100)
    expect(tribBarPct(w[2]!, peak)).toBeCloseTo((84 / 88) * 100, 4)
  })

  it('先高后低时落差读得出来 —— 这正是渡劫的形状', () => {
    const w = tribWaves([wave(1, 95), wave(2, 50), wave(3, 20)])
    const peak = tribPeak(w)
    const [a, b, c] = w.map(x => tribBarPct(x, peak))
    expect(a!).toBeGreaterThan(b!)
    expect(b!).toBeGreaterThan(c!)
  })

  it('空战报不除零;高度恒在 0~100', () => {
    expect(tribPeak([])).toBe(1)
    expect(tribBarPct({ index: 1, hpPct: 0.5 }, 0)).toBeLessThanOrEqual(100)
    for (const p of [-1, 0, 0.5, 1, 2]) {
      const v = tribBarPct({ index: 1, hpPct: p }, 1)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('危险线只标真到危境的那几道', () => {
    expect(TRIB_DANGER_PCT).toBeCloseTo(0.3, 6)
    const w = tribWaves([wave(1, 90), wave(2, 29), wave(3, 31)])
    expect(w.filter(x => x.hpPct < TRIB_DANGER_PCT).map(x => x.index)).toEqual([2])
  })
})

describe('天劫波次 · 四、界面接上了', () => {
  it('弹窗读的是波次柱,并给出最险一道的读数', () => {
    expect(DIALOG, '弹窗没有接 tribWaves').toContain('tribWaves(')
    expect(DIALOG, '弹窗没有渲染柱子').toContain('trib-wave')
    expect(DIALOG, '弹窗没有报最险一道').toContain('tribWorst(')
    // 柱子对读屏是无意义的,须给整组的说明
    expect(DIALOG, '波次柱没有读屏说明').toContain('天劫共')
  })

  it('波次柱的 CSS 存在且不吃指针事件', () => {
    expect(block('.trib-waves'), '.trib-waves 缺 pointer-events: none').toContain('pointer-events: none')
    expect(block('.trib-wave')).toContain('align-self: flex-end')
    expect(block('.trib-wave--fallen')).toContain('background: transparent')
  })

  it('波次柱只取既有语义 token', () => {
    const from = CSS.indexOf('.trib-waves')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  it('战报原文的写法与解析正则同源 —— 改文案而没改正则,柱子会静默消失', () => {
    // 核心逻辑里必须还能产出这两种句式
    expect(CORE, '核心不再写「气血余 X%」,解析正则已经对不上').toMatch(/气血余 \$\{/)
    expect(CORE, '核心不再写「重伤坠地」').toContain('重伤坠地')
    // 用核心那两句模板当场造一段战报,再喂回解析器:文案与正则一旦分家,这条立刻红
    const made: string[] = ['乌云压顶,筑基劫将至。青雷之劫,共 3 道。']
    for (const pct of [90, 55, 12]) made.push(`第 ${made.length} 道天雷落下,你咬牙硬撼,气血余 ${pct}%。`)
    const w = tribWaves(made)
    expect(w, '按核心模板造的战报解不出波次').toHaveLength(3)
    expect(w.map(x => x.hpPct)).toEqual([0.9, 0.55, 0.12])
  })
})
