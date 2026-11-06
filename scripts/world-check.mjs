/**
 * 界域印记与飞升跃升的浏览器实测。
 *
 * 单测只能证明「判定对」「源码里挂了那几句」;它证明不了的是:
 *   一 四枚印真的画出来了,而且**形状分得开** —— 12px 的小印上,
 *     只靠色的话墨与紫在夜主题的卡片底上几乎一样(见 ui/worldMark 的注释);
 *   二 印不吃点击 —— 它挂在界域卡标题行里,挡住的将是整张卡的展开区;
 *   三 界域名仍是一段真文字 —— 印是装饰,不能把可读信息换成一张图;
 *   四 飞升弹窗里那一段真的在三样事实之外没多写一个字。
 *
 * 用法(需先 `bun run build`):
 *   bun scripts/world-check.mjs
 *
 * 需要一份后期存档:界域谱要能翻到四个界域,空档只停在炼气。
 */
import { chromium } from 'playwright'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lateSlices, seedSave } from './lib/saveFixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const VIEWPORT = { width: 375, height: 812 }

const failures = []
const fail = msg => failures.push(msg)

const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--disable-dev-shm-usage']
})

async function open(route) {
  const context = await browser.newContext({ viewport: VIEWPORT })
  // 外域一律拦掉:index.html 里有 sdk.51.la,不拦会让 goto(load) 等它超时
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, lateSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`运行时异常:${e.message}`))
  await page.goto(`${INDEX}#${route}`, { waitUntil: 'domcontentloaded' })
  // 后期档进来会先弹一串成就 toast,等它们散尽再量(它们的层级压在页面之上,会挡命中测试)
  await page.waitForTimeout(4200)
  return { page, context }
}

// ============ 一、界域谱上的四枚印 ============

{
  const { page, context } = await open('/codex')
  const seals = page.locator('.world-seal-mark')
  const n = await seals.count()
  if (n !== 4) fail(`界域谱上应有 4 枚印,实有 ${n}`)

  const info = await page.evaluate(() =>
    [...document.querySelectorAll('.world-seal-mark')].map(el => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        text: (el.textContent || '').trim(),
        frame: [...el.classList].find(c => c.startsWith('world-seal-mark--')) ?? '',
        radius: cs.borderRadius,
        borderWidth: cs.borderTopWidth,
        insets: (cs.boxShadow.match(/inset/g) ?? []).length,
        color: cs.color,
        pointerEvents: cs.pointerEvents,
        ariaHidden: el.getAttribute('aria-hidden'),
        w: r.width,
        h: r.height
      }
    })
  )

  if (info.length === 4) {
    const texts = info.map(s => s.text)
    if (new Set(texts).size !== 4) fail(`四枚印的单字有重复:${texts.join('')}`)
    for (const t of texts) if ([...t].length !== 1) fail(`印面应是一个字,读到「${t}」`)

    const frames = info.map(s => s.frame)
    if (new Set(frames).size !== 4) fail(`四种框形没有全用上:${frames.join(' ')}`)
    // 形状要真的不同,不是同一个类换名字
    const shapes = info.map(s => `${s.radius}|${s.borderWidth}|${s.insets}`)
    if (new Set(shapes).size !== 4) fail(`框形的实际样式有重复:${shapes.join(' / ')}`)
    // 圆印必须真的圆
    const round = info.find(s => s.frame.includes('round'))
    if (!round || !round.radius.includes('999px')) fail('圆印不是圆的 —— 它与方印在形状上没有差别')
    // 粗线必须真的更粗
    const bold = info.find(s => s.frame.includes('bold'))
    if (!bold || Number.parseFloat(bold.borderWidth) < 2) fail(`粗线印的边只有 ${bold?.borderWidth}`)
    // 双线必须真有两道
    const double = info.find(s => s.frame.includes('double'))
    if (!double || double.insets < 2) fail(`双线印只有 ${double?.insets} 道内影`)

    for (const s of info) {
      if (s.pointerEvents !== 'none') fail(`印「${s.text}」吃了指针事件 —— 它挂在整张界域卡的标题行里`)
      if (s.ariaHidden !== 'true') fail(`印「${s.text}」没有 aria-hidden —— 读屏会把单字再念一遍`)
      if (s.w < 16 || s.h < 16) fail(`印「${s.text}」只有 ${s.w}×${s.h},小到读不出框形`)
    }

    // 色必须两两不同(框形是主判据,色是辅助;两者一起才够)
    if (new Set(info.map(s => s.color)).size !== 4) fail(`四枚印的色有重复:${info.map(s => s.color).join(' / ')}`)
  }

  // 界域名仍是真文字 —— 印不能把可读信息替成一张图
  const names = await page.evaluate(() => ['人间界', '仙界', '神界', '混沌海'].filter(n => document.body.innerText.includes(n)))
  if (names.length !== 4) fail(`界域名在正文里只剩 ${names.length}/4:${names.join('、') || '一个都没有'}`)

  // 不吃点击:印的中心点命中不该是它自己
  const hit = await page.evaluate(() => {
    const el = document.querySelector('.world-seal-mark')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { tag: top?.tagName ?? '', isSeal: top === el || el.contains(top) }
  })
  if (hit?.isSeal) fail('印的中心点命中的是它自己 —— 它把点击吃掉了')

  await context.close()
}

// ============ 二、历练页的分组也挂同一枚 ============

{
  const { page, context } = await open('/adventure')
  const n = await page.locator('.world-seal-mark').count()
  // 历练页按界域分组,后期档会看到不止一组
  if (n < 1) fail('历练页的界域分组没有挂界域印')
  await context.close()
}

// ============ 三、飞升跃升那一段 ============

{
  const { page, context } = await open('/cultivation')
  const ok = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const ui = pinia?._s?.get('ui')
    if (!ui) return false
    const world = (id, name, seal, frame, tone) => ({ id, name, seal, frame, tone, label: name })
    ui.breakthrough = {
      success: true,
      fromLabel: '渡劫 · 九层',
      toLabel: '真仙',
      isMajor: true,
      tribulationLog: ['乌云压顶,真仙劫将至。青雷之劫,共 4 道。', '第 1 道天雷落下,你咬牙硬撼,气血余 88%。'],
      message: '已入仙界。寿元增至 1亿载。',
      leap: {
        from: world('mortal', '人间界', '凡', 'single', 'var(--color-ink)'),
        to: world('immortal', '仙界', '仙', 'double', 'var(--color-gold-ink)'),
        factor: 102
      }
    }
    return true
  })
  if (!ok) {
    fail('取不到 ui store —— 应用实例或 pinia 的挂载路径变了')
  } else {
    await page.waitForSelector('.world-leap', { timeout: 4000 }).catch(() => fail('飞升跃升段没有画出来'))
    const leap = await page.evaluate(() => {
      const el = document.querySelector('.world-leap')
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
        seals: el.querySelectorAll('.world-seal-mark').length,
        aria: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        pointerEvents: cs.pointerEvents,
        width: el.getBoundingClientRect().width
      }
    })
    if (leap) {
      if (leap.seals !== 2) fail(`跃升段该有两枚界域印,实有 ${leap.seals}`)
      if (leap.role !== 'img') fail('跃升段没有 role=img —— aria-label 接不住')
      if (!leap.aria || !leap.aria.includes('人间界') || !leap.aria.includes('仙界')) {
        fail(`跃升段的读屏说法缺界域名:${leap.aria}`)
      }
      if (!leap.aria || !leap.aria.includes('102')) fail(`跃升段的读屏说法缺倍数:${leap.aria}`)
      if (leap.pointerEvents !== 'none') fail('跃升段吃了指针事件')
      for (const word of ['请', '可以', '建议', '恭喜', '快去', '终于']) {
        if (leap.text.includes(word)) fail(`跃升段里出现了「${word}」—— 那是劝导,不是状态`)
      }
      // 三样事实都在:来处、去处、倍数
      if (!leap.text.includes('人间界') || !leap.text.includes('仙界')) fail(`跃升段缺界域名:${leap.text}`)
      if (!leap.text.includes('102')) fail(`跃升段缺倍数:${leap.text}`)
    }
    // 非飞升的突破不许有这一段
    await page.evaluate(() => {
      const ui = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui')
      ui.breakthrough = {
        success: true,
        fromLabel: '金丹 · 三层',
        toLabel: '金丹 · 四层',
        isMajor: false,
        tribulationLog: [],
        message: ''
      }
    })
    await page.waitForTimeout(400)
    const leftover = await page.locator('.world-leap').count()
    if (leftover !== 0) fail('小进阶的突破弹窗里也出现了跃升段 —— 每一境都叫跃升,这个词就不再是跃升')
  }
  await context.close()
}

await browser.close()

if (failures.length) {
  console.error('\n界域印记实测:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('界域印记实测通过:四枚印形状两两不同、不吃点击、界域名仍是文字;跃升段三样事实齐全、非飞升不出现')
