/**
 * 前期节奏遥测 —— 互动密度统计
 *
 * 三种事件分类:
 * - modal  : 打断型(弹窗,需要玩家立即处理) → 顿悟/闭关确认/洞府巡游
 * - notify : 提示型(toast,不需要立即处理)  → 连胜奖励/奇遇解锁
 * - ambient: 环境型(无感知,背景自动进行)   → 素材自动收集/生产
 *
 * 互动密度核心指标(全部自动落盘):
 * - avgInterval   平均事件间隔
 * - p50/p90       间隔分位数
 * - minInterval   最短间隔
 * - burstCount    60 秒内连续出现 ≥2 个需要处理事件的簇数
 * - maxConsecutive最大连续弹窗次数
 *
 * 防扰民红线:
 * - P90 间隔 < 30s → 事件过密
 * - burstCount > 6 次/30分钟 → 连弹风暴
 */
import { ref } from 'vue'
import { persistConfig } from '@/utils/storage'
import { asArray } from '@/utils/saveShape'
import { defineStore } from 'pinia'

export type InteractionKind = 'modal' | 'notify' | 'ambient'

export interface InteractionEvent {
  /** 事件类型 ID(如 enlightenment / caveEvent / winStreak) */
  type: string
  kind: InteractionKind
  /** 可读描述(用于报告输出) */
  label: string
  at: number
}

interface DensityReport {
  total: number
  avgInterval: number
  p50: number
  p90: number
  minInterval: number
  burstCount: number
  maxConsecutive: number
  byKind: Record<InteractionKind, number>
}

const KINDS: readonly InteractionKind[] = ['modal', 'notify', 'ambient']

function validEvent(raw: unknown): InteractionEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const e = raw as Partial<InteractionEvent>
  if (typeof e.type !== 'string' || e.type.trim() === '') return null
  if (typeof e.label !== 'string' || e.label.trim() === '') return null
  if (!KINDS.includes(e.kind as InteractionKind)) return null
  if (typeof e.at !== 'number' || !Number.isFinite(e.at) || e.at < 0) return null
  return { type: e.type.trim(), kind: e.kind as InteractionKind, label: e.label.trim(), at: e.at }
}

function validEvents(raw: unknown): InteractionEvent[] {
  return Array.isArray(raw) ? raw.map(validEvent).filter((e): e is InteractionEvent => e !== null) : []
}

/** 峰值前 30 分钟滚动窗口的遥测 */
export const usePacingTelemetry = defineStore(
  'pacingTelemetry',
  () => {
    /** 事件序列(最近 120 条,滚动) */
    const events = ref<InteractionEvent[]>([])
    /** 玩家是否已同意遥测(默认开启) */
    const enabled = ref(true)

    function record(type: string, kind: InteractionKind, label: string): void {
      if (enabled.value !== true) return
      const event = validEvent({ type, kind, label, at: Date.now() })
      if (!event) return
      // 读档修形未跑时 events 也可能是 null / 非数组:高频路径,不许抛;同时剔掉坏条目
      events.value = [...validEvents(events.value).slice(-119), event]
    }

    /** 生成密度报告(基于最近 30 分钟) */
    function buildReport(): DensityReport | null {
      const now = Date.now()
      const recent = validEvents(events.value).filter(e => now - e.at < 30 * 60 * 1000)
      if (recent.length < 3) return null

      const intervals: number[] = []
      for (let i = 1; i < recent.length; i += 1) {
        intervals.push(recent[i]!.at - recent[i - 1]!.at)
      }
      intervals.sort((a, b) => a - b)

      const pct = (p: number): number => intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))]!
      /**
       * 防扰民只看需要玩家立即处理的 modal:
       * burstCount 是「连弹簇数」(三连算一簇,不是三对),maxConsecutive 是簇内最多次数。
       */
      const modals = recent.filter(e => e.kind === 'modal')
      let burstCount = 0
      let maxConsecutive = 0
      let cluster = 1
      for (let i = 1; i < modals.length; i += 1) {
        const gap = modals[i]!.at - modals[i - 1]!.at
        if (gap < 60 * 1000) {
          cluster += 1
        } else {
          if (cluster >= 2) burstCount += 1
          maxConsecutive = Math.max(maxConsecutive, cluster)
          cluster = 1
        }
      }
      if (cluster >= 2) burstCount += 1
      maxConsecutive = Math.max(maxConsecutive, cluster)

      return {
        total: recent.length,
        avgInterval: Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length),
        p50: pct(0.5),
        p90: pct(0.9),
        minInterval: intervals[0]!,
        burstCount,
        maxConsecutive,
        byKind: {
          modal: recent.filter(e => e.kind === 'modal').length,
          notify: recent.filter(e => e.kind === 'notify').length,
          ambient: recent.filter(e => e.kind === 'ambient').length
        }
      }
    }

    /** 全部清空(新赛季/测试) */
    function clear(): void {
      events.value = []
    }

    /** 读档修形(遥测分片也落盘):只留形状完整的事件 */
    function sanitize(): void {
      /*
       * 与 `record` 同一把尺:事件序列是**最近 120 条的滚动窗口**(见上面 `events` 的注释
       * 与 `record` 里的 `.slice(-119)`)。`sanitize` 原先只滤坏条目、不截长度 ——
       * 把存档撑到几千条会原样留下,而每录一条仍要 `validEvents` 全量 map 一遍。
       * 越界的只可能来自坏档(正常路径恒为 120 条以内)。
       */
      events.value = asArray<InteractionEvent>(events.value, [], e => validEvent(e) !== null).slice(-120)
      if (typeof enabled.value !== 'boolean') enabled.value = true
    }

    return { events, enabled, record, buildReport, clear, sanitize }
  },
  { persist: persistConfig('pacing') }
)
