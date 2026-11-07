/** 游戏元状态 —— 是否开局 / 时间戳 / 存档版本 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistConfig, SAVE_VERSION } from '@/utils/storage'
import { truncateCodePoints } from '@/utils/saveShape'
import { CREATE_REROLL_QUOTA } from '@/data/constants'
import type { LinggenProfile } from '@/types'
import { asFiniteNumber } from '@/utils/saveShape'
import { sanitizeLinggen } from '@/core/linggenGen'

export const useGameStore = defineStore(
  'game',
  () => {
    const started = ref(false)
    const saveVersion = ref(SAVE_VERSION)
    const createdAt = ref(0)
    const lastActiveAt = ref(0)
    const totalPlaySec = ref(0)

    // ---- 建号草稿(持久化,刷新不重掷) ----
    /**
     * 剩余「逆天改命」次数;null = 不限次(见 CREATE_REROLL_QUOTA)。
     * 保留数字形态:收紧次数时不改存档结构。
     */
    const createRerolls = ref<number | null>(CREATE_REROLL_QUOTA)
    /** 建号页当前灵根;null = 尚未开掷 */
    const createProfile = ref<LinggenProfile | null>(null)
    /** 建号草稿 · 道号 */
    const createName = ref('')

    /** 存档修复:时间戳/时长被写坏会让离线结算与展示算出 NaN */
    function sanitize(): void {
      // 只认严格 true:字符串 "false" 会绕过开局守卫并触发离线结算
      started.value = started.value === true
      /*
       * 档内版本号也要修:旧档(或坏档)里可能是 1、字符串、负数。
       * 它此前只写不读,连 sanitize 都没碰过 —— 而界面要按它报「这份档升到哪一版」。
       * 高于当前的值按当前夹住:那份档不是本版本能表达的,报更高只会误导。
       */
      const rawVersion = saveVersion.value
      // 坏档里可能是字符串 '2':先转数再判有限,否则兜底分支会把字符串原样留下
      const asNumber = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion)
      saveVersion.value = Number.isFinite(asNumber)
        ? Math.max(0, Math.min(SAVE_VERSION, Math.floor(asNumber)))
        : SAVE_VERSION
      createdAt.value = asFiniteNumber(createdAt.value, 0, 0)
      lastActiveAt.value = asFiniteNumber(lastActiveAt.value, 0, 0)
      totalPlaySec.value = asFiniteNumber(totalPlaySec.value, 0, 0)
      // 不限次时旧档遗留的数字额度一律归位
      createRerolls.value =
        CREATE_REROLL_QUOTA === null
          ? null
          : Math.min(
              CREATE_REROLL_QUOTA,
              Math.max(0, Math.floor(asFiniteNumber(createRerolls.value, CREATE_REROLL_QUOTA, 0)))
            )
      // 建号页裸下标读 ELEMENTS[root.element] / growthMult.toFixed,坏草稿会白屏;一根灵根不剩即作废
      createProfile.value = sanitizeLinggen(createProfile.value)
      createName.value = typeof createName.value === 'string' ? truncateCodePoints(createName.value, 8) : ''
    }

    /** 记下当前掷出的灵根(不扣次数,见 spendCreateReroll) */
    function setCreateProfile(profile: LinggenProfile): void {
      // 与读档修形同尺
      const fixed = sanitizeLinggen(profile)
      if (fixed) createProfile.value = fixed
    }

    /** 花掉一次重掷额度;耗尽返回 false */
    function spendCreateReroll(): boolean {
      if (createRerolls.value === null) return true
      if (createRerolls.value <= 0) return false
      createRerolls.value -= 1
      return true
    }

    /** 新的一世:建号草稿作废,额度归满 */
    function resetCreateDraft(): void {
      createRerolls.value = CREATE_REROLL_QUOTA
      createProfile.value = null
      createName.value = ''
    }

    function setCreateName(name: string): void {
      if (typeof name !== 'string') return
      // 按字素簇截:emoji 占两个码元,slice 会把末尾那个切成孤立代理项或劈开 ZWJ 序列
      createName.value = truncateCodePoints(name, 8)
    }

    function markStarted(): void {
      started.value = true
      createdAt.value = Date.now()
      lastActiveAt.value = Date.now()
    }

    function stampActive(now: number): void {
      // 参与离线结算:坏时钟丢弃,否则收益算成 NaN
      if (!Number.isFinite(now) || now < 0) return
      lastActiveAt.value = now
    }

    function addPlayTime(sec: number): void {
      if (!Number.isFinite(sec) || sec < 0) return
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
