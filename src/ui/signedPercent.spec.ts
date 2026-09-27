import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { signedPercent, modsText } from './statNames'

describe('signedPercent', () => {
  it('负值是减号,不会拼出 +-', () => {
    expect(signedPercent(-0.5)).toBe('-50%')
    expect(signedPercent(0.12)).toBe('+12%')
    expect(signedPercent(-0.5)).not.toContain('+-')
  })

  it('luck 主要抬装备成色,小进阶只折入此数的 5%', () => {
    expect(modsText({ luck: 0.1 })).toBe('气运 +10%(主器物成色;小进阶另借此数半成)')
    const gen = readFileSync(resolve(__dirname, '../core/equipGen.ts'), 'utf8')
    expect(gen).toContain('luckBoost')
    const bt = readFileSync(resolve(__dirname, '../core/breakthrough.ts'), 'utf8')
    expect(bt).toContain("modOf(mods, 'luck') * 0.05")
    const explore = readFileSync(resolve(__dirname, '../core/exploration.ts'), 'utf8')
    expect(explore).not.toContain("modOf(mods, 'luck')")
  })

  it('进阶成功率词条自带小进阶边界,称号丹药天时共用', () => {
    expect(modsText({ breakthroughRate: 0.08 })).toBe('进阶成功率 +8%(只入小进阶;大关天劫不与)')
  })

  it('explorationSpeed 只加密同程遭遇,不说成缩短行程', () => {
    expect(modsText({ explorationSpeed: 0.3 })).toBe('历练遇敌 +30%(同程妖踪更密;行程不减)')
    expect(modsText({ explorationSpeed: 0.3 })).not.toContain('历练速度')
    const explore = readFileSync(resolve(__dirname, '../core/exploration.ts'), 'utf8')
    expect(explore).toContain("modOf(player.finalStats.mods, 'explorationSpeed')")
    expect(explore).toContain('exploreDurationSec(mode, player.petId)')
    expect(explore).toContain('personalityEffects(petId).exploreDurMult')
  })

  it('alchemyYield 只报双枚成丹概率,不说成产量翻倍', () => {
    expect(modsText({ alchemyYield: 0.1 })).toBe('双枚成丹 +10%(再得一枚之机;与手艺合计不过八成)')
    expect(modsText({ alchemyYield: 0.1 })).not.toContain('炼丹产出')
    const craft = readFileSync(resolve(__dirname, '../core/pillService.ts'), 'utf8')
    expect(craft).toContain("modOf(player.finalStats.mods, 'alchemyYield')")
    expect(craft).toContain('bonusChance + yieldMod')
    expect(craft).toContain('Math.min(0.8')
  })

  it('breakRefund 只报失败少损修为,不说成突破返还', () => {
    expect(modsText({ breakRefund: 0.1 })).toBe('失败返还修为 +10%(只还败时所损修为;灵气不退)')
    expect(modsText({ breakRefund: 0.1 })).not.toContain('突破返还')
    const bt = readFileSync(resolve(__dirname, '../core/breakthrough.ts'), 'utf8')
    expect(bt).toContain("modOf(mods, 'breakRefund')")
    expect(bt).toContain('loseExpPct')
    expect(bt.indexOf('setQi')).toBeLessThan(bt.indexOf("modOf(mods, 'breakRefund')"))
  })

  it('dropRate 只报装备出现率,不说成一切战利都涨', () => {
    expect(modsText({ dropRate: 0.08 })).toBe('装备掉落率 +8%(只增装备现世;灵石草矿不与)')
    expect(modsText({ dropRate: 0.08 })).not.toBe('掉落率 +8%')
    const loot = readFileSync(resolve(__dirname, '../core/loot.ts'), 'utf8')
    expect(loot).toContain("modOf(mods, 'dropRate')")
    expect(loot).toContain('equipChance')
    expect(loot).not.toMatch(/stoneAmt[\s\S]{0,80}dropRate/)
  })

  it('spiritStoneGain 只报历练战胜灵石,不说成一切入账都涨', () => {
    expect(modsText({ spiritStoneGain: 0.12 })).toBe('战利灵石 +12%(只入历练战胜之石;洞府所产不与)')
    expect(modsText({ spiritStoneGain: 0.12 })).not.toContain('灵石获取')
    const loot = readFileSync(resolve(__dirname, '../core/loot.ts'), 'utf8')
    expect(loot).toContain("modOf(mods, 'spiritStoneGain')")
    const suppress = readFileSync(resolve(__dirname, '../core/suppress.ts'), 'utf8')
    expect(suppress).not.toContain('spiritStoneGain')
  })

  it('forgeDiscount 只报装备强化花费,不说成整张炼器台都打折', () => {
    expect(modsText({ forgeDiscount: 0.1 })).toBe('强化减耗 +10%(只省装备强化之耗;法宝祭炼不与)')
    expect(modsText({ forgeDiscount: 0.1 })).not.toContain('炼器减耗')
    const forge = readFileSync(resolve(__dirname, '../core/forge.ts'), 'utf8')
    expect(forge).toContain("modOf(player.finalStats.mods, 'forgeDiscount')")
    expect(forge).toContain('upgradeCost')
    expect(forge).not.toMatch(/artifact[\s\S]{0,120}forgeDiscount/)
  })

  it('eventLuck 只报历练途中掷点,不说成一切际遇都涨', () => {
    expect(modsText({ eventLuck: 0.15 })).toBe('历练际遇 +15%(只增历练途中际遇;洞府巡游不与)')
    expect(modsText({ eventLuck: 0.15 })).not.toContain('际遇概率')
    const explore = readFileSync(resolve(__dirname, '../core/exploration.ts'), 'utf8')
    expect(explore).toContain("modOf(mods, 'eventLuck')")
    expect(explore).toContain('EXPLORE_EVENT_CHANCE')
    const cave = readFileSync(resolve(__dirname, '../core/earlyGameService.ts'), 'utf8')
    expect(cave).not.toContain('eventLuck')
  })

  it('doubleDropRate 报当场整包翻倍,不说成只多一件装备', () => {
    expect(modsText({ doubleDropRate: 0.1 })).toBe('双倍战利 +10%(当场灵石、修为、材料与装备一并翻倍)')
    const loot = readFileSync(resolve(__dirname, '../core/loot.ts'), 'utf8')
    expect(loot).toContain("modOf(mods, 'doubleDropRate')")
    expect(loot).toContain('doubled')
    expect(loot).toContain('stoneAmt')
  })

  it('expGain 只报历练战胜修为,不说成静修也涨', () => {
    expect(modsText({ expGain: 0.3 })).toBe('战斗修为 +30%(只入历练战胜之修为;静修不与)')
    const loot = readFileSync(resolve(__dirname, '../core/loot.ts'), 'utf8')
    expect(loot).toContain("modOf(mods, 'expGain')")
    const formulas = readFileSync(resolve(__dirname, '../core/formulas.ts'), 'utf8')
    expect(formulas).not.toContain('expGain')
  })

  it('先手判定是阈值开关,不是出手变快', () => {
    expect(modsText({ speed: 0.06 })).toBe('先手判定 +6%(须不弱于对手,方得抢先)')
    const combat = readFileSync(resolve(__dirname, '../core/combat.ts'), 'utf8')
    expect(combat).toContain('1 + modOf(pEff.mods, \'speed\')')
    expect(combat).toContain('pSpeed >= eSpeed')
  })

  it('首回合伤害只乘第一回合,不改先手判定', () => {
    expect(modsText({ firstStrike: 0.2 })).toBe('首回合伤害 +20%(只重开局一合;不改谁先出手)')
    const combat = readFileSync(resolve(__dirname, '../core/combat.ts'), 'utf8')
    expect(combat).toContain("modOf(aMods, 'firstStrike')")
    expect(combat).toContain('round === 1')
  })

  it('闪避与命中是相减,命中打不闪的敌手没有额外收益', () => {
    expect(modsText({ dodgeRate: 0.1 })).toBe('闪避 +10%(须高于对手命中,方得避开)')
    expect(modsText({ accuracy: 0.08 })).toBe('命中 +8%(只抵对手闪避;不闪则无增益)')
    const combat = readFileSync(resolve(__dirname, '../core/combat.ts'), 'utf8')
    expect(combat).toContain("modOf(tMods, 'dodgeRate') - modOf(aMods, 'accuracy')")
  })

  it('会心叠在固有基数上,处决背水锋芒罡盾都有门槛', () => {
    expect(modsText({ critRate: 0.08 })).toContain('固有会心')
    expect(modsText({ critRate: 0.08 })).toContain('5%')
    expect(modsText({ critDamage: 0.3 })).toContain('50%')
    expect(modsText({ executeDamage: 0.2 })).toContain('30%')
    expect(modsText({ lowHpDamage: 0.25 })).toContain('未满')
    expect(modsText({ fullHpDamage: 0.18 })).toContain('90%')
    expect(modsText({ shieldOnStart: 0.1 })).toContain('50%')
    expect(modsText({ shieldPower: 0.12 })).toContain('护盾仍在')
    const combat = readFileSync(resolve(__dirname, '../core/combat.ts'), 'utf8')
    expect(combat).toContain('CRIT_BASE + modOf(aMods, \'critRate\')')
    expect(combat).toContain('CRIT_DMG_BASE + modOf(aMods, \'critDamage\')')
    expect(combat).toContain('LOW_HP_THRESHOLD')
    expect(combat).toContain('FULL_HP_THRESHOLD')
    expect(combat).toContain('SHIELD_CAP_RATIO')
  })

  it('破甲不是真伤,连击反击都是另起一击', () => {
    expect(modsText({ armorPen: 0.1 })).toContain('不是真伤')
    expect(modsText({ comboRate: 0.1 })).toContain('另起一击')
    expect(modsText({ comboDamage: 0.3 })).toContain('追击')
    expect(modsText({ counterRate: 0.12 })).toContain('受击')
    expect(modsText({ counterDamage: 0.4 })).toContain('反击')
    expect(modsText({ stunRate: 0.06 })).toContain('一合')
    expect(modsText({ lifesteal: 0.05 })).toContain('造成之伤')
    expect(modsText({ regenPerRound: 0.02 })).toContain('已满则无')
    expect(modsText({ overhealShield: 0.4 })).toContain('溢出')
    const combat = readFileSync(resolve(__dirname, '../core/combat.ts'), 'utf8')
    expect(combat).toContain('1 - armorPen')
    expect(combat).toContain("modOf(aMods, 'comboRate')")
    expect(combat).toContain("modOf(tMods, 'counterRate')")
  })

  it('御劫只改天劫承伤,不改小进阶骰子', () => {
    expect(modsText({ tribulationResist: 0.2 })).toBe('御劫 +20%(只减天劫之伤;小进阶之骰不改)')
    const trib = readFileSync(resolve(__dirname, '../core/tribulationDecision.ts'), 'utf8')
    expect(trib).toContain("modOf(mods, 'tribulationResist')")
    const bt = readFileSync(resolve(__dirname, '../core/breakthrough.ts'), 'utf8')
    expect(bt).toContain("modOf(mods, 'breakthroughRate')")
    expect(bt).not.toContain("modOf(mods, 'tribulationResist')")
  })

  it('功法、装备详情和法宝被动都走同源词条句,不再手写加号', () => {
    const gongfa = readFileSync(resolve(__dirname, '../components/cultivation/GongfaDialog.vue'), 'utf8')
    const equip = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
    const bag = readFileSync(resolve(__dirname, '../views/InventoryView.vue'), 'utf8')
    expect(gongfa).toContain('statValueText(k, v as number)')
    expect(gongfa).not.toContain('+${formatPercent')
    expect(equip).toContain('statValueText(k, v as number)')
    expect(bag).toContain('statModPhrase(k, v as number)')
    const vein = readFileSync(resolve(__dirname, '../components/dongfu/VeinInvestCard.vue'), 'utf8')
    // 灵脉卡的效果行原产自 veinEffectText —— 卡片不手写加号,内部走 modsText 同源句
    expect(vein).toContain('veinEffectText(')
    const buff = readFileSync(resolve(__dirname, '../components/cultivation/BuffDialog.vue'), 'utf8')
    expect(buff).toContain('statValueText(key, v)')
    expect(buff).toContain('STAT_NAMES')
  })
})
