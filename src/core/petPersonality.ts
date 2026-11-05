/**
 * 灵兽性格:决定历练时的行为倾向。
 * 性格只动 EFFECTS 里四项;界面 petTraitText 同源。
 */
import type { PetDef } from '@/types'
import { petDef } from '@/data/pets'

export interface PetPersonalityEffects {
  /** 历练时长倍率 */
  exploreDurMult: number
  /** 危险率修正 */
  dangerMult: number
  /** 掉落品质修正 */
  dropLuck: number
  /** 战败率修正 */
  lossReduction: number
}

/**
 * 四种性格的效果表。导出供展示层读(见 ui/personalityMark)——
 * 那张表原本是模块私有,展示层只能借 `personalityEffects(petId)` 猜,
 * 而猜要拿一只具体灵兽当探针:换掉那只灵兽的性格,形制就跟着错。
 */
export const EFFECTS: Record<PetDef['personality'], PetPersonalityEffects> = {
  greedy: { exploreDurMult: 1.0, dangerMult: 1.05, dropLuck: 0.06, lossReduction: 0 },
  steady: { exploreDurMult: 1.1, dangerMult: 0.98, dropLuck: 0, lossReduction: 0.02 },
  fierce: { exploreDurMult: 1.0, dangerMult: 1.15, dropLuck: 0.02, lossReduction: 0 },
  cautious: { exploreDurMult: 0.95, dangerMult: 0.95, dropLuck: -0.02, lossReduction: 0.04 }
}

export const PERSONALITY_NAMES: Record<PetDef['personality'], string> = {
  greedy: '贪宝',
  steady: '慢稳',
  fierce: '好战',
  cautious: '谨慎'
}

/** 陪行灵兽的性格效果(无灵兽时返回中性) */
export function personalityEffects(petId: string | null): PetPersonalityEffects {
  if (!petId) return { exploreDurMult: 1, dangerMult: 1, dropLuck: 0, lossReduction: 0 }
  const def = petDef(petId)
  if (!def) return { exploreDurMult: 1, dangerMult: 1, dropLuck: 0, lossReduction: 0 }
  return EFFECTS[def.personality] ?? { exploreDurMult: 1, dangerMult: 1, dropLuck: 0, lossReduction: 0 }
}

/** 性格一句话说明(选灵兽 UI):只报 EFFECTS 里真有的事,不另许修为灵石或机缘 */
export function personalityDesc(p: PetDef['personality']): string {
  const e = EFFECTS[p]
  const parts: string[] = []
  if (e.exploreDurMult > 1) parts.push('行程更久')
  if (e.exploreDurMult < 1) parts.push('行程略短')
  if (e.dangerMult > 1) parts.push('遇险更高')
  if (e.dangerMult < 1) parts.push('遇险略低')
  if (e.dropLuck > 0) parts.push('装备成色更好')
  if (e.dropLuck < 0) parts.push('装备成色稍降')
  if (e.lossReduction > 0) parts.push('败北偶有护持')
  return `${parts.join(',')}。`
}
