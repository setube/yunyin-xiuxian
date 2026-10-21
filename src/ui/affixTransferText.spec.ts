/**
 * 词条转移文案(议题 #22)—— 按界面文案规范守长度与措辞
 *
 * 规范:状态 ≤8 字、按钮 2~6 字、提示 ≤12 字;不解释、不劝导、不用客服话术。
 * 故障注入:把任一标签改成「请选择目标」→ 禁用措辞那条红。
 */
import { describe, expect, it } from 'vitest'
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

/** 数汉字以外的字也算一个,只去空白(「转 移」的空格是排版,不是字) */
const len = (s: string): number => s.replace(/\s/g, '').length
const BANNED = /请|即可|因为|所以|由于|建议|你可以|以便|方便|不足|帮助你/

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

  it('挡住的原因:每个原因码都有字,≤8 字;品质不够写明要哪一品', () => {
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
    expect(transferShortText('stone')).toBe('灵石未足')
    expect(transferShortText('dust')).toBe('器灵尘未足')
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
    // 名字取 STAT_NAMES:与面板、战报同一条词条同一个叫法
    expect(transferAffixText({ id: 'atk1', roll: 1 })).toBe('「锋锐」攻击 +5%')
    // 重名的「破妄」靠效果句分得开
    expect(transferAffixText({ id: 'dmg1', roll: 0 })).not.toBe(transferAffixText({ id: 'ac2', roll: 0 }))
    expect(transferDeltaText({ attackPct: 0.05, defensePct: 0.03 }, { attackPct: 0.1, defensePct: 0.03 })).toBe('攻击 +5%')
  })
})
