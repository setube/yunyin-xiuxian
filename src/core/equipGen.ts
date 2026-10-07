/**
 * 装备生成与数值解析 —— Template + 随机品质 + 随机词条 → Instance
 */
import type { AffixDef, AffixRarity, AnyStatKey, EquipmentInstance, EquipmentTemplate, EquipSlot, GNum, QualityDef, StatMods } from '@/types'
import type { RandomService } from '@/utils/random'
import { uid } from '@/utils/id'
import { gnZero, mulN, add } from '@/utils/gnum'
import { AFFIXES, AFFIX_RARITY_RANK, affixDef, affixFitBlock, affixValue } from '@/data/affixes'
import { EQUIPMENT_TEMPLATES, equipmentTemplate } from '@/data/equipment'
import { isRareQuality, PROFOUND_RANK, QUALITIES, qualityDef } from '@/data/qualities'
import {
  EQUIP_BASE_FACTOR,
  EQUIP_LEVEL_BONUS,
  EQUIP_QUALITY_FLAT_EXP,
  QUALITY_OUT_OF_BAND,
  QUALITY_TIER_SHIFT
} from '@/data/constants'
import { powerScale } from './formulas'

export interface GenOptions {
  slot?: EquipSlot
  /**
   * 品质下限。**只要给了(哪怕是 0)就不吃品质窗口** —— 那是首领/秘境/际遇的剧情例外。
   * 普通掉落别传:在线普通战曾传 0,窗口整个失效,低阶高品比离线、比审计多掉一截
   * (dropQualityWindow.spec 守着)。
   */
  minQualityRank?: number
  /** 气运(提高高品质权重) */
  luck?: number
}

/** 九个可掉落槽位(法宝是另一套池子,见 artifacts) */
const DROP_SLOTS: EquipSlot[] = [
  'weapon',
  'head',
  'body',
  'wrist',
  'belt',
  'boots',
  'necklace',
  'ring',
  'talisman'
]

/**
 * 模板按 (tier, slot) 预索引 —— 生成装备是热路径(每掉一件都全表 filter 288 件),
 * 静态数据进模块起就摊好,不再每次掉落都重扫整张表。
 */
const TEMPLATES_BY_TIER_SLOT = new Map<string, EquipmentTemplate[]>()
/** 各槽位按阶降序的阶表(退档兜底懒算一次就缓存) */
const TIERS_BY_SLOT = new Map<EquipSlot, number[]>()
for (const t of EQUIPMENT_TEMPLATES) {
  const key = `${t.tier}:${t.slot}`
  const arr = TEMPLATES_BY_TIER_SLOT.get(key)
  if (arr) arr.push(t)
  else TEMPLATES_BY_TIER_SLOT.set(key, [t])
}

/**
 * 词条按 (slot, qualityRank) 预筛资格 —— 生成词条是热路径(每件每词条都全表
 * filter 113 条),资格判定是纯静态的(affixFitBlock),进模块起摊好即可。
 */
const AFFIX_POOL_BY_SLOT_RANK = new Map<string, AffixDef[]>()
{
  let maxRank = 0
  for (const q of QUALITIES) if (q.rank > maxRank) maxRank = q.rank
  for (const slot of DROP_SLOTS) {
    for (let rank = 0; rank <= maxRank; rank += 1) {
      AFFIX_POOL_BY_SLOT_RANK.set(
        `${slot}:${rank}`,
        AFFIXES.filter(a => affixFitBlock(a, slot, rank) === null)
      )
    }
  }
}

/**
 * 品质按下限预索引 —— rollQuality 每掉一件都按 floor 全表 filter 9 档,
 * 池子是纯静态的(只与 rank 下限有关),进模块起摊好即可。
 */
const QUALITIES_BY_FLOOR: QualityDef[][] = []
{
  let maxRank = 0
  for (const q of QUALITIES) if (q.rank > maxRank) maxRank = q.rank
  for (let floor = 0; floor <= maxRank; floor += 1) {
    QUALITIES_BY_FLOOR.push(QUALITIES.filter(q => q.rank >= floor))
  }
}

/**
 * 某槽位在某层级下的模板 —— **按阶取,不累积**。
 *
 * 从前这里是「minTier ≤ 层级」的累积池再取最近的几件,于是 13 阶的地界照样掉得出
 * 8 阶的星辰冠:同一个名字顶着不同的数字出现,名字就失去了分辨力(见 data/equipment 头注)。
 * 现在一件只属于一阶 —— 与「一阶一名」配套,看到名字就知道是哪一阶的东西。
 */
function templatesAtTier(tier: number, slot: EquipSlot): EquipmentTemplate[] {
  return TEMPLATES_BY_TIER_SLOT.get(`${tier}:${slot}`) ?? []
}

/** 每槽位按阶降序的完整阶表(仅供退档兜底用) */
function tiersForSlot(slot: EquipSlot): number[] {
  const cached = TIERS_BY_SLOT.get(slot)
  if (cached) return cached
  const tiers = [...new Set(EQUIPMENT_TEMPLATES.filter(t => t.slot === slot).map(t => t.tier))].sort((a, b) => b - a)
  TIERS_BY_SLOT.set(slot, tiers)
  return tiers
}

/**
 * 取某阶某槽的模板;该阶若一件都没有,退到最近的一阶(先往下找,再往上)。
 *
 * 这道兜底**不该被走到**:realmNaming.spec 钉着「每阶每部位都有本阶名目」。
 * 留着它是为了让「哪天有人挪掉一阶的内容」表现为一次退档掉落,而不是在
 * rng.weighted(空池) 上抛错——掉错一件东西,总好过整局卡死在结算里。
 */
function templatesForDrop(tier: number, slot: EquipSlot) {
  const here = templatesAtTier(tier, slot)
  if (here.length > 0) return here
  const tiers = tiersForSlot(slot)
  const fallback = tiers.find(t => t < tier) ?? tiers[tiers.length - 1]
  return fallback === undefined ? [] : templatesAtTier(fallback, slot)
}

/**
 * 某层级(可选槽位)下真正进池的装备模板。
 *
 * 抽出来独立成函数不是为了好看 —— 判据要能**直接问池子**:
 * 「这 288 件里,有没有哪件在任何层级都进不了池?」池子藏在生成器内部时,
 * 这种问题只能靠反复抽样去猜,而抽样永远证明不了「掉不出来」。
 *
 * 不指定槽位时按槽位分组(九个槽位一视同仁),而不是把整阶的九件混作一堆 ——
 * 混作一堆时,表里哪个槽位多写了一件,那一件就会挤掉别的槽位的出场机会。
 */
export function equipTemplatePool(tier: number, slot?: EquipSlot) {
  if (slot !== undefined) return templatesForDrop(tier, slot)
  return DROP_SLOTS.flatMap(s => templatesForDrop(tier, s))
}

/**
 * 品质随机:层级越高、气运越高,高品质权重越大。
 *
 * 权重 = 基础权重 × 层级加成 × 气运加成 × 窗口系数。
 * 窗口系数来自品质自己的 [fromTier, toTier](见 data/qualities):
 * 窗口内 ×1,窗口外 ×QUALITY_OUT_OF_BAND —— 神品从神界/混沌海长出来,
 * 而不是青云山麓抽奖抽到的;同时高品也不至于「越往后越见不到」(旧口径下,
 * 混沌海掉落里 35% 是玄品、神品只有 0.09%,刷到顶也不见一件神品)。
 *
 * 显式给了 minQualityRank(首领/秘境/际遇)时**不吃窗口** —— 那是剧情给的例外,
 * 由调用方负责;否则「人间界的仙缘」会被一条掉落规则挡掉。
 */
export function rollQuality(tier: number, rng: RandomService, opts: GenOptions = {}): QualityDef {
  const floor = opts.minQualityRank ?? 0
  const pool = QUALITIES_BY_FLOOR[floor] ?? QUALITIES
  return rng.weighted(pool, q => qualityWeightAt(q, tier, opts))
}

/**
 * 某一档品质在某层级的掉落权重 —— **掉落与审计共用这一处**。
 *
 * 抽出来不是为了好看:平衡审计要问「这个层级的玩家,身上通常是哪一档品质」,
 * 而这个问题只能用同一份权重来答。审计若自己再写一份近似公式,
 * 那么改了窗口、改了层阶加成之后,审计还在按旧口径夸人(或骂人)。
 */
export function qualityWeightAt(q: QualityDef, tier: number, opts: GenOptions = {}): number {
  const luck = opts.luck ?? 0
  if (q.rank === 0) return q.weight * bandFactor(q, tier, opts)
  const tierBoost = Math.pow(QUALITY_TIER_SHIFT, (tier - 1) * Math.min(q.rank, PROFOUND_RANK) * 0.35)
  const luckBoost = 1 + luck * (isRareQuality(q) ? 1.5 : 0.5)
  return q.weight * tierBoost * luckBoost * bandFactor(q, tier, opts)
}

/**
 * 品质窗口系数:窗口内 1;窗口外按**离窗口的距离**指数衰减
 * (差一档 ×0.1、差两档 ×0.01…见 constants.QUALITY_OUT_OF_BAND)。
 * 显式指定了品质下限(首领/秘境/际遇)时不吃窗口 —— 那是剧情给的例外。
 */
function bandFactor(q: QualityDef, tier: number, opts: GenOptions): number {
  if (opts.minQualityRank !== undefined) return 1
  const distance = Math.max(0, q.fromTier - tier, tier - q.toTier)
  return distance === 0 ? 1 : Math.pow(QUALITY_OUT_OF_BAND, distance)
}

/** 生成一件装备实例 */
export function generateEquipment(tier: number, rng: RandomService, opts: GenOptions = {}): EquipmentInstance {
  // 未指定槽位:九个槽位一视同仁(掉了什么槽位,不该由表的行序决定),
  // 槽位之内若还有多件(同阶同槽的备用名目),按各自权重挑。
  const slot = opts.slot ?? DROP_SLOTS[Math.min(DROP_SLOTS.length - 1, rng.int(0, DROP_SLOTS.length - 1))]!
  const eligible = equipTemplatePool(tier, slot)
  // 同阶同槽通常只有一件;万一有多件,按旗鼓相当的权重挑
  const template = rng.weighted(eligible, () => 1)

  const quality = rollQuality(tier, rng, opts)
  const [minA, maxA] = quality.affixes
  const affixCount = rng.int(minA, maxA)

  const chosen: { id: string; roll: number }[] = []
  // 每轮只在单份工作数组上顺序划掉已选词条,不再逐轮 filter 一份新数组(最多 9 轮 × 全表)
  const candidates = AFFIX_POOL_BY_SLOT_RANK.get(`${template.slot}:${quality.rank}`)?.slice() ?? []
  let guard = 0
  while (chosen.length < affixCount && guard < 50 && candidates.length > 0) {
    guard += 1
    const picked = rng.weighted(candidates, a => a.weight)
    chosen.push({ id: picked.id, roll: rng.next() })
    // 保序删除:rng.weighted 的命中依赖数组序,原位 splice 才能与「逐轮 filter 去重」逐字节等价
    const idx = candidates.indexOf(picked)
    if (idx >= 0) candidates.splice(idx, 1)
  }

  return {
    uid: uid(),
    templateId: template.id,
    quality: quality.id,
    tier,
    level: 0,
    affixes: chosen
  }
}

export interface ResolvedEquipStats {
  flats: { attack: GNum; defense: GNum; maxHp: GNum }
  mods: StatMods
  /**
   * 词条展示行 —— **已是展示序**(见 sortAffixLines),不是掷出的先后。
   * 掷出的顺序是随机的,照着印出来等于把「哪条要紧」交给运气。
   *
   * 每行除了整句 desc,还把数值切成 before / value / after 三段
   * (按词条定义里那一处 `{v}` 切)。理由是排版:一列词条要能**扫**——
   *   「锋锐」 常见   攻击提升 **4.2%**
   *   「洞虚」 传世   攻击时无视目标 **8%** 防御
   * 数值单独拎出来,界面才好右对齐、加粗;只给整句的话,
   * 每行长短不一,玩家对比的是句子长度而不是数字。
   */
  affixLines: {
    id: string
    name: string
    /** 整句(数值已代入)—— 说得出这条管什么 */
    desc: string
    /** 数值之前的话(如「攻击提升 」) */
    before: string
    /** 数值本身(如「4.2」) */
    value: string
    /** 数值之后的话(如「%」) */
    after: string
    rarity: AffixRarity
    /**
     * 随机浮动(0~1,取自实例上实际存着的 roll)。
     * 显示「浮 X%」让玩家分得清一条满掷与一条贴底 —— 封存/重铸的取舍
     * 全靠它跟词条数上限两个数成账,藏起来就是让玩家瞎赌。
     */
    roll: number
  }[]
}

/**
 * 词条展示序:先稀有的(传世 → 常见),同稀有度先看掷得满的,最后按 id 稳定。
 *
 * 判据:玩家扫一眼装备卡片,第一条就该是这件东西最值钱的地方。
 * 稀有度写在词条定义里(权重推出来的),成色就是这一件的 roll —— 两者都是既有数据。
 */
export function sortAffixLines<T extends { id: string; roll: number }>(rolls: readonly T[]): T[] {
  return [...rolls].sort((a, b) => {
    const ra = AFFIX_RARITY_RANK[affixDef(a.id)?.rarity ?? 'common']
    const rb = AFFIX_RARITY_RANK[affixDef(b.id)?.rarity ?? 'common']
    return rb - ra || b.roll - a.roll || a.id.localeCompare(b.id)
  })
}

/** 解析装备实例的实际数值 */
export function resolveEquipStats(inst: EquipmentInstance): ResolvedEquipStats {
  const template = equipmentTemplate(inst.templateId)
  const flats = { attack: gnZero(), defense: gnZero(), maxHp: gnZero() }
  const mods: StatMods = {}
  const affixLines: ResolvedEquipStats['affixLines'] = []
  if (!template) return { flats, mods, affixLines }

  const q = qualityDef(inst.quality)
  const scale = powerScale(inst.tier)
  // 品质对平铺按 EQUIP_QUALITY_FLAT_EXP 压缩:高品质的价值主要体现在词条数量上,
  // 而不是把平铺数值再翻几倍(Phase 33.2,详见常量处注释)
  const factor = EQUIP_BASE_FACTOR * Math.pow(q.mult, EQUIP_QUALITY_FLAT_EXP) * (1 + inst.level * EQUIP_LEVEL_BONUS)

  for (const key of ['attack', 'defense', 'maxHp'] as const) {
    const weight = template.base[key]
    if (weight) flats[key] = add(flats[key], mulN(scale, weight * factor))
  }
  if (template.fixedMods) {
    for (const k in template.fixedMods) {
      const key = k as AnyStatKey
      mods[key] = (mods[key] ?? 0) + (template.fixedMods[key] ?? 0)
    }
  }
  for (const roll of sortAffixLines(inst.affixes)) {
    const def = affixDef(roll.id)
    if (!def) continue
    const value = affixValue(def, roll.roll)
    mods[def.key] = (mods[def.key] ?? 0) + value / 100
    // desc 里 {v} 是数值的落点:切开它,界面才能只给数字加粗、并把它右对齐
    const [before = '', after = ''] = def.desc.split('{v}')
    affixLines.push({
      id: def.id,
      name: def.name,
      desc: def.desc.replace('{v}', String(value)),
      before,
      value: String(value),
      after,
      rarity: def.rarity,
      roll: roll.roll
    })
  }
  return { flats, mods, affixLines }
}
