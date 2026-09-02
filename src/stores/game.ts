/** 游戏元状态 —— 是否开局 / 时间戳 / 存档版本 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistConfig, SAVE_VERSION } from '@/utils/storage'
import { CREATE_REROLL_LIMIT } from '@/data/constants'
import type { LinggenProfile } from '@/types'

export const useGameStore = defineStore(
  'game',
  () => {
    const started = ref(false)
    const saveVersion = ref(SAVE_VERSION)
    const createdAt = ref(0)
    const lastActiveAt = ref(0)
    const totalPlaySec = ref(0)

    // ---- 建号草稿(持久化:否则刷新页面就是一次免费重掷) ----
    /** 剩余「逆天改命」次数 */
    const createRerolls = ref(CREATE_REROLL_LIMIT)
    /** 当前摆在建号页上的那副牌;null 表示尚未开掷 */
    const createProfile = ref<LinggenProfile | null>(null)

    /** 记下当前掷出的灵根(不扣次数,扣次数由 spendCreateReroll 负责) */
    function setCreateProfile(profile: LinggenProfile): void {
      createProfile.value = profile
    }

    /** 花掉一次重掷额度;额度耗尽返回 false */
    function spendCreateReroll(): boolean {
      if (createRerolls.value <= 0) return false
      createRerolls.value -= 1
      return true
    }

    /** 新的一世:上一世的建号草稿作废,重掷额度归满 */
    function resetCreateDraft(): void {
      createRerolls.value = CREATE_REROLL_LIMIT
      createProfile.value = null
    }

    function markStarted(): void {
      started.value = true
      createdAt.value = Date.now()
      lastActiveAt.value = Date.now()
    }

    function stampActive(now: number): void {
      lastActiveAt.value = now
    }

    function addPlayTime(sec: number): void {
      totalPlaySec.value += sec
    }

    return {
      started,
      saveVersion,
      createdAt,
      lastActiveAt,
      totalPlaySec,
      createRerolls,
      createProfile,
      setCreateProfile,
      spendCreateReroll,
      resetCreateDraft,
      markStarted,
      stampActive,
      addPlayTime
    }
  },
  { persist: persistConfig('game') }
)
