/**
 * 行囊坏件的逐字段修形 —— 全仓伤害面最大的一处坏档。
 *
 * 装备的 `tier` / `level` / 词条 `roll` 只要有一个是 `NaN`,`resolveEquipStats` 就把它
 * 一路带进 `finalStats`:攻防血整份变成 0 —— 玩家看着装备还穿在身上,人却打不动任何东西,
 * 界面上也不会报错,只会「怎么突然这么弱」。而 `affixes` 不是数组时,背包格、详情页与
 * 重铸面板读 `.length` 当场抛错,白屏。
 *
 * 这里把「修形之后属性还是能算出来的数」钉成判据,而不是只断言不抛。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { resolveEquipStats } from '@/core/equipGen'
import { MAX_EQUIP_TIER } from '@/data/equipment'
import type { EquipmentInstance } from '@/types'

/** 一件能真出数值的底子(青竹剑 · 武器) */
function blade(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    uid: 'a',
    templateId: 'w_zhuqing',
    quality: 'mortal',
    tier: 3,
    level: 0,
    affixes: [],
    ...overrides
  }
}

/** 界面上读这件装备的那几处(背包格/详情/重铸),逐个跑一遍 */
function renderBits(inv: ReturnType<typeof useInventoryStore>, item: EquipmentInstance): void {
  expect(Array.isArray(item.affixes), 'affixes 必须是数组,否则三处读 .length 全抛').toBe(true)
  // 模板可以认不出(版本回退留下的旧物),界面早有「旧物」兜底名 —— 这里只要求它是个字符串
  expect(typeof item.templateId, '模板 id 至少要是字符串').toBe('string')
  expect(() => resolveEquipStats(item), '详情页与属性汇总读的就是它').not.toThrow()
  expect(() => inv.equipFlats, '行囊页的属性合计').not.toThrow()
}

describe('行囊坏件 · 读档逐字段修形', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tier/level 写成 NaN 时不再把整身攻防血打成 0', () => {
    const inv = useInventoryStore()
    inv.$patch({ items: [blade({ tier: Number.NaN, level: Number.NaN })], equipped: { weapon: 'a' } } as never)
    inv.sanitize()
    const item = inv.items[0]!
    expect(item.tier, '坏层级回落 1 阶').toBe(1)
    expect(item.level, '坏强化等级回落 0').toBe(0)
    const player = usePlayerStore()
    expect(player.finalStats.attack.m, '装备还在,攻击就该是能算出来的非零值').toBeGreaterThan(0)
    renderBits(inv, item)
  })

  it('层级越界夹回 1..MAX_EQUIP_TIER,负强化等级夹回 0', () => {
    const inv = useInventoryStore()
    inv.$patch({
      items: [blade({ uid: 'a', tier: 9999, level: -4 }), blade({ uid: 'b', tier: 0, level: 3 }), blade({ uid: 'c', tier: -7 })],
      equipped: {}
    } as never)
    inv.sanitize()
    expect(inv.items.map(i => i.tier), '层级是掉落标尺,越过上限会算出不存在的量级').toEqual([
      MAX_EQUIP_TIER,
      1,
      1
    ])
    expect(inv.items[0]!.level, '负强化等级没有任何合法来路').toBe(0)
    expect(inv.items[1]!.level, '合法强化等级原样保留').toBe(3)
  })

  it('词条 roll 是 NaN / 越界时夹回 0..1,属性加成不再被污染', () => {
    const inv = useInventoryStore()
    inv.$patch({
      items: [
        blade({ uid: 'a', affixes: [{ id: 'atk1', roll: Number.NaN }] }),
        blade({ uid: 'b', affixes: [{ id: 'atk1', roll: 5 }] }),
        blade({ uid: 'c', affixes: [{ id: 'atk1', roll: -2 }] })
      ],
      equipped: {}
    } as never)
    inv.sanitize()
    expect(inv.items.map(i => i.affixes[0]!.roll), '坏掷点按 0 收口,越界两条夹到端点').toEqual([0, 1, 0])
    for (const item of inv.items) {
      const r = resolveEquipStats(item)
      expect(Number.isFinite(r.mods.attackPct ?? 0), '加成必须是有限数').toBe(true)
    }
  })

  it('affixes 不是数组时清成空表,三处读 .length 的界面不再抛', () => {
    const inv = useInventoryStore()
    inv.$patch({
      items: [
        blade({ uid: 'a', affixes: null as never }),
        blade({ uid: 'b', affixes: [null, 5, { id: 'atk1', roll: 0.5 }] as never })
      ],
      equipped: { weapon: 'a' }
    } as never)
    inv.sanitize()
    expect(inv.items.map(i => i.affixes.length), '烂条目剔掉,真词条留下').toEqual([0, 1])
    for (const item of inv.items) renderBits(inv, item)
    expect(() => usePlayerStore().finalStats, '属性汇总不该被一件坏件带崩').not.toThrow()
  })

  it('认不出的品质回落凡品、认不出的词条与封存 id 一并清掉', () => {
    const inv = useInventoryStore()
    inv.$patch({
      items: [
        blade({
          quality: 'bogus' as never,
          affixes: [{ id: 'bogus_affix', roll: 0.5 }, { id: 'atk1', roll: 0.5 }],
          sealedAffixIds: ['bogus_affix', 'atk1']
        })
      ],
      equipped: {}
    } as never)
    inv.sanitize()
    const item = inv.items[0]!
    expect(item.quality, '野品质回落凡品(品质表第一档)').toBe('mortal')
    expect(item.affixes.map(a => a.id), '野词条算不出任何数值').toEqual(['atk1'])
    expect(item.sealedAffixIds, '封存表只留真在身的词条').toEqual(['atk1'])
  })

  it('旧物(模板认不出)不丢:界面对它已有「旧物」兜底名,丢掉才是无声损失', () => {
    const inv = useInventoryStore()
    inv.$patch({ items: [blade({ templateId: 'a_removed_template' })], equipped: {} } as never)
    inv.sanitize()
    expect(inv.items.map(i => i.templateId), '认不出的模板原样留在行囊').toEqual(['a_removed_template'])
    expect(() => resolveEquipStats(inv.items[0]!), '旧物只是没有数值,不该抛').not.toThrow()
  })

  it('重复 uid 与空 uid 照旧清理,合法件一件不丢', () => {
    const inv = useInventoryStore()
    inv.$patch({
      items: [blade({ uid: 'a', tier: 5 }), blade({ uid: 'a', tier: 9 }), blade({ uid: '' }), blade({ uid: 'b' })],
      equipped: {}
    } as never)
    inv.sanitize()
    expect(inv.items.map(i => i.uid), '同号只留先出现,空号不是一件东西').toEqual(['a', 'b'])
    expect(inv.items[0]!.tier, '留下的那件不被后一件覆盖').toBe(5)
  })
})
