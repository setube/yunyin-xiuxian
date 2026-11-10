/**
 * 本世之界:生成世界与玩家之间的服务层。
 * 持有本世世界、按需生成、转世时重置,并翻译成界面数据(世界身份、路线轮廓、地界列表)。
 * 与 REGIONS 用 fromId 对应。刻意不碰道果。
 */
import type { MortalWorld } from './mortalWorldGen'
import { generateMortalWorld } from './mortalWorldGen'
import { generateGatedMortalAsync } from './mortalGate'
import { terrainOf, worldIdentity } from './mortalIdentity'
import { REGIONS } from '@/data/regions'
import { useAdventureStore } from '@/stores/adventure'

/**
 * 种子池模数(质数)与同秒步进;种子 = 墙钟秒位 + 同秒第几回 × 步进,同秒连转不撞同一世界。
 * 步进须与 `generateGatedMortal` 的候选步长 7919 互质(取 104729):取 7919 只会平移进同一条候选链。
 */
const SEED_POOL = 1_000_003
const SEED_STEP = 104729

/**
 * 跨世去重的历史深度:四门验收的 history 取最近几世,不止当前世界。
 * 不留全部:history 越长验收越难过,会逼向「无世界可交」。
 */
const HISTORY_DEPTH = 3

/** 历世种子记录:只留种子,不把整份世界存进存档 */
interface WorldLedger {
  /** 历世用过的种子,末位是最近一世 */
  seeds: number[]
  /** 已生成几回(区分同秒连转) */
  draws: number
  /** 上一回的墙钟秒位;跨秒即重置 draws */
  lastSecond: number
}

const ledger: WorldLedger = { seeds: [], draws: 0, lastSecond: -1 }

/** 取一个本进程内不重复的种子;同一秒内的连续调用各得一个 */
function nextSeed(): number {
  const second = Date.now() % SEED_POOL
  ledger.draws = ledger.lastSecond === second ? ledger.draws + 1 : 0
  ledger.lastSecond = second
  return (second + ledger.draws * SEED_STEP) % SEED_POOL
}

/** 历世之界的历史(与最近几世去重) */
function historyOf(cur: MortalWorld | null): MortalWorld[] {
  const out: MortalWorld[] = []
  // 顺序不影响结果:判据取与历史最近邻的距离
  for (const seed of ledger.seeds) {
    if (seed === cur?.seed) continue
    out.push(generateMortalWorld(seed))
    if (out.length >= HISTORY_DEPTH) break
  }
  return out
}

/** 正在凝界:防重入(切页来回会连开两次) */
let generating = false

/**
 * 取本世之界,没有就现凝一个;四门验收失败返回 null,调用方须容忍「暂无世界」。
 *
 * 生成是分块异步的:实测单候选 15~50ms,maxTries=200 时整趟最坏 151ms、
 * 玩家首次进「界域志」量到过 230ms 的长任务。同步跑等于切页那一帧整页僵住。
 */
export async function ensureMortalWorld(): Promise<MortalWorld | null> {
  const adventure = useAdventureStore()
  if (adventure.mortalWorld) return adventure.mortalWorld
  if (generating) return null
  generating = true
  try {
    const got = await generateGatedMortalAsync(nextSeed(), historyOf(adventure.mortalWorld), 200, 8)
    if (!got) return null
    ledger.seeds = [...ledger.seeds, got.report.world.seed].slice(-HISTORY_DEPTH)
    adventure.setMortalWorld(got.report.world)
    return got.report.world
  } finally {
    generating = false
  }
}

/** 换一个本世之界(转世时调用) */
export async function rerollMortalWorld(): Promise<MortalWorld | null> {
  const adventure = useAdventureStore()
  const prev = adventure.mortalWorld
  if (generating) return prev
  generating = true
  try {
    const got = await generateGatedMortalAsync(nextSeed(), historyOf(prev), 200, 8)
    if (got) ledger.seeds = [...ledger.seeds, got.report.world.seed].slice(-HISTORY_DEPTH)
    adventure.setMortalWorld(got?.report.world ?? null)
    return got?.report.world ?? null
  } finally {
    generating = false
  }
}

// ============ 本世路线的可达性 ============

/** 本世路线决定本世可达性:按 route index 开放,不按 tier(路线允许层级回落;层级是路线特征,不是解锁顺序) */
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
 * 一处地界当下能否进入 —— 准入判定的唯一出口。
 * 本世路线只追加可达性,不收回旧解锁链已给出的权限:首段无需旧链即可进,路线中段旧链已解锁也不上锁。
 * 路线内只认段序会让新号整页 0 个出发按钮(历练页可见性按旧链截断);代价是老存档可绕开路线顺序,
 * 旧链为空的新号仍完全受路线顺序约束。
 */
export function canEnterRegion(regionId: string): boolean {
  const adventure = useAdventureStore()
  const node = adventure.mortalWorld?.chain.find(p => p.fromId === regionId)
  if (node && canEnterNode(node.nodeId)) return true
  return adventure.unlocked.includes(regionId)
}

/**
 * 进不去的原因;可进入时返回 null。
 * 指向眼下就能去的那一段,不指向路线前一段(前一段常常自己也被拦)。
 * 路线外的地界返回 null,由界面沿用旧链话术。
 */
export function entryBlockReason(regionId: string): string | null {
  if (canEnterRegion(regionId)) return null
  const w = useAdventureStore().mortalWorld
  if (!w || !w.chain.some(p => p.fromId === regionId)) return null
  const next = w.chain.find(p => canEnterNode(p.nodeId) && !isNodeCleared(p.nodeId))
  return next ? `需先通「${next.name}」` : null
}

/**
 * 通关某处地界后推进本世路线;由 exploration.clearRegionAndUnlockNext 调用(在线/离线共用)。
 * 一条路线内区域不重复,fromId 可唯一定位节点。
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
 * 一处地界这一世的实际内容:敌群、首领、事件标签取自本世路线节点,REGIONS 只作静态素材库。
 * 无本世之界(生成失败或极老存档)才退回 REGIONS —— 兼容路径,不是并行路径。
 */
export interface PlaceContent {
  enemies: readonly string[]
  boss: string
  eventTags: readonly string[]
  /** true 表示走的是老存档兼容路径 */
  fromLegacy: boolean
}

/** 取某处地界这一世的内容;只有本世路线内的区域拿得到世界内容(见 core/overviewNecessity.ts) */
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
 * SVG 坐标:x 按累积路程,y 绑定实际层级(用 abs(跨度) 会把起伏压成直线)。
 */
export interface PlaceView {
  /** 路线节点 id,可达性的凭据 */
  nodeId: string
  /** 对应的真实区域 id;战斗数据取自它 */
  regionId: string
  name: string
  /** 地貌轴 */
  terrain: string
  /** SVG 横坐标(0~VIEW_W) */
  x: number
  /** SVG 纵坐标:层级越高越靠上 */
  y: number
  /** 节点半径:按世界内相对事件密度归一化 */
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
  /** 世界身份 */
  title: string
  summary: string
  /** 贯穿本世的规则(玩家可见) */
  ruleText: string
  places: PlaceView[]
}

function regionName(id: string): string {
  return REGIONS.find(r => r.id === id)?.name ?? id
}

/** 把生成结果翻译成界面数据;不输出骨架模板名与事件密度数字(内部概念) */
export function worldView(w: MortalWorld, bossNameOf: (id: string) => string): WorldView {
  const id = worldIdentity(w)
  const tiers = w.chain.map(p => p.tier)
  const lo = Math.min(...tiers)
  const hi = Math.max(...tiers)
  const range = Math.max(1, hi - lo)

  // 横坐标按累积路程;不设固定最小间距(会压平跨度差异)
  const spans = w.chain.map((p, i) => (i === 0 ? 0 : Math.abs(p.tier - w.chain[i - 1]!.tier)))
  const total = spans.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  const xs = spans.map(sp => {
    acc += sp
    return acc / total
  })

  // 密度全等(平稳节奏)取居中尺寸
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
      y: VIEW_H - pad - ((p.tier - lo) / range) * (VIEW_H - pad * 2),
      r: 3 + rel * 3.5,
      eventLevel: Math.max(1, Math.min(5, p.eventTags.length)),
      bossName: bossNameOf(p.boss)
    }
  })
  return { title: id.name, summary: id.summary, ruleText: w.ruleName, places }
}
