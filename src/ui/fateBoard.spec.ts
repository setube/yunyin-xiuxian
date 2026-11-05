/**
 * 紫微盘。
 *
 * 十二宫原先铺成十二行文字:哪一宫是命宫、哪一宫有星,得逐行读。
 * 它本来是四正三合的一张盘 —— 四列三行,命宫朱框,有星的宫点亮。
 *
 * 判据:
 *   一 宫与星仍取 data/ziwei,盘只是换摆法 —— 不另立一份数据。
 *   二 十二宫一个不少,命宫恰有一宫。
 *   三 盘与下面的说明表同源(同一个 fateRows),不各算一遍。
 *   四 空宫与有星宫、命宫与其余宫,三档形制分得开。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PALACES, STARS } from '@/data/ziwei'
import { fateChart } from '@/core/fate'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('紫微盘 · 一、宫星取自数据表', () => {
  it('十二宫与主星数取自 data/ziwei', () => {
    expect(PALACES).toHaveLength(12)
    expect(STARS.length).toBeGreaterThan(0)
  })

  it('盘里每宫的星就是 fateChart 给的那几颗 —— 不另立一份', () => {
    for (const seed of [1, 42, 999]) {
      const chart = fateChart(seed)
      expect(chart.palaces).toHaveLength(PALACES.length)
      for (const p of chart.palaces) {
        // 星必须来自 STARS 表
        for (const s of p.stars) expect(STARS.some(x => x.id === s.id)).toBe(true)
      }
    }
  })

  it('十二宫名字与数据表逐项相同', () => {
    const chart = fateChart(7)
    expect(chart.palaces.map(p => p.palace.name)).toEqual(PALACES.map(p => p.name))
  })
})

describe('紫微盘 · 二、一宫不少、命宫唯一', () => {
  it('盘渲染十二格,命宫恰一格', () => {
    const chart = fateChart(3)
    expect(chart.palaces.filter(p => p.palace.id === 'ming')).toHaveLength(1)
    expect(chart.palaces).toHaveLength(12)
  })

  it('模板按 fateRows 铺格,不自己再算一遍', () => {
    expect(VIEW).toContain('fate-board')
    expect(VIEW).toMatch(/v-for="row in fateRows"/)
    // 盘与说明表两处都用同一个 fateRows
    const uses = VIEW.match(/v-for="row in fateRows"/g) ?? []
    expect(uses.length, '盘与说明表应同读一份').toBe(2)
  })

  it('命宫判据写在 fateRows 里,模板不硬写字符串比较', () => {
    expect(VIEW).toContain("isMing: p.palace.id === 'ming'")
    expect(VIEW).toContain('row.isMing')
  })
})

describe('紫微盘 · 三、三档形制分得开', () => {
  it('有星的宫与空宫用不同边框', () => {
    expect(VIEW).toContain('fate-cell--starred')
    // 空宫是基础 .fate-cell,有星宫实一档
    const base = block('.fate-cell')
    const starred = block('.fate-cell--starred')
    expect(base).toContain('border')
    expect(starred).toContain('border-color')
    expect(starred).not.toBe(base)
  })

  it('命宫另有一档(朱框),不与「有星」混同', () => {
    const ming = block('.fate-cell--ming')
    expect(ming).toContain('cinnabar')
    expect(ming).not.toBe(block('.fate-cell--starred'))
  })

  it('盘面不吃指针事件', () => {
    expect(block('.fate-board')).toContain('pointer-events: none')
  })

  it('盘面只取既有语义 token', () => {
    const from = CSS.indexOf('.fate-board {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})

describe('紫微盘 · 四、星的读法', () => {
  it('逐星排开,不只留一串拼接文本', () => {
    expect(VIEW).toContain('row.starList')
    expect(VIEW).toMatch(/v-for="st in row\.starList"/)
  })

  it('每颗星带 title,盘中略去的「性」仍可查', () => {
    expect(VIEW).toContain('`${st.name} · ${st.nature}`')
  })

  it('说明表仍在 —— 宫位的作用没有因为改盘而丢', () => {
    expect(VIEW).toContain('row.palace.domain')
    expect(VIEW).toContain('row.palace.use')
  })

  /**
   * 十四主星各带 mods(字段注释写的就是「此星所与之力」),而界面只印星性一句。
   * 点化一颗要花灵石 —— 花之前最该知道的就是这颗给哪一路。
   * 判据同时钉「走同一份 modsText」:自己拼百分比会与上方「命格之力」合计分叉。
   * 故障注入:删掉星行里的 modsText(s.mods),本条红。
   */
  it('十四主星各自给出所与之力,与命格之力合计同源', () => {
    expect(VIEW, '星行应印该星所与之力').toContain('modsText(s.mods)')
    expect(VIEW, '所与之力应与上方合计走同一份实现').toContain('modsText(')
    // 阴性对照:星行里不许自己拼百分比
    expect(VIEW, '不该在模板里自己拼属性名与百分比').not.toMatch(/s\.mods\[[^\]]+\][^}]*%/)
  })
})
