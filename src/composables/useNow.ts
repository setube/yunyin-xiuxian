/** 每秒刷新的当前时间(供倒计时类 UI 使用) —— 守卫收口到 useGameClock(暂停冻结) */
import { ref, type Ref } from 'vue'
import { useGameClock } from './useGameClock'

export function useNow(intervalMs = 1000): Ref<number> {
  const now = ref(Date.now())
  useGameClock(() => {
    // 心跳停着(重置 / 导入确认):保留上一拍的读数,倒计时不跑到 0
    now.value = Date.now()
  }, intervalMs)
  return now
}
