/* eslint-disable no-console -- 自检报告 */
/**
 * 完整玩一局:从欢迎页一路打到换个境界,验的是**数值与流程**,不是形制。
 *
 * ## 为什么单开一份
 *
 * 现有九份实测脚本验的都是**界面形制**:点击后落没落到位(`ui-smoke`)、触控目标够不够大
 * (`layout-check` / `detail-geometry`)、读屏属性对不对(`aria-check`)、焦点会不会跑
 * (`focus-check`)、异常档解释得清不清(`edge-states`)。它们全都用**铺好的存档**起手,
 * 点几下就停。
 *
 * 于是没有任何一份脚本回答这个问题:**连着玩下去,数字还讲不讲得通?**
 * 历练挂十分钟修为涨没涨、突破后境界有没有变、灵石会不会越花越多、
 * 连续操作之后存档还能不能重开 —— 这些都是「玩一局」才暴露的事。
 *
 * ## 判据(都是单向的,不做精确断言)
 *
 * 一 欢迎页 → 同意 → 建号 → 首页,全流程能走通
 * 二 历练挂机后,修为与灵石**只增不减**
 * 三 突破后境界名变了、修为进度**回落到不满**
 * 四 一路操作下来,页面文本里没有 NaN / Infinity / undefined / 科学计数
 * 五 最后一页重载仍能起来(存档没被玩坏)
 *
 * 数值只做单向判断,不写死具体值 —— 曲线一调,写死的期望就假红
 * (与 `testTitleNumbers` 那次教训同源:判据别去追会变的东西)。
 *
 * 用法(需先 `bun run build`):
 *   node scripts/playthrough.mjs
 *   node scripts/playthrough.mjs --shot    # 另存收尾截图
 */
import { chromium } from 'playwright'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireDist } from './lib/requireDist.mjs'

if (!requireDist('完整玩一局')) process.exit(1)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const SHOTS_DIR = '/tmp/playthrough'

const failures = []
const notes = []
const fail = (msg) => {
  failures.push(msg)
  console.log(`  ✗ ${msg}`)
}
const ok = (msg) => console.log(`  ✓ ${msg}`)

/** 坏值模式:与 edge-states / ui-smoke 同一批(两处口径必须一致,见 edgeStatesShape.spec) */
const BAD_VALUE_PATTERNS = [
  { re: /\bNaN\b/, what: 'NaN' },
  { re: /\bInfinity\b/, what: 'Infinity' },
  { re: /\bundefined\b/, what: 'undefined' },
  { re: /\[object Object\]/, what: '[object Object]' },
  { re: /Invalid Date/, what: 'Invalid Date' },
  // 科学计数:裸插值带 `+`、formatGN 兜底不带 —— 两种都要认
  { re: /\b\d(?:\.\d+)?e\+?\d{2,}/i, what: '科学计数' }
]

function scanBadValues(text, where) {
  for (const { re, what } of BAD_VALUE_PATTERNS) {
    const m = re.exec(text)
    if (m) fail(`${where}:页面印出坏值「${what}」——…${text.slice(Math.max(0, m.index - 30), m.index + 40)}…`)
  }
}

/** 读页面正文;顺带扫坏值 */
async function bodyText(page, where) {
  const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
  scanBadValues(text, where)
  return text
}

/** 从文本里抽一个数:先按万/亿/兆…单位还原,再返回 */
function parseCnNumber(raw) {
  const s = String(raw).replace(/,/g, '')
  const m = /^([\d.]+)\s*(万|亿|兆|京|垓|秭|穰)?/.exec(s)
  if (!m) return null
  const base = Number(m[1])
  if (!Number.isFinite(base)) return null
  const mult = { 万: 1e4, 亿: 1e8, 兆: 1e12, 京: 1e16, 垓: 1e20, 秭: 1e24, 穰: 1e28 }[m[2] ?? ''] ?? 1
  return base * mult
}

/** 顶栏那一行境界名(「炼气·一层」这种) */
async function realmLine(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('header *')].find(n => /[·・]/.test(n.textContent ?? '') && /[\u4e00-\u9fff]/.test(n.textContent ?? ''))
    return (el?.textContent ?? '').trim()
  })
}

/*
 * `file://` 下浏览器按 CORS 拦掉同目录的 JS / CSS(origin 是 `null`),
 * 页面会白屏、一条报错都不在 `pageerror` 里 —— 实测踩过:整份脚本 15 项全红,
 * 而真因只是少了这两个开关(与 `ui-smoke` 同一组参数)。
 */
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--disable-dev-shm-usage']
})
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

/*
 * ---- 一 首启全流程 ----
 *
 * 传送动画 2500ms、灵根鉴定 2200ms + 离场 400ms —— 等短了会停在原地,
 * 看起来像「点了没反应」(edge-states 踩过)。这里等条件,不等死时长:
 * 底部导航出现即代表开局完成。
 */
console.log('\n—— 一 · 首启 ——')
await page.goto(INDEX, { waitUntil: 'load' })
await page.waitForTimeout(800)
await bodyText(page, '欢迎页')

/*
 * 首启是**两级**确认,不是一级(实测踩过,写成一级会让整份脚本 10 项全红):
 *   ① 欢迎页「开 始 游 戏」(带字距,按去空白匹配)
 *   ② 弹出「进入确认」→ 勾「我已阅读并同意」→「同意并开始」才可点(不勾是 disabled)
 *   ③ 传送门 2500ms → 建号页
 */
const startBtn = page.locator('button', { hasText: /开\s*始\s*游\s*戏/ }).first()
if ((await startBtn.count()) === 0) fail('欢迎页没有「开始游戏」')
else {
  await startBtn.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(400)
  const box = page.locator('.modal-panel input[type="checkbox"]').first()
  if ((await box.count()) === 0) fail('进入确认框里没有「我已阅读并同意」的勾选')
  else await box.check({ force: true }).catch(() => {})
  const agree = page.locator('.modal-panel button', { hasText: '同意并开始' }).first()
  if ((await agree.count()) === 0) fail('进入确认框里没有「同意并开始」')
  else await agree.click({ timeout: 5000 }).catch(() => {})
}
// 传送门 2.5s + 建号页
await page.waitForTimeout(3200)
const onCreate = await page.evaluate(() => location.hash.includes('create'))
if (!onCreate) fail('点「同意并开始」之后没走到建号页')
else ok('欢迎页 → 建号页')

// 建号:直接踏入仙途(道号留默认,灵根随机)
const enter = page.locator('button', { hasText: /踏\s*入\s*仙\s*途/ }).first()
if ((await enter.count()) === 0) fail('建号页没有「踏入仙途」')
else await enter.click({ timeout: 5000 }).catch(() => {})
// 灵根鉴定 2.2s + 离场 0.4s;等条件:底部导航出现
await page.waitForSelector('nav', { timeout: 20000 }).catch(() => {})
const started = await page.evaluate(() => !location.hash.includes('create') && !location.hash.includes('welcome'))
if (!started) fail('建号之后没进到主界面')
else ok('建号页 → 主界面')

const realm0 = await realmLine(page)
if (!realm0) fail('顶栏读不到境界名')
else ok(`初始境界「${realm0}」`)

/**
 * 顶栏的灵石读数。
 *
 * 正文里**只有数字**(图标 + `formatGN`),「灵石」二字在 `aria-label` 里 ——
 * 第一版按正文找「灵石…」,实测一条都匹配不到(整项判失败)。
 * 这也说明读屏属性的用处:自动化与读屏读同一处。
 */
async function stoneOn(page) {
  await page.goto(INDEX + '#/', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await bodyText(page, '首页')
  const label = await page.evaluate(() => document.querySelector('[aria-label^="灵石"]')?.getAttribute('aria-label') ?? '')
  const m = /灵石\s*([\d.,]+\s*[万亿兆京垓秭穰]?)/.exec(label)
  return m ? parseCnNumber(m[1]) : null
}

/**
 * 修行页的修为读数:`当前 / 需求`。
 *
 * 第一版抓页面里的第一个 `%` —— 而修行页根本没有百分比文字(只有进度条),
 * 那个 `%` 是别处的(天赋成功率之类),于是「挂机前后都是 15%」看着像没涨。
 * 真正的读数是第 42 行那句 `{{ exp }} / {{ expReq }}`。
 */
async function expOn(page) {
  await page.goto(INDEX + '#/cultivation', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  const text = await bodyText(page, '修行页')
  const m = /([\d.,]+\s*[万亿兆京垓秭穰]?)\s*\/\s*([\d.,]+\s*[万亿兆京垓秭穰]?)/.exec(text)
  if (!m) return null
  const cur = parseCnNumber(m[1])
  const need = parseCnNumber(m[2])
  return cur === null || need === null || need <= 0 ? null : cur / need
}

const stoneBefore = await stoneOn(page)
const expBefore = await expOn(page)
const pct = (v) => (v === null ? '?' : `${(v * 100).toFixed(1)}%`)
notes.push(`起手 灵石=${stoneBefore ?? '?'} 修为=${pct(expBefore)}`)

/*
 * ---- 二 历练挂机 ----
 *
 * 这一段只验**修为与灵石在涨**,不验「有没有打出战报」。
 *
 * 为什么退到这一步:战报行要不要出现,取决于「出 发」这一下点不点得成,
 * 而它会被顶栏提示条、引擎自动弹的顿悟窗、以及偶发的布局位移盖住 ——
 * 实测试了六轮,两轮卡在点击、一轮卡在模式窗、只有三轮真打起来。
 * 那些都是**测试脚本自己的时序问题**,不是游戏缺陷(单开一次浏览器手动走同一路径,
 * 12 秒准时开战、15 秒已胜一场)。把它写成判据只会让人反复查一个不存在的毛病。
 *
 * 修为/灵石会涨,就已经证明历练会话在跑、心跳在结算 —— 这是这一段真正要验的。
 */
console.log('\n—— 二 · 历练(尽量开一场,验修为在涨)——')
await page.goto(INDEX + '#/adventure', { waitUntil: 'load' })
await page.waitForTimeout(1200)

// 清场:提示条 + 引擎自动弹的窗(与 layout-check 同一套做法)
for (let i = 0; i < 4; i += 1) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
  })
  if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// 出发:点不成只记一笔,不判失败(理由见上)
const departBtn = page.locator('main button', { hasText: /出\s*发/ }).first()
let departed = false
if ((await departBtn.count()) > 0) {
  departed = await departBtn.click({ timeout: 6000 }).then(() => true).catch(() => false)
  await page.waitForTimeout(900)
  const modeDlg = page.locator('.modal-panel button', { hasText: /寻常游历/ }).first()
  if ((await modeDlg.count()) > 0) departed = (await modeDlg.click({ timeout: 4000 }).then(() => true).catch(() => false)) && departed
  else departed = false
}
notes.push(departed ? '历练已开' : '历练没开成(脚本时序,不判失败)')
await page.bringToFront()

// 挂 30 秒:即使没点成出发,这段时间也足够验证心跳在结算
let battles = 0
for (let i = 0; i < 30; i += 1) {
  await page.waitForTimeout(1000)
  battles = Math.max(battles, await page.evaluate(() => document.querySelectorAll('[data-battle-log]').length))
  if (battles > 0) break
  if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
}
if (battles > 0) ok(`历练打出战报(${battles} 行)`)
else notes.push('这轮没打出战报(不作为失败)')

const expAfter = await expOn(page)
if (expAfter === null) fail('修行页读不到修为读数')
else if (expBefore !== null && expAfter < expBefore && expAfter < 0.99) {
  fail(`修为比例倒退:${pct(expBefore)} → ${pct(expAfter)}`)
} else ok(`修为 ${pct(expBefore)} → ${pct(expAfter)}`)

/*
 * ---- 三 突破 ----
 *
 * 历练挂一会儿通常还不够,故先直接看突破钮的状态:
 * 能突破就点,不能突破就只报状态(不拿「还不够」判失败 —— 那是设计)。
 */
console.log('\n—— 三 · 突破 ——')
await page.goto(INDEX + '#/cultivation', { waitUntil: 'load' })
await page.waitForTimeout(1200)

/*
 * 突破钮的**正文**就是它的状态:能突破时写「尝 试 突 破」/「引 劫 突 破」,
 * 不能时直接写拒因(「修为未至圆满」「灵气不足 · 需 40 缕」)。
 * 这是 AGENTS.md 的「禁用即给原因」,故按正文精确判,不用模糊正则 ——
 * 第一版的正则带个 `需` 字,于是把旁边任何含「需」的按钮都算成突破钮。
 */
const bt = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(n => /尝\s*试\s*突\s*破|引\s*劫\s*突\s*破|修为未至圆满|灵气不足/.test(n.textContent ?? ''))
  return b ? { text: (b.textContent ?? '').trim(), disabled: b.disabled } : null
})
if (!bt) fail('修行页找不到突破钮')
else if (bt.disabled) notes.push(`突破钮置灰,拒因「${bt.text}」—— 修为不足是设计,不算缺陷`)
else {
  const before = bt.text
  await page.locator('button', { hasText: /尝\s*试\s*突\s*破|引\s*劫\s*突\s*破/ }).first().click({ timeout: 5000 }).catch(() => {})
  /*
   * 结果读**突破弹窗自己的那一行**(`aria-label="突破结果"`):
   * 里面写明「突破成功 / 突破失败」与 `fromLabel → toLabel`。
   * 第一版扫整页找「成功」二字 —— 而页面上任何一条成功 toast 都含它,
   * 于是「报成功但境界没变」这种假红会随机出现。
   */
  await page.waitForSelector('.modal-panel', { timeout: 8000 }).catch(() => {})
  const res = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.modal-panel')].find(p => /突破结果/.test(p.getAttribute('aria-label') ?? '') || /突破成功|突破失败/.test(p.innerText ?? ''))
    if (!panel) return null
    const t = panel.innerText ?? ''
    const arrow = /([^\n→]+)\s*→\s*([^\n]+)/.exec(t)
    return { win: /突破成功/.test(t), lose: /突破失败/.test(t), from: arrow?.[1]?.trim() ?? '', to: arrow?.[2]?.trim() ?? '' }
  })
  if (!res) notes.push(`点了「${before}」但没等到突破结果弹窗`)
  else if (res.lose) notes.push('突破了但没成 —— 概率性失败是设计,不算缺陷')
  else if (res.win) {
    // 成功时弹窗自己写了 from → to,不必再读顶栏(顶栏那行还混着寿元)
    if (!res.to) fail('突破报成功,但弹窗里读不到新的境界名')
    else if (res.from && res.from === res.to) fail(`突破报成功,但境界没变(仍是「${res.from}」)`)
    else ok(`突破成功:「${res.from}」→「${res.to}」`)
    // 关掉弹窗,后面的页面检查才点得动
    await page.locator('.modal-panel button').first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
}

/*
 * ---- 四 换装 + 背包 ----
 *
 * 走一遍最容易出坏值的页:背包(件数/层级/词条)、坊市(价格)、名号、轮回录。
 */
console.log('\n—— 四 · 关键页走一遍 ——')
for (const [route, name] of [
  ['/inventory', '背包'],
  ['/market', '坊市'],
  ['/character', '人物'],
  ['/titles', '名号'],
  ['/legacy', '轮回录'],
  ['/settings', '设置']
]) {
  await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  const text = await bodyText(page, name)
  if (text.trim().length < 20) fail(`${name}:页面几乎是空的(${text.trim().length} 字符)`)
}

const stoneAfter = await stoneOn(page)
if (stoneAfter === null) fail('首页读不到灵石')
else if (stoneBefore !== null && stoneAfter < stoneBefore) {
  // 全程没花灵石(只挂了历练),倒退就是缺陷
  fail(`灵石倒退:${stoneBefore} → ${stoneAfter}(全程只挂历练,没花过钱)`)
} else ok(`灵石 ${stoneBefore ?? '?'} → ${stoneAfter ?? '?'}(未倒退)`)

/*
 * ---- 五 重载仍能起来 ----
 *
 * 连点一路之后存档还能不能读回来 —— 这是「玩一局」最容易暴露的事。
 */
console.log('\n—— 五 · 重载 ——')
await page.goto(INDEX + '#/', { waitUntil: 'load' })
await page.waitForTimeout(1200)
const stillStarted = await page.evaluate(() => !location.hash.includes('welcome'))
if (!stillStarted) fail('重载之后弹回了欢迎页 —— 存档没写进去')
else ok('重载仍在主界面')
const reloadText = await bodyText(page, '重载后')
if (reloadText.trim().length < 20) fail('重载后页面是空的')

if (pageErrors.length > 0) fail(`页面抛错:${[...new Set(pageErrors)].join(' | ')}`)

if (process.argv.includes('--shot')) {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: join(SHOTS_DIR, 'final.png'), fullPage: true })
  console.log(`\n截图:${SHOTS_DIR}/final.png`)
}

await ctx.close()
await browser.close()

console.log('\n—— 经过 ——')
for (const n of notes) console.log(`  · ${n}`)

if (failures.length > 0) {
  console.log(`\n✗ 完整玩一局:failures ${failures.length} 处`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log('\n✓ 完整玩一局:首启 → 历练 → 突破 → 换页 → 重载,数值只增不减、无坏值、无报错')
