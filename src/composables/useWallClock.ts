/**
 * 墙钟时钟:供暂停时也须照常推进的界面读数(坊市寄卖、悬赏换单、弟子跑腿,按墙钟结算)。
 * 游戏心跳域走 useNow / useGameClock;两者须分开,墙钟读数不进暂停守卫。
 */
import { getCurrentInstance, onMounted, onUnmounted, ref, type Ref } from 'vue'

/** 命令式墙钟:每 tick 调一次 cb,返回收表函数 */
export function wallClock(cb: () => void, intervalMs = 1000): () => void {
  const timer = window.setInterval(cb, intervalMs)
  return () => window.clearInterval(timer)
}

/** 共享的墙钟读数与秒表(与 useNow 同一种收法:首个订阅者挂载起表、末个卸载收表) */
const sharedNow = ref(Date.now())
let sharedStop: (() => void) | undefined
let sharedSubscribers = 0

/**
 * 组合式墙钟读数:挂载起表、卸载收表,不读 enginePaused。
 *
 * 默认共用一份读数与一枚表。坊市页上「订单投影」与「换单倒计时」各调一次悬赏的投影,
 * 而它与页面自己的寄卖倒计时读的都是同一把墙钟 —— 各起一枚表就是同一次 Date.now()
 * 被推好几遍、好几处各自重渲染。
 *
 * 传了非默认间隔时才单独起表:那种调用点要的是自己的节奏(如 250ms 的高亮轮换),
 * 跟每秒的界面读数不是一回事,合表会把它拖慢。
 */
export function useWallNow(intervalMs = 1000): Ref<number> {
  const shared = intervalMs === 1000
  sharedNow.value = Date.now()

  // 组件外调用没有生命周期可用(composable 可能被单测直接调),那种情况只当只读订阅者
  const inComponent = getCurrentInstance() !== null
  if (!inComponent) return shared ? sharedNow : localNow(intervalMs)

  if (!shared) {
    const own = ref(Date.now())
    let stop: (() => void) | undefined
    onMounted(() => {
      stop = wallClock(() => {
        own.value = Date.now()
      }, intervalMs)
    })
    onUnmounted(() => stop?.())
    return own
  }

  onMounted(() => {
    sharedSubscribers += 1
    if (sharedStop === undefined) {
      sharedStop = wallClock(() => {
        sharedNow.value = Date.now()
      }, intervalMs)
    }
  })
  onUnmounted(() => {
    if (sharedSubscribers > 0) sharedSubscribers -= 1
    if (sharedSubscribers === 0 && sharedStop !== undefined) {
      sharedStop()
      sharedStop = undefined
    }
  })
  return sharedNow
}

/** 组件外要非默认间隔时的退路:不自起表,只给一个当前读数 */
function localNow(intervalMs: number): Ref<number> {
  void intervalMs
  return ref(Date.now())
}
