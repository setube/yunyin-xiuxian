/**
 * 际遇/机缘掉装备 —— 品质 luck 与战斗/离线掉落同源,并入灵兽性格掉落倾向(dropLuck)。
 * 此前事件路径只带 mods.luck,漏了性格:贪宝宠物让战斗/离线装备更易稀出,
 * 事件杯装备却不受影响 —— 同一只宠物,两套运气。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EventDef } from '@/types'
import { resolveEventChoice } from './eventEngine'
import { generateEquipment } from './equipGen'

vi.mock('./equipGen', async importOriginal => {
  const mod = await importOriginal<typeof import('./equipGen')>()
  return {
    ...mod,
    generateEquipment: vi.fn(() => ({
      uid: 'event-pet-spec',
      templateId: 'w_iron',
      quality: 'mortal',
      tier: 1,
      level: 0,
      affixes: []
    }))
  }
})

import { usePlayerStore } from '@/stores/player'

describe('际遇/机缘掉装备并入灵兽性格掉落倾向(dropLuck)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(generateEquipment).mockClear()
  })

  function seedPet(petId: string | null): void {
    const player = usePlayerStore()
    player.initCharacter('拾珍', { roots: [] } as never)
    if (petId) player.setPet(petId)
  }

  /** 品质 luck 里还叠着命格等常驻底色 —— 这里钉的是「性格贡献了多少」 */
  function luckExceptFate(): number {
    const call = vi.mocked(generateEquipment).mock.calls.at(-1)!
    const kwargs = call[2] as { luck: number; minQualityRank: number } | undefined
    return (kwargs?.luck ?? 0) - (usePlayerStore().fateMods.luck ?? 0)
  }

  const eqEvent: EventDef = {
    id: 'ev_test_eq',
    title: '测试得宝',
    text: '',
    tags: ['general'],
    weight: 1,
    choices: [{ label: '收下', outcomes: [{ weight: 1, text: '得了一件', effects: [{ type: 'equipment' }] }] }]
  }

  it('贪宝灵兽把性格倾向并入事件杯装备品质 luck(与战斗/离线同源)', () => {
    seedPet('pet_qingyu') // greedy → dropLuck 0.06,自身 mods 不带 luck
    resolveEventChoice(eqEvent, 0, 1)
    expect(luckExceptFate()).toBeCloseTo(0.06)
  })

  it('无灵兽时事件杯装备品质 luck 不着性格加成', () => {
    seedPet(null)
    resolveEventChoice(eqEvent, 0, 1)
    expect(luckExceptFate()).toBe(0)
  })
})
