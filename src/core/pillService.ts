/**
 * 丹药服务 —— 服用与炼制
 *
 * Phase 32.3 起,炼制不再是「够级必成」的兑换按钮:
 * 成败由认知与技艺决定(见 core/craftability.ts),失手要赔料,但也长本事。
 */
import { gn } from '@/utils/gnum'
import { rng } from '@/utils/random'
import { pillDef } from '@/data/pills'
import { INSTANT_EXP_LAYER_CAP } from '@/data/constants'
import { formatDuration, formatGN } from '@/utils/format'
import { recipeCraft, type SkillId } from '@/data/crafting'
import { expFromSecs, stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import { collect, track } from './progress'
import { modOf } from './statsCalc'
import { craftability, knownRecipes } from './craftability'
import { noteMaterialUsed } from './loreService'
import { noteTaboo } from './samsaraService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoreStore } from '@/stores/lore'
import { useUiStore } from '@/stores/ui'
import { playSfx } from './audio'
import { craftOkToast, craftShortToast, pillGoneToast, pillTakenToast } from '@/ui/pillText'
import type { GNum } from '@/types'

/** 服用丹药 */
/**
 * 服用一枚丹药。
 *
 * quiet=true 供批量服丹用:逐枚结算(修为/状态/计数/破题照旧),提示与音效
 * 由批量那一层合为一条,免得连服十枚连弹十条。
 */
export function usePill(id: string, quiet = false): boolean {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  const ui = useUiStore()
  const def = pillDef(id)
  if (!def) return false
  if (!inventory.spendPill(id)) {
    if (!quiet) ui.toast(pillGoneToast(), 'warn')
    return false
  }
  const lines: string[] = []
  if (def.kind === 'instant' && def.instant) {
    /**
     * 修为丹:药力 = 服丹者当下的修炼速度 × 等效闭关秒数,封顶在「不满一层」。
     *
     * 走的是与一场遭遇、一次际遇**同一个**结算函数(expFromSecs)——
     * 三条来源只在"这段时长有多长"上不同,不再各有各的公式与各自的漂移。
     * 读 player.cultPerSec 而不是裸修速:丹药说的那句"服之如闭关一时",
     * 就该是他自己的一时(功法/建筑/状态/增益都在里头)。
     */
    if (def.instant.expSecs) {
      const gain = expFromSecs(player.expReq, def.instant.expSecs, player.cultPerSec, INSTANT_EXP_LAYER_CAP)
      player.gainExp(gain)
      lines.push(`修为 +${formatGN(gain)}(约抵闭关 ${formatDuration(def.instant.expSecs)})`)
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
  // Phase 32.5:「不假外物」之誓在按下这一刻就落空,不必等到转世才被告知
  noteTaboo('pill')
  collect('pill', id)
  if (!quiet) {
    playSfx('success')
    ui.toast(pillTakenToast(def.name, lines.join(',')), 'success')
  }
  return true
}

/**
 * 批量服丹(玩家反馈「批量吃丹」):连服至多 count 枚,吃到没有就停。
 * 与连点 count 下完全等价 —— 逐枚结算,只把提示合为一条。
 * @returns 实际服下的枚数(0 表示一枚没服下)
 */
export function usePillBatch(id: string, count: number): number {
  if (count <= 1) return usePill(id) ? 1 : 0
  let eaten = 0
  for (let i = 0; i < count; i += 1) {
    if (!usePill(id, true)) break
    eaten += 1
  }
  const name = pillDef(id)?.name ?? id
  const ui = useUiStore()
  if (eaten > 0) {
    playSfx('success')
    ui.toast(`连服 ${eaten} 枚「${name}」${eaten < count ? `(仅存 ${eaten} 枚)` : ''}`, 'success')
  } else {
    ui.toast(pillGoneToast(), 'warn')
  }
  return eaten
}

/** 炼丹消耗 */
export function pillCraftCost(id: string): { herb: number; stone: GNum } | null {
  const def = pillDef(id)
  if (!def?.recipe) return null
  /**
   * 灵石开销按这张方子**准入境界能拿到的最高层级**折算。
   *
   * 从前这里自写 `minRealm × 2 + 1`,界外就飞出区域表了:第 18 境的方子算出层级 37,
   * 而玩家在混沌海能到的最高层级是 32 —— 一张方子的价格凭空高出 322 倍(1.9^5),
   * 于是界外炼丹被自己的报价挡在门外(ISS-211)。层级只有一个事实源:区域表。
   */
  const tier = maxTierForMajor(def.minRealm)
  return { herb: def.recipe.herb, stone: stoneByTier(tier, def.recipe.stoneBase / 10) }
}

/**
 * 当前看得见的丹方 —— 你知道的,不是你够级的。
 * 炸炉风险由 craftability 呈现给玩家自行判断,这里不代玩家做决定。
 */
export function availableRecipes(): string[] {
  return knownRecipes().map(p => p.id)
}

/**
 * 失手时按技艺随机保下的残料比例:手越稳,赔得越少。
 *
 * 导出供 core/pillValue.ts 折算炼制代价 —— 那边若另抄一份,两处口径迟早分叉。
 */
export function salvageRatio(skill: number): number {
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
/**
 * 开炉炼丹。
 *
 * quiet=true 供批量炼丹用:逐炉结算照旧,提示与音效由批量那一层合并。
 */
export function craftPill(id: string, quiet = false): CraftOutcome {
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const def = pillDef(id)
  const cost = pillCraftCost(id)
  const able = craftability(id)
  if (!def || !cost || !able) return { ok: false, count: 0, aborted: true }

  if (able.blockers.length > 0) {
    if (!quiet) ui.toast(able.blockers[0]!, 'warn')
    return { ok: false, count: 0, aborted: true }
  }
  if (!resources.hasSmall('herb', cost.herb) || !resources.hasStone(cost.stone)) {
    if (!quiet) ui.toast(craftShortToast(), 'warn')
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
    if (!quiet) {
      playSfx('fail')
      ui.toast(failLine(able.weakness), 'warn')
    }
    return { ok: false, count: 0 }
  }

  const yieldMod = modOf(player.finalStats.mods, 'alchemyYield')
  const extra = rng.chance(Math.min(0.8, able.bonusChance + yieldMod)) ? 1 : 0
  inventory.addPill(id, 1 + extra)
  track('pillsCrafted', 1 + extra)
  collect('pill', id)
  if (!quiet) {
    playSfx('success')
    ui.toast(craftOkToast(def.name, extra > 0), extra ? 'rare' : 'success')
  }
  return { ok: true, count: 1 + extra }
}

/**
 * 批量炼丹(玩家反馈「批量炼丹」):连开至多 count 炉,材料见底就停。
 * 逐炉结算与连点完全等价,只把提示合为一条。材料一份都不够时,
 * 把真正的阻塞理由交给一次非静默开炉去说明。
 * @returns 成丹数 / 炸炉数
 */
export function craftPillBatch(id: string, count: number): { rounds: number; made: number; failed: number } {
  if (count <= 1) {
    const first = craftPill(id)
    return { rounds: first.ok ? 1 : 1, made: first.ok ? first.count : 0, failed: first.ok ? 0 : 1 }
  }
  let made = 0
  let failed = 0
  let rounds = 0
  for (let i = 0; i < count; i += 1) {
    const out = craftPill(id, true)
    if (out.aborted) break
    rounds += 1
    if (out.ok) made += out.count
    else failed += 1
  }
  const name = pillDef(id)?.name ?? id
  const ui = useUiStore()
  if (rounds === 0) {
    // 第一炉就炼不动:把真实理由交给非静默开炉那句 toast
    craftPill(id)
  } else {
    playSfx('success')
    ui.toast(`连炼 ${rounds} 炉「${name}」:成 ${made} 枚${failed > 0 ? `,炸 ${failed} 炉` : ''}`, failed > 0 ? 'warn' : 'success')
  }
  return { rounds, made, failed }
}

/** 炸炉话术:优先复述最要命的那条短板,让玩家知道该补什么 */
function failLine(weakness: readonly string[]): string {
  const reason = weakness[0]
  return reason ? `炉中一声闷响,丹毁了。${reason}` : '炉中一声闷响,丹毁了——火候差了那么一线。'
}
