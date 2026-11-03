/**
 * 道果边际形制:递减是这条曲线的全部要义,而界面此前只写「边际渐减」四个字。
 *
 * 四条判据:
 *   一 算式只有一处来源:`effectiveDaoFruit`(即 n^DAO_FRUIT_SOFT_EXP)。本模块不重写它,
 *      改指数时边际曲线自动跟上。
 *   二 递减但永不为 0 —— 十枚之后向下一路读成 0 格就与实情相反了。
 *   三 刻度按「第 n 枚相对第一枚」的占比折算,第一枚满格。
 *   四 两处界面都真的接上了,且刻度有可念的说法。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DAO_FRUIT_SOFT_EXP } from '@/data/constants'
import { effectiveDaoFruit } from '@/core/statsCalc'
import { MARGIN_PIPS, marginCurve, marginCurvePoints, marginMark, marginPips, marginalShare } from './fruitMargin'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const FURNACE = readFileSync(resolve(ROOT, 'src/components/celestial/FurnaceDialog.vue'), 'utf-8')
const REBIRTH = readFileSync(resolve(ROOT, 'src/components/character/RebirthDialog.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/fruitMargin.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('道果边际 · 一、算式同源', () => {
  it('边际占比与 effectiveDaoFruit 逐位一致', () => {
    for (const n of [1, 2, 3, 5, 10, 40]) {
      const expected = ((effectiveDaoFruit(n) - effectiveDaoFruit(n - 1)) / effectiveDaoFruit(1)) * 100
      expect(marginalShare(n), `第 ${n} 枚`).toBeCloseTo(expected, 9)
    }
  })

  it('模块不自己写指数,直接读 effectiveDaoFruit', () => {
    expect(MODULE, '应引 effectiveDaoFruit').toContain('effectiveDaoFruit')
    // 指数只许出现在常量文件里;模块里若出现 0.9 这样的字面量,就是抄了一份
    expect(MODULE, '不该重写软上限指数').not.toMatch(/DAO_FRUIT_SOFT_EXP\s*=\s*0\.9/)
  })

  it('软上限指数仍 < 1 —— 递减的前提', () => {
    expect(DAO_FRUIT_SOFT_EXP).toBeLessThan(1)
    expect(DAO_FRUIT_SOFT_EXP).toBeGreaterThan(0)
  })
})

describe('道果边际 · 二、递减但永不为 0', () => {
  it('占比随枚数单调递减', () => {
    let prev = Infinity
    for (let n = 1; n <= 100; n += 1) {
      const share = marginalShare(n)
      expect(share, `第 ${n} 枚应低于上一枚`).toBeLessThan(prev)
      prev = share
    }
  })

  it('第一枚满格,之后逐格下滑', () => {
    expect(marginPips(1)).toBe(MARGIN_PIPS)
    expect(marginPips(2)).toBeLessThan(marginPips(1))
    expect(marginPips(10)).toBeLessThan(marginPips(2))
  })

  it('十枚之后仍有格,不读成 0 —— 向下取整会与「永不为 0」相反', () => {
    for (const n of [10, 30, 80, 500]) {
      expect(marginPips(n), `第 ${n} 枚至少留一格`).toBeGreaterThanOrEqual(1)
    }
  })

  it('还没有道果时为 0 格、空说法', () => {
    expect(marginPips(0)).toBe(0)
    expect(marginMark(0).label).toBe('')
    expect(marginalShare(0)).toBe(0)
  })

  it('坏值不抛错,按 0 处理', () => {
    for (const bad of [Number.NaN, -5, Number.NEGATIVE_INFINITY]) {
      expect(marginMark(bad).pips).toBe(0)
    }
  })
})

describe('道果边际 · 三、折线', () => {
  it('折线点数等于跨度,首点最高(第一枚最值力)', () => {
    const pts = marginCurve(0, 8)
    expect(pts.length).toBe(8)
    expect(pts[0]).toBeCloseTo(100, 6)
    for (let i = 1; i < pts.length; i += 1) expect(pts[i]!).toBeLessThan(pts[i - 1]!)
  })

  it('points 串的坐标落在 viewBox 之内', () => {
    const points = marginCurvePoints(0, 8, 100, 24)
    expect(points).not.toBe('')
    for (const pair of points.split(' ')) {
      const [x, y] = pair.split(',').map(Number)
      expect(x!).toBeGreaterThanOrEqual(0)
      expect(x!).toBeLessThanOrEqual(100)
      expect(y!).toBeGreaterThanOrEqual(0)
      expect(y!).toBeLessThanOrEqual(24)
    }
  })

  it('跨度 1 时不除零', () => {
    expect(marginCurvePoints(0, 1)).not.toContain('NaN')
  })

  it('纵向用相对量程 —— 四十枚之后台阶仍逐级可见,不糊在底边一条线', () => {
    // 绝对量程下这一段的最大最小都接近 0,所有 y 会挤在底边几个像素里(实测看不出来)
    const points = marginCurvePoints(40, 8, 100, 24)
    const ys = points.split(' ').map(pair => Number(pair.split(',')[1]))
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    expect(maxY - minY, '这一段台阶应占满可用高度').toBeGreaterThan(10)
    expect(minY, '顶部留边').toBeGreaterThanOrEqual(0)
    expect(maxY, '底部留边').toBeLessThanOrEqual(24)
  })

  it('一段里曲线是平的,给居中直线 —— 不假装有跌幅', () => {
    const flat = marginCurvePoints(1, 1, 100, 24)
    expect(flat).not.toContain('NaN')
    const ys = flat.split(' ').map(pair => Number(pair.split(',')[1]))
    expect(new Set(ys).size, '只有一条水平线').toBe(1)
    expect(ys[0]).toBe(12)
  })
})

describe('道果边际 · 四、界面接上了', () => {
  it('熔炉:刻度 + 折线,说法带「六格中几格」', () => {
    expect(FURNACE, '熔炉应挂刻度').toContain('fruit-pips')
    expect(FURNACE, '熔炉应挂折线').toContain('fruit-curve')
    expect(FURNACE, '刻度应有可念的说法').toContain('六格中')
    expect(FURNACE, '刻度应有 role="img" 才接得住可访问名').toMatch(/fruit-pips[\s\S]{0,200}role="img"/)
  })

  it('转世盘:同样挂刻度与折线', () => {
    expect(REBIRTH, '转世盘应挂刻度').toContain('fruit-pips')
    expect(REBIRTH, '转世盘应挂折线').toContain('fruit-curve')
  })

  it('折线只在已过前几枚时才画 —— 一两枚时曲线是平的,画出来只是占位', () => {
    for (const [src, name] of [
      [FURNACE, '熔炉'],
      [REBIRTH, '转世盘']
    ] as const) {
      expect(src, `${name}的折线应有显示条件`).toContain('v-if="showCurve"')
      expect(src, `${name}的折线阈值不该写死 1`).toContain('total >= 4')
    }
  })

  it('刻度与折线都不吃指针事件,且段数取 MARGIN_PIPS', () => {
    expect(block('.fruit-pips'), '.fruit-pips 须 pointer-events: none').toContain('pointer-events: none')
    expect(block('.fruit-curve'), '.fruit-curve 须 pointer-events: none').toContain('pointer-events: none')
    expect(FURNACE, '段数应读 MARGIN_PIPS 而非写死 6').toContain('v-for="n in MARGIN_PIPS"')
  })
})
