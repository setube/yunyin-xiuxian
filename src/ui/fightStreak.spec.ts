/**
 * 连战逐场形制。
 *
 * 远征与天道试炼都是「一场接一场」,而逐场摘要此前只有文字:
 * 一段里真正决定「还能不能走下一重」的是余血走势,
 * 文字把它写成了十来个互不相干的百分数。
 *
 * 三条判据:
 *   一 柱高以满血为顶,不按本串最大值归一 —— 与天劫相反。
 *   二 全胜时不标「最险」:没输过的串里那句话没有意义。
 *   三 两处摘要吃同一份判据。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { allWon, fightMarks, thinnest } from './fightStreak'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/celestial/BattleReportDialog.vue'), 'utf-8')
const PANEL = readFileSync(resolve(ROOT, 'src/components/celestial/ExpeditionPanel.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

const win = (hp: number) => ({ win: true, hpLeftPct: hp, rounds: 10 })
const lose = (hp: number) => ({ win: false, hpLeftPct: hp, rounds: 10 })

describe('连战余血柱 · 一、以满血为顶', () => {
  it('柱高就是余血本身,不按本串最大值放大', () => {
    const m = fightMarks([win(0.88), win(0.61), win(0.34)])
    expect(m.map(x => x.barPct)).toEqual([88, 61, 34])
  })

  it('与天劫相反:这里绝对值有意义 —— 唯一一场余血 34% 也画 34,不是满格', () => {
    expect(fightMarks([win(0.34)])[0]!.barPct).toBe(34)
  })

  it('越界与坏值夹到 0~100,不产生 NaN', () => {
    const m = fightMarks([win(2), win(-1), { win: true, hpLeftPct: Number.NaN, rounds: 1 }])
    expect(m.map(x => x.barPct)).toEqual([100, 0, 0])
  })

  it('场次从 1 起,不跳号', () => {
    expect(fightMarks([win(0.5), win(0.4), win(0.3)]).map(x => x.index)).toEqual([1, 2, 3])
  })
})

describe('连战余血柱 · 二、全胜不标最险', () => {
  it('全胜时没有任何一场标 worst', () => {
    expect(fightMarks([win(0.9), win(0.2)]).every(m => !m.worst)).toBe(true)
  })

  it('有败绩时,败下来的那场里余血最少的标 worst', () => {
    const m = fightMarks([win(0.9), lose(0.15), lose(0.05)])
    expect(m.map(x => x.worst)).toEqual([false, false, true])
  })

  it('胜场再怎么薄也不是「最险」—— 它毕竟赢了', () => {
    const m = fightMarks([win(0.02), lose(0.9)])
    expect(m.find(x => x.worst)!.index).toBe(2)
  })

  it('空串不出错', () => {
    expect(fightMarks([])).toEqual([])
    expect(allWon([])).toBe(false)
    expect(thinnest([])).toBeNull()
  })
})

describe('连战余血柱 · 三、两处摘要同源', () => {
  it('战报弹窗与远征面板都读 fightMarks', () => {
    expect(DIALOG, '战报弹窗没接 fightMarks').toContain('fightMarks(')
    expect(PANEL, '远征面板没接 fightMarks').toContain('fightMarks(')
    expect(DIALOG).toContain('fight-bar')
    expect(PANEL).toContain('fight-bar')
  })

  it('全胜与最薄的场次有现成的判据可用', () => {
    expect(allWon([win(0.5), win(0.4)])).toBe(true)
    expect(thinnest(fightMarks([win(0.5), win(0.2)]))!.index).toBe(2)
  })

  it('余血条的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.fight-bar')).toContain('pointer-events: none')
    expect(block('.fight-bar--worst .fight-bar-fill')).toContain('cinnabar')
  })

  it('形制只取既有语义 token', () => {
    const from = CSS.indexOf('.fight-bar')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'jade', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
