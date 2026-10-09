/**
 * 收徒 —— 后台游历的 idle 层(Phase 42:新增可玩性第二条)
 *
 * 坊市让灵石有了销处;收徒则让「人」也成了资源:你收的弟子会离线跑腿,
 * 采药、采矿、历练、寻宝、修习,按墙钟走工,归来带回资材。玩家不动手,
 * 东西也在长 —— 与挂机修炼互补、不抢轮次。
 *
 * 静态原型与任务调参在这里;派发/结算/产出在 core/apprenticeService。
 */
import type { QualityId } from '@/types'

/** 弟子跑腿的任务门类 */
export type ApprenticeSpec = 'herb' | 'ore' | 'adventure' | 'seek' | 'study'

export interface ApprenticeTaskDef {
  spec: ApprenticeSpec
  /** 门类名 */
  name: string
  icon: string
  /** 一趟耗时(秒,真实时间;离线照算) */
  seconds: number
  desc: string
}

export const APPRENTICE_TASKS: ApprenticeTaskDef[] = [
  { spec: 'herb', name: '采灵药', icon: 'leaf', seconds: 1800, desc: '上山采灵草,带回洞府药圃' },
  { spec: 'ore', name: '开矿脉', icon: 'mountain', seconds: 1800, desc: '凿一处小矿,送来玄铁' },
  { spec: 'adventure', name: '历练', icon: 'swords', seconds: 2700, desc: '下山历练,挣灵石、磨阅历' },
  { spec: 'seek', name: '寻机缘', icon: 'gem', seconds: 3600, desc: '四处寻访,或得丹药、或得器尘' },
  { spec: 'study', name: '参悟', icon: 'book', seconds: 5400, desc: '静坐参悟,为道基添悟道点' }
]

export function taskDef(spec: ApprenticeSpec): ApprenticeTaskDef {
  return APPRENTICE_TASKS.find(t => t.spec === spec)!
}

export interface ApprenticeArchetype {
  id: string
  name: string
  quality: QualityId
  /** 天赋门类 —— 该门产出 ×TALENT_BONUS */
  talent: ApprenticeSpec
  desc: string
}

function a(id: string, name: string, quality: QualityId, talent: ApprenticeSpec, desc: string): ApprenticeArchetype {
  return { id, name, quality, talent, desc }
}

export const APPRENTICES: ApprenticeArchetype[] = [
  a('ap_luanniao', '采药童子', 'mortal', 'herb', '山野出身,识得满山灵草'),
  a('ap_kuangtou', '开矿壮汉', 'mortal', 'ore', '身强力壮,一镐一个准'),
  a('ap_youxia', '游侠少年', 'fine', 'adventure', '仗剑下山,专爱历练'),
  a('ap_lingtong', '寻宝灵童', 'fine', 'seek', '天生一副寻宝的鼻子'),
  a('ap_daotong', '悟道道童', 'excellent', 'study', '心静如水,善参玄理'),
  a('ap_xiantong', '仙门慧童', 'spirit', 'study', '根骨清奇,一学百通')
]

const BY_ID = new Map(APPRENTICES.map(x => [x.id, x]))
export function apprenticeDef(id: string): ApprenticeArchetype | undefined {
  return BY_ID.get(id)
}

/** 开局白送的入门弟子 */
export const STARTER_APPRENTICE = 'ap_lingtong'

/** 弟子等级上限 */
export const APPRENTICE_MAX_LEVEL = 20
/** 天赋门类产出加成 */
export const APPRENTICE_TALENT_BONUS = 1.25

/** 弟子槽位随境界增长:1 起,每 4 境 +1,顶到 5 */
export function apprenticeSlots(major: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(0, major) / 4))
}

/** 各尽其长 · 目标水位(存栏使 score=1 的参考;导演口径 040/030/030/030) */
export type DispatchNeedResource = 'herb' | 'ore' | 'wudao' | 'dust'
export const DISPATCH_NEED_TARGET: Record<DispatchNeedResource, number> = {
  herb: 40,
  ore: 30,
  wudao: 30,
  dust: 30
}
/** 历练的固定兜底分:低于任一资源的短缺分 —— 皆有余时才去历练挣灵石 */
export const DISPATCH_ADVENTURE_FIXED_SCORE = 0.25

/** 羁绊位阶(道童称谓)—— 纯命名/flavor,不给产出/时长加成;按累计完工趟数阈值 */
export interface BondTitle {
  min: number
  name: string
}
export const BOND_TITLES: BondTitle[] = [
  { min: 0, name: '道童' },
  { min: 10, name: '道仆' },
  { min: 30, name: '道徒' },
  { min: 60, name: '记名弟子' },
  { min: 100, name: '真传' }
]
/** 由累计完工趟数取位阶称谓 */
export function bondTitle(bond: number): string {
  let name = BOND_TITLES[0]!.name
  for (const t of BOND_TITLES) {
    if (bond >= t.min) name = t.name
  }
  return name
}
