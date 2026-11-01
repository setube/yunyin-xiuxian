/**
 * AGENTS.md「固定写法」里的状态词,在代码里必须真的那么写。
 *
 * 那份文档不只是风格建议 —— 它逐条列了正确写法与**反例**
 * (「行囊中无可化尘之物」→「无可化尘」、「导出没能完成,请稍后再试」→「导出失败」)。
 * 但这些词此前几乎没有测试引用:全量扫下来 12 个状态词在代码里有、在 spec 里没有,
 * 于是有人照反例改回去,不会有任何东西拦他。
 *
 * 本条按文档登记这些词与它们的落点(按文件认,不按行号),把「文档说要有」变成「代码里真有」。
 * 另附反例清单:文档点名批评过的长句不许在源码出现。
 *
 * 不写「自动从文档抽词」的原因是那会连同文档里的**反例**一起抽出来,
 * 需要人工判断哪边是正例,不如显式登记。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/components', 'src/views', 'src/ui', 'src/core']

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (/\.(ts|vue)$/.test(ent.name) && !ent.name.endsWith('.spec.ts')) {
        out.push({ path: full, text: readFileSync(full, 'utf-8') })
      }
    }
  }
  for (const r of ROOTS) walk(r)
  return out
}

/** 文档「固定写法」里逐条点名的状态词,以及它在代码里的落点(按文件认) */
const REQUIRED: readonly (readonly [string, string])[] = [
  ['无可化尘', 'src/ui/inventoryText.ts'],
  ['暂无战报', 'src/components/adventure/CombatPanel.vue'],
  ['暂无藏品', 'src/views/InventoryView.vue'],
  ['暂无纪录', 'src/views/LegacyView.vue'],
  ['货架已刷新', 'src/components/market/MarketShelfSection.vue'],
  ['文件为空', 'src/components/settings/SettingsSaveSection.vue'],
  ['复制失败', 'src/components/settings/SettingsDiagnosticsSection.vue'],
  ['导出存档', 'src/components/settings/SettingsDiagnosticsSection.vue'],
  ['修为未至圆满', 'src/ui/cultivationText.ts'],
  ['应 战', 'src/components/celestial/TrialPanel.vue'],
  ['分解(已上锁)', 'src/components/equipment/EquipmentDetailDialog.vue'],
  ['分解(已装备)', 'src/components/equipment/EquipmentDetailDialog.vue']
]

/** 文档里当反例批评过的长句,源码里不许出现 */
const BANNED = [
  '行囊中无可化尘之物',
  '此器已至锤炼之极',
  '器灵尘尚差 2,炉火难续',
  '导出没能完成',
  '这个文件读不出来',
  '今日已兑满,明日再来',
  '请稍后再试',
  '感谢您的理解',
  '建议您'
]

describe('AGENTS.md 固定写法 · 状态词要在代码里', () => {
  it('扫到了源码(防空转)', () => {
    expect(sources().length).toBeGreaterThan(100)
  })

  it.each(REQUIRED)('「%s」仍按文档写法出现在 %s', (word, file) => {
    const text = readFileSync(file, 'utf-8')
    expect(text, `${file} 里找不到文档规定的「${word}」`).toContain(word)
  })

  it('文档点名批评过的反例,源码里一处都不许有', () => {
    const all = sources()
    const hits: string[] = []
    for (const banned of BANNED) {
      for (const { path: p, text } of all) {
        if (text.includes(banned)) hits.push(`${p} 含反例「${banned}」`)
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('状态词主词都不超过 8 个汉字(文档的硬线)', () => {
    for (const [word] of REQUIRED) {
      // 「分解(已上锁)」这类括号里的拒因不计入主词长度
      const main = (word.split('(')[0] ?? word).replace(/[^\u4e00-\u9fa5]/g, '')
      expect(main.length, `「${word}」主词 ${main.length} 字,超过 8 字`).toBeLessThanOrEqual(8)
    }
  })
})
