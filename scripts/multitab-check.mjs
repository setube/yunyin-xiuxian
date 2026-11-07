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
import { requireDist } from './lib/requireDist.mjs'

const PORT = 4277
const WARN = '存档已在另一页打开'
const server = await preview({ preview: { port: PORT, strictPort: true } })
const BASE = `http://localhost:${PORT}/`
if (!requireDist('多标签自检')) process.exit(1)

const failures = []
let browser

/** 装一个把出现过的 toast 文本攒起来的观察器(2.6s 就消失,直接采样会漏) */
async function watchToasts(page) {
  await page.evaluate(() => {
    window.__toasts = []
    new MutationObserver(() => {
      /*
       * 直接取每条提示的整块,不要用 `[role="status"] button` ——
       * 提示条本体已改成 `div`(整条可点会变成一层盖住内容的透明遮罩),
       * 只剩右侧那颗关闭钮还是 button,按它取只会拿到一个「×」。
       */
      for (const el of document.querySelectorAll('[role="status"] > div')) {
        const t = (el.textContent ?? '').replace(/\s*×\s*$/, '').trim()
        if (t && !window.__toasts.includes(t)) window.__toasts.push(t)
      }
    }).observe(document.body, { childList: true, subtree: true })
  })
}

try {
  browser = await chromium.launch()

  // 心跳只在开局后跑:欢迎页每 4 秒写一次 localStorage 是白耗(本项目刻意把写盘攒到 5 秒一次就是为了不发烫)
  {
    const welcomeCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await welcomeCtx.route('**/*', r => (/^https?:\/\/localhost:/.test(r.request().url()) ? r.continue() : r.abort()))
    const wp = await welcomeCtx.newPage()
    await wp.goto(BASE + '#/welcome', { waitUntil: 'domcontentloaded' })
    await wp.evaluate(() => {
      window.__liveWrites = 0
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes('__live')) window.__liveWrites += 1
        return orig.call(this, k, v)
      }
    })
    const wpTitle = await wp.title()
    if (wpTitle !== '云隐修仙录') failures.push(`localhost:${PORT} 上不是本应用(title=${JSON.stringify(wpTitle)})`)
    await wp.waitForTimeout(10000)
    const liveWrites = await wp.evaluate(() => window.__liveWrites)
    if (liveWrites > 0) failures.push(`欢迎页也在发跨标签心跳(${liveWrites} 次/10 秒),没开局不该写 localStorage`)
    console.log(`  ${liveWrites === 0 ? '✓' : '✗'} 欢迎页不发心跳(实测 ${liveWrites} 次/10 秒)`)
    await welcomeCtx.close()
  }

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
  /*
   * 先等第一页把开局流程走完、心跳跑起来。
   *
   * 原先只等 1500ms 就开第二页 —— 那时第一页的 `started` 往往还没置真,
   * `watchOtherTabSave(started)` 因此没开表,storage 事件来了也判不出「对面还开着」。
   *
   * 等条件而不是等时长:`BottomNavigation` 由 `v-if="game.started"` 控制,
   * 它出现即代表开局完成。写死 6000ms 在慢机器上依然会偶发失败。
   */
  await first.waitForSelector('nav', { timeout: 15000 })
  await first.waitForTimeout(500)
  const second = await ctx.newPage()
  await second.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  /*
   * 心跳周期是 LIVE_PING_MS = 4000,且从第二页开局算起。
   * 原先第二页等 2000、第一页再等 2500 —— 合计 4.5 秒看着够,
   * 但第二页那次 2000ms 等待排在页面加载之后,心跳要等它自己的 4 秒计时到点,
   * 第一页往往在心跳发出之前就检查完了,于是长期误报「没收到提示」。
   * 等足一个周期再加余量。
   */
  await second.waitForTimeout(4500)
  await first.waitForTimeout(3000)
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
