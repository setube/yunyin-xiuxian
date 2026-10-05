/**
 * 一键换装(玩家反馈:「一键装备最高阶级品质装备快捷键」以及后来那句
 * 「一键装备没有将最强的装备装上」)。
 *
 * 「最强」= 真实战斗价值(equippablePower):基础攻/防/血平铺(层级曲线 × 品质^1.8 ×
 * 强化加成)+ 词条战力(权重与战力面板同源,POWER_STAT_WEIGHTS)。旧的「品质 → 层级 →
 * 强化 → 词条」粗排把**强化满、阶数高**的装备压在高品位新鲜胚子之下 —— 玩家眼里
 * 最强的没上身;粗排降级为「同战力」的稳定裁决(betterEquip),不再当主键。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import {
  equipAllBest,
  equipBestFor,
  bestEquipFor,
  betterEquip,
  equipSetCombo,
  equipSetPreview,
  equippablePower,
  unequipAllEquipped
} from './equipBest'
import { resolveEquipStats, generateEquipment } from './equipGen'
import { mulberry32, RandomService } from '@/utils/random'
import { affixDef, affixValue } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { toNum } from '@/utils/gnum'
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
/** rolls: [{ id, roll }],roll 取 0~1(词条实际数值见 affixValue) */
function item(
  slot: EquipSlot,
  quality: QualityId,
  tier: number,
  level = 0,
  rolls: { id: string; roll: number }[] = []
): EquipmentInstance {
  seq += 1
  return { uid: `eq-${seq}`, templateId: TPL[slot]!, quality, tier, level, affixes: rolls }
}

function add(inv: ReturnType<typeof useInventoryStore>, ...items: EquipmentInstance[]): void {
  inv.items = [...inv.items, ...items]
}

function slotOf(item: EquipmentInstance): EquipSlot {
  return equipmentTemplate(item.templateId)!.slot
}

/** 纯基础平铺那一项(攻 + 防 + 血/6,不含词条) */
function flatTerm(i: EquipmentInstance): number {
  const r = resolveEquipStats(i)
  return toNum(r.flats.attack) + toNum(r.flats.defense) + toNum(r.flats.maxHp) / 6
}

describe('equippablePower —— 真实战斗价值', () => {
  it('平铺随强化线性放大:同件装备强化 10 ≈ 1 + 10×12%', () => {
    const lv0 = item('weapon', 'heaven', 17)
    const lv10 = { ...item('weapon', 'heaven', 17), level: 10 }
    expect(equippablePower(lv10) / equippablePower(lv0)).toBeCloseTo(1 + 10 * 0.12, 6)
  })

  it('词条按战力权重计入:一条攻击% 恰好加它的数值×权重;成长类词条不进战力', () => {
    const bare = item('weapon', 'heaven', 17)
    const withAttack = { ...bare, affixes: [{ id: 'atk1', roll: 0.73 }] }
    const def = affixDef('atk1')!
    const expected = affixValue(def, 0.73) / 100 // attackPct 权重 = 1
    expect(equippablePower(withAttack) - equippablePower(bare)).toBeCloseTo(expected, 9)

    // 修炼速度是成长词条,战力不因它增减(一键不为了修速换装)
    const withGrowth = { ...bare, affixes: [{ id: 'cult1', roll: 0.9 }] }
    expect(equippablePower(withGrowth) - equippablePower(bare)).toBeCloseTo(0, 9)
  })

  it('会心按「会心×(1+会心伤)」联乘:单加会心伤不改战力,会心与会心伤同出才放大', () => {
    const bare = item('weapon', 'heaven', 17)
    const crit = { ...bare, affixes: [{ id: 'crit1', roll: 0.5 }] }
    const critDmg = { ...bare, affixes: [{ id: 'cdmg1', roll: 0.5 }] }
    const both = { ...bare, affixes: [{ id: 'crit1', roll: 0.5 }, { id: 'cdmg1', roll: 0.5 }] }
    const c = affixValue(affixDef('crit1')!, 0.5) / 100
    const cd = affixValue(affixDef('cdmg1')!, 0.5) / 100
    expect(equippablePower(critDmg) - equippablePower(bare)).toBeCloseTo(0, 9) // 只加暴伤,当期战力为零
    expect(equippablePower(crit) - equippablePower(bare)).toBeCloseTo(c, 9) // 只有会心链是 ×(1+0)
    expect(equippablePower(both) - equippablePower(bare)).toBeCloseTo(c * (1 + cd), 9) // 两个都上,联乘
  })
})

describe('一键换装 —— 「最强」按真实战力', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('同品质:强化满的一件压过高 1 阶的裸件(旧粗排会选错)', () => {
    const inv = useInventoryStore()
    const fresh = item('weapon', 'heaven', 18) // 天品 18 阶,0 强化
    const leveled = item('weapon', 'heaven', 17, 10) // 天品 17 阶,强化 10
    add(inv, fresh, leveled)
    expect(betterEquip(fresh, leveled), '旧口径按阶高取胜 —— 这正是玩家说的没装上最强').toBe(true)
    expect(equippablePower(leveled), '强化 10 的平铺压过高一阶的裸件').toBeGreaterThan(equippablePower(fresh))
    const best = bestEquipFor('weapon')!
    expect(best.uid, '该穿强化满的那件').toBe(leveled.uid)
  })

  it('跨品质跨阶:高阶玄品满强化胜过低阶地品裸件(玩家反馈的主诉场景)', () => {
    const inv = useInventoryStore()
    const earned = item('weapon', 'profound', 20, 10) // 玄品 20 阶,强化满
    const polished = item('weapon', 'earth', 14) // 地品 14 阶,高一档品质但不是高一个世界
    add(inv, earned, polished)
    expect(betterEquip(polished, earned), '旧口径只认品质,天差地别的阶数被压掉').toBe(true)
    expect(equippablePower(earned)).toBeGreaterThan(equippablePower(polished))
    expect(bestEquipFor('weapon')!.uid, '该穿的是 20 阶的玄品').toBe(earned.uid)
  })

  it('同阶内品质仍是王:天品压过凡品', () => {
    const inv = useInventoryStore()
    const a = item('necklace', 'heaven', 4)
    const b = item('necklace', 'mortal', 4)
    add(inv, a, b)
    expect(equippablePower(a)).toBeGreaterThan(equippablePower(b))
    expect(bestEquipFor('necklace')!.uid).toBe(a.uid)
  })

  it('空槽:把行囊里最强的一件换上(同阶比品质)', () => {
    const inv = useInventoryStore()
    add(inv, item('head', 'fine', 9), item('head', 'excellent', 9))
    expect(equipBestFor('head'), '应换上精品').toBe(true)
    const uid = inv.equipped['head']
    expect(inv.items.find(i => i.uid === uid)!.quality).toBe('excellent')
  })

  it('已是最强则不动(幂等)', () => {
    const inv = useInventoryStore()
    const best = item('body', 'immortal', 20, 5)
    add(inv, best, item('body', 'earth', 18)) // 行囊里有个弱的,但已穿的是最强
    inv.equip(best.uid, 'body')
    expect(equipBestFor('body'), '本就是最强,不该来回换').toBe(false)
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

describe('betterEquip —— 同战力下的稳定裁决', () => {
  it('按「品质 → 层级 → 强化 → 词条成色」分先后', () => {
    const a = item('weapon', 'heaven', 3)
    const b = item('weapon', 'spirit', 8)
    expect(slotOf(a)).toBe('weapon')
    expect(betterEquip(a, b), '天品压过灵品,不以阶数论').toBe(true)
    expect(betterEquip(b, a)).toBe(false)

    const c = item('weapon', 'heaven', 4) // 同天品、更高阶
    expect(betterEquip(c, a)).toBe(true)

    const d = { ...item('weapon', 'heaven', 4), level: 3 } // 同天品同阶、强化更高
    expect(betterEquip(d, c)).toBe(true)

    const e = { ...c, affixes: [{ id: 'atk1', roll: 0.9 }] } // 全同,词条成色决胜
    expect(betterEquip(e, c)).toBe(true)
  })

  it('同战力时靠粗排稳定裁决,不许两件互相说对方更强', () => {
    // 两份完全相同的装备战力相等,betterEquip 只按位次裁决,来回换会打转
    const inv = useInventoryStore()
    const a = item('head', 'excellent', 9, 0, [{ id: 'hp1', roll: 0.5 }])
    const b = { ...item('head', 'excellent', 9, 0, [{ id: 'hp1', roll: 0.5 }]) }
    add(inv, a, b)
    const best = bestEquipFor('head')!
    expect(equippablePower(a)).toBe(equippablePower(b))
    const ab = betterEquip(a, b) || betterEquip(b, a)
    const ba = betterEquip(b, a) || betterEquip(a, b)
    expect(ab).toBe(ba) // 正反两问必有一真,且一致
    expect(best.uid).toBe(a.uid) // 同战力回退到粗排,取排位靠前者
  })
})

/**
 * 一键穿齐共鸣套:各槽换上该套已持有里的最强,已穿更强的那件不动。
 * 铁壁套 s_tiebi = 玄铁重剑(weapon)+ 玄铁冠(head)。
 */
describe('一键穿齐套装', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('空槽换上套装里更强的一件,已穿更强的非套件不动', () => {
    const inv = useInventoryStore()
    const pieces: EquipmentInstance[] = [
      { uid: 'sa', templateId: 'w_xuantie', quality: 'fine', tier: 2, level: 0, affixes: [] },
      { uid: 'sb', templateId: 'w_xuantie', quality: 'heaven', tier: 4, level: 0, affixes: [] },
      { uid: 'sc', templateId: 'h_xuantie', quality: 'excellent', tier: 4, level: 0, affixes: [] },
      { uid: 'sd', templateId: 'h_xuantie', quality: 'divine', tier: 5, level: 0, affixes: [] }
    ]
    inv.items = pieces
    inv.equip('sd', 'head') // 头已穿更强的 divine
    const changed = equipSetCombo('s_tiebi')
    expect(changed, '只该换武器槽').toBe(1)
    expect(inv.equipped['weapon'], '换上天品重剑').toBe('sb')
    expect(inv.equipped['head'], '已穿更强 divine 不该被降级').toBe('sd')
  })

  it('已穿齐:再点一次不动(幂等)', () => {
    const inv = useInventoryStore()
    const a: EquipmentInstance = { uid: 'sa', templateId: 'w_xuantie', quality: 'heaven', tier: 4, level: 0, affixes: [] }
    const b: EquipmentInstance = { uid: 'sc', templateId: 'h_xuantie', quality: 'heaven', tier: 4, level: 0, affixes: [] }
    inv.items = [a, b]
    inv.equip(a.uid, 'weapon')
    inv.equip(b.uid, 'head')
    expect(equipSetCombo('s_tiebi'), '已穿齐,不应再动').toBe(0)
  })

  it('穿套装绝不降级:已穿的高阶强化件比套内更强,不动它(哪怕旧粗排会降级)', () => {
    const inv = useInventoryStore()
    // 已穿 8 阶良品剑,强化 10 —— 战力实打实比套内 4 阶天品高;套内还有一把可补位
    const worn: EquipmentInstance = { uid: 'wa', templateId: 'w_hanfeng', quality: 'fine', tier: 8, level: 10, affixes: [] }
    const a: EquipmentInstance = { uid: 'sa', templateId: 'w_xuantie', quality: 'heaven', tier: 4, level: 0, affixes: [] }
    const h: EquipmentInstance = { uid: 'sh', templateId: 'h_xuantie', quality: 'heaven', tier: 4, level: 0, affixes: [] }
    inv.items = [worn, a, h]
    inv.equip(worn.uid, 'weapon')
    inv.equip(h.uid, 'head')

    // 干跑与实穿同一份取舍:预览报几件,点下去就换几件
    expect(equipSetPreview('s_tiebi'), '预览与 equipSetCombo 同源,头槽已齐、武器更强的都不动').toBe(0)
    expect(betterEquip(a, worn), '旧粗排:天品压过良品,该降级换上 — 这是要修的坏行为').toBe(true)
    expect(equippablePower(worn)).toBeGreaterThan(equippablePower(a))
    expect(equipSetCombo('s_tiebi'), '真实战力更强的已穿件不动;头槽本就齐').toBe(0)
    expect(inv.equipped['weapon']).toBe(worn.uid)
  })
})

/** 空一身:与一键换装成对的反向出口 —— 只脱不毁,件都回行囊 */
describe('空一身(unequipAllEquipped)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('卸下全部已佩戴的槽位,件数对得上,装备回行囊不消失', () => {
    const inv = useInventoryStore()
    const rng = new RandomService(mulberry32(5))
    const uids: string[] = []
    for (const slot of ['weapon', 'head', 'body'] as EquipSlot[]) {
      const piece = generateEquipment(3, rng, { slot })
      inv.addEquipment(piece)
      inv.equip(piece.uid, slot)
      uids.push(piece.uid)
    }
    expect(uids.filter(uid => inv.findItem(uid)).length).toBe(3)
    expect(Object.keys(inv.equipped).length).toBe(3)
    const removed = unequipAllEquipped()
    expect(removed).toBe(3)
    expect(Object.keys(inv.equipped).length).toBe(0)
    // 卸下 ≠ 销毁:件都在行囊里,等着分解或回头再穿
    for (const uid of uids) {
      expect(inv.findItem(uid)).toBeDefined()
      expect(inv.bagItems.some(i => i.uid === uid)).toBe(true)
    }
  })

  it('没穿任何件时卸了个寂寞:返回 0,不误伤行囊', () => {
    const inv = useInventoryStore()
    const rng = new RandomService(mulberry32(6))
    const loose = generateEquipment(3, rng, { slot: 'weapon' })
    inv.addEquipment(loose)
    expect(unequipAllEquipped()).toBe(0)
    expect(inv.bagItems.some(i => i.uid === loose.uid)).toBe(true)
  })
})

/** 数量锚点:平衡常数可再调,但「强化满压过高 1 阶」「后期件碾压前期件」这两条不许翻盘 */
describe('战力锚点', () => {
  it('同品质:强化 10 在绝对量级上仍压过裸件', () => {
    const mid = item('weapon', 'heaven', 17)
    const late = item('weapon', 'divine', 24, 10)
    expect(flatTerm(mid)).toBeGreaterThan(50_000)
    expect(flatTerm(late)).toBeGreaterThan(flatTerm(mid) * 10)
  })
})
