/** 属性中文名映射(展示层共用) */
import { formatPercent } from '@/utils/format'
import {
  CRIT_BASE,
  CRIT_DMG_BASE,
  FULL_HP_THRESHOLD,
  LOW_HP_THRESHOLD,
  SHIELD_CAP_RATIO
} from '@/data/constants'
import { POWER_WEIGHTS } from '@/core/formulas'
import type { AffixRarity, AnyStatKey, StatMods } from '@/types'

/**
 * 词条稀有度的名目与颜色(展示层)。
 *
 * 稀有度此前只在数据里参与加权抽取,界面上从没露过面;现在装备卡片按它排序上色,
 * 玩家才看得出「这一条是撞上的大运」还是「这条是搭头」。名目沿用本作的四档叫法。
 */
export const AFFIX_RARITY_META: Record<AffixRarity, { name: string; color: string }> = {
  common: { name: '常见', color: 'var(--color-ink-faint)' },
  rare: { name: '稀有', color: 'var(--color-azure)' },
  epic: { name: '珍稀', color: 'var(--color-violet-ink)' },
  legendary: { name: '传世', color: 'var(--color-gold-ink)' }
}

export const STAT_NAMES: Record<AnyStatKey, string> = {
  attackPct: '攻击',
  defensePct: '防御',
  maxHpPct: '生命上限',
  critRate: '暴击率',
  critDamage: '暴击伤害',
  /**
   * 先手判定(speed)——这个名字必须与机制同形。
   *
   * 它是一条**阈值**:1 + 本项修正 ≥ 对手速度即抢先(见 core/combat.ts)。
   * 从前叫「出手速度」,读起来像连续收益,于是「+6% 为什么还是后手」成了必然的困惑。
   */
  speed: '先手判定',
  damageBonus: '伤害增幅',
  damageReduction: '伤害减免',
  cultivationSpeed: '修炼速度',
  qiRegen: '灵气恢复',
  /**
   * 「进阶成功率」——**不是**大关成功率。
   *
   * 它只进 `breakthroughInfo` 的那一次掷点:每大境 9 次小进阶(一世约 180 次)。
   * 大关(筑基起,含三个跨界入口)一律走天劫的逐波推演,压根不掷这个骰子
   * (见 core/breakthrough 的 attemptBreakthrough 与 tribulationDecision)。
   * 所以这条作用域是**恰好等于**小进阶的 —— 没有例外,不必带星号。
   *
   * 从前这里叫「突破成功率」,读起来像"万事皆管":玩家把「天命」「破境」堆满再
   * 去渡大关,发现一点用没有 —— 那是名字在过度承诺,不是数值失效。
   */
  breakthroughRate: '进阶成功率',
  /**
   * Equipment quality weights (equipGen) and 5% of this value folded into
   * the minor-step rate (breakthroughInfo). It does not raise event odds.
   */
  luck: '气运',
  /**
   * Divides EXPLORE_BATTLE_INTERVAL. Trip length is modeDef.durationSec
   * (and pet exploreDurMult). Calling it 「历练速度」looks like a shorter walk.
   */
  explorationSpeed: '历练遇敌',
  lifespanPct: '寿元上限',
  /**
   * loot.ts / offline explore only scale battle stone. Cave yield, events,
   * salvage, and suppress ticks ignore this key.
   */
  spiritStoneGain: '战利灵石',
  /**
   * loot.ts / offline.ts only multiply EQUIP_DROP_CHANCE.
   * Stone, herb, ore, pages, and pills ignore this key — calling it
   * 「掉落率」makes a title or weather day look like every bag fill.
   */
  dropRate: '装备掉落率',
  expGain: '战斗修为',
  /**
   * pillService adds this to craftability.bonusChance for a second pill,
   * then caps the roll at 0.8. It is not a 10% larger batch.
   */
  alchemyYield: '双枚成丹',
  /**
   * forge.equipUpgradeCost only. Artifact ritual, reforge, and crafting
   * ignore this key — 「炼器减耗」read like the whole forge table.
   */
  forgeDiscount: '强化减耗',
  qiCapPct: '灵气上限',
  beastPct: '灵兽效果',
  armorPen: '破甲',
  // 与 speed 分开命名:那个管「谁先出手」,这个管「首回合打得更重」(先发/雷霆词条)
  /**
   * Round-1 damage only (combat.ts factor on round === 1).
   * It does not move the speed threshold.
   */
  firstStrike: '首回合伤害',
  counterRate: '反击概率',
  lifesteal: '吸血',
  shieldOnStart: '开战护盾',
  executeDamage: '处决伤害',
  regenPerRound: '回合回复',
  /**
   * Net dodge after subtracting attacker accuracy (combat.ts).
   * Accuracy does nothing against a foe who does not dodge.
   */
  dodgeRate: '闪避',
  accuracy: '命中',
  lowHpReduction: '濒危减伤',
  /**
   * Fail path only: shrinks BT_FAIL_EXP_LOSS. Qi is spent before the roll
   * and never comes back. The old name 「突破返还」read like a success rebate.
   */
  breakRefund: '失败返还修为',
  /**
   * loot.afterWin rolls this once: stone, battle exp, herb/ore count,
   * pages, extra equip tries. It is not "more item drops only".
   */
  doubleDropRate: '双倍战利',
  /**
   * Multiplies EXPLORE_EVENT_CHANCE in exploreEventChance.
   * Cave tours, bonds, and shop luck ignore this key.
   */
  eventLuck: '历练际遇',
  tribulationResist: '御劫',
  comboRate: '连击',
  stunRate: '震慑',
  lowHpDamage: '背水增伤',
  fullHpDamage: '锋芒增伤',
  shieldPower: '罡盾增伤',
  comboDamage: '追击威力',
  counterDamage: '反击威力',
  overhealShield: '溢疗成盾'
}

/** Every panel that lists mods walks this, so a new key cannot hide on the character sheet. */
export const STAT_KEYS = Object.keys(STAT_NAMES) as AnyStatKey[]

/**
 * 把一组词条摊成一行人话。
 *
 * 功法分支的词条既在择道界面出现,也在悟道录里出现 ——
 * 两处若各写一份格式化,措辞迟早分叉。
 */
/** Percent with an explicit sign. formatPercent already has a minus; do not prefix '+'. */
export function signedPercent(n: number): string {
  if (n < 0) return `-${formatPercent(Math.abs(n))}`
  return `+${formatPercent(n)}`
}

/**
 * Scope notes that belong on the number, not only in comments.
 * Titles, pills, weather, veins, and talent chips all read this map.
 */
export const STAT_CAVEATS: Partial<Record<AnyStatKey, string>> = {
  breakthroughRate: '只入小进阶;大关天劫不与',
  luck: '主器物成色;小进阶另借此数半成',
  breakRefund: '只还败时所损修为;灵气不退',
  alchemyYield: '再得一枚之机;与手艺合计不过八成',
  explorationSpeed: '同程妖踪更密;行程不减',
  spiritStoneGain: '只入历练战胜之石;洞府所产不与',
  forgeDiscount: '只省装备强化之耗;法宝祭炼不与',
  dropRate: '只增装备现世;灵石草矿不与',
  eventLuck: '只增历练途中际遇;洞府巡游不与',
  doubleDropRate: '当场灵石、修为、材料与装备一并翻倍',
  expGain: '只入历练战胜之修为;静修不与',
  tribulationResist: '只减天劫之伤;小进阶之骰不改',
  qiCapPct: '灵气上限上浮,积余之仓随之',
  beastPct: '放大灵兽词条;灵兽园等级不在其中',
  speed: '须不弱于对手,方得抢先',
  firstStrike: '只重开局一合;不改谁先出手',
  dodgeRate: '须高于对手命中,方得避开',
  accuracy: '只抵对手闪避;不闪则无增益',
  critRate: `叠于固有会心 ${formatPercent(CRIT_BASE)} 之上`,
  critDamage: `叠于固有会心之伤 ${formatPercent(CRIT_DMG_BASE)} 之上`,
  executeDamage: `只伤气血未满 ${formatPercent(LOW_HP_THRESHOLD)} 之敌`,
  lowHpDamage: `须己身气血未满 ${formatPercent(LOW_HP_THRESHOLD)}`,
  lowHpReduction: `须己身气血未满 ${formatPercent(LOW_HP_THRESHOLD)}`,
  fullHpDamage: `须己身气血逾 ${formatPercent(FULL_HP_THRESHOLD)}`,
  shieldOnStart: `开战凝盾;总量不过 ${formatPercent(SHIELD_CAP_RATIO)} 气血`,
  shieldPower: '须护盾仍在',
  armorPen: '先削其防,再入减免;不是真伤',
  comboRate: '另起一击,非连段暴击',
  comboDamage: '只增追击,不增本击',
  counterRate: '受击后方可还手',
  counterDamage: '只增反击,不增本击',
  stunRate: '震慑一合;净念或可破之',
  lifesteal: '按造成之伤回血',
  regenPerRound: '回合初回血;已满则无',
  overhealShield: '只化溢出之疗'
}

export function statCaveat(key: string): string | undefined {
  return STAT_CAVEATS[key as AnyStatKey]
}

export function statValueText(key: string, n: number): string {
  const caveat = statCaveat(key)
  return caveat ? `${signedPercent(n)}(${caveat})` : signedPercent(n)
}

export function statModPhrase(key: string, n: number): string {
  const name = STAT_NAMES[key as AnyStatKey] ?? key
  return `${name} ${statValueText(key, n)}`
}

/** 战力算式一句话 —— 权重取自 POWER_WEIGHTS,与 powerScore 同源 */
export function powerExplainText(): string {
  const w = POWER_WEIGHTS
  return `攻×${w.attack} + 防×${w.defense} + 血×${w.hp}`
}

export function modsText(mods: StatMods): string {
  return Object.entries(mods)
    .map(([k, v]) => statModPhrase(k, v as number))
    .join(' · ')
}
