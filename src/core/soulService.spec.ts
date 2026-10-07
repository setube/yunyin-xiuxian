/**
 * 器魂服务 —— 装配与凝炼的编排
 *
 * 编排层几乎不自己算数,测的是「哪条路走哪句提示、代价有没有守恒」:
 *   · 凝炼把「销毁原器 + 耗道源」两重代价都落实了;
 *   · 关键陷阱是**退款分支**——spendDaoSource 成功后 refineSoul 万一返回 null,
 *     已扣的道源必须原样奉还,绝不能既扣了源又没凝出魂。
 *
 * 存的是真实 Pinia store(setActivePinia + createPinia,与 loadoutService.spec 同款),
 * 唯一桩掉的是 ./soulForge 的 canRefine/refineSoul 与 ./progress.track
 * (与 affixTransferEconomy.spec 桩 track 同款),让每条分支与故障注入都可控。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EquipmentInstance } from '@/types'
import type { SoulInstance } from '@/data/souls'
import { SOUL_REFINE_COST, dissolveSoul, refineEquipment, removeSoul, wearSoul } from './soulService'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'

const soulForge = vi.hoisted(() => {
  const state = {
    canRefine: true as boolean,
    refineResult: null as SoulInstance | null
  }
  return {
    state,
    canRefine: () => state.canRefine,
    refineSoul: (): SoulInstance | null => state.refineResult,
    previewSoul: () => null
  }
})
vi.mock('./soulForge', () => soulForge)

const progress = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('./progress', () => progress)

/** 一枚可凝的凡器(w_xuantie = 玄铁重剑) */
function makeInst(uid: string): EquipmentInstance {
  return { uid, templateId: 'w_xuantie', quality: 'mortal', tier: 2, level: 0, affixes: [] }
}

function seedItem(uid = 'sword-1'): EquipmentInstance {
  const inst = makeInst(uid)
  useInventoryStore().addEquipment(inst)
  return inst
}

describe('凝炼装备(refineEquipment)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    progress.track.mockClear()
    soulForge.state.canRefine = true
    soulForge.state.refineResult = { uid: 'soul-1', type: 'fengmang', grade: 1, fromName: '玄铁重剑' }
  })

  it('找不到装备:直接返回 false,不弹提示、不碰任何状态', () => {
    const endgame = useEndgameStore()
    endgame.daoSource = 100
    expect(refineEquipment('ghost')).toBe(false)
    expect(useUiStore().toasts).toHaveLength(0)
    expect(endgame.daoSource).toBe(100)
  })

  it('装备已锁:提示"此器已锁",不动道源', () => {
    const inst = seedItem()
    inst.locked = true
    const endgame = useEndgameStore()
    endgame.daoSource = 100
    expect(refineEquipment(inst.uid)).toBe(false)
    expect(useUiStore().toasts).toContainEqual(expect.objectContaining({ text: '此器已锁,先解锁再凝', kind: 'warn' }))
    expect(endgame.daoSource).toBe(100)
  })

  it('装备正穿在身上:提示"身上之物",拒绝入炉', () => {
    const inst = seedItem()
    const inventory = useInventoryStore()
    inventory.equipped = { weapon: inst.uid }
    expect(refineEquipment(inst.uid)).toBe(false)
    expect(useUiStore().toasts).toContainEqual(
      expect.objectContaining({ text: '身上之物无法入炉,先卸下', kind: 'warn' })
    )
  })

  it('白板无构筑词条(canRefine 为假):提示"此器平平无奇"', () => {
    const inst = seedItem()
    soulForge.state.canRefine = false
    const endgame = useEndgameStore()
    endgame.daoSource = 100
    expect(refineEquipment(inst.uid)).toBe(false)
    expect(useUiStore().toasts).toContainEqual(expect.objectContaining({ text: '此器平平无奇,无形意可存', kind: 'warn' }))
    expect(endgame.daoSource).toBe(100)
  })

  it('道源不足:提示"道源不足",分文不扣', () => {
    const inst = seedItem()
    const endgame = useEndgameStore()
    endgame.daoSource = SOUL_REFINE_COST - 1
    expect(refineEquipment(inst.uid)).toBe(false)
    expect(useUiStore().toasts).toContainEqual(expect.objectContaining({ text: `道源不足 ${SOUL_REFINE_COST}`, kind: 'warn' }))
    expect(endgame.daoSource).toBe(SOUL_REFINE_COST - 1)
  })

  it('故障注入:费用已扣但 refineSoul 返回 null,道源足额退回,装备不动、不生魂', () => {
    const inst = seedItem()
    const inventory = useInventoryStore()
    const endgame = useEndgameStore()
    endgame.daoSource = 100
    // 让判定/扣费都通过,唯独凝炼本身失手 → 已扣成本必须奉还
    soulForge.state.canRefine = true
    soulForge.state.refineResult = null
    const addSpy = vi.spyOn(endgame, 'addDaoSource')

    expect(refineEquipment(inst.uid)).toBe(false)

    expect(addSpy, '退款没触发,扣掉的 20 道源凭空蒸发').toHaveBeenCalledWith(SOUL_REFINE_COST)
    expect(endgame.daoSource, '扣 20 再退 20,应分毫不差回到原点').toBe(100)
    expect(inventory.findItem(inst.uid), '凝炼失败不该销毁原器').toBeDefined()
    expect(endgame.soulList).toHaveLength(0)
    expect(progress.track, '失败路径不该记战绩').not.toHaveBeenCalled()
  })

  it('成功凝炼:扣道源、销毁原器、入魂、记战绩、返 true、弹 rare 提示', () => {
    const inst = seedItem()
    const inventory = useInventoryStore()
    const endgame = useEndgameStore()
    const soul = soulForge.state.refineResult!
    endgame.daoSource = 100
    const spend = vi.spyOn(endgame, 'spendDaoSource')

    expect(refineEquipment(inst.uid)).toBe(true)

    expect(spend).toHaveBeenCalledWith(SOUL_REFINE_COST)
    expect(endgame.daoSource).toBe(100 - SOUL_REFINE_COST)
    expect(inventory.findItem(inst.uid), '原器已销毁').toBeUndefined()
    expect(endgame.soulList).toEqual([soul])
    expect(progress.track).toHaveBeenCalledWith('soulsRefined')
    expect(useUiStore().toasts).toContainEqual(
      expect.objectContaining({ text: '「玄铁重剑」形销而意存,凝作清晰·锋魂', kind: 'rare' })
    )
  })
})

describe('装配器魂(wearSoul)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('槽位已满且是新魂:提示"神魂只容得下",不装配、返 false', () => {
    const endgame = useEndgameStore()
    endgame.souls = [
      { uid: 's1', type: 'fengmang', grade: 1, fromName: 'x' },
      { uid: 's2', type: 'beishui', grade: 1, fromName: 'x' },
      { uid: 's3', type: 'gangdun', grade: 1, fromName: 'x' }
    ]
    endgame.equippedSouls = ['s1', 's2', 's3']
    const equip = vi.spyOn(endgame, 'equipSoul')

    expect(wearSoul('s4')).toBe(false)
    expect(useUiStore().toasts).toContainEqual(expect.objectContaining({ text: '神魂只容得下 3 缕形意,先散去一缕', kind: 'warn' }))
    expect(equip, '槽满时不该把活交给 equipSoul').not.toHaveBeenCalled()
  })

  it('槽位有空:委派 equipSoul,照它的结果返回', () => {
    const endgame = useEndgameStore()
    endgame.souls = [{ uid: 's1', type: 'fengmang', grade: 1, fromName: 'x' }]
    const equip = vi.spyOn(endgame, 'equipSoul')

    expect(wearSoul('s1')).toBe(true)
    expect(equip).toHaveBeenCalledWith('s1')
    expect(endgame.activeSouls.map(s => s.uid)).toContain('s1')
    expect(useUiStore().toasts).toHaveLength(0)
  })

  it('槽满但原魂已在位:不算新魂,交给 equipSoul(其自身已装配则返 false)', () => {
    const endgame = useEndgameStore()
    endgame.souls = [
      { uid: 's1', type: 'fengmang', grade: 1, fromName: 'x' },
      { uid: 's2', type: 'beishui', grade: 1, fromName: 'x' },
      { uid: 's3', type: 'gangdun', grade: 1, fromName: 'x' }
    ]
    endgame.equippedSouls = ['s1', 's2', 's3']
    expect(wearSoul('s1')).toBe(false) // equipSoul 见已装配 → false
    expect(useUiStore().toasts).toHaveLength(0)
  })
})

describe('卸下器魂(removeSoul)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('委派 unequipSoul,只卸 uid 对应的那一枚', () => {
    const endgame = useEndgameStore()
    endgame.souls = [
      { uid: 's1', type: 'fengmang', grade: 1, fromName: 'x' },
      { uid: 's2', type: 'beishui', grade: 1, fromName: 'x' }
    ]
    endgame.equippedSouls = ['s1', 's2']
    const unequip = vi.spyOn(endgame, 'unequipSoul')

    removeSoul('s1')
    expect(unequip).toHaveBeenCalledWith('s1')
    expect(endgame.equippedSouls).toEqual(['s2'])
    expect(endgame.soulList).toHaveLength(2) // 只是卸下,不销毁灵魂
  })
})

describe('散去器魂(dissolveSoul)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('找不到该魂:静默返回,不唤醒 dissolveSoul、不弹提示', () => {
    const endgame = useEndgameStore()
    const dissolve = vi.spyOn(endgame, 'dissolveSoul')
    dissolveSoul('ghost')
    expect(dissolve).not.toHaveBeenCalled()
    expect(useUiStore().toasts).toHaveLength(0)
  })

  it('找到该魂:委派 dissolveSoul 并弹 info 提示', () => {
    const endgame = useEndgameStore()
    endgame.souls = [{ uid: 's1', type: 'fengmang', grade: 1, fromName: 'x' }]
    const dissolve = vi.spyOn(endgame, 'dissolveSoul')
    dissolveSoul('s1')
    expect(dissolve).toHaveBeenCalledWith('s1')
    expect(endgame.soulList).toHaveLength(0)
    expect(useUiStore().toasts).toContainEqual(
      expect.objectContaining({ text: '清晰·锋魂散入天地', kind: 'info' })
    )
  })
})
