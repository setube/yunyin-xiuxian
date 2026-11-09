/** 今日天道:按日期种子确定性生成的每日挑战(刷新不换题),复用挑战书的验证与定价管线 */
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
 * 今日的日号:本地日历,与洞府巡游/日课同口径(见 utils/time 注),跨本地午夜才换号。
 * 按 UTC 日计时,UTC+8 玩家本地 08:00 就翻到「明天」,同一本地日能领两份赏。
 */
export function todayNumber(): number {
  return todayLocalNum()
}

/**
 * 生成指定本地日的天道:日期种子确定性;裁判不受(无解/虚设)则顺延候选。
 * `day` 可注入,供界面用响应式墙钟日号驱动题面。
 */
/** 第 t 个候选草稿(种子只取 day 与 t,故同步/异步两版逐位一致) */
function draftForDay(day: number, t: number): ChallengeDraft {
  const rng = new RandomService(mulberry32(day * 131 + t * 977))
  const world = CELESTIAL_WORLDS[rng.int(0, CELESTIAL_WORLDS.length - 1)]!
  const pool = [...MUTATORS]
  const mutatorIds: string[] = []
  for (let i = 0; i < 2 && pool.length; i += 1) {
    mutatorIds.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!.id)
  }
  const pactId = rng.chance(0.35) ? PACTS[rng.int(0, PACTS.length - 1)]!.id : null
  return { worldId: world.id, mutatorIds, pactId, name: `今日天道` }
}

export function todayChallenge(day = todayNumber()): DailyChallenge | null {
  // 候选上限 32:取 16 时 2026-10-24、2027-10-17 两天全数落选(第 17、18 个才过)
  for (let t = 0; t < 32; t += 1) {
    const draft = draftForDay(day, t)
    const verdict = verifyChallenge(draft)
    if (verdict?.ok) return { day, draft, verdict }
  }
  return null
}

/**
 * 分块异步版 todayChallenge:与同步版同一内核,同参结果逐位一致。
 *
 * 单次 verifyChallenge 实测 54ms(六流派 × 8 场),而候选上限是 32 ——
 * 最坏 1728ms。实测玩家切到「试炼」页签量到 231ms 的长任务(超 50ms 阈值 4 倍)。
 * 每验完一个候选让出一次主线程,页签能立刻切过去。
 */
export async function todayChallengeAsync(day = todayNumber()): Promise<DailyChallenge | null> {
  for (let t = 0; t < 32; t += 1) {
    const got = draftForDay(day, t)
    const verdict = verifyChallenge(got)
    if (verdict?.ok) return { day, draft: got, verdict }
    await new Promise(res => setTimeout(res, 0))
  }
  return null
}

/** 应战今日天道:当日限领一次赏,失败可自费重试 */
export function undertakeDaily(daily: DailyChallenge): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  // 判闸用当下本地日号,不信 daily.day:驻足跨本地午夜时 daily 仍可能是昨天的考题,
  // 按传参判会让同一会话连领两份天道赏。
  const day = todayLocalNum()
  if (endgame.dailyDoneDay === day) {
    ui.toast('今日已完成', 'info')
    return null
  }
  const result = undertakeChallenge(daily.draft, daily.verdict)
  if (result?.report.cleared) {
    endgame.markDailyDone(day)
    recordMilestone('first_daily')
  }
  return result
}
