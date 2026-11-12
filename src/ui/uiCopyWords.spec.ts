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
import { join, resolve } from 'node:path'

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
  // 五个文件回执已收进 ui/saveFileText(两个导入入口共用一份),故落点改到常量文件
  ['文件为空', 'src/ui/saveFileText.ts'],
  ['复制失败', 'src/components/settings/SettingsDiagnosticsSection.vue'],
  ['导出存档', 'src/components/settings/SettingsDiagnosticsSection.vue'],
  ['修为未至圆满', 'src/ui/cultivationText.ts'],
  ['应 战', 'src/components/celestial/TrialPanel.vue'],
  ['分解(已上锁)', 'src/components/equipment/EquipmentDetailDialog.vue'],
  ['分解(已装备)', 'src/components/equipment/EquipmentDetailDialog.vue'],
  /*
   * 下面五条是查漏补的:它们在文档「固定写法」里被点名、代码里也一直存在,
   * 却从没进过这份清单 —— 有人照文档反例改回去,不会有任何东西拦他。
   */
  ['存档写入失败', 'src/App.vue'],
  ['导出失败', 'src/ui/saveFileText.ts'],
  ['强化已至上限', 'src/ui/forgeText.ts'],
  ['历练在途', 'src/ui/homeStatus.ts'],
  ['已装备', 'src/ui/affixTransferText.ts']
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

  it('两个导入入口都引用 saveFileText,不各写一份回执', () => {
    for (const file of [
      'src/components/settings/SettingsSaveSection.vue',
      'src/views/WelcomeView.vue'
    ]) {
      const text = readFileSync(file, 'utf-8')
      expect(text, `${file} 又手写了文件回执`).not.toContain("'文件为空'")
      expect(text, `${file} 该引用 SAVE_FILE_TEXT`).toContain('SAVE_FILE_TEXT.')
    }
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

/**
 * 固定宽度的数值标签要装得下三位数。
 *
 * 轮回录的世号列原先写 `w-11`(44px),两位数时正好,到「第118世」就折成两行 ——
 * 实测 375 宽下 21 条三位数世号全部 h=36,而 90 条两位数都是 h=18。
 * 这类宽度写死在模板里、没有任何判据管,只有真到三位数才显形。
 *
 * 这里钉两条:世号列不得再用 w-11(挡回退),且必须带 whitespace-nowrap
 * (宽度再不够时宁可溢出被看见,也不许悄悄折行)。
 */
describe('轮回录 · 世号列装得下三位数', () => {
  const legacy = readFileSync(resolve(__dirname, '../views/LegacyView.vue'), 'utf-8')

  it('页面上每一处世号都带 whitespace-nowrap', () => {
    /*
     * 上一条只盯列表里那一列。实测发现**另外两处**世号也会折:
     * 顶部状态条「第 {{ count + 1 }} 世」与纪录行的「第 {{ r.life }} 世 · note」——
     * 它们都在 flex 行里与可伸缩的兄弟挤,300 宽、999 世时都折成两行(h=30)。
     * 这里按「出现 `世` 且带插值」的 span 逐一要求 nowrap,免得下次又只修一处。
     */
    const lines = legacy.split('\n').filter(l => l.includes('<span') && /第\s*\{\{[^}]*\}\}\s*世/.test(l))
    expect(lines.length, '轮回录里该有多处世号').toBeGreaterThanOrEqual(2)
    const missing = lines.filter(l => !l.includes('whitespace-nowrap'))
    expect(missing.map(l => l.trim().slice(0, 80)), '这些世号没带 whitespace-nowrap,拥挤时会折行').toEqual([])
  })

  it('世号列不再是 w-11,且带 whitespace-nowrap', () => {
    const line = legacy.split('\n').find(l => l.includes('第{{ l.index }}世'))
    expect(line, '轮回录里没找到世号列').toBeTruthy()
    expect(line!.includes('w-11'), 'w-11(44px)装三位数世号会折行,已放宽到 w-13').toBe(false)
    expect(line!.includes('whitespace-nowrap'), '世号列须带 whitespace-nowrap,不许悄悄折行').toBe(true)
  })
})

/**
 * 多块挤在一行时,整行要能换行、每块内部不折。
 *
 * 轮回录与属性页都踩过同一个坑:把某一处 nowrap 之后,压力转移到旁边的块上,
 * 把它从一行挤成两三行(属性页「伤害减免」+「软」标记在 300 宽下 h 从 15 涨到 33;
 * 轮回录境界名在 280 宽下 h 到 36)。正确做法是容器 `flex-wrap`,
 * 块与块之间换行、块内部 nowrap。
 *
 * 这里按文件钉住这两个容器的写法,挡回「只给其中一块加 nowrap」的半修。
 */
describe('多块行 · 容器可换行、块内不折', () => {
  it('轮回录的两处多块行都带 flex-wrap', () => {
    const legacy = readFileSync(resolve(__dirname, '../views/LegacyView.vue'), 'utf-8')
    /*
     * 只钉这两行,不搞「所有 flex 行都要 flex-wrap」——
     * 实测记住行(nemesisRows)/ 情缘行(chainRows)在 300~375 宽下都不折:
     * 它们的中间块带 `min-w-0 truncate` 或 `ml-auto`,空间不够时先压缩那里,
     * 不会把别的块挤断。判据写宽了会逼人给不需要的行也加 flex-wrap。
     */
    const anchors = ['第 {{ player.reincarnation.count + 1 }} 世', '第{{ l.index }}世']
    for (const anchor of anchors) {
      const idx = legacy.indexOf(anchor)
      expect(idx, `轮回录里没找到「${anchor}」所在行`).toBeGreaterThan(0)
      // 往回找该行的 <p ...>
      const lineStart = legacy.lastIndexOf('<p ', idx)
      const line = legacy.slice(lineStart, legacy.indexOf('>', lineStart) + 1)
      expect(line, `「${anchor}」那一行该带 flex-wrap`).toContain('flex-wrap')
    }
  })

  it('属性页词条行的三段都带 nowrap', () => {
    const view = readFileSync(resolve(__dirname, '../views/CharacterView.vue'), 'utf-8')
    const block = view.slice(view.indexOf('v-for="row in modRows"'), view.indexOf('v-for="row in modRows"') + 800)
    expect(block.match(/whitespace-nowrap/g)?.length ?? 0, '词条名、软标记、百分比三段都要 nowrap').toBeGreaterThanOrEqual(3)
  })
})
