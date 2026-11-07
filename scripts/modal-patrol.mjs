/**
 * 弹窗巡逻:逐扇推开、逐扇量。
 *
 * layout-check 里也有一段弹窗巡逻,但它只开四扇(分解 / 收纳 / 装备详情 / 炼丹),
 * 而全仓有四十多个文件带 BaseModal。巡页更量不到:没打开的弹窗在 DOM 里根本不存在。
 * 于是「某个弹窗里有一枚 21px 的钮」这类问题,只有人工点开才看得见 ——
 * 前几轮就是这么找出修行页两枚 21px 的「兑换」钮的。
 *
 * 这个脚本挂后期档,把能自动找到入口的弹窗逐一推开,对每扇量四件事:
 *   一 面板里每个可点元素 ≥28px(全站触控下限);
 *   二 每个可点元素有可访问名(aria-label 或可见文字);
 *   三 禁用态的字读得出来(对比度 ≥3,与 layout-check 同一把尺);
 *   四 面板有可辨识名字(读屏不会只念「对话框」)。
 *
 * 用法(需先 `bun run build`):
 *   node scripts/modal-patrol.mjs            # 全部场景
 *   node scripts/modal-patrol.mjs --shots    # 另存图到 /tmp/modal-patrol
 *
 * 入口找不到的不判失败(夹具未铺该窗前置),但要一条条打印出来 ——
 * 「这扇窗从没被量过」本身是事实,不该被静默吞掉。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lateSlices, seedSave } from './lib/saveFixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const SHOTS = process.argv.includes('--shots')
const SHOTS_DIR = '/tmp/modal-patrol'

const failures = []
const fail = msg => failures.push(msg)
/** 入口没出现的场景:不判失败,但逐条列出 */
const notOpened = []

const browser = await chromium.launch({
  args: [
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--host-resolver-rules=MAP sdk.51.la ~NOTFOUND'
  ]
})

/** 量一扇弹窗;返回 null 表示没开出来 */
async function auditModal(page) {
  return page.evaluate(() => {
    // 量稳态布局:与 layout-check 同口径,禁动效再量
    const st = document.createElement('style')
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
    document.head.appendChild(st)
    const panel = document.querySelector('.modal-panel')
    if (!panel) return null

    const luma = rgb => {
      if (!rgb) return null
      const f = v => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    const rgbaOf = c => {
      const m = /rgba?\(([^)]+)\)/.exec(c || '')
      if (!m) return null
      const q = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
      if (q.length < 3) return null
      return { rgb: q.slice(0, 3), a: q.length > 3 ? q[3] : 1 }
    }
    /** 逐层合成实际所见底色:只取最上层会把 rgb(ink/0.04) 当成纯黑 */
    const backdropOf = start => {
      const layers = []
      for (let n = start; n; n = n.parentElement) {
        const c = rgbaOf(getComputedStyle(n).backgroundColor)
        if (c && c.a > 0) {
          layers.push(c)
          if (c.a >= 0.999) break
        }
      }
      let base = [255, 255, 255]
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const { rgb, a } = layers[i]
        base = [0, 1, 2].map(k => rgb[k] * a + base[k] * (1 - a))
      }
      return base
    }

    /*
     * 被 <label> 包住的控件,可点区域是 label 整体 —— 量 label 而不是 input 本体。
     * 审查第一版量的是 input(h-4 w-4 = 16px),把「一键分解」里九条勾选行全报成
     * 「可点元素过小」,而它们每行都有 px-2.5 py-1.5,实际触面 30px 高。
     * 这条与 aria-check 的 TOUCH_ROUTES 那段同口径。
     */
    const seenHost = new Set()
    const rows = [...panel.querySelectorAll('button, a, [role=button], input, select, textarea')]
      .map(el => {
        const host = el.closest('label') ?? el
        // 同一枚 label 里包着多个控件时只量一次
        if (seenHost.has(host)) return null
        seenHost.add(host)
        const r = host.getBoundingClientRect()
        // 量布局高度:弹窗里可能有带 transform 的元素,getBoundingClientRect 会量到缩放后的值
        const h = host.offsetHeight || r.height
        const declared = parseFloat(getComputedStyle(host).minHeight) || 0
        return {
          name: (host.getAttribute('aria-label') || host.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 16),
          h,
          w: r.width,
          ok: h >= 28 || (declared >= 28 && h >= 27.5)
        }
      })
      .filter(r => r && r.h > 0 && r.w > 0)

    const dimDisabled = [...panel.querySelectorAll('.btn-seal:disabled, .btn-ghost:disabled, .chip-ink:disabled')]
      .map(el => {
        const lf = luma(rgbaOf(getComputedStyle(el).color)?.rgb ?? null)
        const lb = luma(backdropOf(el))
        if (lf === null || lb === null) return null
        const ratio = Math.round(((Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05)) * 100) / 100
        return { ratio, text: (el.textContent || '').trim().slice(0, 12) }
      })
      .filter(x => x && x.ratio < 3)
      .slice(0, 3)
      .map(x => `${x.ratio}:1 «${x.text}»`)

    return {
      count: rows.length,
      label: (panel.getAttribute('aria-label') || panel.querySelector('h3')?.textContent || '').trim(),
      unnamed: rows.filter(r => !r.name).map(r => `${r.h.toFixed(1)}px`),
      small: rows.filter(r => !r.ok).map(r => `${r.h.toFixed(1)}px «${r.name || '无名'}»`),
      dimDisabled
    }
  })
}

/**
 * 一扇窗的巡逻:点开 → 量 → 关掉。
 * click 返回 false 表示入口没出现(夹具没铺到),记为「未量」而不是失败。
 */
async function patrol(page, name, click) {
  const hit = await click()
  if (!hit) {
    notOpened.push(name)
    return
  }
  await page.waitForTimeout(450)
  const audit = await auditModal(page)
  if (SHOTS) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    await page.locator('.modal-panel').last().screenshot({ path: join(SHOTS_DIR, `${name}.png`) }).catch(() => {})
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)

  if (!audit) {
    fail(`[${name}] 点开了但量不到 .modal-panel`)
    return
  }
  if (audit.count === 0) {
    fail(`[${name}] 面板里一个控件都没数到(判据没跑到东西)`)
    return
  }
  if (!audit.label) fail(`[${name}] 没有可访问名(读屏只会念「对话框」)`)
  if (audit.unnamed.length) fail(`[${name}] 有 ${audit.unnamed.length} 个无名控件`)
  if (audit.small.length) fail(`[${name}] 可点元素过小(<28px):${audit.small.join(' | ')}`)
  if (audit.dimDisabled.length) fail(`[${name}] 禁用态的字读不出来:${audit.dimDisabled.join(' | ')}`)
  console.log(`  ${audit.small.length || audit.dimDisabled.length ? '✗' : '✓'} ${name} · ${audit.count} 控件`)
}

/** 新开一页并落到某路由,等后期档那串成就 toast 散尽 */
async function open(route) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, lateSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`运行时异常:${String(e.message).slice(0, 120)}`))
  await page.goto(`${INDEX}#${route}`, { waitUntil: 'load' })
  await page.waitForTimeout(4200)
  // 收掉提示条、钉死随机事件、关掉已浮上来的弹窗
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 10; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    } else break
  }
  return { page, context }
}

/** 按文字找一个入口钮并点开 */
async function clickByText(page, re) {
  const btn = page.locator('main button', { hasText: re }).first()
  if ((await btn.count()) === 0) return false
  await btn.click({ timeout: 3000 }).catch(() => {})
  return true
}

/** 按 role=tab 的 aria-label 切页签 */
async function clickTab(page, re) {
  return page.evaluate(src => {
    const rx = new RegExp(src)
    for (const t of document.querySelectorAll('[role=tab]')) {
      const label = t.getAttribute('aria-label') || t.textContent || ''
      if (rx.test(label)) {
        t.click()
        return true
      }
    }
    return false
  }, re.source)
}

// ============ 各页的弹窗 ============

/*
 * 装备与行囊:分解 / 收纳 / 装备详情 / 词条信息 / 转移 / 炼丹 / 槽位候选。
 * 这一组不挂后期档也是全开的,但用同一份后期档能顺带覆盖「富档案下的布局」。
 */
{
  const { page, context } = await open('/inventory')
  await patrol(page, '分解', () => clickByText(page, /^分\s*解$/))
  await patrol(page, '收纳', () => clickByText(page, /收\s*纳/))
  await patrol(page, '装备详情', async () => {
    const card = page.locator('main button[data-uid]').first()
    if ((await card.count()) === 0) return false
    await card.click({ timeout: 3000 }).catch(() => {})
    return true
  })
  // 装备详情里的「自动重铸」面板也是弹窗类内容,单独量一次
  await patrol(page, '装备详情·自动重铸', async () => {
    const card = page.locator('main button[data-uid]').first()
    if ((await card.count()) === 0) return false
    await card.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
    const toggle = page.locator('.modal-panel button', { hasText: /自动重铸/ }).first()
    if ((await toggle.count()) === 0) return false
    return true
  })
  await context.close()
}

/* 天界:天道熔炉 / 道果 / 器魂 / 远征预估 / 挑战书 */
{
  const { page, context } = await open('/celestial')
  await patrol(page, '天道熔炉', async () => {
    await clickTab(page, /道途/)
    await page.waitForTimeout(400)
    return clickByText(page, /天道熔炉/)
  })
  await patrol(page, '道果', async () => {
    await clickTab(page, /道途/)
    await page.waitForTimeout(400)
    return clickByText(page, /道果/)
  })
  await patrol(page, '器魂', async () => {
    await clickTab(page, /道途/)
    await page.waitForTimeout(400)
    return clickByText(page, /器\s*魂/)
  })
  await context.close()
}

/* 修行:功法详情 / 状态胶囊
 * 功法详情由主修卡或分支卡点开(ui.gongfaDetailId);后期档里主修卡是「研读」那一块。
 */
{
  const { page, context } = await open('/cultivation')
  await patrol(page, '功法详情', async () => {
    // 主修卡与分支卡都是 card-ink 大按钮:逐个试,点到弹出弹窗即止
    const cards = page.locator('main button.card-ink')
    const n = await cards.count()
    for (let i = 0; i < n; i += 1) {
      await cards.nth(i).click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(350)
      if ((await page.locator('.modal-panel').count()) > 0) return true
    }
    return false
  })
  await patrol(page, '状态胶囊', async () => {
    const chip = page.locator('main button').filter({ hasText: /闭关中|历练在途/ }).first()
    if ((await chip.count()) === 0) return false
    await chip.click({ timeout: 3000 }).catch(() => {})
    return true
  })
  await context.close()
}

/* 人物:修行画像 / 师承 / 道侣 —— 三张卡各开一扇窗 */
{
  const { page, context } = await open('/character')
  await patrol(page, '修行画像', () => clickByText(page, /修行画像/))
  await patrol(page, '师承', () => clickByText(page, /师\s*承/))
  await patrol(page, '道侣', () => clickByText(page, /道侣/))
  await context.close()
}

/* 洞府:灵脉投点卡(弹窗式展开)与洞府纪事 */
{
  const { page, context } = await open('/dongfu')
  await patrol(page, '洞府纪事', () => clickByText(page, /期许|纪事|营造/))
  await patrol(page, '灵脉', () => clickByText(page, /灵脉/))
  await context.close()
}

/* 收藏:图鉴详情 —— 册子里点一条就开 */
{
  const { page, context } = await open('/collection')
  await patrol(page, '图鉴详情', async () => {
    const cards = page.locator('main button.card-ink, main button.aspect-square')
    const n = await cards.count()
    for (let i = 0; i < n; i += 1) {
      await cards.nth(i).click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(300)
      if ((await page.locator('.modal-panel').count()) > 0) return true
    }
    return false
  })
  await context.close()
}

/* 设置:关于 / 版本与更新 / 清空存档 / 导入存档 */
{
  const { page, context } = await open('/settings')
  await patrol(page, '关于我们', () => clickByText(page, /关于我们/))
  await patrol(page, '版本与更新', () => clickByText(page, /版本与更新/))
  await patrol(page, '清空存档', () => clickByText(page, /清空存档/))
  await context.close()
}

/* 构建:构筑保存 / 流派实验室 */
{
  const { page, context } = await open('/build')
  await patrol(page, '构筑保存', () => clickByText(page, /存当前构筑|快照已满/))
  await context.close()
}

await browser.close()

if (notOpened.length) {
  console.log(`\n未量到的弹窗(${notOpened.length} 扇,入口没出现 —— 夹具未铺该窗前置):`)
  for (const n of notOpened) console.log(`  · ${n}`)
}

if (failures.length) {
  console.error('\n弹窗巡逻:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\n弹窗巡逻通过:开出来的每一扇都量过触控、可访问名与禁用态对比度')
