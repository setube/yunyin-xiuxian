/**
 * 图鉴的呈现。
 *
 * 灵材谱、悟道录为派生视图:深度取自 lore.materialLore(四层)与 cultivation.gongfaBranch(三态),
 * 不往 quests.collections 存一份(记两处会分叉)。
 * 只做映射与文案,不改任何状态(与 ui/enemyLore.ts 同规);describeXxx 为纯函数,xxxCodex 读 store。
 */
import { ELEMENTS } from '@/data/linggen'
import { LORE_MAX, LORE_STAGE_NAMES, MATERIALS, type MaterialDef } from '@/data/materials'
import { GONGFA_BRANCHES, canEnlighten, type GongfaBranchDef } from '@/data/gongfaBranches'
import { GONGFA_TYPE_NAMES, gongfaDef } from '@/data/gongfa'
import { QUALITIES, qualityDef, qualityTextColor } from '@/data/qualities'
import {
  ARTIFACTS,
  ARTIFACT_LEVEL_BONUS,
  ARTIFACT_MAX_LEVEL,
  artifactNextLevelGain
} from '@/data/artifacts'
import { formatPercent } from '@/utils/format'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { PILLS, pillQualityColor, pillRank } from '@/data/pills'
import { lusterByRank, lusterOf } from '@/ui/luster'
import type { ArtifactDef, EquipmentTemplate, PillDef } from '@/types'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useCultivationStore } from '@/stores/cultivation'
import { useQuestsStore } from '@/stores/quests'
import type { CollectionCategory } from '@/stores/quests'
import { modsText } from '@/data/statNames'
import { artifactFuncText, artifactMetaText, equipFuncText, equipMetaText, pillFuncText, pillMetaText } from './itemText'

/** 图鉴条目(收藏图鉴九类共用) */
export interface CodexEntry {
  id: string
  name: string
  /** 按收录深度逐层揭示的正文,多段以换行分隔 */
  desc: string
  /** 一行补充信息(阶位 / 所属功法等) */
  meta: string
  /** 章形图标(灵兽册 / 法宝谱) */
  icon?: string
  color?: string
  /** 收录深度:0 未收录,≥1 已收录 */
  stage: number
  stageName: string
  /** 满深度的一字标记,未满为空,两态图鉴恒空;悟道录「已见」为「可择」 */
  badge: string
  /**
   * 最上档物件的质感标记(见 ui/luster)。图鉴是标签流,不是卡片,
   * 四角御纹在这里既挤又乱;改用一枚小字,与详情弹窗的整幅框同源。
   */
  luster?: { label: string } | null
  /** 下一层的条件(装备「曾上手」档为该阶成色目标,法宝谱为祭炼收益);到顶或无可补充为空,无方之丹到顶为 PILL_NO_RECIPE_HINT */
  hint: string
  /** 详情页脚注(各类口径不同,随条目给) */
  foot: { label: string; value: string }
}

export interface CodexCat {
  key: string
  name: string
  /** 标题右侧的计数文案(各类口径不同,不用 have/total) */
  hint: string
  /**
   * 已收录条数,供进度条用。
   * 与 entries 同源(收录深度 ≥1),不另存一份 —— 两者分叉会让条与标签各说各话。
   */
  done: number
  /** 本册来源说明 */
  source: string
  entries: CodexEntry[]
}

/**
 * 「已收 N」统一口径,CollectionView.makeCat 与 CharacterView 共用。
 * ownedIds 可能含重复 / 已移出图鉴的旧 id(损坏或旧版迁移的档),ownedIds.length 会多报;只数落进 defs 的。
 */
export function codexOwnedCount(ownedIds: string[], defs: { id: string }[]): number {
  const owned = new Set(ownedIds)
  return defs.reduce((n, d) => (owned.has(d.id) ? n + 1 : n), 0)
}

/** 七类收藏册的来源说明(灵材谱、悟道录在各自构造函数里给);codexSource.spec 对着真实 collect 调用点核 */
export const CODEX_SOURCES: Record<CollectionCategory, string> = {
  equip: '来源:历练掉落',
  gongfa: '来源:藏经阁参悟',
  // 三处收录:掉落(loot)、炼丹(pillService)、际遇赠丹(eventEngine)
  pill: '来源:历练掉落、丹房炼制、际遇所赠',
  artifact: '来源:历练掉落',
  pet: '来源:历练际遇',
  event: '来源:历练际遇、奇缘',
  talent: '来源:转世择姿'
}

// ============ 灵材谱 ============

/** 下一层的条件,索引即当前认知层(上手用过见 core/loreService.ts:noteMaterialUsed / noteSmithingUsed) */
const MATERIAL_HINTS = ['需辨识', '需多次照面', '需上手用过'] as const

/** 温性评语:正为热,负为寒 */
function thermalWord(v: number): string {
  if (v >= 30) return '大热'
  if (v >= 10) return '性温'
  if (v > -10) return '性平'
  if (v > -30) return '性凉'
  return '至寒'
}

function toxinWord(v: number): string {
  if (v <= 0) return '无毒'
  if (v < 10) return '微毒'
  if (v < 30) return '有毒'
  return '剧毒'
}

/** 按认知层揭示一味灵材(stage:0~3;seen:照面次数) */
export function describeMaterial(def: MaterialDef, stage: number, seen: number): CodexEntry {
  const lv = Math.max(0, Math.min(LORE_MAX, Math.floor(stage)))
  const el = ELEMENTS[def.element]
  const lines: string[] = def.lore.slice(0, lv)
  // 「已知性」层起摊开数值
  if (lv >= 2) {
    lines.push(
      `药性:药力 ${def.medicinal.potency} · ${thermalWord(def.medicinal.thermal)} · ${toxinWord(def.medicinal.toxin)}`,
      `器性:硬度 ${def.forging.hardness} · 灵性 ${def.forging.spirit} · 导灵 ${def.forging.conduct}`
    )
  }
  return {
    id: def.id,
    name: def.name,
    desc: lines.join('\n'),
    meta: `${def.rank} 阶 · ${el.name}属 · ${def.bucket === 'herb' ? '灵草' : '金石'}`,
    color: el.color,
    stage: lv,
    stageName: LORE_STAGE_NAMES[lv] ?? LORE_STAGE_NAMES[0],
    badge: lv >= LORE_MAX ? '通' : '',
    hint: lv < LORE_MAX ? MATERIAL_HINTS[lv]! : '',
    foot: { label: '照面', value: seen > 0 ? `${seen} 回` : '未曾照面' }
  }
}

export function materialCodex(): CodexCat {
  const lore = useLoreStore()
  // sort 稳定:同层内保持 MATERIALS 原序(灵草在前、阶位升序)
  const entries = MATERIALS.map(def => describeMaterial(def, lore.loreOf(def.id), lore.seenOf(def.id))).sort(
    (a, b) => b.stage - a.stage
  )
  const known = entries.filter(e => e.stage >= 1).length
  const mastered = entries.filter(e => e.stage >= LORE_MAX).length
  return {
    key: 'material',
    name: '灵材谱',
    hint: `已辨识 ${known}/${MATERIALS.length} · 通晓 ${mastered}`,
    done: known,
    source: '来源:采集、掉落、炼丹',
    entries
  }
}

// ============ 悟道录 ============

export const BRANCH_STAGE_NAMES = ['未见', '已见', '已择'] as const
export const BRANCH_STAGE_MAX = 2

const BRANCH_HINTS = ['需功法圆满', '择定不可更改'] as const

const PICKED_COLOR = 'var(--color-gold-ink)'

/** 一条分支此刻处在哪一态:择了 A 之后 B 仍停在「已见」,不退回「未见」 */
export function branchStage(
  def: GongfaBranchDef,
  learned: Readonly<Record<string, number>>,
  picked: Readonly<Record<string, string>>
): number {
  if (picked[def.gongfaId] === def.id) return BRANCH_STAGE_MAX
  return canEnlighten(def.gongfaId, learned[def.gongfaId] ?? 0) ? 1 : 0
}

/** 按三态揭示一条悟道分支 */
export function describeBranch(def: GongfaBranchDef, stage: number): CodexEntry {
  const lv = Math.max(0, Math.min(BRANCH_STAGE_MAX, Math.floor(stage)))
  const g = gongfaDef(def.gongfaId)
  return {
    id: def.id,
    name: def.name,
    desc: lv >= 1 ? `${def.desc}\n${modsText(def.mods)}` : '',
    meta: g ? `${g.name} · ${GONGFA_TYPE_NAMES[g.type]} · ${qualityDef(g.quality).name}` : '',
    /**
     * 字色同样走「当文字用」那一组 —— 分支卡在功法阁里与装备册/法宝谱同处一页,
     * 三处的品阶字色该是同一套(原色在玄/天/仙/神四档当字用时过不了 4.5:1)。
     * 已择的分支另取金色:那是「已经选定了」,不是品阶。
     */
    color: lv >= BRANCH_STAGE_MAX ? PICKED_COLOR : g ? qualityTextColor(g.quality) : undefined,
    stage: lv,
    stageName: BRANCH_STAGE_NAMES[lv]!,
    badge: lv >= BRANCH_STAGE_MAX ? '择' : lv >= 1 ? '可择' : '',
    hint: lv < BRANCH_STAGE_MAX ? BRANCH_HINTS[lv]! : '',
    // 分支名有重复(如两部功法各有一条「归一」),靠所属功法辨认
    foot: { label: '所属功法', value: g?.name ?? '—' }
  }
}

/** 不按收录深度排序:保持 GONGFA_BRANCHES 原序,同一功法的几条分支挨在一起 */
export function branchCodex(): CodexCat {
  const cultivation = useCultivationStore()
  const entries = GONGFA_BRANCHES.map(def =>
    describeBranch(def, branchStage(def, cultivation.learned, cultivation.gongfaBranch))
  )
  const seen = entries.filter(e => e.stage >= 1).length
  const picked = entries.filter(e => e.stage >= BRANCH_STAGE_MAX).length
  return {
    key: 'branch',
    name: '悟道录',
    hint: `已见 ${seen}/${GONGFA_BRANCHES.length} · 已择 ${picked}`,
    done: seen,
    source: '来源:功法圆满后择道',
    entries
  }
}

// ============ 用具三类:收录深度 ============
//
// 装备图鉴 / 法宝谱 / 丹方录:同灵材谱,不回写新状态记「第几层」,按已有状态分层揭示。
// 深度取自:装备见闻(lore.equipLore)、法宝祭炼重数(inventory.artifacts)、丹方掌握度(lore.recipeLore)。

/** 装备收录深度;「曾上手」一档须是玩家自己能决定的事(强化或装备),不靠运气 */
export const EQUIP_STAGE_NAMES = ['未录', '已入目', '曾上手', '见过天品'] as const
export const EQUIP_STAGE_MAX = 3

const EQUIP_STAGE3_RANK = qualityDef('heaven').rank

const EQUIP_HINTS = [
  '需获得',
  '需强化或装备一件',
  '', // 按模板阶封顶现算,见 equipStage2Hint
  ''
] as const

/**
 * 该阶模板在掉落窗口内能见到的最好品质档(fromTier ≤ 该阶)。
 * 天品 fromTier 16,十几阶的模板按 0.1^6 越窗衰减够不着;提示不写死 EQUIP_STAGE3。
 */
function maxReachableRankAtTier(tier: number): number {
  let best = 0
  for (const q of QUALITIES) if (q.fromTier <= tier) best = Math.max(best, q.rank)
  return best
}

/** 「曾上手」之后的提示:按该阶真实上限给;上限为全表最高档(24 阶起的神品件)时不带「以上」 */
function equipStage2Hint(tier: number, seenQ: number): string {
  const ceilingRank = maxReachableRankAtTier(tier)
  const ceiling = qualityOfRank(ceilingRank).name
  if (seenQ >= ceilingRank) return `成色已至上限:${ceiling}`
  const topRank = Math.max(...QUALITIES.map(q => q.rank))
  if (ceilingRank >= topRank) return `需见一件${ceiling}`
  return `需见一件${ceiling}以上`
}

/** 该模板的见闻记录 */
export interface EquipSeen {
  /** 最高品质 rank */
  q: number
  /** 最高层级 */
  t: number
  /** 是否亲手用过(强化过或装备过):1 = 用过 */
  u?: number
}

export function equipStage(seen: EquipSeen | undefined, collected: boolean): number {
  if (!seen) return collected ? 1 : 0
  if (seen.q >= EQUIP_STAGE3_RANK) return 3
  if (seen.u) return 2
  return 1
}

/** 装备图鉴条目:风味 + 功用 + 亲眼见过的最好成色 */
export function describeEquipment(def: EquipmentTemplate, seen: EquipSeen | undefined, collected: boolean): CodexEntry {
  const stage = equipStage(seen, collected)
  const lines = [def.desc, equipFuncText(def)].filter(Boolean)
  if (stage >= 1 && seen) {
    // q 与 t 各自独立取高(可能来自不同掉落),分开陈述
    lines.push(`见过最好成色:${qualityOfRank(seen.q).name} · 最高 ${seen.t} 阶`)
  }
  /**
   * 装备册是全站最大的一册(288 件),却也是唯一没有图标、没有品阶色的一册:
   * 同册的法宝谱与灵兽册都有。图标与色都取数据表已有的 —— `EquipmentTemplate.icon`
   * 由 `data/equipment` 按名字字眼挑好(见 data/equipmentIcon.spec),品阶色取「当文字用」那一组
   * (品阶原色在日/夜各有一档过不了 4.5:1,见 data/qualities 的 TEXT_COLOR)。
   */
  const tone = seen ? qualityOfRank(seen.q) : QUALITIES[0]!
  return {
    id: def.id,
    name: def.name,
    desc: lines.join('\n'),
    meta: equipMetaText(def),
    icon: def.icon,
    color: qualityTextColor(tone.id),
    stage,
    stageName: EQUIP_STAGE_NAMES[stage]!,
    badge: stage >= EQUIP_STAGE_MAX ? '极' : '',
    hint: stage === 2 && seen ? equipStage2Hint(def.tier, seen.q) : EQUIP_HINTS[stage]!,
    foot: { label: '收录时间', value: '' }
  }
}

function qualityOfRank(rank: number) {
  const r = Math.max(0, Math.min(8, Math.floor(rank || 0)))
  return QUALITIES.find(q => q.rank === r) ?? QUALITIES[0]!
}

export const ARTIFACT_STAGE_NAMES = ['未录', '已录', '曾祭炼', '祭炼圆满'] as const
export const ARTIFACT_STAGE_MAX = 3

/**
 * 收录深度的提示语:祭炼在这一件上买到什么。
 *
 * 封顶判据看会不会长大,不看 `capped` 布尔;神通主体(`active.amount`)与回补(`heal`)分侧判:
 * 主体零重封顶(神鞭、无相念珠、全部护盾法宝)才说只涨被动;只有回补已满(神魔镜)时说主体照涨。
 * 增幅从 ARTIFACT_LEVEL_BONUS 现算,不写死。深度 1、2 共用同一句(往后每一重买到的不变)。
 */
function artifactHints(def: ArtifactDef): readonly string[] {
  const gain0 = artifactNextLevelGain(def, 0)
  const frozen = (x: { from: number; to: number } | null | undefined): boolean =>
    !!x && Math.abs(x.to - x.from) < 1e-9
  // stun 那几件 active 为 null(没有数值)
  const activeFrozen = frozen(gain0?.active)
  const healFrozen = frozen(gain0?.heal)
  const pct = formatPercent(ARTIFACT_LEVEL_BONUS)
  const gainLine = activeFrozen
    ? `神通零重已满 · 祭炼:只涨被动(每重 ${pct})`
    : healFrozen
      ? `回补零重已满 · 祭炼:被动与神通主体各强 ${pct}`
      : `祭炼:被动与神通各强 ${pct}`
  return ['需获得', gainLine, gainLine, '']
}

/** 某件法宝走到哪一层(等级取自玩家自己的那一件) */
export function artifactStage(level: number, collected: boolean): number {
  const lv = Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))
  if (lv >= ARTIFACT_MAX_LEVEL) return 3
  if (lv >= 1) return 2
  return collected ? 1 : 0
}

/** 法宝谱条目:风味 + 功用(按本人祭炼等级) */
export function describeArtifact(def: ArtifactDef, level: number, collected: boolean): CodexEntry {
  const stage = artifactStage(level, collected)
  return {
    id: def.id,
    name: def.name,
    desc: [def.desc, artifactFuncText(def, level)].filter(Boolean).join('\n'),
    meta: artifactMetaText(def),
    /**
     * 字色走「当文字用」那一组,与同册的装备册一致。
     * 原先这里取的是品阶**原色**:玄/天/仙/神四档的原色当字用时在日/夜主题各有一档
     * 过不了 4.5:1(见 data/qualities 的 TEXT_COLOR 与 palette.spec 的角章判据)。
     * 同一册图鉴里同一个品阶的字色不该有两种 —— 玩家会把「颜色深一档」误读成品阶差异。
     */
    color: qualityTextColor(def.quality),
    stage,
    stageName: ARTIFACT_STAGE_NAMES[stage]!,
    badge: stage >= ARTIFACT_STAGE_MAX ? '满' : '',
    hint: artifactHints(def)[stage]!,
    foot: { label: '祭炼', value: `${Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))}/${ARTIFACT_MAX_LEVEL} 重` }
  }
}

export const PILL_STAGE_NAMES = ['未录', '已录', '已得方', '通晓'] as const
export const PILL_STAGE_MAX = 3

const PILL_HINTS = [
  '需获得',
  '需得丹方',
  '', // 只差掌握度(行囊丹药详情里有数)
  ''
] as const

/** 无方之丹(只掉不炼)的提示 */
export const PILL_NO_RECIPE_HINT = '无丹方 · 不可炼制'

/** 某味丹走到哪一层;无方之丹上限为 1(「已录」) */
export function pillStage(def: PillDef, collected: boolean, mastery: number): number {
  if (!collected) return 0
  if (!def.recipe) return 1
  const m = Math.max(0, Math.min(1, mastery))
  if (m >= 1) return 3
  if (m > 0) return 2
  return 1
}

/** 丹方录条目:风味 + 服之如何 + 来路 */
export function describePill(def: PillDef, collected: boolean, mastery: number): CodexEntry {
  const stage = pillStage(def, collected, mastery)
  const cap = def.recipe ? PILL_STAGE_MAX : 1
  const top = stage >= cap
  return {
    id: def.id,
    name: def.name,
    desc: [def.desc, pillFuncText(def)].filter(Boolean).join('\n'),
    meta: pillMetaText(def),
    color: pillQualityColor(def),
    stage,
    stageName: PILL_STAGE_NAMES[stage]!,
    badge: top && stage >= PILL_STAGE_MAX ? '通' : '',
    hint: top ? (def.recipe ? '' : PILL_NO_RECIPE_HINT) : PILL_HINTS[stage]!,
    foot: def.recipe ? { label: '丹方掌握', value: `${Math.round(Math.max(0, Math.min(1, mastery)) * 100)}%` } : { label: '来路', value: '偶得' }
  }
}

export function equipCodex(): CodexCat {
  const lore = useLoreStore()
  const quests = useQuestsStore()
  const owned = new Set(quests.collections.equip)
  const entries = EQUIPMENT_TEMPLATES.map(def => ({
    ...describeEquipment(def, lore.equipSeen(def.id), owned.has(def.id)),
    foot: { label: '收录时间', value: collectedTimeText(quests.collectedAt[`equip:${def.id}`]) }
  })).sort((a, b) => b.stage - a.stage)
  const seen = entries.filter(e => e.stage >= 1).length
  const best = entries.filter(e => e.stage >= EQUIP_STAGE_MAX).length
  return {
    key: 'equip',
    name: '装备图鉴',
    hint: `已入目 ${seen}/${EQUIPMENT_TEMPLATES.length} · 见过天品 ${best}`,
    done: seen,
    source: CODEX_SOURCES.equip,
    entries
  }
}

export function artifactCodex(): CodexCat {
  const inventory = useInventoryStore()
  const quests = useQuestsStore()
  const owned = new Set(quests.collections.artifact)
  const levelOf = new Map(inventory.artifacts.map(a => [a.defId, a.level]))
  const entries = ARTIFACTS.map(def => ({
    ...describeArtifact(def, levelOf.get(def.id) ?? 0, owned.has(def.id)),
    luster: lusterOf(def.quality),
    icon: def.icon,
    foot: { label: '收录时间', value: collectedTimeText(quests.collectedAt[`artifact:${def.id}`]) }
  })).sort((a, b) => b.stage - a.stage)
  const seen = entries.filter(e => e.stage >= 1).length
  const full = entries.filter(e => e.stage >= ARTIFACT_STAGE_MAX).length
  return {
    key: 'artifact',
    name: '法宝谱',
    hint: `已录 ${seen}/${ARTIFACTS.length} · 祭炼圆满 ${full}`,
    done: seen,
    source: CODEX_SOURCES.artifact,
    entries
  }
}

export function pillCodex(): CodexCat {
  const lore = useLoreStore()
  const quests = useQuestsStore()
  const owned = new Set(quests.collections.pill)
  const entries = PILLS.map(def => ({
    ...describePill(def, owned.has(def.id), lore.recipeMastery(def.id)),
    luster: lusterByRank(pillRank(def)),
    foot: { label: '收录时间', value: collectedTimeText(quests.collectedAt[`pill:${def.id}`]) }
  })).sort((a, b) => b.stage - a.stage)
  const seen = entries.filter(e => e.stage >= 1).length
  const known = entries.filter(e => e.stage >= 2).length
  const mastered = entries.filter(e => e.stage >= PILL_STAGE_MAX).length
  return {
    key: 'pill',
    name: '丹方录',
    hint: `已录 ${seen}/${PILLS.length} · 得方 ${known} · 通晓 ${mastered}`,
    done: seen,
    source: CODEX_SOURCES.pill,
    entries
  }
}

/** 收录时刻文案;旧档里已收录的条目没有记录,给「未记录」而非 1970 */
export function collectedTimeText(ts: number | undefined): string {
  if (ts === undefined || !Number.isFinite(ts)) return '未记录'
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
