/**
 * 装备重铸与词条封存(灵石的长期 sink)
 * - 重铸:未封存词条推倒重来,条数与数值都重掷;品质、阶数、强化等级不动;不限次数。
 * - 封存:付费锁定一个词条,重铸不碰;每件至少留一个可重掷位。
 * 成本只与装备阶数和封存数挂钩(见 data/constants 的注释)。
 */
import type { EquipmentInstance, GNum } from '@/types'
import { rng } from '@/utils/random'
import { playSfx } from './audio'
import { AFFIXES, affixDef, affixFitBlock } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import {
  REFORGE_DUST_BASE,
  REFORGE_SEAL_LOAD,
  REFORGE_STONE_BASE,
  SEAL_STONE_BASE
} from '@/data/constants'
import { stoneByTier } from './formulas'
import { track } from './progress'
import { noteSmithingUsed } from './loreService'
import { add, gnZero, mulN, subClamp } from '@/utils/gnum'
import { formatGap } from '@/utils/format'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import {
  reforgeDoneToast,
  reforgeEmptyToast,
  reforgeShortToast,
  sealDoneToast,
  sealMustLeaveToast,
  sealShortToast,
  unsealDoneToast
} from '@/ui/reforgeText'

export interface ReforgeCost {
  stone: GNum
  dust: number
}

export interface ReforgeShortfall {
  /** 提示优先报的那一样;两样都缺时先报灵石 */
  short: 'stone' | 'dust' | null
  /** 灵石还差多少(够则为 0) */
  stone: GNum
  /** 器灵尘还差多少(够则为 0) */
  dust: number
}

/** 这一炉两样各差多少;界面置灰、价签与提示共用这一处判定 */
export function reforgeShortfall(cost: ReforgeCost): ReforgeShortfall {
  const resources = useResourcesStore()
  const stone = resources.hasStone(cost.stone) ? gnZero() : subClamp(cost.stone, resources.spiritStone)
  const dust = resources.hasSmall('dust', cost.dust) ? 0 : Math.max(0, cost.dust - resources.dust)
  return {
    short: stone.m > 0 ? 'stone' : dust > 0 ? 'dust' : null,
    stone,
    dust
  }
}

/** 这一炉缺哪一样(付得起时为 null) */
export function reforgeShort(cost: ReforgeCost): 'stone' | 'dust' | null {
  return reforgeShortfall(cost).short
}

/** 至多花销还差多少:一次重铸的成本 × 归一后的预算;付得起时为全 0 */
export function reforgePlanShortfall(cost: ReforgeCost, rolls: number): ReforgeShortfall {
  const n = autoReforgeBudget(rolls)
  return reforgeShortfall({ stone: mulN(cost.stone, n), dust: cost.dust * n })
}

/** 自动重铸可同时设为目标的最大词条数;文案(已选 X/3)与守卫逻辑都读它,不各自手写 */
export const AUTO_REFORGE_MAX_TARGETS = 3

/** 自动重铸一次最多洗多少次(上限只此一处);预览、执行与输入的 min/max 一律走 autoReforgeBudget() */
export const AUTO_REFORGE_MAX_BUDGET = 500

/** 自动重铸预算归一:非有限/缺省回落 1,取整后夹到 [1, AUTO_REFORGE_MAX_BUDGET] */
export function autoReforgeBudget(raw: number): number {
  const n = Number.isFinite(raw) ? Math.floor(raw) : 0
  return Math.min(AUTO_REFORGE_MAX_BUDGET, Math.max(1, n))
}

/**
 * 重铸成本:没有次数项,也没有上限。
 * 全封存时返回 null(唯一的「不能再炼」);模板缺失(坏档)也返回 null:抽取池按部位过滤,
 * 与自动重铸候选在模板缺失时为空同判。
 */
export function reforgeCost(inst: EquipmentInstance): ReforgeCost | null {
  if (!equipmentTemplate(inst.templateId)) return null
  if (reforgeableAffixIds(inst).length === 0) return null
  const sealed = (inst.sealedAffixIds ?? []).length
  const load = 1 + sealed * REFORGE_SEAL_LOAD
  return {
    stone: stoneByTier(inst.tier, REFORGE_STONE_BASE * load),
    dust: Math.round(REFORGE_DUST_BASE * load)
  }
}

/** 可被重铸(未封存)的词条 id 列表 */
export function reforgeableAffixIds(inst: EquipmentInstance): string[] {
  const sealed = new Set(inst.sealedAffixIds ?? [])
  return inst.affixes.map(a => a.id).filter(id => !sealed.has(id))
}

/** 封存上限:至少留一个可重掷位;判据与界面共用这一处 */
export function sealCapacity(inst: EquipmentInstance): number {
  return Math.max(0, inst.affixes.length - 1)
}

/** 重铸一件;quiet=true 供自动重铸用:逐次照常结算,提示由自动那层合为一次 */
export function reforgeEquipment(uid: string, quiet = false): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  if (!inst) return false
  const cost = reforgeCost(inst)
  if (!cost) {
    if (!quiet) {
      playSfx('warn')
      ui.toast(reforgeEmptyToast(), 'warn')
    }
    return false
  }
  const short = reforgeShort(cost)
  if (short) {
    if (!quiet) {
      playSfx('warn')
      const gap = reforgeShortfall(cost)
      ui.toast(reforgeShortToast(short, { stone: formatGap(gap.stone), dust: gap.dust }), 'warn')
    }
    return false
  }

  const template = equipmentTemplate(inst.templateId)
  if (!template) return false
  const quality = qualityDef(inst.quality)
  const sealed = new Set(inst.sealedAffixIds ?? [])
  const kept = inst.affixes.filter(a => sealed.has(a.id))
  const [minCount, maxCount] = quality.affixes

  resources.spendStone(cost.stone)
  resources.spendSmall('dust', cost.dust)

  // 条数:品质区间内重掷,但不低于「封存数 + 1」
  const wantCount = Math.max(kept.length + 1, Math.min(maxCount, rng.int(minCount, maxCount)))
  const used = new Set([...kept.map(a => a.id)])
  const fresh: { id: string; roll: number }[] = []
  let guard = 0
  while (fresh.length < wantCount - kept.length && guard < 50) {
    guard += 1
    const pool = AFFIXES.filter(a => !used.has(a.id) && affixFitBlock(a, template.slot, quality.rank) === null)
    if (pool.length === 0) break
    const picked = rng.weighted(pool, a => a.weight)
    used.add(picked.id)
    fresh.push({ id: picked.id, roll: rng.next() })
  }
  const affixes = [...kept, ...fresh]
  const before = inst.affixes.length
  inventory.replaceItem({ ...inst, affixes, reforgeCount: (inst.reforgeCount ?? 0) + 1 })
  track('upgrades')
  // 重铸记一味矿材「上手过」(矿石通晓/锻造技艺的唯一活水),并长铭纹技艺
  noteSmithingUsed(inst.tier, true)
  useLoreStore().addSkillExp('inscribe', 10 * (1 + inst.tier * 0.2))

  const countNote = before === affixes.length ? `${affixes.length} 条` : `${before} → ${affixes.length} 条`
  if (!quiet) {
    playSfx('success')
    ui.toast(reforgeDoneToast(countNote), 'success')
  }
  return true
}

/** 封存成本:第 n 次封存 = 基础 × n(灵石按装备层级换算) */
export function sealCost(inst: EquipmentInstance): GNum | null {
  const sealed = inst.sealedAffixIds ?? []
  if (sealed.length >= sealCapacity(inst)) return null
  return stoneByTier(inst.tier, SEAL_STONE_BASE * (sealed.length + 1))
}

/** 封存还差多少灵石:封满(无价)为 null,付得起为 0;封存钮、页脚价签与服务拒因同读这一处 */
export function sealShortfall(inst: EquipmentInstance): GNum | null {
  const cost = sealCost(inst)
  if (!cost) return null
  const resources = useResourcesStore()
  return resources.hasStone(cost) ? gnZero() : subClamp(cost, resources.spiritStone)
}

/** 封存一个词条:重铸永不替换之 */
export function sealAffix(uid: string, affixId: string): boolean {
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  if (!inst) return false
  if (!inst.affixes.some(a => a.id === affixId)) return false
  if ((inst.sealedAffixIds ?? []).includes(affixId)) return false
  const cost = sealCost(inst)
  if (!cost) {
    ui.toast(sealMustLeaveToast(), 'warn')
    return false
  }
  const gap = sealShortfall(inst)
  if (gap && gap.m > 0) {
    ui.toast(sealShortToast(formatGap(gap)), 'warn')
    return false
  }
  useResourcesStore().spendStone(cost)
  inventory.replaceItem({ ...inst, sealedAffixIds: [...(inst.sealedAffixIds ?? []), affixId] })
  const name = affixDef(affixId)?.name ?? '词条'
  ui.toast(sealDoneToast(name), 'success')
  return true
}

/** 解封一个词条:免费,封存付出的灵石不退还 */
export function unsealAffix(uid: string, affixId: string): boolean {
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  if (!inst) return false
  if (!inst.affixes.some(a => a.id === affixId)) return false
  if (!(inst.sealedAffixIds ?? []).includes(affixId)) return false
  inventory.replaceItem({ ...inst, sealedAffixIds: (inst.sealedAffixIds ?? []).filter(id => id !== affixId) })
  const name = affixDef(affixId)?.name ?? '词条'
  playSfx('success')
  ui.toast(unsealDoneToast(name), 'success')
  return true
}

/**
 * 「保留 keptIds、其余重铸」时,在这件上洗出 affixId(任意数值)平均要几次 —— 词条转移的定价参照。
 * 一阶近似:单次命中率 ≈ 平均新抽条数 × 该条权重 ÷ 池总权重(真实命中率略高;对账见 affixTransferEconomy.spec)。
 * 须与 reforgeEquipment 的条数与抽取规则同步。洗不出(模板缺失、部位或品质不合)返回 Infinity。
 */
export function expectedRollsToHit(inst: EquipmentInstance, affixId: string, keptIds: readonly string[]): number {
  const template = equipmentTemplate(inst.templateId)
  const def = affixDef(affixId)
  if (!template || !def) return Infinity
  const quality = qualityDef(inst.quality)
  if (affixFitBlock(def, template.slot, quality.rank) !== null) return Infinity
  const kept = new Set(keptIds)
  const poolWeight = AFFIXES.filter(a => !kept.has(a.id) && affixFitBlock(a, template.slot, quality.rank) === null).reduce(
    (sum, a) => sum + a.weight,
    0
  )
  if (poolWeight <= 0) return Infinity
  const [lo, hi] = quality.affixes
  let fresh = 0
  for (let c = lo; c <= hi; c += 1) fresh += Math.max(kept.size + 1, c) - kept.size
  fresh /= hi - lo + 1
  return 1 / Math.min(1, (fresh * def.weight) / poolWeight)
}

// ---------- 自动重铸 ----------

/** 自动重铸的停止条件:命中任一目标即收手 */
export interface ReforgeTarget {
  affixId: string
  /** 最低 roll(0~1);不填 = 只要出现这个词条就行 */
  minRoll?: number
}

/** 这件装备当前是否命中任一目标;命中返回那一条 */
export function refRoleMatches(inst: EquipmentInstance, targets: readonly ReforgeTarget[]): { id: string; roll: number } | null {
  for (const t of targets) {
    const hit = inst.affixes.find(a => a.id === t.affixId && (t.minRoll === undefined || a.roll >= t.minRoll))
    if (hit) return { id: hit.id, roll: hit.roll }
  }
  return null
}

export type AutoReforgeStop = 'target' | 'budget' | 'broke' | 'frozen'

export interface AutoReforgeOutcome {
  /** 实际洗了几次 */
  rolls: number
  /** 这几次的灵石账 */
  stone: GNum
  /** 这几次的器灵尘账 */
  dust: number
  stop: AutoReforgeStop
  /** stop === 'broke' 时缺的是哪一样 */
  short?: 'stone' | 'dust'
  /** 命中目标的那一条;没洗到为 null */
  hit: { id: string; roll: number } | null
}

/**
 * 自动重铸:至多重铸 maxRolls 次,洗出任一目标词条即停;逐次与手动连点等价,只是提示合成一条。
 * 停法:target 洗出目标 · budget 洗满预算 · broke 灵石/器灵尘见底 · frozen 全封存或已不存在。
 */
export function autoReforge(uid: string, targets: readonly ReforgeTarget[], maxRolls: number): AutoReforgeOutcome {
  const inventory = useInventoryStore()
  let stone = gnZero()
  let dust = 0
  // 无目标:收手,不烧预算(服务层自守,不靠面板禁用按钮)
  if (targets.length === 0) {
    return { rolls: 0, stone, dust, stop: 'budget', hit: null }
  }
  const initial = inventory.findItem(uid)
  if (initial) {
    const hit = refRoleMatches(initial, targets)
    if (hit) return { rolls: 0, stone, dust, stop: 'target', hit }
  }
  for (let i = 0; i < maxRolls; i += 1) {
    const inst = inventory.findItem(uid)
    const cost = inst && reforgeCost(inst)
    if (!inst || !cost) return { rolls: i, stone, dust, stop: 'frozen', hit: null }
    const short = reforgeShort(cost)
    if (short) {
      return { rolls: i, stone, dust, stop: 'broke', short, hit: null }
    }
    if (!reforgeEquipment(uid, true)) {
      return { rolls: i, stone, dust, stop: 'frozen', hit: null }
    }
    stone = add(stone, cost.stone)
    dust += cost.dust
    const after = inventory.findItem(uid)
    if (!after) return { rolls: i + 1, stone, dust, stop: 'frozen', hit: null }
    const hit = refRoleMatches(after, targets)
    if (hit) return { rolls: i + 1, stone, dust, stop: 'target', hit }
  }
  return { rolls: maxRolls, stone, dust, stop: 'budget', hit: null }
}
