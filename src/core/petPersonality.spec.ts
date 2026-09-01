/**
 * Phase 31.0 S4:灵兽性格 —— 行为倾向而非纯数值
 */
import { describe, it, expect } from 'vitest'
import { personalityEffects, personalityDesc, PERSONALITY_NAMES } from './petPersonality'
import { PETS, petDef } from '@/data/pets'

describe('灵兽性格(personality)', () => {
  it('每只灵兽都有性格,且性格名齐全', () => {
    for (const p of PETS) {
      expect(PERSONALITY_NAMES[p.personality]).toBeTruthy()
      expect(petDef(p.id)?.personality).toBe(p.personality)
    }
  })

  it('性格效果区分明显:贪宝更易掉宝,好战更险,谨慎更稳', () => {
    const greedy = personalityEffects('pet_qingyu')
    const fierce = personalityEffects('pet_huoque')
    const cautious = personalityEffects('pet_yueying')
    expect(greedy.dropLuck).toBeGreaterThan(cautious.dropLuck)
    expect(fierce.dangerMult).toBeGreaterThan(cautious.dangerMult)
    expect(cautious.lossReduction).toBeGreaterThan(fierce.lossReduction)
  })

  it('慢稳探索更久', () => {
    const steady = personalityEffects('pet_xuegui')
    expect(steady.exploreDurMult).toBeGreaterThan(1)
    expect(personalityEffects(null).exploreDurMult).toBe(1)
  })

  it('性格描述可读', () => {
    expect(personalityDesc('greedy')).toContain('稀有')
    expect(personalityDesc('fierce')).toContain('战斗')
  })

  it('petDef 回查正常', () => {
    expect(petDef('pet_qingyu')?.personality).toBe('greedy')
  })
})
