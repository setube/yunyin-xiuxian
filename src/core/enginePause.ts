/**
 * 心跳暂停的墙上时钟 —— 暂停期间「现在」必须冻住。
 *
 * 暂停只发生在不可逆操作前的确认窗(重置 / 导入)。心跳停了,但凡是按
 * `Date.now()` 判到期的东西(Buff、卦、区域事件、突破准备、历练窗口)若继续走,
 * 就会在玩家还没点确认时自己消失或自己结算 —— 看起来像「我没点它自己动了」。
 *
 * 故把暂停状态独立成一个模块:引擎与 UI 都能读,且不形成
 * `engine → earlyGameService → engine` 的循环依赖。
 *
 * 用法:
 *   - 可冻结的到期判定读 `gameNow()`,不要直接读 `Date.now()`;
 *   - 恢复时由引擎把暂停时长补回各条墙上时钟(见 engine.resume);
 *   - 墙钟域(坊市货架、悬赏换版、弟子跑腿)明确不走这里 —— 它们暂停时也该照常结算。
 */
import { readonly, ref } from 'vue'

const pausedRef = ref(false)
let pauseStartedAt = 0

export const enginePaused = readonly(pausedRef)

/** 进入 / 退出暂停。重复进入不重置冻结点(幂等) */
export function setEnginePaused(value: boolean): void {
  if (value) {
    if (!pausedRef.value) pauseStartedAt = Date.now()
    pausedRef.value = true
    return
  }
  pausedRef.value = false
  pauseStartedAt = 0
}

/** 游戏内可冻结的「现在」:暂停时停在暂停那一刻,恢复后回到真实时钟 */
export function gameNow(): number {
  return pausedRef.value && pauseStartedAt > 0 ? pauseStartedAt : Date.now()
}

/** 已暂停多久(毫秒);未暂停或不早于冻结点时返回 0 */
export function pauseElapsedMs(now = Date.now()): number {
  if (!pausedRef.value || pauseStartedAt <= 0) return 0
  return Math.max(0, now - pauseStartedAt)
}
