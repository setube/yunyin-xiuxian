/**
 * 系统层「减少动效」偏好是否开启。
 *
 * 它和设置里的 `settings.reduceMotion` 是**两件事**,但都会被 style.css 的两条规则命中:
 *
 *   @media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important } }
 *   .reduce-motion *                       { animation-duration: .01ms !important }
 *
 * 两条规则是并集语义,任一命中就生效 —— 这是对的(系统偏好是玩家的明确意愿,
 * 不该被应用内开关推翻)。代价是:**系统开着时,设置里那颗开关点了没有反应**:
 * 类名去掉了,媒体查询还在,动画照样被压成 0.01ms(真浏览器实测 animationDuration 仍是 1e-05s)。
 *
 * 所以设置页需要知道这件事,把它置灰并写清原因(仓库规矩「禁用即给原因」),
 * 而不是留一颗骗人的开关。本文件只负责探测;置灰与文案在设置页。
 *
 * 三处调用方(设置页置灰、SpiritRootReveal 跳过轮换、战斗回放跳过)共用这一份判断,
 * 免得三处各写一遍 `matchMedia` 而口径走散。
 */
import { onMounted, onUnmounted, readonly, ref, type Ref } from 'vue'

const QUERY = '(prefers-reduced-motion: reduce)'

/** 当前系统偏好;无 DOM 环境(测试、SSR)一律 false */
function current(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches === true
}

/**
 * 响应式的系统偏好。
 *
 * 会在**运行时变化**:玩家在系统设置里切换「减少动效」时,浏览器通常不刷新页面就换掉了偏好,
 * 所以这里挂 `change` 监听而不是读一次算数 —— 否则开关的置灰状态要等下次启动才对。
 * 监听只在组件挂载期存在,卸载时摘掉。
 */
export function useSystemReducedMotion(): Readonly<Ref<boolean>> {
  const on = ref(current())
  let mql: MediaQueryList | null = null
  const sync = (): void => {
    on.value = current()
  }
  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    mql = window.matchMedia(QUERY)
    sync()
    // 老 Safari 只有 addListener;先试新接口,不行再退回旧的
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', sync)
    else if (typeof mql.addListener === 'function') mql.addListener(sync)
  })
  onUnmounted(() => {
    if (mql === null) return
    if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', sync)
    else if (typeof mql.removeListener === 'function') mql.removeListener(sync)
    mql = null
  })
  return readonly(on)
}

/**
 * 非响应式的一次性判断:给「此刻要不要跳过动画」这类同步决策用。
 * 与 `useSystemReducedMotion` 同一口径,别处不要再手写 `matchMedia`。
 */
export function systemReducedMotion(): boolean {
  return current()
}
