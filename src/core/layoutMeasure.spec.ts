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
import { MARKET_SLOTS } from '@/data/market'

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

/*
 * 实测夹具不许超出真实上界(第 17 轮)。
 *
 * 「续草场景」那份夹具原先把货架铺成 15 格,目标灵草放在 `idx: 14` 上,
 * 判据靠 `data-card="14"` 去认。而真实货架只有 `MARKET_SLOTS`(6)格 ——
 * `stock` 的 sanitize 会截到前 6 条,第 7 格之后全被丢掉:灵草格永远不在,
 * 判据连带报出「货架明明有灵草却报暂无」与「找不到灵草格,判据没量到东西」。
 * 那不是页面缺陷,是夹具在用一个**只有坏档才存在**的布局。
 *
 * 这正是本仓反复记下的那类问题:判据没量到东西,却报出一个像模像样的结论。
 * 故从源码钉:每份 `stock` 数组的格数不得超过 `MARKET_SLOTS`。
 *
 * 故障注入:把夹具改回 15 格,本条红。
 */
describe('layout-check · 货架夹具不超真实上界', () => {
  const SRC = readFileSync(resolve(__dirname, '../../scripts/layout-check.mjs'), 'utf-8')

  it('每份货架夹具的格数都不超过 MARKET_SLOTS', () => {
    /*
     * 判据要认**两种写法**,只认一种会漏。
     *
     * 评审指出:原先只匹配 `const stock = [...]`,而脚本里还有一份
     * `market: { stock: Array.from({length: 6}, ...) }` 的内联写法 ——
     * 把那份改成 15 格,这条判据照样绿(另一份命中的块满足了非空检查)。
     *
     * 现在按「凡是给货架铺格子的地方」找:
     *   · `const stock = [...]` 及其中 `slot(...)` / `Array.from({length: N})`
     *   · 任何 `stock: [...]` / `stock: Array.from({length: N})` 的内联属性
     */
    const count = (body: string): number => {
      let n = (body.match(/\bslot\(/g) ?? []).length
      for (const m of body.matchAll(/Array\.from\(\{\s*length:\s*(\d+)/g)) n += Number(m[1])
      // 内联字面量里直接写对象格子的情形也算
      n += (body.match(/\{\s*kind:\s*'(?:material|pill|equipment)'/g) ?? []).length
      return n
    }
    /** 从某处起点开始,取到括号配平为止的那段源码 */
    const balanced = (from: number): string => {
      let depth = 0
      let started = false
      for (let i = from; i < SRC.length; i += 1) {
        const ch = SRC[i]
        if (ch === '[' || ch === '{') {
          depth += 1
          started = true
        } else if (ch === ']' || ch === '}') {
          depth -= 1
          if (started && depth === 0) return SRC.slice(from, i + 1)
        }
      }
      return SRC.slice(from)
    }

    const spots: Array<{ label: string; body: string }> = []
    for (const m of SRC.matchAll(/const stock = /g)) {
      spots.push({ label: 'const stock', body: balanced(m.index! + m[0].length) })
    }
    for (const m of SRC.matchAll(/stock:\s*(?=\[|Array\.from)/g)) {
      spots.push({ label: '内联 stock 属性', body: balanced(m.index! + m[0].length) })
    }
    expect(spots.length, '找不到任何货架夹具 —— 判据要跟着改名').toBeGreaterThanOrEqual(2)

    for (const { label, body } of spots) {
      const n = count(body)
      expect(
        n,
        `${label} 铺了 ${n} 格,而真实货架只有 MARKET_SLOTS(${MARKET_SLOTS})格 —— 多出来的会被 sanitize 截掉,判据从此量不到东西`
      ).toBeLessThanOrEqual(MARKET_SLOTS)
      expect(n, `${label} 一格都没数出来 —— 判据空转了`).toBeGreaterThan(0)
    }
  })
})
