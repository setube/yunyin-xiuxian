/**
 * 装备强化等级刻度。
 *
 * 强化行只写「+7 / 上限 10」:上限随炼器台等级变(基础 10,再加 forgeCapBonus),
 * 「+7」在一件上限 10 的器上还差三级,在另一件上限 12 的器上差五级 —— 仍要自己去减。
 *
 * 判据:
 *   一 格数随上限变,不按同一个尺画;上限由调用方传(本模块不读 store)。
 *   二 至顶标记只在真满时给。
 *   三 坏值不产生负格或超长数组。
 *   四 刻度独占一行 —— 与文字同行会把「上限 10」挤断。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { upgradeMark, upgradePips } from './masteryMark'

const ROOT = resolve(__dirname, '../..')
const PANEL = readFileSync(resolve(ROOT, 'src/components/equipment/UpgradePanel.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/masteryMark.ts'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('强化刻度 · 零、已到的格要压得住未到的', () => {
  /*
   * 实测:亮格 ink/0.5 与未到格的描边 ink/0.25 只差 1.81:1。
   * 十格排成一条带缺口的粗线 —— 「十格里哪一格亮着」在小屏上读不出来,
   * 而这排刻度存在的唯一理由就是让人读出「还差几格」。
   */
  it('亮格与未到格的明度差够读', () => {
    const on = block('.upgrade-pips i.on')
    const off = block('.upgrade-pips i')
    expect(on, '缺亮格样式').not.toBe('')
    expect(off, '缺未到格样式').not.toBe('')
    // 亮格取 0.7、未到格描边 0.2:实算亮暗 3.55:1
    expect(on, '亮格要够实').toMatch(/ink-rgb\)\s*\/\s*0\.7/)
    expect(off, '未到格要够虚').toMatch(/ink-rgb\)\s*\/\s*0\.2/)
  })

  it('格够宽、缝够开 —— 3px 挨 1.5px 会糊成一条', () => {
    const cell = block('.upgrade-pips i')
    expect(cell, '格宽至少 4px').toContain('width: 4px')
    expect(block('.upgrade-pips'), '缝至少 2px').toContain('gap: 2px')
  })

  it('灵兽来源那两排(园 / 安抚)同样要压得住', () => {
    // 绿实心配墨 0.22 空槽只差 2.4:1;收到 0.15 后亮暗回到 3.4:1 上下
    expect(block('.beast-src-pips i'), '空槽收到 0.15').toMatch(/ink-rgb\)\s*\/\s*0\.15/)
    for (const sel of ['.beast-src-pips--garden i.on', '.beast-src-pips--soothe i.on']) {
      const body = block(sel)
      expect(body, `${sel} 该取满色`).toMatch(/background: rgb\(var\(--color-[a-z-]+-rgb\)\)/)
    }
  })

  it('另外两排彩格同病:未到格原 0.25/0.3 与彩色实心只差 2.15 / 1.74', () => {
    // 道童层数与功法层数:彩实心配墨描边空槽,与强化那一排是同一类读法
    for (const cls of ['.appr-pips i', '.gongfa-pips i']) {
      expect(block(cls), `${cls} 的未到格该收到 0.2`).toMatch(/ink-rgb\)\s*\/\s*0\.2/)
    }
  })

  it('界域刻度是同一类读法,同样要压得住', () => {
    // 两套刻度长一样、读法一样,只改一处会让同一屏出现两种深浅
    const on = block('.world-pips i.on')
    expect(on, '界域已到的格也要够实').toMatch(/ink-rgb\)\s*\/\s*0\.7/)
    expect(block('.world-pips i'), '界域未到格同款').toMatch(/ink-rgb\)\s*\/\s*0\.2/)
  })
})

describe('强化刻度 · 一、格数随上限变', () => {
  it('上限 10 画十格,上限 12 画十二格', () => {
    expect(upgradePips(upgradeMark(3, 10))).toHaveLength(10)
    expect(upgradePips(upgradeMark(3, 12))).toHaveLength(12)
  })

  it('已到几级就几点', () => {
    expect(upgradePips(upgradeMark(4, 10)).filter(Boolean)).toHaveLength(4)
    expect(upgradePips(upgradeMark(0, 10)).filter(Boolean)).toHaveLength(0)
  })

  it('同一个读数在不同上限下的意义不同 —— 取 7 级', () => {
    expect(upgradeMark(7, 10).maxed).toBe(false)
    expect(upgradeMark(7, 7).maxed).toBe(true)
    expect(upgradeMark(7, 10).toMax).toBe(3)
    expect(upgradeMark(7, 12).toMax).toBe(5)
  })

  it('上限由调用方传,本模块不 import store —— 与既有取舍一致', () => {
    expect(MODULE, 'ui 层不该去读 store').not.toContain("from '@/stores/")
    // 注释里可以提到它(那是在解释取舍),代码里不许调用
    const code = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code, 'ui 层不该自己去取上限').not.toContain('equipLevelCap(')
    expect(PANEL, '上限应在调用点取值').toContain('equipLevelCap()')
  })
})

describe('强化刻度 · 二、至顶标记', () => {
  it('满级才标 maxed,且 toMax 为 0', () => {
    const full = upgradeMark(10, 10)
    expect(full.maxed).toBe(true)
    expect(full.toMax).toBe(0)
    expect(upgradeMark(9, 10).maxed).toBe(false)
    expect(upgradeMark(9, 10).toMax).toBe(1)
  })

  it('零上限不当作满级', () => {
    expect(upgradeMark(0, 0).maxed).toBe(false)
  })
})

describe('强化刻度 · 三、坏值夹回', () => {
  it('等级越界与坏值夹回 0~上限', () => {
    for (const bad of [-3, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = upgradeMark(bad, 10)
      expect(m.level).toBeGreaterThanOrEqual(0)
      expect(m.level).toBeLessThanOrEqual(10)
      expect(upgradePips(m)).toHaveLength(10)
    }
  })

  it('上限为坏值时不炸', () => {
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY, -5]) {
      const m = upgradeMark(3, bad)
      expect(m.cap).toBe(0)
      expect(m.level).toBe(0)
      expect(upgradePips(m)).toHaveLength(0)
    }
  })

  it('等级按升序点数单调增', () => {
    let last = -1
    for (let lv = 0; lv <= 10; lv += 1) {
      const n = upgradePips(upgradeMark(lv, 10)).filter(Boolean).length
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })
})

describe('强化刻度 · 四、排版与接线', () => {
  it('强化面板渲染刻度并读 upgradeMark / upgradePips', () => {
    expect(PANEL).toContain('upgrade-pips')
    expect(PANEL).toContain('upgradeMark(')
    expect(PANEL).toContain('upgradePips(')
  })

  it('刻度与文字分两行 —— 同行会把「上限 10」挤断成两行', () => {
    expect(PANEL, '文字须整句 nowrap').toContain('whitespace-nowrap')
    // 刻度在前、文字另起一块(block)
    expect(PANEL).toMatch(/upgrade-pips[\s\S]{0,400}mt-0\.5 block whitespace-nowrap/)
  })

  it('刻度给读屏名', () => {
    // 两处刻度各在 computed 里算一次(原先模板里每块调 mark/equipLevelCap 五六遍)
    expect(PANEL).toContain('`强化 +${previewMark.level} / 上限 ${previewMark.cap}`')
    expect(PANEL).toContain('`强化 +${currentMark.level} / 上限 ${currentMark.cap}`')
  })

  it('刻度的 CSS 存在,形制层不吃指针事件,只取既有 token', () => {
    expect(block('.upgrade-pips')).toContain('pointer-events: none')
    expect(block('.upgrade-pips--max i.on'), '至顶没有单独的颜色').toContain('gold-ink')
    const from = CSS.indexOf('.upgrade-pips {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'gold-ink'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
