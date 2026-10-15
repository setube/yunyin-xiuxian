import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '@/data/achievements'
import { COUNTER_DIRECTIONS } from '@/ui/achievementHint'
import { offlineAgeNote, offlineAwayPhrase } from '@/ui/offlineText'

function src(from: string): string {
  return readFileSync(resolve(__dirname, from), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

describe('离线归来 ≠ 闭关', () => {
  it('卷轴时长写「此去」,封顶时交代结算口径,并披露离线 0.9 折扣', () => {
    // OFFLINE_EFFICIENCY=0.9:「离线可攒 X 时」是上限,账面按九成结算 —— 不能当哑谜
    expect(offlineAwayPhrase('8小时')).toContain('此去 8小时')
    expect(offlineAwayPhrase('8小时')).toContain('90%')
    expect(offlineAwayPhrase('60小时', '8小时')).toContain('收益按 8小时 结算')
    expect(offlineAwayPhrase('60小时', '8小时')).toContain('90%')
  })

  it('寿元说明也用「此去」,不冒充闭关', () => {
    expect(offlineAgeNote(60)).toBe('此去寿元流逝 60 载')
    expect(offlineAgeNote(60)).not.toContain('闭关')
  })

  it('归来弹窗与离线结算源码不把离开写成闭关', () => {
    const dialog = src('../components/offline/OfflineRewardDialog.vue')
    expect(dialog, '弹窗时长应走 offlineAwayPhrase').toContain('offlineAwayPhrase')
    expect(dialog).not.toContain('闭关')
    expect(dialog, '际遇行应对上历练际遇,不另起「路遇际会」').toContain('途中际遇')
    const settle = src('../core/offline.ts')
    expect(settle).toContain('offlineAgeNote')
    expect(settle).not.toMatch(/闭关期间寿元/)
  })

  it('离线成就与方向不把领取归来收益写成闭关', () => {
    const off = ACHIEVEMENTS.filter(a => a.id.startsWith('a_off'))
    expect(off.length, '离线成就被删了,这条就空转').toBeGreaterThanOrEqual(2)
    for (const a of off) {
      expect(a.name, `${a.id} 名目仍写成闭关`).not.toContain('闭关')
      expect(a.desc).toContain('离线')
    }
    expect(COUNTER_DIRECTIONS.offlineClaims).toBe('离府归来')
    expect(COUNTER_DIRECTIONS.offlineClaims).not.toContain('闭关')
  })
})
