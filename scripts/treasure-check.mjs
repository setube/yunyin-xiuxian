/**
 * 得宝仪典的浏览器实测。
 *
 * 单测只能证明「判定对」「组件源码里有这几句」;它证明不了的是:
 *   一 仪典真的画出来了 —— 层级、色,以及那三样事实在不在屏幕上;
 *   二 它不吃点击 —— 它是一次三秒的全屏浮层,若吃掉事件,它就是一层面罩;
 *   三 到点自己散,三秒后页面上不再有它;
 *   四 减少动效下形制仍在 —— 光环停在静态那一帧,不是整层消失。
 *
 * 用法(需先 `bun run build`):
 *   bun scripts/treasure-check.mjs
 *
 * 挂档方式:ui store 不持久化,直接写 localStorage 不划算,
 * 故从页面里取到 ui store 自己调 showTreasure —— 与游戏里唯一的调用口同一条路。
 */
import { chromium } from 'playwright'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const VIEWPORT = { width: 375, height: 812 }

const failures = []
const fail = msg => failures.push(msg)

const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--disable-dev-shm-usage']
})

/** 打开的每一个页面都要在结束时关掉 */
const pages = []
async function newPage(contextOpts = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, ...contextOpts })
  // 外域一律拦掉:index.html 里有 sdk.51.la,不拦会让 goto(load) 等它超时
  await context.route('**/*', route => {
    const url = route.request().url()
    if (/^(file|data|blob):/.test(url)) return route.continue()
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', e => fail(`运行时异常:${e.message}`))
  pages.push({ page, context })
  return page
}

/**
 * 从页面里调 ui store。生产构建没有挂 window,故走 Vue 的应用实例:
 * `#app` 上的 `__vue_app__` 是 Vue 在 mount 时挂的,globalProperties.$pinia 是那份 pinia。
 */
async function openStoreBridge(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    if (!pinia) return false
    const ui = pinia._s.get('ui')
    if (!ui) return false
    window.__yt = ui
    return true
  })
}

// ============ 一、开场话与主路径 ============

const page = await newPage()
await page.goto(INDEX, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app > *', { timeout: 30000 })

if (!(await openStoreBridge(page))) {
  fail('取不到 ui store —— 应用实例或 pinia 的挂载路径变了')
} else {
  // 先让应用初始化完(欢迎页在无档时出现,主路径不受影响)
  await page.waitForTimeout(500)

  await page.evaluate(() => {
    window.__yt.showTreasure({
      kind: 'equip',
      kindName: '装备',
      name: '太虚神铁剑',
      grade: '神品',
      icon: 'sword',
      tone: '#A85C3F',
      textTone: 'var(--color-quality-divine-text)',
      announce: '神品装备「太虚神铁剑」'
    })
  })
  await page.waitForSelector('.treasure-overlay', { timeout: 5000 }).catch(() => fail('仪典没有画出来(.treasure-overlay 不存在)'))
  // 入场的升起动画是 0.6s,正文在动画首帧 opacity 为 0 —— 量之前等它走完
  await page.waitForTimeout(800)

  const info = await page.evaluate(() => {
    const el = document.querySelector('.treasure-overlay')
    if (!el) return null
    const cs = getComputedStyle(el)
    const body = el.querySelector('.treasure-body')
    const rect = el.getBoundingClientRect()
    return {
      z: Number(cs.zIndex),
      pointerEvents: cs.pointerEvents,
      role: el.getAttribute('role'),
      live: el.getAttribute('aria-live'),
      width: rect.width,
      height: rect.height,
      grade: el.querySelector('.treasure-grade')?.textContent?.trim(),
      name: el.querySelector('.treasure-name')?.textContent?.trim(),
      kind: el.querySelector('.treasure-kind')?.textContent?.trim(),
      buttons: el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]').length,
      bodyVisible: !!body && getComputedStyle(body).opacity !== '0',
      // 色由 tint 现算:光晕层应有非透明的 background
      haloBg: getComputedStyle(el.querySelector('.treasure-halo')).backgroundImage.slice(0, 24)
    }
  })

  if (!info) fail('仪典元素读不到')
  else {
    if (!(info.z > 70)) fail(`仪典层级 ${info.z} 不高于 toast 的 70 —— 这一刻会被提示条压住`)
    if (info.pointerEvents !== 'none') fail(`整层 pointer-events 是 ${info.pointerEvents},它变成了一层面罩`)
    if (info.role !== 'status') fail('仪典没有 role=status —— 读屏念不到')
    if (info.live !== 'polite') fail('仪典没有 aria-live=polite')
    if (info.buttons !== 0) fail(`仪典里有 ${info.buttons} 个可点/可聚焦元素`)
    if (info.grade !== '神品') fail(`品阶那一行读作「${info.grade}」`)
    if (info.name !== '太虚神铁剑') fail(`名那一行读作「${info.name}」`)
    if (info.kind !== '装备') fail(`类名那一行读作「${info.kind}」`)
    if (!info.bodyVisible) fail('正文在开场时不可见')
    if (!info.haloBg || info.haloBg === 'none') fail('光晕层没有背景 —— tint 现算的色没落上去')
    // 375 宽下整层应铺满视口(它是全屏浮层,不是卡片)
    if (info.width < VIEWPORT.width - 1) fail(`整层宽 ${info.width},未铺满 ${VIEWPORT.width}`)
  }

  // 不吃点击:在仪典覆盖区域的中心点做命中测试,命中的不该是它自己
  const covered = await page.evaluate(() => {
    const el = document.querySelector('.treasure-overlay')
    const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    return { tag: hit?.tagName ?? '', inside: !!el && !!hit && el.contains(hit) }
  })
  if (covered.inside) fail(`仪典中心点命中的是它自己(${covered.tag})—— 它挡住了底下的点击`)

  // 到点自己散(停留时长 3 秒,给足余量)
  await page.waitForTimeout(3600)
  const gone = await page.locator('.treasure-overlay').count()
  if (gone !== 0) fail('三秒后仪典仍在 —— 它不会自己散')

  // 减少动效:形制仍在,光环停在静态那一帧
  await page.evaluate(() => {
    window.__yt.showTreasure({
      kind: 'pet',
      kindName: '灵兽',
      name: '白泽',
      grade: '神品',
      icon: 'paw',
      tone: '#A85C3F',
      textTone: 'var(--color-quality-divine-text)',
      announce: '神品灵兽「白泽」'
    })
  })
  await page.waitForSelector('.treasure-overlay', { timeout: 3000 }).catch(() => fail('第二次仪典没画出来'))
  const onceOpacity = await page.evaluate(
    () => getComputedStyle(document.querySelector('.treasure-halo')).opacity
  )
  // 用同一个页面切到「减少动效」:设置项走 body 上的 .reduce-motion 类(见 App.vue)
  await page.evaluate(() => document.body.classList.add('reduce-motion'))
  const reduced = await page.evaluate(() => {
    const halo = document.querySelector('.treasure-overlay .treasure-halo')
    if (!halo) return null
    const cs = getComputedStyle(halo)
    const rays = document.querySelector('.treasure-overlay .treasure-rays')
    return {
      animation: cs.animationName,
      opacity: Number(cs.opacity),
      display: cs.display,
      raysAnimation: rays ? getComputedStyle(rays).animationName : ''
    }
  })
  if (!reduced) fail('减少动效下仪典整层不见了')
  else {
    if (reduced.display === 'none') fail('减少动效把形制整层抹掉了')
    if (reduced.animation !== 'none') fail(`减少动效下光环仍在动(${reduced.animation})`)
    if (!(reduced.opacity > 0)) fail('减少动效下光环透明度为 0 —— 静态形制没站住')
    if (reduced.raysAnimation !== 'none') fail(`减少动效下射线仍转着(${reduced.raysAnimation})`)
  }
  void onceOpacity
  await page.evaluate(() => document.body.classList.remove('reduce-motion'))
}

for (const { page: p, context } of pages) {
  await p.close().catch(() => {})
  await context.close().catch(() => {})
}
await browser.close()

if (failures.length) {
  console.error('\n得宝仪典实测:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('得宝仪典实测通过:层级、三样事实、不吃点击、自己会散、减少动效下形制仍在')
