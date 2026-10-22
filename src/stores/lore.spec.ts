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

  it('addRecipeMastery/addBlueprintMastery:钳进 [0,1],负增量与非有限值不倒扣', () => {
    const lore = useLoreStore()
    expect(lore.addRecipeMastery('r1', 0.6)).toBe(0.6)
    expect(lore.recipeLore['r1']).toBe(0.6)
    expect(lore.addRecipeMastery('r1', 5)).toBe(1) // 过冲
    expect(lore.recipeLore['r1']).toBe(1)
    expect(lore.addRecipeMastery('r1', -5), '负增量不得倒扣掌握度').toBe(1)
    expect(lore.recipeLore['r1']).toBe(1)
    expect(lore.addRecipeMastery('r1', Number.NaN), 'NaN 不得污染掌握度').toBe(1)
    expect(lore.recipeLore['r1']).toBe(1)
    expect(lore.addRecipeMastery('r1', Number.POSITIVE_INFINITY), 'Infinity 不得污染掌握度').toBe(1)
    expect(lore.recipeLore['r1']).toBe(1)
    expect(lore.addBlueprintMastery('bp1', 0.3)).toBe(0.3)
    expect(lore.addBlueprintMastery('bp1', -2), '负增量不得倒扣图纸掌握度').toBe(0.3)
    expect(lore.blueprintLore['bp1']).toBe(0.3)
    expect(lore.addBlueprintMastery('bp1', 9)).toBe(1)
    expect(lore.blueprintLore['bp1']).toBe(1)
  })

  it('markSeen/markEnemySeen/addSkillExp:只接受有限正增量', () => {
    const lore = useLoreStore()
    lore.markSeen('mat_qingzhi', 2)
    lore.markSeen('mat_qingzhi', -1)
    lore.markSeen('mat_qingzhi', Number.NaN)
    lore.markSeen('mat_qingzhi', Number.POSITIVE_INFINITY)
    expect(lore.seenOf('mat_qingzhi')).toBe(2)

    lore.markEnemySeen('e_wolf', 3)
    lore.markEnemySeen('e_wolf', -1)
    lore.markEnemySeen('e_wolf', Number.NaN)
    lore.markEnemySeen('e_wolf', Number.POSITIVE_INFINITY)
    expect(lore.enemySeenOf('e_wolf')).toBe(3)

    lore.addSkillExp('discern', 10)
    lore.addSkillExp('discern', Number.NaN)
    lore.addSkillExp('discern', Number.POSITIVE_INFINITY)
    expect(lore.expOf('discern')).toBe(10)
  })

  it('sanitize:认不出的灵材/丹方/敌人 id 清掉,不再计入图鉴与宿慧', () => {
    const lore = useLoreStore()
    lore.$patch({
      materialLore: { mat_qingzhi: 1, mat_ghost: 3 },
      materialSeen: { mat_qingzhi: 4, mat_ghost: 99 },
      // 真丹药(p_hundunjing)却没有方子,同样不该占「通晓 N 张」
      recipeLore: { p_jvqidan: 1, p_ghost: 1, p_hundunjing: 1 },
      enemyLore: { e_wolf: 3, e_ghost: 3 },
      enemySeen: { e_wolf: 20, e_ghost: 20 }
    } as never)

    lore.sanitize()

    expect(lore.materialLore).toEqual({ mat_qingzhi: 1 })
    // 照面次数不参与计数,认不出的 id 只夹值保留,不冒充任何「已识」
    expect(lore.materialSeen).toEqual({ mat_qingzhi: 4, mat_ghost: 99 })
    expect(lore.recipeLore).toEqual({ p_jvqidan: 1 })
    expect(lore.enemyLore).toEqual({ e_wolf: 3 })
    expect(lore.enemySeen).toEqual({ e_wolf: 20, e_ghost: 20 })
    expect(lore.knownMaterialCount, '幽灵灵材不进「已识」').toBe(1)
    expect(lore.masteredRecipeCount, '幽灵丹方不进「通晓」').toBe(1)
    expect(lore.masteredEnemyCount, '幽灵敌人不进「洞悉」').toBe(1)
  })

  it('sanitize:健康存档幂等,认得的值原样保留', () => {
    const lore = useLoreStore()
    lore.$patch({
      materialLore: { mat_qingzhi: 2 },
      materialSeen: { mat_qingzhi: 7 },
      recipeLore: { p_jvqidan: 0.4 },
      enemyLore: { e_wolf: 1 },
      enemySeen: { e_wolf: 2 }
    } as never)
    const before = JSON.parse(JSON.stringify(lore.$state))

    lore.sanitize()

    expect(JSON.parse(JSON.stringify(lore.$state))).toEqual(before)
  })

  it('sanitize:负钻研量归零,字符串 true 不冒充已播种', () => {
    const lore = useLoreStore()
    lore.$patch({
      studyFrac: -3,
      seeded: 'true'
    } as never)

    lore.sanitize()

    expect(lore.studyFrac, '负钻研量会让 studyFrac < 0.001 长期短路').toBe(0)
    expect(lore.seeded, '只认真正的布尔 true,否则跳过入门播种').toBe(false)
  })
})
