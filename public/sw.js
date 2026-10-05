/**
 * 云隐修仙录 Service Worker —— 离线缓存(见 RIL TASK-157 / DEC-033)
 *
 * 策略(对内容哈希资产绝对安全):
 *  · 导航请求(= index.html,hash 路由下所有导航都落在它身上)走 network-first:
 *    在线永远拿最新发版,离线才回退缓存 —— 发版不会卡在旧页面上
 *  · /assets/* 是 vite 内容哈希命名的产物,不同构建永不重名,故 cache-first
 *    不存在"缓存错了版本"的可能
 *  · manifest / 图标 / 音频等 public/ 稳定文件 cache-first,离线下照样出声出图
 *  · 外部跨域(51.la 统计 SDK 等)一律不干预
 *  · core 逻辑全部打在 web/app 窗口侧,这里只管能退化的缓存层
 *
 * 【发版提醒】改了需要换缓存内容的策略(如资产路径规则、导航回退行为)时,
 * 务必同步 bump CACHE_VERSION —— 否则 activate 不会触发旧缓存清理,玩家
 * 离线回退仍会落到老页面。这是唯一需要人工记得的版本号,别在别处另设。
 */

const CACHE_VERSION = 'yunyin-v2'

/**
 * 本地外壳里不许存在:Electron 跑在 file://,Capacitor 跑在 https://localhost。
 * 这两处 fetch() 本地 URL 会失败、缓存又没有副本,SW 一接管导航就只剩 503 兜底页
 * (Windows 白屏、安卓卡加载)。main.ts 已不在这两处注册;这里是给**已经被旧版注册过**
 * 的玩家准备的 —— 浏览器每次导航都会拿新的 sw.js 做更新检查,新脚本一装上就自我注销,
 * 再把自己开的缓存清掉,下一次启动便恢复正常。
 */
const IN_LOCAL_SHELL = self.location.protocol === 'file:' || self.location.origin === 'https://localhost'
if (IN_LOCAL_SHELL) {
  self.addEventListener('install', () => self.skipWaiting())
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
        await self.registration.unregister()
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const c of clients) c.navigate(c.url)
      })()
    )
  })
}

self.addEventListener('install', () => {
  // 新 SW 就位后立刻接管,不等旧页签全部关闭
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

/** 在线取最新,失败才回退缓存(导航页专用) */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION)
  try {
    const fresh = await fetch(request)
    if (fresh.ok && fresh.type === 'basic') {
      await cache.put(request, fresh.clone())
    }
    return fresh
  } catch {
    const cached = await cache.match(request)
    return cached ?? new Response('离线且无缓存副本', { status: 503 })
  }
}

/** 缓存优先,未命中才请求并落缓存(带 hash 的产物 / 稳定公共文件) */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION)
  const cached = await cache.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone())
  }
  return res
}

self.addEventListener('fetch', (event) => {
  // 本地外壳里一概不接管:让浏览器按原样加载,直到上面的 activate 把自己注销
  if (IN_LOCAL_SHELL) return
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 只管自己源上的:跨域(统计脚本等)让浏览器默认处理
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
    return
  }
  event.respondWith(cacheFirst(req))
})
