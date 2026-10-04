/**
 * 本世对局 —— 当前构筑对阵本世七类实敌的胜率面。
 *
 * 玩家早就在四处踩坑却看不到坑在哪:五维评级报的是「形状」,构筑韧性报的是
 * 「封印后还留几成」,但「我到底打不过哪一类」没有账本 —— 直到卡关才回头查。
 * 这里直接拿玩家快照(buildPlayerSnap)逐类对打估算七面胜率,四墙单独标出,
 * 短板一眼可见。纯函数:固定种子 → 读数稳定,不随刷新跳、不吃全局随机。
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

/**
 * 对每类原型各打 n 场估算胜率。种子固定 → 同构筑两遍读数逐位一致;
 * 想模拟不同运数改 seed 即可。n=60 时对 50% 真值的 95% 置信 ±12.6%,
 * 够作「哪面吃亏」的方向判读(要更精细就调 n,别把 3 位数精度当真值)。
 *
 * 铁壁这类一次性保命让 resolveCombat 会**改写**传入的快照(ironwallBrace 消耗):
 * 同一份快照连打会「第一场触发、之后全场失效」,胜率被系统性低估;且再次传入
 * 还会读数漂移。每场传一份浅克隆,一次性状态每场从头开始。n 须为正整数,
 * 传 0/负数/小数一律回落默认 60(公开参数,防调用方手滑)。
 */
export function playerMatchups(snap: CombatantSnap, n = 60, seed = 20261004): MatchupRow[] {
  const runs = Number.isInteger(n) && n > 0 ? n : 60
  const rng = new RandomService(mulberry32(seed))
  return ENEMY_ARCHETYPES.map(arch => {
    let wins = 0
    for (let i = 0; i < runs; i += 1) {
      if (resolveCombat({ ...snap }, arch.snap(), rng).win) wins += 1
    }
    return { id: arch.id, name: arch.name, wall: WALL_IDS.includes(arch.id), winRate: wins / runs }
  })
}
