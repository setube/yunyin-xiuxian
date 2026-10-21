/**
 * 第一步 —— 新手第一天「现在该点哪里」
 *
 * 首页上「修行目标 / 主线 / 每日」三块并列,各说各的,而它们指向的动作
 * 分住在修炼 / 历练两个页签里 —— 玩家得自己把「深入青霞山」翻译成
 * 「点底栏第三个」。新手第一天缺的不是更多信息,是一个明确的起点。
 *
 * 三条纪律(与 goal.ts 同源):
 *   一 **只在开局这一段出现**:历练过一次、或第一条主线达成之后就不再露面。
 *   二 **不引入新状态**:给不给这张卡完全由已有存档推出来(计数 / 修为 / 境界),
 *      没有「已看过」这种落盘字段 —— 换设备、清缓存都不会让它重新唠叨一遍。
 *   三 **给方向,不替玩家做决定**:卡上写清为什么,点不点由玩家。
 */
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { isRetreating } from './earlyGameService'

export interface FirstStep {
  /** 去哪儿(路由) */
  to: string
  /** 按钮文字 */
  label: string
  /** 一句话:现在该做什么 */
  text: string
  /** 一句话:为什么(不给理由的指路就是命令) */
  hint: string
}

/** 出师的界:第一条主线「踏上仙途(突破至炼气三层)」达成 */
const BEGINNER_MAIN_IDX = 0

export function currentFirstStep(): FirstStep | null {
  const player = usePlayerStore()
  const quests = useQuestsStore()

  if (player.dead) return null
  // 出师三条件任一成立即收卡:主线走过第一条 / 自己历练过 / 已突破到筑基以上
  // (最后一条是给老档兜底 —— 没有计数与主线下标的老存档不该再被当成新玩家)
  if (quests.mainIdx > BEGINNER_MAIN_IDX) return null
  if (quests.counter('explores') > 0) return null
  if (player.major > 0) return null
  /**
   * 闭关中不指路去历练:那条路会被当场拦下(`startRetreat` 与历练互斥),
   * 指过去等于让玩家白点一次 —— 而这正是这张卡要消除的那类摩擦。
   */
  if (isRetreating()) return null

  /**
   * 修为圆满时唯一该做的是回修炼页突破。这时还把人往历练赶是错的:
   * 新玩家九成会以为「还得多打几只」,而修为正卡在圆满线上不再涨。
   */
  if (player.expFull) {
    return {
      to: '/cultivation',
      label: '去突破',
      text: '第一步 · 修为已圆满,回修炼页突破',
      hint: '修为满了就不再涨,突破是眼下唯一能往前走的一步'
    }
  }

  return {
    to: '/adventure',
    label: '去历练',
    text: '第一步 · 去历练走一趟',
    hint: '历练有敌人、装备、灵草与灵石;修为自己会涨,圆满了回修炼页突破'
  }
}
