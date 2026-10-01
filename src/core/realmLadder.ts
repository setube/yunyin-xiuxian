/**
 * 仙路旅途 —— 把「境界表 + 所在界」翻译成一条 21 境的横向刻度
 *
 * 修炼页只显示当前一境,玩家看不到自己从凡到仙走到哪了、前面还有几境。
 * 这条刻度是**纵向全景**:21 个境点一路排开,已至的点了墨、眼下这境脉动、
 * 未至的虚待;界首处立界门,四界的名字标在各自那一段的下方。
 *
 * 纯函数只做一件事:按当前境判出每境的三态与界首标记 —— UI 拿它渲染,
 * 判定不散落在视图里,里程碑(0/9/14/18 四界首)也好被测试钉住。
 */
import { REALMS, WORLDS, isWorldEntry, MAX_MAJOR } from '@/data/realms'

export type RealmLadderState = 'done' | 'now' | 'future'

export interface RealmLadderPoint {
  /** 境界索引(major),0~20 */
  index: number
  name: string
  /** 是否界首(人间/仙界/神界/混沌海的第一境)—— 界门上该立的一档 */
  worldStart: boolean
  state: RealmLadderState
}

export interface RealmLadderWorld {
  id: string
  name: string
  start: number
  end: number
}

/**
 * 21 境刻度 —— 三态口径与 realmDef 一致:越界修正后再判,绝不让越界值
 * 把「已至」成片点亮或把「现在」推到刻度之外。
 */
export function realmLadderPoints(major: number): RealmLadderPoint[] {
  const m = Math.max(0, Math.min(MAX_MAJOR, major))
  return REALMS.map((r, i) => ({
    index: i,
    name: r.name,
    worldStart: isWorldEntry(i),
    state: i < m ? 'done' : i === m ? 'now' : 'future'
  }))
}

/** 四界段位 —— 界名、首尾索引从 data 直接继承,UI 不另抄第二份 */
export function realmLadderWorlds(): RealmLadderWorld[] {
  return WORLDS.map(w => ({ id: w.id, name: w.name, start: w.start, end: w.end }))
}
