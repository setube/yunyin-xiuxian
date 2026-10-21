/**
 * 排版自检的「量法」守卫 —— scripts/layout-check.mjs 不在 CI 里跑(本地约 10 分钟),
 * 于是它自己的口径回归没有任何运行期信号。三条口径各自对应一次踩过的坑:
 *
 *  1. 入场动画进行中量几何 = 量到中间帧 —— /create 的灵根圆环曾在 stagger 中段被判越界;
 *  2. 只查右缘 = 被负边距推到左缘外的块永远查不出来;
 *  3. 按类名豁免纯装饰层 = 自定义类(.ring-layer)关掉事件时仍被算作事故,
 *     而转动的方形盒子 rect 会随相位涨到 √2 倍,同一处一会儿过一会儿不过。
 *
 * 故障注入:把三种量法任一改回旧写法 → 对应判据红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCRIPT = readFileSync(resolve(__dirname, '../../scripts/layout-check.mjs'), 'utf8')

describe('排版自检量法', () => {
  it('量之前冻结动画与过渡,量的是稳态布局', () => {
    expect(SCRIPT, '动画禁令要与截图 animations:"disabled" 同口径').toContain(
      '*,*::before,*::after{animation:none!important;transition:none!important}'
    )
    // 页面测量与弹窗控件审计都得注入:只看页面,弹窗按钮仍会量到入场中间帧
    expect(SCRIPT.match(/animation:none!important/g)?.length, '页面与弹窗两处都要注入').toBeGreaterThan(1)
  })

  it('横向越界左右两侧都查,不只查右缘', () => {
    expect(SCRIPT).toContain('const rightOver = r.right > vw + 2')
    expect(SCRIPT).toContain('const leftOver = r.left < -1')
    expect(SCRIPT).toContain('(!rightOver && !leftOver)')
  })

  it('装饰层按计算后的 pointer-events 豁免,不靠类名', () => {
    expect(SCRIPT).toContain("getComputedStyle(node).pointerEvents === 'none'")
    expect(SCRIPT, '类名豁免会漏掉用自定义类关事件的装饰层').not.toContain(
      "!el.classList.contains('pointer-events-none')"
    )
  })

  it('横向滚动轨内的内容算设计,不豁免 overflow-hidden', () => {
    expect(SCRIPT).toContain("if (s.overflowX === 'auto' || s.overflowX === 'scroll') return false")
    expect(SCRIPT, 'hidden 的外壳恰是「玩家滚不动」的事故层').not.toContain("s.overflowX === 'hidden'")
  })
})
