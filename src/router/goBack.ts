import type { RouteLocationRaw, Router } from 'vue-router'

/**
 * 返回:有站内来路就退回去,没有就回父页。
 * 冷启动(书签 / deep link / PWA 恢复上次路由)时裸 `router.back()` 会退到 `about:blank`,游戏随之消失。
 * 判据:Vue Router 写进 `history.state` 的 `back` 字段。
 */
export function goBack(router: Router, fallback: RouteLocationRaw): void {
  const state = window.history.state as { back?: string | null } | null
  if (state?.back) void router.back()
  else void router.push(fallback)
}
