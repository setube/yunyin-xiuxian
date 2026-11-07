/** 属性中文名映射 —— 词条、面板、战报共用的唯一命名表 */
import { formatPercent } from '@/utils/format'
import {
  CRIT_BASE,
  CRIT_DMG_BASE,
  FULL_HP_THRESHOLD,
  LOW_HP_THRESHOLD,
  SHIELD_CAP_RATIO
} from '@/data/constants'
import type { AffixRarity, AnyStatKey, StatMods } from '@/types'

/** 词条稀有度的名目与颜色(展示层;装备卡片按它排序上色) */
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
  /** 阈值:1 + 本项修正 ≥ 对手速度即抢先(见 core/combat.ts)。不叫「出手速度」:读作连续收益 */
  speed: '先手判定',
  damageBonus: '伤害增幅',
  damageReduction: '伤害减免',
  cultivationSpeed: '修炼速度',
  qiRegen: '灵气恢复',
  /**
   * 只作用于小进阶:`breakthroughInfo` 的那一次掷点。大关(筑基起,含三个跨界入口)走天劫逐波推演,不掷此骰
   * (见 core/breakthrough 的 attemptBreakthrough 与 tribulationDecision)。不叫「突破成功率」:读作含大关。
   */
  breakthroughRate: '进阶成功率',
  /** 作用于装备品质权重(equipGen),另以本值的 5% 折入小进阶成功率(breakthroughInfo);不提高事件概率 */
  luck: '气运',
  /** 除 EXPLORE_BATTLE_INTERVAL;行程长度由 modeDef.durationSec(及灵兽 exploreDurMult)决定。不叫「历练速度」:读作缩短行程 */
  explorationSpeed: '历练遇敌',
  lifespanPct: '寿元上限',
  /** 只放大战斗灵石(loot.ts / 离线历练);洞府产出、事件、分解、镇压产出不吃此项 */
  spiritStoneGain: '战利灵石',
  /** 只乘 EQUIP_DROP_CHANCE(loot.ts / offline.ts);灵石、草、矿、残页、丹药不吃此项。不叫「掉落率」:读作全部掉落 */
  dropRate: '装备掉落率',
  expGain: '战斗修为',
  /** pillService 把它加进 craftability.bonusChance(再得一枚的概率),掷点封顶 0.8;不是产量 +10% */
  alchemyYield: '双枚成丹',
  /** 只作用于 forge.equipUpgradeCost;法宝祭炼、重铸、炼制不吃此项。不叫「炼器减耗」:读作整张炼器表 */
  forgeDiscount: '强化减耗',
  qiCapPct: '灵气上限',
  beastPct: '灵兽效果',
  armorPen: '破甲',
  /** 只增首回合伤害(combat.ts 中 round === 1),不改 speed 的先手阈值;先发/雷霆词条走此项 */
  firstStrike: '首回合伤害',
  counterRate: '反击概率',
  lifesteal: '吸血',
  shieldOnStart: '开战护盾',
  executeDamage: '处决伤害',
  regenPerRound: '回合回复',
  /** 扣除攻方命中后的净闪避(combat.ts);对不闪避的敌人,命中无用 */
  dodgeRate: '闪避',
  accuracy: '命中',
  lowHpReduction: '濒危减伤',
  /** 只在失败时缩减 BT_FAIL_EXP_LOSS;灵气在掷点前已扣,不返还。不叫「突破返还」:读作成功返利 */
  breakRefund: '失败返还修为',
  /** loot.afterWin 掷一次:灵石、战斗修为、草/矿数量、残页、额外装备掷点一并翻倍;不只是多掉物品 */
  doubleDropRate: '双倍战利',
  /** 在 exploreEventChance 中乘 EXPLORE_EVENT_CHANCE;洞府巡游、道侣事件、坊市运气不吃此项 */
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

/** 列词条的面板统一遍历此表,新键不会在角色面板漏显 */
export const STAT_KEYS = Object.keys(STAT_NAMES) as AnyStatKey[]

/** 带符号百分比;formatPercent 负数自带负号,不再前缀 '+' */
export function signedPercent(n: number): string {
  if (n < 0) return `-${formatPercent(Math.abs(n))}`
  return `+${formatPercent(n)}`
}

/** 数值旁的作用域注脚;称号、丹药、天气、灵脉、天赋标签共读此表 */
const STAT_CAVEATS: Partial<Record<AnyStatKey, string>> = {
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

/** 一组词条摊成一行;择道界面与悟道录共用,不另写格式化 */
export function modsText(mods: StatMods): string {
  return Object.entries(mods)
    .map(([k, v]) => statModPhrase(k, v as number))
    .join(' · ')
}

/**
 * 同一组词条,但不带括号注脚 —— 给「一屏列很多行」的地方用。
 *
 * `modsText` 把每个键的作用域注脚一起内联(「暴击率 +4%(叠于固有会心 5% 之上)」),
 * 一条注脚二三十字。单条陈列时那是必要信息(择道、悟道要看清条件);
 * 而器魂散置列表里每枚魂带三四个词条,一行就摊成一百三十多字、把行撑到 156px ——
 * 一屏只看得下两枚魂。注脚只在真要用到时才需要,故这类列表用不带注脚的版本。
 */
export function modsBriefText(mods: StatMods): string {
  return Object.entries(mods)
    .map(([k, v]) => `${STAT_NAMES[k as AnyStatKey] ?? k} ${signedPercent(v as number)}`)
    .join(' · ')
}
