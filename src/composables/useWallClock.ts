/**
 * 墙钟时钟 —— 只给暂停时也必须照常推进的界面读数用。
 *
 * 坊市寄卖、悬赏换单、弟子跑腿都按墙钟结算,离线照走。重置 / 导入确认
 * 暂停引擎时,这些倒计时不能跟着冻住,否则玩家关掉确认窗后会看到一段
 * 本不该存在的「时间倒流」。
 *
 * 游戏心跳域仍走 useNow / useGameClock;两者刻意分开,避免以后又把墙钟
 * 读数收进暂停守卫。
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** 命令式墙钟:每 tick 调一次 cb,返回收表函数 */
export function wallClock(cb: () => void, intervalMs = 1000): () => void {
  const timer = window.setInterval(cb, intervalMs)
  return () => window.clearInterval(timer)
}

/** 组合式墙钟读数:挂载起表、卸载收表,不读 enginePaused */
export function useWallNow(intervalMs = 1000): Ref<number> {
  const now = ref(Date.now())
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = wallClock(() => {
      now.value = Date.now()
    }, intervalMs)
  })
  onUnmounted(() => stop?.())
  return now
}
