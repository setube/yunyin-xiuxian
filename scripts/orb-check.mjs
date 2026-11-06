/**
 * 法球的界域形制实测。
 *
 * 单测能证明「形态表对」「组件按形态生成」;它证明不了的是:
 *   一 页面上真的画出了对应圈数的环与对应粒数的点 —— 模板里 v-for 写对了不等于 DOM 里有;
 *   二 四界的法球**在真实渲染下**两两不同 —— 环的 inset 若都写成同一个值,
 *      DOM 里有四圈、画面上还是一圈;
 *   三 八卦环真的会消失,而不是被 CSS 藏起来;
 *   四 法球仍不吃点击(它是首页正中那块最大面积的装饰)。
 *
 * 用法(需先 `bun run build`):
 *   bun scripts/orb-check.mjs
 *
 * 需要一份后期存档:人间界的法球与混沌海的法球要能同屏比。
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
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, lateSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`运行时异常:${e.message}`))
  await page.goto(`${INDEX}#${route}`, { waitUntil: 'domcontentloaded' })
  // 后期档会先弹一串成就 toast,等它们散尽再量
  await page.waitForTimeout(4200)
  return { page, context }
}

/** 量一颗法球的形态;room 是「画面里看得出几层」的实际几何 */
async function readOrb(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.orb-root')
    if (!root) return null
    const k = root.querySelector.bind(root)
    const rings = [...root.querySelectorAll('.rot-ring')].map(el => {
      const cs = getComputedStyle(el)
      return {
        cls: el.className,
        // inset 各圈不同才算「画得出来四圈」:同一个 inset 叠成一条线
        top: cs.top,
        color: cs.borderTopColor,
        opacity: cs.opacity
      }
    })
    const particles = root.querySelectorAll('.orb-particle').length
    const bagua = root.querySelectorAll('.bagua-sym').length
    const glyph = (root.querySelector('.orb-icon')?.textContent || '').trim().slice(0, 2)
    // 装饰层一律不吃点击;法球中心本身也落在装饰格子里,不该有可交互元素
    const decorative = ['particle-ring', 'ring-layer', 'inner-orbit-ring', 'bagua-wrap', 'progress-svg', 'orb-icon']
    const eating = decorative.filter(c => {
      const el = root.querySelector(`.${c}`)
      return el && getComputedStyle(el).pointerEvents !== 'none'
    })
    const r = root.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const interactive = !!hit && !!hit.closest('button, a, input, select, textarea, [role="button"]')
    return {
      rings: rings.length,
      insets: rings.map(x => x.top),
      colors: rings.map(x => x.color),
      particles,
      bagua,
      glyph,
      eating,
      interactive
    }
  })
}

// ============ 一、后期档(神人境)的法球 ============

{
  const { page, context } = await open('/')
  const orb = await readOrb(page)
  if (!orb) {
    fail('首页找不到 .orb-root —— 法球没画出来')
  } else {
    // 神人境(14)= 神界:3 圈、16 粒、无八卦
    if (orb.rings !== 3) fail(`神人境该有 3 圈光环,实有 ${orb.rings}`)
    if (orb.particles !== 16) fail(`神人境该有 16 粒外圈粒子,实有 ${orb.particles}`)
    if (orb.bagua !== 0) fail(`出了人间界还挂着 ${orb.bagua} 个八卦符号`)
    if (new Set(orb.insets).size !== orb.rings) {
      fail(`三圈光环的 inset 有重复:${orb.insets.join(' / ')} —— 叠在一起等于只有一圈`)
    }
    if (new Set(orb.colors).size !== orb.rings) {
      fail(`三圈光环的色有重复:${orb.colors.join(' / ')}`)
    }
    // 神人境的中心符当是「神」:中心符随界域走
    if (orb.glyph !== '神') fail(`神人境的法球中心符读作「${orb.glyph}」,该是「神」`)
    if (orb.eating.length) fail(`这些装饰层没有 pointer-events: none:${orb.eating.join(' / ')}`)
    if (orb.interactive) fail('法球中心点压在了一个可交互元素上 —— 装饰挡了按钮')
  }
  await context.close()
}

// ============ 二、四界同屏比:逐个境界改档,量法球 ============

/**
 * 直接改 player store 的境界,再量法球。
 * 走 store 而不是重开页面:法球的形态是渲染期算的,改档到重绘之间只隔一个 tick。
 */
{
  const { page, context } = await open('/cultivation')
  // 先确认修炼页也有法球
  const hasOrb = await page.locator('.orb-root').count()
  if (hasOrb === 0) fail('修炼页没有法球')

  const rows = await page.evaluate(async () => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const player = pinia?._s?.get('player')
    if (!player) return null
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const out = []
    // 四界的入口境:炼气 0 / 真仙 9 / 神人 14 / 混沌真灵 18
    for (const major of [0, 9, 14, 18]) {
      player.$patch({ major, sub: 0 })
      await sleep(220)
      const root = document.querySelector('.orb-root')
      if (!root) return null
      out.push({
        major,
        rings: root.querySelectorAll('.rot-ring').length,
        particles: root.querySelectorAll('.orb-particle').length,
        bagua: root.querySelectorAll('.bagua-sym').length,
        glyph: (root.querySelector('.orb-icon')?.textContent || '').trim().slice(0, 2),
        insets: [...root.querySelectorAll('.rot-ring')].map(el => getComputedStyle(el).top)
      })
    }
    return out
  })

  if (!rows) {
    fail('取不到 player store —— 应用实例或 pinia 的挂载路径变了')
  } else {
    const want = [
      { major: 0, rings: 1, particles: 8, bagua: 8, glyph: '道' },
      { major: 9, rings: 2, particles: 12, bagua: 0, glyph: '仙' },
      { major: 14, rings: 3, particles: 16, bagua: 0, glyph: '神' },
      { major: 18, rings: 4, particles: 24, bagua: 0, glyph: '混' }
    ]
    for (const w of want) {
      const got = rows.find(r => r.major === w.major)
      if (!got) {
        fail(`量不到第 ${w.major} 境的法球`)
        continue
      }
      if (got.rings !== w.rings) fail(`第 ${w.major} 境该有 ${w.rings} 圈,实有 ${got.rings}`)
      if (got.particles !== w.particles) fail(`第 ${w.major} 境该有 ${w.particles} 粒,实有 ${got.particles}`)
      if (got.bagua !== w.bagua) fail(`第 ${w.major} 境该有 ${w.bagua} 个八卦符号,实有 ${got.bagua}`)
      if (got.glyph !== w.glyph) fail(`第 ${w.major} 境的中心符读作「${got.glyph}」,该是「${w.glyph}」`)
      if (new Set(got.insets).size !== got.rings) {
        fail(`第 ${w.major} 境的 ${got.rings} 圈 inset 有重复:${got.insets.join(' / ')}`)
      }
    }
    // 四态必须两两不同:环数 + 粒数 + 卦数 三样合起来是可以数的
    const keys = rows.map(r => `${r.rings}/${r.particles}/${r.bagua}`)
    if (new Set(keys).size !== rows.length) fail(`四界法球有重复形态:${keys.join(' · ')}`)
  }
  await context.close()
}

await browser.close()

if (failures.length) {
  console.error('\n法球形制实测:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('法球形制实测通过:四界环数 1/2/3/4、粒子 8/12/16/24、八卦环只在人间界,各圈 inset 与色互不相同')
