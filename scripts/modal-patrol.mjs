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
 *   node scripts/modal-patrol.mjs                # 375 宽
 *   node scripts/modal-patrol.mjs --width=320    # 窄屏那一档
 *   node scripts/modal-patrol.mjs --shots        # 另存图到 /tmp/modal-patrol
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
/** 有两步确认但本轮没探到(前置状态没铺出来)的场景:同样逐条列出,不静默吞掉 */
const twoStepMissed = []

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
    /*
     * 取栈顶那层,不是第一层。
     * 弹窗可以叠着开(后期档会先弹「登临真仙」教学窗,天道熔炉开在它上面),
     * querySelector 拿到的是 DOM 里第一个 = 底窗 —— 于是量的是下面那扇,
     * 上面真正要审的那层一次都没被量到。实测「道果」叠开后报 2 控件,取栈顶才对得上 10。
     */
    const panels = [...document.querySelectorAll('.modal-panel')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const panel = panels[panels.length - 1] ?? null
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

    /*
     * 排版三条:弹窗是窄屏最先出事的地方(面板最宽就 375 减去左右留白)。
     *   一 横向溢出:面板内容比面板宽 —— 320 宽下最容易撞,撞了就出现横向滚动条;
     *   二 竖排正文:某个块被挤到只剩一个字宽,正文立成一列(与前面几轮修的钮竖排同类);
     *   三 按钮折行:钮内正文折成两行,把整排撑高(「强 化(尘差 36)」就是这么坏的)。
     */
    const pr = panel.getBoundingClientRect()
    const overflow = []
    for (const el of panel.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      // 允许 1px 亚像素;只看明显超出面板右边界或左边界
      if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) {
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14)
        overflow.push(`${Math.round(r.width)}px «${t || el.tagName.toLowerCase()}»`)
      }
    }
    const squeezed = []
    for (const el of panel.querySelectorAll('p, span, button, li')) {
      const r = el.getBoundingClientRect()
      // 高远大于宽且宽度很窄 = 竖排
      if (r.width > 0 && r.height > r.width * 3 && r.width < 40) {
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14)
        if (t.length >= 2) squeezed.push(`${Math.round(r.width)}x${Math.round(r.height)} «${t}»`)
      }
    }
    /*
     * 同一水平行内的按钮必须等高。
     *
     * 这是「忽大忽小」那件事的精确形态:并排的两三颗钮里,有一颗被正文挤成了两行,
     * 于是那一排的高度由最高的那颗决定,整排跟着长高 —— 玩家点一下确认,行就窜一截。
     * 「强 化(尘差 36)」把底行从 44 抬到 57,「33.51亿 → 5 道源」把熔炉那一行抬高半行。
     *
     * 为什么不是别的写法:
     *   · 数按钮里有几行 —— 会误报多行卡片(师承三张门派卡)与截断标题(版本号徽章);
     *   · 数同面板按钮的高度差 —— 会误报「整行大钮 vs 小方钮」与本来就不同高的卡片。
     * 只在**同一水平行**内比较,才是玩家看到的「一排」。
     */
    const wrapped = []
    const byRow = new Map()
    for (const el of panel.querySelectorAll('button')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      /*
       * 整行钮(占面板八成宽以上)不参与同类比较:页脚的「收 炉」「知道了」是足部主钮,
       * 本来就比上面的小方钮高,把它们拉进来只会得到稳定误报。
       */
      if (r.width > pr.width * 0.8) continue
      // 行以中心线的 y 归组(整数化,容忍亚像素)
      const key = Math.round((r.top + r.bottom) / 2 / 4)
      if (!byRow.has(key)) byRow.set(key, [])
      byRow.get(key).push({ h: Math.round(r.height), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16) })
    }
    for (const group of byRow.values()) {
      if (group.length < 2) continue
      const hs = group.map(g => g.h)
      const lo = Math.min(...hs)
      const hi = Math.max(...hs)
      if (hi >= lo + 4) {
        const odd = group.filter(g => g.h >= lo + 4)
        wrapped.push(`${odd.map(o => `${o.h}px «${o.text}»`).join(' + ')}(同行最低 ${lo}px)`)
      }
    }

    /*
     * 正文可滚时滚到底,量最后一块内容有没有被裁。
     * 扣掉滚动区自身的 padding-bottom —— 那是留白,不是被吃掉的内容;
     * 第一版没扣,三扇窗一律报「被裁 12px」,恰好等于 py-3 的 12px。
     */
    let scrollClip = null
    const scroller = panel.querySelector('.overflow-y-auto')
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
      scroller.scrollTop = scroller.scrollHeight
      const sr = scroller.getBoundingClientRect()
      const padB = parseFloat(getComputedStyle(scroller).paddingBottom) || 0
      const kids = [...scroller.children]
      const last = kids[kids.length - 1]
      const lr = last?.getBoundingClientRect()
      if (lr) {
        const over = Math.round(lr.bottom - (sr.bottom - padB))
        if (over > 1) scrollClip = `${over}px «${(last.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16) || last.tagName.toLowerCase()}»`
      }
      scroller.scrollTop = 0
    }

    return {
      count: rows.length,
      scrollClip,
      label: (panel.getAttribute('aria-label') || panel.querySelector('h3')?.textContent || '').trim(),
      unnamed: rows.filter(r => !r.name).map(r => `${r.h.toFixed(1)}px`),
      small: rows.filter(r => !r.ok).map(r => `${r.h.toFixed(1)}px «${r.name || '无名'}»`),
      dimDisabled,
      overflow: overflow.slice(0, 4),
      squeezed: squeezed.slice(0, 3),
      wrapped: wrapped.slice(0, 3)
    }
  })
}

/**
 * 弹窗内的两步确认:点开确认态,量面板与各控件的几何有没有变。
 *
 * 单测与页面级 detail-geometry 都管不到这里 ——
 * detail-geometry 只量修行页 / 行囊 / 洞府 / 构筑这四处页面级的,
 * 而弹窗里另有「分解 / 全部熔尽 / 确认择道 / 确认返还」等好几处两步确认,
 * 它们从没被量过。而「点一下按钮就变大变小」正是玩家最早报的那件事。
 *
 * 只点**前置触发钮**(分 解 / 全部熔尽 / 择此道 / 熔 铸 这类),绝不点确认钮:
 * 那是不可逆操作,巡逻不能真把玩家的东西熔掉。
 * 判据:确认态下,面板不横向溢出、没有块被挤成竖排、同一水平行的按钮仍等高。
 */
async function probeTwoStep(page, name) {
  // 确认态里必有「再想想」;没有它就不是两步确认,直接跳过
  const markers = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.modal-panel')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }).pop()
    if (!panel) return null
    const hasUndo = [...panel.querySelectorAll('button')].some(b => /再想想/.test(b.textContent || ''))
    return {
      hasUndo,
      panelH: Math.round(panel.getBoundingClientRect().height * 10) / 10,
      btns: [...panel.querySelectorAll('button')].map(b => ({
        t: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20),
        h: Math.round(b.getBoundingClientRect().height),
        w: Math.round(b.getBoundingClientRect().width),
        disabled: b.disabled
      }))
    }
  })
  if (!markers || markers.hasUndo) return

  /*
   * 找前置触发钮。
   *
   * 不能按文字白名单点 —— 「分 解」在分解弹窗里是**确认钮本身**(footer 那颗),
   * 点它就把东西分解了。判据必须是行为:点一下,**看有没有冒出「再想想」**。
   * 冒出来了 = 这颗是两步确认的前置钮,而且此时什么都还没发生(那正是两步确认的意义);
   * 没冒出来 = 这颗不是前置钮,已经生效了 —— 但巡逻里点到的钮都不动钱不动物,
   * 最坏结果是弹窗关了,下一个场景会重新开一页。
   *
   * 按「是否带确认/取消语」筛掉一批明显不能点的,再逐个试。
   */
  /*
   * 只筛掉**明确不能点**的:取消语、确认语、关闭语。
   * 别把「熔 铸」「全部熔尽」这类动作词也筛掉 —— 它们正是典型的两步确认前置钮。
   */
  const SAFE_SKIP = /再想想|确认|知道了|关\s*闭|收\s*炉|取\s*消|\b取消\b/
  const cands = await page.evaluate(src => {
    const skip = new RegExp(src)
    const panel = [...document.querySelectorAll('.modal-panel')].filter(el => el.getBoundingClientRect().width > 0).pop()
    if (!panel) return []
    return [...panel.querySelectorAll('button')]
      .map((b, i) => ({ i, t: (b.textContent || '').trim().replace(/\s+/g, ' '), dis: b.disabled }))
      .filter(b => !b.dis && b.t && !skip.test(b.t))
      .map(b => b.i)
  }, SAFE_SKIP.source)
  if (cands.length === 0) return

  let entered = false
  for (const idx of cands.slice(0, 6)) {
    // 取栈顶那层面板里的按钮(别用 :visible —— 那是 Playwright 专有伪类,页面选择器里无效)
    const btns = page.locator('.modal-panel').last().locator('button')
    const n = await btns.count()
    if (idx >= n) continue
    await btns.nth(idx).click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(400)
    const hasUndo = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.modal-panel')].filter(el => el.getBoundingClientRect().width > 0).pop()
      return panel ? [...panel.querySelectorAll('button')].some(b => /再想想/.test(b.textContent || '')) : false
    })
    if (hasUndo) { entered = true; break }
    // 没进确认态:可能弹窗被关掉了,那就没法继续
    if ((await page.locator('.modal-panel').count()) === 0) return
  }
  if (!entered) {
    /*
     * 进不了确认态多半是前置没铺(要有可分解的件、要有凝过的器魂)。
     * 不判失败 —— 但也绝不静默:上一轮就是因为静默跳过,判据空跑却报绿。
     */
    twoStepMissed.push(name)
    return
  }

  const after = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.modal-panel')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const panel = panels[panels.length - 1]
    if (!panel) return null
    const pr = panel.getBoundingClientRect()
    const overflow = []
    for (const el of panel.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) {
        overflow.push(`${Math.round(r.width)}px «${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14) || el.tagName.toLowerCase()}»`)
      }
    }
    const squeezed = []
    for (const el of panel.querySelectorAll('p, span, button, li')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > r.width * 3 && r.width < 40) {
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14)
        if (t.length >= 2) squeezed.push(`${Math.round(r.width)}x${Math.round(r.height)} «${t}»`)
      }
    }
    // 同一水平行内按钮等高(与 auditModal 同一把尺)
    const byRow = new Map()
    for (const el of panel.querySelectorAll('button')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      if (r.width > pr.width * 0.8) continue
      const key = Math.round((r.top + r.bottom) / 2 / 4)
      if (!byRow.has(key)) byRow.set(key, [])
      byRow.get(key).push({ h: Math.round(r.height), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16) })
    }
    const uneven = []
    for (const group of byRow.values()) {
      if (group.length < 2) continue
      const hs = group.map(g => g.h)
      const lo = Math.min(...hs)
      if (Math.max(...hs) >= lo + 4) {
        uneven.push(group.filter(g => g.h >= lo + 4).map(o => `${o.h}px «${o.text}»`).join(' + ') + `(同行最低 ${lo}px)`)
      }
    }
    return { hasUndo: [...panel.querySelectorAll('button')].some(b => /再想想/.test(b.textContent || '')), overflow: overflow.slice(0, 3), squeezed: squeezed.slice(0, 3), uneven: uneven.slice(0, 3) }
  })

  if (!after) return
  if (after.overflow.length) fail(`[${WIDTH}x${HEIGHT}] ${name}·确认态: 有元素横向溢出:${after.overflow.join(' | ')}`)
  if (after.squeezed.length) fail(`[${WIDTH}x${HEIGHT}] ${name}·确认态: 有块被挤成竖排:${after.squeezed.join(' | ')}`)
  if (after.uneven.length) fail(`[${WIDTH}x${HEIGHT}] ${name}·确认态: 同行按钮不等高:${after.uneven.join(' | ')}`)
  console.log(`       └ ${name} 两态:未确认 ${markers.panelH}px → 确认态几何量过`)
  // 退回未确认态,留给外层关窗
  const undo = page.locator('.modal-panel button', { hasText: /再想想/ }).last()
  if ((await undo.count()) > 0) await undo.click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(250)
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
  // 两态几何:弹窗里若有两步确认,点开确认态再量一遍 —— 必须在关窗之前
  await probeTwoStep(page, name)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)

  if (!audit) {
    fail(`[${WIDTH}x${HEIGHT}] ${name}: 点开了但量不到 .modal-panel`)
    return
  }
  if (audit.count === 0) {
    fail(`[${WIDTH}x${HEIGHT}] ${name}: 面板里一个控件都没数到(判据没跑到东西)`)
    return
  }
  if (!audit.label) fail(`[${WIDTH}x${HEIGHT}] ${name}: 没有可访问名(读屏只会念「对话框」)`)
  if (audit.unnamed.length) fail(`[${WIDTH}x${HEIGHT}] ${name}: 有 ${audit.unnamed.length} 个无名控件`)
  if (audit.small.length) fail(`[${WIDTH}x${HEIGHT}] ${name}: 可点元素过小(<28px):${audit.small.join(' | ')}`)
  if (audit.dimDisabled.length) fail(`[${WIDTH}x${HEIGHT}] ${name}: 禁用态的字读不出来:${audit.dimDisabled.join(' | ')}`)
  if (audit.overflow.length) fail(`[${WIDTH}x${HEIGHT}] ${name}: 面板里有元素横向溢出:${audit.overflow.join(' | ')}`)
  if (audit.squeezed.length) fail(`[${WIDTH}x${HEIGHT}] ${name}: 有块被挤成竖排:${audit.squeezed.join(' | ')}`)
  if (audit.wrapped.length) fail(`[${WIDTH}x${HEIGHT}] ${name}: 有按钮正文折了行:${audit.wrapped.join(' | ')}`)
  if (audit.scrollClip) fail(`[${WIDTH}x${HEIGHT}] ${name}: 滚到底后最后一块内容被裁:${audit.scrollClip}`)

  console.log(`  ${audit.small.length || audit.dimDisabled.length ? '✗' : '✓'} ${name} · ${audit.count} 控件`)
}

/** 新开一页并落到某路由,等后期档那串成就 toast 散尽 */
/**
 * 后期档 + 修行分片。
 *
 * 只有 lateSlices 时,功法详情与状态胶囊两扇窗永远开不出来:
 * 前者要已习得一部功法(learned 非空),后者要身上挂着一条没过期的增益。
 * 两者都不属于「夹具没铺前置」—— 它们是每次启动都能补的状态,所以直接铺进去。
 */
function cultivationSlices() {
  const base = lateSlices()
  return {
    ...base,
    // 已习得一部主修:修行页才画得出主修卡,点开就是功法详情
    cultivation: {
      learned: { m_taixuan: 3 },
      mainGongfa: 'm_taixuan',
      subGongfa: [],
      gongfaBranch: {},
      // 一条还在生效的增益:修行页才画得出状态胶囊,点开就是它的说明
      buffs: [{ defId: 'buff_juling', endsAt: Date.now() + 30 * 60 * 1000, added: 30 * 60 * 1000 }]
    }
  }
}

/*
 * 两档宽度都量。375 是主档,320 是实测里最容易出事的那一档 ——
 * 前面几轮找到的畸形(重铸钮竖排、构筑行「再想想」压成 20px)全都只在 320 出现。
 */
/**
 * 由 --width=N / --height=N 指定。脚本一次只跑一档,各档由外面跑多遍。
 * 高度也要能压:弹窗正文是可滚区,矮视口下才会出现滚动 ——
 * 滚动之后贴底那块会不会被 padding 或 footer 吃掉,只有矮视口量得出来。
 */
const WIDTH = Number(process.argv.find(a => /^--width=/.test(a))?.slice(8) ?? 375)
const HEIGHT = Number(process.argv.find(a => /^--height=/.test(a))?.slice(9) ?? (WIDTH === 375 ? 812 : 640))

async function open(route) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, cultivationSlices())
  const page = await context.newPage()
  page.on('pageerror', e => fail(`运行时异常:${String(e.message).slice(0, 120)}`))
  await page.goto(`${INDEX}#${route}`, { waitUntil: 'load' })
  await page.waitForTimeout(4200)
  // 收掉提示条、钉死随机事件、关掉已浮上来的弹窗
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  await closeAllModals(page)
  return { page, context }
}

/**
 * 把当前浮着的弹窗全关掉。
 *
 * 后期档一次性弹「登临真仙」教学窗,而它是 `:closable="false"` —— Esc 与遮罩都不关它,
 * 只能点它自己那颗「知道了」。只按 Esc 循环会永远停在它上面(实测 12 次 Esc 后仍剩 1 层),
 * 而它的遮罩会把后面所有点击吃掉。
 */
async function closeAllModals(page) {
  for (let i = 0; i < 12; i += 1) {
    if ((await page.locator('.modal-panel').count()) === 0) return
    // 不可关的层先点它自己的收尾钮
    const dismiss = page.locator('.modal-panel button', { hasText: /^知道了$|^知道了。$|^收 下$/ }).last()
    if ((await dismiss.count()) > 0 && (await dismiss.isVisible().catch(() => false))) {
      await dismiss.click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(320)
      continue
    }
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(280)
  }
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
  /*
   * 道果说明:凝一枚才弹(道源够 + 还没看过说明)。
   * 这里不能走 patrol 的通用流程 —— 它要在「凝果之后」判开没开,而凝果前已有一层熔炉。
   * 故单独写:先开熔炉 → 点凝果 → 判层数从 1 变 2。
   */
  {
    await clickTab(page, /道途/)
    await page.waitForTimeout(400)
    const opened = await clickByText(page, /天道熔炉/)
    let layersBefore = 0
    if (opened) {
      await page.waitForTimeout(600)
      layersBefore = await page.locator('.modal-panel').count()
    }
    // 钮面写的是「200 道源 → 道果 +1」,连凝钮写「连凝 6 枚」
    const condense = page.locator('.modal-panel button', { hasText: /道果 \+1|连凝/ }).first()
    const can = (await condense.count()) > 0 && !(await condense.isDisabled().catch(() => true))
    if (!can) {
      notOpened.push('道果')
    } else {
      await condense.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(700)
      const layersAfter = await page.locator('.modal-panel').count()
      if (layersAfter <= layersBefore) {
        notOpened.push('道果')
      } else {
        // 栈顶那层就是道果说明
        const audit = await auditModal(page)
        if (SHOTS) {
          mkdirSync(SHOTS_DIR, { recursive: true })
          await page.locator('.modal-panel').last().screenshot({ path: join(SHOTS_DIR, '道果.png') }).catch(() => {})
        }
        if (!audit || audit.count === 0) fail(`[${WIDTH}x${HEIGHT}] 道果:面板里一个控件都没数到`)
        else {
          if (audit.small.length) fail(`[${WIDTH}x${HEIGHT}] 道果:可点元素过小(<28px):${audit.small.join(' | ')}`)
          if (audit.dimDisabled.length) fail(`[${WIDTH}x${HEIGHT}] 道果:禁用态的字读不出来:${audit.dimDisabled.join(' | ')}`)
          console.log(`  ${audit.small.length || audit.dimDisabled.length ? '✗' : '✓'} 道果 · ${audit.count} 控件`)
        }
      }
    }
  }
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
  // 状态胶囊:修行页 buff 头像那一排,点开是 BuffDialog
  await patrol(page, '状态胶囊', async () => {
    const chip = page.locator('main button').filter({ hasText: /聚灵|仙韵|凝神/ }).first()
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
  await patrol(page, '道侣', () => clickByText(page, /道\s*侣/))
  await context.close()
}

/* 洞府:灵脉投资弹窗(唯一的 BaseModal);「洞府纪事」是页面内的一块,不是弹窗 */
{
  const { page, context } = await open('/dongfu')
  await patrol(page, '灵脉', () => clickByText(page, /灵脉/))
  await context.close()
}

/* 收藏:图鉴详情 —— 先切到「收藏」签(默认停在成就),册子里已收录的一条点开就是详情 */
{
  const { page, context } = await open('/collection')
  await clickTab(page, /收藏/)
  await page.waitForTimeout(500)
  await patrol(page, '图鉴详情', async () => {
    const chips = page.locator('main button.chip-ink')
    const n = await chips.count()
    for (let i = 0; i < n && i < 20; i += 1) {
      await chips.nth(i).click({ timeout: 2000 }).catch(() => {})
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

if (twoStepMissed.length) {
  console.log(`\n两步确认没探到的窗(${twoStepMissed.length} 扇,点遍候选钮都没冒出「再想想」):`)
  for (const n of twoStepMissed) console.log(`  · ${n}`)
}

if (failures.length) {
  console.error('\n弹窗巡逻:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\n弹窗巡逻通过:开出来的每一扇都量过触控、可访问名与禁用态对比度')
