import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HERITAGE } from '@/core/samsaraAudit'
import { heritageViewRows, rebirthDecisionHint } from './rebirthText'

describe('rebirthDecisionHint', () => {
  it('matches carryGongfa: levels return to 1, artifacts are not kept', () => {
    const text = rebirthDecisionHint()
    expect(HERITAGE.find(r => r.id === 'artifacts')?.mode).toBe('reset')
    expect(HERITAGE.find(r => r.id === 'gongfa')?.mode).toBe('partial')
    expect(text).toContain('一层')
    expect(text).toContain('法宝')
    expect(text).not.toContain('折半')
    expect(text).not.toMatch(/保留[^。]*法宝/)
  })

  it('the character sheet uses the shared hint, not a second summary', () => {
    const src = readFileSync(resolve(__dirname, '../views/CharacterView.vue'), 'utf8')
    expect(src).toContain('rebirthDecisionHint()')
    expect(src).not.toContain('功法折半')
  })
})

describe('heritageViewRows 去留一览(与 HERITAGE 同表)', () => {
  it('逐行对应:一条 HERITAGE 一行,名号一致,留/去与 mode 同义', () => {
    const rows = heritageViewRows()
    expect(rows.length).toBe(HERITAGE.length)
    for (const r of HERITAGE) {
      const row = rows.find(x => x.id === r.id)
      expect(row).toBeDefined()
      expect(row!.name).toBe(r.name)
      expect(row!.mode).toBe(r.mode)
    }
  })

  it('措辞三态:全留/部分/归零各自成词,随魂一色、归零灰', () => {
    const rows = heritageViewRows()
    expect(rows.find(r => r.id === 'daoFruit')!.modeLabel).toBe('随魂保留')
    expect(rows.find(r => r.id === 'daoFruit')!.cls).toBe('text-jade')
    expect(rows.find(r => r.id === 'gongfa')!.modeLabel).toBe('部分保留')
    expect(rows.find(r => r.id === 'realm')!.modeLabel).toBe('归零重来')
    expect(rows.find(r => r.id === 'realm')!.cls).toBe('text-ink-faint')
  })
})
