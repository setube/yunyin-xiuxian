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

/**
 * 装好就把导航页与它的首屏资产预缓存下来。
 *
 * 此前**只靠 fetch 事件被动填缓存**,而首次加载的那批请求发生在 SW 接管**之前** ——
 * 一个都收不到。于是:玩家首次打开游戏 → 立刻断网 → 重载,看到的是 SW 的
 * 「离线且无缓存副本」503 兜底页(实测复现)。缓存要等**下一次**受控请求才开始有东西。
 *
 * 这里在 install 阶段主动取一次导航页,再把它引用的同源脚本/样式一并存下 ——
 * 这正是「装完立刻没网也能重开」需要的那几件。其余资产(字体、图标、音频)
 * 仍走 cacheFirst 的被动填充:它们不影响「能不能起来」,少存几件只是慢一点。
 *
 * 任何一件取不到都不算失败:`cache.addAll` 是原子的,单件 404 会让整批落空,
 * 故逐件 put 并吞掉单个错误。
 */
const PRECACHE_EXTRA = ['manifest.webmanifest', 'favicon.ico']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION)
        const base = new URL('./', self.location).href
        // 导航页本身
        const pageRes = await fetch(new URL('index.html', base), { cache: 'reload' })
        if (pageRes.ok) {
          await cache.put(new URL('index.html', base), pageRes.clone())
          // 从 HTML 里挑出同源的脚本与样式(首屏必需的那几件)
          const html = await pageRes.text()
          const refs = new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|webmanifest))"/g)].map((m) => m[1]))
          /*
           * 首屏主 chunk 里还挂着**全部路由懒加载 chunk** 的依赖表(`__vite__mapDeps`)。
           * 只预缓存 HTML 引到的那几件不够:路由组件是动态 import,离线新开页面时
           * `WelcomeView-*.js` / `.css` 请求发出去了但缓存里没有 —— 应用挂上了、视图渲染不出来。
           *
           * 实测(纯静态服务):主 chunk 与样式全部 `fromServiceWorker: true` 200,
           * 只有 `WelcomeView-*.css` 是 503,结果 `#app` 有子节点但 innerText 为空。
           *
           * 这张表就在主 chunk 里,解析出来一并存下。它是构建产物里的字面量,
           * 不是运行期才知道的东西,故可在 install 阶段静态取到。
           */
          for (const m of html.matchAll(/src="([^"]+\.js)"/g)) refs.add(m[1])
          const mainJs = [...refs].find((r) => /assets\/index-.*\.js$/.test(r))
          if (mainJs) {
            try {
              const mainRes = await fetch(new URL(mainJs, base), { cache: 'reload' })
              if (mainRes.ok) {
                const code = await mainRes.text()
                const deps = code.match(/m\.f=\[([^\]]*)\]/)
                if (deps) {
                  /*
                   * 依赖表里的条目是相对**主 chunk 所在目录**的(`./WelcomeView-xxx.js`),
                   * 而主 chunk 在 `assets/` 下 —— 直接 `new URL('./X', base)` 会拼成根目录的
                   * `/X`,取不到东西。这里显式补上 `assets/` 前缀。
                   */
                  const mainDir = mainJs.slice(0, mainJs.lastIndexOf('/') + 1)
                  for (const dm of deps[1].matchAll(/"([^"]+)"/g)) {
                    const rel = dm[1]
                    if (!/\.(?:js|css)$/.test(rel)) continue
                    // 条目写作 `./X.js`,相对主 chunk 所在目录;剥掉 `./` 再拼 `assets/`
                    refs.add(mainDir + rel.replace(/^\.\//, ''))
                  }
                }
              }
            } catch {
              // 解析失败不影响主链路的预缓存
            }
          }
          await Promise.all(
            [...refs].map(async (ref) => {
              try {
                const url = new URL(ref, base)
                if (url.origin !== self.location.origin) return
                const res = await fetch(url, { cache: 'reload' })
                if (res.ok && res.type === 'basic') await cache.put(url, res)
              } catch {
                // 单件失败不影响其余
              }
            }),
          )
        }
        await Promise.all(
          PRECACHE_EXTRA.map(async (rel) => {
            try {
              const url = new URL(rel, base)
              const res = await fetch(url, { cache: 'reload' })
              if (res.ok && res.type === 'basic') await cache.put(url, res)
            } catch {
              // 缺哪个都不影响离线能不能起来
            }
          }),
        )
      } catch {
        // 预缓存整体失败也照常激活:被动缓存那条路还在
      }
      await self.skipWaiting()
    })(),
  )
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
    /*
     * 导航请求回退到「导航页」,不是回退到「同一个 URL」。
     *
     * hash 路由下玩家在任何页面刷新,请求的都是 `/` 或 `/#/xxx` 归一化后的 `/`,
     * 而 install 预缓存的那一份 key 是 `index.html` —— `cache.match(request)` 拿 URL 精确比,
     * 对不上就是 503。实测:缓存里已有 11 条(含 index.html),断网重载仍落 503 兜底页。
     *
     * 先按原 URL 试一次(普通页直取命中),再退到预缓存的导航页。
     */
    const exact = await cache.match(request)
    if (exact) return exact
    const shell = await cache.match(new URL('index.html', new URL('./', self.location).href))
    if (shell) return shell
    return new Response('离线且无缓存副本', { status: 503 })
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION)
  const cached = await cache.match(request)
  if (cached) return cached
  /*
   * 离线且未缓存时 `fetch` 会抛 —— 那会让这个请求以 `ERR_FAILED` 结束,
   * 而不是拿到一个「明确的失败响应」。对 `<script type=module>` 来说两者一样都加载不了,
   * 但抛出去的错误不带任何上下文,排查时看不出是缓存缺件。
   *
   * 更重要的是:`respondWith` 收到 rejected promise 时浏览器只报 net::ERR_FAILED,
   * 与「SW 根本没接管」的表现完全相同 —— 实测就把它误判成了「SW 没接管」。
   * 这里显式返回 503,把「离线且没有这一件」这件事说清楚。
   */
  try {
    const res = await fetch(request)
    if (res.ok && res.type === 'basic') {
      await cache.put(request, res.clone())
    }
    return res
  } catch {
    return new Response('离线且无缓存副本', { status: 503 })
  }
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
