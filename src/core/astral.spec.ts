/* eslint-disable no-console */
/**
 * Phase 31.0 S5:astral 共鸣(星斗/仙甲/混沌)进战斗 —— 开战时护盾 +5%
 *
 * 铁壁共鸣(ironwall)有接线与测试,astral 却只停留在「声明」:
 *   - equipSet.ts 定义了三套 astral(星斗/仙甲/混沌),UI 显示「共鸣」;
 *   - 但 playerSnap 只把 ironwall 物化成 ironwallBrace,combat 开战护盾只读
 *     mods.shieldOnStart(由词条/功法提供)——astral 套装凑齐两件,战斗毫无变化。
 *
 * 这里钉住承诺:两件星斗套 → buildPlayerSnap 的 mods 带上 shieldOnStart +5%,
 * 真打一场,开局「灵光护体」应声而起(护盾吸收掉首击的绝大部分)。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EquipmentInstance, QualityId } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { resolveCombat, makeEnemySnap } from './combat'
import { buildPlayerSnap } from './playerSnap'
import { enemyDef } from '@/data/enemies'
import { useInventoryStore } from '@/stores/inventory'
import { ACCESSORY_SET_LIFESTEAL } from './equipSet'
import { toNum, mulN, gnZero } from '@/utils/gnum'

function inst(uid: string, templateId: string): EquipmentInstance {
  return { uid, templateId, quality: 'fine' as QualityId, tier: 14, level: 0, affixes: [] }
}

/** 两件星斗套(星辰冠 + 星罗法衣)入背包并佩戴 */
function wearStarDou(): void {
  const inv = useInventoryStore()
  inv.items = [inst('hat-xingchen', 'h_xingchen'), inst('body-xingluo', 'b_xingluo')]
  inv.equipped = { head: 'hat-xingchen', body: 'body-xingluo' } as never
}

describe('astral 共鸣进战斗(开战护盾+5%)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('两件星斗套 → buildPlayerSnap 的 mods 带上 shieldOnStart +5%', () => {
    wearStarDou()
    const snap = buildPlayerSnap()
    // 星斗套两件在身:开战护盾 = astral 的 5%(基础 0)
    expect(snap.mods.shieldOnStart ?? 0).toBeGreaterThanOrEqual(0.05)
  })

  it('单件星斗不会触发共鸣(件数不足)', () => {
    const inv = useInventoryStore()
    inv.items = [inst('hat-xingchen', 'h_xingchen')]
    inv.equipped = { head: 'hat-xingchen' } as never

    const snap = buildPlayerSnap()
    expect(snap.mods.shieldOnStart ?? 0).toBeLessThan(0.03)
  })

  it('真打一场:开战即见「灵光护体」,护盾吸收首击大部分', () => {
    wearStarDou()
    const snap = buildPlayerSnap()
    // 敌人用最低档狼,攻击拉到一时满血,让护盾能挡住第一击
    const enemy = makeEnemySnap(enemyDef('e_wolf')!, 1, 1)
    enemy.attack = snap.maxHp
    const res = resolveCombat(snap, enemy, new RandomService(mulberry32(9)))

    const logText = res.log.map(l => l.text).join('\n')
    console.log(logText)
    expect(logText.includes('灵光护体')).toBe(true)
  })
})

/**
 * Phase B-2a:饰品三件套共鸣(妖庭 trio)—— 与星斗/仙甲同一套 machinery,但钩子是新的:
 * 项链+戒指+灵符各一件凑齐 → 吸血被动(造成伤害的 8% 转化为生命),真打一场在战斗里回血。
 */
describe('饰品三件套共鸣进战斗(妖庭 trio → 吸血)', () => {
  function wearYaoTing(): void {
    const inv = useInventoryStore()
    inv.items = [inst('n-shuan', 'n_yaoting'), inst('r-huan', 'r_yaoting'), inst('tl-fu', 'tl_yaoting')]
    inv.equipped = { necklace: 'n-shuan', ring: 'r-huan', talisman: 'tl-fu' } as never
  }

  it('三件妖庭饰品 → buildPlayerSnap 的 mods 带上 lifesteal +8%', () => {
    wearYaoTing()
    const snap = buildPlayerSnap()
    expect(snap.mods.lifesteal ?? 0).toBeGreaterThanOrEqual(ACCESSORY_SET_LIFESTEAL)
  })

  it('只穿两件(缺一件)不触发 —— 三件才凑得起三件套', () => {
    const inv = useInventoryStore()
    inv.items = [inst('n-shuan', 'n_yaoting'), inst('r-huan', 'r_yaoting')]
    inv.equipped = { necklace: 'n-shuan', ring: 'r-huan' } as never
    const snap = buildPlayerSnap()
    expect(snap.mods.lifesteal ?? 0).toBeLessThan(ACCESSORY_SET_LIFESTEAL)
  })

  it('吸血来源只可能是套装:无套装的普通三 J 饰物 lifesteal 为 0(隔离对照)', () => {
    // 妖庭(13)之外,普通 tier-12 三 J 饰物(冰髓坠/寒魄戒/寒光符)不在任何套里,穿上后 lifesteal 应为 0
    const inv = useInventoryStore()
    inv.items = [inst('n-plain', 'n_longhun'), inst('r-plain', 'r_liuli'), inst('tl-plain', 'tl_jinguang')]
    inv.equipped = { necklace: 'n-plain', ring: 'r-plain', talisman: 'tl-plain' } as never
    const snap = buildPlayerSnap()
    // 角色自带没有吸血来源(默认无功法/无吸血器魂),这 0 说明吸血全来自套装
    expect(snap.mods.lifesteal ?? 0).toBe(0)
  })

  it('真打一场:受创后吸血之躯真的回复气血(stats.healed > 0)', () => {
    wearYaoTing()
    const snap = buildPlayerSnap()
    const enemy = makeEnemySnap(enemyDef('e_wolf')!, 1, 1)
    // 敌人每次打掉四成血:玩家受创 → 下次出招吸血拉回,不离场堪比回血挂
    enemy.attack = mulN(snap.maxHp, 0.4)
    enemy.speed = 10
    const res = resolveCombat(snap, enemy, new RandomService(mulberry32(7)))
    const healed = toNum(res.stats?.player.healed ?? gnZero())
    console.log(`\n妖庭吸血:玩家一场回血 ${healed} (lifesteal=${snap.mods.lifesteal})`)
    expect(healed).toBeGreaterThan(0)
  })
})
