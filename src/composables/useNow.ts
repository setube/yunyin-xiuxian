/**
 * 每秒刷新的当前时间(供可冻结倒计时类 UI 使用)。
 *
 * 读数取 `gameNow()`,与到期结算同一把尺:暂停时冻在暂停那一刻,恢复后由引擎
 * 顺延各状态的时间戳,显示不会先跑到 0 再跳回。`useGameClock` 只负责让读数
 * 每秒重算,暂停时不必额外空转。
 */
import { ref, type Ref } from 'vue'
import { gameNow } from '@/core/enginePause'
import { useGameClock } from './useGameClock'

export function useNow(intervalMs = 1000): Ref<number> {
  const now = ref(gameNow())
  useGameClock(() => {
    now.value = gameNow()
  }, intervalMs)
  return now
}
