/**
 * 器魂凝炼 —— 把一件凡器炼成它在天界的形意
 *
 * 类型由装备的主导词条判定(它是什么路数),品阶由品质决定(形意存留多少)。
 * 凝炼要销毁原器:这份代价让「凝哪件」成为真决策,而不是把背包里每件都炼一遍。
 */
import type { EquipmentInstance, StatMods } from '@/types'
import { uid } from '@/utils/id'
import { qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import { SOUL_TYPES, soulGradeOfQuality, type SoulInstance, type SoulTypeDef } from '@/data/souls'
import { resolveEquipStats } from './equipGen'

/** 某装备在某类器魂的判定键上的合计权重 */
function typeScore(mods: StatMods, def: SoulTypeDef): number {
  let sum = 0
  for (const key of def.judgeKeys) {
    const v = mods[key]
    if (typeof v === 'number' && v > 0) sum += v
  }
  return sum
}

export interface SoulPreview {
  /** 将凝出的器魂类型;null 表示此器无形意可存(没有任何判定词条) */
  type: SoulTypeDef | null
  gradeRank: number
  /** 各类型的判定得分,供 UI 解释「为何是这一路」 */
  scores: { def: SoulTypeDef; score: number }[]
}

/**
 * 预览某件装备会凝出什么器魂(不消耗、不改动任何状态)。
 * 判定只看词条方向,不看数值大小——一件凡品短剑和一件神品长剑,
 * 若都是锋芒路数,凝出的都是锋魂,只是品阶不同
 */
export function previewSoul(inst: EquipmentInstance): SoulPreview {
  const resolved = resolveEquipStats(inst)
  const scores = SOUL_TYPES.map(def => ({ def, score: typeScore(resolved.mods, def) })).sort((a, b) => b.score - a.score)
  const top = scores[0]
  const quality = qualityDef(inst.quality)
  return {
    type: top && top.score > 0 ? top.def : null,
    gradeRank: soulGradeOfQuality(quality.rank).rank,
    scores
  }
}

/**
 * 凝炼:生成器魂实例。返回 null 表示此器无形意可存。
 * 注意本函数是纯的——销毁原器由调用方(soulService)负责
 */
export function refineSoul(inst: EquipmentInstance): SoulInstance | null {
  const preview = previewSoul(inst)
  if (!preview.type) return null
  const template = equipmentTemplate(inst.templateId)
  return {
    uid: uid(),
    type: preview.type.id,
    grade: preview.gradeRank,
    fromName: template?.name ?? '无名法器'
  }
}

/** 此器能否凝炼(无任何构筑词条的白板装备凝不出器魂) */
export function canRefine(inst: EquipmentInstance): boolean {
  return previewSoul(inst).type !== null
}
