/**
 * 机缘链(Phase 31.1)
 *
 * 机缘不只是"中奖":选择被记录,影响未来。
 *   - 剑痕机缘 → 解锁"剑修师承"的顺水推荐(人物页拜师时高亮)
 *   - 隐世高人 → 弃过一次后,未来同类机缘不再出现(世界记得)
 *   - 妖兽认主 → 灵兽性格与机缘取向挂钩
 *
 * 无新货币,纯"选择记忆 + 事件池变化"。
 */
import { usePlayerStore } from '@/stores/player'

export type FortuneChoice = 'take' | 'leave'

/** 机缘记忆:某类结果被选过一次 */
export function recordFortuneChoice(fortuneId: string, choice: FortuneChoice): void {
  const player = usePlayerStore()
  const next = { ...player.fortuneChoices, [fortuneId]: choice }
  player.setFortuneChoices(next)
}

/** 该机缘曾作何选择(未遇过 = undefined) */
export function fortuneChoice(fortuneId: string): FortuneChoice | undefined {
  return usePlayerStore().fortuneChoices[fortuneId]
}

/**
 * 师承顺水:根据机缘记忆,推荐最契合的师承
 * 剑痕取 → 剑修;丹方取 → 丹修;秘术取 → 阵修;妖兽认主 → 猎修
 */
export function mentorHint(): 'swordsman' | 'alchemist' | 'arraymaster' | 'hunter' | null {
  const map: Record<string, 'swordsman' | 'alchemist' | 'arraymaster' | 'hunter'> = {
    ft_sword_remnant: 'swordsman',
    ft_ancient_elixir: 'alchemist',
    ft_blood_contract: 'arraymaster',
    ft_beast_pledge: 'hunter'
  }
  const choices = usePlayerStore().fortuneChoices
  for (const [fid, hint] of Object.entries(map)) {
    if (choices[fid] === 'take') return hint
  }
  return null
}
