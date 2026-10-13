/**
 * 收徒结算与产出 —— 纯计算,把「弟子跑一趟值多少」写在这,界面/存档都引它。
 *
 * 产出的锚:历练给灵石走 stoneByTier(与战斗同一条经济);采药/采矿/参悟给的是
 * 洞府生产与悟道这些既有消耗品;寻宝则从可炼丹池按等级确定取一枚(不喂全局随机,
 * 可测、可复现)。天赋门类产出 ×TALENT_BONUS,不另立一套数值源。
 */
import type { GNum } from '@/types'
import { mulN } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { PILLS } from '@/data/pills'
import { maxTierForMajor } from '@/data/regions'
import {
  APPRENTICE_TALENT_BONUS,
  DISPATCH_ADVENTURE_FIXED_SCORE,
  DISPATCH_NEED_TARGET,
  apprenticeDef,
  taskDef,
  type ApprenticeSpec
} from '@/data/apprentices'

/** 一名已收弟子(与 store 里同形;类型放 service 供两端共用) */
export interface OwnedApprentice {
  uid: string
  archId: string
  level: number
  /** 羁绊:累计完工趟数(只喂位阶称谓/flavor,不给产出加成) */
  bond: number
  task: { spec: ApprenticeSpec; startAt: number; finishAt: number } | null
}

/** 一趟任务的产出账(石头是大数,其余是小数;都未入账,由 store 应用) */
export interface TaskSpoils {
  herb?: number
  ore?: number
  dust?: number
  wudao?: number
  stone?: GNum
  pillId?: string
  pillCount?: number
}

export function apprenticeTaskSeconds(spec: ApprenticeSpec): number {
  return taskDef(spec).seconds
}

/**
 * 寻宝的丹药:按境界在「寻宝此刻拿得到的可炼丹池」里取一枚,确定可复现。
 * 池以 minRealm ≤ major 封顶(与坊市 salePills 同源)—— 否则新号跑一趟寻宝就能
 * 白捡 dao 品顶阶丹,兜底掉炼丹石耗/材料/境界整条经济线。境界 ≥0 时池恒非空(入口
 * 丹均为 minRealm 0)。防空池兜底,避免因数据误删而静默吞产出。
 */
function pickSeekPill(major: number, level: number): string {
  const pool = PILLS.filter(p => p.recipe?.stoneBase != null && p.minRealm <= major).map(p => p.id)
  if (pool.length) return pool[(level * 7) % pool.length]!
  return PILLS.find(p => p.recipe?.stoneBase != null)?.id ?? 'p_jvqisan'
}

function baseSpoils(major: number, level: number): Record<ApprenticeSpec, TaskSpoils> {
  return {
    herb: { herb: 4 + level * 2 },
    ore: { ore: 3 + level * 2 },
    adventure: { stone: stoneByTier(maxTierForMajor(major), 3 + level), dust: 1 + level },
    seek: { pillId: pickSeekPill(major, level), pillCount: 1 },
    study: { wudao: 2 + level }
  }
}

/** 结算一趟任务:取基础账 × 天赋加成;与门派/装备互不相干 */
export function apprenticeSpoils(archId: string, spec: ApprenticeSpec, major: number, level: number): TaskSpoils {
  const def = apprenticeDef(archId)
  const base = baseSpoils(major, level)[spec]!
  const mult = def && def.talent === spec ? APPRENTICE_TALENT_BONUS : 1
  const out: TaskSpoils = {}
  for (const k of ['herb', 'ore', 'dust', 'wudao'] as const) {
    const v = base[k]
    if (typeof v === 'number') out[k] = Math.floor(v * mult)
  }
  if (base.stone) out.stone = mulN(base.stone, mult)
  if (base.pillId) {
    out.pillId = base.pillId
    // 丹药是不可分的整数产出,×1.25 后向上取整(基数 1 → 天赋 2 枚),否则 floor 会把
    // 天赋加成整掉成空、与 herb/ore 的「天赋更丰」承诺不一致。
    out.pillCount = Math.max(1, Math.ceil((base.pillCount ?? 1) * mult))
  }
  return out
}

/** 任务是否已完工(按墙钟) */
export function taskDone(appr: OwnedApprentice, now: number): boolean {
  return appr.task !== null && now >= appr.task.finishAt
}

/** 各尽其长 · 库存快照(缺者分高,score = 目标水位 ÷ (现存量 + 1)) */
export interface DispatchNeedStock {
  herb: number
  ore: number
  wudao: number
  dust: number
  /** 丹药总存量 —— seek(寻宝)的稀缺代理 */
  seek: number
}

function needScore(amount: number, water: number): number {
  return water / (Math.max(0, Math.floor(amount)) + 1)
}

/** 取当前最缺的门:各资源短缺分最高者;历练取「器尘短缺分与灵石兜底分之较高」;
 *  并列最高(或无单门胜出)返回 null → 各自专职 */
export function needTargetDoor(stock: DispatchNeedStock): ApprenticeSpec | null {
  const scores: Array<[ApprenticeSpec, number]> = [
    ['herb', needScore(stock.herb, DISPATCH_NEED_TARGET.herb)],
    ['ore', needScore(stock.ore, DISPATCH_NEED_TARGET.ore)],
    ['study', needScore(stock.wudao, DISPATCH_NEED_TARGET.wudao)],
    ['adventure', Math.max(needScore(stock.dust, DISPATCH_NEED_TARGET.dust), DISPATCH_ADVENTURE_FIXED_SCORE)],
    ['seek', needScore(stock.seek, DISPATCH_NEED_TARGET.seek)]
  ]
  let best: ApprenticeSpec | null = null
  let bestScore = -Infinity
  let unique = true
  for (const [spec, s] of scores) {
    if (s > bestScore) {
      best = spec
      bestScore = s
      unique = true
    } else if (s === bestScore) {
      unique = false
    }
  }
  return unique ? best : null
}

/** 一键「各尽其长」:把每名闲置道童确定性地派到当前最缺的门;目标分无差别则各自专职 */
export function dispatchAllToNeed(
  idle: Array<{ uid: string; talent: ApprenticeSpec }>,
  stock: DispatchNeedStock
): Array<{ uid: string; spec: ApprenticeSpec }> {
  if (idle.length === 0) return []
  const target = needTargetDoor(stock)
  if (target) return idle.map(x => ({ uid: x.uid, spec: target }))
  return idle.map(x => ({ uid: x.uid, spec: x.talent }))
}
