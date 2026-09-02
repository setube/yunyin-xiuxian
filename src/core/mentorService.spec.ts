/* eslint-disable no-console */
/**
 * Phase 31.0 S1:师承 —— 修行理念与行为叙事
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mentorVerdict, mentorChoices } from './mentorService'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { modOf } from './statsCalc'

describe('师承(mentor)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('数据表完整:四种师承、各有词条与叙事', () => {
    const list = mentorChoices()
    expect(list.length).toBe(4)
    for (const m of list) {
      expect(m.mods).toBeTruthy()
      expect(m.narrative.aligned).toBeTruthy()
      expect(m.narrative.unaligned).toBeTruthy()
    }
  })

  it('师承词条并入最终属性(剑修 → 暴击/伤害加成)', () => {
    const player = usePlayerStore()
    player.adoptMentor('swordsman')
    const crit = modOf(player.finalStats.mods, 'critRate')
    expect(crit).toBeGreaterThan(0.02)
  })

  it('师承一经确立不可更改', () => {
    const player = usePlayerStore()
    player.adoptMentor('swordsman')
    player.adoptMentor('alchemist')
    expect(player.mentor).toBe('swordsman')
  })

  it('叙事:行为对齐(大量击杀)→ 契合;未拜师 → 无评价', () => {
    const player = usePlayerStore()
    player.adoptMentor('swordsman')
    const quests = useQuestsStore()
    quests.inc('kills', 500)
    quests.inc('bossKills', 30)
    const verdict = mentorVerdict(player.mentor)
    expect(verdict).not.toBeNull()
    console.log(`[师承叙事] ${verdict!.line}`)
    expect(verdict!.affinity).toBeGreaterThan(0)
    expect(verdict!.line).toContain('剑')
  })

  it('未拜师时无评价', () => {
    expect(mentorVerdict(null)).toBeNull()
  })
})
