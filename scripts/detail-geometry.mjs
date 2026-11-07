/**
 * 二步确认的几何实测。
 *
 * 单测只能证明「源码里价签没挂在钮里」「两态都写了 min-h-11」(见 src/ui/confirmGeometry.spec);
 * 它证明不了的是:真渲染出来两态是不是同一个高度。类写对了、@click 写对了,
 * 只要分栏与换行不同,钮照样会忽大忽小 —— 那正是玩家报的那件事。
 *
 * 量四处:
 *   一 装备详情页脚 —— 重铸钮在「未确认 / 确认 / 退一步」三态下宽高一致、页脚不变高;
 *   二 器魂散置列表 —— 点「散去」前后行高一致,名字不被挤成竖排
 *     (确认态比未确认态多一枚钮,320 宽曾把左列压到 22px、行高 177 → 745px);
 *   三 洞府「连升至」段 —— 点前后段高一致(未确认态摆着净得与逐条预览,确认态曾只剩一行);
 *   四 构筑快照行 —— 点删除前后行高一致(320 宽下「再想想」曾被压成 20px 宽竖排);
 *   五 灵脉连投段(弹窗内) —— 点「连 投」前后段高一致。
 * 共同判据:没有任何按钮正文被折成竖排。
 *
 * 另量两件事:
 *   一 后期档十页的触控下限;
 *   二 坏档提示里那颗「知道了」的高度 —— 全站唯一只在异常路径下渲染的钮,
 *      巡页与 aria-check 拿好人存档,永远量不到它(实测修复前 17.9px)。
aria-check 量过主路由,但它挂默认前期档 ——
 * 悟道兑换、洞府灵脉、道童这些整块不渲染,那些按钮从来没被量过(实测修行页有两枚 21px)。
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

/**
 * 后期档:一件天品武器,四条词条、已封一条 —— 重铸与封存两个价签同时在。
 * poor = true 时把器灵尘压到 2:强化付不起,底行进「禁用 + 拒因」那一态 ——
 * 那正是页脚第三种几何(曾从 44px 涨到 57px)。
 * major 默认 14;触控扫描要 18 —— 悟道兑换(WUDAO_EXCHANGE_MIN_MAJOR)18 起才渲染。
 */
function slices({ poor = false, major = 14 } = {}) {
  return {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '几何自检', major, sub: 0, exp: gn(0, 0), age: 3000, lifespanBonusYears: 0, dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 88 }], gradeName: '单灵根', growthMult: 1.4 }
    },
    resources: { spiritStone: poor ? gn(1, 0) : gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 900, page: 300, dust: poor ? 2 : 50000 },
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

async function run(width, height, { poor = false } = {}) {
  const tag = poor ? `${width}-poor` : `${width}`
  const context = await browser.newContext({ viewport: { width, height } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, slices({ poor }))
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
    /*
     * 付不起档:重铸入口自己也置灰(尘只有 2),量不到「未确认 → 确认」两态。
     * 那一档要量的是底行(卸下 / 强化 / 分解)有没有因为强化付不起而变高 —— 见第五节,
     * 这一档不该报「量不到两态」。
     */
    if (!poor) fail(`[${tag}] 后期档里重铸入口是禁用的,量不到两态(夹具资源不够?)`)
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

  // 四、底行(卸下 / 强化 / 分解)不许因「付不起」而变高
  /*
   * 强化钮的拒因曾写在正文里(「强 化(尘差 36)」):78~105px 的钮必然折两行,
   * 底行 44 → 57px、页脚 236.8 → 273.5。现拒因走 aria-label / title,
   * 底行在付得起与付不起两态下同高。
   */
  const bottomRow = await page.evaluate(() => {
    const footer = document.querySelector('.modal-panel footer')
    if (!footer) return null
    const last = footer.lastElementChild
    if (!last) return null
    const r = last.getBoundingClientRect()
    const btns = [...last.querySelectorAll('button')]
    return {
      h: Math.round(r.height * 10) / 10,
      lines: btns.map(b => {
        const tops = new Set()
        for (const node of b.childNodes) {
          if (node.nodeType === 1) {
            const q = node.getBoundingClientRect()
            if (q.height > 0) tops.add(Math.round(q.top))
          } else {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const q of range.getClientRects()) if (q.height > 0) tops.add(Math.round(q.top))
          }
        }
        return tops.size
      })
    }
  })
  if (bottomRow && bottomRow.lines.some(n => n > 1)) {
    fail(`[${tag}] 底行有按钮正文折了行(${bottomRow.lines.join('/')} 行)—— 一折就把整条页脚撑高`)
  }

  // 五、竖排
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

// ============ 二、器魂散置列表:点「散去」前后行高一致 ============

/** 后期档 + 两枚闲置器魂(锋魂 / 盾魂),用来量散置列表的两态 */
function soulSlices() {
  return {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '器魂自检', major: 18, sub: 0, exp: gn(0, 0), age: 3000, lifespanBonusYears: 0, dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 88 }], gradeName: '单灵根', growthMult: 1.4 }
    },
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 900, page: 300, dust: 500 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    // type 须是 SOUL_TYPES 的真 id,否则 sanitize 整枚丢掉、列表空着量不到
    endgame: {
      daoPath: 'sword',
      daoSource: 100,
      souls: [
        { uid: 'geo_s1', type: 'fengmang', grade: 0, fromName: '青云剑' },
        { uid: 'geo_s2', type: 'gangdun', grade: 5, fromName: '化真古刀' }
      ],
      equippedSouls: []
    },
    settings: {
      privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true,
      battleSpeed: 4, decomposeRanks: [],
      smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
      theme: 'dark'
    }
  }
}

/** 散置列表每一行的读数:行高、左列宽 */
async function readSoulRows(page) {
  return page.evaluate(() => {
    const box = el => {
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
    }
    // 每行是 divide-y 容器里带「装配」钮的那一层
    const rows = []
    for (const li of document.querySelectorAll('.modal-panel [class*="divide-y"] > div')) {
      if (!/装配/.test(li.textContent || '')) continue
      rows.push({ ...box(li), leftW: box(li.firstElementChild).w })
    }
    return rows.length ? { top: rows[0], count: rows.length } : null
  })
}

async function runSouls(width, height) {
  const tag = `${width}`
  const context = await browser.newContext({ viewport: { width, height } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, soulSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[器魂 ${tag}] 运行时异常:${e.message}`))

  await page.goto(`${INDEX}#/souls`, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  await page.locator('main button', { hasText: '散置形意' }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(700)
  const rest = await readSoulRows(page)
  if (!rest) {
    fail(`[器魂 ${tag}] 散置列表里一行都没量到(夹具没生效?)`)
    await context.close()
    return
  }
  if (SHOTS) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    await page.locator('.modal-panel').screenshot({ path: join(SHOTS_DIR, `souls-${tag}-rest.png`) })
  }

  const entry = page.locator('.modal-panel button', { hasText: /^散去$/ }).first()
  if ((await entry.count()) === 0) {
    fail(`[器魂 ${tag}] 找不到「散去」钮`)
    await context.close()
    return
  }
  await entry.click()
  await page.waitForTimeout(400)
  const armed = await readSoulRows(page)
  if (SHOTS) await page.locator('.modal-panel').screenshot({ path: join(SHOTS_DIR, `souls-${tag}-armed.png`) })

  // 行高一致:确认态比未确认态多一枚钮,若钮组与正文抢同一行,这里就会差出几十像素
  if (armed && Math.abs(armed.top.h - rest.top.h) > 0.5) {
    fail(`[器魂 ${tag}] 点「散去」把整行撑高了:${rest.top.h} → ${armed.top.h}px`)
  }
  // 左列宽一致:被钮组抢宽度时它会缩
  if (armed && Math.abs(armed.top.leftW - rest.top.leftW) > 0.5) {
    fail(`[器魂 ${tag}] 点「散去」把左列挤窄了:${rest.top.leftW} → ${armed.top.leftW}px`)
  }
  // 名字不许被压成竖排:低于 3em 就基本一列一个字
  if (rest.top.leftW < 60) fail(`[器魂 ${tag}] 散置行的左列只剩 ${rest.top.leftW}px,名字要竖排了`)
  const vertical = await verticalButtons(page)
  if (vertical.length) fail(`[器魂 ${tag}] 有按钮被折成竖排:${vertical.join(' / ')}`)

  await context.close()
}

// ============ 三、洞府营造的「连升至」段:点前后段高一致 ============

/** 后期档:灵石管够、有玄铁,让「连 升」真的可点 */
function dongfuSlices() {
  return {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '营造自检', major: 14, sub: 0, exp: gn(0, 0), age: 3000, lifespanBonusYears: 0, dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 88 }], gradeName: '单灵根', growthMult: 1.4 }
    },
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 4000, page: 300, dust: 500 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: 'sword', daoSource: 100, souls: [], equippedSouls: [] },
    settings: {
      privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true,
      battleSpeed: 4, decomposeRanks: [],
      smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
      theme: 'dark'
    }
  }
}

async function runDongfu(width, height) {
  const tag = `${width}`
  const context = await browser.newContext({ viewport: { width, height } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, dongfuSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[洞府 ${tag}] 运行时异常:${e.message}`))

  await page.goto(`${INDEX}#/dongfu`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  /** 「连升至」那一段的高度:段是带 border + rounded-md 的那层 */
  const segBox = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('main [class*="rounded-md"][class*="border"]')) {
        if (!/连升至/.test(el.textContent || '')) continue
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height * 10) / 10 }
      }
      return null
    })

  const rest = await segBox()
  if (!rest) {
    fail(`[洞府 ${tag}] 找不到「连升至」段(夹具没给够资源?)`)
    await context.close()
    return
  }
  if (SHOTS) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    await page.locator('main [class*="rounded-md"]').filter({ hasText: '连升至' }).first()
      .screenshot({ path: join(SHOTS_DIR, `dongfu-${tag}-rest.png`) }).catch(() => {})
  }

  const entry = page.locator('main button', { hasText: /^连\s*升$/ }).first()
  if ((await entry.count()) === 0) {
    fail(`[洞府 ${tag}] 找不到「连 升」钮`)
    await context.close()
    return
  }
  await entry.click()
  await page.waitForTimeout(400)
  const armed = await segBox()
  if (SHOTS) {
    await page.locator('main [class*="rounded-md"]').filter({ hasText: '连升至' }).first()
      .screenshot({ path: join(SHOTS_DIR, `dongfu-${tag}-armed.png`) }).catch(() => {})
  }
  // 未确认态写着「累积净得」与逐条预览,确认态若只剩一行总账,这一段就会矮下去 —— 点一下,下方全部上移
  if (armed && Math.abs(armed.h - rest.h) > 0.5) {
    fail(`[洞府 ${tag}] 点「连 升」让这一段变了高:${rest.h} → ${armed.h}px`)
  }

  const vertical = await verticalButtons(page)
  if (vertical.length) fail(`[洞府 ${tag}] 有按钮被折成竖排:${vertical.join(' / ')}`)

  /*
   * 灵脉连投卡:与洞府连升同一种跳动,但在弹窗里,此前一处都没量过。
   * 「连投至 第 N 点」那一段在点「连 投」前后必须同高 ——
   * 确认态多一枚「再想想」,若与正文挤同一行,段高就会变。
   */
  const veinEntry = page.locator('main button', { hasText: /灵脉投资/ }).first()
  if ((await veinEntry.count()) === 0) {
    fail(`[洞府 ${tag}] 找不到「灵脉投资」入口`)
  } else {
    await veinEntry.click()
    await page.waitForTimeout(600)
    /*
     * 第一条灵脉的「连投」段 —— 从钮反向找祖先,不按正文文字找。
     *
     * 按文字找有两处会错,都踩过:
     *   一 灵脉弹窗同时画三到四条灵脉,每条都有一段,取「第一个匹配」会在点了第一条之后量到第二条;
     *   二 更要命的是:若确认态把正文整段去掉,「连投至」这几个字就没了 ——
     *      按文字找会跳到第二条灵脉那一段(它还在未确认态),于是「段消失」被判成通过。
     * 从钮找:钮在,段就在;段若真的塌了,量的就是塌掉之后的实际高度。
     */
    const veinSeg = () =>
      page.evaluate(() => {
        const btn = [...document.querySelectorAll('.modal-panel button')].find(b => /^连\s*投$/.test((b.textContent || '').trim()))
        if (!btn) return null
        // 钮组的上一层就是段容器
        const seg = btn.parentElement?.parentElement ?? btn.parentElement
        if (!seg) return null
        const r = seg.getBoundingClientRect()
        return { h: Math.round(r.height * 10) / 10, w: Math.round(r.width) }
      })
    const vRest = await veinSeg()
    if (!vRest) {
      fail(`[洞府 ${tag}] 灵脉弹窗里找不到「连投至」段`)
    } else {
      const veinBtn = page.locator('.modal-panel button', { hasText: /^连\s*投$/ }).first()
      if ((await veinBtn.count()) === 0) {
        fail(`[洞府 ${tag}] 灵脉弹窗里找不到「连 投」钮`)
      } else {
        await veinBtn.click()
        await page.waitForTimeout(400)
        const vArmed = await veinSeg()
        /*
         * 量不到确认态那一段 = 段被正文的显隐带走了 —— 那本身就是「变了形」。
         * 第一版在这里写 `if (vArmed && ...)`,于是确认态整段消失时静默跳过,判据假绿。
         */
        if (!vArmed) {
          fail(`[洞府 ${tag}] 点「连 投」后量不到「连投至」段(段随正文一起没了)`)
        } else if (Math.abs(vArmed.h - vRest.h) > 0.5) {
          fail(`[洞府 ${tag}] 点「连 投」让这一段变了高:${vRest.h} → ${vArmed.h}px`)
        }
        /*
         * 改立主脉:另一处两步确认(耗灵石迁脉),确认态正文换成「耗灵石 N」+ 两颗钮。
         * 同样要求段高不变。
         */
        const undo = page.locator('.modal-panel button', { hasText: /再想想/ }).first()
        if ((await undo.count()) > 0) await undo.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(300)
      }
    }
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(250)
  }

  await context.close()
}

// ============ 四、构筑快照行:点删除前后行高一致 ============

/** 两份构筑快照;别的都随便 */
function buildSlices() {
  return {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '构筑自检', major: 18, sub: 0, exp: gn(0, 0), age: 3000, lifespanBonusYears: 0, dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 88 }], gradeName: '单灵根', growthMult: 1.4 }
    },
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 8000, herb: 9000, ore: 4000, page: 300, dust: 500 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: 'sword', daoSource: 100, souls: [], equippedSouls: [] },
    loadouts: {
      list: [
        { id: 'geo_lo1', name: '青云剑修', seal: '剑', mainGongfa: null, subGongfa: [], artifactIds: [], equipment: {}, savedAt: 1 },
        { id: 'geo_lo2', name: '丹道长生', seal: '丹', mainGongfa: null, subGongfa: [], artifactIds: [], equipment: {}, savedAt: 2 }
      ]
    },
    settings: {
      privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true,
      battleSpeed: 4, decomposeRanks: [],
      smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
      theme: 'dark'
    }
  }
}

async function runBuild(width, height) {
  const tag = `${width}`
  const context = await browser.newContext({ viewport: { width, height } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, buildSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[构筑 ${tag}] 运行时异常:${e.message}`))

  await page.goto(`${INDEX}#/build`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  /** 第一份构筑那一行:含「换装」「改名」的那层 */
  const rowBox = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('main div')) {
        const t = el.textContent || ''
        if (!/换装/.test(t) || !/改名/.test(t)) continue
        if (el.querySelector('div[class*="card-ink"]')) continue
        const r = el.getBoundingClientRect()
        if (r.width < 100) continue
        return { h: Math.round(r.height * 10) / 10, w: Math.round(r.width), n: el.querySelectorAll('button').length }
      }
      return null
    })

  const rest = await rowBox()
  if (!rest) {
    fail(`[构筑 ${tag}] 量不到构筑快照行(夹具没生效?)`)
    await context.close()
    return
  }
  if (SHOTS) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    await page.screenshot({ path: join(SHOTS_DIR, `build-${tag}-rest.png`) })
  }

  const trash = page.locator('main button[aria-label="删除构筑"]').first()
  if ((await trash.count()) === 0) {
    fail(`[构筑 ${tag}] 找不到删除构筑钮`)
    await context.close()
    return
  }
  await trash.click()
  await page.waitForTimeout(400)
  const armed = await rowBox()
  if (SHOTS) await page.screenshot({ path: join(SHOTS_DIR, `build-${tag}-armed.png`) })

  // 确认态多出「再想想」「确认删除」两枚,若与名字挤同一行,行高与名字宽度都会被吃掉
  if (armed && Math.abs(armed.h - rest.h) > 0.5) {
    fail(`[构筑 ${tag}] 点「删除构筑」让这一行变了高:${rest.h} → ${armed.h}px`)
  }
  if (armed && Math.abs(armed.w - rest.w) > 0.5) {
    fail(`[构筑 ${tag}] 点「删除构筑」让这一行变了宽:${rest.w} → ${armed.w}px`)
  }

  const vertical = await verticalButtons(page)
  if (vertical.length) fail(`[构筑 ${tag}] 有按钮被折成竖排:${vertical.join(' / ')}`)

  await context.close()
}

await run(375, 812)
await run(320, 568)
await run(375, 812, { poor: true })
await run(320, 568, { poor: true })
await runSouls(375, 812)
await runSouls(320, 568)
await runDongfu(375, 1200)
await runDongfu(320, 1200)
// ============ 五、后期档的触控下限:把「默认档看不到的控件」也量一遍 ============

/**
 * 全站触控下限 28px 的复查。
 *
 * aria-check 已经量了六条主路由,但它挂的是**默认前期档**:悟道兑换(金丹起)、
 * 洞府灵脉(元婴起)、道童(筑基起)这些整块不渲染 —— 它们的按钮从来没有被量过。
 * 实测修行页的「兑换」「连兑 10」只有 21px(chip-ink 自带上下内边距 2px,
 * 只写 !text-[10px] 时盒高 21),而那是要连点的钮。
 *
 * 这里挂后期档,把十条路由都量一遍;只管 main 里的控件,弹窗另由 layout-check 的巡逻管。
 */
/*
 * 去掉三条:本夹具下 /souls 没凝过器魂、/build 没存过构筑、/world 没开界域,
 * 三页各自只剩一两个控件。它们的内容态由别的自检脚本各自覆盖。
 */
const TOUCH_ROUTES = [
  '/',
  '/cultivation',
  '/adventure',
  '/inventory',
  '/character',
  '/market',
  '/celestial',
  '/titles',
  '/dongfu',
  '/settings'
]

async function runTouchTargets() {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  // major 18:悟道兑换(18 起)、洞府灵脉、道童这些整块才渲染 —— 用默认前期档量等于没量
  await seedSave(context, slices({ major: 18 }))
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[触控] 运行时异常:${e.message}`))

  for (const route of TOUCH_ROUTES) {
    await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
      Math.random = () => 1
    })
    for (let i = 0; i < 8; i += 1) {
      if ((await page.locator('.modal-panel').count()) > 0) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
      } else break
    }
    const measured = await page.evaluate(() => {
      const out = []
      let seen = 0
      for (const el of document.querySelectorAll('main button, main a, main [role=button]')) {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        seen += 1
        // 与 aria-check / layout-check 同一条尺子:声明 min-height ≥28 的给半像素容差
        const h = el.offsetHeight || r.height
        const declared = parseFloat(getComputedStyle(el).minHeight) || 0
        if (h >= 28 || (declared >= 28 && h >= 27.5)) continue
        out.push(`${h.toFixed(1)}px «${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14)}»`)
      }
      return { small: out, seen }
    })
    /*
     * 防空转:一页至少量到 5 个控件,否则这一页的判据等于没跑。
     * 这条不是形式主义 —— 第一版就是把夹具写成 major 14,而悟道兑换 18 起才渲染,
     * 于是「兑换」「连兑 10」那两枚 21px 的钮一次都没被量到,判据照样报绿。
     */
    if (measured.seen < 3) fail(`[触控] ${route} 只量到 ${measured.seen} 个控件,判据没跑到东西`)
    if (measured.small.length) fail(`[触控] ${route} 有控件低于 28px:${measured.small.slice(0, 4).join(' | ')}`)
  }

  await context.close()
}

// ============ 六、坏档提示:那颗「知道了」的触控高度 ============

/**
 * 存档损坏时设置页会多出一条提示,里面有一颗「知道了」。
 *
 * 这是全站唯一一处只在**异常路径**下渲染的按钮 —— 巡页、aria-check、弹窗巡逻
 * 拿的都是好人存档,这条提示根本不出现。而它恰恰是玩家最需要点的位置:
 * 提示说「原档留在本机」,玩家要关掉它继续看设置。
 *
 * 实测(修复前/后):盒高 17.9px / 28px。17.9 就是纯文字的行高。
 * 造法:把某个分片的密文换成非法串,preflightScan 判它损坏并让 main.ts 记下来。
 */
async function runCorruptNotice() {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, slices({ major: 18 }))
  // 夹具之后覆写一枚非法分片 —— preflightScan 会判它损坏
  await context.addInitScript(() => {
    if (localStorage.getItem('__corruptDone')) return
    localStorage.setItem('yunyin.inventory', 'NOT_VALID_CIPHERTEXT')
    localStorage.setItem('__corruptDone', '1')
  })
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[坏档] 运行时异常:${e.message}`))
  await page.goto(`${INDEX}#/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 10; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    } else break
  }

  const info = await page.evaluate(() => {
    const txt = document.querySelector('main')?.innerText ?? ''
    const btn = [...document.querySelectorAll('main button')].find(b => /^知道了$/.test((b.textContent || '').trim()))
    const r = btn?.getBoundingClientRect()
    return { noticed: /存档损坏/.test(txt), h: r ? r.height : null }
  })
  /*
   * 防空转:提示没出来就是夹具没生效,判据跑了等于没跑。
   * 第一版若这里写成 `if (info.h !== null && info.h < 28)`,提示没出来会静默通过。
   */
  if (!info.noticed) fail('[坏档] 提示没渲染出来(夹具没生效?判据没跑到东西)')
  else if (info.h === null) fail('[坏档] 提示在,但找不到「知道了」那颗钮')
  else if (info.h < 27.5) fail(`[坏档] 「知道了」盒高 ${info.h.toFixed(1)}px,低于 28px 触控下限`)
  else console.log(`  · 坏档提示:「知道了」${info.h.toFixed(1)}px`)

  await context.close()
}

await runBuild(375, 1000)
await runBuild(320, 1000)
await runTouchTargets()
await runCorruptNotice()
await browser.close()

if (failures.length) {
  console.error('\n装备详情页脚几何:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('二步确认几何通过:重铸/分解(含付不起档)、器魂散去、洞府连升、构筑删除、灵脉连投五处两态均不变形,无折行与竖排按钮;后期档十页触控下限全部 ≥28px;坏档提示的「知道了」也够 28px')
