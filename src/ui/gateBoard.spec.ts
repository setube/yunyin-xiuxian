/**
 * 奇门九宫盘:八门各居洛书一宫,这是**位置**信息 —— 平铺成一列读不出来。
 *
 * 四条判据:
 *   一 洛书排布本身要对:横竖斜皆十五,中宫是五。排错了整个盘就是错的。
 *   二 八门各居一宫且不重复,中五无门 —— 塌成比目鱼的前提是「两门挤一宫」。
 *   三 吉/平/凶靠边框形态区分(实线/虚线/双线),不只靠颜色 —— 色弱玩家也要分得开。
 *   四 两处界面都真的接上了盘面,且宫位号取数据层的唯一事实源。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GATES } from '@/data/qimen'
import { LUOSHU_LAYOUT, gateKindMark, gateSeats, palaceBoard, seatOf } from './gateBoard'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const EXPED = readFileSync(resolve(ROOT, 'src/components/celestial/ExpeditionPanel.vue'), 'utf-8')
const CODEX = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('九宫盘 · 一、洛书排布本身要对', () => {
  it('上 4 9 2 / 中 3 5 7 / 下 8 1 6', () => {
    expect(LUOSHU_LAYOUT).toEqual([
      [4, 9, 2],
      [3, 5, 7],
      [8, 1, 6]
    ])
  })

  it('横竖斜皆十五,且 1~9 各一次 —— 排错了整张盘就是错的', () => {
    const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
    for (const row of LUOSHU_LAYOUT) expect(sum(row), `一横行 ${row.join('')}`).toBe(15)
    for (let c = 0; c < 3; c += 1) expect(sum(LUOSHU_LAYOUT.map(r => r[c]!)), `第 ${c} 竖列`).toBe(15)
    expect(sum([0, 1, 2].map(i => LUOSHU_LAYOUT[i]![i]!)), '主对角').toBe(15)
    expect(sum([0, 1, 2].map(i => LUOSHU_LAYOUT[i]![2 - i]!)), '副对角').toBe(15)
    const flat = LUOSHU_LAYOUT.flat().sort((a, b) => a - b)
    expect(flat).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('中宫是五,且中五无门', () => {
    expect(LUOSHU_LAYOUT[1]![1]).toBe(5)
    const center = palaceBoard().find(c => c.palace === 5)!
    expect(center.gate, '中五无门').toBeUndefined()
    expect(center.row).toBe(1)
    expect(center.col).toBe(1)
  })
})

describe('九宫盘 · 二、八门各居一宫,不挤不重', () => {
  it('盘上正好八门,八格各一', () => {
    expect(gateSeats().length).toBe(GATES.length)
    expect(palaceBoard().filter(c => c.gate === undefined).length).toBe(1)
  })

  it('每门落在它数据里写的那一宫', () => {
    for (const g of GATES) {
      const seat = seatOf(g.id)!
      const row = Math.floor(LUOSHU_LAYOUT.findIndex(r => r.includes(g.palace)))
      const col = LUOSHU_LAYOUT[row]!.indexOf(g.palace)
      expect(seat, `${g.fullName} 的落位`).toEqual({ row, col })
    }
  })

  it('没有两门挤在同一格', () => {
    const seen = new Set(gateSeats().map(s => `${s.row},${s.col}`))
    expect(seen.size).toBe(GATES.length)
  })

  it('认不出的门返回 undefined,而不是画到中宫去', () => {
    for (const bogus of ['', 'nonexistent', 'XIU']) {
      expect(seatOf(bogus), `${bogus} 不该有落位`).toBeUndefined()
    }
  })
})

describe('九宫盘 · 三、吉凶靠形状,不只靠色', () => {
  it('三档各有自己的边框形态', () => {
    expect(gateKindMark('吉').shape).toBe('solid')
    expect(gateKindMark('平').shape).toBe('dashed')
    expect(gateKindMark('凶').shape).toBe('double')
  })

  it('认不出的吉凶按平处理,不抛错', () => {
    for (const bogus of ['', '大吉', undefined as unknown as string]) {
      expect(gateKindMark(bogus).kind).toBe('平')
    }
  })

  it('三种边框形态在样式里都存在且互不相同', () => {
    const styles = ['solid', 'dashed', 'double'].map(s => block(`.gate-kind-${s}`))
    for (const [i, s] of styles.entries()) expect(s, `缺 .gate-kind-${['solid', 'dashed', 'double'][i]}`).not.toBe('')
    expect(new Set(styles).size).toBe(3)
  })

  it('每一门的吉凶都在三档之内', () => {
    for (const g of GATES) {
      expect(['吉', '平', '凶'], `${g.fullName} 的吉凶`).toContain(g.kind)
    }
  })
})

describe('九宫盘 · 四、两处界面都接上了', () => {
  it('盘面样式:九宫格 + 方形宫格 + 中宫留空', () => {
    expect(block('.gate-board'), '九宫盘应是三列网格').toContain('grid-template-columns: repeat(3')
    expect(block('.gate-palace'), '每宫应是方形').toContain('aspect-ratio: 1')
    expect(block('.gate-palace--void'), '中宫留空应有自己的样式').not.toBe('')
  })

  it('远征择门与图鉴奇门页都画盘', () => {
    expect(EXPED, '远征择门应画九宫盘').toContain('palaceBoard()')
    expect(EXPED, '远征择门应接吉凶形态').toContain('gateKindMark(cell.gate.kind).shape')
    expect(CODEX, '图鉴奇门页应画九宫盘').toContain('palaceBoard()')
    expect(CODEX, '图鉴也接吉凶形态').toContain('gateKindMark(cell.gate.kind).shape')
  })

  it('宫位号取数据层,不在界面里重排一遍', () => {
    // 盘面排布只在 ui/gateBoard 里定义;两处界面都只读它的输出
    expect(EXPED, '界面不该自己写洛书排布').not.toContain('[4, 9, 2]')
    expect(CODEX, '界面不该自己写洛书排布').not.toContain('[4, 9, 2]')
  })

  it('中宫那一格不可点(无门可择)', () => {
    expect(EXPED, '中宫应禁用').toContain(':disabled="!cell.gate"')
  })
})
