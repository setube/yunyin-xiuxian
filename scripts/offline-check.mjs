/* eslint-disable no-console -- 自检报告 */
/**
 * 离线自检:SW 接管、缓存落盘与旧缓存清理、断网重载、发版接管(导航 network-first)。
 * SW 只认安全上下文(https / localhost),layout-check 的 file:// 量不了,改起本地静态服务(dist 临时副本)。
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
import { requireDist } from './lib/requireDist.mjs'

/**
 * 产物过期就别往下跑。
 *
 * 这份脚本读的是 `dist/` 的构建产物;改了 `src/` 却没重新 build 时,
 * 它量到的是旧代码,而读数看起来完全正常 —— 那比报错更糟。
 * 与 aria-check / focus-check / multitab-check 同一道闸。
 */
if (!requireDist('离线自检')) process.exit(1)


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html 不存在 —— 先跑 `bun run build`(自检量的是构建产物)')
  process.exit(1)
}

/** 版本号从 sw.js 现读,判据不另抄 */
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

/** 静态服务;带扩展名的未命中直接 404 */
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

// 用 dist 副本:发版接管要改 index.html,不动真产物
const work = mkdtempSync(join(tmpdir(), 'offline-check-'))
cpSync(DIST, work, { recursive: true })
const server = await serve(work)
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({
  // 容器里 headless 常崩(无用户命名空间、/dev/shm 仅 64M),同 ui-smoke/layout-check
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 140)))

/** 启动判据:正文出现「开始游戏」,不认 DOM 结构 */
async function booted() {
  return page.evaluate(() => {
    const text = document.body?.innerText || ''
    const door = /开\s*始\s*游\s*戏/.test(text)
    return { door, blank: text.trim().length === 0, swError: /离线且无缓存副本/.test(text) }
  })
}

/*
 * 整段包 try/catch/finally —— 与其余实测脚本同一理由。
 *
 * 这份多一样要收:除了浏览器,还有一个监听在本机随机端口的静态服务器。
 * 原先 `browser.close()` 与 `server.close()` 都是裸语句,任何一处 evaluate 超时
 * 都会跳过它们,同时把 `pass` 里已验过的条目一起吞掉 —— 屏幕上只剩一行堆栈。
 */
try {
// ---- 一 首次联网访问:SW 接管 + 缓存落盘 ----
// 先种一份旧版本缓存,验 activate 会清掉它
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

// 首次加载时页面可能尚未受控,刷新一次
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

// ---- 二 断网重载 ----
await context.setOffline(true)
await page.reload({ waitUntil: 'load' }).catch(() => {})
await page.waitForTimeout(1500)
const off = await booted()
if (off.swError) failures.push('断网重载落到了 SW 的 503 兜底页(「离线且无缓存副本」)—— 缓存里缺导航页')
else if (!off.door || off.blank) failures.push('断网重载之后应用没起来(白屏/没出现入口)—— 离线可重开这句承诺没兑现')
else pass.push('断网重载:应用照常起得来')
await context.setOffline(false)

// ---- 三 发版接管:改了 index.html 须拿到新的 ----
const stamp = Date.now()
const marker = `deploy-${stamp}`
writeFileSync(join(work, 'index.html'), readFileSync(join(work, 'index.html'), 'utf8').replace('</head>', `<!-- ${marker} --></head>`))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(800)
const gotNew = await page.evaluate(m => document.documentElement.innerHTML.includes(m), marker)
if (!gotNew) failures.push('线上换了 index.html,再次访问仍是旧页面 —— 导航请求没有走 network-first,玩家会被钉在旧版本')
else pass.push('发版接管:导航请求拿到了新的 index.html')

if (pageErrors.length) failures.push(`离线自检页面异常:${[...new Set(pageErrors)].join(' | ')}`)
} catch (err) {
  // 中途崩了:记成一条失败与其余一起报 —— 不吞掉它,也不让它盖掉已经验过的
  failures.push(`离线自检中途中断:${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
} finally {
  // 浏览器与服务器都要关:漏一个,进程会带着监听端口一起留着
  await browser.close().catch(() => {})
  await new Promise(ok => server.close(ok))
}

console.log('\n离线自检(Service Worker · localhost)')
for (const p of pass) console.log(`✓ ${p}`)
if (failures.length === 0) {
  console.log('✓ 断网可重开、旧缓存会被清、发版能接管 —— 四件事都认结果')
} else {
  for (const f of failures) console.log(`✗ ${f}`)
  process.exitCode = 1
}
