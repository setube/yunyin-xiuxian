/**
 * 宿命传承 —— 深修「跨生死、可累积、不滚雪球」的长期目标线。
 *
 * 与 daoFruit / talents 同类 kind='legacy' 的永久项:随神魂不灭,跨世不清零。
 * 一个传承 = 某个可停世境界(金丹..真仙)给深修的独一份「我是谁」;
 * 浅修农场(金丹以下)永远锻造不出任何传承 —— 给深修一条不去追量的念想。
 *
 * 核心纪律(评审红线,由 heritageForge.spec / heritageEffects.spec 的结构断言钉死):
 *   **任何传承不得声明为攻防 / 修速 / 战力倍率** —— 一旦可折算成量,就塌回
 *   「深修指数补偿」的陷阱。故效果全落在 信息 / 选择 / 容错 / 荣誉 轴:
 *   有界、平直的**能力位**,绝不随道果或世数无界增长。
 *
 * 判定与锻造的**生命周期**在 core/heritageForge.ts;效果的**落地实现**在
 * core/heritageEffects.ts。这里只定义「有哪些传承、门槛、效果轴」。
 * 跨世去留在 core/samsaraAudit 的 HERITAGE 表另登记一行(kind='legacy', mode='full')。
 */
export interface HeritageDef {
  id: string
  name: string
  /** 境界门槛 2..9 —— 本世必须达到该境界才解锁对应传承;金丹(major 2)以下浅修永远锻造不出 */
  gateMajor: number
  /** 必须有界、平直的能力位,禁止「随世缩放」的百分数效果 */
  effect: 'bounded-flat'
  /** 效果轴:选择 / 容错 / 荣誉 —— 不允许攻防 / 修速这类量词混进来 */
  axis: 'choice' | 'fault-tolerant' | 'honor'
  /** 玩家向文案(参与红线扫描) */
  desc: string
  /** 机制侧描述(参与红线扫描 —— 防把能力位偷偷写成倍率) */
  effectDesc: string
}

export type HeritageId = string

/**
 * 基线六道传承(可替换增删,但必须守住「有界平直 + 非倍率 + 金丹刷不出」三条)。
 * 门槛随境界走:2 金丹 / 3 元婴 / 5 炼虚 / 7 大乘 / 8 渡劫 / 9 真仙(见 data/realms)。
 */
export const HERITAGE_DEFS: HeritageDef[] = [
  {
    id: 'danxin',
    name: '浴火丹心',
    gateMajor: 2,
    effect: 'bounded-flat',
    axis: 'fault-tolerant',
    desc: '转世开局,本世前三炉炼丹必成',
    effectDesc: '出生后本世前三炉开炉必定成丹(新手手感,不炼也不亏,用量每世不续)'
  },
  {
    id: 'yuanying',
    name: '元婴凝实',
    gateMajor: 3,
    effect: 'bounded-flat',
    axis: 'honor',
    desc: '转世起始境界,保底从筑基起,而非炼气',
    effectDesc: '出生时起始境界不低于筑基(major 抬一档,尊重;只此一档,不随世徒增)'
  },
  {
    id: 'tonggan',
    name: '炼虚通感',
    gateMajor: 5,
    effect: 'bounded-flat',
    axis: 'choice',
    desc: '转世择先天之姿时,多一个可选项',
    effectDesc: '转世的三选一变为四选一(多一份选择,不白给任何属性)'
  },
  {
    id: 'daotong',
    name: '大乘道统',
    gateMajor: 7,
    effect: 'bounded-flat',
    axis: 'honor',
    desc: '转世时,已习功法等级不再折回起手',
    effectDesc: '转世交割按原等级带走各门已习功法(本作默认折回一层,此为平直保留)'
  },
  {
    id: 'dubu',
    name: '渡劫跬步',
    gateMajor: 8,
    effect: 'bounded-flat',
    axis: 'fault-tolerant',
    desc: '本世唯一一次突破失败,不散其修为',
    effectDesc: '每世唯一一次突破失败时,豁免修为折损(一次性容错,每世只此一回)'
  },
  {
    id: 'daoben',
    name: '真仙道痕',
    gateMajor: 9,
    effect: 'bounded-flat',
    axis: 'honor',
    desc: '转世睁眼,即认得世间所有灵材,不按境界补认知',
    effectDesc: '出生时认知按最高档全带,不因本世境界受限(平直开放,非增减数值)'
  }
]

const BY_ID: Record<string, HeritageDef> = Object.fromEntries(HERITAGE_DEFS.map(d => [d.id, d]))

export function heritageDef(id: string): HeritageDef | undefined {
  return BY_ID[id]
}
