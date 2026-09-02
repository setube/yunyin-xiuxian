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
import { qualityDef } from '@/data/qualities'
import { useLoreStore } from '@/stores/lore'
import { useCultivationStore } from '@/stores/cultivation'
import { modsText } from './statNames'

/** 图鉴条目 —— 收藏图鉴九类共用的呈现形状 */
export interface CodexEntry {
  id: string
  name: string
  /** 按收录深度逐层揭示的正文;未收录时为空。多段以换行分隔 */
  desc: string
  /** 一行补充信息(阶位 / 所属功法等) */
  meta: string
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
  entries: CodexEntry[]
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
  return { key: 'material', name: '灵材谱', hint: `已辨识 ${known}/${MATERIALS.length} · 通晓 ${mastered}`, entries }
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
    badge: lv >= BRANCH_STAGE_MAX ? '择' : '',
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
  return { key: 'branch', name: '悟道录', hint: `已见 ${seen}/${GONGFA_BRANCHES.length} · 已择 ${picked}`, entries }
}
