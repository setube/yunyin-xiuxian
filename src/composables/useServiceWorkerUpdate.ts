/**
 * Service Worker 新版本检测 —— 发现「旧版在跑、新版本已就绪」时,把应用权交还调用方。
 *
 * sw.js 已有 skipWaiting + clientsClaim,不在此改它(见其「发版提醒」注释)。这里只做
 * 两件事:
 *   · 监听 `registration.updatefound` → `installing.statechange`,在**更新**(非首次安装)
 *     就绪时触发 onUpdate —— 弹不弹「重载」交给调用方;
 *   · 暴露 `reload()`:向等待中的 SW 补一次通知(无监听则忽略)后 `location.reload()`。
 *
 * 为什么认 `navigator.serviceWorker.controller`:
 *   navigator.serviceWorker.controller 在页面由 SW 接管(即至少运行过一次 SW)后才非空。
 *   「首次安装」时它为空 —— 玩家看到的本就是最新版,不该弹「重新加载」;只有旧版在跑、
 *   新脚本装上,才算一次真正的更新提示。这一条与 sw.js 的确保口吻一致:发版后重载
 *   即应用新版本,而 lastSeenVersion 对不上时,设置页的发布说明/顶栏圆点自然接手
 *   剩下的「看这版改了什么」。
 */

export interface ServiceWorkerUpdateHandle {
  /** 有新版本且已就绪,提示应用(由调用方决定怎么亮) */
  reload(): void
  /** 停止监听(不再触发 onUpdate 与 reload) */
  stop(): void
}

/**
 * 监听指定 registration 的新版本。onUpdate 在新版本就绪时调用一次。
 */
export function useServiceWorkerUpdate(
  registration: ServiceWorkerRegistration,
  onUpdate?: () => void
): ServiceWorkerUpdateHandle {
  let stopped = false

  const handleInstallerState = (installing: ServiceWorker): void => {
    if (installing.state !== 'installed') return
    if (stopped) return
    // 首次安装(controller 为空)时玩家看到的就是最新版,不提示;仅更新时常驻提示
    if (navigator.serviceWorker.controller) onUpdate?.()
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => handleInstallerState(installing))
  })

  // 注册是异步的,updatefound 只在后台检测发现新脚本时派发;注册完成后再主动
  // 要求检测一次,免得更新恰好发生在注册那一下被漏掉。
  void registration.update().catch(() => {
    /* 检测失败不算事故:下次导航仍会查 */
  })

  return {
    reload() {
      // sw.js 在 install 已 skipWaiting;这里对 waiting/installing 再补一次通知,
      // 容错皮带 —— 没有监听方则消息被忽略,不影响重载。
      const waiting = registration.waiting ?? registration.installing ?? null
      try {
        waiting?.postMessage({ type: 'SKIP_WAITING' })
      } catch {
        /* 通知失败也照常重载:reload 拉到的总是最新页面 */
      }
      location.reload()
    },
    stop() {
      stopped = true
    }
  }
}
