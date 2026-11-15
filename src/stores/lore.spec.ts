/**
 * 图鉴见闻收录深度(useLoreStore)守卫:once-only、q/t 上限、认知层/掌握度封顶。
 * 藏经阁钻研引擎由 loreService.spec 钉。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { MATERIALS } from '@/data/materials'
import { PILLS } from '@/data/pills'
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
    lore.noteEquipUsed('b_x')
    expect(lore.equipSeen('b_x')).toEqual({ q: 5, t: 12, u: 1 })
    // 未见过的模板:只标用过,成色留空
    lore.noteEquipUsed('b_new')
    expect(lore.equipSeen('b_new')).toEqual({ q: 0, t: 0, u: 1 })
  })

  it('noteEquipSeen:品质钳进 [0,8]、层级非负,取 max 不降级', () => {
    const lore = useLoreStore()
    lore.noteEquipSeen('b_a', 99, 100)
    expect(lore.equipSeen('b_a')).toEqual({ q: 8, t: 100, u: 0 })
    lore.noteEquipSeen('b_a', 2, 3)
    expect(lore.equipSeen('b_a')).toEqual({ q: 8, t: 100, u: 0 })
    lore.noteEquipSeen('b_b', -3, -7)
    expect(lore.equipSeen('b_b')).toEqual({ q: 0, t: 0, u: 0 })
  })

  it(`advanceLore:至多推到 LORE_MAX(${LORE_MAX}),到顶不再推、也绝不越过`, () => {
    const lore = useLoreStore()
    expect(lore.advanceLore('m_a', 2)).toBe(true)
    expect(lore.loreOf('m_a')).toBe(2)
    expect(lore.advanceLore('m_a', 3)).toBe(true)
    expect(lore.loreOf('m_a')).toBe(3)
    expect(lore.advanceLore('m_a', 99)).toBe(false)
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
    expect(lore.addRecipeMastery('r1', 5)).toBe(1)
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
      // p_hundunjing 是真丹药但没有方子,同样不占「通晓 N 张」
      recipeLore: { p_jvqidan: 1, p_ghost: 1, p_hundunjing: 1 },
      enemyLore: { e_wolf: 3, e_ghost: 3 },
      enemySeen: { e_wolf: 20, e_ghost: 20 }
    } as never)

    lore.sanitize()

    expect(lore.materialLore).toEqual({ mat_qingzhi: 1 })
    // 照面次数不参与计数:认不出的 id 只夹值保留
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

/**
 * 照面次数与图纸认知表的条数上界。
 *
 * 这两张表**故意不认 id**（改名 / 版本回退时不抹掉玩家进度），但条数仍要有界：
 * 坏档能塞任意多键（实测三千条），它们不进任何界面（`codex` 用 `MATERIALS.map` 遍历
 * 真实材料），只是把 `$state` 撑大 —— 每个键连同数字约 20 字节，三千条约 60KB。
 *
 * 上界取数据目录的八倍：宽到容得下改名/下线残留，窄到拦得住坏档。
 * 超出时保留**靠前**的键（对象键序 = 写入序，靠前的才是早期真玩过的）。
 *
 * 故障注入：去掉 `capEntries(...)` 包一层 → 本条红。
 */
describe('图鉴 · 照面次数与图纸表的条数上界', () => {
  it('三千条野键被截到上界,靠前的保留', () => {
    const l = useLoreStore()
    const wild: Record<string, number> = {}
    for (let i = 0; i < 3000; i += 1) wild['wild_' + i] = i
    l.materialSeen = wild as never
    l.blueprintLore = wild as never
    l.sanitize()
    expect(Object.keys(l.materialSeen).length, '照面次数表没上界 —— 坏档会撑大存档').toBeLessThanOrEqual(
      MATERIALS.length * 8
    )
    expect(Object.keys(l.blueprintLore).length, '图纸认知表没上界').toBeLessThanOrEqual(PILLS.length * 8)
    expect(l.seenOf('wild_0'), '靠前的键应保留(早期真玩过的)').toBe(0)
  })
})
