import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mulberry32, RandomService } from '@/utils/random'
import { generateEquipment } from './equipGen'
import { captureLoadout, applyLoadout, renameLoadout } from './loadoutService'
import { EQUIP_SLOT_NAMES, equipmentTemplate } from '@/data/equipment'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoadoutsStore } from '@/stores/loadouts'
import { useUiStore } from '@/stores/ui'

describe('构筑快照(保存/一键切换)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed(): { weaponUid: string } {
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    const rng = new RandomService(mulberry32(7))
    const weapon = generateEquipment(3, rng, { slot: 'weapon' })
    inventory.addEquipment(weapon)
    inventory.equip(weapon.uid, 'weapon')
    cultivation.learn('m_taixuan')
    cultivation.equipMain('m_taixuan')
    cultivation.learn('s_tuna')
    cultivation.toggleSub('s_tuna', 2)
    inventory.addArtifact('af_lihuo')
    return { weaponUid: weapon.uid }
  }

  it('捕获→改动→一键还原', () => {
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    const { weaponUid } = seed()

    const loadout = captureLoadout('试剑')
    expect(loadout).not.toBeNull()
    expect(loadout!.equipment.weapon).toBe(weaponUid)

    // 打乱现状
    inventory.unequip('weapon')
    cultivation.subGongfa = []
    inventory.equippedArtifacts = []

    expect(applyLoadout(loadout!.id)).toBe(true)
    expect(inventory.equipped.weapon).toBe(weaponUid)
    expect(cultivation.subGongfa).toContain('s_tuna')
    expect(inventory.equippedArtifacts).toContain('af_lihuo')
  })

  it('部件缺失时跳过而不崩溃,且缺件的名有姓地报出来', () => {
    const inventory = useInventoryStore()
    const ui = useUiStore()
    const { weaponUid } = seed()
    const loadout = captureLoadout('残卷')!
    // 装备被分解
    inventory.removeEquipment(weaponUid)
    expect(applyLoadout(loadout.id)).toBe(true)
    expect(inventory.equipped.weapon).toBeUndefined()
    // 阙的不止一个数:「兵刃」这类缺位要带名 —— 玩家得知道下一步补什么
    const last = ui.toasts[ui.toasts.length - 1]!.text
    expect(last).toContain(EQUIP_SLOT_NAMES.weapon)
  })

  it('槽位错配的装备不会被穿到错误位置', () => {
    const inventory = useInventoryStore()
    seed()
    const loadout = captureLoadout('验位')!
    // 伪造:把 weapon 槽指向一件衣袍
    const rng = new RandomService(mulberry32(9))
    const body = generateEquipment(3, rng, { slot: 'body' })
    inventory.addEquipment(body)
    loadout.equipment.weapon = body.uid
    applyLoadout(loadout.id)
    const equippedWeapon = inventory.equipped.weapon
    if (equippedWeapon) {
      expect(equipmentTemplate(inventory.findItem(equippedWeapon)!.templateId)!.slot).toBe('weapon')
    } else {
      expect(equippedWeapon).toBeUndefined()
    }
  })

  it('容量上限生效', () => {
    seed()
    const loadouts = useLoadoutsStore()
    for (let i = 0; i < 6; i += 1) {
      captureLoadout(`第${i}套`)
    }
    expect(loadouts.list.length).toBe(6)
    expect(captureLoadout('超载')).toBeNull()
  })

  it('改名:收敛空白与 8 字上限,套内装束原样不动,提示说「已改名」而非「已存入行囊」', () => {
    seed()
    const loadouts = useLoadoutsStore()
    const ui = useUiStore()
    const lo = captureLoadout('背水一号')!
    const weaponUid = lo.equipment.weapon
    // 全空白 → 回落「无名构筑」
    expect(renameLoadout(lo.id, '   ')).toBe(true)
    expect(loadouts.list.find(l => l.id === lo.id)!.name).toBe('无名构筑')
    // 改名成功时的 toast:说的是改名,不是保存进包(此前复用了「已存入行囊」,报了假动作);
    // captureLoadout 那一声「已存入行囊」在更早,断言只看最新一条
    const lastToast = ui.toasts[ui.toasts.length - 1]!.text
    expect(lastToast).toContain('已改名')
    expect(lastToast).not.toContain('已存入行囊')
    // 超过 8 字 → 截到 8 字
    expect(renameLoadout(lo.id, '超长名字超过八个字会截断')).toBe(true)
    expect(loadouts.list.find(l => l.id === lo.id)!.name).toBe('超长名字超过八个')
    // 只动名号,套内功/宝/装原样
    const renamed = loadouts.list.find(l => l.id === lo.id)!
    expect(renamed.equipment.weapon).toBe(weaponUid)
    expect(renamed.mainGongfa).toBe('m_taixuan')
    // 不存在的 id 静默失败,什么都不动
    expect(renameLoadout('nope', '新名')).toBe(false)
    expect(loadouts.list.length).toBe(1)
  })
})
