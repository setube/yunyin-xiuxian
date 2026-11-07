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
import { requireDist } from './lib/requireDist.mjs'

const PORT = 4235
const server = await preview({ preview: { port: PORT, strictPort: true } })
const BASE = `http://localhost:${PORT}/`
if (!requireDist('读屏属性自检')) process.exit(1)

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

  // 端口上跑的可能不是本应用:那样测出来的通过毫无意义
  {
    const title = await page.title()
    if (title !== '云隐修仙录') failures.push(`localhost:${PORT} 上不是本应用(title=${JSON.stringify(title)})`)
  }

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

  // 5) 触控目标不小于 28px:能点的盒子要够手指按
  //    复选框之类被 <label> 包住时,可点区域是 label 整体,量它而不是 input 本体
  const TOUCH_ROUTES = ['/', '/cultivation', '/inventory', '/settings', '/dongfu', '/market']
  for (const r of TOUCH_ROUTES) {
    await page.evaluate(h => { location.hash = '#' + h }, r)
    await page.waitForTimeout(600)
    const small = await page.evaluate(() => {
      const out = []
      for (const e of document.querySelectorAll('button, a[href], input, select, textarea')) {
        const host = e.closest('label') ?? e
        const rc = host.getBoundingClientRect()
        if (rc.width === 0 || rc.height === 0) continue
        if (rc.width < 28 || rc.height < 28) {
          out.push(`${e.tagName} ${Math.round(rc.width)}x${Math.round(rc.height)} «${(e.textContent ?? e.getAttribute('aria-label') ?? '').trim().slice(0, 8)}»`)
        }
      }
      return out
    })
    if (small.length > 0) failures.push(`${r} 触控目标过小:${small.slice(0, 3).join(' | ')}`)
    console.log(`  ${small.length === 0 ? '✓' : '✗'} ${r.padEnd(14)} 触控目标 ${small.length === 0 ? '全部 >=28px' : small.length + ' 处过小'}`)
  }

  /*
   * 6) 文本框要有可访问名。
   *
   * 只查静态源码证明不了「它挂在了会渲染的元素上」;而真实 DOM 上量得到
   * label 关联、aria-label、aria-labelledby 三者的实际生效情况。
   * 隐藏的 file input 跳过:它们由旁边按钮程序化 click(),不进 Tab 序。
   */
  /*
   * 这些页面上有 form 输入(含弹窗内的)。要覆盖弹窗,先点开它们 ——
   * 只扫首屏的话,/build 与 /celestial 的输入框都在弹窗里,永远扫不到,
   * 判据就成了空转。故障注入验过:去掉建号页的 aria-label,只扫首屏根本报不出来。
   */
  const FORM_ROUTES = ['/create', '/', '/build', '/celestial', '/settings']
  for (const r of FORM_ROUTES) {
    await page.evaluate(h => { location.hash = '#' + h }, r)
    await page.waitForTimeout(600)
    // 点开可能含输入框的入口(构筑保存、挑战立约),否则弹窗内的框永远扫不到
    for (const re of [/存当前构筑/, /立\s*契|择\s*约/, /改\s*名/]) {
      const btn = page.locator('main button').filter({ hasText: re }).first()
      if (await btn.count()) {
        if (!(await btn.isDisabled().catch(() => true))) {
          await btn.click({ timeout: 2000 }).catch(() => {})
          await page.waitForTimeout(400)
        }
      }
    }
    const scanned = await page.evaluate(() => {
      const out = []
      let seen = 0
      for (const e of document.querySelectorAll('input, select, textarea')) {
        // 隐藏元素读屏碰不到(如 file input)
        const rc = e.getBoundingClientRect()
        if (rc.width === 0 && rc.height === 0) continue
        if (e.type === 'hidden') continue
        const hasAria = Boolean(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'))
        const hasLabel = Boolean(e.labels && e.labels.length > 0)
        seen += 1
        if (!hasAria && !hasLabel) {
          out.push(`${e.tagName.toLowerCase()}[type=${e.type}] placeholder=«${e.getAttribute('placeholder') ?? ''}»`)
        }
      }
      return { unnamed: out, seen }
    })
    if (scanned.seen === 0) {
      /*
       * 一页都没扫到输入框,这条判据等于没跑。
       * 实测踩过:建号页在被首启守卫接管后不渲染输入框,而 /build 与 /celestial
       * 的输入框都在需要点开才出现的弹窗里 —— 五个路由全部 seen=0,
       * 判据静默报绿,而它什么都没验。
       * 不判失败(有些路由确实可能没有输入框),但必须把「没扫到」显式说出来。
       */
      console.log(`  · ${r.padEnd(14)} 无可见输入框(判据在此页未覆盖)`)
      continue
    }
    if (scanned.unnamed.length > 0) failures.push(`${r} 文本框缺可访问名:${scanned.unnamed.slice(0, 3).join(' | ')}`)
    console.log(`  ${scanned.unnamed.length === 0 ? '✓' : '✗'} ${r.padEnd(14)} 文本框可访问名 ${scanned.unnamed.length === 0 ? '全部具备(' + scanned.seen + ' 个)' : scanned.unnamed.length + ' 处缺失'}`)
  }

  // 7) 每个弹窗都有可辨识名字(隐私政策在设置页)
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

  /**
   * 7) 禁用按钮要给得出拒因 —— 在真实 DOM 上验,与 ui/disabledReason.spec 的源码判据互补。
   *
   * 那一份用正则读源码,会放过「三元表达式算出来的拒因」与「拒因写在别处」的区别;
   * 这一份看渲染结果:一个禁用的钮,玩家眼前要么有拒因、要么 hover/title 里有。
   *
   * 用「资源归零 + 空行囊」的夹具单独开一个 context —— 充足资源下禁用态几乎不出现,
   * 这条检查就形同虚设。归零后各页的禁用钮才是玩家真会看到的那些。
   */
  const zero = lateSlices()
  zero.resources = { spiritStone: { m: 0, e: 0 }, qi: 0, wudao: 0, herb: 0, ore: 0, page: 0, dust: 0 }
  zero.inventory.items = []
  zero.inventory.equipped = {}
  zero.inventory.pills = {}
  zero.inventory.artifacts = []

  const zeroCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await zeroCtx.route('**/*', r => (/^https?:\/\/localhost:/.test(r.request().url()) ? r.continue() : r.abort()))
  await seedSave(zeroCtx, zero, '__zeroFixture')
  const zeroPage = await zeroCtx.newPage()
  await zeroPage.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  await zeroPage.waitForTimeout(1500)

  const DENY_ROUTES = ['/', '/cultivation', '/adventure', '/inventory', '/market', '/dongfu', '/souls', '/build', '/apprentice']
  let denyChecked = 0
  const denyBad = []
  for (const r of DENY_ROUTES) {
    await zeroPage.evaluate(h => { location.hash = '#' + h }, r)
    await zeroPage.waitForTimeout(700)
    const bad = await zeroPage.evaluate(() => {
      const out = []
      for (const b of document.querySelectorAll('button')) {
        if (!b.disabled) continue
        const t = (b.innerText || '').replace(/\s+/g, '')
        if (!t) continue
        // 可空:title / aria-label / 正文里有拒因词
        if (b.title || b.getAttribute('aria-label')) continue
        if (/尚差|不足|未至|未满|已满|上限|在途|不可|无处|暂无|无可|闭关中|身在/.test(t)) continue
        out.push(t.slice(0, 16))
      }
      return out
    })
    denyChecked += 1
    if (bad.length > 0) denyBad.push(`${r}: ${bad.slice(0, 4).join(' | ')}`)
  }
  await zeroCtx.close()
  if (denyBad.length > 0) failures.push(`禁用钮没给拒因(资源归零档):${denyBad.join('; ')}`)
  console.log(`  ${denyBad.length === 0 ? '✓' : '✗'} 禁用钮有拒因(资源归零 · ${denyChecked} 页)`)
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
