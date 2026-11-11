/**
 * 「灵石/器灵尘 尚差 N」只有一处实现。
 *
 * 这段文案原先在 ui/reforgeText.reforgeShortToast 与 ui/affixTransferText.transferShortText
 * 里各写一遍,逐字相同。抄两份时若只改一处,同一种「灵石缺了 7 点」会在强化与词条转移里
 * 说成两种样子 —— 而玩家看不出这是两个独立实现。
 *
 * 现已收进 ui/resourceShortText,两个入口转为调用它。本文件钉三件事:
 * 纯函数在各输入下的句子、两个入口逐字一致、文案不含禁用措辞。
 */
import { describe, expect, it } from 'vitest'
import { resourceShortText } from './resourceShortText'
import { reforgeShortToast } from './reforgeText'
import { transferShortText } from './affixTransferText'
import { artifactShortToast, upgradeShortToast } from './forgeText'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** AGENTS.md 里禁用的 AI 式解释与客服话术 */
const BANNED = /因为|所以|由于|因此|请|以便|即可|方便|帮助|建议|可以|尝试|稍后再试/

describe('缺资源文案 · 纯函数', () => {
  it('拿不到差额时说「不足」', () => {
    expect(resourceShortText('stone')).toBe('灵石不足')
    expect(resourceShortText('dust')).toBe('器灵尘不足')
  })

  it('拿得到差额时说「尚差 N」', () => {
    expect(resourceShortText('stone', { stone: '7', dust: 0 })).toBe('灵石尚差 7')
    expect(resourceShortText('dust', { stone: '0', dust: 2 })).toBe('器灵尘尚差 2')
  })

  it('只报缺的那一样:报灵石时不把尘的数带出来', () => {
    const stoneLine = resourceShortText('stone', { stone: '9', dust: 123 })
    expect(stoneLine, '石头的句子不该出现尘的数').not.toContain('123')
    expect(stoneLine).toContain('9')
    const dustLine = resourceShortText('dust', { stone: '999', dust: 4 })
    expect(dustLine, '尘的句子不该出现石头的数').not.toContain('999')
    expect(dustLine).toContain('4')
  })

  it('差额为 0 时照实报「尚差 0」—— 该由调用方决定不显示,不在这里改口径', () => {
    // 钳制后的差额本就该是 0;这里只钉函数不擅自把它变成「不足」
    expect(resourceShortText('dust', { stone: '0', dust: 0 })).toBe('器灵尘尚差 0')
  })

  it('不解释、不劝导', () => {
    for (const s of ['stone', 'dust'] as const) {
      for (const gap of [undefined, { stone: '3', dust: 5 }]) {
        const text = resourceShortText(s, gap)
        expect(text, text).not.toMatch(BANNED)
      }
    }
  })
})

describe('缺资源文案 · 两个入口同源', () => {
  it('强化、重铸、词条转移三处在同样输入下逐字相同', () => {
    const cases: Array<[('stone' | 'dust'), { stone: string; dust: number } | undefined]> = [
      ['stone', undefined],
      ['dust', undefined],
      ['stone', { stone: '7', dust: 0 }],
      ['dust', { stone: '0', dust: 2 }],
      ['stone', { stone: '1234', dust: 5678 }],
      ['dust', { stone: '0', dust: 1 }],
      // 差额恰为 0 是**分叉过的那个输入**:强化原先按 falsy 报「不足」,
      // 共享实现照实报「尚差 0」。这条留着防它再分叉
      ['dust', { stone: '0', dust: 0 }],
      ['stone', { stone: '0', dust: 0 }]
    ]
    for (const [short, gap] of cases) {
      const want = resourceShortText(short, gap)
      expect(reforgeShortToast(short, gap), `${short}/${JSON.stringify(gap)} 重铸与共享实现不一致`).toBe(want)
      expect(transferShortText(short, gap), `${short}/${JSON.stringify(gap)} 词条转移与共享实现不一致`).toBe(want)
      expect(upgradeShortToast(short, gap), `${short}/${JSON.stringify(gap)} 强化与共享实现不一致`).toBe(want)
    }
  })

  it('祭炼的两样差额也走同一句话', () => {
    // 祭炼缺的是悟道点 / 灵石(不是尘),故按 shortageText 比
    expect(artifactShortToast('wudao'), '拿不到差额说不足').toBe('悟道点不足')
    expect(artifactShortToast('stone'), '拿不到差额说不足').toBe('灵石不足')
    expect(artifactShortToast('wudao', { wudao: 6, stone: '0' })).toBe('悟道点尚差 6')
    expect(artifactShortToast('stone', { wudao: 0, stone: '91.2' })).toBe('灵石尚差 91.2')
    // 差额为 0 照实报,与另三处同一口径
    expect(artifactShortToast('wudao', { wudao: 0, stone: '0' })).toBe('悟道点尚差 0')
  })

  it('三个入口都不自己拼句子,只转调共享实现', () => {
    const src = (p: string): string => readFileSync(resolve(__dirname, p), 'utf-8')
    for (const f of ['./reforgeText.ts', './affixTransferText.ts', './forgeText.ts']) {
      const body = src(f)
      expect(body, `${f} 该调用 resourceShortText`).toContain('resourceShortText(')
      // 不许再出现各自拼「尚差」的字样
      expect(body, `${f} 仍在自己拼句子`).not.toMatch(/尚差 \$\{/)
    }
  })
})
