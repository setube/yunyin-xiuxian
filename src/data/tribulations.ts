/**
 * 天劫类型(Phase 32.0 / 32.1 机制兑现)
 *
 * 每次大境界天劫在突破前派生一个"劫型"(确定性:境界+今日天时作种子)。
 * 劫型改伤害曲线与机制偏好,使不同构筑面对不同劫型有不同短板:
 *   - 雷鸣:总量高,雷光破盾(抗性/减伤流的主场,纯护盾流吃亏)
 *   - 逆流:治疗大减(恢复流禁区,护盾/抗性流有空间)
 *   - 裂魂:守中带稳,爆发足者可削劫(爆发流/护盾流)
 *   - 铁躯:绵密钝压,护盾几乎无效但疗伤更值(恢复流/减伤流)
 *   - 重压:起手两击极重,其后转缓(护持流/濒危流)
 *
 * 每种劫型都有 ≥2 条解法,且互不相同——准备度描述的是"解法空间",不是"合格线"。
 * 该性质由 core/tribulationSpace.spec.ts 的三道门持续把守。
 *
 * 目的:渡劫从"堆成功率"变成"我的构筑面对这一劫有没有明显短板"。
 */

export type TribulationKind = 'thunder' | 'counterflow' | 'soulrend' | 'ironbody' | 'heavyrush'

/** 波形:劫雷在各波之间如何分布 */
export type TribulationWaveShape =
  /** 均匀:按基础公式逐波递增 */
  | 'even'
  /** 前重后轻:起手数波重击,其后转缓——首轮护持是关键 */
  | 'frontLoaded'

export interface TribulationDef {
  id: TribulationKind
  name: string
  seal: string
  /** 劫势一句话 */
  desc: string
  /**
   * 对伤害公式的修正(每一项都必须被 core/tribulationDecision 真实读取,
   * 不允许出现"desc 承诺了但数值上不存在"的机制):
   *   dmgMult    单波伤害倍率
   *   healMult   治疗效率(1=正常)
   *   shieldMult 护盾效果倍率(1=正常)
   *   waveShape  波次分布
   */
  dmgMult: number
  healMult: number
  shieldMult: number
  waveShape: TribulationWaveShape
}

export const TRIBULATIONS: TribulationDef[] = [
  {
    id: 'thunder',
    name: '雷鸣',
    seal: '雷',
    desc: '雷劫爆发极高,雷光之下护体灵光形同虚设。所幸雷息之间尚容调息,能疗伤者可撑。',
    dmgMult: 1.12,
    healMult: 1.1,
    shieldMult: 0.8,
    waveShape: 'even'
  },
  {
    id: 'counterflow',
    name: '逆流',
    seal: '流',
    desc: '劫中灵气逆乱,治疗恢复效果大减。久战者需另寻生路。',
    dmgMult: 0.95,
    healMult: 0.65,
    shieldMult: 1,
    waveShape: 'even'
  },
  {
    id: 'soulrend',
    name: '裂魂',
    seal: '魂',
    desc: '劫雷直撼神魂,唯守中带稳者能从容。攻势足者可硬生生削去几分劫威。',
    dmgMult: 1.0,
    healMult: 1,
    shieldMult: 1.1,
    waveShape: 'even'
  },
  {
    id: 'ironbody',
    name: '铁躯',
    seal: '躯',
    desc: '劫雷沉重绵密,层层碾落。护体灵光在这等钝压下几乎撑不住,唯绵长疗伤者可熬。',
    dmgMult: 0.9,
    healMult: 1.15,
    shieldMult: 0.45,
    waveShape: 'even'
  },
  {
    id: 'heavyrush',
    name: '重压',
    seal: '压',
    desc: '起手两击雷霆万钧,其后转缓。若首轮护持不及,一切休提。',
    dmgMult: 1.0,
    healMult: 1,
    shieldMult: 1.25,
    waveShape: 'frontLoaded'
  }
]

const BY_ID = new Map(TRIBULATIONS.map(t => [t.id, t]))

export function tribulationDef(id: TribulationKind): TribulationDef {
  return BY_ID.get(id) ?? TRIBULATIONS[0]!
}
