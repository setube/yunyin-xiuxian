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
