/**
 * 今日天道(Phase 27)—— 程序生成的每日挑战
 * 按日期种子确定性生成(刷新不换题),复用挑战书的验证与定价管线,零人工维护
 */
import { mulberry32, RandomService } from '@/utils/random'
import { todayLocalNum } from '@/utils/time'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { MUTATORS } from '@/data/mutators'
import { PACTS } from '@/data/pacts'
import { verifyChallenge, undertakeChallenge, type ChallengeDraft, type ChallengeVerdict } from './challenge'
import { recordMilestone } from './identity'
import type { ExpeditionResult } from './endgameService'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'

export interface DailyChallenge {
  day: number
  draft: ChallengeDraft
  verdict: ChallengeVerdict
}

/**
 * 今日的日号。与洞府巡游/日课同一面「本地日历」(见 utils/time 注):
 * 若按 UTC 日计,UTC+8 玩家在本地 08:00 就会被翻到「明天」,同一本地日能白嫖两份
 * 今日天道赏,也跟「日落而息 / 明日再会」的文案相悖。故用本地日,跨本地午夜才换号。
 */
export function todayNumber(): number {
  return todayLocalNum()
}

/** 生成今日天道:日期种子确定性;裁判不受(无解/虚设)则顺延候选 */
export function todayChallenge(): DailyChallenge | null {
  const day = todayNumber()
  for (let t = 0; t < 16; t += 1) {
    const rng = new RandomService(mulberry32(day * 131 + t * 977))
    const world = CELESTIAL_WORLDS[rng.int(0, CELESTIAL_WORLDS.length - 1)]!
    const pool = [...MUTATORS]
    const mutatorIds: string[] = []
    for (let i = 0; i < 2 && pool.length; i += 1) {
      mutatorIds.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!.id)
    }
    const pactId = rng.chance(0.35) ? PACTS[rng.int(0, PACTS.length - 1)]!.id : null
    const draft: ChallengeDraft = { worldId: world.id, mutatorIds, pactId, name: `今日天道` }
    const verdict = verifyChallenge(draft)
    if (verdict?.ok) return { day, draft, verdict }
  }
  return null
}

/** 应战今日天道:当日限领一次赏,失败可自费重试 */
export function undertakeDaily(daily: DailyChallenge): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (endgame.dailyDoneDay === daily.day) {
    ui.toast('今日天道已了,明日再会', 'info')
    return null
  }
  const result = undertakeChallenge(daily.draft, daily.verdict)
  if (result?.report.cleared) {
    endgame.markDailyDone(daily.day)
    recordMilestone('first_daily')
  }
  return result
}
