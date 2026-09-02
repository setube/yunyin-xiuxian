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
  const corruptedNotice = ref<string[]>([])

  function toast(text: string, kind: Toast['kind'] = 'info'): void {
    const id = toastSeq
    toastSeq += 1
    toasts.value = [...toasts.value.slice(-4), { id, text, kind }]
    const ttl = kind === 'rare' ? 4200 : 2600
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, ttl)
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
    corruptedNotice,
    toast
  }
})
