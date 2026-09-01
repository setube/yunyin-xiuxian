/**
 * 灵兽性格服务(Phase 31.0 S4)
 *
 * 灵兽不只是数值加成:性格决定探索时的行为倾向。
 * 玩家选伙伴 = 选路线风格,而非单纯"哪个数值高"。
 *
 * 性格:
 *   greedy 贪宝 —— 更易遇稀有掉落/机缘,更易遇危险事件
 *   steady 慢稳 —— 探索更久,失败率下降
 *   fierce 好战 —— 战斗收益提高,更易走高危路线
 *   cautious 谨慎 —— 高闪避,少掉宝
 */
import type { PetDef } from '@/types'
import { petDef } from '@/data/pets'

export interface PetPersonalityEffects {
  /** 探索时长倍率(steady 更久) */
  exploreDurMult: number
  /** 危险率修正(fierce 更高) */
  dangerMult: number
  /** 掉落品质修正(greedy 更高) */
  dropLuck: number
  /** 战败率修正(cautious 更低) */
  lossReduction: number
}

const EFFECTS: Record<PetDef['personality'], PetPersonalityEffects> = {
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

/** 性格一句话说明(选灵兽 UI) */
export function personalityDesc(p: PetDef['personality']): string {
  switch (p) {
    case 'greedy':
      return '更容易发现稀有之物,但也会招来危险。'
    case 'steady':
      return '探索更久更稳,失败率有所下降。'
    case 'fierce':
      return '战斗收益更高,但更容易走上险路。'
    case 'cautious':
      return '谨慎避祸,掉落则稍稍寻常。'
  }
}
