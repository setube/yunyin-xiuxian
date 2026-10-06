/**
 * 装备重铸与词条封存
 *
 * 灵石的长期 sink,直接连接 Build:
 * - **重铸**:把**未封存**的词条推倒重来 —— 条数按品质区间重掷(至少给一条新的),
 *   数值全部重掷;品质、阶数、强化等级都不动。**不限次数**。
 * - **封存**:付费永久锁定一个词条,重铸不会碰它;每一件至少留一个可重掷位。
 *
 * 成本只与**装备阶数**和**封存数**挂钩(见 data/constants 的注释):
 * 想保住好词条就得付溢价 —— 「洗得越多越贵」由「你保护了多少」表达,
 * 而不是由一个与装备无关的次数计数器表达。
 *
 * 原则:不为消耗而消耗——每一笔花销都在改变构筑,而非购买数值。
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
import { add, gnZero } from '@/utils/gnum'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import {
  reforgeDoneToast,
  reforgeEmptyToast,
  reforgeSealedNote,
  reforgeShortToast,
  sealDoneToast,
  sealMustLeaveToast,
  sealShortToast
} from '@/ui/reforgeText'

export interface ReforgeCost {
  stone: GNum
  dust: number
}

/**
 * 自动重铸可同时设为目标的最大词条数。
 * 命中其一即停,故目标是「这批里洗到哪一个都算数」的并集;上限太小翻不中要的,
 * 太大又稀释成本 —— 面向玩家的文案(已选 X/3)与守卫逻辑都必须读它,不许各自手写。
 */
export const AUTO_REFORGE_MAX_TARGETS = 3

/**
 * 重铸成本:灵石 = stoneByTier(阶数) × (1 + 封存数 × REFORGE_SEAL_LOAD);
 * 器灵尘 = REFORGE_DUST_BASE × (1 + 封存数)。
 *
 * 没有次数项,也没有上限:同一件、同一封存数,第一次与第两百次一个价。
 * 无可重铸余地(全封存)时返回 null —— 这是唯一的"不能再炼"。
 * 模板缺失(只可能是坏档)也返回 null:抽取池要按部位过滤,不知部位就不洗 ——
 * 与自动重铸候选在模板缺失时为空同判,界面不出重铸钮、服务也不洗。
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

/**
 * 一件装备还能封存几个词条 —— 至少要留一个可重掷位。
 * 判据与界面共用这一处,免得两边各算一遍(封存上限变了,有一边忘了跟)。
 */
export function sealCapacity(inst: EquipmentInstance): number {
  return Math.max(0, inst.affixes.length - 1)
}

/**
 * 重铸:把未封存的词条全部推倒重来。
 *
 * 「重铸」此前是**换掉一条**词条,条数不动 —— 而一件 3 条的凡品与一件 6 条的神品,
 * 差的从来不只是数值,是**能凑出几种搭配**。所以重铸要连条数一起重掷:
 *   新条数 = 品质区间内随机,但不少于「封存数 + 1」(每次重铸都至少给你一条新的);
 *   封存的原样留着,其余全部换成新词条、新掷点。
 * 品质、阶数、强化等级一概不动 —— 重铸的是一件的「词条构成」,不是它的出身。
 */
/**
 * 重铸一键(quiet=true 供自动重铸用:逐次洗照常结算,提示由自动那层合为一次)。
 */
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
  if (!resources.hasStone(cost.stone) || !resources.hasSmall('dust', cost.dust)) {
    if (!quiet) {
      playSfx('warn')
      ui.toast(reforgeShortToast(), 'warn')
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

  // 条数:品质区间内重掷,但不低于「封存数 + 1」(总得留一条新的给它重掷)
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
  // 重铸也是炼器:上头一味矿材作「上手过」(矿石通晓/锻造技艺的唯一活水);
  // 重铸更是刻纹 —— 铭纹技艺此前定义了却从没人涨过(玩家反馈「铭纹熟练度老版本为0,
  // 新版本没看到新系统」),真正「刻纹引灵」的活儿就该长这门手艺
  noteSmithingUsed(inst.tier, true)
  useLoreStore().addSkillExp('inscribe', 10 * (1 + inst.tier * 0.2))

  const sealedNote = reforgeSealedNote(kept.length)
  const countNote = before === affixes.length ? `${affixes.length} 条` : `${before} → ${affixes.length} 条`
  if (!quiet) {
    playSfx('success')
    ui.toast(reforgeDoneToast(countNote, sealedNote), 'success')
  }
  return true
}

/** 封存成本:第 n 次封存 = 基础 × n(灵石按装备层级换算) */
export function sealCost(inst: EquipmentInstance): GNum | null {
  const sealed = inst.sealedAffixIds ?? []
  // 至少留一个可随机位,封满则不可再封
  if (sealed.length >= sealCapacity(inst)) return null
  return stoneByTier(inst.tier, SEAL_STONE_BASE * (sealed.length + 1))
}

/** 封存一个词条:重铸永不替换之 */
export function sealAffix(uid: string, affixId: string): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
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
  if (!resources.hasStone(cost)) {
    ui.toast(sealShortToast(), 'warn')
    return false
  }
  resources.spendStone(cost)
  inventory.replaceItem({ ...inst, sealedAffixIds: [...(inst.sealedAffixIds ?? []), affixId] })
  const name = affixDef(affixId)?.name ?? '词条'
  ui.toast(sealDoneToast(name), 'success')
  return true
}

/**
 * 「保留 keptIds、其余重铸」时,在这件上洗出 affixId(任意数值)平均要几次 —— 词条转移的定价参照。
 *
 * 照 reforgeEquipment 的规则推:每次新抽 max(保留+1, 区间内条数) − 保留 条,
 * 从同一个池子(部位、品质合规且不在保留里)按权重抽。一阶近似:
 * 单次命中率 ≈ 平均新抽条数 × 该条权重 ÷ 池总权重(无放回抽取让真实命中率略高,
 * 与真重铸对账见 affixTransferEconomy.spec)。
 * 改重铸的条数或抽取规则时,这里要跟着改 —— 那边的审计会先红。
 * 洗不出(模板缺失、部位或品质不合)返回 Infinity。
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

// ---------- 自动重铸(玩家反馈:一键重铸多次,洗到指定词条就停) ----------

/** 自动重铸的停止条件:出现「id 命中且 roll ≥ minRoll(未给则任意值)」即收手 */
export interface ReforgeTarget {
  affixId: string
  /** 要求的最低 roll(0~1;不填 = 只要出现这个词条就行) */
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
  /** 命中目标的那一条(null = 没洗到,撞了预算/没钱/无位可洗) */
  hit: { id: string; roll: number } | null
  /** 收手时这件装备的词条 id 全表 */
  affixIds: string[]
}

/**
 * 自动重铸:至多重铸 maxRolls 次,洗出任一目标词条(可带最低 roll)即停。
 * 逐次与手动连点完全等价 —— 每洗一次照常消耗与长技艺,只是提示合成一条。
 * 停法:
 * - target  洗出目标,收手;
 * - budget  洗满预算也没出,收手(不硬刷);
 * - broke   灵石/器灵尘见底,收手;
 * - frozen  这件已无位可洗(全封存)或已不存在。
 */
export function autoReforge(uid: string, targets: readonly ReforgeTarget[], maxRolls: number): AutoReforgeOutcome {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  let stone = gnZero()
  let dust = 0
  // 一个目标都没给:收手,不烧预算 —— 面板上按钮禁用只是挡层,服务本身不当
  if (targets.length === 0) {
    return { rolls: 0, stone, dust, stop: 'budget', hit: null, affixIds: [] }
  }
  // 装备已含目标词条:分文不动,直接收手 —— 别花一次重铸把已到手的条件洗没
  const initial = inventory.findItem(uid)
  if (initial) {
    const hit = refRoleMatches(initial, targets)
    if (hit) return { rolls: 0, stone, dust, stop: 'target', hit, affixIds: initial.affixes.map(a => a.id) }
  }
  for (let i = 0; i < maxRolls; i += 1) {
    const inst = inventory.findItem(uid)
    const cost = inst && reforgeCost(inst)
    if (!inst || !cost) return { rolls: i, stone, dust, stop: 'frozen', hit: null, affixIds: [] }
    if (!resources.hasStone(cost.stone) || !resources.hasSmall('dust', cost.dust)) {
      return { rolls: i, stone, dust, stop: 'broke', hit: null, affixIds: inst.affixes.map(a => a.id) }
    }
    if (!reforgeEquipment(uid, true)) {
      return { rolls: i, stone, dust, stop: 'frozen', hit: null, affixIds: inst.affixes.map(a => a.id) }
    }
    stone = add(stone, cost.stone)
    dust += cost.dust
    const after = inventory.findItem(uid)
    if (!after) return { rolls: i + 1, stone, dust, stop: 'frozen', hit: null, affixIds: [] }
    const hit = refRoleMatches(after, targets)
    if (hit) return { rolls: i + 1, stone, dust, stop: 'target', hit, affixIds: after.affixes.map(a => a.id) }
  }
  const last = inventory.findItem(uid)
  return {
    rolls: maxRolls,
    stone,
    dust,
    stop: 'budget',
    hit: null,
    affixIds: last ? last.affixes.map(a => a.id) : []
  }
}
