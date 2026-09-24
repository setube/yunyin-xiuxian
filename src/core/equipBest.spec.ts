/**
 * 一键换装(玩家反馈:「一键装备最高阶级品质装备快捷键」)。
 *
 * 每槽换成最强一件:品质 → 层级 → 强化 → 词条成色;已是则不动(幂等)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { equipAllBest, equipBestFor, bestEquipFor, betterEquip } from './equipBest'
import { equipmentTemplate } from '@/data/equipment'
import type { EquipmentInstance, EquipSlot, QualityId } from '@/types'

const TPL: Record<EquipSlot, string> = {
  weapon: 'w_hanfeng',
  head: 'h_xuantie',
  body: 'b_qingyun',
  necklace: 'n_lingyu',
  wrist: 'wr_shuangwen',
  belt: 'bl_youtan',
  boots: 'bo_kuaixue',
  ring: 'r_xuanguang',
  talisman: 'tl_ningshuang',
  artifact: 'af_muyu' // 一键换装不碰法宝,此键只为吃满 Record<EquipSlot>
}

let seq = 0
function item(slot: EquipSlot, quality: QualityId, tier: number, level = 0, rolls: number[] = [0]): EquipmentInstance {
  seq += 1
  return { uid: `eq-${seq}`, templateId: TPL[slot]!, quality, tier, level, affixes: rolls.map(roll => ({ id: 'atk', roll })) }
}

function add(inv: ReturnType<typeof useInventoryStore>, ...items: EquipmentInstance[]): void {
  inv.items = [...inv.items, ...items]
}

function slotOf(item: EquipmentInstance): EquipSlot {
  return equipmentTemplate(item.templateId)!.slot
}

describe('一键换装', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('按「品质 → 层级 → 强化 → 词条」择最强', () => {
    const a = item('weapon', 'heaven', 3) // 天品 3 阶
    const b = item('weapon', 'spirit', 8) // 灵品 8 阶
    expect(slotOf(a)).toBe('weapon')
    expect(betterEquip(a, b), '天品压过灵品,不以阶数论').toBe(true)
    expect(betterEquip(b, a)).toBe(false)

    const c = item('weapon', 'heaven', 4) // 同天品、更高阶
    expect(betterEquip(c, a)).toBe(true)

    const d = { ...item('weapon', 'heaven', 4), level: 3 } // 同天品同阶、强化更高
    expect(betterEquip(d, c)).toBe(true)

    const e = { ...c, affixes: [{ id: 'atk', roll: 9 }] } // 全同,词条成色决胜
    expect(betterEquip(e, c)).toBe(true)
  })

  it('空槽:把行囊里最强的一件换上', () => {
    const inv = useInventoryStore()
    add(inv, item('head', 'fine', 9), item('head', 'excellent', 6))
    expect(equipBestFor('head'), '应换上新来的精品').toBe(true)
    const uid = inv.equipped['head']
    expect(inv.items.find(i => i.uid === uid)!.quality).toBe('excellent')
  })

  it('已是最强则不动(幂等)', () => {
    const inv = useInventoryStore()
    const best = item('body', 'immortal', 20, 5)
    add(inv, best)
    inv.equip(best.uid, 'body')
    expect(equipBestFor('body'), '本就是最强,不该来回换').toBe(false)
  })

  it('旧的最好,别把已穿的天品换成凡品', () => {
    const inv = useInventoryStore()
    const worn = item('necklace', 'heaven', 12, 5)
    add(inv, worn, item('necklace', 'mortal', 20))
    inv.equip(worn.uid, 'necklace')
    expect(bestEquipFor('necklace')!.uid, '天品保底').toBe(worn.uid)
    expect(equipBestFor('necklace')).toBe(false)
  })

  it('一键全槽:每槽换上最强,返回换了几件', () => {
    const inv = useInventoryStore()
    add(inv, item('head', 'fine', 6), item('body', 'excellent', 8), item('necklace', 'mortal', 3), item('weapon', 'spirit', 10))
    const changed = equipAllBest()
    expect(changed).toBe(4)
    for (const slot of ['head', 'body', 'necklace', 'weapon'] as EquipSlot[]) {
      expect(inv.equipped[slot], `${slot} 槽应已穿上`).toBeTruthy()
    }
  })
})
