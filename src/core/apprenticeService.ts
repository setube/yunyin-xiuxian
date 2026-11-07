/**
 * 收徒结算与产出(纯计算),界面与存档同引。
 * 历练灵石走 stoneByTier(与战斗同一条经济);采药/采矿/参悟给既有消耗品;
 * 寻宝从可炼丹池按等级确定取一枚,不喂全局随机。天赋门类产出 ×APPRENTICE_TALENT_BONUS,不另立数值源。
 */
import type { GNum, QualityId } from '@/types'
import { mulN, subClamp } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { PILLS } from '@/data/pills'
import { maxTierForMajor } from '@/data/regions'
import { qualityDef } from '@/data/qualities'
import {
  APPRENTICE_TALENT_BONUS,
  APPRENTICE_QUALITY_YIELD_STEP,
  DISPATCH_ADVENTURE_FIXED_SCORE,
  DISPATCH_NEED_TARGET,
  RECRUIT_COST_TIER_AMOUNT,
  apprenticeDef,
  taskDef,
  type ApprenticeSpec
} from '@/data/apprentices'

/** 收一名道童的灵石价;卡面报价、服务扣款与缺口共用 */
export function apprenticeRecruitCost(major: number): GNum {
  return stoneByTier(maxTierForMajor(major), RECRUIT_COST_TIER_AMOUNT)
}

/** 收道童还差多少灵石;卡面置灰、报价行与拒因共用 */
export function apprenticeRecruitShortfall(major: number, balance: GNum): GNum {
  return subClamp(apprenticeRecruitCost(major), balance)
}

/** 一名已收弟子;与 store 同形,类型放 service 供两端共用 */
export interface OwnedApprentice {
  uid: string
  archId: string
  level: number
  /** 羁绊:累计完工趟数;只供位阶称谓,不给产出加成 */
  bond: number
  task: { spec: ApprenticeSpec; startAt: number; finishAt: number } | null
}

/** 一趟任务的产出账(石头是大数,其余是小数);未入账,由 store 应用 */
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
 * 寻宝的丹药:按境界从可炼丹池确定取一枚。池以 minRealm ≤ major 封顶(与坊市 salePills 同源),
 * 否则新号寻宝可白捡顶阶丹。境界 ≥0 时池恒非空(入口丹均为 minRealm 0);空池兜底,数据误删时不静默吞产出。
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

/** 品阶产出倍率:凡品 1.0,每高一档 +APPRENTICE_QUALITY_YIELD_STEP */
function qualityYieldOf(quality: QualityId): number {
  return 1 + qualityDef(quality).rank * APPRENTICE_QUALITY_YIELD_STEP
}

/**
 * 结算一趟任务:取基础账 × 天赋加成 × 品阶倍率;与门派/装备互不相干。
 *
 * 品阶此前只决定名字颜色与角章,不参与产出 —— 同名天赋的两名道童(悟道道童 精品 /
 * 仙门慧童 灵品)一趟产出分毫不差,而收徒成本一样、抽到谁纯看运气。
 */
export function apprenticeSpoils(archId: string, spec: ApprenticeSpec, major: number, level: number): TaskSpoils {
  const def = apprenticeDef(archId)
  const base = baseSpoils(major, level)[spec]!
  const talentMult = def && def.talent === spec ? APPRENTICE_TALENT_BONUS : 1
  const mult = talentMult * (def ? qualityYieldOf(def.quality) : 1)
  const out: TaskSpoils = {}
  for (const k of ['herb', 'ore', 'dust', 'wudao'] as const) {
    const v = base[k]
    if (typeof v === 'number') out[k] = Math.floor(v * mult)
  }
  if (base.stone) out.stone = mulN(base.stone, mult)
  if (base.pillId) {
    out.pillId = base.pillId
    // 丹药 ×1.25 后向上取整(基数 1 → 天赋 2 枚);floor 会把天赋加成整掉
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
  /** 丹药总存量,作 seek(寻宝)的稀缺代理 */
  seek: number
}

function needScore(amount: number, water: number): number {
  return water / (Math.max(0, Math.floor(amount)) + 1)
}

/**
 * 当前最缺的门:短缺分最高者;历练取器尘短缺分与灵石兜底分之较高。
 * 并列最高返回 null(各自专职)。
 */
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

/** 一键「各尽其长」:闲置道童全派最缺的门;无单门胜出则各自专职 */
export function dispatchAllToNeed(
  idle: Array<{ uid: string; talent: ApprenticeSpec }>,
  stock: DispatchNeedStock
): Array<{ uid: string; spec: ApprenticeSpec }> {
  if (idle.length === 0) return []
  const target = needTargetDoor(stock)
  if (target) return idle.map(x => ({ uid: x.uid, spec: target }))
  return idle.map(x => ({ uid: x.uid, spec: x.talent }))
}
