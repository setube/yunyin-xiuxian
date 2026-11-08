/**
 * 本世对局:玩家快照(buildPlayerSnap)对阵本世七类实敌的胜率面,四墙单独标出。
 * 纯函数:固定种子,读数稳定,不吃全局随机。
 */
import type { CombatantSnap } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { ENEMY_ARCHETYPES, WALL_IDS } from './buildSim'
import { resolveCombat } from './combat'

export interface MatchupRow {
  id: string
  name: string
  /** 四墙之一(万金油判据里必须通吃的那几面) */
  wall: boolean
  /** 0..1,本场次下的胜率估算 */
  winRate: number
}

/** 默认采样场次;文案「每类各打 N 场估算」也读这一枚,不手抄 */
export const MATCHUP_SAMPLE_RUNS = 60

/**
 * 对每类原型各打 n 场估算胜率;同种子同构筑读数逐位一致。
 * n=60 时对 50% 真值的 95% 置信 ±12.6%,只作方向判读。
 * resolveCombat 不写回快照(铁壁只消费 Fighter.brace),浅克隆只作防御。
 * n 非正整数回落默认值。
 */
export function playerMatchups(snap: CombatantSnap, n = MATCHUP_SAMPLE_RUNS, seed = 20261004): MatchupRow[] {
  const runs = Number.isInteger(n) && n > 0 ? n : MATCHUP_SAMPLE_RUNS
  const rng = new RandomService(mulberry32(seed))
  return ENEMY_ARCHETYPES.map(arch => {
    let wins = 0
    for (let i = 0; i < runs; i += 1) {
      // 只读 .win:战报构建(逐回合字符串 + formatGN)在这里纯属浪费
      if (resolveCombat({ ...snap }, arch.snap(), rng, undefined, false).win) wins += 1
    }
    return { id: arch.id, name: arch.name, wall: WALL_IDS.includes(arch.id), winRate: wins / runs }
  })
}
