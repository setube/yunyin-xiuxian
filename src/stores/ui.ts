/** 瞬态 UI 状态 —— Toast / 各类 Modal(不持久化) */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { OfflineSummary } from '@/types'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'warn' | 'rare'
}

export interface BreakthroughView {
  success: boolean
  fromLabel: string
  toLabel: string
  isMajor: boolean
  tribulationLog: string[]
  message: string
}

/** 上一世的回顾(Phase 32.5)—— 轮回界面第一屏要说清楚"你刚刚过完了怎样的一生" */
export interface LifeReview {
  /** 刚结束的是第几世(1 起) */
  index: number
  realmLabel: string
  age: number
  /** 本世立的题;未立题为 null */
  themeId: string | null
  themeResult: 'done' | 'unfinished' | 'broken' | null
  /** 命题进度(未立题为 0/0) */
  themeCur: number
  themeNeed: number
  /** 本世所得宿慧(阅历 + 达成命题) */
  insightGained: number
}

export interface ReincarnationView {
  daoFruitGained: number
  talentChoices: string[]
  extraTalents: string[]
  prevRealmLabel: string
  /** 上一世回顾 */
  review: LifeReview
  /** 转世之后的宿慧总量 */
  insightAfter: number
  /** 转世之后所处的轮回阶 */
  stageId: string
  stageName: string
  stageDesc: string
  /** 这一世的经历是否让你进了一阶 */
  stageAdvanced: boolean
  /** 距下一阶还差多少宿慧(已在顶阶为 null) */
  toNextStage: number | null
  /** 睁眼即认得的灵材数 */
  knownMaterials: number
  /** 可立的命题(id);空数组表示此阶无题可立 */
  themeChoices: string[]
  /** 是否可从全部已开命题中自选(百世老修) */
  themeFree: boolean
}

let toastSeq = 1

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const offlineSummary = ref<OfflineSummary | null>(null)
  const breakthrough = ref<BreakthroughView | null>(null)
  const equipDetailUid = ref<string | null>(null)
  const artifactDetailId = ref<string | null>(null)
  const gongfaDetailId = ref<string | null>(null)
  const buffDetailId = ref<string | null>(null)
  const deathDialog = ref(false)
  const reincarnation = ref<ReincarnationView | null>(null)
  /**
   * PWA 新版本就绪提示:Service Worker 发现并装上更新后置 true,由 UpdatePrompt
   * 渲染一枚可关闭的横幅;applyPwaUpdate 或关闭时清回 false。重载动作由 main.ts
   * 通过 setPwaApplyReload 注入(加载时注册 SW 后才拿得到那个 registration)。
   */
  const pwaUpdatePending = ref(false)
  let pwaApplyReload: (() => void) | null = null
  const corruptedNotice = ref<string[]>([])

  /** 每条 toast 的收起计时器;去重刷新时要先撤掉旧的 */
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function removeToast(id: number): void {
    timers.delete(id)
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function toast(text: string, kind: Toast['kind'] = 'info'): void {
    const ttl = kind === 'rare' ? 4200 : 2600
    // 同文案去重:连点两下「道源不足」不该弹两条一模一样的 ——
    // 原位保留、刷新到末尾并重置计时(失败的提示一直亮,直到不再犯)
    const dup = toasts.value.find(t => t.text === text && t.kind === kind)
    if (dup) {
      const prev = timers.get(dup.id)
      if (prev) clearTimeout(prev)
      toasts.value = [...toasts.value.filter(t => t.id !== dup.id), dup]
      timers.set(dup.id, setTimeout(() => removeToast(dup.id), ttl))
      return
    }
    const id = toastSeq
    toastSeq += 1
    // 队齐了要挤掉最旧的那条:它的收起计时器一并撤掉。
    // 不然等它超时还会跑一趟 removeToast(对已下架的空转),
    // 更糟的是去重路径曾用它做参考,旧计时器残留会让状态账对不上
    const evicted = toasts.value[toasts.value.length - 5]
    if (evicted) {
      const t = timers.get(evicted.id)
      if (t) clearTimeout(t)
    }
    toasts.value = [...toasts.value.slice(-4), { id, text, kind }]
    timers.set(id, setTimeout(() => removeToast(id), ttl))
  }

  /** 手动关闭某条提示(点按 toast 即收,不等超时)—— 与超时收起同一条路,计时器一起撤 */
  function dismissToast(id: number): void {
    removeToast(id)
  }

  /** 检测到新版本已就绪:亮出「重载以应用」横幅 */
  function requestPwaUpdate(): void {
    pwaUpdatePending.value = true
  }

  /** 关掉横幅不更新(仍在旧版跑,下次检测还会再提示) */
  function dismissPwaUpdate(): void {
    pwaUpdatePending.value = false
  }

  /** main.ts 注册 SW 后注入「重载应用」的动作 */
  function setPwaApplyReload(fn: () => void): void {
    pwaApplyReload = fn
  }

  /** 确认应用更新:调用注入的重载,并清掉横幅 */
  function applyPwaUpdate(): void {
    pwaUpdatePending.value = false
    const fn = pwaApplyReload
    try {
      fn?.()
    } catch {
      /* 重载失败不该再抛:保持旧版继续跑,横幅已收 */
    }
  }

  return {
    toasts,
    offlineSummary,
    breakthrough,
    equipDetailUid,
    artifactDetailId,
    gongfaDetailId,
    buffDetailId,
    deathDialog,
    reincarnation,
    pwaUpdatePending,
    requestPwaUpdate,
    dismissPwaUpdate,
    setPwaApplyReload,
    applyPwaUpdate,
    corruptedNotice,
    toast,
    dismissToast
  }
})
