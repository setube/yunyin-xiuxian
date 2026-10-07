/**
 * 异常留档 —— 最近若干条未捕获异常,供玩家复制、供我们定位
 *
 * 为什么要有它:全局 errorHandler 从前只 `console.error` + toast「出现异常,已记录」——
 * 「已记录」是句空话(手机上根本没有控制台)。玩家来报「刚才卡了一下」时,
 * 我们手上什么都没有,只能反推;而未处理的 Promise 拒绝连 toast 都没有,完全静默。
 *
 * 三条取舍:
 *  · **独立分片**(与 pacing 遥测同理):它不是游戏进度,清档之外不该跟着转世走,
 *    但必须随「导出存档」一起带出 —— 那正是玩家把问题交给我们时唯一会走的通路;
 *  · **只记摘要**:时间 / 来源(Vue 的 info 或 unhandledrejection)/ 摘要 / 当时路由 / 次数,
 *    不记调用栈也不记玩家数据 —— 留档是给人看的线索,不是全量日志;
 *  · **同一条连发只加计数**:挂机时同一条异常可能每秒一次,不这样做会把 20 格刷满,
 *    真正有用的第一条反而被挤出去。
 */
import { defineStore } from 'pinia'
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

/** 只留最近这么多条:够定位一次问题,又不至于把存档撑大 */
export const DIAG_MAX = 20
/** 单条摘要长度上限 */
export const DIAG_MESSAGE_MAX = 200

/** 把任意异常值压成一行摘要(不记调用栈,不留原始对象) */
export function summarizeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, DIAG_MESSAGE_MAX)
  if (typeof err === 'string') return err.slice(0, DIAG_MESSAGE_MAX)
  try {
    return JSON.stringify(err).slice(0, DIAG_MESSAGE_MAX)
  } catch {
    return String(err).slice(0, DIAG_MESSAGE_MAX)
  }
}

export const useDiagStore = defineStore(
  'diag',
  () => {
    /** 由旧到新排列(最后一条是最近一次) */
    const errors = ref<DiagEntry[]>([])

    /** 存档修复:分片被写坏(非数组 / 数组里塞垃圾 / 字段类型不对)时修回可用值 */
    function sanitize(): void {
      errors.value = asArray<DiagEntry>(errors.value, [], e => !!e && typeof (e as DiagEntry).message === 'string')
        .map(e => ({
          at: asFiniteNumber(e.at, 0, 0),
          info: typeof e.info === 'string' ? e.info : '',
          message: String(e.message).slice(0, DIAG_MESSAGE_MAX),
          route: typeof e.route === 'string' ? e.route : '',
          count: Math.max(1, Math.floor(asFiniteNumber(e.count, 1, 1)))
        }))
        .slice(-DIAG_MAX)
    }

    function record(input: { info: string; message: string; route?: string; at?: number }): void {
      // 诊断自身绝不许再抛:分片被写坏时先自修(记录异常的那一行,不该成为第二个异常)
      if (!Array.isArray(errors.value)) sanitize()
      const at = input.at ?? Date.now()
      const message = (input.message || '未知异常').slice(0, DIAG_MESSAGE_MAX)
      const info = input.info || ''
      const route = input.route ?? ''
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
