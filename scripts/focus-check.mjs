/**
 * 切页焦点自检(独立于 ui-smoke)。
 *
 * 为什么单独一份:ui-smoke 每根链接前都用 page.goto 整页重载,
 * 那种情况下 Vue Transition 的 state.isMounted=false,@after-enter 本就不跑,
 * 焦点停在 body 是正常的 —— 混进去只会误报。
 * 这里只做真 SPA 跳转:一次加载,连点底栏五项,每次确认 activeElement 是 <main>。
 */
import { chromium } from 'playwright'
import { preview } from 'vite'
import { seedSave, lateSlices } from './lib/saveFixture.mjs'

const PORT = 4211
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
  await page.waitForTimeout(1600)

  // 端口上跑的可能不是本应用:那样测出来的通过毫无意义
  {
    const title = await page.title()
    if (title !== '云隐修仙录') failures.push(`localhost:${PORT} 上不是本应用(title=${JSON.stringify(title)})`)
  }

  // 底栏五项逐个点(第 1 项是当前页,跳过)
  for (const nth of [2, 3, 4, 5, 1]) {
    await page.click(`nav a:nth-child(${nth})`)
    await page.waitForTimeout(700)
    const r = await page.evaluate(() => ({
      active: document.activeElement?.tagName ?? 'null',
      hash: location.hash,
      tabindex: document.querySelector('main')?.getAttribute('tabindex')
    }))
    const ok = r.active === 'MAIN'
    console.log(`  ${ok ? '✓' : '✗'} ${r.hash.padEnd(14)} 焦点 ${r.active}`)
    if (!ok) failures.push(`${r.hash} 切页后焦点在 ${r.active},没回到内容区`)
    if (r.tabindex !== '-1') failures.push('main 缺 tabindex=-1,无法用脚本把焦点移过去')
  }
} finally {
  await browser?.close()
  await server.httpServer.close()
}

if (failures.length > 0) {
  console.error('\n切页焦点自检失败:')
  for (const f of failures) console.error('  · ' + f)
  // 用 exitCode 而非 process.exit():后者会截断已写出的 stderr(管道下尤其明显)
  process.exitCode = 1
} else {
  console.log('\n✓ 切页后焦点一律落回内容区(main),键盘与读屏不会从 body 重新数起')
}
