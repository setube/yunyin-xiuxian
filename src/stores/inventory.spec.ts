/**
 * 装备槽属性汇总(equipMods)守卫。
 *
 * inventory.equipMods 是「已装备件 + 法宝被动」合计的唯一权威,喂进 finalStats。
 * 此前零直接规格(statBreakdown 只测比例折算,不测原始按槽汇总)——一个把未装备件
 * 掺进来、或叠加错、或卸下不撤的回归,会静默腐蚀玩家总属性。
 * 这里用 mergeMods 对「恰好已装备的那批 resolveEquipStats.mods」作真值,断言
 * equipMods 深等(能抓住幻影来源/叠加错/漏撤三类回归)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { mergeMods } from '@/core/statsCalc'
import { resolveEquipStats } from '@/core/equipGen'
import { artifactDef, artifactValue } from '@/data/artifacts'
import type { EquipmentInstance } from '@/types'

function mk(uid: string, affixes: Array<{ id: string; roll: number }>): EquipmentInstance {
  return { uid, templateId: 'b_qingyun', quality: 'mortal', tier: 3, level: 0, affixes }
}

describe('装备槽属性汇总(equipMods)守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('单件:equipMods 恰等于该件 resolveEquipStats.mods(合并后)', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    inv.items = [a]
    inv.equip('a', 'body')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods]))
    // 确有内容(不是空壳自洽)
    expect(Object.keys(inv.equipMods).length).toBeGreaterThan(0)
  })

  it('两件共享词条键:mergeMods 叠加(不互覆盖,两件都在)', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const b = mk('b', [{ id: 'atk1', roll: 0.8 }])
    inv.items = [a, b]
    inv.equip('a', 'body')
    inv.equip('b', 'head')
    const both = mergeMods([resolveEquipStats(a).mods, resolveEquipStats(b).mods])
    // 深等即证明两件都在(若 b 被忽略/覆盖,equipMods 只会等于单件合并,不会等于 both)
    expect(inv.equipMods).toEqual(both)
  })

  it('未装备件不掺:多摆一件未装备的,equipMods 深等只含已装件', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const c = mk('c', [{ id: 'hp1', roll: 0.9 }]) // 不装备
    inv.items = [a, c]
    inv.equip('a', 'body')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods]))
  })

  it('卸下即撤:unequip 后该件贡献消失(回到只含余下装备)', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const b = mk('b', [{ id: 'atk1', roll: 0.8 }])
    inv.items = [a, b]
    inv.equip('a', 'body')
    inv.equip('b', 'head')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods, resolveEquipStats(b).mods]))
    inv.unequip('head')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods]))
  })

  it('空装备/空槽:equipMods 为空对象(无杂键)', () => {
    expect(useInventoryStore().equipMods).toEqual({})
  })

  /**
   * 坏档/导入档里两件同 uid:`equippedUids` 是 uid 集合,装备一次会让两件同时
   * 计入属性(翻倍),而两件又都从行囊里消失 —— 既看不见,也没拿到该得的那份。
   * 修形只留先出现的一件。
   */
  it('sanitize:重复 uid 只留先出现的一件,属性不翻倍、另一件仍可行囊', () => {
    const inv = useInventoryStore()
    const first = mk('dup', [{ id: 'atk1', roll: 0.5 }])
    const second = mk('dup', [{ id: 'atk1', roll: 0.9 }])
    const other = mk('other', [])
    inv.items = [first, second, other]
    inv.sanitize()
    expect(inv.items.map(i => i.uid), '同号只留先出现的那件').toEqual(['dup', 'other'])
    inv.equip('dup', 'body')
    expect(inv.equippedItems, '一次装备只该算一件').toHaveLength(1)
    expect(inv.bagItems.map(i => i.uid), '另一件不同号的仍留在行囊').toEqual(['other'])
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(first).mods]))
  })

  it('sanitize:同一件法宝写两条、祭炼位写两遍,被动都只算一次', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_muyu', level: 0 }
      ],
      equippedArtifacts: ['af_muyu', 'af_muyu']
    })
    inv.sanitize()
    expect(inv.artifacts, '库里同一件法宝只留一条').toHaveLength(1)
    expect(inv.equippedArtifacts, '祭炼位同一件只占一个').toEqual(['af_muyu'])
    const value = artifactValue(artifactDef('af_muyu')!, 0)
    // 只算一次:与单件祭炼的值深等(算两次会把 maxHpPct 叠加成两倍)
    expect(inv.equipMods).toEqual(mergeMods([value.passive]))
  })
})
