/**
 * 凡界生成 · 主观新颖度代理审计
 *
 * 上一轮证明了结构新颖(0.42~0.53 稳定过门),但同时钉出唯一真正值得
 * 担心的风险:**结构新颖 ≠ 玩家感知新颖**。
 *
 * 内部结构变了不代表玩家看得出来。最坏的情形是:
 *   worldGen 内部重组得很彻底 → 玩家看到的仍是熟悉的名字、
 *   熟悉的地貌顺序、熟悉的推进节奏 → 感知新颖度接近 0
 *
 * 这一层不能靠再加一个数学指标解决,但可以用**代理指标**先排除
 * 「明显换皮」——把生成结果拆成玩家实际会看到的层,再问:
 *
 *   两个世界即使内部机制很不一样,玩家看到的表面特征是否仍高度相似?
 *
 * 三件事:
 *   一、世界身份   生成世界要有自己的身份,而不是六个原区域串起来
 *   二、可见距离   玩家可见特征向量的距离,与结构距离对照
 *   三、体验去重   可见骨架不能连续重复,这比抬高 NOVELTY_MIN 更直接
 *
 * 只做度量,不改生成器、不改玩法。
 */
import { MUTATOR_THEMES, THEME_IDENTITY, type MutatorTheme } from '@/data/mutators'
import { REGIONS } from '@/data/regions'
import { enemyDef } from '@/data/enemies'
import { type MortalWorld, mortalNovelty } from './mortalWorldGen'

// ============ 一、世界身份 ============

/** 地貌轴 —— 由地界 icon 归类,是玩家第一眼看到的东西 */
export type TerrainAxis = '山岳' | '林泽' | '火域' | '天象' | '废墟' | '幽冥'

const ICON_TERRAIN: Record<string, TerrainAxis> = {
  mountain: '山岳',
  trees: '林泽',
  droplets: '林泽',
  waves: '林泽',
  flame: '火域',
  sunset: '火域',
  cloud: '天象',
  zap: '天象',
  star: '天象',
  sparkles: '天象',
  castle: '废墟',
  crown: '废墟',
  sword: '废墟',
  skull: '幽冥'
}

function iconOf(regionId: string): string {
  return REGIONS.find(r => r.id === regionId)?.icon ?? 'mountain'
}

/** 一处地界的地貌轴 */
export function terrainOf(fromId: string): TerrainAxis {
  return ICON_TERRAIN[iconOf(fromId)] ?? '山岳'
}

/**
 * ## 世界身份的四层职责(实际页面验证后确立)
 *
 * ```
 * 世界名      这是一个什么类型的世界?
 * 摘要        这个世界整体呈现什么气象?
 * 路线 / 地界  具体由什么组成?
 * 规则        这一世有什么特殊条件?
 * ```
 *
 * **摘要不负责完整描述世界,只负责补充世界名未表达的第一层语义。**
 *
 * 曾考虑把实际地貌构成写进 scattered 的摘要,实际页面否掉了这个想法:
 * 地貌已经逐段写在地界列表右侧,再写进摘要会变成
 * 「世界名说一次 → 摘要再说一次 → 列表第三次说一次」。
 * 信息存在于页面中,不等于必须在每一层重复一次。
 *
 * 故 scattered 的摘要信息增量低是**可接受的**,不是缺陷。
 */

/**
 * 命名形态 —— 由主地貌的**占优程度**决定,不是由众数决定。
 *
 * 实测缺陷:「虚影幢幢的天象之世」实际是
 * 废墟/山岳/废墟/天象/天象/天象。统计上天象确是众数(3/6),
 * 但玩家前半程走的是两处废墟夹一处山岳 ——
 * **生成器认为它是天象世界,玩家却没有任何理由这么理解。**
 *
 * 众数 ≠ 主导。3/6 与 5/6 不该拿到同样强度的语义
 */
export type NamingForm =
  /** 单一地貌主导,可用「X 之世」 */
  | 'single'
  /** 两轴并立,用「X 与 Y 交错之世」 */
  | 'dual'
  /** 高度分散,不许用地貌命名,退回主题 + 生态 */
  | 'scattered'

export interface WorldIdentity {
  /** 主地貌(出现最多的一轴) */
  terrain: TerrainAxis
  /** 次地貌;dual 形态下参与命名 */
  secondary: TerrainAxis | null
  /** 主地貌占比 —— 命名置信度的依据 */
  dominance: number
  /** 命名形态 */
  form: NamingForm
  /** 规则主题(取自世界规则的语义轴) */
  theme: MutatorTheme
  /** 主题意象 */
  themeName: string
  /** 世界名 */
  name: string
  /** 一句摘要 */
  summary: string
  /** 参与构成的语义轴数;>2 视为大杂烩 */
  axisCount: number
}

/** 单一地貌命名所需的最低占比 */
export const DOMINANCE_SINGLE = 0.6
/** 两轴并立所需的「前二合计」最低占比 */
export const DOMINANCE_DUAL = 0.66

/**
 * 从已有标签、生态、规则中抽出世界级语义摘要。
 *
 * 不新写剧情 —— 素材全部来自区域 icon、变数主题、资源偏向。
 * 天界的 MUTATOR_THEMES / THEME_IDENTITY 已经是这套做法,此处沿用
 */
export function worldIdentity(w: MortalWorld): WorldIdentity {
  const counts = new Map<TerrainAxis, number>()
  for (const p of w.chain) {
    const t = terrainOf(p.fromId)
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const total = Math.max(1, w.chain.length)
  const terrain = sorted[0]![0]
  const dominance = sorted[0]![1] / total
  const second = sorted[1] ?? null
  const dualShare = (sorted[0]![1] + (second?.[1] ?? 0)) / total
  const theme = MUTATOR_THEMES[w.ruleId] ?? 'survival'
  const themeName = THEME_IDENTITY[theme]

  // 命名强度随占优程度递减:够强才敢用单一地貌称呼这一世
  let form: NamingForm
  let name: string
  let summary: string
  let secondary: TerrainAxis | null = null
  if (dominance >= DOMINANCE_SINGLE) {
    form = 'single'
    name = `${themeName}的${terrain}之世`
    summary = `${w.bias}的${terrain},为${themeName}所笼罩`
  } else if (second && dualShare >= DOMINANCE_DUAL) {
    form = 'dual'
    secondary = second[0]
    name = `${terrain}与${secondary}交错之世`
    summary = `${w.bias}之地,${terrain}与${secondary}相间,为${themeName}所笼罩`
  } else {
    // 地貌高度分散:不许拿任何一轴代表整个世界,退回主题与生态
    form = 'scattered'
    name = `${themeName}的杂涌之世`
    summary = `${w.bias}之地,山川无序、诸相杂陈,唯${themeName}贯穿始终`
  }

  return {
    terrain,
    secondary,
    dominance,
    form,
    theme,
    themeName,
    name,
    summary,
    // 地貌轴数 + 规则轴 1
    axisCount: counts.size + 1
  }
}

/** 语义是否聚焦(≤2 轴,承袭天界的世界语义门) */
export function isFocused(id: WorldIdentity, maxAxes = 3): boolean {
  return id.axisCount <= maxAxes
}

// ============ 二、玩家可见特征向量 ============

/**
 * 玩家看得见的东西。
 *
 * 与结构向量(规则、敌人机制、可行流派)刻意分开 ——
 * 后者是系统内部的解法空间,前者是第一屏的观感
 */
export interface VisibleFeatures {
  /** 地貌序列 */
  terrains: TerrainAxis[]
  /** 首尾地界类型 */
  head: TerrainAxis
  tail: TerrainAxis
  /** 出现的地界名 */
  placeNames: string[]
  /** 首领名 */
  bossNames: string[]
  /** 事件密度结构:每处地界的标签数 */
  eventDensity: number[]
  /** 路线形状:层级递进曲线 */
  shape: number[]
  bias: string
  ruleName: string
}

export function visibleFeatures(w: MortalWorld): VisibleFeatures {
  const terrains = w.chain.map(p => terrainOf(p.fromId))
  return {
    terrains,
    head: terrains[0]!,
    tail: terrains[terrains.length - 1]!,
    placeNames: w.chain.map(p => p.name),
    bossNames: w.chain.map(p => enemyDef(p.boss)?.name ?? p.boss),
    eventDensity: w.chain.map(p => p.eventTags.length),
    shape: w.chain.map(p => p.tier),
    bias: w.bias,
    ruleName: w.ruleName
  }
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 && sb.size === 0) return 0
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter += 1
  return 1 - inter / (sa.size + sb.size - inter)
}

function seqDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1
  let diff = 0
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1
  return diff / a.length
}

/**
 * 玩家可见距离(0~1)。
 *
 * 权重刻意偏向「第一屏就能看到的」:地貌构成与地界名占大头,
 * 因为那是玩家判断「是不是又是那个世界」的主要依据
 */
export function visibleDistance(a: MortalWorld, b: MortalWorld): number {
  const va = visibleFeatures(a)
  const vb = visibleFeatures(b)
  return (
    0.25 * jaccard(va.terrains, vb.terrains) +
    0.25 * jaccard(va.placeNames, vb.placeNames) +
    0.15 * jaccard(va.bossNames, vb.bossNames) +
    0.1 * (va.head === vb.head && va.tail === vb.tail ? 0 : 1) +
    0.1 * seqDistance(va.eventDensity, vb.eventDensity) +
    0.1 * seqDistance(va.shape, vb.shape) +
    0.05 * (va.bias === vb.bias ? 0 : 1)
  )
}

/**
 * 分维度的可见距离。
 *
 * 聚合值会骗人:地界名每次从 20 处里换 6 处,jaccard 天然高分,
 * 足以把「路线节奏一模一样」这种硬伤平均掉。
 * 要判断玩家会不会觉得「又来了」,必须逐维看
 */
export function visibleDistanceByDim(a: MortalWorld, b: MortalWorld): Record<string, number> {
  const va = visibleFeatures(a)
  const vb = visibleFeatures(b)
  return {
    地貌构成: jaccard(va.terrains, vb.terrains),
    地界名: jaccard(va.placeNames, vb.placeNames),
    首领名: jaccard(va.bossNames, vb.bossNames),
    首尾同型: va.head === vb.head && va.tail === vb.tail ? 0 : 1,
    事件密度: seqDistance(va.eventDensity, vb.eventDensity),
    路线形状: seqDistance(va.shape, vb.shape),
    资源偏向: va.bias === vb.bias ? 0 : 1
  }
}

/** 一组世界在各可见维度上的平均距离 */
export function avgVisibleByDim(worlds: MortalWorld[]): Record<string, number> {
  const acc: Record<string, number> = {}
  let n = 0
  for (let i = 0; i < worlds.length; i += 1) {
    for (let j = i + 1; j < worlds.length; j += 1) {
      const d = visibleDistanceByDim(worlds[i]!, worlds[j]!)
      for (const [k, v] of Object.entries(d)) acc[k] = (acc[k] ?? 0) + v
      n += 1
    }
  }
  for (const k of Object.keys(acc)) acc[k] = acc[k]! / Math.max(1, n)
  return acc
}

/** 可见新颖度 = 与历史最近邻的可见距离 */
export function visibleNovelty(w: MortalWorld, history: MortalWorld[]): number {
  if (history.length === 0) return 1
  return Math.min(...history.map(h => visibleDistance(w, h)))
}

export interface NoveltyGap {
  structural: number
  visible: number
  /** 结构 - 可见;为正说明内部变了但玩家看不出来 */
  gap: number
}

/** 结构新颖度与可见新颖度的落差 —— 本次审计的核心读数 */
export function noveltyGap(w: MortalWorld, history: MortalWorld[]): NoveltyGap {
  const structural = mortalNovelty(w, history)
  const visible = visibleNovelty(w, history)
  return { structural, visible, gap: structural - visible }
}

// ============ 三、体验骨架去重 ============

/**
 * 玩家可见骨架 —— 比结构指纹粗得多,正因如此才贴近「又来了」的感觉。
 *
 * 连续几世骨架相同,即使内部敌人机制完全不同,玩家依然会觉得重复
 */
export function skeletonOf(w: MortalWorld): string {
  const v = visibleFeatures(w)
  const id = worldIdentity(w)
  return [id.terrain, id.theme, v.head, v.tail, v.eventDensity.join(''), v.shape.join('-'), v.bias].join('|')
}

export interface SkeletonRepeat {
  /** 骨架种类数 */
  distinct: number
  /** 最长连续重复次数 */
  longestRun: number
  /** 是否存在连续重复 */
  hasConsecutive: boolean
}

export function skeletonRepeats(worlds: MortalWorld[]): SkeletonRepeat {
  const keys = worlds.map(skeletonOf)
  let longest = 1
  let run = 1
  for (let i = 1; i < keys.length; i += 1) {
    run = keys[i] === keys[i - 1] ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  return { distinct: new Set(keys).size, longestRun: longest, hasConsecutive: longest > 1 }
}

/** 骨架各维的实际取值数 —— 找出哪一维是死的 */
export function skeletonDimensions(worlds: MortalWorld[]): { dim: string; values: number; sample: string }[] {
  const dims: { dim: string; get: (w: MortalWorld) => string }[] = [
    { dim: '主地貌', get: w => worldIdentity(w).terrain },
    { dim: '规则主题', get: w => worldIdentity(w).theme },
    { dim: '首地界类型', get: w => visibleFeatures(w).head },
    { dim: '尾地界类型', get: w => visibleFeatures(w).tail },
    { dim: '事件密度结构', get: w => visibleFeatures(w).eventDensity.join('') },
    { dim: '路线形状', get: w => visibleFeatures(w).shape.join('-') },
    { dim: '资源偏向', get: w => w.bias }
  ]
  return dims.map(d => {
    const vals = worlds.map(d.get)
    return { dim: d.dim, values: new Set(vals).size, sample: [...new Set(vals)].slice(0, 3).join(' / ') }
  })
}

// ============ 四、骨架新颖度(独立指标,不与结构分平均) ============

/**
 * 体验形状距离。
 *
 * 与结构新颖度**刻意分开**:后者管规则、敌人机制、解法空间;
 * 这里管玩家实际感受到的推进形状 —— 走几段、每段跨多大、
 * 什么时候忙什么时候闲、地貌怎么排。
 *
 * 上一轮已经证明:把两者平均成一个总分,高分维度会把恒为 0 的
 * 维度整个吃掉。故本指标独立取值、独立设门
 */
export function skeletonDistance(a: MortalWorld, b: MortalWorld): number {
  const va = visibleFeatures(a)
  const vb = visibleFeatures(b)
  const ia = worldIdentity(a)
  const ib = worldIdentity(b)
  return (
    // 段数不同本身就是很强的差异
    0.2 * (va.shape.length === vb.shape.length ? 0 : 1) +
    0.25 * shapeCurveDistance(va.shape, vb.shape) +
    0.25 * shapeCurveDistance(va.eventDensity, vb.eventDensity) +
    0.15 * seqDistance(
      va.terrains.map(t => TERRAIN_INDEX[t]),
      vb.terrains.map(t => TERRAIN_INDEX[t])
    ) +
    0.1 * (va.head === vb.head && va.tail === vb.tail ? 0 : 1) +
    0.05 * (ia.theme === ib.theme ? 0 : 1)
  )
}

const TERRAIN_INDEX: Record<TerrainAxis, number> = {
  山岳: 0,
  林泽: 1,
  火域: 2,
  天象: 3,
  废墟: 4,
  幽冥: 5
}

/**
 * 曲线距离:长度可不同,按归一化位置比较形状。
 *
 * 比的是**形状**而非绝对值 —— 四段的短促路线与六段的匀进路线
 * 应当判为不同,即使起止层级相同
 */
function shapeCurveDistance(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 1
  const n = Math.max(a.length, b.length)
  const at = (arr: number[], i: number): number => arr[Math.round((i * (arr.length - 1)) / Math.max(1, n - 1))]!
  const range = (arr: number[]): number => Math.max(1, Math.max(...arr) - Math.min(...arr))
  const ra = range(a)
  const rb = range(b)
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    const na = (at(a, i) - Math.min(...a)) / ra
    const nb = (at(b, i) - Math.min(...b)) / rb
    sum += Math.abs(na - nb)
  }
  return Math.min(1, sum / n / 0.5)
}

/** 骨架新颖度 = 与历史最近邻的体验形状距离 */
export function skeletonNovelty(w: MortalWorld, history: MortalWorld[]): number {
  if (history.length === 0) return 1
  return Math.min(...history.map(h => skeletonDistance(w, h)))
}

/** 事件节奏单独取值 —— 它在骨架里只占 0.25,单独看才不会被稀释 */
export function rhythmNovelty(w: MortalWorld, history: MortalWorld[]): number {
  if (history.length === 0) return 1
  const va = visibleFeatures(w)
  return Math.min(...history.map(h => shapeCurveDistance(va.eventDensity, visibleFeatures(h).eventDensity)))
}

export { MUTATOR_THEMES, THEME_IDENTITY }
