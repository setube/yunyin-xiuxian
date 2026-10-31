/**
 * 云隐修仙录 Service Worker:离线缓存,只管能退化的缓存层
 *  · 导航请求(hash 路由下都落在 index.html)network-first,离线才回退缓存
 *  · /assets/*(vite 内容哈希命名)与 manifest / 图标 / 音频等 public/ 稳定文件 cache-first
 *  · 跨域(51.la 统计 SDK 等)不干预
 *
 * 发版提醒:改了需要换缓存内容的策略(资产路径规则、导航回退行为等)须同步 bump CACHE_VERSION,
 * 否则 activate 不清旧缓存。它是唯一的缓存版本号,不在别处另设。
 */

const CACHE_VERSION = 'yunyin-v2'

/**
 * 本地外壳(Electron 的 file://、Capacitor 的 https://localhost)里不许存在 SW:fetch() 本地 URL 失败、
 * 缓存无副本,接管导航只剩 503 兜底页。main.ts 不在这两处注册;此处让旧版已注册的 SW 更新后自我注销并清缓存。
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
  if (IN_LOCAL_SHELL) return
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
    return
  }
  event.respondWith(cacheFirst(req))
})
