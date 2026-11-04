/**
 * 界域进度形制。
 *
 * 境界谱按四个界域平铺 21 境,而界域标题只写「第 1–9 境」:
 *   身在人间界第 4 境时,本界域还剩几境、已经过了几境,都得自己拿 4 去比 1 与 9。
 *   四个界域各含 9/5/4/3 境,「第 1–9 境」与「第 18–21 境」量级差三倍。
 *
 * 四条判据:
 *   一 格数随界域变(9/5/4/3),不按同一个尺画。
 *   二 已过严格低于当前境界 —— 当前那一境还没有「过」。
 *   三 跨界的连续性:身处神界时,前面两个界域整段算过。
 *   四 分界全部取自 REALMS / WORLDS,不另立。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REALMS, WORLDS } from '@/data/realms'
import { realmTotals, worldPips, worldProgress } from './worldProgress'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('界域进度 · 一、格数随界域变', () => {
  it('四个界域各含 9/5/4/3 境,刻度格数跟着变', () => {
    expect(worldProgress(0).map(w => w.total)).toEqual([9, 5, 4, 3])
    for (const row of worldProgress(0)) {
      expect(worldPips(row), `${row.name} 的格数不对`).toHaveLength(row.total)
    }
  })

  it('界域总境数与 WORLDS 的分界一致', () => {
    const rows = worldProgress(0)
    WORLDSpans().forEach((span, i) => {
      expect(rows[i]!.total, `第 ${i} 个界域的境数不对`).toBe(span)
    })
  })

  it('四个界域加起来就是全部境界', () => {
    expect(worldProgress(0).reduce((s, w) => s + w.total, 0)).toBe(REALMS.length)
  })
})

function WORLDSpans(): number[] {
  return WORLDS.map(w => w.end - w.start + 1)
}

describe('界域进度 · 二、已过严格低于当前', () => {
  it('人间界第 4 境(major 3)时,人间界已过 3 境', () => {
    const rows = worldProgress(3)
    expect(rows[0]!.passed).toBe(3)
    expect(rows[0]!.here).toBe(true)
    expect(worldPips(rows[0]!).filter(Boolean)).toHaveLength(3)
  })

  it('当前那一境还没有「过」—— 刚进人间界第 1 境时已过 0 境', () => {
    const rows = worldProgress(0)
    expect(rows[0]!.passed, '当前这一境不该算已过').toBe(0)
    expect(rows[0]!.here).toBe(true)
  })

  it('只有一个界域标 here', () => {
    for (const major of [0, 3, 9, 15, 20]) {
      expect(worldProgress(major).filter(w => w.here)).toHaveLength(1)
    }
  })
})

describe('界域进度 · 三、跨界的连续性', () => {
  it('身处神界第 2 境(major 15)时,人间与仙界整段算过', () => {
    const rows = worldProgress(15)
    expect(rows[0]!.passed).toBe(rows[0]!.total)
    expect(rows[1]!.passed).toBe(rows[1]!.total)
    // 神界起于 14,故 15 时本界域已过 1 境
    expect(rows[2]!.passed).toBe(1)
    expect(rows[2]!.here).toBe(true)
    expect(rows[3]!.passed).toBe(0)
  })

  it('已过数永不超过本界域总境数', () => {
    for (let major = 0; major < REALMS.length; major += 1) {
      for (const row of worldProgress(major)) {
        expect(row.passed).toBeGreaterThanOrEqual(0)
        expect(row.passed).toBeLessThanOrEqual(row.total)
      }
    }
  })

  it('已过总数随境界单调不减', () => {
    let last = -1
    for (let major = 0; major < REALMS.length; major += 1) {
      const sum = worldProgress(major).reduce((s, w) => s + w.passed, 0)
      expect(sum).toBeGreaterThanOrEqual(last)
      last = sum
    }
  })
})

describe('界域进度 · 四、坏值与界面', () => {
  it('未开局(major null)时四段都 0,没有 here', () => {
    const rows = worldProgress(null)
    expect(rows.every(w => w.passed === 0)).toBe(true)
    expect(rows.some(w => w.here)).toBe(false)
  })

  it('越界与坏值夹回合法区间', () => {
    for (const bad of [-5, 99, Number.NaN]) {
      const rows = worldProgress(bad)
      expect(rows).toHaveLength(WORLDS.length)
      for (const row of rows) {
        expect(row.passed).toBeGreaterThanOrEqual(0)
        expect(row.passed).toBeLessThanOrEqual(row.total)
      }
    }
  })

  it('页级总数取自 REALMS.length', () => {
    expect(realmTotals(3)).toEqual({ passed: 3, total: REALMS.length })
    expect(realmTotals(null).passed).toBe(0)
  })

  it('境界谱读 worldProgress / worldPips,且在计算里算一次', () => {
    expect(VIEW).toContain('worldProgress(')
    expect(VIEW).toContain('worldPips(row.prog)')
    // 模板里不再重算
    const tpl = VIEW.slice(0, VIEW.indexOf('<script'))
    expect(tpl, '模板里反复调 worldProgress,既慢又难读').not.toContain('worldProgress(player.major)')
  })

  it('刻度给读屏名', () => {
    expect(VIEW).toContain('已过 ${row.prog.passed}/${row.prog.total} 境')
  })

  it('刻度的 CSS 存在,形制层不吃指针事件,只取既有 token', () => {
    expect(block('.world-pips')).toContain('pointer-events: none')
    const from = CSS.indexOf('.world-pips {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
