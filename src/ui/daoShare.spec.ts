/**
 * 修行画像里的道途占比形制。
 *
 * 画像把这一世走过的道痕按四条道途分账,原先画成四根**一模一样的朱砂条**:
 * 哪一根是剑道、哪一根是杀伐道,只能读左边的名字。
 * 而道途形制早在前一轮就做出来了(ui/daoMark:剑为单锋、长生为回环、
 * 天机为三横、杀伐为交刃,各有道色)—— 画像这里只是没接上。
 *
 * 四条判据:
 *   一 名 → 形制转发 data 里的道名,不另立一份对照表。
 *   二 条长共用一把尺:以本组最大者为满格 —— 四条占比之和不到一百,
 *      按 100% 画会让四根都短得像没走过路。
 *   三 认不出的道不挂假形制。
 *   四 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DAO_PATHS } from '@/data/endgame'
import { daoMarks } from './daoMark'
import { daoShareRows } from './daoShare'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/LegacyView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

/** 画像里实际会出现的那种输入:道名 + 百分比 */
const share = (name: string, pct: number) => ({ name, pct })

describe('道途占比 · 一、名到形制转发数据表', () => {
  it('四条道各自的形制与 ui/daoMark 同源,且互不重复', () => {
    const rows = daoShareRows(DAO_PATHS.map(d => share(d.name, 25)))
    expect(rows).toHaveLength(DAO_PATHS.length)
    const crests = rows.map(r => r.mark?.crest)
    expect(crests.every(c => c !== undefined), '有道途没解出形制').toBe(true)
    expect(new Set(crests).size, '两道用上了同一枚符纹,等于长得一样').toBe(DAO_PATHS.length)
    // 与 daoMark 直出的结果逐项相同
    expect(rows.map(r => r.mark)).toEqual(daoMarks())
  })

  it('道色也逐条相同 —— 不在这里另配色', () => {
    const rows = daoShareRows([share('剑道', 10)])
    expect(rows[0]!.mark?.tone).toBe(daoMarks().find(m => m.label === '剑道')!.tone)
  })

  it('认不出的道名不挂假形制', () => {
    const rows = daoShareRows([share('无名之道', 40)])
    expect(rows[0]!.mark).toBeUndefined()
    expect(rows[0]!.name).toBe('无名之道')
  })
})

describe('道途占比 · 二、条长共用一把尺', () => {
  it('以本组最大者为满格,不是写死的 100%', () => {
    const rows = daoShareRows([share('剑道', 50), share('杀伐道', 25), share('天机道', 17), share('长生道', 8)])
    expect(rows.map(r => r.barPct)).toEqual([100, 50, 34, 16])
  })

  it('若按 100% 画,五成那根只填一半 —— 这里填满,落差才读得出来', () => {
    const rows = daoShareRows([share('剑道', 50)])
    expect(rows[0]!.barPct).toBe(100)
    // 而报出来的仍是真实占比
    expect(rows[0]!.pct).toBe(50)
  })

  it('最长的恰好一根标为 top;并列时都标', () => {
    expect(daoShareRows([share('剑道', 50), share('杀伐道', 10)]).map(r => r.top)).toEqual([true, false])
    expect(daoShareRows([share('剑道', 40), share('杀伐道', 40)]).map(r => r.top)).toEqual([true, true])
  })

  it('零与坏值不产生 NaN 条长,也不占一行', () => {
    const rows = daoShareRows([share('剑道', 0), share('杀伐道', Number.NaN), share('天机道', 30)])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.barPct).toBe(100)
    expect(daoShareRows([])).toHaveLength(0)
  })

  it('负占比被滤掉 —— 画像不给不存在的道途留一行', () => {
    expect(daoShareRows([share('剑道', -5)])).toHaveLength(0)
  })
})

describe('道途占比 · 三、界面接上了', () => {
  it('画像读的是 daoShareRows,且渲染道签', () => {
    expect(VIEW, '画像没有接 daoShareRows').toContain('daoShareRows(')
    expect(VIEW, '画像没有渲染道签').toContain('dao-tag')
    expect(VIEW, '画像的条不再取道色').toContain('d.mark?.tone')
  })

  it('道签带读屏名 —— 纯装饰纹样对面是盲的', () => {
    expect(VIEW).toContain('d.mark.label')
  })

  it('四枚道签的 CSS 齐备且不吃指针事件', () => {
    expect(block('.dao-tag')).toContain('pointer-events: none')
    for (const crest of ['blade', 'ring', 'bars', 'cross']) {
      expect(block(`.dao-tag--${crest}`), `缺 ${crest} 的纹样`).toContain('background-image')
    }
  })

  it('道签只吃 currentColor,自身不引入颜色名', () => {
    const from = CSS.indexOf('.dao-tag {')
    const seg = CSS.slice(from, CSS.indexOf('\n\n', CSS.indexOf('.dao-tag--cross')))
    expect(seg).not.toMatch(/rgb\(var\(--color-/)
    expect(seg).toContain('currentColor')
  })
})
