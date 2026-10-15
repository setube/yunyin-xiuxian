/** 游戏元状态 —— 是否开局 / 时间戳 / 存档版本 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistConfig, SAVE_VERSION } from '@/utils/storage'
import { CREATE_REROLL_QUOTA } from '@/data/constants'
import type { LinggenProfile } from '@/types'
import { asFiniteNumber, asObjectOrNull } from '@/utils/saveShape'

export const useGameStore = defineStore(
  'game',
  () => {
    const started = ref(false)
    const saveVersion = ref(SAVE_VERSION)
    const createdAt = ref(0)
    const lastActiveAt = ref(0)
    const totalPlaySec = ref(0)

    // ---- 建号草稿(持久化:否则刷新页面就是一次免费重掷) ----
    /**
     * 剩余「逆天改命」次数;null = 不限次(当前建号政策,见 CREATE_REROLL_QUOTA)。
     * 保留数字形态是为了将来收紧次数时不必再动存档结构。
     */
    const createRerolls = ref<number | null>(CREATE_REROLL_QUOTA)
    /** 当前摆在建号页上的那副牌;null 表示尚未开掷 */
    const createProfile = ref<LinggenProfile | null>(null)
    /** 建号草稿 · 道号:刷新页面不丢手打的字(与灵根草稿同一条「别丢我输入」的承诺) */
    const createName = ref('')

    /** 存档修复:时间戳/时长被写坏会让离线结算与展示算出 NaN */
    function sanitize(): void {
      createdAt.value = asFiniteNumber(createdAt.value, 0, 0)
      lastActiveAt.value = asFiniteNumber(lastActiveAt.value, 0, 0)
      totalPlaySec.value = asFiniteNumber(totalPlaySec.value, 0, 0)
      // 不限次时,旧存档里遗留的数字额度(如 8→0)一律归位;有限次数则取整并夹在 [0, 上限]
      createRerolls.value =
        CREATE_REROLL_QUOTA === null
          ? null
          : Math.min(
              CREATE_REROLL_QUOTA,
              Math.max(0, Math.floor(asFiniteNumber(createRerolls.value, CREATE_REROLL_QUOTA, 0)))
            )
      createProfile.value = asObjectOrNull<LinggenProfile>(createProfile.value)
      createName.value = typeof createName.value === 'string' ? createName.value.slice(0, 8) : ''
    }

    /** 记下当前掷出的灵根(不扣次数,扣次数由 spendCreateReroll 负责) */
    function setCreateProfile(profile: LinggenProfile): void {
      createProfile.value = profile
    }

    /** 花掉一次重掷额度;不限次(null)或还有余量时返回 true,额度耗尽返回 false */
    function spendCreateReroll(): boolean {
      if (createRerolls.value === null) return true
      if (createRerolls.value <= 0) return false
      createRerolls.value -= 1
      return true
    }

    /** 新的一世:上一世的建号草稿作废,重掷额度归满 */
    function resetCreateDraft(): void {
      createRerolls.value = CREATE_REROLL_QUOTA
      createProfile.value = null
      createName.value = ''
    }

    /** 记下当前手打的道号(随草稿持久化,刷新不丢) */
    function setCreateName(name: string): void {
      createName.value = name.slice(0, 8)
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
      createName,
      setCreateProfile,
      setCreateName,
      spendCreateReroll,
      resetCreateDraft,
      markStarted,
      stampActive,
      addPlayTime,
      sanitize
    }
  },
  { persist: persistConfig('game') }
)
