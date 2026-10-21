/* eslint-disable no-console -- 自检脚本的产出就是给人看的报告 */
/**
 * 界面冒烟 —— 把每个页面上的按钮、以及站内导航链接都点一遍,看有没有运行时异常
 * (导航入口是 RouterLink(<a>) 渲染的,不在 getByRole('button') 里 —— 单独走一条 pass,
 *  否则「点入口没反应」这类 bug 在冒烟里永远看不见)
 *
 * 与 layout-check 的分工:那边量排版,这边戳交互。
 * 静态审计能查「有没有接线」,查不出「点下去会不会炸」——比如某个弹窗打开时
 * 读了一个只在特定存档下才存在的字段。故这里用真浏览器真存档,逐页点按钮。
 *
 * 用法(需要 playwright,已是 devDependency):
 *   bun run build
 *   bunx playwright install chromium
 *   bun scripts/ui-smoke.mjs             # 每页最多点 12 个按钮
 *   bun scripts/ui-smoke.mjs --depth 25  # 点更多
 *   bun scripts/ui-smoke.mjs --late      # 用后期夹具存档(神人境)覆盖终局界面
 *
 * 会跳过有破坏性的按钮(分解/删除/清空/重置/兵解/转世),免得把冒烟盘玩坏。
 * 发现 pageerror 即失败并打印堆栈前几行 —— 那通常就是一处真 bug。
 *
 * ⚠ 夹具说明:存档密钥就写在包里(见 utils/crypto 的注释:并非安全边界),
 * 故这里能照同一套格式造一份"神人境"存档。它是**自检夹具**,不是作弊入口:
 * 别把它当推荐玩法,也别据此以为存档不可改。
 *
 * ⚠ --late 很慢(一轮约十分钟):终局页面上的按钮会真的触发模拟
 * (突破推演 / 远征预估 / 挑战书定价),不是脚本卡住了。日常冒烟用默认模式。
 */
/**
 * 元素句柄,不用 nth 序号定位器 —— 一处曾被当作「游戏性能问题」的教训
 * --------
 * 抓按钮清单若用 `getByRole('button').all()`,拿到的是一串**钉了序号**的定位器
 * (nth(0), nth(1), …):toast 进出、弹窗开合、点了「← 返回」/入口卡跳页,
 * 都会让序号指向别的节点或空号 —— 而 Playwright 的查询会按可操作性**自动等待**,
 * 空号一路等到默认 30s 超时。实测后果:/market /apprentice /dongfu 三页被拖到
 * ~44s/点击(点击「返回」离页后,余下 9 个序号 × 30s 纯等待),墙钟 626s 里
 * 一半以上是它;CDP 采样证明等待期间主线程全闲 —— 游戏侧毫无问题,玩家无感。
 *
 * 改用 `elementHandles()`:句柄钉住**DOM 节点本身**,toast 进出不挪它,节点一没
 * innerText/click 立即抛错(被 .catch 吃掉,快进快出)。另加一道离页守卫:
 * hash 一变即断循环 —— 离页后旧页的按钮本就无从点起。
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

/**
 * 全量路由 —— 从前只点九页,流派/收藏/修仙录/洞府/本世之界/天界这六页
 * 只被排版自检量过尺寸,没人戳过它们的按钮(点下去会不会炸、有没有 NaN 泄漏都没看过)。
 */
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
/** 破坏性/离开型按钮:冒烟盘上不点 */
const SKIP = /分解|删除|清空|重置|兵解|转世|散尽|导出|导入|隐私|关于我们|出 秘 境|暂别|确认转移/

/**
 * 容器里 headless 易崩的两处,一次防住:
 * - --no-sandbox:无用户命名空间的容器里默认 sandbox 起不来,浏览器半路退出(报「Target closed」);
 * - --disable-dev-shm-usage:/dev/shm 常只有 64M,点一阵就整浏览器崩 —— 改落 /tmp。
 */
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--disable-dev-shm-usage']
})
const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
/**
 * 外域请求一律拦掉,但**分两类记账**:
 *   · 已知统计脚本(sdk.51.la)是 index.html 里唯一的第三方资源,拦掉只为确定性
 *     (它慢或不通时 goto(load) 会被别人的服务器拖住,实测能卡满 30s 超时);
 *   · 其它外域一律算失败 —— 将来谁顺手加了外链,门在**这里**红,而不是让线上
 *     决定我们的自检要不要绿。
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
/**
 * 点了没反应的按钮 —— 只报告,不判失败。
 *
 * 判据是「点击前后看不出任何变化」:正文文本、弹窗数、toast 数都没动。
 * 空白点击有时是合理的(比如点一个已选中的页签),故先当读数看:
 * 一屏里要是冒出十几个,那就说明有一批入口在静默失败。
 */
const silent = []
/**
 * 真·死控件/无效果控件:点了没反应,干净重试仍没反应 → 判失败(exitCode 1)。
 * 与 silent 分开:silent 是「读数不判失败」(导航被浮层挡、或干净重试证实功能正常),
 * 而这里是有实据的死按钮。
*/
const dead = []
/**
 * 干净重试:回本路由、单独点同一按钮,看指纹有没有变。
 * 全流程态下点一个「已被前次交互带入目标态」的按钮会没增量(误报);单独点却有变化
 * 的,证明控件功能正常,不判失败。返回:
 *  - true  单独点有变化(功能正常)
 *  - false 单独点也无变化(真死控件)
 *  - null  干净态下找不到该按钮(如弹窗按钮在干净态未开),无法复现 → 不判失败
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
/** 死/读数的归桶与报告行都来自共享分类器 classifySmoke —— 单一来源,不在此处另写一套 */
function pushSmokeDecision(dec) {
  if (dec.bucket === 'dead') dead.push(dec.line)
  else silent.push(dec.line)
}
async function classifySilent(route, kind, label) {
  const verb = kind === 'modal' ? '弹窗内点' : '点'
  const entry = `${route} ${verb}「${label}」`
  // 幂等选中项白名单:不干净重试,直接按读数处理(分类器会再核一遍)
  const clean = SMOKE_ALLOWLIST.includes(entry) ? null : await cleanRetry(route, label)
  pushSmokeDecision(classifySmoke(route, kind, label, clean, SMOKE_ALLOWLIST))
}
/** 已成功走过的导航链接(去重:同 href 全站只点一次;失败/被挡的不计入,留待后续路由重试) */
const navClicked = new Set()
/** 已报过「未达目标/被浮层挡住」读数的链接(同 href 只报一次,避免跨路由刷屏) */
const navBlockedOnce = new Set()
async function fingerprint() {
  return page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 4000)
    /*
     * 指纹里必须带上「不体现在文字上的变化」。
     *
     * 主题与战报速度这两组切换改的是 CSS 变量与 aria-pressed,正文一个字都不变 ——
     * 于是它们每一轮都被报成「点了没反应」,而读数一旦常驻噪声,真事故就会被忽略。
     * 故把 data-theme 与当前按下的选择一并算进指纹(顺手也能看出选中态有没有变)。
     */
    /*
     * 全文哈希:只看首尾会漏掉「变化发生在中间」的点击 ——
     * 比如人物页点一行属性,来源明细是在正文中段展开的,
     * 首 120/末 80 字都没动,于是它被记成「点了没反应」(实测)。
     */
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
/**
 * 正文数字体检:找出正文里的 NaN / Infinity / undefined 泄漏点。
 * (本页体检与导航落地页体检共用,统一格式。)
 */
async function numericLeak() {
  return page.evaluate((patterns) => {
    const text = document.body.innerText
    return patterns.filter(p => text.includes(p)).map(p => {
      const i = text.indexOf(p)
      return `${p}@…${text.slice(Math.max(0, i - 24), i + 24).replace(/\n/g, '↵')}…`
    })
  }, NUMERIC_LEAK)
}
/**
 * 点击之后再量一次数字泄漏 —— 本作大量数值渲染在弹窗/交互之后才出现
 * (炼丹、收纳、人物入口、天界册页)。这类 NaN/Infinity 不抛异常,pageerror 逮不到。
 */
async function scanNumericLeaks(where) {
  for (const l of await numericLeak()) errors.push({ where, msg: l })
}
/**
 * 命中测试:导航链接中心点此刻归谁?
 * - 'clear':链接自己(或其子节点)占据 —— 可以安全 dispatch,箭头不会点错对象;
 * - 'gone':链接不在页面上;
 * - 其它:盖住它的元素的 className 片段 —— 此刻点下去会吃错元素(如成就横幅)。
 */
async function hitClear(href) {
  return page.evaluate((h) => {
    const a = document.querySelector(`a[href="${h}"]`)
    if (!a) return 'gone'
    const r = a.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (a === el || a.contains(el)) return 'clear'
    // SVG 元素的 .className 是 SVGAnimatedString,toString 会变 "[object …]";用 getAttribute 拿可读类名
    return (el?.getAttribute?.('class') || el?.tagName || '?').toString().slice(0, 40)
  }, href)
}
/**
 * 点击后的安定等待 —— 替代魔法数字超时。
 *
 * page-fade 是 out-in(离场 0.18s + 入场 0.18s),路由切换动画总长约 360ms,再加动态路由
 * chunk 导入与 Vue 挂载时长不固定 —— 固定 160/350ms 都是赌时长,慢机器上照样踩在过渡中途
 * 采样(`/world 出发`、`/dongfu 返回` 被误报「没反应」的抖动就来自这)。这里等的是「状态」
 * 而不是「时间」:过渡 active 类消失且指纹连续两次一致才算安定,2s 封顶。
 *
 * 仅一个 260ms 起始下限:给「点击→路由 hash 更新→chunk 导入→新页挂载」留触发窗,免得在
 * chunk 导入前的静默空隙里就被判安定 —— 那时还是旧页指纹,真导航会被误读成「没反应」。
 */
async function settle() {
  await page.waitForTimeout(260)
  const deadline = Date.now() + 2000
  for (;;) {
    // Vue Transition 把 active/leave 类挂在「正在切换」的元素上;退出条件:没在切换 && 指纹稳定
    const busy = await page.evaluate(
      () => document.querySelector('.page-fade-enter-active, .page-fade-leave-active') !== null
    )
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
 * 只点**当前最上层**的弹窗。
 *
 * 此前固定取 `.modal-panel` 的第一扇,并把它的按钮句柄先抓成一串:一旦某个按钮
 * 打开详情(候选列表点名称 → 装备详情),后面的句柄仍属于被盖住的底层弹窗,
 * 点击会被上层背板拦下,冒烟却把它记成「死按钮」。真实原因是巡逻顺序,不是控件坏。
 *
 * 现在每一轮都重新取最高层的可见弹窗:先走完详情里的按钮,再按 Esc 回到列表,
 * 继续走列表里尚未点过的按钮。按钮打上一次性标记,弹窗重排/替换也不会重复点。
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
      // 无名图标键与破坏性按钮都不点;仍标成已处理,免得每一轮都重新检查
      if (!text || SKIP.test(text)) {
        await b.evaluate(el => (el.dataset.smokeClicked = '1')).catch(() => {})
        continue
      }
      if (!(await b.isVisible().catch(() => false)) || (await b.isDisabled().catch(() => false))) {
        await b.evaluate(el => (el.dataset.smokeClicked = '1')).catch(() => {})
        continue
      }
      // 顶层弹窗自己的按钮仍可能被 toast 等更高浮层盖住;被盖住不等于控件坏
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
      // 这一层已走完;若下面还有列表弹窗,收掉顶层继续走,别把底层按钮永远盖在下面
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
    // 弹窗按钮此前只查了 pageerror,点了没反应的同样会被静默吞掉 —— 一并纳入指纹判定
    else if ((await fingerprint()) === beforeFp) await classifySilent(route, 'modal', label)
    await scanNumericLeaks(`${route} 弹窗内点「${label}」后泄漏`)
  }
}

for (const route of ROUTES) {
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  /**
   * 数字体检:正文里出现 NaN / Infinity / undefined 一律算失败。
   * 这类泄漏在单元测试里看不出来(函数返回了"数字"),到了百万级数值与
   * 除法密集的后期界面才现形 —— 后期夹具正是为它准备的。
   */
  const leaked = await numericLeak()
  for (const l of leaked) errors.push({ where: `${route} 正文泄漏`, msg: l })
  // 元素句柄(见文件头):.all() 钉序号,toast/弹窗/跳页一变就空号空等 30s
  const buttons = await page.getByRole('button').elementHandles()
  const startHash = await page.evaluate(() => location.hash)
  for (const b of buttons.slice(0, DEPTH)) {
    // 离页守卫:点了「← 返回」/入口卡这类导航钮,旧页按钮已无从点起,断循环
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
    // 点开弹窗后关掉,免得挡住后面的按钮
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(80)
  }

  /**
   * 真·导航图:底部五页签 / 顶栏设置齿轮 / 各页内入口全是 RouterLink(<a>),不是 button ——
   * 上面的按钮 pass 一根都戳不到。「点入口没反应」这类 bug(点击导航却原地不动)
   * 正藏在这层。这里把每根 in-app 导航边都真实点一遍(成功的边同 href 全站只点一次,
   * 被挡/未达标的保留下来等后续路由重试);落地页同样做数字体检 —— 出跳后目标页
   * 有没有炸,单看本页按钮看不出端倪。
   */
  const linkHrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#/"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => !!h)
  )
  for (const href of [...new Set(linkHrefs)]) {
    if (navClicked.has(href)) continue
    // 点当前页自己的页签 = 原地踏步,不是一次导航,跳过
    if (href === '#' + route) continue
    // 回到本 route 再点:上一根链接可能已把页面带到别处,保证落在链接所属页面
    await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
    await page.waitForTimeout(300)
    const link = page.locator(`a[href="${href}"]`).first()
    if (!(await link.isVisible().catch(() => false))) continue
    const before = errors.length
    // 先滚到视口中央再命中:卡片堆在首屏外时,它中心点的 elementFromPoint 是 null(视口外),
    // 会被误判成「被挡住」—— 真实首因不是遮挡而是没滚动。滚到中央后,叠在上面的真浮层
    // (成就横幅/弹窗)才会在命中测试里现形。
    await page.evaluate(h => document.querySelector(`a[href="${h}"]`)?.scrollIntoView({ block: 'center' }), href)
    await page.waitForTimeout(120)
    // 再命中再点:动画重页(洞府卡)上普通 click 会被可操作性等待卡到超时、一帧都不派发
    // (那条边于是从没被真点过);而纯 force 又会穿透瞬时浮层吃错元素,两条路都不可信。
    // 中心点归链接(或其子节点)才 dispatch;被浮层挡就 Esc + 稍候让开。
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
    // 导航专用断言:「跳没跳过去」看 hash 落点,不信页面指纹 —— 指纹是噪声的重灾区。
    const landedHash = await page.evaluate(() => location.hash)
    if (errors.length > before) {
      // 有 pageerror:这条边确实被点过(Bug 已由报错钉死),以报错为准,标覆盖不再重试
      errors[errors.length - 1].where = `${route} 导航「${href}」`
      navClicked.add(href)
    } else if (landedHash === href) {
      // 真正到达目标:才是一次成功导航,落地页数字体检此时才有意义
      clicked += 1
      navClicked.add(href)
      const landedLeak = await numericLeak()
      for (const l of landedLeak) errors.push({ where: `${href} 落地页泄漏`, msg: l })
    } else if (!navBlockedOnce.has(href)) {
      // 没到目标也没报错:读数且同 href 只报一次;但不标覆盖 —— 浮层让开后,a 若还出现在
      // 别的路由,会重新尝试这条边,而不是被全局去重永久跳过
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
