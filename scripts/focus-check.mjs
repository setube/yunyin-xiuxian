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
import { requireDist } from './lib/requireDist.mjs'

const PORT = 4211
const server = await preview({ preview: { port: PORT, strictPort: true } })
const BASE = `http://localhost:${PORT}/`
if (!requireDist('切页焦点自检')) process.exit(1)

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

  /*
   * 先数一遍底栏链接。
   *
   * 不先数就直接 click:nth-child(n) —— 底栏若塌了(改样式时藏了、TABS 空了),
   * Playwright 会等 30 秒再抛 TimeoutError,堆栈甩到顶层,报出的是
   * 「waiting for locator('nav a:nth-child(2)')」这种对维护者无信息量的话,
   * 而不是「底栏没有链接」。而且异常绕过 failures 收集,最后那段汇总根本不执行。
   * 实测把整个 nav 用 v-if 藏掉,这条检查就变成一团 Playwright 堆栈。
   */
  const railCount = await page.evaluate(() => document.querySelectorAll('nav a').length)
  const EXPECTED_RAIL = 5
  if (railCount !== EXPECTED_RAIL) {
    failures.push(`底栏应有 ${EXPECTED_RAIL} 个链接,实际 ${railCount} 个 —— 切页焦点无从验起`)
  } else {
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
  }

  /*
   * 弹窗焦点陷阱:正向与反向各 Tab 若干次,焦点都不许离开面板。
   *
   * 只测正向会漏 —— 打开时焦点落在**面板本身**(div,tabindex=-1),不是第一颗钮。
   * BaseModal 原先判的是 `active === first` / `active === last`,焦点在面板上时两个都不命中,
   * 于是浏览器把焦点交给面板外的上一个元素:实测反向 Tab 第一次就跳到导航栏的「人物」,
   * 而正向连按 20 次一次不逃。判据须两个方向都量。
   */
  {
    await page.goto(BASE + '#/inventory', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1600)
    // 关掉可能挡路的提示浮层
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    })
    await page.waitForTimeout(300)
    const opener = page.locator('main button[data-uid]').first()
    if ((await opener.count()) === 0) {
      failures.push('行囊里找不到可开的装备钮 —— 弹窗焦点陷阱无从验起')
    } else {
      await opener.click()
      await page.waitForTimeout(800)
      const inPanel = () => page.evaluate(() => !!document.activeElement?.closest('.modal-panel'))
      if (!(await page.evaluate(() => !!document.querySelector('.modal-panel')))) {
        failures.push('点装备后弹窗没打开 —— 焦点陷阱无从验起')
      } else {
        for (const [label, key] of [['Shift+Tab', 'Shift+Tab'], ['Tab', 'Tab']]) {
          const escaped = []
          for (let i = 0; i < 16; i += 1) {
            await page.keyboard.press(key)
            if (!(await inPanel())) escaped.push(i + 1)
          }
          const ok = escaped.length === 0
          console.log(`  ${ok ? '✓' : '✗'} 弹窗 ${label} 16 次 焦点${ok ? '未离开面板' : `逃出 ${escaped.length} 次(第 ${escaped.join(',')} 次)`}`)
          if (!ok) failures.push(`弹窗内 ${label} 会把焦点放回页面(第 ${escaped.join(',')} 次)`)
        }
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        const back = await page.evaluate(() => ({ inMain: !!document.activeElement?.closest('main') }))
        if (!back.inMain) failures.push('Escape 关窗后焦点没回到页面内容区')
      }
    }
  }

  /*
   * 键盘可达性:main 里所有「能点」的元素,要么能 Tab 到,要么是**规矩的 roving tabindex**。
   *
   * 为什么单独量:切页焦点与弹窗焦点陷阱都只管「焦点在哪」,不管「能不能到」。
   * 此前 17 个可点元素扫出来 Tab 不到,查下来全是 `role="tab"` 的 roving 模式
   * (整个 tablist 只留一个 tabindex=0,靠左右键走)—— 那是 WAI-ARIA 的正确做法,不是缺陷。
   * 所以判据不能只数 tabindex<0,要**排除规矩的 roving**,否则报的全是假阳性。
   *
   * 规矩的 roving 判据:元素在 role=tablist 里、自己是 role=tab、
   * 且同一父级里另有一个 tabindex=0 的兄弟(说明整组确实留了入口)。
   * 缺任一条都算「Tab 到不了」。
   */
  {
    const ROUTES = [
      '/', '/cultivation', '/adventure', '/inventory', '/character', '/codex', '/souls', '/titles',
      '/settings', '/build', '/collection', '/legacy', '/dongfu', '/world', '/celestial', '/market', '/apprentice'
    ]
    const unreachable = []
    for (const route of ROUTES) {
      await page.evaluate(r => {
        location.hash = '#' + r
      }, route)
      await page.waitForTimeout(500)
      const found = await page.evaluate(() => {
        const main = document.querySelector('main')
        if (!main) return []
        const out = []
        /*
         * 三类 + 表单控件。
         *
         * 原先只有 `button, a[href], [role=button]` —— 设置页那四个 checkbox
         * 不在其中,而它们是真能 Tab 到、也能用空格切的控件。
         * 判据扫不到它们,就等于「能不能到」这个问题在那四个控件上从未被问过。
         * (当前它们都正常,补的是覆盖面,不是修缺陷。)
         */
        for (const el of main.querySelectorAll(
          'button, a[href], [role=button], input:not([type=hidden]), select, textarea'
        )) {
          if (el.tabIndex >= 0 || el.disabled || el.offsetParent === null) continue
          const inTablist = !!el.closest('[role=tablist]') && el.getAttribute('role') === 'tab'
          const group = el.parentElement
          const hasRoving = group && group.querySelector(':scope > [tabindex="0"]')
          if (inTablist && hasRoving) continue
          out.push((el.textContent || '').trim().slice(0, 20) || el.tagName)
        }
        return out
      })
      for (const f of found) unreachable.push(`${route} 「${f}」`)
    }
    const ok = unreachable.length === 0
    console.log(`  ${ok ? '✓' : '✗'} ${ROUTES.length} 页可点元素都能 Tab 到(${ok ? '含规矩的 roving tabindex' : `${unreachable.length} 处到不了`})`)
    if (!ok) failures.push(`这些可点元素 Tab 到不了:${unreachable.slice(0, 5).join(' | ')}`)
  }

  /*
   * 首启的两页:**必须是没存档的上下文**。
   *
   * 上面那 17 页都铺了 lateSlices,而路由守卫 `if (game.started) return { name: 'home' }`
   * 会把带存档的访问弹回首页 —— 所以 /welcome 与 /create 从来不在那份清单里,
   * 它们的可点元素(同意勾选、随机道号、逆天改命、踏入仙途)也从未验过能不能 Tab 到。
   * `edge-states` 能进这两页,但它只验「状态解释得清」与触控尺寸,不验键盘。
   *
   * 建号页用「点开始 → 勾同意 → 同意并开始 → 等传送动画」走进去,
   * 传送动画 2500ms(`confirmStart` 的 enterTimer),等 3.5s 留余量。
   */
  {
    const freshCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await freshCtx.route('**/*', r => (/^https?:\/\/localhost:/.test(r.request().url()) ? r.continue() : r.abort()))
    const freshPage = await freshCtx.newPage()
    await freshPage.goto(BASE + '#/welcome', { waitUntil: 'domcontentloaded' })
    await freshPage.waitForTimeout(2200)

    /** 同上一条判据,抽成小函数以便两页复用 */
    const unreachableOn = async () =>
      freshPage.evaluate(() => {
        const main = document.querySelector('main')
        if (!main) return ['<main> 不存在']
        const out = []
        /*
         * 三类 + 表单控件。
         *
         * 原先只有 `button, a[href], [role=button]` —— 设置页那四个 checkbox
         * 不在其中,而它们是真能 Tab 到、也能用空格切的控件。
         * 判据扫不到它们,就等于「能不能到」这个问题在那四个控件上从未被问过。
         * (当前它们都正常,补的是覆盖面,不是修缺陷。)
         */
        for (const el of main.querySelectorAll(
          'button, a[href], [role=button], input:not([type=hidden]), select, textarea'
        )) {
          if (el.tabIndex >= 0 || el.disabled || el.offsetParent === null) continue
          const inTablist = !!el.closest('[role=tablist]') && el.getAttribute('role') === 'tab'
          const group = el.parentElement
          const hasRoving = group && group.querySelector(':scope > [tabindex="0"]')
          if (inTablist && hasRoving) continue
          out.push((el.textContent || '').trim().slice(0, 20) || el.tagName)
        }
        return out
      })

    const welcomeBad = await unreachableOn()
    if (welcomeBad.length) failures.push(`/welcome 这些可点元素 Tab 到不了:${welcomeBad.slice(0, 5).join(' | ')}`)
    console.log(`  ${welcomeBad.length === 0 ? '✓' : '✗'} /welcome 可点元素都能 Tab 到`)

    // 键盘走完首启:点开始(鼠标) → 空格勾同意 → 键盘触发「同意并开始」
    await freshPage.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /开\s*始\s*游\s*戏/.test(x.textContent || ''))
      b?.click()
    })
    await freshPage.waitForTimeout(1200)
    await freshPage.keyboard.press('Tab')
    const firstStop = await freshPage.evaluate(() => document.activeElement?.getAttribute('type') ?? '')
    if (firstStop !== 'checkbox') failures.push(`/welcome 第一个 Tab 落点不是同意勾选(是 ${firstStop || '空'})`)
    await freshPage.keyboard.press('Space')
    const agreed = await freshPage.evaluate(() => {
      const c = document.querySelector('input[type=checkbox]')
      return c?.checked === true
    })
    if (!agreed) failures.push('/welcome 用空格勾不上同意 —— 键盘用户走不到建号页')
    console.log(`  ${firstStop === 'checkbox' && agreed ? '✓' : '✗'} /welcome 首落点是同意勾选,空格能勾上`)
    await freshPage.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /同意并开始/.test(x.textContent || ''))
      b?.click()
    })
    await freshPage.waitForTimeout(3500)
    const landed = await freshPage.evaluate(() => location.hash)
    if (landed !== '#/create') {
      failures.push(`首启没走到建号页(停在 ${landed})—— 传送动画 2500ms,等短了会误判`)
    } else {
      const createBad = await unreachableOn()
      if (createBad.length) failures.push(`/create 这些可点元素 Tab 到不了:${createBad.slice(0, 5).join(' | ')}`)
      console.log(`  ${createBad.length === 0 ? '✓' : '✗'} /create 可点元素都能 Tab 到`)
    }
    await freshCtx.close()
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
