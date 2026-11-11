/**
 * 词条转移文案(议题 #22):状态 ≤8 字、按钮 2~6 字、提示 ≤12 字;不解释、不劝导、不用客服话术。
 * 故障注入:把任一标签改成「请选择目标」,禁用措辞那条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AFFIXES } from '@/data/affixes'
import { gn } from '@/utils/gnum'
import {
  TRANSFER_LABELS,
  transferAffixText,
  transferBlockText,
  transferDeltaText,
  transferDoneToast,
  transferShortText,
  transferStoneText
} from './affixTransferText'
import type { TransferBlock } from '@/core/affixTransfer'

/** 非汉字也计一个字,只去空白(「转 移」的空格是排版) */
const len = (s: string): number => s.replace(/\s/g, '').length
const BANNED = /请|即可|因为|所以|由于|建议|你可以|以便|方便|帮助你/

const BUTTONS = ['entry', 'back', 'change', 'view', 'go', 'confirm', 'cancel'] as const
const BLOCKS: TransferBlock[] = ['same', 'noAffix', 'noTemplate', 'slot', 'rank', 'dup', 'noLanding', 'full', 'stack', 'sealFull']

describe('词条转移文案 · 长度与措辞', () => {
  it('按钮 2~6 字,其余标签(状态)≤8 字', () => {
    for (const [key, text] of Object.entries(TRANSFER_LABELS)) {
      if ((BUTTONS as readonly string[]).includes(key)) {
        expect(len(text), `按钮「${text}」`).toBeGreaterThanOrEqual(2)
        expect(len(text), `按钮「${text}」`).toBeLessThanOrEqual(6)
      } else {
        expect(len(text), `标签「${text}」`).toBeLessThanOrEqual(8)
      }
    }
  })

  it('挡住的原因:每个原因码都有字,≤8 字;品质不足写明要哪一品', () => {
    for (const b of BLOCKS) {
      const text = transferBlockText(b, 'pen3')
      expect(text.length, b).toBeGreaterThan(0)
      expect(len(text), `${b}「${text}」`).toBeLessThanOrEqual(8)
    }
    for (const def of AFFIXES.filter(a => a.minRank !== undefined)) {
      expect(transferBlockText('rank', def.id), def.id).toMatch(/^需.品$/)
    }
  })

  it('提示 ≤12 字(用最长的词条名量);缺料分项报', () => {
    const longest = [...AFFIXES].sort((a, b) => b.name.length - a.name.length)[0]!
    expect(len(transferDoneToast(longest.name)), transferDoneToast(longest.name)).toBeLessThanOrEqual(12)
    // 无差额时与全仓同词:「X不足」
    expect(transferShortText('stone')).toBe('灵石不足')
    expect(transferShortText('dust')).toBe('器灵尘不足')
    expect(transferShortText('stone', { stone: '7', dust: 0 })).toBe('灵石尚差 7')
    expect(transferShortText('dust', { stone: '0', dust: 2 })).toBe('器灵尘尚差 2')
  })

  it('不解释、不劝导:所有文案不含禁用措辞', () => {
    const all = [
      ...Object.values(TRANSFER_LABELS),
      ...BLOCKS.map(b => transferBlockText(b, 'pen3')),
      transferShortText('stone'),
      transferShortText('dust'),
      transferDoneToast('洞虚')
    ]
    for (const text of all) expect(text, text).not.toMatch(BANNED)
  })

  it('数值行:价签带灵石;词条整句代入数值;属性变化只列变了的', () => {
    expect(transferStoneText(gn(12345))).toMatch(/^灵石 /)
    // 名取 STAT_NAMES,与面板、战报同名
    expect(transferAffixText({ id: 'atk1', roll: 1 })).toBe('「锋锐」攻击 +5%')
    // 两个不同词条同 roll 时文案必须不同(效果句各不相同);词条名本身已保证唯一,见 dataTextAudit
    expect(transferAffixText({ id: 'dmg1', roll: 0 })).not.toBe(transferAffixText({ id: 'ac2', roll: 0 }))
    expect(transferDeltaText({ attackPct: 0.05, defensePct: 0.03 }, { attackPct: 0.1, defensePct: 0.03 })).toBe('攻击 +5%')
  })
})

describe('词条转移面板 · 落位行只查一次表', () => {
  /**
   * 模板里原来一颗钮就调 5 次 `targetLine(l.replaceId)`,而它只是
   * `props.flow.targetLines.find(...)` —— 每个落位行都重算,且列表本身还会重建。
   *
   * 这与 TrialPanel 的 pactRows、MarksPanel 的 markRows、EquipmentDetailDialog 的 setMark
   * 是同一类:纯查表在 setup 里算一次,模板只读字段。
   */
  it('landings 自带匹配到的目标行,模板不再按 id 回查', () => {
    const panel = readFileSync(join(__dirname, '../components/equipment/AffixTransferPanel.vue'), 'utf8')
    const tpl = panel.slice(0, panel.indexOf('<script'))
    expect(tpl, '模板里还在按 id 回查目标行').not.toContain('targetLine(')
    expect(tpl, '模板该直读落位行自带的字段').toContain('l.target')

    const flow = readFileSync(join(__dirname, '../composables/useAffixTransfer.ts'), 'utf8')
    expect(flow, 'landings 该在 setup 里把目标行配上').toMatch(/transferLandings\([^)]*\)\.map\(/)
    expect(flow, '该用 find 配一次').toContain('lines.find(x => x.id === l.replaceId)')
  })

  it('targetLines 不再对外暴露 —— 没人读了就别留第二个入口', () => {
    const flow = readFileSync(join(__dirname, '../composables/useAffixTransfer.ts'), 'utf8')
    // 只许出现在内部 computed 与 landings 里,不许出现在 return 的对象上
    const ret = flow.slice(flow.lastIndexOf('return {'))
    expect(ret, 'targetLines 已无外部读者,不该再导出').not.toContain('targetLines,')
  })
})

/**
 * 状态词只许从 TRANSFER_LABELS 取,不许在界面里另写一份。
 *
 * 这四句原先各有旁路:
 *   「不可封存」  reforgeText.sealMustLeaveToast 手写一遍(注释还写着「与词条转移同说法」)
 *   「暂无词条」  EquipReforgeFooter 的模板里手写一遍
 *   「未选目标」  AutoReforgePanel 的 title 里手写一遍
 *   「未找到装备」useAutoReforge 的 toast 里手写一遍
 * 表里本来就都有对应键 —— 旁路一多,改词就得全仓搜,漏一处就是两套说法。
 *
 * 判据:四处调用点都读表,且这些文件里不许再出现字面量。
 */
describe('词条转移 · 状态词只有表里那一份', () => {
  const read = (p: string): string => readFileSync(join(__dirname, p), 'utf8')
  const SITES = [
    { file: '../ui/reforgeText.ts', key: 'sealFull', word: '不可封存' },
    { file: '../components/equipment/EquipReforgeFooter.vue', key: 'noAffix', word: '暂无词条' },
    { file: '../components/equipment/AutoReforgePanel.vue', key: 'pendingTarget', word: '未选目标' },
    { file: '../composables/useAutoReforge.ts', key: 'gone', word: '未找到装备' }
  ] as const

  it('四处都读表里的键', () => {
    for (const s of SITES) {
      const src = read(s.file)
      expect(src, `${s.file} 该读 TRANSFER_LABELS.${s.key}`).toContain(`TRANSFER_LABELS.${s.key}`)
    }
  })

  it('这些文件里不许再出现同一句的字面量', () => {
    for (const s of SITES) {
      const src = stripComments(read(s.file))
      expect(src, `${s.file} 又手写了一遍「${s.word}」`).not.toContain(`'${s.word}'`)
    }
  })

  it('表里那些键确实还在', () => {
    for (const s of SITES) {
      expect(TRANSFER_LABELS[s.key], `TRANSFER_LABELS 缺 ${s.key}`).toBe(s.word)
    }
  })
})

/** 剥掉注释:注释里提到这个词不算玩家可见文案 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}
