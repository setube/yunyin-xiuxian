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

export type RegionEventId = 'yaochao' | 'lingmai' | 'gumu' | 'shangdui'

export interface RegionEventState {
  regionId: string
  eventId: RegionEventId
  /** 结束时间戳 */
  endsAt: number
}

export interface RegionEventDef {
  id: RegionEventId
  name: string
  desc: string
  /** 掉落倍率 */
  rewardMult: number
  /** 敌人危险倍率 */
  dangerMult: number
  /** 事件触发率修正 */
  eventMult: number
}

export const REGION_EVENTS: RegionEventDef[] = [
  { id: 'yaochao', name: '妖潮', desc: '妖气翻涌,群妖躁动。多段敌人更多,掉落更丰,也更凶险。', rewardMult: 1.2, dangerMult: 1.15, eventMult: 1 },
  { id: 'lingmai', name: '灵脉暴动', desc: '地底灵脉喷薄,天地灵气大盛。', rewardMult: 1, dangerMult: 1, eventMult: 1 },
  { id: 'gumu', name: '古墓开启', desc: '尘封古墓裂开一道缝隙,奇遇与凶险并存。', rewardMult: 1.15, dangerMult: 1.05, eventMult: 1.5 },
  { id: 'shangdui', name: '商队遇袭', desc: '过路商队遭袭,遍地灵石遗落,亦有匪徒潜伏。', rewardMult: 1.25, dangerMult: 1.1, eventMult: 1 }
]

const BY_ID = new Map(REGION_EVENTS.map(e => [e.id, e]))

export function regionEventDef(id: RegionEventId): RegionEventDef | undefined {
  return BY_ID.get(id)
}

/** 事件持续时间(分钟,30~120) */
const DURATION_MIN = [30, 60, 90, 120] as const

/** 当前生效的区域事件(未过期;被过期清理) */
export function currentRegionEvent(regionId: string): RegionEventState | null {
  const player = usePlayerStore()
  const now = Date.now()
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
