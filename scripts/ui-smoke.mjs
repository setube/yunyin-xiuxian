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
import { classifySmoke, isSelectedTabState, namePattern, SMOKE_ALLOWLIST } from './smoke-classify.ts'
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
const NUMERIC_LEAK = [
  /\bNaN\b/g,
  /\bInfinity\b/g,
  /\bundefined\b/g,
  /\bInvalid Date\b/g,
  /\[object Object\]/g,
  /* 指数符号可选:裸插值 `1.7976931348623157e+308` 带 +,formatGN 兜底 `1.80e308` 不带 —— 只写 e\+ 会漏掉后者 */
  /[0-9]e\+?[0-9]{2,}/g
]
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
 *
 * 判「有反应」不能只看页面指纹:拒因型按钮(闭关中/远征在途时的「出发」等)点下去
 * 只弹一条 toast、页面别处不动,而 toast 的 TTL(2600ms)比 settle 的封顶(2s)还长,
 * 指纹若采在 toast 入队之前就会把有回执的拒绝当成死按钮。故额外轮询 toast 数量。
 * 新增判据时请照这条:页面指纹只是「有没有变化」的一个信号,不是唯一信号。
 */
async function cleanRetry(route, label) {
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  /*
   * 定位按钮时**也要认 role="tab"**。
   *
   * 原先只 `getByRole('button', …)`,而页签在 DOM 上是 `<button role="tab">` ——
   * `getByRole('button')` 按 ARIA 角色匹配,认不到它们。于是「界域」「名号」「成就」
   * 这三个页签每次都被判成「干净态无法单独复现」,读数照打、一条也不判失败,
   * 而它们其实从未被单独验证过 —— 那三条读数是假的。
   *
   * 这里改用「按名找所有 button,再按文本筛」,与 ARIA 角色无关:
   * 页签、普通钮、图标钮一视同仁。
   */
  /*
   * 正则要去掉首尾锚点。
   *
   * `namePattern` 返回的是 `^界域$` 这种**整串锚定**的式子 —— 那是给
   * `getByRole({ name })` 用的(它按可访问名整串匹配)。而 `hasText` 是
   * **子串**语义:内部拿元素的规范化文本去 `RegExp.test`,按钮文本常带空格
   * 或内嵌图标,`^…$` 于是恒不匹配(实测 `^界\s*域$` 对「界域」页签 count 为 0,
   * 去掉锚点后为 1)。
   *
   * 故这里只取 namePattern 的骨架(数字段松开、字间空格容错),锚点交给外围。
   */
  /*
   * 用 `namePattern` 的**整串**式子,但去掉 `^`/`$` 之后交给一个自定义筛选:
   * `hasText` 是子串语义,会命中「…界域名号…」这种更长的按钮;
   * `label` 本身取自按钮的 innerText,是完整正文,故要求整串吻合才对得上号。
   *
   * 做法:`matches` 先按名称骨架粗筛(快),再逐个比对 innerText 是否整串吻合
   * (准)。数字段与字间空格仍按 `namePattern` 的规则容错。
   */
  const whole = namePattern(label)
  const re = new RegExp(whole.source.replace(/^\^|\$$/g, ''))
  /*
   * **先筛出可见项,再取第一个** —— 顺序不能反。
   *
   * 原先直接 `.filter({ hasText: re }).first()`:页面上常有同名但隐藏的按钮
   * (折叠区、未激活的分页、aria-hidden 的装饰层),`.first()` 可能拿到隐藏那个,
   * 于是要么在 `isVisible()` 处判成「无法复现」、要么更糟 ——
   * 拿到一个隐藏的**已选中期签**,被当成幂等报出去,而真正该点的那个可见控件
   * 一次都没验过(评审指出)。
   *
   * 可见性判据与后面那句 `isVisible()` 同源,不另立一套。
   */
  const matches = page.locator('button').filter({ hasText: re })
  const total = await matches.count()
  if (!total) return null
  let b = null
  for (let i = 0; i < total; i += 1) {
    const cand = matches.nth(i)
    /*
     * 两个条件都要:可见、且正文**整串**吻合。
     *
     * 只按子串筛会命中更长的按钮(「界域」也会命中「界域名号」那类),
     * `.first()` 于是可能点到另一个控件,把结论记到请求的那个标签名下 ——
     * 报表看起来一切正常,而请求的那个控件其实没被点过。
     */
    const text = ((await cand.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!whole.test(text)) continue
    if (!(await cand.isVisible().catch(() => false))) continue
    b = cand
    break
  }
  // 一个可见的都没有 —— 判不了,不判失败
  if (!b) return null
  /*
   * 点的是当前已选中的页签 —— 幂等,不判失败。
   *
   * 页签点自己不会有任何变化(它本来就是选中态)。原先这类只能进白名单,
   * 而白名单是按「路径 + 标签」写死的:`/codex` 的「界域」与 `/collection` 的
   * 「成就」都是各自页面的默认页签、一次都没进白名单,于是每次都被判死按钮。
   * 按 aria-selected 认状态,路径一改也不会漏。
   */
  const tabState = await b
    .evaluate(el => ({ role: el.getAttribute('role'), selected: el.getAttribute('aria-selected') }))
    .catch(() => null)
  // 判据本身在 smoke-classify.ts 里(可单测);这里只把两个属性取出来传进去
  if (tabState && isSelectedTabState(tabState.role, tabState.selected)) return 'selected-tab'
  const before = await fingerprint()
  /**
   * 拒因型按钮(如「出发」在闭关中/远征在途时)点下去只会弹一条 toast、页面别处不动。
   * toast 的 TTL 是 2600ms,而 settle() 2s 封顶 —— 指纹在 toast 还在时能看出变化,
   * 但若指纹恰好采在 toast 入队之前,就会把「有回执的拒绝」误判成死按钮。
   * 故点完立刻轮询一次 toast 数量,出现过就当有反应。
   */
  /*
   * 点不中就返回 null(判不了),不要往下比指纹 ——
   * 没点到的按钮指纹当然不变,那会被当成「真死控件」。
   */
  const ok = await b
    .click({ timeout: 800 })
    .then(() => true)
    .catch(() => false)
  if (!ok) return null
  let sawToast = false
  for (let i = 0; i < 12 && !sawToast; i += 1) {
    sawToast = await page.evaluate(() => document.querySelectorAll('[class*=toast]').length > 0)
    if (!sawToast) await page.waitForTimeout(60)
  }
  await settle()
  if (sawToast) return true
  return (await fingerprint()) !== before
}
/**
 * 弹窗内控件的干净重试:重新导航 → 重放「点开那扇窗」那一步 → 在窗内找目标按钮。
 *
 * 原先弹窗内控件直接记成「干净态无法单独复现」——那是**没法重试**被写成了
 * **重试失败**。其实重放是可行的:打开这扇窗的入口就是主循环刚点过的那颗按钮,
 * 它的正文(labels 里那串)已经拿到了。把 opener 传下来即可。
 *
 * 仍需返回 `'modal-unreachable'` 的情形:
 *   · 没有 opener(入口未知,比如弹窗是引擎自己弹的)
 *   · 重放时那个入口按钮找不到了(前面点的按钮改过页面状态)
 *   · 重放后没有弹窗出现
 * 这三种是**真的没法重试**,如实标注,不冒充「找不到目标按钮」。
 *
 * @returns true 窗内点它有变化 / false 窗内点它也无变化 / 'modal-unreachable' 重放不成
 */
async function modalRetry(route, opener, label) {
  if (!opener) return 'modal-unreachable'
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  await page
    .waitForFunction(() => !!document.querySelector('main h1, main h2'), null, { timeout: 4000 })
    .catch(() => {})
  await page.waitForTimeout(600)
  const entryRe = new RegExp(namePattern(opener).source.replace(/^\^|\$$/g, ''))
  const entries = page.locator('main button').filter({ hasText: entryRe })
  let opened = false
  for (let i = 0; i < (await entries.count()); i += 1) {
    const cand = entries.nth(i)
    const text = ((await cand.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!namePattern(opener).test(text)) continue
    if (!(await cand.isVisible().catch(() => false))) continue
    const ok = await cand
      .click({ timeout: 800 })
      .then(() => true)
      .catch(() => false)
    if (!ok) continue
    // 等面板真的挂上(与 modal-patrol 同一口径:不靠固定睡眠)
    opened = await page
      .waitForFunction(() => !!document.querySelector('.modal-panel'), null, { timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    if (opened) break
  }
  if (!opened) return 'modal-unreachable'

  // 窗内找目标按钮:同样要求整串吻合 + 可见
  const whole = namePattern(label)
  const re = new RegExp(whole.source.replace(/^\^|\$$/g, ''))
  const matches = page.locator('.modal-panel button').filter({ hasText: re })
  const total = await matches.count()
  let b = null
  for (let i = 0; i < total; i += 1) {
    const cand = matches.nth(i)
    const text = ((await cand.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!whole.test(text)) continue
    if (!(await cand.isVisible().catch(() => false))) continue
    b = cand
    break
  }
  // 重放成了、窗内却没有这个按钮 —— 那是真问题,交给分类器判(返回 false → dead)
  if (!b) return false
  // 窗内的页签同理:点已选中的那个本无变化
  const tabState = await b
    .evaluate(el => ({ role: el.getAttribute('role'), selected: el.getAttribute('aria-selected') }))
    .catch(() => null)
  if (tabState && isSelectedTabState(tabState.role, tabState.selected)) return 'selected-tab'
  if (await b.isDisabled().catch(() => false)) return false
  /*
   * 重放时页面可能已处在「点了也没用」的状态 —— 那不是死按钮。
   *
   * 实测:主循环点「深入探寻」真的出发了,存档里 `adventure.session` 从此为真;
   * `modalRetry` 重放那一步时 `startExploration` 走「历练在途」分支(return false,
   * 带 toast 拒因),弹窗不关、界面不变 —— 六档历练模式全被记成死按钮。
   * 那不是缺陷:按钮在**可出发的状态下**是好的,重放时状态已经变了。
   * 先把这三个互斥状态读出来,处在其中就如实归因为 `'state-dependent'`。
   */
  const busy = await page
    .evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const pinia = app?.config?.globalProperties?._p ? app.config.globalProperties._p : app?.config?.globalProperties?.$pinia
      const get = n => pinia?._s?.get(n)
      const adv = get('adventure')
      const cult = get('cultivation')
      const player = get('player')
      return {
        session: !!adv?.session,
        // 闭关不是一个布尔字段,而是 buffs 里那条 'retreat'(见 earlyGameService.isRetreating)
        retreat: (cult?.buffs ?? []).some(b => b?.defId === 'retreat' && (b?.endsAt ?? 0) > Date.now()),
        secretRealm: !!player?.secretRealm
      }
    })
    .catch(() => null)
  if (busy && (busy.session || busy.retreat || busy.secretRealm)) return 'state-dependent'
  const before = await fingerprint()
  const ok = await b
    .click({ timeout: 800 })
    .then(() => true)
    .catch(() => false)
  if (!ok) return false
  let sawToast = false
  for (let i = 0; i < 12 && !sawToast; i += 1) {
    sawToast = await page.evaluate(() => document.querySelectorAll('[class*=toast]').length > 0)
    if (!sawToast) await page.waitForTimeout(60)
  }
  await settle()
  if (sawToast) return true
  return (await fingerprint()) !== before
}

/** 归桶与报告行由共享分类器 classifySmoke 给出,不在此另写 */
function pushSmokeDecision(dec) {
  if (dec.bucket === 'dead') dead.push(dec.line)
  else silent.push(dec.line)
}
async function classifySilent(route, kind, label, opener) {
  const verb = kind === 'modal' ? '弹窗内点' : '点'
  const entry = `${route} ${verb}「${label}」`
  // 白名单项不做干净重试(分类器另核)
  /*
   * 弹窗内控件走**自己的**重试:`modalRetry` 会重放「点开那扇窗」那一步。
   *
   * 页面级的 `cleanRetry` 只做「导航到路由 → 找按钮 → 点 → 比指纹」,
   * 而弹窗内控件要先点开某一扇触发的窗 —— 那条路永远找不到它,
   * 于是每个弹窗内控件都被记成「干净态无法单独复现」:
   * 看起来像「试过了但复现不了」,实际是**根本没试**。
   *
   * 重放需要知道是哪扇窗、点哪个入口 —— 那份信息由主循环传进来(`opener`)。
   * 拿不到 opener(如引擎自己弹的窗)、或重放时入口已不可点,才如实退回
   * `'modal-unreachable'`;那才是真的没法重试。
   */
  const clean = SMOKE_ALLOWLIST.includes(entry)
    ? null
    : kind === 'modal'
      ? await modalRetry(route, opener, label)
      : await cleanRetry(route, label)
  pushSmokeDecision(
    classifySmoke(route, kind, label, kind === 'modal' && clean === null ? 'modal-unreachable' : clean, SMOKE_ALLOWLIST)
  )
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
/** 正文坏值泄漏点;本页与导航落地页共用 */
async function numericLeak() {
  return page.evaluate((patterns) => {
    const text = document.body.innerText
    const out = []
    for (const src of patterns) {
      // 每次重建:带 g 的正则在多个字符串上复用会因 lastIndex 残留而漏匹配
      const hits = text.match(new RegExp(src.source, 'g')) ?? []
      // 同类只报第一处,免得一屏坏值把输出刷满
      if (hits.length) {
        const i = text.indexOf(hits[0])
        out.push(`${hits[0]}@…${text.slice(Math.max(0, i - 24), i + 24).replace(/\n/g, '↵')}…`)
      }
    }
    return out
  }, NUMERIC_LEAK.map(r => ({ source: r.source })))
}
/** 点击后再量一次泄漏:弹窗/交互后才渲染的坏值不抛异常,pageerror 逮不到 */
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

/*
 * 整段包 try/catch/finally —— 与其余实测脚本同一理由。
 *
 * 这份的汇总全部写在 `browser.close()` 之后(点击统计、死按钮清单、运行时异常、
 * 点击量下限):任何一处 evaluate 超时都会让异常冒到顶层,那四类读数一条也出不来。
 * 崩溃本身记进 errors,与其余失败并列报出。
 */
/*
 * 计数放在 try 之前:汇总打印在块外,块内声明的 `let` 在块外看不见
 * (实测包进 try 后立刻 `ReferenceError: clicked is not defined`)。
 */
let clicked = 0
/**
 * 每页各自点到了几次 —— 只打印进摘要,不设下限。
 *
 * 不设下限是有原因的:这条脚本会真的点各种按钮,前序页面的点击会改变后续页的状态。
 * 实测 /souls 与 /celestial 跑到时已经显示「需真仙境」的锁定形态(main 里只剩 13 个字、
 * 一个按钮都没有)——那是**脚本自己改出来的状态**,不是页面缺陷,给它们设下限只会误报。
 * 留着这份读数是为了排查:某页长期 0 次时,人一眼能看出冒烟在那里是空跑的。
 */
const clickedPerRoute = new Map()
try {
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

/**
 * 夹具自检:写进去的东西必须真的出现在界面上。
 *
 * 夹具是**所有检查的基准**,而基准本身没人验。实测踩过一次:
 * `inventory.items` 里写了个不存在的模板 id,`equipped` 里写了个不在 `EquipSlot` 表的键,
 * 界面于是显示「?」占位、头冠那格永远「未装备」—— 而五个脚本一个都没报,
 * 它们只核对「相对起点有没有变化」,起点本身错着也照样绿。
 *
 * 这里只验**能一眼看见**的几项。故意不写成「全量比对」:夹具改了要跟着改,
 * 写得太细会变成第二个假基准。
 */
if (LATE) {
  const expectSeen = [
    ['灵石余额', '9.038兆'],
    ['器灵尘', '器灵尘 500'],
    ['已装备的武器', '雾隐长枪'],
    ['已装备的头冠', '桃木簪'],
    ['轮回世数', '2 世'],
  ]
  /*
   * 两页各自**等到该出现的那几项真的出现**,不固定睡 1200ms。
   *
   * 原先固定等:实测 `--late` 连跑两次,一次「雾隐长枪没出现」、一次全过 ——
   * 而单独打开行囊页时三样都在(1200ms 就够)。差别只在于这条脚本此前已经跑过
   * 一段建号/夹具流程,页面忙闲不同。固定睡眠量「加载中的一瞬」,结果就是看运气:
   * 它会报一个并不存在的夹具缺陷,而真正的夹具坏了时又可能被同样的运气掩盖。
   */
  const waitForAny = async (needles, timeout = 8000) => {
    try {
      await page.waitForFunction(
        ns => ns.some(n => (document.body?.innerText || '').includes(n)),
        needles,
        { timeout }
      )
    } catch {
      // 等不到就照实报,由下面的逐项判据点出缺了哪几样
    }
  }
  await page.goto(INDEX + '#' + '/', { waitUntil: 'load' })
  await waitForAny(['9.038兆', '2 世'])
  const homeText = await page.evaluate(() => document.body.innerText)
  await page.goto(INDEX + '#' + '/inventory', { waitUntil: 'load' })
  await waitForAny(['雾隐长枪', '桃木簪', '器灵尘 500'])
  const invText = await page.evaluate(() => document.body.innerText)
  const all = homeText + '\n' + invText
  for (const [what, needle] of expectSeen) {
    if (!all.includes(needle)) errors.push({ where: 'fixture', msg: `夹具写的${what}没有出现在界面上(找「${needle}」)` })
  }
}

/**
 * 只点最上层弹窗:每轮重取 z 最高的可见弹窗,走完再 Esc 回下层;按钮打一次性标记,重排/替换不重复点。
 * 固定取第一扇会点到被详情盖住的底层按钮,误报死按钮。
 */
async function clickInsideModal(route, opener) {
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
    /*
     * 与主循环同一条口径:点不中就不计数、也不判「点了没反应」。
     *
     * 这里原先也是 `.catch(() => {})` 之后无条件 `clicked += 1` ——
     * 主循环修了、这一处没修,超时仍会被当成「有反应」(计数加了、指纹没变再判死按钮)。
     */
    const modalClickOk = await target
      .click({ timeout: 800 })
      .then(() => true)
      .catch(() => false)
    if (!modalClickOk) continue
    clicked += 1
    steps += 1
    await settle()
    if (errors.length > before) errors[errors.length - 1].where = `${route} 弹窗内点「${label}」`
    else if ((await fingerprint()) === beforeFp) await classifySilent(route, 'modal', label, opener)
    await scanNumericLeaks(`${route} 弹窗内点「${label}」后泄漏`)
  }
}

for (const route of ROUTES) {
  const beforeRouteClicks = clicked
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  /*
   * 等这一页**真的挂上**,不是固定等 600ms。
   *
   * `file://` + hash 变化时 `page.goto` 不会重载文档,`waitUntil: 'load'` 立刻返回 ——
   * 而路由视图是 `() => import(...)` 懒加载的,那一刻 `main` 里还什么都没有。
   * 固定 600ms 在多数页够用,但前面十几页点过之后页面状态不同,
   * 实测 /souls 与 /celestial 两页取到 **0 个句柄**:整页冒烟直接空跑。
   *
   * 判据:等 h1/h2 出现(每页都有标题,见 aria-check 的同一口径),再留一小段给交互挂载。
   */
  await page
    .waitForFunction(() => !!document.querySelector('main h1, main h2'), null, { timeout: 4000 })
    .catch(() => {})
  await page.waitForTimeout(600)
  const leaked = await numericLeak()
  for (const l of leaked) errors.push({ where: `${route} 正文泄漏`, msg: l })
  /*
   * 取 button **与 role=tab**。
   *
   * 只用 getByRole('button') 会漏掉标签组:InkTabs 渲染的是 `role="tab"`,
   * 那是 WAI-ARIA 的正确写法(整组只留一个 tabindex=0,靠左右键走)。
   * 实测 /codex 与 /collection 两页的按钮全是 tab,于是它们在此脚本里
   * 一次都没被点过 —— 而全局累计的总数仍够,看不出来。
   * /souls 的入口卡倒是 button,但它当时只取到 toast 的关闭钮。
   */
  const allHandles = [
    ...(await page.getByRole('button').elementHandles()),
    ...(await page.getByRole('tab').elementHandles())
  ]
  /*
   * **先筛再切片**,不是先切再筛。
   *
   * 先前写 `buttons.slice(0, DEPTH)` 再在循环里 continue —— 提示条那四个「×」
   * 占掉了名额,真正的入口卡被挤到切片之外。实测 /souls 与 /celestial 两页
   * 因此一次都没点到(它们明明有可见可点的入口卡)。
   */
  const buttons = []
  for (const b of allHandles) {
    const label = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!label || SKIP.test(label)) continue
    if (label === '×' || label === '✕') continue
    if (!(await b.isVisible().catch(() => false))) continue
    /*
     * 视口外的钮先跳过。
     *
     * `isVisible()` 只问「CSS 上可不可见」,不管在不在当前视口里 ——
     * 实测 /adventure 的「出发」在 y=833(视口高 812),筛得到、点不着:
     * Playwright 会先滚动过去,滚动又会把别的元素移位,800ms 内点不中即超时。
     * 代价是长页面下半部分的钮这一轮不点 —— 比误报「死按钮」好。
     */
    const inView = await b
      .evaluate(el => {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return false
        /*
         * 两个方向都要判,且要认**容器裁切**。
         *
         * 只比 `r.top >= 0 && r.bottom <= innerHeight` 不够:
         *   · 横向在视口外(侧栏滑出、横向滚动)同样点不着,却没被拦;
         *   · `main` 自己可能是滚动容器,元素在 window 里"可见"但在 main 的可视区之外。
         * 故用「元素中心是否同时落在视口与各层滚动容器的可视区内」,
         * 这与 Playwright 点击时的实际命中判据更接近。
         */
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) return false
        for (let p = el.parentElement; p; p = p.parentElement) {
          const st = getComputedStyle(p)
          const scrollable = /(auto|scroll)/.test(st.overflowY) || /(auto|scroll)/.test(st.overflowX)
          if (!scrollable) continue
          const pr = p.getBoundingClientRect()
          if (cy < pr.top || cy > pr.bottom || cx < pr.left || cx > pr.right) return false
        }
        return true
      })
      .catch(() => false)
    if (!inView) continue
    if (await b.isDisabled().catch(() => false)) continue
    buttons.push(b)
    if (buttons.length >= DEPTH) break
  }
  const startHash = await page.evaluate(() => location.hash)
  for (const b of buttons) {
    // 离页守卫:跳页后旧页按钮已无从点起
    if ((await page.evaluate(() => location.hash)) !== startHash) break
    const label = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!label || SKIP.test(label)) continue
    // 提示条右上角的「×」不属于页面交互:点它只是关掉一条提示,不验任何页面逻辑
    if (label === '×' || label === '✕') continue
    if (!(await b.isVisible().catch(() => false))) continue
    if (await b.isDisabled().catch(() => false)) continue
    const before = errors.length
    const beforeFp = await fingerprint()
    /*
     * 点不中就不计数,也不判「点了没反应」。
     *
     * 原先无条件 `clicked += 1`:点击超时了也照算一次,于是
     * ① 逐页读数虚高;② 指纹没变就被当成「死按钮」——而它其实一下都没点到。
     */
    const clickedOk = await b
      .click({ timeout: 800 })
      .then(() => true)
      .catch(() => false)
    if (!clickedOk) continue
    clicked += 1
    await settle()
    if (errors.length > before) errors[errors.length - 1].where = `${route} 点「${label}」`
    else if ((await fingerprint()) === beforeFp) await classifySilent(route, 'page', label)
    await scanNumericLeaks(`${route} 点「${label}」后泄漏`)
    await clickInsideModal(route, label)
    // 逐层收起弹窗(弹窗内点开的详情会叠第二层),免挡后续按钮;每层等淡出走完:离场中的弹窗会让下一按钮的前后指纹必然不同,死按钮漏判
    for (let layer = 0; layer < 4 && (await page.locator('.modal-panel').count()) > 0; layer += 1) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(80)
      await page.waitForFunction(sel => document.querySelector(sel) === null, FADING, { timeout: 1000 }).catch(() => {})
    }
  }

  /*
   * 记下本页点到了几次。**必须在导航链接那段之前** ——
   * 导航链接的落地点击记在 `clicked` 上,但那验的是「跳过去没炸」,
   * 不是「这一页自己的钮点得到」。混在一起就回到全局累计的老问题。
   */
  clickedPerRoute.set(route, clicked - beforeRouteClicks)

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
    /*
     * 先收掉残留弹窗再点导航。
     *
     * 引擎每秒有 8% 概率弹「悟道顿悟」(5 分钟冷却),而这里每根链接都要回本路由重等 300ms ——
     * 恰好撞上那次弹出时,遮罩会挡住链接。实测连跑六次有一次复现五条
     * 「导航被浮层挡住,仍停在 #/」,挡路元素的类名正是顿悟弹窗里的文字。
     * 那不是缺陷(弹窗有「忽略」按钮,玩家点得掉),只是本脚本没先收拾干净。
     */
    for (let layer = 0; layer < 4 && (await page.locator('.modal-panel').count()) > 0; layer += 1) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(80)
      await page.waitForFunction(sel => document.querySelector(sel) === null, FADING, { timeout: 1000 }).catch(() => {})
    }
    const link = page.locator(`a[href="${href}"]`).first()
    if (!(await link.isVisible().catch(() => false))) continue
    const before = errors.length
    // 先滚到视口中央:视口外的 elementFromPoint 为 null,会被误判成被挡
    await page.evaluate(h => document.querySelector(`a[href="${h}"]`)?.scrollIntoView({ block: 'center' }), href)
    await page.waitForTimeout(120)
    // 中心点归链接才 force 点:普通 click 在动画重页(洞府卡)上会等到超时,裸 force 会穿透浮层点错;被挡先 Esc 稍候
    let blocker = await hitClear(href)
    if (blocker !== 'clear') {
      /*
       * 被挡时逐层收:弹窗可能是叠着的(列表 + 详情两层),一发 Esc 只收掉顶层。
       * 原先只按一次、等 600ms 再看 —— 叠层时第二层仍在,读数照样报「被浮层挡住」。
       * 每层都等淡出走完,免得分片还在时 elementFromPoint 仍命中它。
       */
      for (let layer = 0; layer < 4; layer += 1) {
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(120)
        await page.waitForFunction(sel => document.querySelector(sel) === null, FADING, { timeout: 1000 }).catch(() => {})
        blocker = await hitClear(href)
        if (blocker === 'clear' || blocker === 'gone') break
        /*
         * Esc 收不掉的那几种(closable=false):历练际遇、突破结果、轮回、登临真仙。
         * 它们是设计如此 —— 必须做出选择才能继续,所以连关闭钮都不渲染,
         * handleEscape 也会把 Esc 吞掉。这里替玩家按掉那一层的第一个按钮。
         */
        const dismissed = await page.evaluate(() => {
          const panels = [...document.querySelectorAll('.modal-panel')]
          const panel = panels[panels.length - 1]
          if (!panel) return false
          const btn = [...panel.querySelectorAll('button')].find(b => !b.disabled && b.offsetParent !== null)
          if (!btn) return false
          btn.click()
          return true
        })
        if (dismissed) {
          await settle()
          blocker = await hitClear(href)
          if (blocker === 'clear' || blocker === 'gone') break
        }
      }
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

} catch (err) {
  // 中途崩了:记进 errors 与其余失败并列 —— 不吞掉它,也不让它盖掉已经点过的读数
  errors.push({ where: 'smoke', msg: `冒烟中途中断:${err instanceof Error ? err.message.split('\n')[0] : String(err)}` })
} finally {
  await browser.close().catch(() => {})
}
console.log(`\n界面冒烟:${ROUTES.length} 页,点击 ${clicked} 次(导航 ${navClicked.size} 条边;按钮每页上限 ${DEPTH})`)
/*
 * 逐页读数:某页 0 次时人一眼看得出来(不判失败,理由见 clickedPerRoute 的注释)。
 * 只列比中位数少的页,免得每次刷十七行。
 */
{
  const counts = ROUTES.map(r => clickedPerRoute.get(r) ?? 0)
  const low = ROUTES.filter((r, i) => (counts[i] ?? 0) <= 1)
  if (low.length) console.log(`  点到 ≤1 次的页:${low.join(' · ')}`)
}
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
/*
 * 点击量下限:这条脚本的全部价值在于「点过之后没炸」。
 * 若按钮取不到(label 为空)、或被 SKIP / isVisible / isDisabled 过滤光,
 * clicked 会接近于零,而 errors 也是零 —— 脚本照样报绿,只是它什么都没验。
 * 下限按真实 ROUTES 规模定:每页至少要约到 1 个按钮,否则页面结构已经变了。
 */
const MIN_CLICKS = ROUTES.length
if (clicked < MIN_CLICKS) {
  console.log(`✗ 只点到 ${clicked} 个按钮(应 ≥ ${MIN_CLICKS},即每页至少 1 个)—— 冒烟没验到东西`)
  process.exitCode = 1
}

if (errors.length === 0) {
  console.log('✓ 无运行时异常')
} else {
  for (const e of errors) console.log(`✗ ${e.where}\n   ${e.msg.split('\n')[0]}`)
  process.exitCode = 1
}
