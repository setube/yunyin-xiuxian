/**
 * 装备词条位形制。
 *
 * 装备详情只写「词条 3 / 5 条」:
 *   还差几个位、这些位能不能洗练出来,得自己拿 3 去比 5;
 *   而 5 不是随手给的,它是品阶的上限(九档从 1 到 9,见 data/qualities 的 affixes[1])。
 *
 * 四条判据:
 *   一 格数随品阶变,不是一律五格。
 *   二 上限那一跳留在界面(模板直读品阶表),ui 层收显式 cap —— 不藏第二份查表。
 *   三 坏值不产生负格或超长数组。
 *   四 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QUALITIES, qualityDef } from '@/data/qualities'
import { affixSlotMark, affixSlotPips } from './affixSlots'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentDetailDialog.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('词条位 · 一、格数随品阶变', () => {
  it('九档的上限从 1 到 9,刻度格数跟着变', () => {
    const caps = QUALITIES.map(q => affixSlotMark(q.affixes[1], 0).cap)
    expect(caps).toEqual(QUALITIES.map(q => q.affixes[1]))
    // 两侧端点确认没有一律五格
    expect(caps[0]).toBe(1)
    expect(caps[caps.length - 1]).toBe(9)
  })

  it('每档的刻度长度等于该档的词条上限', () => {
    for (const q of QUALITIES) {
      const m = affixSlotMark(q.affixes[1], 0)
      expect(affixSlotPips(m), `${q.name} 的格数不对`).toHaveLength(qualityDef(q.id).affixes[1])
    }
  })

  it('上限单调不减', () => {
    let last = -1
    for (const q of QUALITIES) {
      const cap = affixSlotMark(q.affixes[1], 0).cap
      expect(cap).toBeGreaterThanOrEqual(last)
      last = cap
    }
  })
})

describe('词条位 · 二、已占与空位', () => {
  it('已占几格就几点,空位为余下的格', () => {
    const m = affixSlotMark(5, 3)
    expect(m.used).toBe(3)
    expect(m.free).toBe(2)
    expect(affixSlotPips(m).filter(Boolean)).toHaveLength(3)
  })

  it('满位标记只在真满时给', () => {
    expect(affixSlotMark(5, 5).full).toBe(true)
    expect(affixSlotMark(5, 4).full).toBe(false)
    expect(affixSlotMark(5, 5).free).toBe(0)
  })

  it('零上限(理论上不存在的品阶)不当作满位', () => {
    const m = affixSlotMark(0, 0)
    expect(m.cap).toBe(0)
    expect(m.full).toBe(false)
    expect(affixSlotPips(m)).toHaveLength(0)
  })
})

describe('词条位 · 三、坏值夹回', () => {
  it('已占数越界与坏值夹回 0~上限', () => {
    for (const bad of [-3, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = affixSlotMark(5, bad)
      expect(m.used).toBeGreaterThanOrEqual(0)
      expect(m.used).toBeLessThanOrEqual(m.cap)
      expect(affixSlotPips(m)).toHaveLength(5)
    }
  })

  it('上限为坏值时不炸,退回零格', () => {
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY, -5]) {
      const m = affixSlotMark(bad, 2)
      expect(m.cap).toBe(0)
      expect(m.used).toBe(0)
    }
  })

  it('已占数按升序点数单调增', () => {
    let last = -1
    for (let used = 0; used <= 5; used += 1) {
      const n = affixSlotPips(affixSlotMark(5, used)).filter(Boolean).length
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })
})

describe('词条位 · 四、界面接上了', () => {
  it('详情页读 affixSlotMark / affixSlotPips 并渲染刻度', () => {
    expect(DIALOG).toContain('affixSlotMark(')
    expect(DIALOG).toContain('affixSlotPips(')
    expect(DIALOG).toContain('affix-slots')
  })

  it('上限那一跳留在界面,直接读品阶表 —— 不在 ui 层藏第二份查表', () => {
    // reforge.spec 钉着这一句
    expect(DIALOG).toContain('qualityDef(inst.value.quality).affixes[1]')
    const ui = readFileSync(resolve(ROOT, 'src/ui/affixSlots.ts'), 'utf-8')
    expect(ui, 'ui 层不该再去查品阶表').not.toContain("from '@/data/qualities'")
  })

  it('刻度给读屏名', () => {
    expect(DIALOG).toContain('`词条 ${slotMark.used}/${slotMark.cap} 条`')
  })

  it('已占与空位之间要读得出差 —— 六格排开时「哪几格满了」是本排唯一的信息', () => {
    // 实测原 0.85 实心与 0.45 空位只差 2.03:1,分不出哪几格已占
    expect(block('.affix-slots i'), '空位收到 0.25').toMatch(/violet-ink-rgb\)\s*\/\s*0\.25/)
    const on = block('.affix-slots i.on')
    expect(on, '已占取满色').toMatch(/background: rgb\(var\(--color-violet-ink-rgb\)\)/)
    expect(on, '已占不该再叠透明度').not.toMatch(/violet-ink-rgb\)\s*\//)
  })

  it('刻度的 CSS 存在,形制层不吃指针事件,只取既有 token', () => {
    expect(block('.affix-slots')).toContain('pointer-events: none')
    // 空位是虚框、已占是实心 —— 两态形状不同
    expect(block('.affix-slots i')).toContain('box-shadow')
    expect(block('.affix-slots i.on')).toContain('background')
    const from = CSS.indexOf('.affix-slots {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['violet-ink', 'gold-ink'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
