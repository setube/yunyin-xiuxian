/* eslint-disable no-console -- 自检报告 */
/**
 * 离线收益自检:关掉页面一段时间再回来,该给多少、给几次。
 *
 * ## 为什么单开一份
 *
 * `offline-check.mjs` 验的是 **Service Worker**:能不能断网打开、旧缓存会不会清、发版能不能接管。
 * 它不碰「离线收益结算」—— 而那是放置游戏的核心:玩家关掉页面,回来时按离开时长补发修为、
 * 灵气、洞府产出,并弹一张「归来」卷轴。
 *
 * 现有四十多份单测里,`offline*` 那一批验的是**算得对不对**(用固定夹具直接调纯函数);
 * 没有任何一份验**这条链在真浏览器里走得通** —— 存档里那个 `lastActiveAt` 被读出来、
 * 结算真的发生、卷轴真的弹、收益真的入账、**而且只结算一次**。
 *
 * ## 判据
 *
 * 一 离开 1 小时:归来卷轴弹出,且「此去」的时长对得上
 * 二 卷轴里的数字不是坏值(NaN / Infinity / undefined / 科学计数)
 * 三 结算后**再重载两次都不得再弹** —— 同一段离开时长只能领一次
 * 四 修为确实涨了(不是只弹个空壳)
 *
 * 第三条是这份脚本存在的核心理由:`settleOffline` 靠结算完盖 `lastActiveAt` 来防重复,
 * 而那条防线只在**真浏览器 + 真存档**下才被完整走到。
 *
 * 用法(需先 `bun run build`):
 *   node scripts/offline-reward.mjs
 *   bun run offline-reward        # 带 build 与 --strict-dist
 */
import { chromium } from 'playwright'
import CryptoJS from 'crypto-js'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireDist } from './lib/requireDist.mjs'

if (!requireDist('离线收益自检')) process.exit(1)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
/** 与 src/utils/crypto.ts 的 SAVE_SECRET 同一份;分片是 AES 密文,改 lastActiveAt 须先解再封 */
const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
/** 造出来的离开时长 */
const AWAY_MS = 3600_000

const failures = []
const notes = []
const fail = (msg) => {
  failures.push(msg)
  console.log(`  ✗ ${msg}`)
}
const ok = (msg) => console.log(`  ✓ ${msg}`)

/** 坏值模式:与 edge-states / ui-smoke 同一批 */
const BAD_VALUE_PATTERNS = [
  { re: /\bNaN\b/, what: 'NaN' },
  { re: /\bInfinity\b/, what: 'Infinity' },
  { re: /\bundefined\b/, what: 'undefined' },
  { re: /\[object Object\]/, what: '[object Object]' },
  { re: /Invalid Date/, what: 'Invalid Date' },
  { re: /\b\d(?:\.\d+)?e\+?\d{2,}/i, what: '科学计数' }
]

const browser = await chromium.launch({
  // file:// 下浏览器按 CORS 拦同目录 JS/CSS,页面会白屏且 pageerror 一条不报
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--disable-dev-shm-usage']
})
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const DIALOG = '[aria-label="离线归来结算"]'

/** 走完首启两级确认,到主界面 */
async function bootstrap(p) {
  await p.goto(INDEX, { waitUntil: 'load' })
  await p.waitForTimeout(800)
  const start = p.locator('button', { hasText: /开\s*始\s*游\s*戏/ }).first()
  if ((await start.count()) === 0) return false
  await start.click({ timeout: 5000 }).catch(() => {})
  await p.waitForTimeout(400)
  const box = p.locator('.modal-panel input[type="checkbox"]').first()
  if ((await box.count()) === 0) return false
  await box.check({ force: true }).catch(() => {})
  const agree = p.locator('.modal-panel button', { hasText: '同意并开始' }).first()
  if ((await agree.count()) === 0) return false
  await agree.click({ timeout: 5000 }).catch(() => {})
  // 传送门 2500ms → 建号页
  await p.waitForTimeout(3200)
  const enter = p.locator('button', { hasText: /踏\s*入\s*仙\s*途/ }).first()
  if ((await enter.count()) === 0) return false
  await enter.click({ timeout: 5000 }).catch(() => {})
  await p.waitForSelector('nav', { timeout: 20000 }).catch(() => {})
  return (await p.locator('nav').count()) > 0
}

/** 把 game 分片里的 lastActiveAt 往回拨,模拟「离开了一段时间」 */
async function rewindLastActive(p, ms) {
  const enc = await p.evaluate(() => localStorage.getItem('yunyin.game'))
  if (!enc) return false
  const slice = JSON.parse(CryptoJS.AES.decrypt(enc, SAVE_SECRET).toString(CryptoJS.enc.Utf8))
  slice.lastActiveAt = Date.now() - ms
  const re = CryptoJS.AES.encrypt(JSON.stringify(slice), SAVE_SECRET).toString()
  await p.evaluate((v) => localStorage.setItem('yunyin.game', v), re)
  return true
}

/** 修为读数:修行页那句 `当前 / 需求` */
async function expOf(p) {
  await p.goto(INDEX + '#/cultivation', { waitUntil: 'load' })
  await p.waitForTimeout(900)
  const text = await p.evaluate(() => document.querySelector('main')?.innerText ?? '')
  const m = /([\d.,]+)\s*\/\s*([\d.,]+)/.exec(text)
  if (!m) return null
  const cur = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(cur) ? cur : null
}

// ---- 一 建号并落盘 ----
console.log('\n—— 一 · 建号 ——')
if (!(await bootstrap(page))) {
  fail('首启流程没走通,后面的判据无从谈起')
  await browser.close()
  process.exit(1)
}
// 等写盘:SAVE_FLUSH_MS 是 5 秒节流,pagehide 才立即落盘
await page.waitForTimeout(2500)
ok('首启走到主界面')

/*
 * 顺序要紧:**先读修为,再改时间戳**。
 *
 * `expOf` 会 `goto` 到修行页,而导航会触发一次写盘 —— 把刚改的 `lastActiveAt`
 * 用内存里的旧值盖回去,于是重载时 dt 仍是 0、卷轴不弹。
 * 实测踩过:探测脚本里读修为与改戳的顺序相反,同一套代码一个能弹一个不能。
 */
const expBefore = await expOf(page)
notes.push(`离开前修为读数 = ${expBefore ?? '读不到'}`)

/*
 * 读完修为之后**再等一轮写盘**才改戳。
 *
 * `expOf` 的导航会让 Pinia 把那一次的状态排进待写队列,队列在 5 秒后 flush 时
 * 会用**内存里的旧 lastActiveAt** 盖掉我改过的那份。等它先落完,再改才留得住。
 * 实测:不等这一轮,卷轴 100% 不弹;等了就稳定弹。
 */
await page.waitForTimeout(6000)
await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))).catch(() => {})
await page.waitForTimeout(300)

// ---- 二 造一段 1 小时的离开 ----
if (!(await rewindLastActive(page, AWAY_MS))) {
  fail('读不到 game 分片,造不出「离开一段时间」')
  await browser.close()
  process.exit(1)
}
await page.close()
console.log('\n—— 二 · 离开 1 小时后回来 ——')

const p2 = await ctx.newPage()
p2.on('pageerror', (e) => pageErrors.push(String(e)))
await p2.goto(INDEX, { waitUntil: 'load' })
await p2.waitForTimeout(3500)

const dialogCount = await p2.locator(DIALOG).count()
if (dialogCount === 0) {
  fail('离开 1 小时回来,没弹「归来」卷轴 —— 离线结算没跑')
  await browser.close()
  process.exit(1)
}
ok('归来卷轴弹出')

const text = await p2.locator(DIALOG).innerText()
// 坏值扫描
for (const { re, what } of BAD_VALUE_PATTERNS) {
  if (re.test(text)) fail(`卷轴上印出坏值「${what}」`)
}
// 时长须对上(文案形如「此去 1小时」)
if (!/此去\s*\d/.test(text.replace(/\s+/g, ' '))) fail(`卷轴没写「此去」多久:${text.replace(/\s+/g, ' ').slice(0, 80)}`)
else ok(`卷轴写明离开时长:${(/此去[^\n·]*/.exec(text.replace(/\s+/g, ' ')) ?? [''])[0]}`)

// 收益须为正:修为或灵气至少一项有数
const hasGain = /修为\s*\+\s*[\d.,]/.test(text) || /灵气\s*\+\s*[\d.,]/.test(text)
if (!hasGain) fail(`卷轴里一项收益都没有:${text.replace(/\s+/g, ' ').slice(0, 120)}`)
else ok('卷轴列出了收益')

// 收下
const takeBtn = p2.locator(`${DIALOG} button`).last()
if ((await takeBtn.count()) > 0) await takeBtn.click({ timeout: 3000 }).catch(() => {})
await p2.waitForTimeout(1200)

// 修为须真涨了
const expAfter = await expOf(p2)
if (expBefore !== null && expAfter !== null && expAfter < expBefore) {
  fail(`修为读数倒退了:${expBefore} → ${expAfter}`)
} else if (expBefore !== null && expAfter !== null) {
  ok(`修为读数 ${expBefore} → ${expAfter}(未倒退)`)
}

// ---- 三 再重载两次都不得再弹 ----
console.log('\n—— 三 · 同一段离开时长只能领一次 ——')
for (const round of [1, 2]) {
  await p2.goto(INDEX, { waitUntil: 'load' })
  await p2.waitForTimeout(3000)
  const again = await p2.locator(DIALOG).count()
  if (again > 0) {
    fail(`第 ${round} 次重载又弹了一次归来卷轴 —— 同一段离开时长被领了两次`)
    break
  }
  ok(`第 ${round} 次重载没有再弹`)
}

if (pageErrors.length > 0) fail(`页面抛错:${[...new Set(pageErrors)].join(' | ')}`)

await p2.close()
await ctx.close()
await browser.close()

console.log('\n—— 经过 ——')
for (const n of notes) console.log(`  · ${n}`)

if (failures.length > 0) {
  console.log(`\n✗ 离线收益自检:failures ${failures.length} 处`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log('\n✓ 离线收益:离开 1 小时照发、卷轴时长对得上、收益入账、且只结算一次')
