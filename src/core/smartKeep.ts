/**
 * 智能收纳(Phase 26)—— 行囊的自动去留裁决
 * 不只按品质:识别流派核心件与组合技关键件——
 * 「这件装备单看一般,但它是你罡盾·反震组合技的关键部件」
 *
 * 另外三类**永不自动处置**(玩家没说可以扔,就不能替他扔):
 *   练过的件 —— 强化过 / 重铸过 / 转入过词条 / 带着封存的,身上有他的投入,只有本人能决定;
 *   成套共鸣件 —— 机制 > 数值,凑不齐第二件才是真亏;
 *   词条近满件 —— 条条都在满值线以上,数值本就高过同档。
 */
import type { EquipmentInstance } from '@/types'
import { qualityDef } from '@/data/qualities'
import { SMART_KEEP_PERFECT_ROLL } from '@/data/constants'
import { equipmentTemplate } from '@/data/equipment'
import { BUILD_STYLES, detectBuild } from './buildDetect'
import { matchComboArt } from '@/data/comboArts'
import { equipSetDef } from './equipSet'
import { resolveEquipStats } from './equipGen'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'

export interface SmartKeepConfig {
  enabled: boolean
  /** 达到此品质 rank 一律保留 */
  minQuality: number
  /**
   * 阶级自留线:阶数达到此值的装备**无论品质**一律保留(0 = 不启用)。
   * 与品质线是「或」:任一达标即留 —— 阶线保高阶、品质线保珍品,各不误杀
   */
  keepMinTier: number
  /** 保留含当前主流派核心词条的装备 */
  keepCoreAffix: boolean
  /** 保留可能促成组合技的副体系件 */
  keepComboPiece: boolean
  /** 保留词条条条近满的件 */
  keepPerfectRolls: boolean
  /** 保留成套共鸣件 */
  keepSetPiece: boolean
}

export interface KeepVerdict {
  keep: boolean
  reason: string
}

/**
 * 自动回收裁决 —— 装备进包前的第一道闸
 * **智能收纳是总闸**:没开,装备一律不替你扔 —— 历练/挂机掉落的凡俗之物也照常入包。
 * 开启后,由 keepVerdict 一条线说了算,命中的保留规则、该件留在行囊;
 * 未命中任何规则才会不入行囊、直接化尘:
 *   1. 品质达保留线、或阶数达阶级自留线、或命中任何智能规则(核心/组合/成套/近满)→ 留;
 *   2. 练过的件 → 留,待本人定夺;
 *   3. 其余 → 与道无缘,化尘。
 * 「一键分解」勾选的品质档**只作用于行囊内已存之件的手动批量分解**,不参与落包
 * 裁决 —— 手动筛手动,自动裁自动,两套井水不犯河水(玩家反馈:手动选了分解
 * 高品档,结果自动收纳把该留的件也化掉了。)
 * 上锁者豁免。
 */
export function shouldAutoRecycle(item: EquipmentInstance): boolean {
  return autoRecycleReason(item) !== null
}

/**
 * 自动回收时该告诉玩家的那一句。
 * 理由只可能出自智能收纳自身的规则(与道无缘等),没有「所勾品质」这类说法了 ——
 * 那不是自动裁决的理由,那是手动勾的档。
 */
export function autoRecycleReason(item: EquipmentInstance): string | null {
  if (item.locked) return null
  const settings = useSettingsStore()
  if (!settings.smartKeep.enabled) return null
  const verdict = keepVerdict(item)
  return verdict.keep ? null : verdict.reason
}

/**
 * 身上有没有玩家的投入(强化 / 重铸 / 封存词条 / 转入词条)—— 有则不参与一切自动去留。
 * 转入词条要算:转一条可达上万器灵尘,若被满包挤位或「依此规则清理」化掉,就是一次丢失事故。
 */
export function hasInvestment(item: EquipmentInstance): boolean {
  return (
    item.level > 0 ||
    (item.reforgeCount ?? 0) > 0 ||
    (item.sealedAffixIds ?? []).length > 0 ||
    (item.transferCount ?? 0) > 0
  )
}

/** 词条是否条条都在满值线以上(0 词条的件不算 —— 那是没得夸,不是满值) */
export function perfectRolls(item: EquipmentInstance): boolean {
  return item.affixes.length > 0 && item.affixes.every(a => a.roll >= SMART_KEEP_PERFECT_ROLL)
}

/** 判定一件装备是否值得收纳 */
export function keepVerdict(item: EquipmentInstance): KeepVerdict {
  const cfg = useSettingsStore().smartKeep
  const q = qualityDef(item.quality)
  // 先于品质:练过的件不属于「自动裁决」的管辖范围
  if (hasInvestment(item)) return { keep: true, reason: '已淬养,留待你自己定夺' }
  // 阶级自留线(硬保底):阶数到了,品质再低也当藏 —— 高阶级是「高阶产出」的近义,
  // 这条线让玩家不必为「保不漏高阶」而把品质线一路顶到神品
  if (cfg.keepMinTier > 0 && item.tier >= cfg.keepMinTier) return { keep: true, reason: '阶高当藏' }
  if (q.rank >= cfg.minQuality) return { keep: true, reason: `${q.name}当藏` }

  // 这两条不看流派,故排在「道途未成」之前 —— 新档也该留住成套件与满值件
  const setId = equipmentTemplate(item.templateId)?.set
  if (cfg.keepSetPiece && setId) return { keep: true, reason: `「${equipSetDef(setId)?.name ?? '成套'}」套件` }
  if (cfg.keepPerfectRolls && perfectRolls(item)) return { keep: true, reason: '词条近满' }

  const build = detectBuild(usePlayerStore().finalStats.mods)
  if (!build) return { keep: false, reason: '道途未成,唯品质论' }
  const mods = resolveEquipStats(item).mods

  if (cfg.keepCoreAffix) {
    for (const key of Object.keys(build.style.core)) {
      if ((mods[key as keyof typeof mods] ?? 0) > 0) {
        return { keep: true, reason: `含${build.style.name}核心词条` }
      }
    }
  }
  if (cfg.keepComboPiece) {
    // 与主流派可成组合技的副体系:这类词条件是「未来的组合技部件」
    for (const style of BUILD_STYLES) {
      if (style.id === build.style.id) continue
      const art = matchComboArt(build.style.id, style.id)
      if (!art) continue
      for (const key of Object.keys(style.core)) {
        if ((mods[key as keyof typeof mods] ?? 0) > 0) {
          return { keep: true, reason: `「${art.name}」组合技部件` }
        }
      }
    }
  }
  return { keep: false, reason: '与道无缘' }
}

/**
 * 行囊满时该挤掉谁:品质最低 → 层级最低 → 词条最弱。
 * (练过的件根本进不了候选 —— 见 keepVerdict 的第一条。)
 */
export function compareEvictable(a: EquipmentInstance, b: EquipmentInstance): number {
  const qa = qualityDef(a.quality).rank
  const qb = qualityDef(b.quality).rank
  if (qa !== qb) return qa - qb
  if (a.tier !== b.tier) return a.tier - b.tier
  return rollSum(a) - rollSum(b)
}

function rollSum(item: EquipmentInstance): number {
  return item.affixes.reduce((s, x) => s + x.roll, 0)
}

/** 依当前规则将被清理的一件(未上锁且 keepVerdict 判不保),带理由 */
export interface SweepTarget {
  item: EquipmentInstance
  /** 与 keepVerdict 同源:该件「不值一留」的那一句 */
  reason: string
}

/**
 * 清理预告 —— 依当前所设的尺度,列出行囊中该化的件。
 * 与挤位同一把尺:未上锁且 keepVerdict 判不保的才入选,回来后按弱者在前排好
 * (预览与下手用同一份名单,所见即所得;调用方不得另写一套筛选)。
 */
export function sweepTargets(items: readonly EquipmentInstance[]): SweepTarget[] {
  const targets: SweepTarget[] = []
  for (const it of items) {
    if (it.locked) continue
    const verdict = keepVerdict(it)
    if (!verdict.keep) targets.push({ item: it, reason: verdict.reason })
  }
  return targets.sort((a, b) => compareEvictable(a.item, b.item))
}

/** 是否启用智能收纳 */
export function smartKeepEnabled(): boolean {
  return useSettingsStore().smartKeep.enabled
}
