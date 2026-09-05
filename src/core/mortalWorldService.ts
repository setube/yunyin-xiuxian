/**
 * 本世之界 —— 生成世界与玩家之间的服务层
 *
 * 生成器阶段已经证明「不同世界」在系统层成立(761 项测试:素材、生态、
 * 规则、路线骨架、事件节奏、四门独立验收、历史去重)。剩下的问题只有一句:
 *
 *   **玩家接触到生成世界之后,是否真的把它理解成「这一世不一样」。**
 *
 * 本模块是那条最小纵切的中段:持有本世世界、按需生成、转世时重置,
 * 并把生成结果翻译成玩家看得懂的东西 —— 世界身份、路线轮廓、地界列表。
 *
 * ## 刻意不做的事
 *
 * - **不接管历练**:实际战斗仍走 REGIONS,两者用 fromId 对应。
 *   先证明玩家能理解「这一世的世界」,再谈让它接管战斗数据。
 * - **不碰道果**:道果现在还不该出售一个尚未经过真实体验验证的东西。
 * - **不向玩家暴露算法**:骨架模板名(短促/匀进/长尾…)与事件密度数字
 *   都是内部概念,UI 只呈现视觉差异。
 */
import type { MortalWorld } from './mortalWorldGen'
import { generateGatedMortal } from './mortalGate'
import { terrainOf, worldIdentity } from './mortalIdentity'
import { REGIONS } from '@/data/regions'
import { useAdventureStore } from '@/stores/adventure'

/** 生成本世世界所用的历史(暂只与自身去重,跨世历史留待接入轮回时补) */
function historyOf(cur: MortalWorld | null): MortalWorld[] {
  return cur ? [cur] : []
}

/**
 * 取本世之界;没有就生成一个。
 *
 * 生成走四门验收,失败时返回 null —— 调用方须容忍「暂无世界」,
 * 不能假定一定拿得到
 */
export function ensureMortalWorld(): MortalWorld | null {
  const adventure = useAdventureStore()
  if (adventure.mortalWorld) return adventure.mortalWorld
  const got = generateGatedMortal(Date.now() % 1_000_003, [], 200, 8)
  if (!got) return null
  adventure.setMortalWorld(got.report.world)
  return got.report.world
}

/** 换一个本世之界(转世时调用) */
export function rerollMortalWorld(): MortalWorld | null {
  const adventure = useAdventureStore()
  const prev = adventure.mortalWorld
  const got = generateGatedMortal(Date.now() % 1_000_003, historyOf(prev), 200, 8)
  adventure.setMortalWorld(got?.report.world ?? null)
  return got?.report.world ?? null
}

/** 清空(重置存档时) */
export function clearMortalWorld(): void {
  useAdventureStore().setMortalWorld(null)
}

// ============ 本世路线的可达性 ============

/**
 * 本世路线决定本世可达性 —— 这是本轮的核心原则。
 *
 * 关键:按 **route index** 开放,不按 tier。生成器允许
 * `3 → 9 → 7 → 14 → 11` 这类回落,若按层级判定,
 * 第 7 段会因为「层级比前一段低」而被旧式逻辑判为早该开放,
 * 直接与路线顺序矛盾。层级是路线的**特征**,不是解锁顺序。
 */
export function canEnterNode(nodeId: string): boolean {
  const adventure = useAdventureStore()
  const w = adventure.mortalWorld
  if (!w) return false
  const i = w.chain.findIndex(p => p.nodeId === nodeId)
  if (i < 0) return false
  // 首段天然可进入,与旧 REGIONS 解锁链无关
  if (i === 0) return true
  return adventure.mortalCleared.includes(w.chain[i - 1]!.nodeId)
}

/** 本世某节点是否已通 */
export function isNodeCleared(nodeId: string): boolean {
  return useAdventureStore().mortalCleared.includes(nodeId)
}

/**
 * 一处地界当下能否进入 —— **准入判定的唯一出口**。
 *
 * 规则:本世路线只**追加**可达性,从不**收回**旧解锁链已给出的权限。
 * 所以首段无需旧链即可进(追加),路线中段若旧链早已解锁也不上锁(不收回)。
 *
 * 这条规则是被实测逼出来的。此前路线内「只认段序、旧链不得绕过」,
 * 后果有二:
 *
 * 1. 新号旧链只开一处,而路线首段往往排在地界表靠后的位置、
 *    被历练页按旧链截断挡在可见范围外 —— 实测出现**整页 0 个出发按钮**,
 *    历练完全无法开始。
 * 2. 拦截理由指向路线前一段,而前一段可能也被拦,于是玩家读到
 *    「进甲要先通乙、进乙要先通丙」的一串推诿(玩家原话)。
 *
 * 「堵在守卫层」那条旧结论默认玩家总能走到路线首段,
 * 但历练页的可见性一直是旧链算的,两套判据从没对齐过。
 * 代价是老存档可以绕开路线顺序 —— 相比走不动的死锁,这个代价可以接受。
 * 路线顺序对旧链为空的新号仍然完全生效,那才是它该起作用的地方。
 */
export function canEnterRegion(regionId: string): boolean {
  const adventure = useAdventureStore()
  const node = adventure.mortalWorld?.chain.find(p => p.fromId === regionId)
  if (node && canEnterNode(node.nodeId)) return true
  return adventure.unlocked.includes(regionId)
}

/**
 * 进不去的原因 —— 可进入时返回 null。
 *
 * 指向**眼下就能去的那一段**,而不是这处地界在路线上的前一段:
 * 前者可以立刻行动,后者常常自己也被拦着,连起来就是那串
 * 「进甲要先通乙、进乙要先通丙」的推诿。
 *
 * 路线外的地界返回 null,由界面沿用旧链话术「需先击败某某之主」
 */
export function entryBlockReason(regionId: string): string | null {
  if (canEnterRegion(regionId)) return null
  const w = useAdventureStore().mortalWorld
  if (!w || !w.chain.some(p => p.fromId === regionId)) return null
  const next = w.chain.find(p => canEnterNode(p.nodeId) && !isNodeCleared(p.nodeId))
  return next ? `本世路线尚未行至此处,眼下该往「${next.name}」。` : null
}

/**
 * 通关某处地界后推进本世路线。
 *
 * 由 exploration.clearRegionAndUnlockNext 调用(在线/离线共用)。
 * 一条路线内区域不重复,故 fromId 可唯一定位节点
 */
export function advanceRoute(regionId: string): string | null {
  const adventure = useAdventureStore()
  const w = adventure.mortalWorld
  if (!w) return null
  const node = w.chain.find(p => p.fromId === regionId)
  if (!node) return null
  if (!adventure.markNodeCleared(node.nodeId)) return null
  const i = w.chain.findIndex(p => p.nodeId === node.nodeId)
  const next = w.chain[i + 1]
  return next ? next.name : null
}

// ============ 本世内容:节点是唯一事实来源 ============

/**
 * 一处地界这一世的实际内容。
 *
 * **REGIONS 从此降为静态素材库**,不再是第二个事实来源 ——
 * 敌群、首领、事件标签一律取自本世路线节点。否则会退回
 * 「世界节点一套、REGIONS 一套」的两套模型。
 *
 * 无本世之界时(生成失败或极老存档)才退回 REGIONS,
 * 这是兼容路径,不是并行路径
 */
export interface PlaceContent {
  enemies: readonly string[]
  boss: string
  eventTags: readonly string[]
  /** true 表示走的是老存档兼容路径 */
  fromLegacy: boolean
}

/**
 * 取某处地界这一世的内容。
 *
 * 关键约束:**只有在本世路线内的区域才能拿到世界内容**。
 * 路线之外的区域即使 REGIONS 里有数据,也不该越权取用 ——
 * 那等于绕过世界边界(见 core/overviewNecessity.ts)
 */
export function placeContent(regionId: string): PlaceContent {
  const w = useAdventureStore().mortalWorld
  const node = w?.chain.find(p => p.fromId === regionId)
  if (node) {
    return { enemies: node.enemies, boss: node.boss, eventTags: node.eventTags, fromLegacy: false }
  }
  const r = REGIONS.find(x => x.id === regionId)
  return {
    enemies: r?.enemies ?? [],
    boss: r?.boss ?? '',
    eventTags: r?.eventTags ?? [],
    fromLegacy: true
  }
}

// ============ 翻译成玩家看得懂的东西 ============

/**
 * 一段地界在界面上的呈现。
 *
 * 坐标是给 SVG 用的:x 按累积路程分布,**y 绑定实际层级** ——
 * 这样「3 → 9 → 5 → 12 → 11 → 17」会真的画成上下起伏,
 * 而不是被 abs(跨度) 压成一条「忽远忽近」的直线
 */
export interface PlaceView {
  /** 路线节点 id —— 可达性的凭据 */
  nodeId: string
  /** 对应的真实区域 id —— 战斗数据仍取自它 */
  regionId: string
  name: string
  /** 地貌轴,玩家可见的分类 */
  terrain: string
  /** SVG 横坐标(0~VIEW_W) */
  x: number
  /** SVG 纵坐标:层级越高越靠上 */
  y: number
  /** 节点半径,按**世界内相对**事件密度归一化 —— 平稳节奏也仍有层级 */
  r: number
  /** 事件多寡:1~5,列表里用点数表达 */
  eventLevel: number
  /** 首领名 */
  bossName: string
}

/** 路线图的 viewBox 尺寸 */
export const VIEW_W = 300
export const VIEW_H = 64

export interface WorldView {
  /** 世界身份,玩家第一眼看到的那句话 */
  title: string
  summary: string
  /** 贯穿本世的规则(玩家可见) */
  ruleText: string
  places: PlaceView[]
}

function regionName(id: string): string {
  return REGIONS.find(r => r.id === id)?.name ?? id
}

/**
 * 把生成结果翻译成界面数据。
 *
 * 注意这里**不输出**骨架模板名与事件密度数字 ——
 * 玩家没必要知道这一世走的是「长尾」还是「前缓后陡」,
 * 只需要看出路线长得不一样
 */
export function worldView(w: MortalWorld, bossNameOf: (id: string) => string): WorldView {
  const id = worldIdentity(w)
  const tiers = w.chain.map(p => p.tier)
  const lo = Math.min(...tiers)
  const hi = Math.max(...tiers)
  const range = Math.max(1, hi - lo)

  // 横坐标按累积路程:跨度大的一段占更宽的横向距离。
  // 不设固定最小间距 —— 固定基础宽度会把跨度差异整个压平
  const spans = w.chain.map((p, i) => (i === 0 ? 0 : Math.abs(p.tier - w.chain[i - 1]!.tier)))
  const total = spans.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  const xs = spans.map(sp => {
    acc += sp
    return acc / total
  })

  // 节点半径按**世界内相对**密度:平稳节奏(密度全等)也给一个居中的统一尺寸,
  // 而不是让绝对值决定 —— 否则「点大处事多」在平稳世界里完全失效
  const dens = w.chain.map(p => p.eventTags.length)
  const dlo = Math.min(...dens)
  const dhi = Math.max(...dens)
  const drange = dhi - dlo

  const pad = 12
  const places: PlaceView[] = w.chain.map((p, i) => {
    const rel = drange === 0 ? 0.5 : (dens[i]! - dlo) / drange
    return {
      nodeId: p.nodeId,
      regionId: p.fromId,
      name: regionName(p.fromId),
      terrain: terrainOf(p.fromId),
      x: pad + xs[i]! * (VIEW_W - pad * 2),
      // 层级越高越靠上
      y: VIEW_H - pad - ((p.tier - lo) / range) * (VIEW_H - pad * 2),
      r: 3 + rel * 3.5,
      eventLevel: Math.max(1, Math.min(5, p.eventTags.length)),
      bossName: bossNameOf(p.boss)
    }
  })
  return { title: id.name, summary: id.summary, ruleText: w.ruleName, places }
}
