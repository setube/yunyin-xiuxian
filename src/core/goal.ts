/**
 * Phase 29 修行目标 —— 给玩家"现在应该干什么"的轻量上下文
 *
 * 核心原则:
 * - 给方向,不替玩家做决定
 * - 不引入新资源/新系统,只复用现有状态
 * - 从前期教学自然过渡到 Build 游戏
 *
 * 类型:
 * - breakthrough  修为接近突破 → 小进阶「尝试突破」/ 大关「引劫突破」
 * - equipment     装备槽有空位 → "寻一件XX法器"
 * - explore       区域未涉足   → "深入XX"
 * - material      材料不足     → "采集XX"
 * - build         流派未成形   → "凑出XX流" (中期核心目标)
 */
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { detectBuild } from './buildDetect'
import { breakthroughInfo } from './breakthrough'
import { REGIONS } from '@/data/regions'
import { EQUIP_SLOT_NAMES } from '@/data/equipment'
import { BREAKTHROUGH_PREP_OPTIONS } from '@/data/earlyGame'
import { pillDef } from '@/data/pills'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { breakthroughGoalText } from '@/ui/cultivationText'
import type { EquipSlot } from '@/types'

export type GoalType = 'breakthrough' | 'equipment' | 'explore' | 'material' | 'build'

export interface Goal {
  type: GoalType
  text: string
  /** 进度(0~1),可选 */
  progress?: number
  /** 建议下一步(可选) */
  hint?: string
}

/**
 * 实体装备槽(排除 artifact —— 法宝是独立系统 equippedArtifacts,装备模板从不落此槽,
 * 见 equipGen.generateEquipment 的 t.slot !== 'artifact')。按有意义的优先级排列:
 * 武器占攻、衣袍护身居先;灵符是真槽(有整套模板),一并纳入。
 * 空槽扫描按此顺序挑第一个,保证建议具体且不来回跳。
 */
const GEAR_SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']

/**
 * 灵草的低位线:野外唯一被消耗的材料(丹方 4~30 一味),10 约等于两炉最廉丹方的余量,
 * 既不至于一采就闪烁,也远低于"炼不出一炉"的绝望水位。ore 目前只进不花,不作提示对象。
 */
const MATERIAL_LOW_HERB = 10

/**
 * 临近突破时的一句提示。
 *
 * 下一境的名字必须来自 breakthroughInfo(圆满层要进下一个大境界,不能把 sub+1 钳在本境)。
 * 凝神丹与静坐只加小进阶的 breakthroughRate;大关走天劫,提示若仍说「提升成功率」就是谎话。
 */
function nearBreakthroughHint(needTribulation: boolean): string {
  if (needTribulation) return '这一步是大关天劫,凝神丹与静坐不加成功率,先看劫势再决意'
  const prep = BREAKTHROUGH_PREP_OPTIONS.filter(o => o.bonusRate > 0)
    .map(o => o.label)
    .join('、')
  const pill = pillDef('p_ningshen')?.name ?? '凝神丹'
  return `这一步是小进阶,${prep}或${pill}可提升进阶成功率`
}

/** 纯函数:根据玩家状态生成当前目标 */
export function generateCurrentGoal(player: ReturnType<typeof usePlayerStore>): Goal | null {
  // 1. 死后无目标
  if (player.dead) return null

  // 2. 修为接近突破(最高优先级)。大道尽头没有下一境,不硬塞突破。
  if (!player.atMaxRealm && player.expProgress >= 0.5) {
    const near = player.expProgress >= 0.85
    const info = breakthroughInfo()
    return {
      type: 'breakthrough',
      text: breakthroughGoalText(near, info.needTribulation, info.targetLabel),
      progress: player.expProgress,
      hint: near ? nearBreakthroughHint(info.needTribulation) : undefined
    }
  }

  // 3. 检测 Build 完整度(中期核心目标)
  const build = detectBuild(player.finalStats.mods)
  if (build) {
    const style = build.style.name
    const core = Math.max(1, build.coreValues.length)
    return {
      type: 'build',
      text: `完善「${style}」流派`,
      progress: Math.min(1, core / 4),
      hint: `当前已凑出 ${core}/4 个核心词条,继续寻找关键装备`
    }
  }

  // 4. 低优先级:历练/材料/装备(未涉足且可入的地界向前,推前线推进永远优先;
  //    材料与装备同门 —— 供应/装填补缺 —— 都只在"已通关过至少一地界"后才提示,
  //    免得开局就叠在 explore 上重复"去历练"。)
  const adventure = useAdventureStore()
  const nextRegion = REGIONS.find(r => adventure.unlocked.includes(r.id) && !adventure.cleared.includes(r.id))
  if (nextRegion) {
    return {
      type: 'explore',
      text: `深入「${nextRegion.name}」`,
      hint: '增长阅历,也寻些机缘与材料'
    }
  }
  const hasClearedAny = adventure.cleared.length > 0

  // 5. 材料不足 → 采集:灵草见底便指向最高层级的已通关地界(取材收益最大)。
  //    材料在装备之前 —— 断粮卡丹方是"阻断",空槽是"可选的战力余量"。
  //    读当前品阶的可炼数,不读跨品总和:旧品/早境草炼不了此刻的丹方,报它们只会掩盖断粮。
  const resources = useResourcesStore()
  const currentHerb = resources.herbOf(herbGradeOfMajor(player.major))
  if (hasClearedAny && currentHerb < MATERIAL_LOW_HERB) {
    const best = [...REGIONS]
      .filter(r => adventure.cleared.includes(r.id))
      .sort((a, b) => b.tier - a.tier)[0]
    if (best) {
      return {
        type: 'material',
        text: `去「${best.name}」采集灵草`,
        progress: Math.min(1, currentHerb / MATERIAL_LOW_HERB),
        hint: '丹药原料所剩无几,历练途中常有灵草可采'
      }
    }
  }

  // 6. 装备槽有空位 → 寻法器:指第一个空槽,进度 = 已填槽占比(填满即自解)。
  const inventory = useInventoryStore()
  const emptySlot = GEAR_SLOTS.find(slot => !inventory.equipped[slot])
  if (hasClearedAny && emptySlot) {
    const filled = GEAR_SLOTS.filter(slot => inventory.equipped[slot]).length
    const slotName = EQUIP_SLOT_NAMES[emptySlot]
    return {
      type: 'equipment',
      text: `寻一件${slotName}`,
      progress: filled / GEAR_SLOTS.length,
      hint: `还缺一件${slotName},历练所得的装备里常有`
    }
  }
  return null
}
