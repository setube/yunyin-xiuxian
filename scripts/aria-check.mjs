/**
 * 读屏关键属性的「真实 DOM」自检。
 *
 * 为什么要有这一份:静态扫源码只能证明「字符串写了」,证明不了「它挂在了会渲染的元素上」。
 * 实测踩过 —— role="status" / aria-live 写在 <TransitionGroup> 上,而它是 fragment 不产元素,
 * 属性被整个丢掉,源码里搜得到、DOM 里查不到,真正的读屏用户仍然什么都听不见。
 */
import { chromium } from 'playwright'
import { preview } from 'vite'
import { seedSave, lateSlices } from './lib/saveFixture.mjs'

const PORT = 4235
const server = await preview({ preview: { port: PORT, strictPort: true } })
const BASE = `http://localhost:${PORT}/`
const failures = []
let browser

try {
  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.route('**/*', r => (/^https?:\/\/localhost:/.test(r.request().url()) ? r.continue() : r.abort()))
  await seedSave(ctx, lateSlices())
  const page = await ctx.newPage()
  await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  // 1) toast 播报区须真实存在且属性齐全
  const live = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[role="status"]')]
    return els.map(e => ({ live: e.getAttribute('aria-live'), atomic: e.getAttribute('aria-atomic') }))
  })
  const host = live.find(e => e.live === 'polite')
  if (!host) failures.push('DOM 里找不到 role=status + aria-live=polite 的播报区(可能挂在了不渲染的元素上)')
  else if (host.atomic !== 'false') failures.push('播报区 aria-atomic 不是 false,同帧多条提示会被拼成一句')
  console.log(`  ${host ? '✓' : '✗'} toast 播报区存在于 DOM (aria-live=${host?.live}, aria-atomic=${host?.atomic})`)

  // 2) 装饰图标不进读屏
  const strayIcons = await page.evaluate(
    () => [...document.querySelectorAll('svg')].filter(s => s.getAttribute('aria-hidden') !== 'true').length
  )
  if (strayIcons > 0) failures.push(`${strayIcons} 个 <svg> 没挂 aria-hidden,读屏会把图标念一遍`)
  console.log(`  ${strayIcons === 0 ? '✓' : '✗'} 页面上所有 <svg> 均已 aria-hidden`)

  // 3) main 可编程聚焦(切页焦点归位的前提)
  const mainFocusable = await page.evaluate(() => {
    const m = document.querySelector('main')
    return m?.getAttribute('tabindex') === '-1'
  })
  if (!mainFocusable) failures.push('main 缺 tabindex=-1,切页时无法把焦点移过去')
  console.log(`  ${mainFocusable ? '✓' : '✗'} main 可编程聚焦`)

  // 4) 每页都要有可定位的页面标题(读屏用户靠标题跳转)
  const ROUTES = ['/', '/cultivation', '/adventure', '/inventory', '/character', '/dongfu', '/market', '/settings']
  for (const r of ROUTES) {
    await page.evaluate(h => { location.hash = '#' + h }, r)
    await page.waitForTimeout(600)
    const n = await page.evaluate(() => document.querySelectorAll('h1,h2,h3').length)
    if (n === 0) failures.push(`${r} 没有任何标题元素(h1/h2/h3),读屏用户无法按标题定位`)
    console.log(`  ${n > 0 ? '✓' : '✗'} ${r.padEnd(14)} 标题 ${n} 个`)
  }

  // 5) 每个弹窗都有可辨识名字(隐私政策在设置页)
  await page.evaluate(() => { location.hash = '#/settings' })
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /隐私政策/ }).first().click()
  await page.waitForTimeout(500)
  const named = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    if (!d) return null
    return { label: d.getAttribute('aria-label') ?? '', titled: !!d.getAttribute('aria-labelledby') || !!d.querySelector('h1,h2,h3') }
  })
  if (!named) failures.push('点开隐私政策后没有出现 role=dialog')
  else if (!named.label && !named.titled) failures.push('弹窗没有可辨识名字')
  console.log(`  ${named && (named.label || named.titled) ? '✓' : '✗'} 弹窗有可辨识名字`)
} finally {
  await browser?.close()
  await server.httpServer.close()
}

if (failures.length > 0) {
  console.error('\n读屏属性自检失败:')
  for (const f of failures) console.error('  · ' + f)
  process.exitCode = 1
} else {
  console.log('\n✓ 关键读屏属性在真实 DOM 上都成立(不只是源码里写了)')
}
