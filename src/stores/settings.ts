import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { persistConfig } from '@/utils/storage'
import { asArray, asFiniteNumber, asRecord, asTimestamp } from '@/utils/saveShape'
import { MAX_EQUIP_TIER } from '@/data/equipment'
import { QUALITIES } from '@/data/qualities'
import { APP_VERSION, compareVersions } from '@/utils/appVersion'
import { RELEASE_NOTES } from '@/ui/releaseNotes'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    /** 上次看过发布说明的版本(空 = 从没看过) */
    const lastSeenVersion = ref('')
    const sfxOn = ref(true)
    const musicOn = ref(true)
    /** 音量 0~100,不是 0~1 */
    const musicVol = ref(50)
    const sfxVol = ref(70)
    /**
     * 减少动效:默认值从系统偏好(prefers-reduced-motion)播种;战斗回放是 JS 驱动的
     * (CombatPanel / GauntletPanel),只认这个应用内开关。
     * 播种只在无持久化档的首次创建生效,持久化水合随后盖回显式存下的 true/false。
     */
    const reduceMotion = ref(
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    )
    /** 遇事勿扰:历练撞见际遇/机缘/奇缘时不弹窗,立刻按默认好愿了结(与超时自动处置同一条路) */
    const dndEvents = ref(false)
    const battleSpeed = ref<1 | 2 | 4>(1)
    /** 一键分解勾选的品质 rank 列表 */
    const decomposeRanks = ref<number[]>([0, 1])
    /** 智能收纳:行囊自动去留规则(字段口径见 SmartKeepConfig) */
    const smartKeep = ref<import('@/core/smartKeep').SmartKeepConfig>({
      enabled: false,
      minQuality: 3,
      keepMinTier: 0,
      keepCoreAffix: true,
      keepComboPiece: true,
      keepPerfectRolls: true,
      keepSetPiece: true
    })
    /** 是否已同意隐私政策(欢迎页勾选后记录,老档视为已同意) */
    const privacyAccepted = ref(false)
    const theme = ref<'auto' | 'light' | 'dark'>('auto')
    /** 上次导出存档的时间戳(0 = 从未导出);备份提醒见 core/saveBackup.ts */
    const lastExportAt = ref(0)
    /** iOS「添加到主屏幕」提示卡被玩家关掉过(关掉即不再出现) */
    const installNoticeDismissed = ref(false)

    /** 该不该亮「新版本/未读发布说明」:当前版本更新于上次看过的那版,且发布说明里确实有当前版本 */
    const hasUnseenRelease = computed(
      () =>
        RELEASE_NOTES.some(n => compareVersions(n.version, APP_VERSION) === 0) &&
        compareVersions(APP_VERSION, lastSeenVersion.value) > 0
    )

    /** 打开过发布说明:记成当前版本,新标记随之熄灭 */
    function markReleaseSeen(): void {
      lastSeenVersion.value = APP_VERSION
    }

    function sanitize(): void {
      musicVol.value = Math.min(100, asFiniteNumber(musicVol.value, 50, 0))
      sfxVol.value = Math.min(100, asFiniteNumber(sfxVol.value, 70, 0))
      if (![1, 2, 4].includes(battleSpeed.value)) battleSpeed.value = 1
      if (!['auto', 'light', 'dark'].includes(theme.value)) theme.value = 'auto'
      dndEvents.value = dndEvents.value === true
      // 布尔开关一律 ===true 归一:损坏档里混入的字符串("false")/数字(1)会以真值存活
      sfxOn.value = sfxOn.value === true
      musicOn.value = musicOn.value === true
      reduceMotion.value = reduceMotion.value === true
      privacyAccepted.value = privacyAccepted.value === true
      lastExportAt.value = Math.max(0, asTimestamp(lastExportAt.value, 0))
      installNoticeDismissed.value = installNoticeDismissed.value === true
      lastSeenVersion.value = typeof lastSeenVersion.value === 'string' ? lastSeenVersion.value : ''
      decomposeRanks.value = [
        ...new Set(
          asArray<number>(decomposeRanks.value).filter(
            n => typeof n === 'number' && Number.isFinite(n) && QUALITIES.some(q => q.rank === n)
          )
        )
      ]
      const sk = asRecord<unknown>(smartKeep.value)
      smartKeep.value = {
        enabled: sk.enabled === true,
        /** 品质线须是真实存在的 rank:坏档写成 99 时没有一件装备达线,未达线的裸件被静默化尘;认不出回落默认「灵品」 */
        minQuality: (() => {
          const v = Math.floor(asFiniteNumber(sk.minQuality, 3, 0))
          return QUALITIES.some(q => q.rank === v) ? v : 3
        })(),
        keepMinTier: Math.max(0, Math.min(MAX_EQUIP_TIER, Math.floor(asFiniteNumber(sk.keepMinTier, 0, 0)))),
        keepCoreAffix: sk.keepCoreAffix !== false,
        keepComboPiece: sk.keepComboPiece !== false,
        keepPerfectRolls: sk.keepPerfectRolls !== false,
        keepSetPiece: sk.keepSetPiece !== false
      }
    }

    return {
      sfxOn,
      musicOn,
      musicVol,
      sfxVol,
      reduceMotion,
      dndEvents,
      battleSpeed,
      decomposeRanks,
      smartKeep,
      privacyAccepted,
      theme,
      lastExportAt,
      installNoticeDismissed,
      lastSeenVersion,
      hasUnseenRelease,
      markReleaseSeen,
      sanitize
    }
  },
  { persist: persistConfig('settings') }
)
