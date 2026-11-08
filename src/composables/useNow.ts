/**
 * 每秒刷新的当前时间,供可冻结倒计时类 UI。
 * 读 `gameNow()`,与到期结算同一把尺:暂停时冻住,恢复后由引擎顺延各状态时间戳。
 *
 * **全站共用一个读数与一枚秒表。**
 * 原先每次 `useNow()` 各起一枚 `setInterval`:地界卡是列表里逐张渲染的,
 * 光历练页就有好几枚同时跑,修行页四枚、背包页六枚 —— 同一次「现在」被九个表各自
 * 推进一次,每枚都触发一次自己的调度与渲染。现改为唯一一份 `now` + 一枚秒表,
 * 首个订阅者挂载时起表、最后一个卸载时收表;同一秒里所有依赖它的组件在同一个
 * 渲染批次里更新,而不是分九批。
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { gameNow } from '@/core/enginePause'
import { gameClock } from './useGameClock'

const INTERVAL_MS = 1000

/** 全站共用的「现在」;只在秒表回调里写 */
const now = ref(gameNow())
/** 收表函数;没人在挂载时为 undefined */
let stop: (() => void) | undefined
let subscribers = 0

export function useNow(): Ref<number> {
  /*
   * 订阅那一刻先对齐到当前读数。
   *
   * 共用的 now 初值是模块导入时取的,而在组件外调用(`useBrewing` 这类纯逻辑入口
   * 会被单测直接调)时没有 onMounted,表也不会走 —— 不对齐的话读到的是导入那一刻的旧值,
   * 顶满/将顶这类判据会拿错时间。组件内也不亏:秒表尚未跑第一拍时读数本就是对的。
   */
  now.value = gameNow()
  onMounted(() => {
    subscribers += 1
    if (stop === undefined) {
      stop = gameClock(() => {
        now.value = gameNow()
      }, INTERVAL_MS)
    }
  })
  onUnmounted(() => {
    // 防御:同一实例重复卸载不该把计数打成负数,否则秒表再也起不来
    if (subscribers > 0) subscribers -= 1
    if (subscribers === 0 && stop !== undefined) {
      stop()
      stop = undefined
    }
  })
  return now
}
