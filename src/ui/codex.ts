/**
 * 图鉴的呈现(Phase 32.7)—— 灵材谱与悟道录
 *
 * 收藏图鉴原有七类走的是 quests.collect() 那条路:见过即记一笔,二态而已。
 * 这里补的两类不同 —— 它们的"收录深度"本来就存在别处,而且不止两态:
 *
 * - **灵材谱**:认知层记在 lore.materialLore,四层(未识 / 已辨识 / 已知性 / 已通用)。
 * - **悟道录**:分支记在 cultivation.gongfaBranch,三态(未见 / 已见 / 已择)。
 *
 * 所以这两类做成**派生视图**,不再往 quests.collections 里存一份 ——
 * 同一件事记两处,迟早分叉。好处是旧存档立刻就能看,不需要任何迁移。
 *
 * ## 为什么是"渐进披露"而不是"给或不给"
 *
 * 这两个系统的层级本就带着信息量:辨识只知其名,知性才见药性数值,通用才懂它在方子里
 * 的门道。图鉴若一收录就把三句话全端出来,四层认知在界面上就退化成了一个布尔值。
 * 因此正文按层揭示,并附一句「还差什么」—— 尤其是灵材第三层必须真正入方开炉才能推进
 * (见 core/loreService.ts:noteMaterialUsed),这件事玩家自己摸不出来,得明说。
 *
 * 本文件只做映射与文案,不改任何状态(与 ui/enemyLore.ts 同规)。
 * describeXxx 是纯函数(可独立测试),xxxCodex 才是读 store 的那层薄封装。
 */
import { ELEMENTS } from '@/data/linggen'
import { LORE_MAX, LORE_STAGE_NAMES, MATERIALS, type MaterialDef } from '@/data/materials'
import { GONGFA_BRANCHES, canEnlighten, type GongfaBranchDef } from '@/data/gongfaBranches'
import { GONGFA_TYPE_NAMES, gongfaDef } from '@/data/gongfa'
import { QUALITIES, qualityDef } from '@/data/qualities'
import { ARTIFACTS, ARTIFACT_MAX_LEVEL } from '@/data/artifacts'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { PILLS } from '@/data/pills'
import type { ArtifactDef, EquipmentTemplate, PillDef } from '@/types'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useCultivationStore } from '@/stores/cultivation'
import { useQuestsStore } from '@/stores/quests'
import type { CollectionCategory } from '@/stores/quests'
import { modsText } from './statNames'
import { artifactFuncText, artifactMetaText, equipFuncText, equipMetaText, pillFuncText, pillMetaText } from './itemText'

/** 图鉴条目 —— 收藏图鉴九类共用的呈现形状 */
export interface CodexEntry {
  id: string
  name: string
  /** 按收录深度逐层揭示的正文;未收录时为空。多段以换行分隔 */
  desc: string
  /** 一行补充信息(阶位 / 所属功法等) */
  meta: string
  /** 章形图标(灵兽册/法宝谱改用图标章,不再是一串干文字) */
  icon?: string
  color?: string
  /** 收录深度:0 未收录,≥1 已收录 */
  stage: number
  /** 该深度的名目 */
  stageName: string
  /** 满深度的一字标记(「通」「择」);未满为空 */
  badge: string
  /** 还差什么才看得更清楚;已到顶为空 */
  hint: string
  /** 详情页脚注 —— 各类口径不同,故随条目一起给出 */
  foot: { label: string; value: string }
}

export interface CodexCat {
  key: string
  name: string
  /** 标题右侧的计数。各类层级口径不同,在此写死成人话而非 have/total */
  hint: string
  /**
   * 这一册的东西**从哪来**。
   *
   * 未收录的条目在界面上只是一片「???」—— 玩家看得出还差多少,却不知道去哪儿找。
   * 故每册带一句来源说明,由 codexSource.spec 对着真实的 collect 调用点核:
   * 说「历练掉落」,就得真有一处在历练里 collect('equip')。
   */
  source: string
  entries: CodexEntry[]
}

/** 七类收藏册的来源说明(灵材谱与悟道录在各自构造函数里另给) */
export const CODEX_SOURCES: Record<CollectionCategory, string> = {
  equip: '来源:历练掉落 —— 强敌与首领更易出',
  gongfa: '来源:藏经阁参悟 —— 用功法残页逐部撞见',
  // 三处:掉落(loot)、炼丹(pillService)、际遇赠丹(eventEngine)—— 由 codexSource.spec 对着 collect 点核
  pill: '来源:三处 —— 历练掉落、丹房照方炼出,际遇里也有人赠',
  artifact: '来源:历练掉落 —— 高阶地界才出得上品',
  pet: '来源:历练际遇 —— 结缘而非猎取',
  event: '来源:历练际遇与奇缘 —— 走到哪,遇见什么',
  talent: '来源:转世择姿 —— 每一世选一个'
}

// ============ 灵材谱 ============

/** 还差什么才更懂它 —— 索引即当前认知层 */
const MATERIAL_HINTS = [
  '尚未识得此物。',
  '多照面几回,便摸得清它的性子。',
  '须以它入方开炉 —— 上手用过,才谈得上通晓。'
] as const

/** 温性评语:正为热,负为寒。数值本身在"已知性"层一并给出,这里只做人话 */
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

/**
 * 按认知层揭示一味灵材。
 *
 * @param stage 认知层 0~3
 * @param seen 照面次数 —— 认知推进的底料,见得多才可能认出来
 */
export function describeMaterial(def: MaterialDef, stage: number, seen: number): CodexEntry {
  const lv = Math.max(0, Math.min(LORE_MAX, Math.floor(stage)))
  const el = ELEMENTS[def.element]
  const lines: string[] = def.lore.slice(0, lv)
  // 「已知性」的字面意思就是知道它的性子:到这一层才把数值摊开
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

/** 读当下所知,给出整本灵材谱 */
export function materialCodex(): CodexCat {
  const lore = useLoreStore()
  // sort 稳定,同层内保持 MATERIALS 原序(灵草在前、按阶位升序)
  const entries = MATERIALS.map(def => describeMaterial(def, lore.loreOf(def.id), lore.seenOf(def.id))).sort(
    (a, b) => b.stage - a.stage
  )
  const known = entries.filter(e => e.stage >= 1).length
  const mastered = entries.filter(e => e.stage >= LORE_MAX).length
  return {
    key: 'material',
    name: '灵材谱',
    hint: `已辨识 ${known}/${MATERIALS.length} · 通晓 ${mastered}`,
    source: '来源:采集、掉落,以及真把它用进一炉丹',
    entries
  }
}

// ============ 悟道录 ============

export const BRANCH_STAGE_NAMES = ['未见', '已见', '已择'] as const
export const BRANCH_STAGE_MAX = 2

const BRANCH_HINTS = ['此功尚未修至圆满,歧路未现。', '此道尚可择 —— 一经择定,不可更改。'] as const

/** 已择的那条道用金色标出:它比品质更该被一眼看见,那是你自己走的路 */
const PICKED_COLOR = 'var(--color-gold-ink)'

/**
 * 一条分支此刻处在哪一态。
 *
 * 择了 A 之后 B 仍停在「已见」而非退回「未见」—— 没走的那条路也该留在录上,
 * 那正是悟道录的意思。
 */
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
    color: lv >= BRANCH_STAGE_MAX ? PICKED_COLOR : g ? qualityDef(g.quality).color : undefined,
    stage: lv,
    stageName: BRANCH_STAGE_NAMES[lv]!,
    // 已择处印「择」;已见且正可择的印「可择」—— 那正是当前唯一能推进的路,别埋进一屏未见
    badge: lv >= BRANCH_STAGE_MAX ? '择' : lv >= 1 ? '可择' : '',
    hint: lv < BRANCH_STAGE_MAX ? BRANCH_HINTS[lv]! : '',
    // 分支名有重复(如两部功法各有一条「归一」),所属功法是唯一的辨认依据
    foot: { label: '所属功法', value: g?.name ?? '—' }
  }
}

/**
 * 读当下所修,给出整本悟道录。
 *
 * 刻意不按收录深度排序 —— 保持 GONGFA_BRANCHES 原序,同一功法的几条分支才会挨在一起,
 * 「这部功法有哪几条路」一眼可辨。打散了排,七十七条就成了一堆无从索引的词。
 */
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
    source: '来源:把一部功法修至圆满,再择一条道走下去',
    entries
  }
}

// ============ 用具三类:收录深度 ============
//
// 装备图鉴 / 法宝谱 / 丹方录此前只有「收没收录」两态:一个 id 进过表,格子就亮着,
// 从此再没有下文。可这三样东西的深度本来就存在别处 —— 装备见过的成色、法宝祭炼到
// 几重、丹方读到几分熟 —— 那些数一直在参与结算,只是没在图鉴里露面。
//
// 与灵材谱同一套做法:**不回写一份新状态去记「第几层」**,而是按已有的状态分层揭示,
// 并各附一句「还差什么」。这样旧存档立刻就有得看,也不会出现两处记录互相分叉。
//
// 三处深度取自:装备见闻(lore.equipLore)、法宝祭炼重数(inventory.artifacts)、
// 丹方掌握度(lore.recipeLore)。

/**
 * 装备收录深度:0 未录 / 1 已入目 / 2 曾上手 / 3 见过天品
 *
 * 「曾上手」这一档是拿**玩家自己能决定的事**换来的(强化一件、或把它装上身),
 * 而第三档仍是运气(撞见天品以上的成色)。原先的第二档是「见过精品」——
 * 对低阶模板要等运气,玩家在图鉴里干看着,推不动它。
 */
export const EQUIP_STAGE_NAMES = ['未录', '已入目', '曾上手', '见过天品'] as const
export const EQUIP_STAGE_MAX = 3

/** 分档的品质由此而来 —— 不写魔数,改品质表时这里跟着走 */
const EQUIP_STAGE3_RANK = qualityDef('heaven').rank

const EQUIP_HINTS = [
  '尚未见过此物 —— 多在地界里走动。',
  '见过形制了 —— 强化一件、或把它装上身,才算上手。',
  '用过了 —— 再往上就看运气:见一件天品以上的成色。',
  ''
] as const

/** 见闻记录:该模板见过的最高品质档、最高层级,以及是否亲手用过(u) */
export interface EquipSeen {
  /** 最高品质 rank */
  q: number
  /** 最高层级 */
  t: number
  /** 是否亲手用过(强化过或装备过):1 = 用过 */
  u?: number
}

/** 某件装备在「见过什么成色」上走到哪一层 */
export function equipStage(seen: EquipSeen | undefined, collected: boolean): number {
  if (!seen) return collected ? 1 : 0
  if (seen.q >= EQUIP_STAGE3_RANK) return 3
  if (seen.u) return 2
  return 1
}

/**
 * 装备图鉴条目:风味 + 功用 + 亲眼见过的最好成色。
 *
 * 平铺数值随掉落层级折算,所以「见过什么成色」是这个模板唯一说得清的深度 ——
 * 它同时回答了「这东西上限在哪」与「我刷的地界够不够高」。
 */
export function describeEquipment(def: EquipmentTemplate, seen: EquipSeen | undefined, collected: boolean): CodexEntry {
  const stage = equipStage(seen, collected)
  const lines = [def.desc, equipFuncText(def)].filter(Boolean)
  if (stage >= 1 && seen) {
    lines.push(`见过最好的:${qualityOfRank(seen.q).name} · ${seen.t} 阶`)
  }
  return {
    id: def.id,
    name: def.name,
    desc: lines.join('\n'),
    meta: equipMetaText(def),
    stage,
    stageName: EQUIP_STAGE_NAMES[stage]!,
    badge: stage >= EQUIP_STAGE_MAX ? '极' : '',
    hint: EQUIP_HINTS[stage]!,
    foot: { label: '收录时间', value: '' }
  }
}

/** 品质 rank → 品质定义(见闻只存了 rank;回头要查名字) */
function qualityOfRank(rank: number) {
  const r = Math.max(0, Math.min(8, Math.floor(rank || 0)))
  return QUALITIES.find(q => q.rank === r) ?? QUALITIES[0]!
}

/** 法宝收录深度:0 未录 / 1 已录 / 2 曾祭炼 / 3 祭炼圆满 */
export const ARTIFACT_STAGE_NAMES = ['未录', '已录', '曾祭炼', '祭炼圆满'] as const
export const ARTIFACT_STAGE_MAX = 3

const ARTIFACT_HINTS = [
  '尚未见过此宝 —— 高阶地界才出得上品。',
  '录在册上了,还没拿它炼过一重 —— 祭炼过后,被动与神通各强八分。',
  '炼过几重了 —— 炼到九重,才算把它用透。',
  ''
] as const

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
    color: qualityDef(def.quality).color,
    stage,
    stageName: ARTIFACT_STAGE_NAMES[stage]!,
    badge: stage >= ARTIFACT_STAGE_MAX ? '满' : '',
    hint: ARTIFACT_HINTS[stage]!,
    foot: { label: '祭炼', value: `${Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))}/${ARTIFACT_MAX_LEVEL} 重` }
  }
}

/** 丹方录收录深度:0 未录 / 1 已录 / 2 已得方 / 3 通晓 */
export const PILL_STAGE_NAMES = ['未录', '已录', '已得方', '通晓'] as const
export const PILL_STAGE_MAX = 3

const PILL_HINTS = [
  '尚未见过此丹。',
  '见过成品,方子还没到手。',
  '方子在手,开炉炼熟它。',
  ''
] as const

/** 无方之丹(只掉不炼)的收尾话:免得玩家满世界找一本不存在的方子 */
export const PILL_NO_RECIPE_HINT = '此丹本无方 —— 只在历练与际遇里偶得,炼不出来。'

/**
 * 某味丹走到哪一层。
 * 无方之丹到「已录」即顶(阶段名照给,但上限只有 1)—— 界面上用 hint 说明缘由。
 */
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
    color: qualityDef(def.quality).color,
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
    icon: def.icon,
    foot: { label: '收录时间', value: collectedTimeText(quests.collectedAt[`artifact:${def.id}`]) }
  })).sort((a, b) => b.stage - a.stage)
  const seen = entries.filter(e => e.stage >= 1).length
  const full = entries.filter(e => e.stage >= ARTIFACT_STAGE_MAX).length
  return {
    key: 'artifact',
    name: '法宝谱',
    hint: `已录 ${seen}/${ARTIFACTS.length} · 祭炼圆满 ${full}`,
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
    foot: { label: '收录时间', value: collectedTimeText(quests.collectedAt[`pill:${def.id}`]) }
  })).sort((a, b) => b.stage - a.stage)
  const seen = entries.filter(e => e.stage >= 1).length
  const known = entries.filter(e => e.stage >= 2).length
  const mastered = entries.filter(e => e.stage >= PILL_STAGE_MAX).length
  return {
    key: 'pill',
    name: '丹方录',
    hint: `已录 ${seen}/${PILLS.length} · 得方 ${known} · 通晓 ${mastered}`,
    source: CODEX_SOURCES.pill,
    entries
  }
}

/**
 * 收录时刻的人话。旧档里已收录的条目没有记录 —— 照实说「早年收录」,
 * 而不是编一个时间或显示 1970。
 */
export function collectedTimeText(ts: number | undefined): string {
  if (ts === undefined || !Number.isFinite(ts)) return '早年收录,未记时日'
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
