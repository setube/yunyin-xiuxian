/* eslint-disable no-console -- 自检报告 */
/**
 * 界面冒烟:逐页点按钮与站内导航链接,查运行时异常。
 * 导航入口是 RouterLink 渲染的 <a>,不在 getByRole('button') 里,单走一轮。
 *
 * 用法(需 playwright):
 *   bun run build
 *   bunx playwright install chromium
 *   bun scripts/ui-smoke.mjs             # 每页最多点 12 个按钮
 *   bun scripts/ui-smoke.mjs --depth 25  # 点更多
 *   bun scripts/ui-smoke.mjs --late      # 用后期夹具存档(神人境)覆盖终局界面
 *
 * --late 一轮约十分钟:终局按钮会真跑模拟(突破推演 / 远征预估 / 挑战书定价)。
 */
import { classifySmoke, namePattern, SMOKE_ALLOWLIST } from './smoke-classify.ts'
import { chromium } from 'playwright'
import { lateSlices, seedSave } from './lib/saveFixture.mjs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const depthArg = process.argv.indexOf('--depth')
const DEPTH = depthArg > 0 ? Number(process.argv[depthArg + 1]) || 12 : 12
const LATE = process.argv.includes('--late')

/** 全量路由 */
const ROUTES = [
  '/',
  '/cultivation',
  '/adventure',
  '/apprentice',
  '/market',
  '/inventory',
  '/character',
  '/codex',
  '/souls',
  '/titles',
  '/settings',
  '/build',
  '/collection',
  '/legacy',
  '/dongfu',
  '/world',
  '/celestial'
]
/** 正文里不该出现的数字/占位泄漏 */
const NUMERIC_LEAK = ['NaN', 'Infinity', 'undefined']
/** 进行中的页面/弹窗过渡 */
const FADING = '.page-fade-enter-active, .page-fade-leave-active, .modal-fade-enter-active, .modal-fade-leave-active'
/** 破坏性/离开型按钮:冒烟盘上不点 */
const SKIP = /分解|删除|清空|重置|兵解|转世|散尽|导出|导入|隐私|关于我们|出 秘 境|暂别|确认转移/

/**
 * 容器里 headless 易崩:
 * - --no-sandbox:无用户命名空间时 sandbox 起不来(报「Target closed」);
 * - --disable-dev-shm-usage:/dev/shm 常只有 64M,改落 /tmp。
 */
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--disable-dev-shm-usage']
})
const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
/**
 * 外域请求全拦,分两类记账:
 *   · sdk.51.la(index.html 唯一的第三方资源):拦掉防 goto(load) 被它拖到 30s 超时;
 *   · 其它外域:判失败。
 */
let knownAnalyticsBlocked = 0
const unknownExternal = []
await context.route('**/*', route => {
  const url = route.request().url()
  if (/^(file|data|blob):/.test(url)) return route.continue()
  if (url.startsWith('https://sdk.51.la/')) {
    knownAnalyticsBlocked += 1
    return route.abort()
  }
  unknownExternal.push(url)
  return route.abort()
})
if (LATE) {
  await seedSave(context, lateSlices())
}
const page = await context.newPage()
const errors = []
/** 点了没反应(指纹前后不变)但不判失败的读数 */
const silent = []
/** 死控件:干净重试仍无变化,判失败(exitCode 1) */
const dead = []
/**
 * 干净重试:回本路由单独点同一按钮,排除「前次交互已带入目标态」的误报。
 * 返回 true 有变化 / false 仍无变化 / null 干净态找不到该按钮。
 */
async function cleanRetry(route, label) {
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  const b = page.getByRole('button', { name: namePattern(label) }).first()
  if (!(await b.count())) return null
  if (!(await b.isVisible().catch(() => false))) return null
  const before = await fingerprint()
  await b.click({ timeout: 800 }).catch(() => {})
  await settle()
  return (await fingerprint()) !== before
}
/** 归桶与报告行由共享分类器 classifySmoke 给出,不在此另写 */
function pushSmokeDecision(dec) {
  if (dec.bucket === 'dead') dead.push(dec.line)
  else silent.push(dec.line)
}
async function classifySilent(route, kind, label) {
  const verb = kind === 'modal' ? '弹窗内点' : '点'
  const entry = `${route} ${verb}「${label}」`
  // 白名单项不做干净重试(分类器另核)
  const clean = SMOKE_ALLOWLIST.includes(entry) ? null : await cleanRetry(route, label)
  pushSmokeDecision(classifySmoke(route, kind, label, clean, SMOKE_ALLOWLIST))
}
/** 已成功导航的 href:全站只点一次;失败/被挡的不计入,留给后续路由重试 */
const navClicked = new Set()
/** 已报过「未达目标/被浮层挡住」读数的 href,同 href 只报一次 */
const navBlockedOnce = new Set()
async function fingerprint() {
  return page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 4000)
    // 须带上不改正文的变化:主题与战报速度切换只改 data-theme / aria-pressed
    // 全文哈希:变化可能只在正文中段(如流派页展开五维评级)
    const full = document.body.innerText.replace(/\s+/g, ' ')
    let hash = 0
    for (let i = 0; i < full.length; i += 1) hash = (hash * 31 + full.charCodeAt(i)) | 0
    const pressed = [...document.querySelectorAll('[aria-pressed=true]')]
      .map(b => (b.textContent || '').trim().slice(0, 6))
      .join(',')
    const theme = document.documentElement.getAttribute('data-theme') ?? ''
    return `${text.length}:${full.length}:${hash}|${theme}|${pressed}|${document.querySelectorAll('.modal-panel').length}|${document.querySelectorAll('[class*=toast]').length}`
  })
}
/** 正文 NaN / Infinity / undefined 泄漏点;本页与导航落地页共用 */
async function numericLeak() {
  return page.evaluate((patterns) => {
    const text = document.body.innerText
    return patterns.filter(p => text.includes(p)).map(p => {
      const i = text.indexOf(p)
      return `${p}@…${text.slice(Math.max(0, i - 24), i + 24).replace(/\n/g, '↵')}…`
    })
  }, NUMERIC_LEAK)
}
/** 点击后再量一次泄漏:弹窗/交互后才渲染的 NaN/Infinity 不抛异常,pageerror 逮不到 */
async function scanNumericLeaks(where) {
  for (const l of await numericLeak()) errors.push({ where, msg: l })
}
/** 链接中心点命中测试:'clear' 归链接自身(或子节点) · 'gone' 不在页上 · 其它为遮挡元素的类名片段 */
async function hitClear(href) {
  return page.evaluate((h) => {
    const a = document.querySelector(`a[href="${h}"]`)
    if (!a) return 'gone'
    const r = a.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (a === el || a.contains(el)) return 'clear'
    // SVG 的 .className 是 SVGAnimatedString,可读类名须用 getAttribute
    return (el?.getAttribute?.('class') || el?.tagName || '?').toString().slice(0, 40)
  }, href)
}
/**
 * 点击后等安定:页面与弹窗的过渡类消失且指纹连续两次一致,2s 封顶;不用固定超时。
 * 先等 260ms:chunk 导入前的空隙里仍是旧页指纹,会把真导航误读成「没反应」。
 */
async function settle() {
  await page.waitForTimeout(260)
  const deadline = Date.now() + 2000
  for (;;) {
    const busy = await page.evaluate(sel => document.querySelector(sel) !== null, FADING)
    const a = await fingerprint()
    await page.waitForTimeout(60)
    const b = await fingerprint()
    if (!busy && a === b) return
    if (Date.now() > deadline) return
  }
}
page.on('pageerror', e => errors.push({ where: 'boot', msg: String(e).slice(0, 300) }))

await page.goto(INDEX, { waitUntil: 'load' })
if (!LATE) {
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('冒烟自检')
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
}
await page.waitForTimeout(LATE ? 1800 : 1500)

let clicked = 0
/**
 * 只点最上层弹窗:每轮重取 z 最高的可见弹窗,走完再 Esc 回下层;按钮打一次性标记,重排/替换不重复点。
 * 固定取第一扇会点到被详情盖住的底层按钮,误报死按钮。
 */
async function clickInsideModal(route) {
  let steps = 0
  while (steps < 12) {
    const topIndex = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('.modal-panel')]
      let best = -1
      let bestZ = -Infinity
      panels.forEach((panel, index) => {
        const rect = panel.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        let z = 0
        for (let node = panel; node; node = node.parentElement) {
          const n = Number.parseInt(getComputedStyle(node).zIndex, 10)
          if (Number.isFinite(n)) z = Math.max(z, n)
        }
        if (z >= bestZ) {
          bestZ = z
          best = index
        }
      })
      return best
    })
    if (topIndex < 0) return

    const panel = page.locator('.modal-panel').nth(topIndex)
    const inner = await panel.getByRole('button').elementHandles()
    let target = null
    let label = ''
    for (const b of inner) {
      const done = await b.evaluate(el => el.dataset.smokeClicked === '1').catch(() => true)
      if (done) continue
      const text = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
      // 无名图标键与破坏性按钮不点,也标已处理
      if (!text || SKIP.test(text)) {
        await b.evaluate(el => (el.dataset.smokeClicked = '1')).catch(() => {})
        continue
      }
      if (!(await b.isVisible().catch(() => false)) || (await b.isDisabled().catch(() => false))) {
        await b.evaluate(el => (el.dataset.smokeClicked = '1')).catch(() => {})
        continue
      }
      // 被 toast 等更高浮层盖住的不点,不算坏
      const hit = await b.evaluate(el => {
        const r = el.getBoundingClientRect()
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !!at && (at === el || el.contains(at))
      }).catch(() => false)
      if (!hit) {
        await b.evaluate(el => (el.dataset.smokeClicked = '1')).catch(() => {})
        continue
      }
      target = b
      label = text
      break
    }

    if (!target) {
      // 本层走完:下面还有弹窗就 Esc 收掉顶层继续
      if ((await page.locator('.modal-panel').count()) > 1) {
        await page.keyboard.press('Escape').catch(() => {})
        await settle()
        continue
      }
      return
    }

    await target.evaluate(el => (el.dataset.smokeClicked = '1')).catch(() => {})
    const before = errors.length
    const beforeFp = await fingerprint()
    await target.click({ timeout: 800 }).catch(() => {})
    clicked += 1
    steps += 1
    await settle()
    if (errors.length > before) errors[errors.length - 1].where = `${route} 弹窗内点「${label}」`
    else if ((await fingerprint()) === beforeFp) await classifySilent(route, 'modal', label)
    await scanNumericLeaks(`${route} 弹窗内点「${label}」后泄漏`)
  }
}

for (const route of ROUTES) {
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  const leaked = await numericLeak()
  for (const l of leaked) errors.push({ where: `${route} 正文泄漏`, msg: l })
  // 用元素句柄不用 .all():nth 序号定位器在 toast/弹窗/跳页后指向空号,自动等待空耗 30s 超时
  const buttons = await page.getByRole('button').elementHandles()
  const startHash = await page.evaluate(() => location.hash)
  for (const b of buttons.slice(0, DEPTH)) {
    // 离页守卫:跳页后旧页按钮已无从点起
    if ((await page.evaluate(() => location.hash)) !== startHash) break
    const label = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!label || SKIP.test(label)) continue
    if (!(await b.isVisible().catch(() => false))) continue
    if (await b.isDisabled().catch(() => false)) continue
    const before = errors.length
    const beforeFp = await fingerprint()
    await b.click({ timeout: 800 }).catch(() => {})
    clicked += 1
    await settle()
    if (errors.length > before) errors[errors.length - 1].where = `${route} 点「${label}」`
    else if ((await fingerprint()) === beforeFp) await classifySilent(route, 'page', label)
    await scanNumericLeaks(`${route} 点「${label}」后泄漏`)
    await clickInsideModal(route)
    // 逐层收起弹窗(弹窗内点开的详情会叠第二层),免挡后续按钮;每层等淡出走完:离场中的弹窗会让下一按钮的前后指纹必然不同,死按钮漏判
    for (let layer = 0; layer < 4 && (await page.locator('.modal-panel').count()) > 0; layer += 1) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(80)
      await page.waitForFunction(sel => document.querySelector(sel) === null, FADING, { timeout: 1000 }).catch(() => {})
    }
  }

  // 站内导航链接(<a>)逐根真点,落地页同做泄漏体检
  const linkHrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#/"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => !!h)
  )
  for (const href of [...new Set(linkHrefs)]) {
    if (navClicked.has(href)) continue
    // 本页自己的页签不算导航
    if (href === '#' + route) continue
    // 每根链接前回到本路由:上一根可能已跳走
    await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
    await page.waitForTimeout(300)
    const link = page.locator(`a[href="${href}"]`).first()
    if (!(await link.isVisible().catch(() => false))) continue
    const before = errors.length
    // 先滚到视口中央:视口外的 elementFromPoint 为 null,会被误判成被挡
    await page.evaluate(h => document.querySelector(`a[href="${h}"]`)?.scrollIntoView({ block: 'center' }), href)
    await page.waitForTimeout(120)
    // 中心点归链接才 force 点:普通 click 在动画重页(洞府卡)上会等到超时,裸 force 会穿透浮层点错;被挡先 Esc 稍候
    let blocker = await hitClear(href)
    if (blocker !== 'clear') {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(600)
      blocker = await hitClear(href)
    }
    if (blocker === 'clear') {
      await link.click({ force: true, timeout: 800 }).catch(() => {})
    } else if (blocker === 'gone') {
      continue
    }
    await page.waitForTimeout(300)
    // 到没到达看 hash 落点,不看指纹
    const landedHash = await page.evaluate(() => location.hash)
    if (errors.length > before) {
      // 有 pageerror:以报错为准,标已覆盖不再重试
      errors[errors.length - 1].where = `${route} 导航「${href}」`
      navClicked.add(href)
    } else if (landedHash === href) {
      clicked += 1
      navClicked.add(href)
      const landedLeak = await numericLeak()
      for (const l of landedLeak) errors.push({ where: `${href} 落地页泄漏`, msg: l })
    } else if (!navBlockedOnce.has(href)) {
      // 未到达也无报错:只报一次读数,不标覆盖,留给别的路由重试
      navBlockedOnce.add(href)
      silent.push(`${route} 导航「${href}」${blocker === 'clear' ? '未到达目标(可能被重定向)' : '被浮层挡住(' + blocker + ')'}->仍在 ${landedHash || '(原页)'}`)
    }
  }
}

await browser.close()
console.log(`\n界面冒烟:${ROUTES.length} 页,点击 ${clicked} 次(导航 ${navClicked.size} 条边;按钮每页上限 ${DEPTH})`)
if (knownAnalyticsBlocked) {
  console.log(`  已拦下第三方统计脚本 ${knownAnalyticsBlocked} 次(唯一允许的外域,拦掉只为不随它超时)`)
}
if (unknownExternal.length) {
  const hosts = [...new Set(unknownExternal.map(u => u.replace(/^https?:\/\//, '').split('/')[0]))]
  console.log(`✗ 出现未登记的外域请求 ${unknownExternal.length} 次:${hosts.join(', ')}`)
  process.exitCode = 1
}
if (silent.length) {
  console.log(`点了没反应 ${silent.length} 处(读数,不判失败):`)
  for (const s of silent.slice(0, 20)) console.log(`  · ${s}`)
}
if (dead.length) {
  console.log(`✗ 死按钮/无效果控件 ${dead.length} 处(干净重试仍无变化):`)
  for (const d of dead) console.log(`  ✗ ${d}`)
  process.exitCode = 1
}
if (errors.length === 0) {
  console.log('✓ 无运行时异常')
} else {
  for (const e of errors) console.log(`✗ ${e.where}\n   ${e.msg.split('\n')[0]}`)
  process.exitCode = 1
}
