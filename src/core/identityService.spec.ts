/**
 * Phase 31.2:修行身份 — 历史行为的归纳,非职业标签
 * 审计:无数值加成/无新资源/描述随历史变化
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildIdentity } from './identityService'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useEndgameStore } from '@/stores/endgame'
import { useCultivationStore } from '@/stores/cultivation'

describe('修行身份(identityService)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新人:无常识,默认为云隐散人', () => {
    const id = buildIdentity()
    expect(id.epithet).toBe('云隐散人')
    expect(id.roots.fortunes.length).toBe(0)
    expect(id.traits.riskBias).toBeNull()
  })

  it('机缘取过 → 根因记录', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_sword_remnant: 'take', ft_beast_pledge: 'take' })
    const id = buildIdentity()
    expect(id.roots.fortunes.map(f => f.title)).toContain('剑痕悟道')
  })

  it('师承+道途 → 称谓由两者合成(剑道+剑修 → 问剑剑心)', () => {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    player.adoptMentor('swordsman')
    endgame.chooseDao('sword')
    const id = buildIdentity()
    expect(id.epithet).toBe('问剑剑心')
  })

  it('功法分支计入根因', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    for (let i = 0; i < 9; i++) cul.upgrade('m_taixuan')
    cul.chooseBranch('m_taixuan', 'b_taixuan_sha')
    const id = buildIdentity()
    expect(id.roots.branches).toContain('杀伐')
  })

  it('身份是描述,不含任何数值加成字段', () => {
    const id = buildIdentity()
    // 无 mods / 无 buffs / 无战力字段
    expect('mods' in id).toBe(false)
    expect('bonus' in id).toBe(false)
    expect('power' in id).toBe(false)
  })

  it('叙事随行为变化(击杀多 → 偏好以险求胜)', () => {
    const quests = useQuestsStore()
    quests.inc('kills', 500)
    quests.inc('explores', 50)
    const id = buildIdentity()
    expect(id.traits.riskBias).toBe('gamble')
    expect(id.narrative).toContain('以险求胜')
  })
})
