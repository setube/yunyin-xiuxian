/**
 * 天赋品阶形制。
 *
 * 天赋四档(凡赋 / 灵赋 / 天赋 / 道赋),而界面上只有两种表示:
 *   轮回择姿时写品阶名;
 *   转世弹窗里已持有的天赋只有一枚彩色标签,品阶纯粹靠颜色区分。
 *
 * 同一个东西在两处长得不一样,玩家得学两套;而颜色是连续量 ——
 * 四档里灵赋的靛与天赋的紫放在一起,谁高一档读不出来。
 *
 * 四条判据:
 *   一 档名与档色全部转发 data/talents 的既有常量,不另立。
 *   二 一档一点、四档四点 —— 可数的形制,不靠颜色连续量。
 *   三 越界与坏值夹回合法档,不产生 0 点或 5 点。
 *   四 两处界面同读一份形制。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TALENT_GRADE_COLORS, TALENT_GRADE_NAMES, TALENTS } from '@/data/talents'
import { TALENT_GRADES, talentMark, talentPips } from './talentMark'

const ROOT = resolve(__dirname, '../..')
const REBIRTH = readFileSync(resolve(ROOT, 'src/components/character/RebirthDialog.vue'), 'utf-8')
const REINC = readFileSync(resolve(ROOT, 'src/components/character/ReincarnationDialog.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('天赋品阶 · 一、转发既有常量', () => {
  it('档数就是 TALENT_GRADE_NAMES 的条数减占位', () => {
    expect(TALENT_GRADES).toBe(TALENT_GRADE_NAMES.length - 1)
    expect(TALENT_GRADES).toBe(4)
  })

  it('每档的档名与档色与 data 逐项相同', () => {
    for (let g = 1; g <= TALENT_GRADES; g += 1) {
      const m = talentMark(g)
      expect(m.name).toBe(TALENT_GRADE_NAMES[g])
      expect(m.tone).toBe(TALENT_GRADE_COLORS[g])
    }
  })

  it('数据里每个天赋的档位都落在 1~4 之内', () => {
    for (const t of TALENTS) {
      expect(t.grade, `${t.name} 的档位越界`).toBeGreaterThanOrEqual(1)
      expect(t.grade, `${t.name} 的档位越界`).toBeLessThanOrEqual(TALENT_GRADES)
    }
  })
})

describe('天赋品阶 · 二、一档一点', () => {
  it('几档就几点:凡赋 1 点、道赋 4 点', () => {
    expect(talentMark(1).pips).toBe(1)
    expect(talentMark(2).pips).toBe(2)
    expect(talentMark(3).pips).toBe(3)
    expect(talentMark(4).pips).toBe(4)
  })

  it('阶点恒为四点,已到的为 true', () => {
    for (let g = 1; g <= TALENT_GRADES; g += 1) {
      const pips = talentPips(g)
      expect(pips).toHaveLength(TALENT_GRADES)
      expect(pips.filter(Boolean)).toHaveLength(g)
    }
  })

  it('只有最上档标 top', () => {
    expect(talentMark(TALENT_GRADES).top).toBe(true)
    for (let g = 1; g < TALENT_GRADES; g += 1) expect(talentMark(g).top).toBe(false)
  })

  it('档位按升序点数单调增 —— 否则阶点读不出高低', () => {
    let last = 0
    for (let g = 1; g <= TALENT_GRADES; g += 1) {
      expect(talentMark(g).pips).toBeGreaterThan(last)
      last = talentMark(g).pips
    }
  })
})

describe('天赋品阶 · 三、坏值夹回合法档', () => {
  it('越界与坏值都落在 1~4,不产生 0 点或 5 点', () => {
    for (const bad of [-3, 0, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = talentMark(bad)
      expect(m.grade).toBeGreaterThanOrEqual(1)
      expect(m.grade).toBeLessThanOrEqual(TALENT_GRADES)
      expect(talentPips(bad)).toHaveLength(TALENT_GRADES)
    }
  })

  it('夹回后的档名与档色也合法 —— 不会出现 undefined 的品阶', () => {
    for (const bad of [-3, 99, Number.NaN]) {
      const m = talentMark(bad)
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.tone.length).toBeGreaterThan(0)
    }
  })
})

describe('天赋品阶 · 四、两处界面同读一份', () => {
  it('转世弹窗与轮回择姿都接 talentPips', () => {
    expect(REBIRTH, '转世弹窗没接阶点').toContain('talentPips(')
    expect(REBIRTH).toContain('talent-pips')
    expect(REINC, '轮回择姿没接阶点').toContain('talentPips(')
    expect(REINC).toContain('talent-pips')
  })

  it('转世弹窗的阶点给读屏名,轮回择姿那边已有品阶名可念', () => {
    expect(REBIRTH).toContain('talentMark(t!.grade).name')
    // 轮回那边品阶名是可见文本,阶点纯装饰
    expect(REINC).toContain('TALENT_GRADE_NAMES[')
  })

  it('阶点的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.talent-pips')).toContain('pointer-events: none')
    expect(block('.talent-pips--top i.on'), '最上档没有单独处理').toContain('box-shadow')
  })

  it('阶点只吃 currentColor —— 档色由行内 style 给,不在这里另配色', () => {
    const from = CSS.indexOf('.talent-pips {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    expect(seg).not.toMatch(/rgb\(var\(--color-/)
    expect(seg).toContain('currentColor')
  })
})
