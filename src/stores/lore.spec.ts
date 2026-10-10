/**
 * 图鉴见闻收录深度(useLoreStore)守卫。
 *
 * lore 是「记见过的最好一件/最高认知层」的 store,noteEquipUsed 每次装备/强化都触发;
 * 却无任何直接规格(loreService.spec 只管藏经阁钻研引擎)。一旦 once-only、q/t 上限、
 * 认知层/掌握度封顶回归,会把写进存档的图鉴数据腐蚀掉。这里逐条断言真实钳制语义。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoreStore, ENEMY_LORE_MAX } from '@/stores/lore'
import { LORE_MAX } from '@/data/materials'

describe('图鉴见闻收录守卫(useLoreStore)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('noteEquipUsed:u 恰记一次,重复调用不动 q/t(也不复记)', () => {
    const lore = useLoreStore()
    lore.noteEquipSeen('b_x', 5, 12)
    expect(lore.equipSeen('b_x')).toEqual({ q: 5, t: 12, u: 0 })
    lore.noteEquipUsed('b_x')
    expect(lore.equipSeen('b_x')).toEqual({ q: 5, t: 12, u: 1 })
    lore.noteEquipUsed('b_x') // 再记一次:no-op
    expect(lore.equipSeen('b_x')).toEqual({ q: 5, t: 12, u: 1 })
    // 从没见过的模板:仅标记用过,成色留空
    lore.noteEquipUsed('b_new')
    expect(lore.equipSeen('b_new')).toEqual({ q: 0, t: 0, u: 1 })
  })

  it('noteEquipSeen:品质钳进 [0,8]、层级非负,取 max 不降级', () => {
    const lore = useLoreStore()
    lore.noteEquipSeen('b_a', 99, 100) // 品质越界 → 钳到 8
    expect(lore.equipSeen('b_a')).toEqual({ q: 8, t: 100, u: 0 })
    lore.noteEquipSeen('b_a', 2, 3) // 更低的再见到 → 不降级
    expect(lore.equipSeen('b_a')).toEqual({ q: 8, t: 100, u: 0 })
    lore.noteEquipSeen('b_b', -3, -7) // 负数 → 钳到 0
    expect(lore.equipSeen('b_b')).toEqual({ q: 0, t: 0, u: 0 })
  })

  it(`advanceLore:至多推到 LORE_MAX(${LORE_MAX}),到顶不再推、也绝不越过`, () => {
    const lore = useLoreStore()
    expect(lore.advanceLore('m_a', 2)).toBe(true)
    expect(lore.loreOf('m_a')).toBe(2)
    expect(lore.advanceLore('m_a', 3)).toBe(true)
    expect(lore.loreOf('m_a')).toBe(3)
    expect(lore.advanceLore('m_a', 99)).toBe(false) // 越界请求:到顶不越过
    expect(lore.loreOf('m_a')).toBe(3)
    expect(lore.advanceLore('m_a', 1)).toBe(false) // 回退请求:no-op
  })

  it(`advanceEnemyLore:至多推到 ENEMY_LORE_MAX(${ENEMY_LORE_MAX}),到顶不越过`, () => {
    const lore = useLoreStore()
    expect(lore.advanceEnemyLore('e_a', 2)).toBe(true)
    expect(lore.advanceEnemyLore('e_a', 3)).toBe(true)
    expect(lore.enemyLoreOf('e_a')).toBe(3)
    expect(lore.advanceEnemyLore('e_a', 99)).toBe(false)
    expect(lore.enemyLoreOf('e_a')).toBe(3)
  })

  it('addRecipeMastery/addBlueprintMastery:钳进 [0,1](过冲→1、下穿→0)', () => {
    const lore = useLoreStore()
    expect(lore.addRecipeMastery('r1', 0.6)).toBe(0.6)
    expect(lore.recipeLore['r1']).toBe(0.6)
    expect(lore.addRecipeMastery('r1', 5)).toBe(1) // 过冲
    expect(lore.recipeLore['r1']).toBe(1)
    expect(lore.addRecipeMastery('r1', -5)).toBe(0) // 下穿
    expect(lore.recipeLore['r1']).toBe(0)
    expect(lore.addBlueprintMastery('bp1', -2)).toBe(0)
    expect(lore.blueprintLore['bp1']).toBe(0)
    expect(lore.addBlueprintMastery('bp1', 9)).toBe(1)
    expect(lore.blueprintLore['bp1']).toBe(1)
  })
})
