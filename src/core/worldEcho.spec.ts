/**
 * Phase 31.4:世界遗产叙事 —— 宿敌残魂 + 区域凭吊
 * 纯叙事:不改变奖励/属性/战斗规则
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ghostOf, ghostTitle, ghostLeadIn, ECHO_GHOST_CHANCE, emptyNemeses, recordLoss } from './worldMemory'
import { memorialLine, MEMORIAL_CHANCE } from './suppress'
import { usePlayerStore } from '@/stores/player'
import type { NemesisRecord } from '@/types'

describe('宿敌残魂(ghost)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('只有已雪耻的宿敌才有残魂形态', () => {
    let list: NemesisRecord[] = emptyNemeses()
    for (let i = 0; i < 3; i++) list = recordLoss(list, 'e_wolfking', '独角妖狼', 'qingyun', Date.now()).list
    // 未雪耻:无残魂
    expect(ghostOf(list, 'e_wolfking')).toBeNull()
  })

  it('雪耻后宿敌可化残魂,前缀与引导语完整', () => {
    let list: NemesisRecord[] = emptyNemeses()
    for (let i = 0; i < 3; i++) list = recordLoss(list, 'e_wolfking', '独角妖狼', 'qingyun', Date.now()).list
    const avenged = list.map(n => ({ ...n, avengedAt: Date.now() }))
    const ghost = ghostOf(avenged, 'e_wolfking')
    expect(ghost).not.toBeNull()
    expect(ghostTitle(ghost!)).toBe('残魂·独角妖狼')
    expect(ghostLeadIn(ghost!)).toContain('3败于此')
  })

  it('残魂概率稀有(3%),非宿敌敌不出残魂', () => {
    expect(ECHO_GHOST_CHANCE).toBe(0.03)
    const list: NemesisRecord[] = []
    expect(ghostOf(list, 'e_wolf')).toBeNull()
  })
})

describe('区域凭吊(memorial)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('被镇压过的区域出现凭吊叙事,含"石碑/道号"意象', () => {
    const player = usePlayerStore()
    player.suppressRegion('qingyun')
    const line = memorialLine('qingyun', player)
    expect(line).not.toBeNull()
    expect(line!).toContain('石碑')
    expect(line!).toContain('道号')
  })

  it('未镇压区域无凭吊', () => {
    const player = usePlayerStore()
    expect(memorialLine('luoxia', player)).toBeNull()
  })

  it('凭吊概率低(4%)', () => {
    expect(MEMORIAL_CHANCE).toBe(0.04)
  })
})
