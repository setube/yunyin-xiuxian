/**
 * 区域动态事件表。须留在 data/:player.sanitize 按 id 认事件,改从 core/regionEvent 引会成环。
 * 倍率同时作用于在线、离线与预览三处结算。
 */
export type RegionEventId = 'yaochao' | 'lingmai' | 'gumu' | 'shangdui'

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
  { id: 'gumu', name: '古墓开启', desc: '尘封古墓裂开一道缝隙,际遇与凶险并存。', rewardMult: 1.15, dangerMult: 1.05, eventMult: 1.5 },
  { id: 'shangdui', name: '商队遇袭', desc: '过路商队遭袭,遍地灵石遗落,亦有匪徒潜伏。', rewardMult: 1.25, dangerMult: 1.1, eventMult: 1 }
]

const BY_ID = new Map(REGION_EVENTS.map(e => [e.id, e]))

export function regionEventDef(id: string): RegionEventDef | undefined {
  return BY_ID.get(id as RegionEventId)
}


/**
 * 区域事件的最长持续时长(分钟)。
 *
 * `core/regionEvent.ts` 的 `DURATION_MIN` 是候选档位;`player.sanitize` 读这个上界
 * 判「到期时刻是否离谱」—— 事件持续 30~120 分钟,「endsAt 在未来」本身是正常状态,
 * 只有远超最长时长的值才是坏档(那种值会让 `rollRegionEvent` 的 `endsAt > now` 恒真,
 * 整片地界再也掷不出新事件)。
 */
export const REGION_EVENT_MAX_MINUTES = 120
