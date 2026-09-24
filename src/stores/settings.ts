/** 设置 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistConfig } from '@/utils/storage'
import { asArray, asFiniteNumber, asRecord } from '@/utils/saveShape'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const sfxOn = ref(true)
    const musicOn = ref(true)
    /** 音量 0~100 */
    const musicVol = ref(50)
    const sfxVol = ref(70)
    const reduceMotion = ref(false)
    /**
     * 遇事勿扰(玩家反馈「手动关闭际遇事件触发」):历练撞见际遇/机缘/奇缘时,
     * 不再弹窗 —— 立刻按默认好愿了结(与超时自动处置同一条路),奖励照拿、不卡手。
     */
    const dndEvents = ref(false)
    /** 战报播放速度倍率 */
    const battleSpeed = ref<1 | 2 | 4>(1)
    /** 一键分解勾选的品质 rank 列表(持久化,免得每次重勾) */
    const decomposeRanks = ref<number[]>([0, 1])
    /** 智能收纳(Phase 26):行囊自动去留规则(字段口径见 SmartKeepConfig,不另抄一份) */
    const smartKeep = ref<import('@/core/smartKeep').SmartKeepConfig>({
      enabled: false,
      minQuality: 3,
      keepCoreAffix: true,
      keepComboPiece: true,
      keepPerfectRolls: true,
      keepSetPiece: true
    })
    /** 是否已同意隐私政策(欢迎页勾选后记录,老档视为已同意) */
    const privacyAccepted = ref(false)
    /** 主题:跟随系统 / 日间 / 夜间 */
    const theme = ref<'auto' | 'light' | 'dark'>('auto')
    /**
     * 上次导出存档的时间戳(0 = 从未导出)。设置页据此常驻一句「上次导出备份:…」,
     * 备份旧了而这一档又攒了东西时才提醒 —— 导出是丢档前唯一的保险,而它是个
     * 没人提醒就不会做的动作(见 core/saveBackup.ts)。
     */
    const lastExportAt = ref(0)
    /** iOS「添加到主屏幕」那张提示卡被玩家关掉过(关掉即不再出现,只劝一次) */
    const installNoticeDismissed = ref(false)

    /** 存档修复:设置项被写坏会让音量/战斗速度算出 NaN,或让主题类名失效 */
    function sanitize(): void {
      // 音量是 0~100 的整数,不是 0~1 —— 别照搬比例类的写法
      musicVol.value = Math.min(100, asFiniteNumber(musicVol.value, 50, 0))
      sfxVol.value = Math.min(100, asFiniteNumber(sfxVol.value, 70, 0))
      if (![1, 2, 4].includes(battleSpeed.value)) battleSpeed.value = 1
      if (!['auto', 'light', 'dark'].includes(theme.value)) theme.value = 'auto'
      dndEvents.value = dndEvents.value === true
      lastExportAt.value = asFiniteNumber(lastExportAt.value, 0, 0)
      installNoticeDismissed.value = installNoticeDismissed.value === true
      decomposeRanks.value = asArray<number>(decomposeRanks.value).filter(n => typeof n === 'number' && Number.isFinite(n))
      const sk = asRecord<unknown>(smartKeep.value)
      smartKeep.value = {
        enabled: sk.enabled === true,
        minQuality: Math.floor(asFiniteNumber(sk.minQuality, 3, 0)),
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
      sanitize
    }
  },
  { persist: persistConfig('settings') }
)
