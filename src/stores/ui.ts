/** 瞬态 UI 状态(Toast / 各类 Modal),不持久化 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LinggenProfile, OfflineSummary } from '@/types'
import type { TreasureMark } from '@/ui/treasureCeremony'
import type { WorldLeap } from '@/ui/worldMark'

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
  /**
   * 若是跨界飞升那一境,给出这一跃(离开的界域 / 进入的界域 / 寿元倍数)。
   * 弹窗据此另开一段:跨界不是一个普通的大关,它是整局最重的那几次之一
   * (见 ui/worldMark.worldLeap)。
   */
  leap?: WorldLeap
}

/** 上一世的回顾:轮回界面第一屏 */
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
  /** 来世灵根草稿:重刷仅替换此项,确认后原样采用 */
  nextLinggen: LinggenProfile
  /** 本次结算后的资质保底,重刷沿用 */
  linggenAptitudeFloor: number
  daoFruitGained: number
  talentChoices: string[]
  extraTalents: string[]
  prevRealmLabel: string
  review: LifeReview
  /** 转世之后的宿慧总量 */
  insightAfter: number
  /** 转世之后所处的轮回阶 */
  stageId: string
  stageName: string
  stageDesc: string
  /** 这一世是否进了一阶 */
  stageAdvanced: boolean
  /** 距下一阶还差多少宿慧(已在顶阶为 null) */
  toNextStage: number | null
  /** 睁眼即认得的灵材数 */
  knownMaterials: number
  /** 可立的命题 id;空数组 = 此阶无题可立 */
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
  const gongfaDetailId = ref<string | null>(null)
  const buffDetailId = ref<string | null>(null)

  /**
   * 清掉三处「详情弹窗开在哪一件」的指针。切页时调用 ——
   * 否则返回键从背包跳回首页,背包页那扇装备详情还挂在屏幕上。
   * 只关 `equipDetailUid` 之类还不够:弹窗栈是另一套状态,见 useModalStack.resetModalStack。
   */
  function clearDetail(): void {
    equipDetailUid.value = null
    gongfaDetailId.value = null
    buffDetailId.value = null
  }
  const deathDialog = ref(false)
  const reincarnation = ref<ReincarnationView | null>(null)
  /**
   * PWA 新版本就绪:Service Worker 装上更新后置 true,由 UpdatePrompt 渲染横幅;applyPwaUpdate 或关闭时清回 false。
   * 重载动作由 main.ts 注册 SW 后经 setPwaApplyReload 注入。
   */
  const pwaUpdatePending = ref(false)
  let pwaApplyReload: (() => void) | null = null
  const corruptedNotice = ref<string[]>([])
  /**
   * 待播的得宝仪典。置满即换:同一时刻只演一件 ——
   * 连得两件时演后一件,前一件的 toast 仍在,信息不丢。
   */
  const treasure = ref<TreasureMark | null>(null)

  /** 每条 toast 的收起计时器;去重刷新时须先撤掉旧的 */
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function removeToast(id: number): void {
    timers.delete(id)
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function toast(text: string, kind: Toast['kind'] = 'info'): void {
    const ttl = kind === 'rare' ? 4200 : 2600
    // 同文案去重:刷新到末尾并重置计时
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
    // 挤掉最旧那条时一并撤掉它的收起计时器(否则超时后对已下架的空转一趟 removeToast)
    const evicted = toasts.value[toasts.value.length - 5]
    if (evicted) {
      /*
       * 撤计时器时**必须连 Map 里的条目一起删**:只 clearTimeout 的话,
       * 那个键还留在 timers 里,而它的到期回调已被撤销 —— 再没有谁会删它。
       * 实测连发 2000 条提示(战斗结算、成就、主线都是逐条弹的),屏幕上最多 5 条,
       * timers 却攒了 2000 个失效条目,且此后只增不减。
       */
      const t = timers.get(evicted.id)
      if (t) clearTimeout(t)
      timers.delete(evicted.id)
    }
    toasts.value = [...toasts.value.slice(-4), { id, text, kind }]
    timers.set(id, setTimeout(() => removeToast(id), ttl))
  }

  /** 手动关闭某条提示;与超时收起同一条路,计时器一起撤 */
  function dismissToast(id: number): void {
    removeToast(id)
  }

  /** 开仪典:只在顶档之物入手时调用(判据见 ui/treasureCeremony) */
  function showTreasure(mark: TreasureMark): void {
    treasure.value = mark
  }

  /** 仪典演完(或被打断)后收起;组件按自己的停留时长调用 */
  function clearTreasure(): void {
    treasure.value = null
  }

  /** 新版本已就绪:亮出「重载以应用」横幅 */
  function requestPwaUpdate(): void {
    pwaUpdatePending.value = true
  }

  /** 关掉横幅不更新(下次检测还会再提示) */
  function dismissPwaUpdate(): void {
    pwaUpdatePending.value = false
  }

  /** main.ts 注册 SW 后注入「重载应用」的动作 */
  function setPwaApplyReload(fn: () => void): void {
    pwaApplyReload = fn
  }

  function applyPwaUpdate(): void {
    pwaUpdatePending.value = false
    const fn = pwaApplyReload
    try {
      fn?.()
    } catch {
      /* 重载失败不再抛:旧版继续跑 */
    }
  }

  return {
    toasts,
    offlineSummary,
    breakthrough,
    clearDetail,
    equipDetailUid,
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
    treasure,
    showTreasure,
    clearTreasure,
    toast,
    dismissToast
  }
})
