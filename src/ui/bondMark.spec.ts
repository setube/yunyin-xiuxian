/**
 * 道侣缘阶形制:七阶关系不该只有一行阶名小字。
 *
 * 道侣是「只进不退、由选择累积」的唯一一条线,而「知交」与「同行」此前长得一模一样。
 *
 * 四条判据:
 *   一 阶点与阶序一一对应,七阶七个不同点数 —— 数得出来才算形制。
 *   二 阈值取 `STAGE_ORDER`,不另立第二张阶表;色取既有语义 token,不写死 hex。
 *   三 最上阶(道侣)才给外环与菱形点;坏档里的野阶名按素昧平生处理,不抛错。
 *   四 入口卡与弹窗都真的接上了,且缘纹是装饰(读屏靠阶名的 aria-label)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STAGE_NAMES, STAGE_ORDER } from '@/data/daolu'
import { BOND_TOP_RANK, bondMark } from './bondMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/character/BondDialog.vue'), 'utf-8')
const ENTRY = readFileSync(resolve(ROOT, 'src/views/CharacterView.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('缘阶形制 · 一、阶点数得出来', () => {
  it('七阶各有一档点数,一一对应', () => {
    const seen = new Set<number>()
    STAGE_ORDER.forEach((stage, i) => {
      const mark = bondMark(stage)
      expect(mark.rank, `${stage} 的阶序`).toBe(i)
      expect(mark.pips, `${stage} 的阶点`).toBe(i + 1)
      expect(seen.has(mark.pips), `点数 ${mark.pips} 重复 —— 两阶数起来一样`).toBe(false)
      seen.add(mark.pips)
    })
    expect(seen.size).toBe(STAGE_ORDER.length)
  })

  it('七阶各有一枚缘纹,且互不相同', () => {
    const glyphs = STAGE_ORDER.map(s => bondMark(s).glyph)
    expect(new Set(glyphs).size, `缘纹重复:${glyphs.join(' / ')}`).toBe(glyphs.length)
    for (const g of glyphs) {
      expect(block(`.bond-crest--${g}::before`), `缺 .bond-crest--${g}::before`).not.toBe('')
    }
  })

  it('只有最上阶是道侣,且只有它带外环', () => {
    expect(BOND_TOP_RANK).toBe(STAGE_ORDER.length - 1)
    expect(bondMark('daolv').top).toBe(true)
    for (const s of STAGE_ORDER.filter(x => x !== 'daolv')) {
      expect(bondMark(s).top, `${s} 不该带外环`).toBe(false)
    }
    expect(block('.bond-halo'), '缺道侣外环样式').not.toBe('')
    expect(block('.bond-halo'), '外环不该吃指针事件').toContain('pointer-events: none')
  })
})

describe('缘阶形制 · 二、阈值与色都不另立', () => {
  it('阶名直接取 data/daolu,不另造说法', () => {
    for (const s of STAGE_ORDER) {
      expect(bondMark(s).label).toBe(STAGE_NAMES[s])
    }
  })

  it('缘色取既有语义 token', () => {
    for (const s of STAGE_ORDER) {
      expect(bondMark(s).tone, `${s} 的缘色应引 var(--color-*)`).toMatch(/^var\(--color-[a-z-]+\)$/)
    }
  })

  it('缘色随阶由冷到暖,不进正文不可读的过淡档', () => {
    // 起点是墨的淡档(关系尚未建立),终点是朱砂(道侣)
    expect(bondMark('none').tone).toBe('var(--color-ink-faint)')
    expect(bondMark('daolv').tone).toBe('var(--color-cinnabar)')
  })

  it('阶点与缘纹都不吃指针事件', () => {
    expect(block('.bond-pips'), '.bond-pips 须 pointer-events: none').toContain('pointer-events: none')
    expect(block('.bond-crest::before'), '.bond-crest::before 须 pointer-events: none').toContain('pointer-events: none')
  })
})

describe('缘阶形制 · 三、坏档按素昧平生处理', () => {
  it('野阶名、空串、未定义一律退回第一阶,不抛错', () => {
    for (const bogus of ['', 'nonexistent', 'DAOLV', '__proto__', undefined as unknown as string]) {
      const mark = bondMark(bogus)
      expect(mark.rank, `${String(bogus)} 应退回第一阶`).toBe(0)
      expect(mark.pips).toBe(1)
      expect(mark.label).toBe(STAGE_NAMES.none)
    }
  })
})

describe('缘阶形制 · 四、两处界面都接上了', () => {
  it('道侣弹窗:当前缘阶与历世同行都带形制', () => {
    expect(DIALOG, '弹窗应读当前缘阶').toContain("bondMark(bond.value?.stage ?? 'none')")
    expect(DIALOG, '弹窗应挂缘纹').toContain('bond-crest--${mark.glyph}')
    expect(DIALOG, '弹窗应挂阶点').toContain('bond-pips')
    expect(DIALOG, '历世同行也应带缘纹').toContain('bondMark(r.stage).glyph')
  })

  it('角色页入口卡:阶点与最上阶外环', () => {
    expect(ENTRY, '入口卡应读缘阶').toContain('bondMark(bond.value?.stage ??')
    expect(ENTRY, '入口卡应挂阶点').toContain('bond-pips')
    expect(ENTRY, '外环只在最上阶').toContain('bondStageMark.top')
  })

  it('缘纹是装饰:读屏靠阶名的 aria-label', () => {
    expect(DIALOG, '缘纹应带阶名的可访问名').toContain(':aria-label="`${mark.label}阶`"')
    expect(ENTRY, '入口卡的阶点应带阶名的可访问名').toContain(':aria-label="`${bondStageMark.label}阶`"')
    // 裸 span 挂 aria-label 必须配 role(与 uiLayering 的「名字要有 role」同源)
    expect(DIALOG, '缘纹须 role="img" 才接得住可访问名').toMatch(/bond-crest[\s\S]{0,240}role="img"/)
  })
})
