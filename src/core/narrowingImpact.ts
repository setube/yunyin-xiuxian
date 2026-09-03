/**
 * 收窄后果审计
 *
 * 上一轮定性:问题不是「轮回奖励太多」,而是**浅轮回同时推进了太多彼此独立
 * 的永久成长轴**——金丹一世七项齐涨,没有一样非深修不可。
 *
 * 本模块度量一个收窄方案的后果,不改任何数值。审计对象不是「某项是否强」,
 * 而是:**移除后,金丹轮回是否从「全能成长循环」变成「有明确取舍的循环」。**
 *
 * 两个主指标:
 *   1. 覆盖比例——金丹循环能推进多少比例的永久资产
 *   2. 互斥收益面——深修独有的资产占比;只有它足够大,
 *      玩家才会真正面对「这一世刷得快,还是活得深」
 *
 * 注意一个容易搞错的前提:**深修路上必然经过金丹**,
 * 所以深修玩家也能拿到浅轮回的一切。真正的互斥不在「能不能拿到」,
 * 而在「哪条路拿得更划算」以及「哪些东西浅修根本够不着」。
 */
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'

/** 收窄动作 */
export type NarrowAction =
  /** 留在浅轮回 */
  | 'keep'
  /** 移出浅轮回,改由深修承载 */
  | 'move'
  /** 拆成基础/高阶两段 */
  | 'split'
  /** 一次性历史选择,不随轮回重复发放 */
  | 'onetime'

export interface PermanentAsset {
  id: string
  name: string
  /** 现状:金丹循环能否推进 */
  shallowNow: boolean
  /** 收窄方案下:金丹循环能否推进 */
  shallowAfter: boolean
  /** 深修能否推进(深修路过金丹,故浅能拿的深也能拿) */
  deep: boolean
  action: NarrowAction
  note: string
}

/**
 * 收窄方案(取自设计决议)。
 *   保留浅轮回:道果、灵兽、成就图鉴、基础认知
 *   移出浅轮回:宿慧、灵脉、先天之姿、高阶认知
 *   一次性历史:师承
 *
 * 设计规则:**浅轮回可以积累「经历」,深修才能积累「质量」**。
 * 先天之姿最初列为待观察,后按同一条规则一并移出 ——
 * 它与宿慧属于同类问题:本应体现「这一世活得有多深」,
 * 却能被金丹浅轮回用次数堆满
 */
export const ASSETS: PermanentAsset[] = [
  {
    id: 'daoFruit',
    name: '道果',
    shallowNow: true,
    shallowAfter: true,
    deep: true,
    action: 'keep',
    note: '轮回农场的核心资源,明确保留;金丹是其最优收割点'
  },
  {
    id: 'insight',
    name: '宿慧',
    shallowNow: true,
    shallowAfter: false,
    deep: true,
    action: 'move',
    note: '无界 + 按境界发放 + 影响其他成长效率,三条都指向深修资产'
  },
  {
    id: 'talents',
    name: '先天之姿',
    shallowNow: true,
    shallowAfter: false,
    deep: true,
    action: 'move',
    note: '与宿慧同类:本应体现「这一世活得多深」,却能被金丹次数堆满(真实存档十七世即集齐)'
  },
  {
    id: 'veins',
    name: '灵脉',
    shallowNow: true,
    shallowAfter: false,
    deep: true,
    action: 'move',
    note: '生命周期极短(第二世即吃满)却影响长期效率,最易造成「前几世必做」的固定路线'
  },
  {
    id: 'pets',
    name: '灵兽',
    shallowNow: true,
    shallowAfter: true,
    deep: true,
    action: 'keep',
    note: '偏收藏而非成长倍率;全部收走会让轮回过于功利,失去「活过一世留下东西」的感觉'
  },
  {
    id: 'loreBasic',
    name: '基础认知',
    shallowNow: true,
    shallowAfter: true,
    deep: true,
    action: 'split',
    note: '活过更多人生自然积累的常识,浅轮回即可推进'
  },
  {
    id: 'loreDeep',
    name: '高阶认知',
    shallowNow: false,
    shallowAfter: false,
    deep: true,
    action: 'split',
    note: '高阶丹方/功法受 minRealm 硬过滤,须亲自走到那个层次;现状即如此,收窄只是把边界写明'
  },
  {
    id: 'achievements',
    name: '成就与图鉴',
    shallowNow: true,
    shallowAfter: true,
    deep: true,
    action: 'keep',
    note: '世界经历与完成度,同灵兽'
  },
  {
    id: 'mentor',
    name: '师承',
    shallowNow: false,
    shallowAfter: false,
    deep: false,
    action: 'onetime',
    note: 'adoptMentor 拿一次锁死——已证明「一次性永久选择」可以成为轮回历史而无须每世发奖'
  },
  {
    id: 'daoSource',
    name: '道源与道痕',
    shallowNow: false,
    shallowAfter: false,
    deep: true,
    action: 'keep',
    note: '需真仙,本就是深修独有'
  }
]

export interface CoverageStat {
  /** 参与统计的资产总数(排除一次性历史) */
  total: number
  /** 金丹循环可推进数 */
  shallow: number
  /** 覆盖比例 */
  ratio: number
  /** 深修独有(深能推、浅不能) */
  deepOnly: number
  /** 互斥度:深修独有占比 */
  exclusivity: number
}

function coverage(pick: (a: PermanentAsset) => boolean): CoverageStat {
  // 一次性历史不参与「推进」统计——它既非浅也非深的持续收益
  const pool = ASSETS.filter(a => a.action !== 'onetime')
  const shallow = pool.filter(pick).length
  const deepOnly = pool.filter(a => a.deep && !pick(a)).length
  return {
    total: pool.length,
    shallow,
    ratio: shallow / pool.length,
    deepOnly,
    exclusivity: deepOnly / pool.length
  }
}

/** 现状的覆盖 */
export function coverageNow(): CoverageStat {
  return coverage(a => a.shallowNow)
}

/** 收窄后的覆盖 */
export function coverageAfter(): CoverageStat {
  return coverage(a => a.shallowAfter)
}

/**
 * 中间方案的覆盖:只移出宿慧与灵脉,先天之姿仍留在浅轮回。
 * 保留此函数是为了说明**为什么必须追加移出先天之姿** ——
 * 只移两项停在 56%,进不了 38%~50% 的目标区间
 */
export function coverageInsightVeinsOnly(): CoverageStat {
  return coverage(a => a.shallowAfter || a.id === 'talents')
}

/** 被移出浅轮回的资产 */
export function movedOut(): PermanentAsset[] {
  return ASSETS.filter(a => a.shallowNow && !a.shallowAfter)
}

/** 深修独有的资产(收窄后) */
export function deepExclusive(): PermanentAsset[] {
  return ASSETS.filter(a => a.deep && !a.shallowAfter && a.action !== 'onetime')
}

export { MANUAL_REBIRTH_MIN_MAJOR }
