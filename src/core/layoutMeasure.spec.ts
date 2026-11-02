/**
 * scripts/layout-check.mjs 的量法守卫(该脚本不在 CI 里跑):
 *  1. 入场动画进行中量几何 = 量到中间帧;
 *  2. 只查右缘 = 被负边距推到左缘外的块查不出来;
 *  3. 按类名豁免装饰层 = 自定义类(.ring-layer)关掉事件时仍算事故;转动的方形盒子 rect 随相位涨到 √2 倍。
 *
 * 故障注入:把三种量法任一改回旧写法,对应判据红。
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
    const injections = SCRIPT.match(/animation:none!important/g)?.length ?? 0
    expect(injections, '整页 / 弹窗 / 开箱子集三处量尺都要注入').toBeGreaterThanOrEqual(3)
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

  /**
   * 量词表。判据是「数字后紧跟量词、且二者被折到两行」。
   * 表里少一个量词,那一处断行就整片没人管 —— 而断行在 320 窄屏才现形,肉眼很难复查。
   * 原先只有 13 个,漏了倍/成/席/页/部/条/味/处/世/点/星/门/座/片/重。
   *
   * 故障注入:把表改回 13 个,本条红。
   */
  it('数字与量词不拆行的量词表覆盖全站实际用到的单位', () => {
    const m = /const UNITS = '([^']+)'/.exec(SCRIPT)
    expect(m, '找不到量词表').toBeTruthy()
    const table = m![1]!
    // 逐个点名:每一条都在源码里真实跟着数字用过
    const must = ['石', '铁', '尘', '株', '张', '载', '年', '次', '件', '层', '场', '阶', '枚', '缕', '时', '日']
    const added = ['倍', '成', '席', '页', '部', '条', '味', '处', '世', '点', '星', '门', '座', '片', '重']
    for (const u of [...must, ...added]) {
      expect(table, `量词表缺「${u}」—— 那一处「N${u}」的断行没人管`).toContain(u)
    }
  })
})
