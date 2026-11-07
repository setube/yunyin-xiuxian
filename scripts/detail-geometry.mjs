/**
 * 装备详情页脚的几何实测。
 *
 * 单测只能证明「源码里价签没挂在钮里」「两态都写了 min-h-11」(见 src/ui/confirmGeometry.spec);
 * 它证明不了的是:真渲染出来两态是不是同一个高度。类写对了、@click 写对了,
 * 只要分栏与换行不同,钮照样会忽大忽小 —— 那正是玩家报的那件事。
 *
 * 这条实测量四件事:
 *   一 重铸钮在「未确认 → 确认 → 退一步」三态下的宽高完全一致;
 *   二 页脚总高与正文滚动盒高度在三态下不变(页脚一变高,正文就缩一截);
 *   三 分解二步确认也不改页脚高度;
 *   四 没有任何按钮正文被折成竖排(320 宽下「重铸词条」曾被压成一行一个字)。
 *
 * 用法(需先 `bun run build`):
 *   node scripts/detail-geometry.mjs            # 375 + 320 两档
 *   node scripts/detail-geometry.mjs --shots    # 另存图到 /tmp/detail-geometry
 *
 * 挂档:用 lateSlices 改出「一件四条词条、已封一条」的后期档 ——
 * 封一条才会同时出现重铸与封存两个价签,那是挤出竖直排的那一档。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedSave } from './lib/saveFixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const SHOTS = process.argv.includes('--shots')
const SHOTS_DIR = '/tmp/detail-geometry'

const failures = []
const fail = msg => failures.push(msg)

const browser = await chromium.launch({
  // 容器里 headless 常崩:与 layout-check / ui-smoke 同一套参数
  args: [
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--host-resolver-rules=MAP sdk.51.la ~NOTFOUND'
  ]
})

const gn = (m, e) => ({ m, e })

/** 后期档:一件天品武器,四条词条、已封一条 —— 重铸与封存两个价签同时在 */
function slices() {
  return {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '几何自检', major: 14, sub: 0, exp: gn(0, 0), age: 3000, lifespanBonusYears: 0, dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 88 }], gradeName: '单灵根', growthMult: 1.4 }
    },
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 900, page: 300, dust: 50000 },
    inventory: {
      items: [{
        uid: 'geo_w', templateId: 'w_zidian', quality: 'heaven', tier: 20, level: 3,
        affixes: [
          { id: 'bs3', roll: 0.9 },
          { id: 'low2', roll: 0.6 },
          { id: 'atk1', roll: 0.4 },
          { id: 'hp1', roll: 0.2 }
        ],
        sealedAffixIds: ['hp1'],
        reforgeCount: 7
      }],
      equipped: {},
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    endgame: { daoPath: 'sword', daoSource: 100, souls: [], equippedSouls: [] },
    settings: {
      privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true,
      battleSpeed: 4, decomposeRanks: [],
      smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
      theme: 'dark'
    }
  }
}

/** 页脚读数:总高、正文盒高、每颗钮的宽高与所属行 */
async function readFooter(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.modal-panel')
    if (!panel) return null
    const footer = panel.querySelector('footer')
    const body = panel.querySelector('[data-modal-body]')
    const box = el => {
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
    }
    /* 一行一行分组:同一行里钮的 top 相同。报错时要能说出「哪一行第几颗」 */
    const rows = []
    for (const row of footer.querySelectorAll('div')) {
      const btns = [...row.querySelectorAll(':scope > button')]
      if (btns.length === 0) continue
      rows.push({
        key: btns.map(b => (b.textContent || '').trim().replace(/\s+/g, ' ') || '(图标)').join(' | '),
        btns: btns.map(b => ({ name: (b.textContent || '').trim().replace(/\s+/g, ' ') || '(图标)', ...box(b) }))
      })
    }
    return {
      footerH: Math.round(footer.getBoundingClientRect().height * 10) / 10,
      bodyH: body ? Math.round(body.clientHeight * 10) / 10 : null,
      panelW: Math.round(panel.getBoundingClientRect().width * 10) / 10,
      rows
    }
  })
}

/** 一颗钮是否被折成竖排:正文宽 < 40 且高 > 2.5 行 */
async function verticalButtons(page) {
  return page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.modal-panel footer button, .modal-panel button[title^="查看"]')) {
      const text = (el.textContent || '').trim()
      if (text.length < 3) continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.width >= 40) continue
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16
      if (r.height > lineHeight * 2.5) out.push(`${Math.round(r.width)}px 宽 «${text.slice(0, 10)}»`)
    }
    return out
  })
}

async function run(width, height) {
  const tag = `${width}`
  const context = await browser.newContext({ viewport: { width, height } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, slices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[${tag}] 运行时异常:${e.message}`))

  await page.goto(`${INDEX}#/inventory`, { waitUntil: 'load' })
  await page.waitForTimeout(1600)
  // 后期档进来会先弹一串成就 toast;钉死 Math.random 免得引擎每秒再掷一个
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  const card = page.locator('main .aspect-square').first()
  if ((await card.count()) === 0) {
    fail(`[${tag}] 行囊页没有装备格,判据没跑到东西`)
    await context.close()
    return
  }
  await card.click()
  await page.waitForTimeout(600)

  const rest = await readFooter(page)
  if (!rest) {
    fail(`[${tag}] 装备详情没打开`)
    await context.close()
    return
  }
  if (SHOTS) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    await page.locator('.modal-panel').screenshot({ path: join(SHOTS_DIR, `detail-${tag}-rest.png`) })
  }

  // 一、重铸钮:未确认态
  const reforgeRow = rest.rows.find(r => r.key.includes('重铸词条'))
  if (!reforgeRow) fail(`[${tag}] 页脚里找不到「重铸词条」那一行(价签没渲染?判据没跑到东西)`)
  const restReforge = reforgeRow?.btns.find(b => b.name === '重铸词条')

  // 二、点开确认态
  const entry = page.locator('.modal-panel footer button', { hasText: '重铸词条' }).first()
  if ((await entry.count()) === 0) {
    fail(`[${tag}] 找不到重铸入口钮`)
  } else if (await entry.isDisabled()) {
    fail(`[${tag}] 后期档里重铸入口是禁用的,量不到两态(夹具资源不够?)`)
  } else {
    await entry.click()
    await page.waitForTimeout(400)
    const armed = await readFooter(page)
    if (SHOTS) await page.locator('.modal-panel').screenshot({ path: join(SHOTS_DIR, `detail-${tag}-armed.png`) })

    // 1. 钮宽高一致。行宽(142.5 ↔ 144)会因两态文字不同差零点几像素,不算抖动;
    //    高度必须完全相同 —— 钮变高就是页脚变高
    const armedRow = armed?.rows.find(r => r.btns.some(b => b.name === '确认重铸'))
    const armedBtn = armedRow?.btns.find(b => b.name === '确认重铸')
    if (!armedBtn) fail(`[${tag}] 确认态里找不到「确认重铸」钮`)
    else if (restReforge) {
      if (Math.abs(armedBtn.h - restReforge.h) > 0.5) {
        fail(`[${tag}] 重铸钮点前点后高度变了:${restReforge.h} → ${armedBtn.h}px`)
      }
      if (Math.abs(armedBtn.w - restReforge.w) > 4) {
        fail(`[${tag}] 重铸钮点前点后宽度变了 ${(restReforge.w - armedBtn.w).toFixed(1)}px:${restReforge.w} → ${armedBtn.w}`)
      }
    }
    // 2. 页脚与正文盒不变高
    if (armed && Math.abs(armed.footerH - rest.footerH) > 0.5) {
      fail(`[${tag}] 重铸确认态把页脚撑高了:${rest.footerH} → ${armed.footerH}px`)
    }
    if (armed && rest.bodyH !== null && armed.bodyH !== null && Math.abs(armed.bodyH - rest.bodyH) > 0.5) {
      fail(`[${tag}] 重铸确认态把正文滚动盒压扁了:${rest.bodyH} → ${armed.bodyH}px`)
    }
    // 3. 退一步之后回到原样
    const back = page.locator('.modal-panel footer button', { hasText: '再想想' }).first()
    if ((await back.count()) > 0) {
      await back.click()
      await page.waitForTimeout(350)
      const after = await readFooter(page)
      if (after && Math.abs(after.footerH - rest.footerH) > 0.5) {
        fail(`[${tag}] 退一步之后页脚没回到原高:${rest.footerH} → ${after.footerH}px`)
      }
    } else fail(`[${tag}] 确认态里找不到「再想想」`)
  }

  // 四、竖排
  const vertical = await verticalButtons(page)
  if (vertical.length) fail(`[${tag}] 有按钮被折成竖排:${vertical.join(' / ')}`)

  // 三、分解二步确认:页脚高度不变(未被装备时垃圾桶可点)
  const before = await readFooter(page)
  const trash = page.locator('.modal-panel footer button').last()
  if ((await trash.count()) > 0 && !(await trash.isDisabled())) {
    await trash.click()
    await page.waitForTimeout(400)
    const armed = await readFooter(page)
    if (SHOTS) await page.locator('.modal-panel').screenshot({ path: join(SHOTS_DIR, `detail-${tag}-decompose.png`) })
    if (armed && before && Math.abs(armed.footerH - before.footerH) > 0.5) {
      fail(`[${tag}] 分解确认态把页脚撑高了:${before.footerH} → ${armed.footerH}px`)
    }
    const v2 = await verticalButtons(page)
    if (v2.length) fail(`[${tag}] 分解确认态有按钮被折成竖排:${v2.join(' / ')}`)
  }

  await context.close()
}

await run(375, 812)
await run(320, 568)
await browser.close()

if (failures.length) {
  console.error('\n装备详情页脚几何:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('装备详情页脚几何通过:重铸/分解两态同高同宽,页脚与正文盒不动,无竖排按钮')
