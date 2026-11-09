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
  /*
   * 全站 18 条路由都要有标题。
   *
   * 原先只列 8 条,codex / world / celestial / souls / collection / build /
   * apprentice / titles / legacy 这 9 页的读屏属性从未被验过 —— 而它们拿同一份
   * lateSlices 夹具都进得去、也都画得出标题,没有理由漏在外面。
   * 「一条路由没被列进来」和「查过且没问题」在输出上长得一模一样,这是最危险的那种缺口。
   */
  const ROUTES = [
    '/', '/cultivation', '/codex', '/adventure', '/world', '/inventory', '/character',
    '/celestial', '/souls', '/dongfu', '/collection', '/build', '/market', '/apprentice',
    '/titles', '/legacy', '/settings'
    /*
     * 不含 /welcome 与 /create:本脚本铺 lateSlices(已有存档),路由守卫
     * `if (game.started) { if (to.name === 'welcome' || to.name === 'create') return { name: 'home' } }`
     * 会把它们弹回首页 —— 那样量到的「标题 1 个」其实是首页的,是假绿。
     * 这两页由 edge-check 的无存档场景覆盖。
     */
  ]
  for (const r of ROUTES) {
    if (!(await gotoRoute(page, r))) {
      failures.push(`${r} 导航没落到目标页(hash 或过渡超时),本页标题判据未生效`)
      console.log(`  ✗ ${r.padEnd(14)} 导航未落地`)
      continue
    }
    /*
     * 等标题出现,而不是量一次就走。
     *
     * /world 的界域是挂载后才异步凝出来的,标题包在 `v-if="view"` 里 ——
     * 偶尔会超过 600ms,于是那一次量到 0 个标题,报成「没有标题元素」。
     * 实测三次跑里冒过一次。这类「加载中的瞬间」不是缺陷,但用固定等待去量它,
     * 结果就变成看运气;反过来若真把标题删了,这里也仍会超时,一样报得出来。
     */
    const n = await page
      .waitForFunction(() => document.querySelectorAll('h1,h2,h3').length > 0, null, { timeout: 3000 })
      .then(() => page.evaluate(() => document.querySelectorAll('h1,h2,h3').length))
      .catch(() => page.evaluate(() => document.querySelectorAll('h1,h2,h3').length))
    if (n === 0) failures.push(`${r} 没有任何标题元素(h1/h2/h3),读屏用户无法按标题定位`)
    console.log(`  ${n > 0 ? '✓' : '✗'} ${r.padEnd(14)} 标题 ${n} 个`)
  }

  // 5) 触控目标不小于 28px:能点的盒子要够手指按
  //    复选框之类被 <label> 包住时,可点区域是 label 整体,量它而不是 input 本体
  /*
   * 触控下限同覆盖 17 条路由。原先只列 6 条,codex / world / celestial / souls /
   * collection / build / apprentice / titles / legacy 九页的点按面积从未量过。
   * (layout-check 另有 190 个页面×视口的全量扫描,那条线更宽;此处是读屏脚本里的快速档。)
   */
  const TOUCH_ROUTES = ROUTES
  for (const r of TOUCH_ROUTES) {
    if (!(await gotoRoute(page, r))) {
      failures.push(`${r} 导航没落到目标页(hash 或过渡超时),本页触控判据未生效`)
      console.log(`  ✗ ${r.padEnd(14)} 导航未落地`)
      continue
    }
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
  /*
   * 不含 /create:本脚本铺有存档,路由守卫会把它弹回首页 ——
   * 那一行「无可见输入框(判据在此页未覆盖)」其实是首页的结果,不是建号页的。
   * 建号页的输入框由 edge-check 的无存档场景覆盖(它真的进得去)。
   *
   * /cultivation 的悟道兑换次数框要 major 够高且「兑得起 >1 次」才渲染,
   * /market 的购买数量框要选中某件才出 —— 本夹具下两页都量不到,留着做将来的兜底。
   */
  const FORM_ROUTES = ['/', '/cultivation', '/build', '/celestial', '/market', '/settings']
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
  // 灵草走 herbByGrade 分账(herb 是 computed,写进去不生效);归零即五档全 0
  zero.resources = { spiritStone: { m: 0, e: 0 }, qi: 0, wudao: 0, herbByGrade: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, ore: 0, page: 0, dust: 0 }
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
        /*
         * 「圆满」也是状态词,与「已满」「上限」同一类:洞府的「已圆满」、灵脉的「主脉圆满」
         * 都在说「已到头,没得再升」。词表原先只认「已满」,于是「已圆满」被判成没给拒因 ——
         * 这是判据的词表缺口,不是界面缺陷。
         */
        if (/圆满|尚差|不足|未至|未满|已满|上限|在途|不可|无处|暂无|无可|闭关中|身在/.test(t)) continue
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
/**
 * 跳到某条路由并**确认真的落到了那里**。
 *
 * 原先 `location.hash = ...` 之后固定等 600ms 就开量 —— 懒加载视图慢、导航被守卫弹走、
 * 或过渡还没走完时,量到的是上一页(常常是首页),而结果看起来完全正常:
 * 首页有标题、首页的控件也够大。它把「没量过」写成了「查过了」。
 * 这里等到 hash 对上、并且 FADING 过渡类消失,才认为落地;落不了直接算失败。
 */
async function gotoRoute(page, r) {
  await page.evaluate(h => { location.hash = '#' + h }, r)
  try {
    await page.waitForFunction(h => location.hash === '#' + h, r, { timeout: 3000 })
    // 视图是懒加载的:hash 变了之后还要等 chunk 到位、过渡走完
    await page.waitForTimeout(250)
    await page.waitForFunction(
      () => document.querySelector('.page-fade-enter-active, .page-fade-leave-active') === null,
      null,
      { timeout: 3000 }
    )
  } catch {
    return false
  }
  return (await page.evaluate(h => location.hash === '#' + h, r)) === true
}


