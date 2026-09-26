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
import { chromium } from 'playwright'
import CryptoJS from 'crypto-js'
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
const SKIP = /分解|删除|清空|重置|兵解|转世|散尽|导出|导入|隐私|关于我们|出 秘 境|暂别/

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] })
const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
if (LATE) {
  const gn = (m, e) => ({ m, e })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
  const slices = {
    /**
     * 时间戳用"现在":夹具若写 1970,离线结算会去补算半个世纪的挂机收益 ——
     * 冒烟脚本每翻一页都要重算一次,一轮要跑十分钟(实测)。
     */
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      major: 14,
      sub: 0,
      exp: gn(0, 0),
      age: 3000,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 88 }, { element: 'water', aptitude: 70 }], gradeName: '双灵根', growthMult: 1.4 }
    },
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 900, page: 300, dust: 500 },
    /**
     * 装备两件「背水」词条 —— 攒出一路流派。没有这一步,流派页的成路界面
     * (五维评级 / 组合技 / 成路来源)在冒烟里根本不会渲染,等于没测。
     */
    inventory: {
      items: [
        { uid: 'smoke_w', templateId: 'w_zidian', quality: 'heaven', tier: 20, level: 0, affixes: [{ id: 'bs3', roll: 1 }] },
        { uid: 'smoke_a', templateId: 'a_hufu', quality: 'heaven', tier: 20, level: 0, affixes: [{ id: 'low2', roll: 1 }] }
      ],
      equipped: { weapon: 'smoke_w', armor: 'smoke_a' },
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    endgame: { daoPath: 'sword', daoSource: 1200, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'dark' }
  }
  await context.addInitScript(
    data => {
      if (localStorage.getItem('__smokeFixture')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__smokeFixture', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
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
/** 弹窗里的按钮也要点 —— 大部分交互都藏在 modal 里(炼丹/收纳/人物各入口/天界册页) */
async function clickInsideModal(route) {
  const panel = page.locator('.modal-panel').first()
  if (!(await panel.count())) return
  const inner = await panel.getByRole('button').all()
  for (const b of inner.slice(0, 6)) {
    const label = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!label || SKIP.test(label)) continue
    if (!(await b.isVisible().catch(() => false))) continue
    if (await b.isDisabled().catch(() => false)) continue
    const before = errors.length
    const beforeFp = await fingerprint()
    await b.click({ timeout: 800 }).catch(() => {})
    clicked += 1
    await settle()
    if (errors.length > before) errors[errors.length - 1].where = `${route} 弹窗内点「${label}」`
    // 弹窗按钮此前只查了 pageerror,点了没反应的同样会被静默吞掉 —— 一并纳入指纹判定
    else if ((await fingerprint()) === beforeFp) silent.push(`${route} 弹窗内点「${label}」`)
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
  const buttons = await page.getByRole('button').all()
  for (const b of buttons.slice(0, DEPTH)) {
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
    else if ((await fingerprint()) === beforeFp) silent.push(`${route} 点「${label}」`)
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
if (silent.length) {
  console.log(`点了没反应 ${silent.length} 处(读数,不判失败):`)
  for (const s of silent.slice(0, 20)) console.log(`  · ${s}`)
}
if (errors.length === 0) {
  console.log('✓ 无运行时异常')
} else {
  for (const e of errors) console.log(`✗ ${e.where}\n   ${e.msg.split('\n')[0]}`)
  process.exitCode = 1
}
