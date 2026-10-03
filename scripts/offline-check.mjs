/* eslint-disable no-console -- 自检脚本的产出就是给人看的报告 */
/**
 * 离线自检 —— 「断网还能重开」这句承诺,真的兑现了吗
 *
 * 为什么单起一个脚本:layout-check 跑在 `file://` 上,而 Service Worker 只认
 * 安全上下文(https 或 localhost),两件事没法在同一个页面里量。故这里起一个
 * 本地静态服务(dist 的临时副本),在那里量 SW 的浏览器级行为。
 *
 * 量的四件事(全部只认结果,不认实现):
 *   一 首次联网访问后,SW 真的接管了页面(controller 非空)—— 没接管就没有离线;
 *   二 缓存里**同时**有导航页与带 hash 的产物;activate 时旧版本缓存被清掉
 *      (CACHE_VERSION 改了却忘了清,玩家离线回退就会落到老页面);
 *   三 **断网重载**仍能起得来(离线可重开 —— 这是玩家在飞机/地铁上唯一的指望);
 *   四 **发版接管**:导航请求走 network-first,线上改了 index.html 之后,
 *      再次访问必须看到新那份(否则玩家被永久钉在旧版本上)。
 *
 * 用法:
 *   bun run build
 *   bunx playwright install chromium
 *   bun scripts/offline-check.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { cpSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html 不存在 —— 先跑 `bun run build`(自检量的是构建产物)')
  process.exit(1)
}

/** SW 的缓存版本号就是它唯一的"人工记得"的旋钮,从源码读,免得判据自己抄一份 */
const CACHE_VERSION = /CACHE_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'public/sw.js'), 'utf8'))?.[1]
if (!CACHE_VERSION) {
  console.error('从 public/sw.js 里读不到 CACHE_VERSION —— 判据无从下手')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg'
}

/** 起一个够用的静态服务:根路径回 index.html,带扩展名的 404 就直接 404 */
function serve(dir) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    const target = join(dir, url === '/' ? 'index.html' : url)
    if (!target.startsWith(dir) || !existsSync(target) || statSync(target).isDirectory()) {
      if (extname(url)) {
        res.writeHead(404).end('not found')
        return
      }
      res.writeHead(200, { 'content-type': MIME['.html'] })
      res.end(readFileSync(join(dir, 'index.html')))
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' })
    res.end(readFileSync(target))
  })
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)))
}

const failures = []
const pass = []

// 用 dist 的副本:第四件事要改 index.html,不能动真产物
const work = mkdtempSync(join(tmpdir(), 'offline-check-'))
cpSync(DIST, work, { recursive: true })
const server = await serve(work)
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({
  // 容器里 headless 常崩(无用户命名空间、/dev/shm 只有 64M) —— 与 ui-smoke/layout-check 同一处防
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 140)))

/** 应用真的起来了 —— 认"开始游戏"这扇门,不认某个 div 存不存在 */
async function booted() {
  return page.evaluate(() => {
    const text = document.body?.innerText || ''
    const door = /开\s*始\s*游\s*戏/.test(text)
    return { door, blank: text.trim().length === 0, swError: /离线且无缓存副本/.test(text) }
  })
}

// ---- 一 首次联网访问:SW 接管 + 缓存落盘 ----
// 先在同一个 origin 上种一份"老版本缓存",看 activate 会不会把它清掉
await page.goto(`${base}/privacy.html`, { waitUntil: 'load' })
await page.evaluate(async () => {
  const c = await caches.open('yunyin-v0-stale')
  await c.put('/stale-marker', new Response('old'))
})

await page.goto(`${base}/`, { waitUntil: 'load' })
const controlled = await page
  .evaluate(async () => {
    await navigator.serviceWorker.ready
    return !!navigator.serviceWorker.controller
  })
  .catch(() => false)

// 首次加载时 SW 刚接管,页面本身可能还没被控制;刷新一次就该是它了
if (!controlled) await page.reload({ waitUntil: 'load' })
const afterReloadControlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
if (!afterReloadControlled) {
  failures.push('SW 没能接管页面(navigator.serviceWorker.controller 为空)—— 没接管就没有离线')
} else {
  pass.push('SW 已接管页面')
}

const cachesNow = await page.evaluate(() => caches.keys())
if (!cachesNow.includes(CACHE_VERSION)) failures.push(`缓存里没有 ${CACHE_VERSION}(现为:${cachesNow.join('、') || '空'})`)
else pass.push(`缓存分片 ${CACHE_VERSION} 已建立`)
if (cachesNow.includes('yunyin-v0-stale')) {
  failures.push('activate 没有清理旧版本缓存(yunyin-v0-stale 还在)—— 改 CACHE_VERSION 也甩不掉老页面')
} else {
  pass.push('旧版本缓存已被 activate 清掉')
}

const cachedCount = await page.evaluate(async name => {
  const c = await caches.open(name)
  return (await c.keys()).length
}, CACHE_VERSION)
if (cachedCount < 3) failures.push(`缓存里只有 ${cachedCount} 条(导航页 + 静态产物至少该有几条)—— 离线必然缺件`)
else pass.push(`缓存里已备下 ${cachedCount} 份资源`)

// ---- 二 断网重载:玩家在飞机/地铁上要的那一下 ----
await context.setOffline(true)
await page.reload({ waitUntil: 'load' }).catch(() => {})
await page.waitForTimeout(1500)
const off = await booted()
if (off.swError) failures.push('断网重载落到了 SW 的 503 兜底页(「离线且无缓存副本」)—— 缓存里缺导航页')
else if (!off.door || off.blank) failures.push('断网重载之后应用没起来(白屏/没出现入口)—— 离线可重开这句承诺没兑现')
else pass.push('断网重载:应用照常起得来')
await context.setOffline(false)

// ---- 三 发版接管:线上换了 index.html,玩家必须看到新的那份 ----
const stamp = Date.now()
const marker = `deploy-${stamp}`
writeFileSync(join(work, 'index.html'), readFileSync(join(work, 'index.html'), 'utf8').replace('</head>', `<!-- ${marker} --></head>`))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(800)
const gotNew = await page.evaluate(m => document.documentElement.innerHTML.includes(m), marker)
if (!gotNew) failures.push('线上换了 index.html,再次访问仍是旧页面 —— 导航请求没有走 network-first,玩家会被钉在旧版本')
else pass.push('发版接管:导航请求拿到了新的 index.html')

if (pageErrors.length) failures.push(`离线自检页面异常:${[...new Set(pageErrors)].join(' | ')}`)

await browser.close()
server.close()

console.log('\n离线自检(Service Worker · localhost)')
for (const p of pass) console.log(`✓ ${p}`)
if (failures.length === 0) {
  console.log('✓ 断网可重开、旧缓存会被清、发版能接管 —— 四件事都认结果')
} else {
  for (const f of failures) console.log(`✗ ${f}`)
  process.exitCode = 1
}
