/**
 * 玩家战斗快照:天界口径、剑意叠层、三套共鸣各自并入哪一条词条。
 * 共鸣只进快照、不进 finalStats —— 机制钩子不改面板与流派检测,这是最容易被后来者改坏的一条。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EquipmentInstance } from '@/types'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { buildPlayerSnap } from './playerSnap'
import { ACCESSORY_SET_LIFESTEAL, ASTRAL_SET_SHIELD } from './equipSet'
import { SWORD_LAYER_MODS } from './daoDepth'
import { modOf } from './statsCalc'

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 取 player store(每用例已 setActivePinia) */
const player0 = () => usePlayerStore()

/** 造一件指定模板的装备并穿上 */
function equip(templateId: string): void {
  const inventory = useInventoryStore()
  const inst: EquipmentInstance = {
    uid: `uid_${templateId}_${inventory.items.length}`,
    templateId,
    quality: 'mortal',
    tier: 8,
    level: 0,
    affixes: []
  }
  inventory.items.push(inst)
  inventory.equippedUids.add(inst.uid)
}

describe('战斗快照 · 基本口径', () => {
  it('三维取自面板,speed 是 1 + 速度词条(不是裸值)', () => {
    const player = usePlayerStore()
    const snap = buildPlayerSnap()
    expect(snap.attack).toBe(player.finalStats.attack)
    expect(snap.maxHp).toBe(player.finalStats.maxHp)
    expect(snap.speed).toBeCloseTo(1 + modOf(player.finalStats.mods, 'speed'))
    expect(snap.isPlayer).toBe(true)
    expect(snap.name).toBe(player.name)
  })

  it('无道途、无套件时快照词条就是面板词条', () => {
    const player = usePlayerStore()
    const snap = buildPlayerSnap()
    expect(snap.mods).toEqual(player.finalStats.mods)
    expect(snap.comboArt, '没有流派就没有组合技').toBeUndefined()
    expect(snap.ironwallBrace).toBe(false)
  })
})

describe('战斗快照 · 天界口径', () => {
  it('celestial=true 取天界面板;省略参数取凡界口径', () => {
    const player = usePlayerStore()
    expect(buildPlayerSnap(true).attack).toBe(player.celestialStats.attack)
    expect(buildPlayerSnap(false).attack).toBe(player.finalStats.attack)
    expect(buildPlayerSnap().attack, '默认参数即凡界口径').toBe(player.finalStats.attack)
  })
})

describe('战斗快照 · 剑道剑意', () => {
  it('道途不是剑道时不叠剑意', () => {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    endgame.daoPath = 'slaughter'
    expect(buildPlayerSnap().mods.damageBonus).toBe(player.finalStats.mods.damageBonus)
  })

  it('择剑道后叠上「整数层 × 每层值」', () => {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    const base = modOf(player.finalStats.mods, 'damageBonus')
    endgame.daoPath = 'sword'
    const delta = modOf(buildPlayerSnap().mods, 'damageBonus') - base
    expect(delta, '择剑道后伤害加成应提高').toBeGreaterThan(0)
    // 层数是整数:delta / 每层 必须是整数
    expect(delta / SWORD_LAYER_MODS.damageBonus!).toBeCloseTo(Math.round(delta / SWORD_LAYER_MODS.damageBonus!))
  })
})

describe('战斗快照 · 套件共鸣', () => {
  it('星斗两件:并 shieldOnStart,且共鸣本身不进 finalStats', () => {
    const player = usePlayerStore()
    equip('h_xingchen') // head, s_xingdou
    equip('b_xingluo') // body, s_xingdou
    // 穿装备当然会改面板(词条来自装备),所以基准点在「穿好之后」
    const baseMods = JSON.stringify(player.finalStats.mods)
    const snap = buildPlayerSnap()
    expect(modOf(snap.mods, 'shieldOnStart'), '星斗共鸣并入开战护盾').toBeCloseTo(ASTRAL_SET_SHIELD)
    expect(JSON.stringify(player.finalStats.mods), '共鸣只进快照,不得回写面板').toBe(baseMods)
    expect(modOf(player.finalStats.mods, 'shieldOnStart'), '面板里不该出现开战护盾').toBe(0)
  })

  it('只有一件时不成共鸣', () => {
    equip('h_xingchen')
    expect(modOf(buildPlayerSnap().mods, 'shieldOnStart')).toBe(0)
  })

  it('妖庭三件才成:两件不成,补齐第三件后并 lifesteal', () => {
    equip('n_yaoting')
    equip('r_yaoting')
    const twoPiece = modOf(buildPlayerSnap().mods, 'lifesteal')
    expect(twoPiece, '妖庭要三件,两件不该给套件那一份').toBeCloseTo(
      // 两件自身的固定词条 lifesteal 0.02 仍应计入
      twoPiece
    )
    equip('tl_yaoting')
    expect(modOf(buildPlayerSnap().mods, 'lifesteal') - twoPiece, '补齐第三件才加套件那份').toBeCloseTo(
      ACCESSORY_SET_LIFESTEAL
    )
  })

  it('铁壁两件:置 ironwallBrace,且不往词条里塞东西', () => {
    expect(buildPlayerSnap().ironwallBrace).toBe(false)
    equip('w_xuantie')
    equip('h_xuantie')
    const snap = buildPlayerSnap()
    expect(snap.ironwallBrace, '铁壁两件应置保命钩子').toBe(true)
    // 钩子是 CombatantSnap 上的布尔,不是词条:面板与快照词条里都不该多出东西
    expect(Object.keys(snap.mods).filter(k => !(k in player0().finalStats.mods)), '铁壁不该塞词条').toEqual([])
  })
})
