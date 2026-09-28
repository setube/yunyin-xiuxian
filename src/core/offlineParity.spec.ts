/**
 * 离线历练与在线历练的「规则同源」红线
 *
 * 历史偏差一:在线 runBattle 把本世逆旅契(lifeTrialRules)并进每场历练战斗,
 * 离线 settleOffline 的普通战与首领战却只传 currentDaoRules —— 四张契
 * (孤行/疾行/残躯/逆锋)的加难在本世最大的时段(离线挂机)里完全不生效,
 * 同一本世、同一地界,离线胜率与在线系统性分叉。危险因子当年就是这么漏的
 * (见 battleFactor.spec),照 HYP-015 的同一条判据抽成 explorationRules,
 * 在线/离线共用一份实现,禁止离线再内联 currentDaoRules。
 *
 * 历史偏差二:离线事件自动结算用硬编码 5 个 general 事件池,不读本世路线节点 ——
 * 敌群已走 placeContent(「敌群取自本世路线节点」),事件也必须走同一条路,
 * 经 regionEventPoolFor 尊重本世 eventTags / minRealm / once。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { explorationRules } from './exploration'
import { usePlayerStore } from '@/stores/player'

const src = (f: string) => resolve(__dirname, f)

describe('离线历练 · 战斗规则与在线同源(逆旅契)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('逆旅契合并只此一份:在线与离线都经 explorationRules,离线不再内联 currentDaoRules', () => {
    const exploration = readFileSync(src('./exploration.ts'), 'utf8')
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 逆旅契规则在此实现,在线调用点不另起炉灶
    expect(exploration).toContain('lifeTrialRules()')
    // 离线普通战与首领战都走共用函数
    expect(offline).toContain('explorationRules')
    // 前车之鉴:离线只带 currentDaoRules 就会漏契 —— 此调法再不得出现在离线结算
    expect(offline).not.toContain('currentDaoRules()')
  })

  it('签下逆锋契后,explorationRules 并入敌攻/敌命加成', () => {
    usePlayerStore().setLifeTrial({ trialId: 'tr_ni', at: 0, paid: 48 })
    const rules = explorationRules()
    expect(rules?.enemyAtkMult).toBeCloseTo(1.3, 10)
    expect(rules?.enemyHpMult).toBeCloseTo(1.2, 10)
  })

  it('未签契且未择道途时,explorationRules 为空(不叠加任何规则)', () => {
    expect(explorationRules()).toBeUndefined()
  })
})

describe('离线历练 · doubleDropRate 与在线同源', () => {
  it('离线普通战结算并入福缘词条:doubleDropRate 按期望值乘入灵石/修为/材料/装备', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 词条不能只对在线 afterWin 生效 —— 离线普通战公式必须读到它(首领战走 afterWin 天然生效)
    expect(offline).toContain("modOf(mods, 'doubleDropRate')")
    // 期望值乘子(doubleMult)要真的乘进了四处产出公式(stones/exp/materials/equip)
    expect(offline).toContain('* doubleMult')
  })
})

describe('离线历练 · 事件池与在线同源(本世路线)', () => {
  it('离线事件走 placeContent 的 regionEventPoolFor,不再只剩硬编码通用池', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    expect(offline).toContain('regionEventPoolFor')
    expect(offline).toContain('placeContent(region.id).eventTags')
    // 但世界事件不能无条件自动结算:身份/永久构筑类(pet/gongfa/artifact/lifespan)
    // 会被 isOfflineSafeEvent 拦下 —— 它在离线作用域红线段言(offlineScope)里被真实验证
    expect(offline).toContain('isOfflineSafeEvent')
    expect(offline).toContain('OFFLINE_SAFE_EFFECTS')
  })
})

describe('离线历练 · 区域事件加丰与加难成对(regReward)', () => {
  it('离线普通战与首领战的奖励都并上 regionEventReward,不再只有危险', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 与 danger 同源:妖潮/古墓/商队在加难的同时也加丰(奖励倍率进石头/修为/掉落数)
    expect(offline).toContain('regionEventReward')
    expect(offline).toMatch(
      /afterWin\(region, modeDef\.rewardMult \* OFFLINE_BOSS_REWARD_MULT \* regionEventReward, true\)/
    )
    expect(offline).toContain('modeDef.rewardMult * regionEventReward')
    // 装备掉落与灵石/修为同源:模式倍率也要进掉落数。
    // 在线 afterWin 把 mode×regReward 全折进 rewardMult 参数,离线普通战若只并 regReward,
    // 「进取/疾驰」这类高收益模式对离线装备掉落就落空(曾经正是如此)
    expect(offline).toContain('EQUIP_DROP_CHANCE * modeDef.rewardMult * regionEventReward')
  })
})
