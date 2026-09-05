/**
 * 存档底层工具 —— localStorage 安全读写 / 导出导入 / 损坏保护
 * 所有落盘内容均经 AES 加密(见 utils/crypto.ts),读取时兼容旧版明文
 */

import type { StateTree } from 'pinia'
import { encryptSave, readSaveText } from './crypto'

export const SAVE_PREFIX = 'yunyin.'
export const SAVE_VERSION = 2

/** 参与持久化的 store id 列表(导出/导入/重置的键清单) */
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
  'lore'
] as const

export function storageKey(storeId: string): string {
  return SAVE_PREFIX + storeId
}

/**
 * 刷盘间隔 —— 存档写入从「每次变更」改为「定期批量」。
 *
 * 起因是玩家反馈手机越玩越烫。实测引擎跑起来后仅 game/player/resources
 * 三片就是**每秒 3 次** localStorage 写入(真实游玩加上 adventure、dongfu、
 * quests 会到 4~6 次),每次都要 JSON 序列化 + 全片 AES 加密 + 主线程同步
 * 磁盘写。挂机一天约 26 万次 —— crypto-js 是纯 JS 实现,localStorage.setItem
 * 在 Android WebView 上又是同步落盘,两者叠加就是持续发热。
 *
 * 丢数据的风险很低且能自愈:引擎是时间戳驱动的,少写几秒只意味着
 * lastActiveAt 稍旧,下次进游戏由离线结算把这段时间补回来
 */
export const SAVE_FLUSH_MS = 5000

/** 待落盘的分片(明文 JSON;加密推迟到 flush,避免每次变更都跑一遍 AES) */
const pending = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

/** 立即把待落盘内容写出去 */
export function flushSaveWrites(): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
  if (pending.size === 0) return
  for (const [key, plain] of pending) {
    try {
      // 加密只在这里做一次,而不是每次 store 变更都做
      localStorage.setItem(key, encryptSave(plain))
    } catch {
      // 单键失败不阻断其余键
    }
  }
  pending.clear()
}

/** 丢弃待落盘内容 —— 清档/导入前必须调用,否则排队的旧数据会把新状态覆盖回去 */
export function dropPendingWrites(): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
  pending.clear()
}

/**
 * 节流存储层:变更先入队,到点批量加密落盘。
 *
 * getItem 必须优先读队列,否则「刚写又读」会拿到磁盘上的旧值
 */
const THROTTLED_STORAGE = {
  getItem: (key: string): string | null => {
    const queued = pending.get(key)
    if (queued !== undefined) return queued
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
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

// 页面离开/切后台时立刻落盘 —— 手机上 beforeunload 常不触发,pagehide 才可靠。
// 注册在模块内,不依赖引擎是否启动;测试环境无 DOM,故两者都要判
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
 * pinia-plugin-persistedstate 序列化器。
 *
 * serialize 只做 JSON,**不加密** —— 加密推迟到 flushSaveWrites。
 * deserialize 端无需区分:readSaveText 是 `decryptSave(raw) ?? raw`,
 * 明文(来自待刷队列)与密文(来自磁盘)都能解析
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
 * 启动前扫描:发现损坏的存档直接移到备份键,避免白屏
 * @returns 被隔离的 store id 列表
 */
export function preflightScan(): string[] {
  const corrupted: string[] = []
  for (const id of PERSISTED_STORES) {
    const key = storageKey(id)
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      JSON.parse(readSaveText(raw))
    } catch {
      corrupted.push(id)
      try {
        const raw = localStorage.getItem(key)
        if (raw !== null) localStorage.setItem(`corrupt.${key}`, raw)
        localStorage.removeItem(key)
      } catch {
        // 存储不可用时放弃备份,仅保证游戏可启动
      }
    }
  }
  return corrupted
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

/**
 * 本地存档结构升级(在 Pinia 水合之前执行);顺带把旧明文档一次性转为密文
 */
export function migrateLocalSchema(): void {
  try {
    const key = storageKey('inventory')
    const raw = localStorage.getItem(key)
    if (raw === null) return
    const data = JSON.parse(readSaveText(raw)) as Record<string, unknown>
    const migrated = migrateInventorySlice(data)
    localStorage.setItem(key, encryptSave(JSON.stringify(migrated)))
  } catch {
    // 损坏数据交由 preflightScan 兜底
  }
}

export interface ExportPayload {
  game: string
  version: number
  exportedAt: number
  data: Record<string, unknown>
}

export function buildExportPayload(): ExportPayload {
  // 导出直接读 localStorage,故必须先把待落盘内容写出去,否则导出的是旧档
  flushSaveWrites()
  const data: Record<string, unknown> = {}
  for (const id of PERSISTED_STORES) {
    const raw = localStorage.getItem(storageKey(id))
    if (raw !== null) {
      try {
        data[id] = JSON.parse(readSaveText(raw))
      } catch {
        // 跳过损坏分片
      }
    }
  }
  return { game: 'yunyin-xiuxian', version: SAVE_VERSION, exportedAt: Date.now(), data }
}

/** 校验导入数据结构,返回错误信息;null 表示通过 */
export function validateImportPayload(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null) return '存档内容不是有效对象'
  const p = obj as Partial<ExportPayload>
  if (p.game !== 'yunyin-xiuxian') return '并非《云隐修仙录》的存档文件'
  if (typeof p.version !== 'number') return '存档缺少版本号'
  if (p.version > SAVE_VERSION) return '存档版本高于当前游戏版本,无法导入'
  if (typeof p.data !== 'object' || p.data === null) return '存档数据段缺失'
  const data = p.data as Record<string, unknown>
  if (typeof data.player !== 'object' || typeof data.game !== 'object') {
    return '存档缺少关键数据(player/game)'
  }
  return null
}

/** 将导入数据加密写入 localStorage(调用方负责随后 reload)。先清空现有存档,再写入导入数据,确保完全覆盖 */
export function applyImportPayload(payload: ExportPayload): void {
  // 先清空所有现有存档
  clearAllSave()
  // 再写入导入的数据
  for (const id of PERSISTED_STORES) {
    const slice = payload.data[id]
    if (slice !== undefined) {
      localStorage.setItem(storageKey(id), encryptSave(JSON.stringify(slice)))
    }
  }
}

export function clearAllSave(): void {
  // 先丢弃待落盘队列 —— 否则清完档之后那次 flush 会把旧数据原样写回来
  dropPendingWrites()
  for (const id of PERSISTED_STORES) {
    try {
      localStorage.removeItem(storageKey(id))
    } catch {
      // 单键失败不阻断其余键,残留交由下面的兜底处理
    }
  }
  // 校验删除结果:removeItem 在个别 WebView 实现上会静默失效,
  // 只要还剩任何一片就整体清空——半清的存档比清干净更糟,
  // 会出现「game 分片还在、player 分片没了」这种卡在主页的空角色
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
