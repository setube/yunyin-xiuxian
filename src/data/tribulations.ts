/**
 * 天劫类型(Phase 32.0)
 *
 * 每次大境界天劫在突破前派生一个"劫型"(确定性:境界+今日天时作种子)。
 * 劫型改伤害曲线与机制偏好,使不同构筑面对不同劫型有不同短板:
 *   - 雷鸣:爆发高,护盾承压(罡盾略吃力,背水险中求胜)
 *   - 逆流:恢复减效(沐泽被削,连击/锋芒有空间)
 *   - 裂魂:爆发收益下降(锋芒/连击放缓,罡盾稳)
 *   - 铁躯:持续压制,破盾难(减伤流占优)
 *   - 重压:首轮重击(护持/首轮减伤关键)
 *
 * 目的:渡劫从"堆成功率"变成"我的构筑面对这一劫有没有明显短板"。
 */

export type TribulationKind = 'thunder' | 'counterflow' | 'soulrend' | 'ironbody' | 'heavyrush'

export interface TribulationDef {
  id: TribulationKind
  name: string
  seal: string
  /** 劫势一句话 */
  desc: string
  /**
   * 对伤害公式的修正:
   *   dmgMult    单波伤害倍率
   *   healMult   治疗效率(1=正常)
   *   critBonus  暴击额外威胁(0=无)
   *   shieldMult 护盾效果倍率(1=正常)
   */
  dmgMult: number
  healMult: number
  critBonus: number
  shieldMult: number
}

export const TRIBULATIONS: TribulationDef[] = [
  {
    id: 'thunder',
    name: '雷鸣',
    seal: '雷',
    desc: '雷劫爆发极高,护盾在雷光下略显薄弱。若护持不足,恐难挨过中段。',
    dmgMult: 1.15,
    healMult: 1,
    critBonus: 0,
    shieldMult: 0.8
  },
  {
    id: 'counterflow',
    name: '逆流',
    seal: '流',
    desc: '劫中灵气逆乱,治疗恢复效果大减。久战者需另寻生路。',
    dmgMult: 0.95,
    healMult: 0.65,
    critBonus: 0,
    shieldMult: 1
  },
  {
    id: 'soulrend',
    name: '裂魂',
    seal: '魂',
    desc: '劫雷直撼神魂,爆发类攻势被压制,唯守中带稳者能从容。',
    dmgMult: 1.0,
    healMult: 1,
    critBonus: 0.25,
    shieldMult: 1.1
  },
  {
    id: 'ironbody',
    name: '铁躯',
    seal: '躯',
    desc: '劫雷沉重绵密,层层碾落,破不了盾便熬不过去。',
    dmgMult: 1.05,
    healMult: 1,
    critBonus: 0,
    shieldMult: 1
  },
  {
    id: 'heavyrush',
    name: '重压',
    seal: '压',
    desc: '起手一击雷霆万钧,若首轮护持不及,一切休提。',
    dmgMult: 1.0,
    healMult: 1,
    critBonus: 0,
    shieldMult: 1
  }
]

const BY_ID = new Map(TRIBULATIONS.map(t => [t.id, t]))

export function tribulationDef(id: TribulationKind): TribulationDef {
  return BY_ID.get(id) ?? TRIBULATIONS[0]!
}
