/** 丹药服务:服用与炼制。炼制成败见 core/craftability.ts。 */
import { gnZero, mulN, ratio, subClamp } from '@/utils/gnum'
import { rng } from '@/utils/random'
import { pillDef } from '@/data/pills'
import { herbGradeOfMajor, type HerbGrade } from '@/data/herbGrades'
import { INSTANT_EXP_LAYER_CAP } from '@/data/constants'
import { formatGN, formatGap } from '@/utils/format'
import { recipeCraft, type SkillId } from '@/data/crafting'
import { expFromSecs, pillStoneCost } from './formulas'
import { collect, track } from './progress'
import { buffOverflowOf } from './buffCap'
import { gameNow } from './enginePause'
import { craftability, knownRecipes } from './craftability'
import { noteMaterialUsed } from './loreService'
import { craftGuaranteeRemaining } from './heritageEffects'
import { noteTaboo } from './samsaraService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoreStore } from '@/stores/lore'
import { useUiStore } from '@/stores/ui'
import { playSfx } from './audio'
import { craftOkToast, craftShortToast, craftUnknownToast, pillGoneToast, pillTakenToast } from '@/ui/pillText'
import type { GNum } from '@/types'

/** 服用一枚丹药。quiet=true 供批量服丹:逐枚结算照旧,提示与音效由批量层合为一条。 */
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
    // 修为丹:药力 = player.cultPerSec(含功法/建筑/状态/增益,非裸修速)× 等效秒数,封顶不满一层;
    // 与遭遇、际遇同走 expFromSecs
    if (def.instant.expSecs) {
      const gain = expFromSecs(player.expReq, def.instant.expSecs, player.cultPerSec, INSTANT_EXP_LAYER_CAP)
      player.gainExp(gain)
      lines.push(`修为 +${formatGN(gain)}`)
    }
    if (def.instant.expFixed) {
      // 固定点数按 1 点=1 秒走 expFromSecs,同守「不满一层」封顶;不封则入门丹一枚连跳多层
      // spec 钉:expIncome.spec 接线红线 / pillValue 审计
      player.gainExp(expFromSecs(player.expReq, def.instant.expFixed, 1, INSTANT_EXP_LAYER_CAP))
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
    // 读 gameNow() 不读 Date.now(),与界面 useNow 同尺(纪律见 enginePause 头注释):
    // 暂停时墙钟照走,恢复后引擎再顺延,药力凭空多一段。now 只取一次,判 overflow 与写 endsAt 共用。
    const now = gameNow()
    const overflow = buffOverflowOf(cultivation.buffs, def.buffId, now)
    cultivation.addBuff(def.buffId, now)
    lines.push(overflow === 'full' ? '药力已顶满,白费' : overflow === 'partial' ? '药力只延续到顶' : '药力化开')
  }
  track('pillsUsed')
  // 「不假外物」之誓当场落空
  noteTaboo('pill')
  collect('pill', id)
  if (!quiet) {
    playSfx('success')
    ui.toast(pillTakenToast(def.name, lines.join(',')), 'success')
  }
  return true
}

/**
 * 批量服丹:连服至多 count 枚,吃完即停;与连点 count 下等价,只把提示合为一条。
 * @returns 实际服下的枚数
 */
export function usePillBatch(id: string, count: number): number {
  if (count < 1) return 0
  const def = pillDef(id)
  if (!def) return 0
  // 增益丹退化为单服:药力一顶后面全白费(buffOverflowOf),单服提示才报得出「只延续到顶 / 白费」
  if (def.buffId) return usePill(id) ? 1 : 0
  if (count === 1) return usePill(id) ? 1 : 0
  let eaten = 0
  for (let i = 0; i < count; i += 1) {
    if (!usePill(id, true)) break
    eaten += 1
  }
  const name = def.name
  const ui = useUiStore()
  if (eaten > 0) {
    playSfx('success')
    ui.toast(`连服 ${eaten} 枚「${name}」`, 'success')
  } else {
    ui.toast(pillGoneToast(), 'warn')
  }
  return eaten
}

export function pillCraftCost(id: string): { herb: number; stone: GNum; grade: HerbGrade } | null {
  const def = pillDef(id)
  if (!def?.recipe) return null
  // 灵草品阶取方子准入境界:低阶草进不了高阶方子
  const grade = herbGradeOfMajor(def.minRealm)
  // 灵石按准入境界能拿到的最高层级折算;层级单一事实源:区域表
  return { herb: def.recipe.herb, stone: pillStoneCost(def), grade }
}

// 「炼制石耗」唯一事实源(定义在 core/formulas);re-export 保持公开 API,坊市买/售、悬赏募丹从 ./pillService 引入
export { pillStoneCost }

/** 当前看得见的丹方:已知的,不按够级筛;炸炉风险由 craftability 呈现 */
export function availableRecipes(): string[] {
  return knownRecipes().map(p => p.id)
}

/** 炼不动的原因;界面按它决定「去哪补」 */
export type CraftBlockReason = 'unknown' | 'mastery' | 'herb' | 'stone' | 'both'

export interface CraftBatchPlan {
  /** 按当前料保底可开的最大炉数(炉炉皆成也够);0 = 炼不动 */
  rounds: number
  /** 开 rounds 炉的灵草总量 */
  herb: number
  /** 开 rounds 炉的灵石总量 */
  stone: GNum
  /** rounds=0 时的阻塞理由;炼得动时为 undefined */
  blocked?: string
  /** rounds=0 时的结构化原因;unknown / mastery 补不了料,界面不给采购入口 */
  reason?: CraftBlockReason
  /** reason 含 herb 时,还差多少株当前品灵草 */
  shortHerb?: number
  /** reason 含 stone 时,还差多少灵石 */
  shortStone?: GNum
}

/** 一炉的草石差额(草按当前品库存);计划、单炉开炉、连炼零炉回执同读此处 */
export function craftShortfall(cost: { herb: number; stone: GNum; grade: HerbGrade }): { herb: number; stone: GNum } {
  const resources = useResourcesStore()
  return {
    herb: Math.max(0, cost.herb - resources.herbOf(cost.grade)),
    stone: resources.hasStone(cost.stone) ? gnZero() : subClamp(cost.stone, resources.spiritStone)
  }
}

/**
 * 炼丹连开计划:按当前料保底算能开几炉(炉炉皆成也够),不动炉。
 * 灵草按每炉全额、灵石按每炉整扣;未知方子/掌握不足先于材料缺口报。界面「炼满」预览与执行共用。
 */
export function craftBatchPlan(id: string): CraftBatchPlan {
  const resources = useResourcesStore()
  const def = pillDef(id)
  const cost = pillCraftCost(id)
  const able = craftability(id)
  const blocked = (msg: string, reason: CraftBlockReason, shortHerb?: number, shortStone?: GNum): CraftBatchPlan => ({
    rounds: 0,
    herb: 0,
    stone: gnZero(),
    blocked: msg,
    reason,
    ...(shortHerb === undefined ? {} : { shortHerb }),
    ...(shortStone === undefined ? {} : { shortStone })
  })
  if (!def || !cost || !able) return blocked(craftUnknownToast(), 'unknown')
  if (able.blockers.length > 0) return blocked(able.blockers[0]!, 'mastery')
  const herbHeld = resources.herbOf(cost.grade)
  const herbRounds = Math.floor(herbHeld / cost.herb)
  // 直接求商不逐炉减(库存大时会跑百万次 GNum 减法);ratio 指数差钳制只会偏保守
  const stoneRoundsRaw = Math.floor(ratio(resources.spiritStone, cost.stone))
  /** ratio 在除数为 0/NaN 时给 Infinity/NaN:灵石不构成约束,炉数只由灵草定 */
  const stoneLimited = Number.isFinite(stoneRoundsRaw)
  const stoneRounds = Math.max(0, stoneLimited ? stoneRoundsRaw : 0)
  const rounds = Math.min(herbRounds, stoneLimited ? stoneRounds : herbRounds)
  if (rounds === 0) {
    const gap = craftShortfall(cost)
    const stoneShort = stoneLimited && stoneRounds === 0 && gap.stone.m > 0
    // 缺草报株数、缺石报石差,不写笼统的「不足」
    if (stoneShort && gap.herb > 0) {
      return blocked(craftShortToast({ herb: gap.herb, stone: formatGap(gap.stone) }), 'both', gap.herb, gap.stone)
    }
    if (stoneShort) return blocked(craftShortToast({ stone: formatGap(gap.stone) }), 'stone', undefined, gap.stone)
    return blocked(craftShortToast({ herb: gap.herb }), 'herb', gap.herb)
  }
  return { rounds, herb: rounds * cost.herb, stone: mulN(cost.stone, rounds) }
}

/** 失手时按技艺保下的残料比例;core/pillValue.ts 折算炼制代价共用此处,不另抄 */
export function salvageRatio(skill: number): number {
  return 0.2 + 0.3 * Math.min(1, skill / 100)
}

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
  /** 未开炉(材料不足/不知此方)时为 true,不同于开炉失败 */
  aborted?: boolean
}

/**
 * 开炉炼丹。失手料照赔(按技艺保下一部分),技艺照长,对灵材印象更深(见 noteMaterialUsed)。
 * quiet=true 供批量炼丹:逐炉结算照旧,提示与音效由批量层合并。
 */
export function craftPill(id: string, quiet = false): CraftOutcome {
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const def = pillDef(id)
  const cost = pillCraftCost(id)
  // 结算不读 weakness,跳过最重的那份计算
  const able = craftability(id, { omitWeakness: true })
  if (!def || !cost || !able) return { ok: false, count: 0, aborted: true }

  if (able.blockers.length > 0) {
    if (!quiet) ui.toast(able.blockers[0]!, 'warn')
    return { ok: false, count: 0, aborted: true }
  }
  const gap = craftShortfall(cost)
  if (gap.herb > 0 || gap.stone.m > 0) {
    if (!quiet) {
      ui.toast(
        craftShortToast({
          herb: gap.herb,
          ...(gap.stone.m > 0 ? { stone: formatGap(gap.stone) } : {})
        }),
        'warn'
      )
    }
    return { ok: false, count: 0, aborted: true }
  }

  const craft = recipeCraft(def)
  // 浴火丹心:本世前几炉必成,只在真开炉时消费每世额度
  const guarantee = craftGuaranteeRemaining(player.reincarnation.heritage, player.reincarnation.heritageUses)
  const succeeded = guarantee > 0 || rng.chance(able.successRate)
  if (guarantee > 0) player.consumeHeritageUse('danxin', 3)

  resources.spendStone(cost.stone)
  if (succeeded) {
    resources.spendHerb(cost.grade, cost.herb)
  } else {
    const kept = Math.floor(cost.herb * salvageRatio(able.skill))
    resources.spendHerb(cost.grade, cost.herb - kept)
  }

  gainCraftExp(craft?.skills ?? {}, able.rank, succeeded)
  for (const mid of able.materials) noteMaterialUsed(mid, succeeded)

  if (!succeeded) {
    useLoreStore().addRecipeMastery(id, 0.02)
    track('pillsFailed')
    if (!quiet) {
      playSfx('fail')
      ui.toast('炸炉', 'warn')
    }
    return { ok: false, count: 0 }
  }

  // 双丹概率读 craftability(含 alchemyYield、已按 PILL_SECOND_CAP 封顶),与展示同源,不自算
  const extra = rng.chance(able.bonusChanceWithYield) ? 1 : 0
  inventory.addPill(id, 1 + extra)
  track('pillsCrafted', 1 + extra)
  collect('pill', id)
  useLoreStore().addRecipeMastery(id, 0.01)
  if (!quiet) {
    playSfx('success')
    ui.toast(craftOkToast(def.name, extra > 0), extra ? 'rare' : 'success')
  }
  return { ok: true, count: 1 + extra }
}

/**
 * 批量炼丹:连开至多 count 炉,材料见底即停;与连点等价,只把提示合为一条。
 * 一炉都开不了时,由一次非静默开炉报阻塞理由。
 */
export function craftPillBatch(id: string, count: number): { rounds: number; made: number; failed: number } {
  if (count < 1) return { rounds: 0, made: 0, failed: 0 }
  if (count === 1) {
    const first = craftPill(id)
    // 未开炉不计为炸炉,与 count≥2 的循环同口径
    if (first.aborted) return { rounds: 0, made: 0, failed: 0 }
    return { rounds: 1, made: first.ok ? first.count : 0, failed: first.ok ? 0 : 1 }
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
    craftPill(id)
  } else {
    playSfx('success')
    ui.toast(`连炼 ${rounds} 炉「${name}」:成 ${made} 枚${failed > 0 ? `,炸 ${failed} 炉` : ''}`, failed > 0 ? 'warn' : 'success')
  }
  return { rounds, made, failed }
}
