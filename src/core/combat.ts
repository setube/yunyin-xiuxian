/**
 * 自动战斗解算 —— 预先解算完整战报,UI 负责按节奏播放
 */
import type {
  CombatantSnap,
  CombatLogEntry,
  CombatResult,
  CombatRules,
  CombatSideStats,
  EnemyDef,
  FoeOrigin,
  FoeOriginPart,
  GNum,
  StatMods
} from '@/types'
import type { RandomService } from '@/utils/random'
import { add, gnZero, mulN, ratio, subClamp, gnMin, gnMax, isZero } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import {
  CRIT_BASE,
  CRIT_DMG_BASE,
  DAMAGE_VARIANCE,
  FULL_HP_THRESHOLD,
  LOW_HP_THRESHOLD,
  MAX_COMBAT_ROUNDS,
  MITIGATION_CAP,
  MITIGATION_K,
  SHIELD_CAP_RATIO,
  SKILL_BLEED_ATK,
  SKILL_DRAIN_HP,
  SKILL_MULTI_HITS,
  SKILL_MULTI_RATIO,
  SKILL_SHIELD_HP,
  SKILL_STUN_CHANCE,
  COMBAT_ATK_BASE,
  COMBAT_DEF_BASE,
  COMBAT_HP_BASE
} from '@/data/constants'
import { artifactValue } from '@/data/artifacts'
import { modOf } from './statsCalc'
import { enemyGearFactor, powerScale, powerScore } from './formulas'

interface Fighter {
  snap: CombatantSnap
  hp: GNum
  shield: GNum
  stunned: boolean
  weaken: number
  /** 攻势渐涨系数(长生印规则下敌方递增) */
  atkRamp: number
  /** 破甲:本场余下回合里防御按此比例下降(0~0.5) */
  defSunder: number
  /** 组合技已触发次数(每场限量) */
  comboUses: number
  stats: CombatSideStats
}

function emptyStats(): CombatSideStats {
  return {
    dealt: gnZero(),
    taken: gnZero(),
    pierceTaken: gnZero(),
    biggestHitTaken: gnZero(),
    healed: gnZero(),
    shieldAbsorbed: gnZero(),
    dodges: 0,
    missedHits: 0,
    hitsLanded: 0,
    counters: 0,
    combos: 0,
    crits: 0,
    skillCasts: 0,
    artifactProcs: 0,
    stunnedTurns: 0
  }
}

/**
 * 凡界敌人的加成来源 —— 与天界的判定同一条纪律:生成方写明,战后分析照读。
 *
 * 两件事相乘:层级补偿(敌人按这一层的装备水平补齐)与危地
 * (出行方式 × 地界凶险 × 灵兽之性 × 区域事件,由调用方先乘成一个数)。
 * 知道得更细的调用方(历练)可以传入更细的 origin,把「危地」摊成它的四项来源。
 */
export function mortalFoeOrigin(tier: number, dangerMult: number): FoeOrigin {
  return mortalFoeOriginFromParts(tier, [{ label: '危地', ratio: dangerMult }])
}

/**
 * 按**已经摊开**的几件事组装来源:层级补偿排在最前(它不是玩家的选择,却是最大的一项),
 * 其余各项由调用方按自己知道的粒度给。总倍率一律由各项相乘得出 ——
 * 手写一个总数再手写一份明细,两者迟早对不上,而这类对不上没人看得出来。
 */
export function mortalFoeOriginFromParts(tier: number, situation: readonly FoeOriginPart[]): FoeOrigin {
  const gear = enemyGearFactor(tier)
  const parts: FoeOriginPart[] = []
  if (gear !== 1) parts.push({ label: '层级补偿', ratio: gear })
  for (const p of situation) if (p.ratio !== 1) parts.push({ ...p })
  const ratio = parts.reduce((acc, p) => acc * p.ratio, 1)
  return {
    label: parts.map(p => p.label).join(' · '),
    ratio,
    damageBonus: 0,
    damageReduction: 0,
    parts,
    // 报了病因也要给方向:加成全在敌人那一侧的三维上,解法自然也在自己这一侧。
    // 反向的账(敌人比这一层该有的还薄)也照实说 —— 占了便宜却不说,玩家会以为自己看错了
    note:
      parts.length === 0
        ? '此敌没有额外加成 —— 你遇到的就是它自己。'
        : ratio > 1
          ? '加成的都是敌人的三维:把自己的三围补到这一层该有的样子,或换更浅的出行方式,它自会收窄。'
          : '此敌比这一层该有的还薄 —— 这一场你占着便宜。'
  }
}

/**
 * 依据敌人模板与区域层级构建敌方快照。
 * `origin` 是这只敌人加成的**来源说明书**:不传则按实际乘过的两件事自动拆开,
 * 知道得更细的调用方(历练)传进来的是摊开到四项的那一份。
 */
export function makeEnemySnap(def: EnemyDef, tier: number, dangerMult: number, origin?: FoeOrigin): CombatantSnap {
  const scale = powerScale(tier)
  const gear = enemyGearFactor(tier) * dangerMult
  return {
    name: def.name,
    icon: def.icon,
    isPlayer: false,
    origin: origin ?? mortalFoeOrigin(tier, dangerMult),
    attack: mulN(scale, COMBAT_ATK_BASE * def.atkMult * gear),
    defense: mulN(scale, COMBAT_DEF_BASE * def.defMult * gear),
    maxHp: mulN(scale, COMBAT_HP_BASE * def.hpMult * gear),
    speed: def.speed,
    mods: def.mods ? { ...def.mods } : {},
    skills: def.skills.map(s => ({ name: s.name, mult: s.mult, rate: s.rate, effect: s.effect })),
    phases: def.phases,
    archetype: def.archetype
  }
}

/** 防御减伤比例(0 ~ MITIGATION_CAP) */
function mitigation(defense: GNum, attack: GNum, armorPen: number): number {
  const def = mulN(defense, Math.max(0, 1 - armorPen))
  const denom = add(def, mulN(attack, MITIGATION_K))
  return Math.min(MITIGATION_CAP, ratio(def, denom))
}

/** 规则附加词条:同键相加 */
function mergeAdd(base: StatMods, extra: StatMods): StatMods {
  const out: StatMods = { ...base }
  for (const k in extra) {
    const key = k as keyof StatMods
    out[key] = (out[key] ?? 0) + (extra[key] ?? 0)
  }
  return out
}

/**
 * 敌人的战力标尺 —— 战斗卡片那枚「敌 X · 我 Y」,与玩家侧同用一把 powerScore,
 * 界面不另算一套权重。入参是已折好的敌人快照(层级/危地/词条俱在)。
 */
export function enemyPowerOf(eSnap: CombatantSnap): GNum {
  return powerScore(eSnap.attack, eSnap.defense, eSnap.maxHp)
}

export function resolveCombat(pSnap: CombatantSnap, eSnap: CombatantSnap, rng: RandomService, rules?: CombatRules): CombatResult {
  // 规则注入:道途与特殊世界只改参数,不改逻辑
  const pEff: CombatantSnap = rules
    ? {
        ...pSnap,
        attack: mulN(pSnap.attack, rules.playerAtkMult ?? 1),
        mods: rules.playerExtraMods ? mergeAdd(pSnap.mods, rules.playerExtraMods) : pSnap.mods
      }
    : pSnap
  const eEff: CombatantSnap = rules
    ? {
        ...eSnap,
        attack: mulN(eSnap.attack, rules.enemyAtkMult ?? 1),
        maxHp: mulN(eSnap.maxHp, rules.enemyHpMult ?? 1),
        mods: rules.enemyExtraMods ? mergeAdd(eSnap.mods, rules.enemyExtraMods) : eSnap.mods
      }
    : eSnap
  const maxRounds = rules?.maxRounds ?? MAX_COMBAT_ROUNDS
  const healMult = rules?.healMult ?? 1
  const shieldCap = rules?.shieldCapRatio ?? SHIELD_CAP_RATIO

  const p: Fighter = {
    snap: pEff,
    hp: mulN(pEff.maxHp, rules?.playerStartHpPct ?? 1),
    shield: gnZero(),
    stunned: false,
    weaken: 0,
    atkRamp: 1,
    defSunder: 0,
    comboUses: 0,
    stats: emptyStats()
  }
 const e: Fighter = {
    snap: eEff,
    hp: { ...eEff.maxHp },
    shield: gnZero(),
    stunned: false,
    weaken: 0,
    atkRamp: 1,
    defSunder: 0,
    comboUses: 0,
    stats: emptyStats()
  }
  const log: CombatLogEntry[] = []

  const hpPct = (f: Fighter): number => Math.max(0, Math.min(1, ratio(f.hp, f.snap.maxHp)))
  const push = (t: CombatLogEntry['t'], side: CombatLogEntry['side'], text: string, dmg?: GNum): void => {
    log.push({ t, side, text, dmg: dmg ? formatGN(dmg) : undefined, php: hpPct(p), ehp: hpPct(e) })
  }

  /**
   * 震慑落地前的最后一道门:受方若带着「净念」法宝,有机会当场挣脱。
   *
   * 三个落点(词条 stunRate、法宝震慑、敌人神通震慑)都走这里 —— 一处漏了,
   * 净念就变成「只挡某一种摄魂」的半成品,而玩家从界面上看不出差别。
   * 挣脱概率取自受方自己的法宝,与出手的一方无关。
   */
  const tryStun = (target: Fighter): boolean => {
    const owned = (target.snap.artifacts ?? []).find(o => o.def.active.effect.type === 'purge')
    // 上限 0.9 写在 data/artifacts 里:留一丝「摄魂也不是吃素的」——再高也不该等于免疫
    if (owned && rng.chance(artifactValue(owned.def, owned.level).active.amount)) {
      target.stats.artifactProcs += 1
      const who = target.snap.isPlayer ? '你' : `【${target.snap.name}】`
      push('proc', target.snap.isPlayer ? 'p' : 'e', `${who}的【${owned.def.name}】灵光一照,摄魂之力散于无形。`)
      return false
    }
    target.stunned = true
    return true
  }

  /** 护体灵光有极限:护盾总量不超过最大生命的一定比例(默认一半,可被世界规则覆盖) */
  const gainShield = (f: Fighter, amount: GNum): void => {
    f.shield = gnMin(add(f.shield, amount), mulN(f.snap.maxHp, shieldCap))
  }

  // 开战护盾
  for (const f of [p, e]) {
    const pct = modOf(f.snap.mods, 'shieldOnStart')
    if (pct > 0) {
      gainShield(f, mulN(f.snap.maxHp, pct))
      push('shield', f.snap.isPlayer ? 'p' : 'e', `${f.snap.name}灵光护体,凝起一层护盾。`)
    }
  }
  push('info', 'sys', `你与【${eSnap.name}】狭路相逢!`)

  const applyDamage = (attacker: Fighter | null, target: Fighter, dmg: GNum, bypassShield = false): boolean => {
    let remain = { ...dmg }
    let shieldBroken = false
    if (!bypassShield && !isZero(target.shield)) {
      const absorbed = gnMin(target.shield, remain)
      target.shield = subClamp(target.shield, absorbed)
      remain = subClamp(remain, absorbed)
      target.stats.shieldAbsorbed = add(target.stats.shieldAbsorbed, absorbed)
      shieldBroken = isZero(target.shield)
    }
    target.hp = subClamp(target.hp, remain)
    // Phase 31 S5:铁壁共鸣 —— 近致命伤首次保命(保留 1 点气血,一次性)
    if (isZero(target.hp) && target.snap.ironwallBrace && target.snap.isPlayer) {
      target.snap.ironwallBrace = false
      target.hp = { m: 1, e: 0 }
      push('proc', 'p', `${target.snap.name}气血将尽,铁壁共鸣铮然作响——性命保住了!`)
    }
    // 遥测
    target.stats.taken = add(target.stats.taken, dmg)
    if (bypassShield) target.stats.pierceTaken = add(target.stats.pierceTaken, dmg)
    target.stats.biggestHitTaken = gnMax(target.stats.biggestHitTaken, dmg)
    if (attacker) {
      attacker.stats.dealt = add(attacker.stats.dealt, dmg)
      attacker.stats.hitsLanded += 1
    }
    return shieldBroken
  }

  /** 治疗:受治疗效率规则影响;溢出部分按「溢疗成盾」转化为护盾 */
  const healSelf = (f: Fighter, rawAmount: GNum): void => {
    let amount = healMult === 1 ? rawAmount : mulN(rawAmount, healMult)
    // 组合技·枯泽回春:濒死时治疗增幅,但灵光护盾随之消散一半(有得有失)
    const kuze = f.snap.comboArt === 'kuze' && hpPct(f) < LOW_HP_THRESHOLD
    if (kuze) amount = mulN(amount, 1.5)
    const missing = subClamp(f.snap.maxHp, f.hp)
    const applied = gnMin(missing, amount)
    f.hp = add(f.hp, applied)
    f.stats.healed = add(f.stats.healed, applied)
    if (kuze && !isZero(f.shield)) f.shield = mulN(f.shield, 0.5)
    const conv = modOf(f.snap.mods, 'overhealShield')
    if (conv > 0) {
      const overflow = subClamp(amount, applied)
      if (!isZero(overflow)) gainShield(f, mulN(overflow, conv))
    }
  }

  const strike = (
    attacker: Fighter,
    target: Fighter,
    mult: number,
    label: string,
    round: number,
    opts: { isSkill?: boolean; pierce?: boolean; skipFollowups?: boolean; skipCounter?: boolean } = {}
  ): void => {
    const aMods = attacker.snap.mods
    const tMods = target.snap.mods
    const aName = attacker.snap.isPlayer ? '你' : `【${attacker.snap.name}】`
    const tName = target.snap.isPlayer ? '你' : `【${target.snap.name}】`
    const side = attacker.snap.isPlayer ? 'p' : 'e'

    /*
     * 闪避判定 —— 命中先抵掉一部分闪避。
     *
     * 闪避型首领的幻境一度是**无解**的:蜃楼幻境 55%、冰魄化身 50%,
     * 玩家没有命中这个属性,只能眼看一半的出手落空,而战后分析还会明说
     * 「N 次出手落空,连击与暴击难以衔接」。故这里让攻击方的命中按百分点
     * 相减(不为负)——堆命中的代价是一整条词条位,换的是「打得中」。
     */
    const dodge = Math.max(0, modOf(tMods, 'dodgeRate') - modOf(aMods, 'accuracy'))
    if (rng.chance(dodge)) {
      target.stats.dodges += 1
      attacker.stats.missedHits += 1
      push('dodge', side, `${aName}施展${label},却被${tName}身形一晃避开。`)
      return
    }

    let factor = mult * (1 + modOf(aMods, 'damageBonus')) * (1 - attacker.weaken)
    if (round === 1) factor *= 1 + modOf(aMods, 'firstStrike')
    if (hpPct(target) < LOW_HP_THRESHOLD) factor *= 1 + modOf(aMods, 'executeDamage')
    // 流派条件:背水 / 锋芒 / 罡盾
    const selfPct = hpPct(attacker)
    if (selfPct < LOW_HP_THRESHOLD) factor *= 1 + modOf(aMods, 'lowHpDamage')
    else if (selfPct > FULL_HP_THRESHOLD) factor *= 1 + modOf(aMods, 'fullHpDamage')
    if (!isZero(attacker.shield)) factor *= 1 + modOf(aMods, 'shieldPower')
    factor *= 1 + rng.float(-DAMAGE_VARIANCE, DAMAGE_VARIANCE)

    const isCrit = rng.chance(CRIT_BASE + modOf(aMods, 'critRate'))
    if (isCrit) {
      factor *= 1 + CRIT_DMG_BASE + modOf(aMods, 'critDamage')
      attacker.stats.crits += 1
    }

    const effDefense = target.defSunder > 0 ? mulN(target.snap.defense, Math.max(0.2, 1 - target.defSunder)) : target.snap.defense
    const red = mitigation(effDefense, attacker.snap.attack, modOf(aMods, 'armorPen'))
    // 真伤:无视护盾与一切减伤词条(防御减免仍计一半)
    let taken: number
    if (opts.pierce) {
      taken = 1
      factor *= 1 - red * 0.5
    } else {
      taken = 1 - modOf(tMods, 'damageReduction')
      if (hpPct(target) < LOW_HP_THRESHOLD) taken -= modOf(tMods, 'lowHpReduction')
      factor *= 1 - red
    }
    factor *= Math.max(0.1, taken)

    const dmg = mulN(attacker.snap.attack, Math.max(0.02, factor) * attacker.atkRamp)
    const shieldBroken = applyDamage(attacker, target, dmg, opts.pierce)

    const verb = opts.isSkill ? `施展【${label}】` : `祭出${label}`
    if (isCrit) {
      push('crit', side, `${aName}${verb},会心一击!${tName}受创甚重。`, dmg)
    } else {
      push(opts.isSkill ? 'skill' : 'atk', side, `${aName}${verb},击中${tName}。`, dmg)
    }

    // 组合技·玄罡反震:护盾被击破的刹那,立即一次强化反击(每场限两次)
    if (shieldBroken && target.snap.comboArt === 'xuangang' && target.comboUses < 2 && !isZero(target.hp)) {
      target.comboUses += 1
      push('proc', target.snap.isPlayer ? 'p' : 'e', `${tName}罡盾崩碎,碎光尽数化作反震之力!`)
      strike(target, attacker, 0.9 * (1 + modOf(target.snap.mods, 'counterDamage')), '玄罡反震', round, {
        skipFollowups: true,
        skipCounter: true
      })
      if (isZero(attacker.hp)) return
    }

    // 吸血
    const ls = modOf(aMods, 'lifesteal')
    if (ls > 0) {
      healSelf(attacker, mulN(dmg, ls))
    }
    // 反击(锋反词条增幅反击威力):多段攻击的每一段都可能挨反击
    if (!opts.skipCounter && !isZero(target.hp) && rng.chance(modOf(tMods, 'counterRate'))) {
      target.stats.counters += 1
      push('proc', target.snap.isPlayer ? 'p' : 'e', `${tName}顺势反击!`)
      strike(target, attacker, 0.5 * (1 + modOf(tMods, 'counterDamage')), '反击', round, {
        skipFollowups: true,
        skipCounter: true
      })
    }
    if (opts.skipFollowups) return
    // 组合技·锋连诀:满血会心必接一记追击(每场限一次)
    if (isCrit && attacker.snap.comboArt === 'fenglian' && selfPct > FULL_HP_THRESHOLD && attacker.comboUses < 1 && !isZero(target.hp)) {
      attacker.comboUses += 1
      attacker.stats.combos += 1
      push('proc', side, `${aName}锋芒未敛,剑势连绵——锋连诀!`)
      strike(attacker, target, 0.7 * (1 + modOf(aMods, 'comboDamage')), '锋连诀', round, {
        skipFollowups: true,
        skipCounter: true
      })
    }
    // 连击(连环词条增幅追击威力)
    if (!isZero(target.hp) && rng.chance(modOf(aMods, 'comboRate'))) {
      attacker.stats.combos += 1
      strike(attacker, target, 0.6 * (1 + modOf(aMods, 'comboDamage')), '追击', round, {
        skipFollowups: true,
        skipCounter: true
      })
    }
    // 震慑
    if (!isZero(target.hp) && rng.chance(modOf(aMods, 'stunRate'))) {
      if (tryStun(target)) push('proc', side, `${tName}被震得气血翻涌,一时难以动弹!`)
    }
  }

  const act = (self: Fighter, foe: Fighter, round: number): void => {
    if (isZero(self.hp) || isZero(foe.hp)) return
    const name = self.snap.isPlayer ? '你' : `【${self.snap.name}】`
    const side = self.snap.isPlayer ? 'p' : 'e'

    // 回合回复
    const regen = modOf(self.snap.mods, 'regenPerRound')
    if (regen > 0 && hpPct(self) < 1) {
      healSelf(self, mulN(self.snap.maxHp, regen))
    }
    // 法宝自动触发(元婴起可佩两件)
    for (const owned of self.snap.artifacts ?? []) {
      if (isZero(foe.hp)) return
      const art = owned.def
      const eff = art.active.effect
      // 净念是随身被动,由 tryStun 在受慑的那一刻接管 —— 不走「每 N 回合出手」的节拍
      if (eff.type === 'purge') continue
      if (round % art.active.interval !== 0) continue
      self.stats.artifactProcs += 1
      // 数值取自 artifactValue —— 界面上的神通说明读的是同一个函数,不会各说各话
      const values = artifactValue(art, owned.level).active
      if (eff.type === 'damage') {
        const dmgAmt = mulN(self.snap.attack, values.amount)
        applyDamage(self, foe, dmgAmt)
        push('proc', side, `${name}的【${art.name}】自行出手——${art.active.name}!`, dmgAmt)
      } else if (eff.type === 'drain') {
        // 吸命:伤害与回复是同一件事的两面 —— 打出多少,按比例补回自身
        const dmgAmt = mulN(self.snap.attack, values.amount)
        applyDamage(self, foe, dmgAmt)
        const returned = mulN(dmgAmt, values.heal ?? 0)
        healSelf(self, returned)
        push('proc', side, `${name}的【${art.name}】吸取敌手精血——${art.active.name}!`, dmgAmt)
      } else if (eff.type === 'shield') {
        gainShield(self, mulN(self.snap.maxHp, values.amount))
        push('shield', side, `【${art.name}】灵光大盛,护盾加身。`)
      } else if (eff.type === 'heal') {
        healSelf(self, mulN(self.snap.maxHp, values.amount))
        push('heal', side, `【${art.name}】洒下灵光,${name}伤势恢复。`)
      } else if (eff.type === 'stun') {
        if (tryStun(foe)) {
          push('proc', side, `【${art.name}】摄住${foe.snap.isPlayer ? '你' : `【${foe.snap.name}】`}的心神,那一手没能出。`)
        }
      } else if (eff.type === 'sunder') {
        foe.defSunder = Math.max(foe.defSunder, values.amount)
        push('proc', side, `【${art.name}】${art.active.name},${foe.snap.isPlayer ? '你的' : `【${foe.snap.name}】的`}护体被撕开一道口子。`)
      } else {
        foe.weaken = values.amount
        push('proc', side, `【${art.name}】发威,${foe.snap.isPlayer ? '你' : `【${foe.snap.name}】`}的攻势被削弱了。`)
      }
    }
    if (isZero(foe.hp)) return
    // 震慑跳过
    if (self.stunned) {
      self.stunned = false
      self.stats.stunnedTurns += 1
      push('info', side, `${name}气血逆涌,这一招被生生打断。`)
      return
    }
    // 选择技能
    let mult = 1
    let label = self.snap.isPlayer ? '一记攻势' : '一记爪击'
    let isSkill = false
    let effect: string | undefined
    for (const sk of self.snap.skills) {
      if (rng.chance(sk.rate)) {
        mult = sk.mult
        label = sk.name
        isSkill = true
        effect = sk.effect
        self.stats.skillCasts += 1
        break
      }
    }
    strike(self, foe, mult, label, round, { isSkill, pierce: effect === 'pierce' })
    // 技能附加效果
    if (effect && !isZero(foe.hp)) {
      if (effect === 'multi') {
        for (let i = 0; i < SKILL_MULTI_HITS && !isZero(foe.hp) && !isZero(self.hp); i += 1) {
          strike(self, foe, mult * SKILL_MULTI_RATIO, label, round, { isSkill: true, skipFollowups: true })
        }
      } else if (effect === 'stun' && rng.chance(SKILL_STUN_CHANCE)) {
        tryStun(foe)
      } else if (effect === 'drain') {
        healSelf(self, mulN(self.snap.maxHp, SKILL_DRAIN_HP))
      } else if (effect === 'shield') {
        gainShield(self, mulN(self.snap.maxHp, SKILL_SHIELD_HP))
      } else if (effect === 'bleed') {
        applyDamage(self, foe, mulN(self.snap.attack, SKILL_BLEED_ATK))
      }
    }
  }

  let rounds = 0
  // 先手判定:一条阈值,不是连续收益 —— 两个数都要留着给战后分析(见 CombatResult.firstMove)
  const pSpeed = 1 + modOf(pEff.mods, 'speed')
  const eSpeed = eEff.speed
  const pFirst = pSpeed >= eSpeed
  const perRounds = rules?.perRounds
  // Phase 30.7: Boss 阶段系统 + 机制家族
  let phaseIdx = -1
  const bossPhases = eSnap.phases ?? []
  const bossMods: StatMods = { ...eEff.mods }
  const bossSkills = [...eEff.skills]
  eEff.mods = bossMods
  eEff.skills = bossSkills

  const applyPhaseTransition = (): void => {
    const hpRatio = hpPct(e)
    let nextIdx = -1
    for (let i = 0; i < bossPhases.length; i += 1) {
      if (hpRatio <= bossPhases[i]!.hpThreshold) nextIdx = i
    }
    if (nextIdx > phaseIdx) {
      for (let i = phaseIdx + 1; i <= nextIdx; i += 1) {
        const ph = bossPhases[i]!
        if (ph.modChanges) Object.assign(bossMods, ph.modChanges)
        if (ph.skillChanges) {
          bossSkills.length = 0
          bossSkills.push(...ph.skillChanges)
        }
        if (ph.label) push('info', 'e', `【${eSnap.name}】${ph.label}!`)
      }
      phaseIdx = nextIdx
    }
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    rounds = round
    // Boss 阶段检测(在每回合开始前触发)
    if (bossPhases.length > 0 && !isZero(e.hp)) applyPhaseTransition()
    // 长生印:每隔若干回合玩家得一枚印记(恢复+护盾),敌人攻势渐涨
    if (perRounds && round % perRounds.interval === 0 && !isZero(p.hp) && !isZero(e.hp)) {
      healSelf(p, mulN(p.snap.maxHp, perRounds.playerHealPct))
      gainShield(p, mulN(p.snap.maxHp, perRounds.playerShieldPct))
      e.atkRamp += perRounds.enemyAtkGrowth
      push('heal', 'p', `岁月为你加冕——长生印生效,气血与护盾俱增;敌人杀意亦涨。`)
    }
    const order: [Fighter, Fighter][] = pFirst
      ? [
          [p, e],
          [e, p]
        ]
      : [
          [e, p],
          [p, e]
        ]
    for (const [self, foe] of order) {
      act(self, foe, round)
      if (isZero(p.hp) || isZero(e.hp)) break
    }
    if (isZero(p.hp) || isZero(e.hp)) break
  }

  let win: boolean
  if (isZero(e.hp) && !isZero(p.hp)) {
    win = true
    push('win', 'sys', `【${eSnap.name}】轰然倒地,魂飞魄散。此战,你胜了。`)
  } else if (isZero(p.hp)) {
    win = false
    push('lose', 'sys', '你气血耗尽,身负重伤,含恨败退……')
  } else {
    // 回合耗尽:你是猎手,拖不死对方即是无功而返(防「不死但杀不动」流躺赢)
    win = false
    push('lose', 'sys', `鏖战多时仍未能建功,【${eSnap.name}】遁走,你无功而返。`)
  }
  return {
    win,
    log,
    rounds,
    playerHpPct: hpPct(p),
    // 敌人加成的来源随战报带走 —— 战后分析不必回头去猜这一场是怎么变难的
    foeOrigin: eSnap.origin,
    // 先手判定如实带出:这是条阈值(见 CombatResult.firstMove 的注释),战后分析据此讲清「差多少」
    firstMove: { playerFirst: pFirst, playerSpeed: pSpeed, enemySpeed: eSpeed },
    stats: { player: p.stats, enemy: e.stats }
  }
}

/** 战力估算用:双方快照的简化胜率(离线结算取样) */
export function sampleWinRate(pSnap: CombatantSnap, eSnap: CombatantSnap, rng: RandomService, samples = 3, rules?: CombatRules): number {
  let wins = 0
  for (let i = 0; i < samples; i += 1) {
    if (resolveCombat(pSnap, eSnap, rng, rules).win) wins += 1
  }
  const table = [0.08, 0.4, 0.72, 0.93]
  // 索引夹到表长内:samples 取 >3 时 Math.min(samples, wins) 会越界取到 undefined →
  // 静默变 NaN,被调用方当作胜率一路传导(离线收益/远征)。表是 4 档,顶格就是 0.93
  return table[Math.min(table.length - 1, wins)]!
}
