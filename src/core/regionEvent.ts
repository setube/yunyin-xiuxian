/**
 * 区域动态事件(Phase 31.0 A2)
 *
 * 区域临时进入异常状态(30 分钟 ~ 2 小时),改变敌人组成/掉落/生态。
 * 低频、自动过期,不做 MMO 打卡。与 Build/区域生态/世界记忆衔接。
 *
 * 事件:
 *   yaochao   妖潮 —— 多段敌人↑,掉落↑,危险↑
 *   lingmai   灵脉暴动 —— 修为获取↑,灵气恢复↑
 *   gumu      古墓开启 —— 事件率↑,稀有掉落↑
 *   shangdui  商队遇袭 —— 灵石掉落↑,战斗节奏快
 */
import { usePlayerStore } from '@/stores/player'
import { rng } from '@/utils/random'
import type { RegionDef } from '@/types'
import { gameNow } from './enginePause'
import { REGION_EVENTS, regionEventDef, type RegionEventDef, type RegionEventId } from '@/data/regionEvents'

export interface RegionEventState {
  regionId: string
  eventId: RegionEventId
  /** 结束时间戳 */
  endsAt: number
}

// 事件表是纯静态内容,放在 data/ 免得 player store 为了校验 id 反向依赖本模块(会成环)
export { REGION_EVENTS, regionEventDef }
export type { RegionEventDef, RegionEventId }

/** 事件持续时间(分钟,30~120) */
const DURATION_MIN = [30, 60, 90, 120] as const

/** 当前生效的区域事件(未过期;被过期清理) */
export function currentRegionEvent(regionId: string): RegionEventState | null {
  const player = usePlayerStore()
  // gameNow() 暂停时冻住:确认窗背后不该把区域事件耗掉
  const now = gameNow()
  const ev = player.regionEvent
  if (!ev || ev.regionId !== regionId) return null
  if (ev.endsAt <= now) {
    // 过期自动清理
    player.setRegionEvent(null)
    return null
  }
  return ev
}

/** 尝试为某区域生成一次事件(低频:引擎周期性调用,按概率) */
export function rollRegionEvent(region: RegionDef): RegionEventState | null {
  const player = usePlayerStore()
  const now = Date.now()
  // 已有未过期事件则不重复
  const cur = player.regionEvent
  if (cur && cur.endsAt > now) return null
  // 低频概率:每小时约一次(配合引擎 30s 周期 → 约 0.85% / 检查)
  if (!rng.chance(0.0085)) return null
  const eventId = rng.pick(REGION_EVENTS.map(e => e.id))
  const durationMin = rng.pick(DURATION_MIN) ?? 60
  const state: RegionEventState = {
    regionId: region.id,
    eventId,
    endsAt: now + durationMin * 60_000
  }
  player.setRegionEvent(state)
  return state
}
