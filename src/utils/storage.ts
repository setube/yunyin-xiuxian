/**
 * 存档底层工具 —— localStorage 安全读写 / 导出导入 / 损坏保护
 * 所有落盘内容均经 AES 加密(见 utils/crypto.ts),读取时兼容旧版明文
 */

import type { StateTree } from 'pinia'
import { encryptSave, readSaveText } from './crypto'
import { isHerbGrade } from '@/data/herbGrades'

export const SAVE_PREFIX = 'yunyin.'
export const SAVE_VERSION = 2
/**
 * 启动扫描隔离出来的损坏分片存在这个前缀下(原密文原样保留)。
 * 前缀 + 分片键:键名仍带 SAVE_PREFIX,清档时一并清掉。
 */
export const CORRUPT_PREFIX = 'corrupt.'

/**
 * 参与持久化的分片清单:导出/导入/清档/损坏扫描的唯一范围,漏一项即存档少一块且无提示。
 * spec 钉:saveRoundTrip(从源码倒推)。
 */
export const PERSISTED_STORES = [
  'game',
  'player',
  'resources',
  'inventory',
  'cultivation',
  'dongfu',
  'adventure',
  'quests',
  'settings',
  'loadouts',
  'endgame',
  'lore',
  'market',
  'apprentice',
  'bounty',
  /** 节奏遥测:store id 是 pacingTelemetry,分片键取 'pacing' */
  'pacing',
  /** 异常留档(store id 是 diag):不是游戏进度,但须随「导出存档」一起走(玩家报问题只交导出文件) */
  'diag'
] as const

/** 分片中文名(界面提示用,如「哪一片坏了」);须与 PERSISTED_STORES 同步 */
export const STORE_NAMES: Record<string, string> = {
  game: '开局',
  player: '角色',
  resources: '资源',
  inventory: '背包',
  cultivation: '修炼',
  dongfu: '洞府',
  adventure: '历练',
  quests: '任务与成就',
  settings: '设置',
  loadouts: '构筑',
  endgame: '终局',
  lore: '认知',
  market: '坊市',
  apprentice: '道童',
  bounty: '悬赏',
  pacing: '节奏遥测',
  diag: '异常留档'
}

export function storageKey(storeId: string): string {
  return SAVE_PREFIX + storeId
}

/**
 * 刷盘间隔:定期批量写,不按每次变更写。
 * 每次变更都写即每秒 3~6 次 AES(crypto-js 纯 JS)+ Android WebView 同步落盘,手机持续发热。
 * 少写几秒只让 lastActiveAt 稍旧,由离线结算补回。
 */
export const SAVE_FLUSH_MS = 5000

/** 待落盘的分片(明文 JSON;加密推迟到 flush) */
const pending = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

/** 写盘失败状态:失败期间的进度都不进档,不可静默(玩家须有机会先导出备份) */
let writeFailure: { at: number; keys: string[] } | null = null
type WriteFailureHandler = (failure: { at: number; keys: string[] } | null) => void
/** 多个订阅方:App 弹提示、设置页显示状态 */
const writeFailureHandlers = new Set<WriteFailureHandler>()

function emitWriteFailure(failure: { at: number; keys: string[] } | null): void {
  for (const handler of writeFailureHandlers) handler(failure)
}

/** 订阅写盘失败/恢复(注册方负责提示玩家);返回退订函数 */
export function subscribeSaveWriteFailure(handler: WriteFailureHandler): () => void {
  writeFailureHandlers.add(handler)
  return () => {
    writeFailureHandlers.delete(handler)
  }
}

/** 此刻的写盘失败状态(界面读它显示警告);未失败为 null */
export function saveWriteFailure(): { at: number; keys: string[] } | null {
  return writeFailure
}

/** 立即把待落盘内容写出去;单个分片失败时留在队列里等下一次重试 */
export function flushSaveWrites(): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
  if (pending.size === 0) return
  const failed: string[] = []
  for (const [key, plain] of pending) {
    try {
      localStorage.setItem(key, encryptSave(plain))
    } catch {
      // 单键失败不阻断其余键
      failed.push(key)
    }
  }
  for (const key of pending.keys()) {
    if (!failed.includes(key)) pending.delete(key)
  }
  if (failed.length > 0) {
    const first = writeFailure === null
    writeFailure = { at: Date.now(), keys: failed }
    if (first) emitWriteFailure(writeFailure)
    // 自动重试,不等下一次变更
    if (flushTimer === undefined) flushTimer = setTimeout(flushSaveWrites, SAVE_FLUSH_MS)
    return
  }
  if (writeFailure !== null) {
    writeFailure = null
    emitWriteFailure(null)
  }
}

/** 丢弃待落盘内容;清档/导入前必须调用,否则排队的旧数据会把新状态覆盖回去 */
export function dropPendingWrites(): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
  pending.clear()
  /*
   * 一次性明文缓存与待落盘队列是同一类东西:都是「磁盘之外还留着的一份明文」。
   * 清档 / 导入前不一起丢,新存档的水合就可能读到上一个存档解出来的明文 ——
   * 那正是导入确认窗背后最不该发生的事。
   */
  preloadedPlain.clear()
}

/**
 * 启动期一次性明文缓存(键 → 已解密的 JSON 文本)。
 *
 * `preflightScan` 为了判断坏档必须把每一片都解密一遍;而紧接着 Pinia 水合要用同一份东西,
 * 会把每一片**再解密一遍**。满包档(108 件装备)单片解密约 3ms,17 片就是五十多毫秒,
 * 且两份成本叠在同一个启动长任务里。
 *
 * 扫描时顺手把明文放进来,水合取过即删:
 *  · 只影响「扫描之后、水合之前」这一小段,之后一切照旧走磁盘与待落盘队列;
 *  · 用 pending 的同一把判据 —— 队列里已有更新态时以队列为准;
 *  · 读过一次就从缓存里删掉,取不到就老老实实重解密。
 */
const preloadedPlain = new Map<string, string>()

/** 节流存储层:变更先入队,到点批量加密落盘;getItem 须先读队列,否则刚写又读拿到磁盘旧值 */
const THROTTLED_STORAGE = {
  getItem: (key: string): string | null => {
    const queued = pending.get(key)
    if (queued !== undefined) return queued
    const preloaded = preloadedPlain.get(key)
    if (preloaded !== undefined) {
      // 取过即删:水合只读一次,留着等于多一份可能过期的明文
      preloadedPlain.delete(key)
      return preloaded
    }
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  /** 扫描期专用:记下已解密的明文,供水合那一次读取复用 */
  preload(key: string, plain: string): void {
    preloadedPlain.set(key, plain)
  },
  setItem: (key: string, value: string): void => {
    pending.set(key, value)
    if (flushTimer === undefined) flushTimer = setTimeout(flushSaveWrites, SAVE_FLUSH_MS)
  },
  removeItem: (key: string): void => {
    pending.delete(key)
    try {
      localStorage.removeItem(key)
    } catch {
      // 存储不可用时忽略
    }
  }
}

// 离开/切后台时立刻落盘:手机上 beforeunload 常不触发,pagehide 才可靠。
// 注册在模块内,不依赖引擎是否启动;测试环境无 DOM
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSaveWrites)
  window.addEventListener('beforeunload', flushSaveWrites)
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaveWrites()
  })
}

/**
 * 另一个标签页也在跑同一份存档。
 *
 * 两页各自持一份内存状态、各自每 5 秒落盘,后写的整片覆盖先写的 —— 两边都会掉进度,
 * 且玩家毫无察觉。检测到就报一声,由 UI 提示「另开一页」。
 */
let otherTabActive = false
type OtherTabHandler = (active: boolean) => void
const otherTabHandlers = new Set<OtherTabHandler>()

/** 订阅「别的标签页开始/停止写档」;返回退订函数 */
export function subscribeOtherTabSave(handler: OtherTabHandler): () => void {
  otherTabHandlers.add(handler)
  return () => {
    otherTabHandlers.delete(handler)
  }
}

/** 本页活着的心跳键;别的标签页靠它知道对面还开着 */
const LIVE_KEY = SAVE_PREFIX + '__live'
const LIVE_PING_MS = 4000
const LIVE_STALE_MS = LIVE_PING_MS * 3

function markAlive(): void {
  try {
    localStorage.setItem(LIVE_KEY, String(Date.now()))
  } catch {
    // 存储不可用时忽略
  }
}

function setOtherTab(active: boolean): void {
  if (otherTabActive === active) return
  otherTabActive = active
  for (const handler of otherTabHandlers) handler(active)
}

/** 真存档分片的键集合:判重只认这些,其余 yunyin.* 都不是进度 */
const SAVE_SLICE_KEYS = new Set(PERSISTED_STORES.map(id => SAVE_PREFIX + id))

/**
 * storage 事件只在「别的标签页」写入时触发,本页自己的写入不会回调 —— 正合用来判重。
 *
 * 只认**存档分片**;心跳单独比时间戳,免得把心跳当成写档。
 * 原先写的是 `key.startsWith('yunyin.')` —— 那会把 `yunyin.__theme`(首帧主题小键)
 * 也算成「另一页在写档」。实测:另一页切一次主题,A 页就置上 otherTab 且不再复位
 * (复位只在心跳超时时发生),下次真开两页时那条提示已经去重掉了。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === null) return
    if (e.key === LIVE_KEY) {
      const at = Number(e.newValue)
      setOtherTab(Number.isFinite(at) && Date.now() - at < LIVE_STALE_MS)
      return
    }
    if (SAVE_SLICE_KEYS.has(e.key)) setOtherTab(true)
  })
}

let pingTimer: ReturnType<typeof setInterval> | undefined
let pingOnVisible: (() => void) | undefined

/**
 * 开始/停止发心跳。
 *
 * 由调用方按「是否在玩」开关,不在模块加载时就跑:欢迎页、设置页也要每 4 秒写一次 localStorage
 * 太浪费 —— 本项目刻意把存档写入攒到 5 秒一次就是为了手机不发烫。
 * 没开局就没有可被覆盖的进度,不必参与判重。
 */
export function watchOtherTabSave(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!enabled) {
    if (pingTimer !== undefined) {
      clearInterval(pingTimer)
      pingTimer = undefined
    }
    if (pingOnVisible !== undefined) {
      document.removeEventListener('visibilitychange', pingOnVisible)
      pingOnVisible = undefined
    }
    try {
      localStorage.removeItem(LIVE_KEY)
    } catch {
      // 存储不可用时忽略
    }
    setOtherTab(false)
    return
  }
  if (pingTimer !== undefined) return
  const ping = (): void => {
    if (document.visibilityState === 'visible') markAlive()
  }
  pingOnVisible = ping
  // 切回前台立刻补一次,避免判定滞后
  document.addEventListener('visibilitychange', ping)
  pingTimer = setInterval(ping, LIVE_PING_MS)
  markAlive()
}

/**
 * pinia-plugin-persistedstate 序列化器。serialize 只做 JSON,不加密(加密在 flushSaveWrites);
 * deserialize 经 readSaveText,明文(待刷队列)与密文(磁盘)都能解析
 */
export const SAVE_SERIALIZER = {
  serialize: (data: StateTree): string => JSON.stringify(data),
  deserialize: (raw: string): StateTree => JSON.parse(readSaveText(raw)) as StateTree
}

/** 各 store 统一的持久化配置 */
export function persistConfig(storeId: string): {
  key: string
  serializer: typeof SAVE_SERIALIZER
  storage: typeof THROTTLED_STORAGE
} {
  return { key: storageKey(storeId), serializer: SAVE_SERIALIZER, storage: THROTTLED_STORAGE }
}

/**
 * 启动前扫描:损坏的存档移到备份键,避免白屏;返回被隔离的 store id 列表。
 *
 * 解出来的明文顺手交给一次性缓存:紧接着的 Pinia 水合要用同一份东西,
 * 不留下就等于把每一片完整解密两遍(满包档单片约 3ms)。
 * 只给**解析得通**的分片留明文 —— 坏档不进缓存,那条路径原样走备份与隔离。
 */
export function preflightScan(): string[] {
  const corrupted: string[] = []
  preloadedPlain.clear()
  for (const id of PERSISTED_STORES) {
    const key = storageKey(id)
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      const plain = readSaveText(raw)
      JSON.parse(plain)
      THROTTLED_STORAGE.preload(key, plain)
    } catch {
      corrupted.push(id)
      try {
        const raw = localStorage.getItem(key)
        if (raw !== null) localStorage.setItem(CORRUPT_PREFIX + key, raw)
        localStorage.removeItem(key)
      } catch {
        // 存储不可用时放弃备份,仅保证游戏可启动
      }
    }
  }
  return corrupted
}

/**
 * 灵草五品迁移:旧档单标量 `herb` → 一律落凡品(品 1)分账(不丢草,幂等)。
 * 不按当前境界折算;凡品有出口(凡品方子、坊市按品出售),不会成死货。
 */
export function migrateHerbSlice(resources: Record<string, unknown>): Record<string, unknown> {
  const hasMap = 'herbByGrade' in resources
  const scalar =
    typeof resources.herb === 'number' && Number.isFinite(resources.herb as number)
      ? Math.floor(resources.herb as number)
      : 0
  /*
   * 已有分账、且标量没有正贡献时提前返回(绝大多数新档都走这里)。
   *
   * 但**旧字段得先清掉**:标量为负或 NaN 时 scalar 落到 0,
   * `{ herb: -100, herbByGrade: {...} }` 会带着 `herb: -100` 原样返回 ——
   * 下游 sanitize 会丢弃它,可迁移层的契约是「清掉旧字段」,
   * 留着它,下次迁移又会看见这个负标量。实测探针打到过这条。
   */
  if (hasMap && scalar <= 0) {
    if (!('herb' in resources)) return resources
    const trailing = { ...resources }
    delete trailing.herb
    return trailing
  }
  const next = { ...resources }
  const rawMap =
    hasMap && resources.herbByGrade && typeof resources.herbByGrade === 'object'
      ? (resources.herbByGrade as Record<string, unknown>)
      : {}
  const clean: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const [k, v] of Object.entries(rawMap)) {
    const g = Number(k)
    if (!isHerbGrade(g)) continue
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
    clean[g] = Math.max(0, n)
  }
  if (scalar > 0) clean[1] = Math.max(0, (clean[1] ?? 0) + scalar)
  next.herbByGrade = clean
  delete next.herb
  return next
}

/** v1 → v2:单法宝位升级为多法宝位(幂等,顺带清理残留旧字段) */
export function migrateInventorySlice(data: Record<string, unknown>): Record<string, unknown> {
  const hasNew = 'equippedArtifacts' in data
  const hasLegacy = 'equippedArtifact' in data
  if (hasNew && !hasLegacy) return data
  const next = { ...data }
  if (!hasNew) {
    const legacy = data.equippedArtifact
    next.equippedArtifacts = typeof legacy === 'string' && legacy ? [legacy] : []
  }
  delete next.equippedArtifact
  return next
}

/** 本地存档结构升级(在 Pinia 水合之前执行);只有真发生了迁移才回写 */
export function migrateLocalSchema(): void {
  try {
    const invKey = storageKey('inventory')
    const invRaw = localStorage.getItem(invKey)
    if (invRaw !== null) {
      const inv = JSON.parse(readSaveText(invRaw)) as Record<string, unknown>
      const migrated = migrateInventorySlice(inv)
      if (migrated !== inv) {
        localStorage.setItem(invKey, encryptSave(JSON.stringify(migrated)))
        // 迁移写回了新形态:扫描时缓存的那份旧明文必须作废,否则水合会把迁移原地撤销
        preloadedPlain.delete(invKey)
      }
    }
    const resKey = storageKey('resources')
    const resRaw = localStorage.getItem(resKey)
    if (resRaw !== null) {
      const res = JSON.parse(readSaveText(resRaw)) as Record<string, unknown>
      const migrated = migrateHerbSlice(res)
      if (migrated !== res) {
        localStorage.setItem(resKey, encryptSave(JSON.stringify(migrated)))
        preloadedPlain.delete(resKey)
      }
    }
  } catch {
    // 损坏数据交由 preflightScan 兜底
  }
}

export interface ExportPayload {
  game: string
  version: number
  exportedAt: number
  data: Record<string, unknown>
  /**
   * 启动时被隔离的损坏分片(原密文)。
   * 「原档留在本机」若只在 localStorage 里躺着,玩家没有任何办法把它交出来——
   * 导出随包带走,报问题时才能把坏档一并给人看。导入时不回写(坏档不该回到存档位)。
   */
  corrupted?: Record<string, string>
  /**
   * 导出时读不出、因而**没能装进 data** 的分片 id。
   *
   * 原先那个 catch 是空吞:分片解不出就少装一片,而导出照报「已导出」——
   * 玩家以为备份好了,恢复时才发现少一截,且没有任何信号。
   * 现在把丢掉的记下来:调用方据此把结果降级成警告,`ExportPayload` 自己也留着这段,
   * 报问题时能看出这份文件本来就不全。
   */
  missing?: string[]
}

export function buildExportPayload(): ExportPayload {
  // 导出直接读 localStorage,须先落盘,否则导出的是旧档
  flushSaveWrites()
  const data: Record<string, unknown> = {}
  const missing: string[] = []
  for (const id of PERSISTED_STORES) {
    const key = storageKey(id)
    try {
      // 待落盘队列里的是内存最新态(写盘失败时磁盘还停在旧值),优先于 localStorage
      const plain = pending.get(key)
      if (plain !== undefined) {
        data[id] = JSON.parse(plain)
        continue
      }
      const raw = localStorage.getItem(key)
      if (raw !== null) data[id] = JSON.parse(readSaveText(raw))
    } catch {
      // 读不出的分片不阻断整份导出,但必须留名:少装了哪一片要说得出来
      missing.push(id)
    }
  }
  return {
    game: 'yunyin-xiuxian',
    version: SAVE_VERSION,
    exportedAt: Date.now(),
    data,
    ...(corruptedCount() > 0 ? { corrupted: collectCorrupted() } : {}),
    ...(missing.length > 0 ? { missing } : {})
  }
}

/** 收集本机隔离出来的损坏分片(键 → 原密文);没有则空对象 */
export function collectCorrupted(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of PERSISTED_STORES) {
    try {
      const raw = localStorage.getItem(CORRUPT_PREFIX + storageKey(id))
      if (raw !== null) out[id] = raw
    } catch {
      // 存储不可用:拿不到就当没有
    }
  }
  return out
}

/** 本机隔离出来的损坏分片数(导出决定是否带这一段) */
export function corruptedCount(): number {
  return Object.keys(collectCorrupted()).length
}

/**
 * 丢掉本机隔离出来的损坏分片。
 *
 * 与 `clearAllSave` 分开,是因为两条路径的语义不同:
 *   · **导入**走 `clearAllSave` —— 玩家是在换一份存档,本机原档隔离出来的坏档仍要留着
 *     (那是上一位玩家自己的东西,导入方没有资格替人删;判据见 importCorruption.spec)。
 *   · **清空存档**走这里 —— 「清空」的语义是本机不留上一份任何东西,坏档同属上一份。
 *
 * 原先清空存档只清 `PERSISTED_STORES`,而 `corrupt.*` 不在那张表里(preflightScan
 * 把它们移出存档位),于是被整个漏掉:实测清档后 localStorage 只剩
 * `corrupt.yunyin.player`,而 buildExportPayload 见 corruptedCount() > 0 就把这一段
 * 带进导出 —— 玩家清档、重开一局后导出的文件里仍带着上一位的坏档。
 */
export function clearCorrupted(): void {
  for (const id of PERSISTED_STORES) {
    try {
      localStorage.removeItem(CORRUPT_PREFIX + storageKey(id))
    } catch {
      // 存储不可用时放弃清理
    }
  }
}

/** 校验导入数据结构,返回错误信息;null 表示通过 */
export function validateImportPayload(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null) return '存档格式无效'
  const p = obj as Partial<ExportPayload>
  if (p.game !== 'yunyin-xiuxian') return '非本游戏存档'
  if (typeof p.version !== 'number') return '存档缺少版本号'
  if (p.version > SAVE_VERSION) return '存档版本过高'
  if (typeof p.data !== 'object' || p.data === null) return '存档数据段缺失'
  const data = p.data as Record<string, unknown>
  if (typeof data.player !== 'object' || typeof data.game !== 'object') {
    return '存档缺少关键数据'
  }
  return null
}

/**
 * 将导入数据加密写入 localStorage(调用方负责随后 reload)。
 * 先清空再逐片写入;中途失败(如配额不足)回滚到旧档,不留半清的存档(会造出主页空角色)。
 *
 * 回滚快照必须**连待落盘队列一起取**。
 * 原先只读 localStorage,而存档写入是 5 秒节流合并的:玩家刚打完一仗、进度还在 `pending` 里,
 * 磁盘上停着的是最多 5 秒前那份。导入失败时回滚到的就是那份旧档 —— 刚打的那一仗、刚炼的那炉丹,
 * 连同中间所有变更一起没了,而玩家只看到一句「原档已保留」。
 */
export function applyImportPayload(payload: ExportPayload): void {
  // payload.corrupted 是有意不消费的:那是导出方隔离出来的坏档,只供人看,不该回到存档位
  // 快照现有各片(原样密文,回滚时原样写回);队列里有更新态时先落盘,让快照拿到最新那份
  flushSaveWrites()

  const backup = new Map<string, string | null>()
  try {
    for (const id of PERSISTED_STORES) {
      backup.set(id, localStorage.getItem(storageKey(id)))
    }
  } catch {
    // 快照读不出时不阻塞,回滚能力降级
  }
  clearAllSave()
  const failed: string[] = []
  for (const id of PERSISTED_STORES) {
    const slice = payload.data[id]
    if (slice === undefined) continue
    try {
      localStorage.setItem(storageKey(id), encryptSave(JSON.stringify(slice)))
    } catch {
      failed.push(id)
    }
  }
  // 任一失败:救回旧档再抛错,调用方据此说「原档已保留」
  if (failed.length > 0) {
    for (const [id, raw] of backup) {
      try {
        if (raw === null) localStorage.removeItem(storageKey(id))
        else localStorage.setItem(storageKey(id), raw)
      } catch {
        // 回滚尽力而为
      }
    }
    throw new Error('存档写入失败,原档已保留')
  }
}

export function clearAllSave(): void {
  // 先丢弃待落盘队列,否则清完档之后那次 flush 会把旧数据写回来
  dropPendingWrites()
  // 清档后没有待写内容,旧的「写盘失败」警告作废
  if (writeFailure !== null) {
    writeFailure = null
    emitWriteFailure(null)
  }
  for (const id of PERSISTED_STORES) {
    try {
      localStorage.removeItem(storageKey(id))
    } catch {
      // 残留交由下面的兜底处理
    }
  }
  /*
   * 首帧主题标记也要清 —— 它不是玩家数据,但清档后留着会让新角色沿用上一位的角色主题:
   * 实测清档后重进,系统是亮色、新档也回到默认 auto,首帧却仍按残留的 dark 渲染,
   * 直到 App 挂载才翻回来。键名与 core/theme.ts 的 THEME_HINT_KEY 同源(utils 不引 core,故重抄一份)。
   */
  try {
    localStorage.removeItem('yunyin.__theme')
  } catch {
    // 同上面:清不掉就交由重载后的路由守卫兜底
  }
  // removeItem 在个别 WebView 实现上会静默失效:还剩任何一片就整体清空,
  // 半清的存档会卡出主页空角色
  const leftover = PERSISTED_STORES.some(id => {
    try {
      return localStorage.getItem(storageKey(id)) !== null
    } catch {
      return false
    }
  })
  if (leftover) {
    try {
      localStorage.clear()
    } catch {
      // 存储完全不可用,交由重载后的路由守卫兜底
    }
  }
}
