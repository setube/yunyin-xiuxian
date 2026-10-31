/**
 * 短期秘境 —— 一次性内容:进入一次、规则随机、结束后消失,不污染大地图。
 * 结构:进入(付入口代价)→ 随机规则 1~2 条 → 三层 → 最终宝藏。
 * 每条规则须带一组既有 CombatRules,文本只是它的说法;既有规则表达不出来的不进池。
 */
import type { CombatRules } from '@/types'

/** 秘境层数:固定三层(放 data,供 player.sanitize 读档修形,免得反手 import core) */
export const SECRET_LAYERS = 3
/** 败两次即被逐出 */
export const SECRET_MAX_LOSSES = 2

export interface SecretRule {
  /** 给玩家看的说法 */
  text: string
  /** 旧版说法:旧会话存的是它,读档归一到 text */
  legacyTexts?: readonly string[]
  /** 真正并入战斗的规则 */
  rules: CombatRules
}

export const SECRET_RULES: SecretRule[] = [
  { text: '治疗减半', rules: { healMult: 0.5 } },
  { text: '敌方反击概率 +15%', legacyTexts: ['敌方多一段追击'], rules: { enemyExtraMods: { counterRate: 0.15 } } },
  { text: '回合上限 20', rules: { maxRounds: 20 } },
  { text: '妖兽狂化(攻击 +20%)', rules: { enemyAtkMult: 1.2 } },
  { text: '不得使用护盾', rules: { shieldCapRatio: 0 } },
  { text: '妖血更厚(气血 +25%)', rules: { enemyHpMult: 1.25 } },
  { text: '此地凶险(敌方攻防各 +10%)', rules: { enemyAtkMult: 1.1, enemyExtraMods: { defensePct: 0.1 } } }
]

/** 按说法认规则,旧说法也认 */
export function secretRuleByText(text: string): SecretRule | undefined {
  return SECRET_RULES.find(r => r.text === text || (r.legacyTexts?.includes(text) ?? false))
}

export interface SecretRealmDef {
  id: string
  name: string
  desc: string
  /** 在哪一册出现:凡境秘境挂在历练页,天界秘境挂在试炼册 */
  gate: 'mortal' | 'celestial'
  /** 可进入的最低大境界(凡境元婴 = 3,天界真仙 = 9) */
  minMajor: number
  /** 入口代价:凡境按地界层级折算灵石;天界用道源 */
  cost: { stone: number } | { daoSource: number }
  /** 本境自带的规则(进入即生效,与随机规则叠加) */
  rules: CombatRules
  /** 层间回血比例(负数为损血) */
  healBetweenPct: number
  /** 战利倍率 */
  rewardMult: number
}

/**
 * 秘境目录:门槛与代价只写在这张表上。
 * 道源真仙之后才有:凡境秘境只能收灵石,天界秘境(minMajor=9)才收道源。
 */
export const SECRET_REALMS: SecretRealmDef[] = [
  {
    id: 'sr_kurong',
    gate: 'mortal',
    name: '枯荣古境',
    desc: '草木枯而复荣。治疗极盛,但每层之末要留一成气血给这片土地。',
    minMajor: 3,
    cost: { stone: 40 },
    rules: { healMult: 2 },
    healBetweenPct: -0.1,
    rewardMult: 1.2
  },
  {
    id: 'sr_jianzhong',
    gate: 'mortal',
    name: '剑冢幻境',
    desc: '万剑横空。出手极重,防守极薄。',
    minMajor: 3,
    cost: { stone: 60 },
    rules: { playerAtkMult: 1.3, playerExtraMods: { defensePct: -0.2 } },
    healBetweenPct: 0.5,
    rewardMult: 1.3
  },
  {
    id: 'sr_kuye',
    gate: 'mortal',
    name: '苦海渡舟',
    desc: '一叶渡苦海。回气极慢,但彼岸所得格外丰厚。',
    minMajor: 4,
    cost: { stone: 80 },
    rules: {},
    healBetweenPct: 0.3,
    rewardMult: 1.5
  },
  // ---- 天界秘境 ----
  {
    id: 'sr_xingchen',
    gate: 'celestial',
    name: '星辰古殿',
    desc: '殿中星轨自行流转。敌势愈盛,天赐亦厚;三层之末,殿心封着一物。',
    minMajor: 9,
    cost: { daoSource: 30 },
    rules: { enemyAtkMult: 1.15 },
    healBetweenPct: 0.4,
    rewardMult: 1.4
  },
  {
    id: 'sr_guixu',
    gate: 'celestial',
    name: '归墟之眼',
    desc: '万流归墟,视之如渊。此地最凶,所得也最丰。',
    minMajor: 9,
    cost: { daoSource: 50 },
    rules: { playerAtkMult: 1.25, enemyHpMult: 1.2, maxRounds: 25 },
    healBetweenPct: 0.25,
    rewardMult: 1.8
  }
]

const BY_ID = new Map(SECRET_REALMS.map(r => [r.id, r]))

export function secretRealmDef(id: string): SecretRealmDef | undefined {
  return BY_ID.get(id)
}
