/** 属性中文名映射(展示层共用) */
import { formatPercent } from '@/utils/format'
import type { AnyStatKey, StatMods } from '@/types'

export const STAT_NAMES: Record<AnyStatKey, string> = {
  attackPct: '攻击',
  defensePct: '防御',
  maxHpPct: '生命上限',
  critRate: '暴击率',
  critDamage: '暴击伤害',
  speed: '出手速度',
  damageBonus: '伤害增幅',
  damageReduction: '伤害减免',
  cultivationSpeed: '修炼速度',
  qiRegen: '灵气恢复',
  breakthroughRate: '突破成功率',
  luck: '气运',
  explorationSpeed: '历练速度',
  lifespanPct: '寿元上限',
  spiritStoneGain: '灵石获取',
  dropRate: '掉落率',
  expGain: '战斗修为',
  alchemyYield: '炼丹产出',
  forgeDiscount: '炼器减耗',
  armorPen: '破甲',
  firstStrike: '先手伤害',
  counterRate: '反击概率',
  lifesteal: '吸血',
  shieldOnStart: '开战护盾',
  executeDamage: '处决伤害',
  regenPerRound: '回合回复',
  dodgeRate: '闪避',
  lowHpReduction: '濒危减伤',
  breakRefund: '突破返还',
  doubleDropRate: '双倍战利',
  eventLuck: '奇遇概率',
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

/**
 * 把一组词条摊成一行人话。
 *
 * 功法分支的词条既在择道界面出现,也在悟道录里出现 ——
 * 两处若各写一份格式化,措辞迟早分叉。
 */
export function modsText(mods: StatMods): string {
  return Object.entries(mods)
    .map(([k, v]) => `${STAT_NAMES[k as AnyStatKey] ?? k} +${formatPercent(v as number)}`)
    .join(' · ')
}
