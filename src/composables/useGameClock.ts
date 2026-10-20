/**
 * 带引擎暂停守卫的游戏时钟 —— 手写 setInterval 的收口处。
 *
 * 心跳停着(重置 / 导入确认)时,挂在上面的倒计时与演出也该停:否则确认窗
 * 背后倒计时照走、战报照播,回来时窗口已经过去一半。这里把「每 tick 回调、
 * 暂停冻结」收成唯一出处,两个出口对应两种用法:
 *
 *   useGameClock(cb, ms) —— 组合式:挂载起表、卸载收表(轮询类弹窗用);
 *   gameClock(cb, ms)    —— 命令式:返回 stop(),由调用方择时起停(回放/动画用)。
 *
 * **墙钟域不许走这里**:坊市货架 / 寄卖、悬赏换版、弟子跑腿按墙钟结算
 * (离线照算)。暂停几分钟不该让货架晚一点换新、弟子晚一步归来 —— 那两处
 * 保留手写 `Date.now()` 的 interval,语义见 MarketView / ApprenticeView 注释。
 */
import { onMounted, onUnmounted } from 'vue'
import { enginePaused } from '@/core/enginePause'

/** 命令式游戏时钟:起一枚暂停可冻结的 interval,返回收表函数 */
export function gameClock(cb: () => void, intervalMs = 1000): () => void {
  const timer = window.setInterval(() => {
    if (enginePaused.value) return
    cb()
  }, intervalMs)
  return () => window.clearInterval(timer)
}

/** 组合式游戏时钟:挂载即起表、卸载即收表 */
export function useGameClock(cb: () => void, intervalMs = 1000): void {
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = gameClock(cb, intervalMs)
  })
  onUnmounted(() => stop?.())
}
