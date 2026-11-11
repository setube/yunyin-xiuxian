/**
 * 异常留档 —— 最近若干条未捕获异常,供玩家复制、供定位
 *
 * - 独立分片(同 pacing 遥测):不随转世清,须随「导出存档」带出
 * - 只记摘要,不记调用栈与玩家数据
 * - 相邻同条只加计数:连发会刷满格子,挤掉第一条
 */
import { defineStore } from 'pinia'
import { truncateCodePoints, asTimestamp } from '@/utils/saveShape'
import { ref } from 'vue'
import { persistConfig } from '@/utils/storage'
import { asArray, asFiniteNumber } from '@/utils/saveShape'

interface DiagEntry {
  /** 发生时刻 */
  at: number
  /** 来源:Vue 的 info 字段(如 'render' / 'setup')或 'unhandledrejection' */
  info: string
  /** 摘要(name + message,已截断) */
  message: string
  /** 发生时的路由 hash */
  route: string
  /** 同一条重复出现的次数(相邻去重) */
  count: number
}

/** 只留最近这么多条 */
export const DIAG_MAX = 20
/** 单条摘要长度上限 */
export const DIAG_MESSAGE_MAX = 200

/**
 * 单条诊断的「出现次数」读档上界 —— 面板会印「×N」,而那处是裸插值。
 * 同一条错误在一局里重复几十上百次已极罕见,取一万已极宽;越过的必定是坏档。
 */
export const DIAG_COUNT_MAX = 10_000

/** 任意异常值 → 一行摘要 */
export function summarizeError(err: unknown): string {
  if (err instanceof Error) return truncateCodePoints(`${err.name}: ${err.message}`, DIAG_MESSAGE_MAX)
  // 三条兜底同样按字素簇截:异常消息里常带玩家道号或装备名,emoji 会在边界处被劈成半个
  if (typeof err === 'string') return truncateCodePoints(err, DIAG_MESSAGE_MAX)
  try {
    // JSON.stringify(undefined / 函数 / symbol) 返回 undefined,得回落到 String
    const json = JSON.stringify(err)
    return truncateCodePoints(json === undefined ? String(err) : json, DIAG_MESSAGE_MAX)
  } catch {
    return truncateCodePoints(String(err), DIAG_MESSAGE_MAX)
  }
}

export const useDiagStore = defineStore(
  'diag',
  () => {
    /** 由旧到新排列 */
    const errors = ref<DiagEntry[]>([])

    /** 存档修复:分片坏了修回可用值 */
    function sanitize(): void {
      errors.value = asArray<DiagEntry>(errors.value, [], e => !!e && typeof (e as DiagEntry).message === 'string')
        .map(e => ({
          at: asTimestamp(e.at, 0),
          info: typeof e.info === 'string' ? e.info : '',
          message: truncateCodePoints(String(e.message), DIAG_MESSAGE_MAX),
          route: typeof e.route === 'string' ? e.route : '',
          /*
           * 上界:诊断面板会印「×N」,而那处是**裸插值**、没有格式化兜底 ——
           * 坏档写 1e300 会印出「×1e+300」。同一条错误在一局里重复几十上百次已极罕见,
           * 取一万已极宽;越过的必定是坏档。
           */
          count: Math.floor(asFiniteNumber(e.count, 1, 1, DIAG_COUNT_MAX))
        }))
        .slice(-DIAG_MAX)
    }

    function record(input: { info: string; message: string; route?: string; at?: number }): void {
      // 诊断自身不许抛:分片坏了先自修
      if (!Array.isArray(errors.value)) sanitize()
      // 入参来自运行期,不能假设其形状
      const raw = input !== null && typeof input === 'object' ? input : null
      const rawAt = raw?.at
      const at = typeof rawAt === 'number' && Number.isFinite(rawAt) && rawAt >= 0 ? rawAt : Date.now()
      const rawMessage = raw?.message
      const message =
        typeof rawMessage === 'string' && rawMessage ? truncateCodePoints(rawMessage, DIAG_MESSAGE_MAX) : '未知异常'
      const info = typeof raw?.info === 'string' ? raw.info : ''
      const route = typeof raw?.route === 'string' ? raw.route : ''
      const last = errors.value[errors.value.length - 1]
      if (last && last.message === message && last.info === info) {
        errors.value = [...errors.value.slice(0, -1), { ...last, at, route, count: last.count + 1 }]
        return
      }
      const next = [...errors.value, { at, info, message, route, count: 1 }]
      errors.value = next.length > DIAG_MAX ? next.slice(next.length - DIAG_MAX) : next
    }

    function clear(): void {
      errors.value = []
    }

    return { errors, record, clear, sanitize }
  },
  { persist: persistConfig('diag') }
)
