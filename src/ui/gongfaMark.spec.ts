/**
 * 功法层数形制。
 *
 * 功法行末尾只写「第 5 层」,而各功法上限不同(密法 3 层、主辅 9 层):
 * 「第 5 层」在一门里是过半,在另一门里是练满;「还差几层」得自己拿两个数去减。
 * 主修卡与已习列表两处都是这个写法。
 *
 * 四条判据:
 *   一 上限取 gongfaMaxLevel —— 数据里的唯一事实源。
 *   二 刻度格数随上限变,不是写死的九格。
 *   三 满级分得开;坏值不产生负格或超长数组。
 *   四 两处界面同读一份形制。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GONGFA, gongfaMaxLevel } from '@/data/gongfa'
import { gongfaMark, gongfaPips } from './gongfaMark'

const ROOT = resolve(__dirname, '../..')
const SECTION = readFileSync(resolve(ROOT, 'src/components/cultivation/GongfaSection.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('功法层数 · 一、上限取数据表', () => {
  it('密法上限 3、主辅上限 9,与 gongfaMaxLevel 一致', () => {
    const secret = GONGFA.find(g => g.type === 'secret')!
    const sub = GONGFA.find(g => g.type === 'sub')!
    expect(gongfaMaxLevel(secret)).toBe(3)
    expect(gongfaMaxLevel(sub)).toBe(9)
    expect(gongfaMark(secret, 0).max).toBe(gongfaMaxLevel(secret))
    expect(gongfaMark(sub, 0).max).toBe(gongfaMaxLevel(sub))
  })

  it('拿不到定义时不炸,给一个合法上限', () => {
    const m = gongfaMark(undefined, 3)
    expect(m.max).toBeGreaterThan(0)
    expect(m.level).toBeGreaterThanOrEqual(0)
    expect(m.level).toBeLessThanOrEqual(m.max)
  })
})

describe('功法层数 · 二、格数随上限变', () => {
  it('密法三点、辅修九点 —— 不是一律九格', () => {
    const secret = GONGFA.find(g => g.type === 'secret')!
    const sub = GONGFA.find(g => g.type === 'sub')!
    expect(gongfaPips(gongfaMark(secret, 1))).toHaveLength(3)
    expect(gongfaPips(gongfaMark(sub, 1))).toHaveLength(9)
  })

  it('已习几层就几点', () => {
    const sub = GONGFA.find(g => g.type === 'sub')!
    expect(gongfaPips(gongfaMark(sub, 5)).filter(Boolean)).toHaveLength(5)
  })

  it('同一读数在两门功法里的意义确实不同 —— 取 3 层', () => {
    const secret = GONGFA.find(g => g.type === 'secret')!
    const sub = GONGFA.find(g => g.type === 'sub')!
    // 密法 3 层已满,辅修 3 层还差六层
    expect(gongfaMark(secret, 3).maxed).toBe(true)
    expect(gongfaMark(sub, 3).maxed).toBe(false)
  })
})

describe('功法层数 · 三、满级与坏值', () => {
  it('满级标记与「已圆满」只在真满时给', () => {
    const sub = GONGFA.find(g => g.type === 'sub')!
    const full = gongfaMark(sub, gongfaMaxLevel(sub))
    expect(full.maxed).toBe(true)
    expect(full.toMax).toBe(0)
    expect(full.peakLabel).toBe('已圆满')
    const notFull = gongfaMark(sub, gongfaMaxLevel(sub) - 1)
    expect(notFull.maxed).toBe(false)
    expect(notFull.peakLabel, '未满不该给「已圆满」').toBeNull()
    expect(notFull.toMax).toBe(1)
  })

  it('越界与坏值夹回 0~上限,不产生负格或超长数组', () => {
    const sub = GONGFA.find(g => g.type === 'sub')!
    for (const v of [-5, 999, Number.NaN]) {
      const m = gongfaMark(sub, v)
      expect(m.level).toBeGreaterThanOrEqual(0)
      expect(m.level).toBeLessThanOrEqual(m.max)
      expect(gongfaPips(m)).toHaveLength(m.max)
    }
  })

  it('层数按升序点数单调增', () => {
    const sub = GONGFA.find(g => g.type === 'sub')!
    let last = -1
    for (let lv = 0; lv <= gongfaMaxLevel(sub); lv += 1) {
      const n = gongfaPips(gongfaMark(sub, lv)).filter(Boolean).length
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })
})

describe('功法层数 · 四、两处界面同读一份', () => {
  it('已习列表与主修卡都用 gongfaMark / gongfaPips', () => {
    expect(SECTION).toContain('gongfaMark(')
    expect(SECTION).toContain('gongfaPips(')
    // 两处:已习行 row.mark,主修卡 mainMark
    expect(SECTION).toContain('row.mark')
    expect(SECTION).toContain('mainMark')
  })

  it('层数形制在列表计算里算一次,不在模板里反复调同一个函数', () => {
    // 模板里出现 `gongfaMark(row.def` 就是又在模板里重算了
    const tpl = SECTION.slice(0, SECTION.indexOf('<script'))
    expect(tpl, '模板里反复调 gongfaMark,既慢又难读').not.toContain('gongfaMark(row.def')
  })

  it('刻度给读屏名 —— 几根细格对面是盲的', () => {
    expect(SECTION).toContain('层,共 ${row.mark.max} 层')
    expect(SECTION).toContain('层,共 ${mainMark.max} 层')
  })

  it('刻度的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.gongfa-pips')).toContain('pointer-events: none')
    expect(block('.gongfa-pips--max i.on'), '满级没有单独的颜色').toContain('gold-ink')
  })

  it('形制只取既有语义 token', () => {
    const from = CSS.indexOf('.gongfa-pips {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'azure', 'gold-ink'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  it('上限仍读 gongfaMaxLevel,不在别处写 `?? 9`', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/gongfaMark.ts'), 'utf-8')
    expect(src).toContain('gongfaMaxLevel(')
    expect(src, '自己判类型算上限会与数据表分叉').not.toContain("'secret' ? 3")
  })
})
