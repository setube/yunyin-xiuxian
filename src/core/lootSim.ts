/**
 * 装备经济压力测试(Phase 19)
 * 用真实掉落生成模拟长期挂机的装备洪流,量化背包压力与品质分布
 *
 * ⚠ 口径:这是**基线模型**,不是玩家实况 ——
 *   不含玩家的 dropRate / luck / 双倍掉落 / 首领保底,胜率取共享的 TYPICAL_WIN_RATE
 *   (与 expIncome 同一假设,别在这边再抄一份 0.85)。
 *   可用于:比不同层级之间的压力、看趋势与爆仓量级;
 *   不可用于:宣称"某玩家每小时掉 N 件"(实况取决于其构筑与是否打首领)。
 *   与 samsaraAudit 的绝对值警告同理:比值可用,绝对值不可用。
 */
import { mulberry32, RandomService } from '@/utils/random'
import { qualityDef, QUALITIES } from '@/data/qualities'
import { BAG_CAPACITY, EQUIP_DROP_CHANCE, EXPLORE_BATTLE_INTERVAL, EXPLORE_EVENT_CHANCE, DECOMPOSE_DUST } from '@/data/constants'
import { generateEquipment } from './equipGen'
import { TYPICAL_WIN_RATE } from './expIncome'

export interface LootPressure {
  tier: number
  dropsPerHour: number
  hoursToFillBag: number
  /** 按品质序号的占比(0~8) */
  rankShare: number[]
  avgRank: number
  /** 全部分解可得器灵尘/日 */
  dustPerDay: number
  dropsPer24h: number
  dropsPer7d: number
  dropsPer30d: number
}

export function simulateLootPressure(tier: number, samples = 600): LootPressure {
  const rng = new RandomService(mulberry32(tier * 977))
  const rankCounts = new Array<number>(QUALITIES.length).fill(0)
  let dustSum = 0
  for (let i = 0; i < samples; i += 1) {
    const inst = generateEquipment(tier, rng)
    const rank = qualityDef(inst.quality).rank
    rankCounts[rank]! += 1
    dustSum += DECOMPOSE_DUST[rank] ?? 1
  }
  const winsPerHour = (3600 / EXPLORE_BATTLE_INTERVAL) * (1 - EXPLORE_EVENT_CHANCE) * TYPICAL_WIN_RATE
  const dropsPerHour = winsPerHour * EQUIP_DROP_CHANCE
  const avgRank = rankCounts.reduce((s, n, r) => s + n * r, 0) / samples
  return {
    tier,
    dropsPerHour,
    hoursToFillBag: BAG_CAPACITY / dropsPerHour,
    rankShare: rankCounts.map(n => n / samples),
    avgRank,
    dustPerDay: (dustSum / samples) * dropsPerHour * 24,
    dropsPer24h: dropsPerHour * 24,
    dropsPer7d: dropsPerHour * 24 * 7,
    dropsPer30d: dropsPerHour * 24 * 30
  }
}
