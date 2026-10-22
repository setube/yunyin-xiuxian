/**
 * 历练档位的唯一口径 —— 表在 data/constants,这里只提供「认不认得出」这一件事。
 *
 * 会话是按档位 id 存进存档的,读档时必须先把野 id 收回来(`EXPLORE_MODES` 是
 * `as const` 字面表,坏档写个 'marathno' 进去会让 `EXPLORE_MODES[mode]` 取到
 * undefined,离线结算当场 NaN)。从前这条判据写在 store 的三元里,加档就要记得
 * 改两处;现在按表本身的键判,新增档位自动放行。
 */
import { EXPLORE_MODES } from '@/data/constants'
import type { ExploreMode } from '@/types'

/** 认得出的档位原样返回,野 id 归入「寻常游历」 */
export function exploreModeOf(raw: unknown): ExploreMode {
  return typeof raw === 'string' && raw in EXPLORE_MODES ? (raw as ExploreMode) : 'normal'
}
