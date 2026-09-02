/**
 * 丹药服务 —— 服用与炼制
 *
 * Phase 32.3 起,炼制不再是「够级必成」的兑换按钮:
 * 成败由认知与技艺决定(见 core/craftability.ts),失手要赔料,但也长本事。
 */
import { gn, mulN } from '@/utils/gnum'
import { rng } from '@/utils/random'
import { pillDef } from '@/data/pills'
import { recipeCraft, type SkillId } from '@/data/crafting'
import { stoneByTier } from './formulas'
import { collect, track } from './progress'
import { modOf } from './statsCalc'
import { craftability, knownRecipes } from './craftability'
import { noteMaterialUsed } from './loreService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoreStore } from '@/stores/lore'
import { useUiStore } from '@/stores/ui'
import { playSfx } from './audio'
import type { GNum } from '@/types'

/** 服用丹药 */
export function usePill(id: string): boolean {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  const ui = useUiStore()
  const def = pillDef(id)
  if (!def) return false
  if (!inventory.spendPill(id)) {
    ui.toast('丹药不足', 'warn')
    return false
  }
  const lines: string[] = []
  if (def.kind === 'instant' && def.instant) {
    if (def.instant.expReqPct) {
      player.gainExp(mulN(player.expReq, def.instant.expReqPct))
      lines.push('修为精进')
    }
    if (def.instant.expFixed) {
      player.gainExp(gn(def.instant.expFixed))
      lines.push('修为精进')
    }
    if (def.instant.qiPct) {
      resources.setQi(resources.qi + player.qiCapValue * def.instant.qiPct, player.qiCapValue)
      lines.push('灵气充盈')
    }
    if (def.instant.lifespanYears) {
      player.addLifespan(def.instant.lifespanYears)
      lines.push(`寿元 +${def.instant.lifespanYears} 载`)
    }
    if (def.instant.wudao) {
      resources.addSmall('wudao', def.instant.wudao)
      lines.push(`悟道点 +${def.instant.wudao}`)
    }
  } else if (def.buffId) {
    cultivation.addBuff(def.buffId, Date.now())
    lines.push('药力化开,状态加身')
  }
  track('pillsUsed')
  collect('pill', id)
  playSfx('success')
  ui.toast(`服下「${def.name}」,${lines.join(',') || '药力温养周身'}`, 'success')
  return true
}

/** 炼丹消耗 */
export function pillCraftCost(id: string): { herb: number; stone: GNum } | null {
  const def = pillDef(id)
  if (!def?.recipe) return null
  const tier = Math.max(1, def.minRealm * 2 + 1)
  return { herb: def.recipe.herb, stone: stoneByTier(tier, def.recipe.stoneBase / 10) }
}

/**
 * 当前看得见的丹方 —— 你知道的,不是你够级的。
 * 炸炉风险由 craftability 呈现给玩家自行判断,这里不代玩家做决定。
 */
export function availableRecipes(): string[] {
  return knownRecipes().map(p => p.id)
}

/** 失手时按技艺随机保下的残料比例:手越稳,赔得越少 */
function salvageRatio(skill: number): number {
  return 0.2 + 0.3 * Math.min(1, skill / 100)
}

/** 开炉长的本事:成功长得快,失败也长——只是慢些,且偏向补最欠缺的一环 */
function gainCraftExp(skills: Readonly<Partial<Record<SkillId, number>>>, rank: number, succeeded: boolean): void {
  const lore = useLoreStore()
  const base = (succeeded ? 10 : 6) * (1 + rank * 0.35)
  for (const [k, w] of Object.entries(skills)) {
    if (w === undefined) continue
    lore.addSkillExp(k as SkillId, base * w)
  }
}

export interface CraftOutcome {
  ok: boolean
  /** 出丹数;失败为 0 */
  count: number
  /** 未开炉(材料不足/不知此方)时为 true —— 与"开炉失败"是两回事 */
  aborted?: boolean
}

/**
 * 炼制丹药。
 *
 * 失败不是白费:料照赔(按技艺保下一部分),但技艺照长,
 * 而且失手对灵材的印象比顺手时更深(见 noteMaterialUsed)。
 */
export function craftPill(id: string): CraftOutcome {
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const def = pillDef(id)
  const cost = pillCraftCost(id)
  const able = craftability(id)
  if (!def || !cost || !able) return { ok: false, count: 0, aborted: true }

  if (able.blockers.length > 0) {
    ui.toast(able.blockers[0]!, 'warn')
    return { ok: false, count: 0, aborted: true }
  }
  if (!resources.hasSmall('herb', cost.herb) || !resources.hasStone(cost.stone)) {
    ui.toast('灵草或灵石不足', 'warn')
    return { ok: false, count: 0, aborted: true }
  }

  const craft = recipeCraft(def)
  const succeeded = rng.chance(able.successRate)

  // 无论成败,炉先开了,料先下了
  resources.spendStone(cost.stone)
  if (succeeded) {
    resources.spendSmall('herb', cost.herb)
  } else {
    const kept = Math.floor(cost.herb * salvageRatio(able.skill))
    resources.spendSmall('herb', cost.herb - kept)
  }

  gainCraftExp(craft?.skills ?? {}, able.rank, succeeded)
  for (const mid of able.materials) noteMaterialUsed(mid, succeeded)

  if (!succeeded) {
    // 炸炉长记性:这张方子反而更熟了一点
    useLoreStore().addRecipeMastery(id, 0.02)
    track('pillsFailed')
    playSfx('fail')
    ui.toast(failLine(able.weakness), 'warn')
    return { ok: false, count: 0 }
  }

  const yieldMod = modOf(player.finalStats.mods, 'alchemyYield')
  const extra = rng.chance(Math.min(0.8, able.bonusChance + yieldMod)) ? 1 : 0
  inventory.addPill(id, 1 + extra)
  track('pillsCrafted', 1 + extra)
  collect('pill', id)
  playSfx('success')
  ui.toast(extra ? `丹成两枚!「${def.name}」品相极佳` : `炼成「${def.name}」×1`, extra ? 'rare' : 'success')
  return { ok: true, count: 1 + extra }
}

/** 炸炉话术:优先复述最要命的那条短板,让玩家知道该补什么 */
function failLine(weakness: readonly string[]): string {
  const reason = weakness[0]
  return reason ? `炉中一声闷响,丹毁了。${reason}` : '炉中一声闷响,丹毁了——火候差了那么一线。'
}

