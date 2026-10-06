/**
 * 词条转移(议题 #22)—— 把一条词条从源件抽出,原样({id, roll})落到另一件装备上。
 *
 * 规则(界面的禁用态、价签与服务执行只认本文件的判据,不另写一份):
 *   · 一次一条,必定成功。源件保留,只少这一条 —— 不销毁:销毁时的分解返还几乎抵掉代价,
 *     刹不住什么,反倒带来拒装备、拒上锁、静默卸下、构筑缺件一串坑。
 *     已装备、已上锁、带封存的源件都能转出;被转那条的封存不随行。
 *   · 部位与品质:与掉落、重铸同一判据 affixFitBlock。
 *   · 落位:新增(目标未满),或顶替目标上任意一条;顶替已封存的条时新条沿用封存,
 *     封存数不变(词条本身可自行解封 —— reforge.unsealAffix —— 转移不代劳;
 *     要换掉一条封过的平庸词条,先在目标上解封它再转)。
 *   · 同 id 只能覆盖它自己,且数值须更高 —— 永不出现重复 id。
 *   · 递减属性(DIMINISH_KEYS)不新增叠加:件内同属性先相加、件与件之间才递减,
 *     把暴击、吸血之类集中到一件上就绕开了递减;非递减属性照掉落规则可以并存。
 *   · 「同时封存」可选,费用与手动封存同一函数 sealCost:转完一点重铸,未封的这条就会被洗掉。
 *   · 价格:见 constants.TRANSFER_PRICE_RATE;灵石按目标阶。转移花费不计入 invested
 *     (否则分解多出一条返还渠道),也不记计数、不长技艺。
 */
import type { AffixRoll, AnyStatKey, EquipmentInstance, GNum } from '@/types'
import { affixDef, affixFitBlock, affixValue } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import { DIMINISH_KEYS, REFORGE_DUST_BASE, REFORGE_SEAL_LOAD, REFORGE_STONE_BASE, TRANSFER_PRICE_RATE } from '@/data/constants'
import { add } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { playSfx } from './audio'
import { expectedRollsToHit, sealCost } from './reforge'
import { sortAffixLines } from './equipGen'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { TRANSFER_LABELS, transferBlockText, transferDoneToast, transferShortText } from '@/ui/affixTransferText'

export type TransferBlock =
  | 'same'
  | 'noAffix'
  | 'noTemplate'
  | 'slot'
  | 'rank'
  | 'dup'
  | 'noLanding'
  | 'full'
  | 'stack'
  | 'sealFull'

/** 落地后新条的封存:沿用被顶替条的封存 / 付费同时封存 / 不封 */
export type SealMode = 'inherit' | 'paid' | 'none'

/** 缺哪一样资源(null = 付得起) */
export type TransferShort = 'stone' | 'dust' | null

export interface TransferCost {
  /** 灵石总价(含同时封存那一笔) */
  stone: GNum
  dust: number
  /** 其中同时封存的那一笔;沿用封存或不封为 null */
  sealStone: GNum | null
}

export interface TransferPlan {
  /** 抽走后的源件(新对象) */
  source: EquipmentInstance
  /** 落地后的目标件(新对象) */
  target: EquipmentInstance
  moved: AffixRoll
  /** 被顶替 / 覆盖的那条;新增为 null */
  replaced: AffixRoll | null
  sealMode: SealMode
  /** 不沿用封存时,这一次能否付费同时封存(开关的可用态) */
  canSeal: boolean
  cost: TransferCost
}

export type TransferCheck = { ok: true; plan: TransferPlan } | { ok: false; block: TransferBlock }

export interface TransferRequest {
  sourceUid: string
  targetUid: string
  affixId: string
  /** 顶替目标上的哪一条;null = 新增 */
  replaceId: string | null
  /** 同时封存(沿用封存时忽略) */
  seal: boolean
}

export interface TransferCandidate {
  item: EquipmentInstance
  worn: boolean
  /**
   * null = 可选;其余置灰列出:
   * 'dup' 目标已有这条且不更低;'rank' 同部位但品质不够(玩家会找「我那件新的怎么不在」)
   */
  block: 'dup' | 'rank' | null
}

export interface TransferLanding {
  /** null = 新增 */
  replaceId: string | null
  check: TransferCheck
}

const DIMINISH = new Set<AnyStatKey>(DIMINISH_KEYS)

/**
 * 目标件接不接得了这一条(不看落位)—— 候选列表用;planTransfer 的前半段就是它。
 */
export function targetBlock(source: EquipmentInstance, target: EquipmentInstance, affixId: string): TransferBlock | null {
  if (source.uid === target.uid) return 'same'
  const moved = source.affixes.find(a => a.id === affixId)
  const def = affixDef(affixId)
  if (!moved || !def) return 'noAffix'
  const template = equipmentTemplate(target.templateId)
  if (!template) return 'noTemplate'
  const fit = affixFitBlock(def, template.slot, qualityDef(target.quality).rank)
  if (fit) return fit
  const same = target.affixes.find(a => a.id === affixId)
  if (same && affixValue(def, moved.roll) <= affixValue(def, same.roll)) return 'dup'
  return null
}

/** 落地后某个递减属性的条数会不会变多(顶替同属性那条不算变多) */
function stacksDiminish(key: AnyStatKey, affixes: readonly AffixRoll[], replaced: AffixRoll | null): boolean {
  if (!DIMINISH.has(key)) return false
  const before = affixes.filter(a => affixDef(a.id)?.key === key).length
  const freed = replaced !== null && affixDef(replaced.id)?.key === key ? 1 : 0
  return before - freed + 1 > Math.max(1, before)
}

/** 折几次无封存重铸:0.6 × (1 + 0.6 × 保留条数) × 洗出它的期望次数 */
function priceTimes(target: EquipmentInstance, affixId: string, keptIds: readonly string[]): number {
  return TRANSFER_PRICE_RATE * (1 + REFORGE_SEAL_LOAD * keptIds.length) * expectedRollsToHit(target, affixId, keptIds)
}

/**
 * 成不成立、结果是什么、花多少 —— 纯函数,不读也不改 store。
 * 界面的禁用态、价签与服务执行都只认它。
 */
export function planTransfer(
  source: EquipmentInstance,
  target: EquipmentInstance,
  affixId: string,
  replaceId: string | null,
  seal: boolean
): TransferCheck {
  const early = targetBlock(source, target, affixId)
  if (early) return { ok: false, block: early }
  const moved = source.affixes.find(a => a.id === affixId)!
  const def = affixDef(affixId)!
  // 同 id 只能覆盖它自己(targetBlock 已保证数值更高)
  if (target.affixes.some(a => a.id === affixId) && replaceId !== affixId) return { ok: false, block: 'dup' }
  const replaced = replaceId === null ? null : (target.affixes.find(a => a.id === replaceId) ?? null)
  if (replaceId !== null && replaced === null) return { ok: false, block: 'noLanding' }
  if (replaced === null && target.affixes.length >= qualityDef(target.quality).affixes[1]) return { ok: false, block: 'full' }
  if (stacksDiminish(def.key, target.affixes, replaced)) return { ok: false, block: 'stack' }

  const landed: AffixRoll = { id: affixId, roll: moved.roll }
  const affixes = replaced ? target.affixes.map(a => (a.id === replaced.id ? landed : a)) : [...target.affixes, landed]
  // 封存表先去重,再只留**落地前**确实在身、且不是被顶替那条的 id。
  // 按落地后的词条过滤会出事:残留的封存 id 恰好等于转入那条时,它会白得封存(或封存表重复)
  const before = new Set(target.affixes.map(a => a.id))
  const prevSeals = [...new Set(target.sealedAffixIds ?? [])]
  const inherit = replaced !== null && prevSeals.includes(replaced.id)
  const keptSeals = prevSeals.filter(id => id !== replaced?.id && before.has(id))
  const unsealed: EquipmentInstance = { ...target, affixes, sealedAffixIds: keptSeals }
  // 与手动封存同一函数;已封满(须留一个可重掷位)时为 null
  const sealFee = inherit ? null : sealCost(unsealed)
  if (!inherit && seal && sealFee === null) return { ok: false, block: 'sealFull' }
  const sealMode: SealMode = inherit ? 'inherit' : seal ? 'paid' : 'none'

  const keptIds = affixes.filter(a => a.id !== affixId).map(a => a.id)
  const times = priceTimes(target, affixId, keptIds)
  const transferStone = stoneByTier(target.tier, REFORGE_STONE_BASE * times)
  const sealStone = sealMode === 'paid' ? sealFee : null
  return {
    ok: true,
    plan: {
      source: {
        ...source,
        affixes: source.affixes.filter(a => a.id !== affixId),
        sealedAffixIds: (source.sealedAffixIds ?? []).filter(id => id !== affixId)
      },
      target: {
        ...unsealed,
        sealedAffixIds: sealMode === 'none' ? keptSeals : [...keptSeals, affixId],
        transferCount: (target.transferCount ?? 0) + 1
      },
      moved: landed,
      replaced,
      sealMode,
      canSeal: sealFee !== null,
      cost: {
        stone: sealStone ? add(transferStone, sealStone) : transferStone,
        dust: Math.round(REFORGE_DUST_BASE * times),
        sealStone
      }
    }
  }
}

/** 缺哪一样 —— 主按钮的禁用态与服务同一处 */
export function transferShort(cost: TransferCost): TransferShort {
  const resources = useResourcesStore()
  if (!resources.hasStone(cost.stone)) return 'stone'
  if (!resources.hasSmall('dust', cost.dust)) return 'dust'
  return null
}

/**
 * 能接这一条的目标件:可选在前 → 已装备在前 → 与源件同部位在前 → 品质高、阶高在前。
 * 部位不合的件不列出;已有这条且不更低的、同部位但品质不够的,列出置灰(写明原因)。
 */
export function transferCandidates(source: EquipmentInstance, affixId: string): TransferCandidate[] {
  const inventory = useInventoryStore()
  const sourceSlot = equipmentTemplate(source.templateId)?.slot
  const sameSlot = (item: EquipmentInstance): boolean => equipmentTemplate(item.templateId)?.slot === sourceSlot
  return inventory.items
    .map(item => ({ item, worn: inventory.equippedUids.has(item.uid), block: targetBlock(source, item, affixId) }))
    .filter((c): c is TransferCandidate => c.block === null || c.block === 'dup' || (c.block === 'rank' && sameSlot(c.item)))
    .sort((a, b) => {
      if ((a.block === null) !== (b.block === null)) return a.block === null ? -1 : 1
      if (a.worn !== b.worn) return a.worn ? -1 : 1
      if (sameSlot(a.item) !== sameSlot(b.item)) return sameSlot(a.item) ? -1 : 1
      const dq = qualityDef(b.item.quality).rank - qualityDef(a.item.quality).rank
      if (dq !== 0) return dq
      return b.item.tier - a.item.tier || a.item.uid.localeCompare(b.item.uid)
    })
}

/**
 * 目标件上的落位:「新增」在前,其后是目标词条(按展示序倒排 —— 常见、低值的先顶);
 * 成立的排前,被挡的排后。每一项都带 planTransfer 的结论(不封存口径),价签与禁用态由它给。
 */
export function transferLandings(source: EquipmentInstance, target: EquipmentInstance, affixId: string): TransferLanding[] {
  const options: (string | null)[] = [null, ...[...sortAffixLines(target.affixes)].reverse().map(a => a.id)]
  const rows = options.map(replaceId => ({ replaceId, check: planTransfer(source, target, affixId, replaceId, false) }))
  return [...rows.filter(r => r.check.ok), ...rows.filter(r => !r.check.ok)]
}

/** 服务:全部校验 → 扣费 → 写目标 → 写源件。同步执行,任何一步被拒都一笔不扣、一处不改 */
export function transferAffix(req: TransferRequest): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const source = inventory.findItem(req.sourceUid)
  const target = inventory.findItem(req.targetUid)
  if (!source || !target) {
    playSfx('warn')
    ui.toast(TRANSFER_LABELS.gone, 'warn')
    return false
  }
  const check = planTransfer(source, target, req.affixId, req.replaceId, req.seal)
  if (!check.ok) {
    playSfx('warn')
    ui.toast(transferBlockText(check.block, req.affixId), 'warn')
    return false
  }
  const short = transferShort(check.plan.cost)
  if (short) {
    playSfx('warn')
    ui.toast(transferShortText(short), 'warn')
    return false
  }
  resources.spendStone(check.plan.cost.stone)
  resources.spendSmall('dust', check.plan.cost.dust)
  inventory.replaceItem(check.plan.target)
  inventory.replaceItem(check.plan.source)
  playSfx('success') // 词条易地,一声落地
  ui.toast(transferDoneToast(affixDef(req.affixId)?.name ?? req.affixId), 'success')
  return true
}
