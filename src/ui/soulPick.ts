import { soulGradeDef, soulMods, soulName, type SoulInstance } from '@/data/souls'
import type { AnyStatKey } from '@/types'

/**
 * 器魂择优装配。
 *
 * 装配槽只有 3 个(SOUL_SLOTS),而散置常有七八枚:
 * 要挑出最强的那三枚,得逐枚读词条、心算「暴击率 +5% 与伤害减免 +4.5% 哪个更值」——
 * 这两样本无可比口径。
 *
 * 判据:**先比阶位,同阶再比词条总量**。
 *
 * 为什么不直接搬战力的词条权重表:那张表里 regenPerRound 权重 20、lifesteal 8,
 * 是因为这两样数值本身只有 0.012 / 0.03 —— 权重放大是为了让恢复那一维在五维评分里
 * 看得见,不是「回血比暴击值二十倍」。拿它跨类型比器魂,会得出
 * 「二阶泽魂胜过五阶锋魂」这种玩家一眼觉得不对、又无从反驳的建议。
 *
 * 阶位是数据里现成的、玩家能自己数(阶点)、也愿意信的次序;
 * 同阶之内再按词条总量定,这一层才用到倍数。
 */

/**
 * 一枚器魂的词条总量:各词条数值之和(阶位倍率已由 soulMods 含入)。
 * 坏档里的 grade 可能是 NaN / 越界:soulMods 内部按 grade 取阶位定义,
 * 挡在这里才能保证整条链不炸(排序里那一处守卫管不到它)。
 */
export function soulWeight(soul: SoulInstance): number {
  const safe: SoulInstance = Number.isFinite(soul.grade) ? soul : { ...soul, grade: 0 }
  const mods = soulMods(safe)
  let sum = 0
  for (const k in mods) {
    const v = mods[k as AnyStatKey] ?? 0
    if (!Number.isFinite(v)) continue
    sum += Math.abs(v)
  }
  return sum
}

export interface SoulPick {
  soul: SoulInstance
  /** 阶位 rank,0~5;主判据 */
  rank: number
  /** 同阶之内的词条总量;次判据 */
  weight: number
  /** 这一枚是否在建议装配的前 N 名里 */
  picked: boolean
}

/**
 * 把一堆器魂排成「该装哪几枚」。
 *
 * @param souls 候选(通常只传散置的那些)
 * @param slots 可装几格
 */
export function soulPicks(souls: readonly SoulInstance[], slots: number): SoulPick[] {
  const rows = souls.map(s => ({
    soul: s,
    // 坏档里 grade 可能是 NaN 或越界:soulGradeDef 会夹,但 NaN 夹不住,须先挡
    rank: soulGradeDef(Number.isFinite(s.grade) ? s.grade : 0).rank,
    weight: soulWeight(s)
  }))
  rows.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank
    if (b.weight !== a.weight) return b.weight - a.weight
    // 再同则按名字,最后按 uid:纯同名同阶的两次出现也必须定序,
    // 否则同一份数据在不同调用顺序下排出两种结果
    const byName = soulName(a.soul).localeCompare(soulName(b.soul))
    return byName !== 0 ? byName : a.soul.uid.localeCompare(b.soul.uid)
  })
  const n = Math.max(0, Math.floor(slots))
  return rows.map((r, i) => ({ ...r, picked: i < n }))
}

/** 建议装上的那几枚(前 slots 名),按排序后的次序 */
export function soulPickUids(souls: readonly SoulInstance[], slots: number): string[] {
  return soulPicks(souls, slots)
    .filter(p => p.picked)
    .map(p => p.soul.uid)
}

/** 建议装配的一句话:逐枚列出。soulName 本身已含阶名(「化真·锋魂」),不再复述 */
export function soulPickSummary(picks: readonly SoulPick[]): string | null {
  const chosen = picks.filter(p => p.picked)
  if (chosen.length === 0) return null
  return chosen.map(p => soulName(p.soul)).join(' · ')
}
