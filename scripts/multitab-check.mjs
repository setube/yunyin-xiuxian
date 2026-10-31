/**
 * 两页同开自检。
 *
 * 为什么要有这一份:两页各自持一份内存状态、各自每 5 秒整片落盘,后写的覆盖先写的,
 * 两边都掉进度而玩家毫无察觉。storage 事件只在「别的标签页」写入时触发,
 * 因此判据必须是「开第二页 → 第一页收到提示」,单页跑多久都不该报。
 * 两个方向都要验:该报的报出来,不该报的不要误报。
 */
import { chromium } from 'playwright'
import { preview } from 'vite'
import { seedSave, lateSlices } from './lib/saveFixture.mjs'

const PORT = 4277
const WARN = '存档已在另一页打开'
const server = await preview({ preview: { port: PORT, strictPort: true } })
const BASE = `http://localhost:${PORT}/`
const failures = []
let browser

/** 装一个把出现过的 toast 文本攒起来的观察器(2.6s 就消失,直接采样会漏) */
async function watchToasts(page) {
  await page.evaluate(() => {
    window.__toasts = []
    new MutationObserver(() => {
      for (const b of document.querySelectorAll('[role="status"] button')) {
        const t = (b.textContent ?? '').trim()
        if (t && !window.__toasts.includes(t)) window.__toasts.push(t)
      }
    }).observe(document.body, { childList: true, subtree: true })
  })
}

try {
  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.route('**/*', r => (/^https?:\/\/localhost:/.test(r.request().url()) ? r.continue() : r.abort()))
  await seedSave(ctx, lateSlices())

  // 单页:跑够一个心跳周期以上,不该出现该提示
  const solo = await ctx.newPage()
  await solo.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  await watchToasts(solo)
  await solo.waitForTimeout(9000)
  const soloWarned = await solo.evaluate(w => window.__toasts.some(t => t.includes(w)), WARN)
  if (soloWarned) failures.push('只开一页也报了「存档已在另一页打开」—— 误报')
  console.log(`  ${soloWarned ? '✗' : '✓'} 单页无误报`)
  await solo.close()

  // 两页:第二页起来后第一页须收到
  const first = await ctx.newPage()
  await first.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  await watchToasts(first)
  await first.waitForTimeout(1500)
  const second = await ctx.newPage()
  await second.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  await second.waitForTimeout(2000)
  await first.waitForTimeout(2500)
  const warned = await first.evaluate(w => window.__toasts.some(t => t.includes(w)), WARN)
  if (!warned) failures.push('开了第二页,第一页没收到「存档已在另一页打开」')
  console.log(`  ${warned ? '✓' : '✗'} 两页同开时提示已给出`)
} finally {
  await browser?.close()
  await server.httpServer.close()
}

if (failures.length > 0) {
  console.error('\n两页同开自检失败:')
  for (const f of failures) console.error('  · ' + f)
  process.exitCode = 1
} else {
  console.log('\n✓ 两页同开能提示,单页不误报')
}
