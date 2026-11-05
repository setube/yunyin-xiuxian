/* eslint-disable no-console -- 产出即报告 */
/**
 * 排版自检:手机尺寸下逐页量横向溢出等判据。
 *
 * 用法:
 *   bun run build
 *   bunx playwright install chromium  # 浏览器缓存在 ~/.cache/ms-playwright
 *   node scripts/layout-check.mjs     # --shots 存图到 /tmp/layout-shots
 *
 * 只作本地工具,不进 CI:整套十来分钟,靠时机的判据在 runner 上时红时绿。
 * Windows 用 node 启动:Bun 起不来 Chromium 的调试管道(握手不完成)。
 * 无头 Chromium 视口模拟,非真机:字体渲染与安全区(刘海/手势条)仍需真机确认。
 */
import { chromium } from 'playwright'
import CryptoJS from 'crypto-js'
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const SHOTS_DIR = '/tmp/layout-shots'
const SHOTS = process.argv.includes('--shots')

/*
 * 存档格式:与 src/utils/storage.ts + src/utils/crypto.ts 同源。
 * 这两个值此前在本文件里各抄了 23 遍,密钥一改就得改 23 处 ——
 * 漏一处那段判据就静默跑在干净档上(fixtureParity.spec 钉的是 saveFixture 那一份)。
 */
const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
const SAVE_PREFIX = 'yunyin.'
/** 把一个 store 切片加密成 localStorage 里那种密文 */
const encryptSlice = (o) => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()

const VIEWPORTS = [
  // 390 = iPhone 12/13/14/15 标称宽度;375/320 为旧机型与极窄档。dpr 只影响截图,不影响布局与判据
  { width: 390, height: 844, tag: '390', dpr: 3 },
  { width: 375, height: 812, tag: '375', dpr: 3 },
  { width: 320, height: 568, tag: '320', dpr: 2 },
  // 横屏与桌面两档:安卓壳与桌面客户端都能转到;高度断点 short:、大屏册页留白在此现形
  { width: 844, height: 390, tag: '844x390', dpr: 2 },
  { width: 1280, height: 800, tag: '1280x800', dpr: 1 }
]
/** 全量路由:漏一页即该页无守卫 */
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

/**
 * 不依赖公网:index.html 的 sdk.51.la 第三方统计会拖住 `load`(CDN 堵时 goto 卡满 30 秒)。
 * 每处新开的 context 都挂同一道拦截 —— 只靠 host-resolver-rules 时,DNS 失败也要等浏览器
 * 自己放弃,慢网/容器里仍会撞 goto 超时(第 20 多件事那时的无头重启就因此整跑中断)。
 */
const browser = await chromium.launch({
  // --no-sandbox / --disable-dev-shm-usage:容器里 headless 常崩(无用户命名空间、/dev/shm 只有 64M);同 ui-smoke
  args: [
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--host-resolver-rules=MAP sdk.51.la ~NOTFOUND'
  ]
})

/** 外域只拦不记:统计脚本的运行时报错由 watchPageErrors 不计 */
async function blockExternal(ctx) {
  await ctx.route('**/*', route => {
    const url = route.request().url()
    if (/^(file|data|blob):/.test(url)) return route.continue()
    return route.abort()
  })
  return ctx
}

// 全文二十多处各开各的 context:在此统一包一层,新加的场景不必再想起挂拦截
const rawNewContext = browser.newContext.bind(browser)
browser.newContext = async opts => blockExternal(await rawNewContext(opts))
const failures = []
let checked = 0
let zoomSeen = 0
/** 后期档 200% 另计:与主巡页合计时,主巡页那档停掉也报不出 */
let zoomSeenLate = 0

/** 弹窗内控件过页面那两条尺子:有可访问名、不小于 28px */
async function auditModalControls(page) {
  return page.evaluate(() => {
    // 动画禁令:量稳态布局,不量过渡中间帧;与 measurePage 同口径
    const st = document.createElement('style')
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
    document.head.appendChild(st)
    const panel = document.querySelector('.modal-panel')
    if (!panel) return null
    const rows = [...panel.querySelectorAll('button, a, [role=button]')]
      .map(el => {
        const r = el.getBoundingClientRect()
        // 声明 min-height ≥28 的给半像素容差(27.5);报数带一位小数,免得 27.6 打印成「28」
        const declared = parseFloat(getComputedStyle(el).minHeight) || 0
        const ok = r.height >= 28 || (declared >= 28 && r.height >= 27.5)
        return {
          name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14),
          h: r.height,
          ok
        }
      })
      .filter(r => r.h > 0)
    /*
     * 弹窗里的禁用按钮对比度。
     *
     * 页面那条 dimDisabled 查的是 document,弹窗打开时其实也能扫到 —— 这一点当初写错过,
     * 以为「只在 measurePage 里就等于扫不到弹窗」,实际 measurePage 扫的是整个文档。
     * 这里再做一遍不是为了补漏,是为了把范围收在 .modal-panel 内:
     * 报错能指明是哪个弹窗,且不受面板外节点干扰。两边用同一把尺子(阈值 3、逐层合成底色)。
     */
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
    const dimDisabled = [...panel.querySelectorAll('.btn-seal:disabled, .btn-ghost:disabled')]
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
     * 弹窗里的选择组。
     *
     * 与上面同一件事:页面那条 badGroups 查 document,弹窗打开时也会跑;
     * 这里限在面板内,分组更准(同父元素即同组),报错也能指明弹窗。
     * 语义:aria-pressed 是 toggle,允许一个都不选,多于一个才是真错;aria-selected 必须恰有一个。
     */
    const badGroups = (() => {
      const out = []
      for (const attr of ['aria-pressed', 'aria-selected']) {
        const byParent = new Map()
        for (const el of panel.querySelectorAll(`[${attr}]`)) {
          const parent = el.parentElement
          if (!parent) continue
          byParent.set(parent, [...(byParent.get(parent) ?? []), el])
        }
        for (const [, els] of byParent) {
          if (els.length < 2) continue
          const on = els.filter(e => e.getAttribute(attr) === 'true').length
          if (attr === 'aria-pressed' ? on > 1 : on !== 1) out.push(`${attr} 组(${els.length} 项)里有 ${on} 个选中`)
        }
      }
      return out
    })()
    return {
      count: rows.length,
      label: (panel.getAttribute('aria-label') || panel.querySelector('h3')?.textContent || '').trim(),
      unnamed: rows.filter(r => !r.name).map(r => `${r.h.toFixed(1)}px`),
      small: rows.filter(r => !r.ok).map(r => `${r.h.toFixed(1)}px «${r.name || '无名'}»`),
      dimDisabled,
      badGroups
    }
  })
}

/** 收集页面异常:堆栈来自 51.la 统计脚本的只打印不计(钉死 Math.random 后它会抛 Invalid UUID) */
function watchPageErrors(page, sink) {
  let thirdPartyNoted = false
  page.on('pageerror', e => {
    const stack = String(e.stack || e.message || '')
    if (/sdk\.51\.la/.test(stack)) {
      // 逐页重载会重复抛,只提一次
      if (!thirdPartyNoted) {
        thirdPartyNoted = true
        console.log(`  (第三方统计脚本异常,不计入失败:${String(e.message).slice(0, 60)})`)
      }
      return
    }
    sink.push(String(e).slice(0, 160))
  })
}

/**
 * 收掉提示条、钉死随机事件、关掉已浮上来的弹窗。
 * 只钉 Math.random 不够:引擎每秒一拍,钉之前可能已掷出顿悟。
 */
async function clearOverlays(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  // 固定转六圈(≈2.1 秒):引擎掷顿悟与弹窗轮询是两个独立定时器,事件已产生时窗可能还没画出来
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
  return page.evaluate(() => [...document.querySelectorAll('.modal-panel')].map(p => (p.querySelector('h3')?.textContent || p.getAttribute('aria-label') || '?').trim()))
}

/** 把 formatGN 渲染出来的文本还原成数值(万/亿/兆…按 10^4 递进) */
async function readFormatted(page, title) {
  return page.evaluate(t => {
    const el = document.querySelector(`[title^="${t}"]`)
    if (!el) return { text: `(找不到 ${t})`, value: null }
    const text = (el.textContent || '').trim().replace(/,/g, '')
    const UNITS = ['万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载', '极']
    const m = /([\d][\d]*(?:\.\d+)?)\s*(万|亿|兆|京|垓|秭|穰|沟|涧|正|载|极)?/.exec(text)
    if (!m) return { text, value: null }
    const unit = m[2] ? Math.pow(10, 4 * (UNITS.indexOf(m[2]) + 1)) : 1
    return { text, value: parseFloat(m[1]) * unit }
  }, title)
}

/** 一页一量(空档与后期档共用):横向溢出、外壳偏移、越界元素、无名控件、过小可点元素、选择组选中态、底部导航项数 */
async function measurePage(page) {
  return page.evaluate(() => {
    // 动画禁令:量稳态布局,与截图 animations:'disabled' 同口径;减动效自检另量,不受此注入影响
    const st = document.createElement('style')
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
    document.head.appendChild(st)
    const vw = window.innerWidth
    const overflows = [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect()
        // 左右缘都查:被推离左缘的块(负 left / -mx-*)不涨 scrollWidth
        const rightOver = r.right > vw + 2
        const leftOver = r.left < -1
        if (r.width <= 0 || (!rightOver && !leftOver)) return false
        // 装饰层(不吃事件)故意越界,豁免;按计算后的 pointer-events 判,不按类名(自定义类如 .ring-layer 会漏)
        for (let node = el; node; node = node.parentElement) {
          if (getComputedStyle(node).pointerEvents === 'none') return false
        }
        // 横向滚动轨内容豁免;只豁免 auto/scroll,不豁免 hidden(外壳那层 hidden 正是玩家滚不动的事故层)
        for (let node = el.parentElement; node; node = node.parentElement) {
          const s = getComputedStyle(node)
          if (s.overflowX === 'auto' || s.overflowX === 'scroll') return false
        }
        return true
      })
      .slice(0, 4)
      .map(el => {
        const r = el.getBoundingClientRect()
        const side = r.left < -1 ? 'L' : r.right > vw + 2 ? 'R' : '?'
        return `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}@${side}${Math.round(r.left)}..${Math.round(r.right)}`
      })
    return {
      hash: location.hash,
      horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
      /**
       * 外壳(#app 第一层)须 scrollLeft 为 0 且无横向可滚余量:它 overflow-hidden,玩家滚不动但浏览器滚得动,
       * documentElement 层的溢出判据查不出。
       */
      shellShift: (() => {
        const shell = document.getElementById('app')?.firstElementChild
        if (!shell) return null
        return { scrollLeft: Math.round(shell.scrollLeft), overflowX: Math.round(shell.scrollWidth - shell.clientWidth) }
      })(),
      overflows,
      navItems: document.querySelectorAll('nav button, nav a').length,
      // 控件须有可访问名(aria-label / 可见文字)
      unnamed: [...document.querySelectorAll('button, a, [role=button]')]
        .filter(el => {
          const name = (el.getAttribute('aria-label') || el.textContent || '').trim()
          if (name) return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        .slice(0, 3)
        .map(el => el.outerHTML.slice(0, 80).replace(/\s+/g, ' ')),
      /*
       * 可点元素高度下限 28px。
       *
       * 只量高度不量宽度:本项目的钮都靠内边距撑宽(没有写死 w-[Npx] 又去掉 p 的),
       * 实测全站窄钮为 0;真要窄到点不准,先会撞上页面的横向溢出与孤字自检。
       * 宽度那一侧将来若要加,须一并给弹窗内那一组(auditModalControls)加,两处同尺。
       */
      smallTargets: [...document.querySelectorAll('button, a, [role=button]')]
        .map(el => {
          const r = el.getBoundingClientRect()
          // 与 auditModalControls 同一条尺子
          const declared = parseFloat(getComputedStyle(el).minHeight) || 0
          const ok = r.height >= 28 || (declared >= 28 && r.height >= 27.5)
          return { el, r, ok }
        })
        .filter(({ r, ok }) => r.width > 0 && r.height > 0 && !ok)
        .slice(0, 3)
        .map(({ el, r }) => `${r.height.toFixed(1)}px «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 12)}»`),
      // 禁用按钮文字须读得出:量前景/背景对比度
      dimDisabled: [...document.querySelectorAll('.btn-seal:disabled, .btn-ghost:disabled')]
        .map(el => {
          const cs = getComputedStyle(el)
          const lum = c => {
            if (!c) return null
            const f = v => {
              const s = v / 255
              return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
          }
          // 半透明底色逐层合成为实际所见颜色:只取最上层会把 rgb(ink / 0.04) 当成纯黑
          const parse = c => {
            const m = /rgba?\(([^)]+)\)/.exec(c)
            if (!m) return null
            const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
            if (p.length < 3) return null
            return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }
          }
          const paintOf = start => {
            const layers = []
            let n = start
            while (n) {
              const c = parse(getComputedStyle(n).backgroundColor)
              if (c && c.a > 0) {
                layers.push(c)
                if (c.a >= 0.999) break
              }
              n = n.parentElement
            }
            let base = [255, 255, 255]
            for (let i = layers.length - 1; i >= 0; i -= 1) {
              const { rgb, a } = layers[i]
              base = [0, 1, 2].map(k => rgb[k] * a + base[k] * (1 - a))
            }
            return base
          }
          const lf = lum(parse(cs.color)?.rgb ?? null)
          const lb = lum(paintOf(el))
          if (lf === null || lb === null) return null
          const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05)
          return { ratio: Math.round(ratio * 100) / 100, text: (el.textContent || '').trim().slice(0, 12) }
        })
        .filter(x => x && x.ratio < 3)
        .slice(0, 3)
        .map(x => `${x.ratio}:1 «${x.text}»`),
      // 顶栏文字只占一行:逐格量高,超过 ≈24px 即折行
      headerTall: (() => {
        const header = document.querySelector('header')
        if (!header) return []
        return [...header.querySelectorAll('span, p')]
          .filter(el => el.getBoundingClientRect().height > 24)
          .slice(0, 3)
          .map(el => `${Math.round(el.getBoundingClientRect().height)}px «${(el.textContent || '').trim().slice(0, 10)}»`)
      })(),
      // 地界卡:名字不许被挤成竖排,头部与操作块不许相交(横向溢出量不出)
      regionCards: (() => {
        const tall = []
        const overlap = []
        for (const card of document.querySelectorAll('[data-region-card]')) {
          const name = card.querySelector('[data-region-name]')
          const label = (name?.textContent || '').trim()
          if (name) {
            const h = Math.round(name.getBoundingClientRect().height)
            // 15px 楷体单行约 22px,>30 即折行
            if (h > 30) tall.push(`${h}px «${label}»`)
          }
          const head = card.querySelector('[data-region-head]')
          if (!head) continue
          const a = head.getBoundingClientRect()
          for (const act of card.querySelectorAll('[data-region-action]')) {
            const b = act.getBoundingClientRect()
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
              overlap.push(`«${label}» 与操作块重叠`)
            }
          }
        }
        return { tall: tall.slice(0, 3), overlap: overlap.slice(0, 3) }
      })(),
      // 通用挤压判据一:被挤成竖排的文字
      verticalTexts: [...document.querySelectorAll('span, p, div, h1, h2, h3, button')]
        .filter(el => {
          const text = (el.textContent || '').trim()
          if (text.length < 3) return false
          if (el.querySelector('span, p, div, button, a')) return false // 只看最内层文字
          const r = el.getBoundingClientRect()
          if (r.width <= 0 || r.width >= 40) return false
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16
          return r.height > lineHeight * 2.5
        })
        .slice(0, 3)
        .map(el => `${Math.round(el.getBoundingClientRect().width)}px 宽 «${(el.textContent || '').trim().slice(0, 10)}»`),
      // 通用挤压判据二:数字与量词被换行拆开
      unitBreaks: (() => {
        /*
         * 量词表。原先只有 13 个,而实际用到的远不止:倍/成(丹方与倍率)、
         * 席(辅修槽)、页(残页)、部(功法)、条(词条)、味(丹药)、处(镇压)、
         * 世(轮回)、点(灵脉投点)、星(命星)、门(八门)、座(虚界)、片(镇压区)、重(祭炼)。
         * 漏一档,那一处断行就没人管了 —— 表宁全勿缺,多出来的字不会造成误报
         * (判据是「数字后紧跟该字且被折到下一行」,不是所有该字都算)。
         */
        const UNITS = '石铁尘株张载年次件层场阶枚缕时日倍成席页部条味处世点星门座片重'
        const rectAt = (node, i) => {
          const r = document.createRange()
          r.setStart(node, i)
          r.setEnd(node, i + 1)
          const box = r.getBoundingClientRect()
          return box.width > 0 || box.height > 0 ? box : null
        }
        const out = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node && out.length < 3) {
          const t = node.nodeValue || ''
          if (!/[\d,.][\s]*[石铁尘株张载年次件层场阶枚缕]/.test(t)) {
            node = walker.nextNode()
            continue
          }
          // 只量 ≤24 字的标签/代价短文本;长句里的正常换行不算
          if (t.trim().length > 24) {
            node = walker.nextNode()
            continue
          }
          for (let i = 1; i < t.length; i += 1) {
            const ch = t[i]
            if (!UNITS.includes(ch)) continue
            let j = i - 1
            while (j >= 0 && /\s/.test(t[j])) j -= 1
            if (j < 0 || !/[\d,.]/.test(t[j])) continue
            const a = rectAt(node, j)
            const b = rectAt(node, i)
            if (a && b && Math.abs(a.top - b.top) > 4) {
              out.push(`«${t.trim().slice(0, 14)}»`)
              break
            }
          }
          node = walker.nextNode()
        }
        return out
      })(),
      // 通用挤压判据三:被折到下一行独占的标点
      orphanPunctuation: (() => {
        const out = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node && out.length < 3) {
          const t = node.nodeValue || ''
          const trimmed = t.trim()
          // 只认中文标点:半角「?」是未知装备的占位符
          if (!/^[。、,]{1,2}$/.test(trimmed)) {
            node = walker.nextNode()
            continue
          }
          const parent = node.parentElement
          if (!parent) {
            node = walker.nextNode()
            continue
          }
          // 整块只有标点(装饰)不算孤字
          const siblings = [...parent.childNodes].filter(n => n !== node && n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').trim())
          if (siblings.length === 0) {
            node = walker.nextNode()
            continue
          }
          const r = document.createRange()
          r.setStart(node, 0)
          r.setEnd(node, t.length)
          const box = r.getBoundingClientRect()
          if (box.width <= 0 && box.height <= 0) {
            node = walker.nextNode()
            continue
          }
          const alone = siblings.every(sn => {
            const sr = document.createRange()
            sr.setStart(sn, 0)
            sr.setEnd(sn, (sn.nodeValue || '').length)
            const sb = sr.getBoundingClientRect()
            return Math.abs(sb.top - box.top) > 4
          })
          if (alone) out.push(`«${(parent.textContent || '').trim().slice(0, 16)}»`)
          node = walker.nextNode()
        }
        return out
      })(),
      /*
       * 选择型控件每组至多一个选中。
       *
       * `aria-pressed` 是 **toggle** 语义(WAI-ARIA):一组开关可以一个都不按,
       * 也可以各自独立 —— 比如转世弹窗的天赋主题,再点一次就是取消选中(theme = null)。
       * 早先这里对它和 aria-selected 用同一条「恰有一个」,于是那类可取消的组
       * 一旦全不选就会被判成「选择组没选中态」,是脚本误报而非界面缺陷。
       * 故 aria-pressed 只查「不超过一个」:多于一个是真错(两个互斥项同时选中),
       * 一个都没有是合法的。
       */
      badGroups: (() => {
        const out = []
        for (const attr of ['aria-pressed', 'aria-selected']) {
          const byParent = new Map()
          for (const el of document.querySelectorAll(`[${attr}]`)) {
            const parent = el.parentElement
            if (!parent) continue
            byParent.set(parent, [...(byParent.get(parent) ?? []), el])
          }
          for (const [parent, els] of byParent) {
            if (els.length < 2) continue
            const on = els.filter(e => e.getAttribute(attr) === 'true').length
            // aria-pressed 允许 0(可取消的开关组);aria-selected 仍要求恰有一个
            if (attr === 'aria-pressed' ? on > 1 : on !== 1) out.push(`${attr} 组(${els.length} 项)里有 ${on} 个选中`)
          }
        }
        const tabsByParent = new Map()
        for (const el of document.querySelectorAll('[role=tab]')) {
          const parent = el.parentElement
          if (!parent) continue
          tabsByParent.set(parent, [...(tabsByParent.get(parent) ?? []), el])
        }
        for (const [, els] of tabsByParent) {
          if (els.length < 2) continue
          const on = els.filter(e => e.getAttribute('aria-selected') === 'true').length
          if (on !== 1) out.push(`页签组(${els.length} 项)里有 ${on} 个选中`)
        }
        if (location.hash.startsWith('#/settings')) {
          const pressed = document.querySelectorAll('[aria-pressed]').length
          if (pressed < 6) out.push(`设置页的选择控件只有 ${pressed} 个带 aria-pressed(主题 3 + 速度 3)`)
        }
        return out.slice(0, 3)
      })(),
      /**
       * 顶栏底栏钉死:外壳比可视区高时文档层有纵向可滚余量,两栏随窗口滚动。
       * 手机 100vh 等于大视口,无头量不出差值,只量机制:文档层可滚余量与滚窗口时两栏位移。
       */
      railDrift: (() => {
        const main = document.querySelector('main')
        const header = document.querySelector('header')
        const nav = document.querySelector('nav')
        if (!main || !header || !nav) return null
        const doc = document.documentElement
        const windowOverflow = Math.round(doc.scrollHeight - doc.clientHeight)
        const at = () => ({
          top: Math.round(header.getBoundingClientRect().top),
          bottom: Math.round(nav.getBoundingClientRect().bottom)
        })
        const before = at()
        const back = window.scrollY
        window.scrollTo(0, windowOverflow + 4000)
        const after = at()
        const moved = Math.round(window.scrollY - back)
        window.scrollTo(0, back)
        return {
          windowOverflow,
          moved,
          drift: Math.max(Math.abs(before.top - after.top), Math.abs(before.bottom - after.bottom))
        }
      })()
    }
  })
}

/**
 * 页签栏(InkTabs 的 .tab-rail)吸顶:滚过之后贴在内容区顶,且铺满内容区宽度。
 * 空档滚不动,往视图根节点里垫 1200px 占位;须垫在容器里面(吸顶盒的活动范围是它的容器),垫在外面报假红。
 */
async function measureTabRail(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const rail = document.querySelector('.tab-rail')
    const root = main?.querySelector('.stagger-in') ?? main?.firstElementChild
    if (!main || !rail || !root) return null
    const spacer = document.createElement('div')
    spacer.style.height = '1200px'
    root.appendChild(spacer)
    const mainBox = main.getBoundingClientRect()
    main.scrollTop = 600
    const box = rail.getBoundingClientRect()
    const out = {
      scrolled: Math.round(main.scrollTop),
      drift: Math.round(box.top - main.getBoundingClientRect().top),
      bleed: Math.round(box.left - mainBox.left) + Math.round(mainBox.right - box.right)
    }
    main.scrollTop = 0
    spacer.remove()
    return out
  })
}

/** 页签吸顶读数 → 失败清单(null = 无页签栏,不判) */
function railProblems(rail) {
  const out = []
  if (!rail) return out
  if (rail.scrolled < 500) out.push(`页签吸顶没量到:内容只滚了 ${rail.scrolled}px(占位没垫进容器?)`)
  // 容差 1px:两个顶各落在半像素上时,取整后差值在 0/1 间跳(1280×800 的 /codex 时红时绿)
  if (Math.abs(rail.drift) > 1) out.push(`页签栏没吸顶:滚 ${rail.scrolled}px 后偏离内容区顶 ${rail.drift}px`)
  if (rail.bleed > 0) out.push(`页签栏没铺满内容区宽度,两侧共留 ${rail.bleed}px 缝(内容会从缝里穿过去)`)
  return out
}

/** 一页读数 → 失败清单(两遍巡页共用) */
function problemsOf(info) {
  const problems = []
  if (info.horizontalOverflow) problems.push(`横向溢出(scrollWidth ${info.hash})`)
  if (info.shellShift && (info.shellShift.scrollLeft !== 0 || info.shellShift.overflowX > 1)) {
    problems.push(`外壳被滚偏(scrollLeft ${info.shellShift.scrollLeft} / 横向可滚 ${info.shellShift.overflowX}px)`)
  }
  if (info.overflows.length) problems.push(`越界元素:${info.overflows.join(', ')}`)
  if (info.unnamed.length) problems.push(`无名控件:${info.unnamed.join(' | ')}`)
  if (info.smallTargets.length) problems.push(`可点元素过小:${info.smallTargets.join(' | ')}`)
  if (info.dimDisabled.length) problems.push(`禁用态的字读不出来(对比度不足):${info.dimDisabled.join(' | ')}`)
  if (info.badGroups.length) problems.push(`选择组没选中态:${info.badGroups.join(' | ')}`)
  if (info.headerTall?.length) problems.push(`顶栏折行(数字断行看着像乱码):${info.headerTall.join(' | ')}`)
  if (info.regionCards?.tall.length) problems.push(`地界名被挤成竖排:${info.regionCards.tall.join(' | ')}`)
  if (info.regionCards?.overlap.length) problems.push(`地界卡文字互相压住:${info.regionCards.overlap.join(' | ')}`)
  if (info.verticalTexts?.length) problems.push(`文字被挤成竖排:${info.verticalTexts.join(' | ')}`)
  if (info.unitBreaks?.length) problems.push(`数字与量词被换行拆开:${info.unitBreaks.join(' | ')}`)
  if (info.orphanPunctuation?.length) problems.push(`标点被折成孤字:${info.orphanPunctuation.join(' | ')}`)
  if (info.navItems !== 5) problems.push(`底部导航 ${info.navItems} 项(应为 5)`)
  if (info.railDrift && (info.railDrift.windowOverflow > 1 || info.railDrift.drift > 1)) {
    problems.push(
      `文档层可滚 ${info.railDrift.windowOverflow}px、滚窗后两栏位移 ${info.railDrift.drift}px(顶栏底栏没钉住)`
    )
  }
  return problems
}

/** 200% 缩放档:视口减半(390 → 195 CSS px)后用 measurePage 再量;量完须还原视口,否则带偏后续读数 */
async function measureZoomScale(page, vp) {
  const width = Math.round(vp.width / 2)
  const height = Math.round(vp.height / 2)
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(420) // 等断点与 transition 走完
  const info = await measurePage(page)
  const innerWidth = await page.evaluate(() => window.innerWidth)
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.waitForTimeout(260)
  return { ...info, innerWidth }
}

/** 缩放档读数 → 失败清单 */
function zoomProblems(info, tag) {
  const problems = []
  if (info.innerWidth !== undefined && Math.abs(info.innerWidth * 2 - Number(tag)) > 2) {
    problems.push(`缩放档没量在 200% 上(布局视口 ${info.innerWidth}px)`)
  }
  if (info.horizontalOverflow) problems.push('横向溢出')
  if (info.shellShift && (info.shellShift.scrollLeft !== 0 || info.shellShift.overflowX > 1)) {
    problems.push(
      `外壳被滚偏(scrollLeft ${info.shellShift.scrollLeft} / 横向可滚 ${info.shellShift.overflowX}px)`,
    )
  }
  if (info.overflows.length) problems.push(`越界元素:${info.overflows.join(', ')}`)
  return problems
}

/** 只量可点元素尺寸,给不进 ROUTES 的欢迎/建号页用;口径同 measurePage.smallTargets */
async function measureSmallTargets(page) {
  return page.evaluate(() => {
    // 测量前禁动画(同 measurePage):入场位移会量出假越界
    const st = document.createElement('style')
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
    document.head.appendChild(st)
    return [...document.querySelectorAll('button, a, [role=button]')]
      .map(el => {
        const r = el.getBoundingClientRect()
        const declared = parseFloat(getComputedStyle(el).minHeight) || 0
        const ok = r.height >= 28 || (declared >= 28 && r.height >= 27.5)
        return { el, r, ok }
      })
      .filter(({ r, ok }) => r.width > 0 && r.height > 0 && !ok)
      .slice(0, 5)
      .map(({ el, r }) => `${r.height.toFixed(1)}px «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 14)}»`)
  })
}

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr })
  const pageErrors = []
  watchPageErrors(page, pageErrors)

  await page.goto(INDEX, { waitUntil: 'load' })
  // 欢迎页懒挂载:等「开始游戏」渲染再量,量早了是空页假绿
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().waitFor()
  {
    const welcome = await measureSmallTargets(page)
    checked += 1
    if (welcome.length) failures.push(`[${vp.tag}] 欢迎页 可点元素过小:${welcome.join(' | ')}`)
  }
  // 建号:传送门约 2.5s
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  // 隐私弹窗巡页巡不到,单独过尺子
  {
    const audit = await auditModalControls(page)
    checked += 1
    if (!audit || audit.count === 0) failures.push(`[${vp.tag}] 隐私弹窗里一个控件都没数到,判据没跑到东西`)
    if (audit && !audit.label) failures.push(`[${vp.tag}] 隐私弹窗没有可访问名(读屏只会念「对话框」)`)
    if (audit?.unnamed.length) failures.push(`[${vp.tag}] 隐私弹窗里有 ${audit.unnamed.length} 个无名控件`)
    if (audit?.small.length) failures.push(`[${vp.tag}] 隐私弹窗里可点元素过小:${audit.small.join(' | ')}`)
    if (audit?.dimDisabled.length) failures.push(`[${vp.tag}] 隐私弹窗里禁用态的字读不出来:${audit.dimDisabled.join(' | ')}`)
    if (audit?.badGroups.length) failures.push(`[${vp.tag}] 隐私弹窗里选择组没选中态:${audit.badGroups.join(' | ')}`)
  }
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('排版自检')
  {
    const create = await measureSmallTargets(page)
    checked += 1
    // 建号页懒挂载:量到空页即报错
    if ((await page.locator('button').count()) === 0) failures.push(`[${vp.tag}] 建号页 没量到任何控件,判据没跑到东西`)
    if (create.length) failures.push(`[${vp.tag}] 建号页 可点元素过小:${create.join(' | ')}`)
  }
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await page.waitForTimeout(1200)

  for (const route of ROUTES) {
    await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    const info = await measurePage(page)
    checked += 1
    const problems = problemsOf(info)
    if (problems.length) failures.push(`[${vp.tag}] ${route} → ${problems.join(' / ')}`)
    const rail = await measureTabRail(page)
    const railFails = railProblems(rail)
    if (rail) checked += 1
    if (railFails.length) failures.push(`[${vp.tag}] ${route} → ${railFails.join(' / ')}`)
    // 200% 缩放只在 390 档量
    if (vp.tag === '390') {
      const zoom = await measureZoomScale(page, vp)
      zoomSeen += 1
      const zoomBad = zoomProblems(zoom, vp.tag)
      if (zoomBad.length) failures.push(`[200%] ${route} → ${zoomBad.join(' / ')}`)
    }
    if (SHOTS) {
      mkdirSync(SHOTS_DIR, { recursive: true })
      await page.screenshot({ path: join(SHOTS_DIR, `${vp.tag}${route.replace(/\//g, '_')}.png`), fullPage: true })
    }
  }
  if (pageErrors.length) failures.push(`[${vp.tag}] 页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第四件事:存档写不进去时设置页须有提示 ----
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('存档自检')
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await page.waitForTimeout(1200)

  // 卡死存储:此后写盘都抛配额错误(引擎每秒改状态,几秒内必撞上刷盘)
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('quota', 'QuotaExceededError')
    }
  })
  await page.waitForTimeout(6500)
  await page.evaluate(() => {
    location.hash = '#/settings'
  })
  await page.waitForTimeout(800)
  // 只认设置页存档卡:App 的写盘失败 toast 同词,扫整页会误判
  const warned = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card-ink')].find(c => (c.textContent || '').includes('存档版本'))
    return (card?.textContent || '').includes('存档写入失败')
  })
  checked += 1
  if (!warned) failures.push('[375] /settings → 存档写失败时设置页没有提示(静默丢档)')
  if (pageErrors.length) failures.push(`[375] 存档失败场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第五件事:弹窗的键盘与焦点 ----
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('焦点自检')
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    location.hash = '#/settings'
  })
  await page.waitForTimeout(700)

  // 先收掉提示条再点「关于」:建号后的成就提示停两三秒,挡住入口会假红
  const stillOpen = await clearOverlays(page)
  if (stillOpen.length) failures.push(`[375] 弹窗焦点场景:动手前还开着浮层 —— ${stillOpen.join('、')}(取景没收拾干净)`)

  const trigger = page.getByRole('button', { name: /关于/ }).first()
  // 等入口画出来再点:懒加载分包 + 页面淡入,直接点偶发假红
  try {
    await trigger.waitFor({ state: 'visible', timeout: 10000 })
    await trigger.click({ timeout: 5000 })
  } catch (err) {
    const blocked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('关于'))
      if (!b) return '(页面上找不到「关于」)'
      const r = b.getBoundingClientRect()
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const modals = [...document.querySelectorAll('.modal-panel')].map(p => (p.querySelector('h3')?.textContent || '(无标题)').trim())
      return `挡路:${at ? `${at.tagName.toLowerCase()}.${String(at.className).slice(0, 40)}` : '无'} / 开着的弹窗:${modals.join('、') || '无'}`
    })
    failures.push(`[375] 弹窗焦点场景:「关于」入口点不开(${String(err).split('\n')[0]?.slice(0, 80)};${blocked})`)
  }
  await page.waitForTimeout(350)
  const opened = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel')
    const active = document.activeElement
    return {
      role: panel?.getAttribute('role'),
      modal: panel?.getAttribute('aria-modal'),
      inside: !!(panel && active && panel.contains(active))
    }
  })
  checked += 1
  if (opened.role !== 'dialog' || opened.modal !== 'true') failures.push('[375] 弹窗没有 dialog 语义(role/aria-modal)')
  if (!opened.inside) failures.push('[375] 弹窗打开后焦点没进去 —— 键盘用户不知道弹窗开了')

  const inModal = await auditModalControls(page)
  checked += 1
  if (!inModal || inModal.count === 0) failures.push('[375] 弹窗场景:面板里一个控件都没数到,判据没跑到东西')
  if (inModal && !inModal.label) failures.push('[375] 弹窗场景:对话框没有可访问名(读屏只会念「对话框」)')
  if (inModal?.unnamed.length) failures.push(`[375] 弹窗场景:面板里有 ${inModal.unnamed.length} 个无名控件(读屏只会念「按钮」)`)
  if (inModal?.small.length) failures.push(`[375] 弹窗场景:面板里可点元素过小:${inModal.small.join(' | ')}`)
  if (inModal?.dimDisabled.length) failures.push(`[375] 弹窗场景:禁用态的字读不出来:${inModal.dimDisabled.join(' | ')}`)
  if (inModal?.badGroups.length) failures.push(`[375] 弹窗场景:选择组没选中态:${inModal.badGroups.join(' | ')}`)

  let escaped = false
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => {
      const panel = document.querySelector('.modal-panel')
      const active = document.activeElement
      return !!(panel && active && panel.contains(active))
    })
    if (!inside) escaped = true
  }
  if (escaped) failures.push('[375] 弹窗里按 Tab 会跑到背后的页面(焦点没有被困住)')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const afterEsc = await page.evaluate(() => ({
    stillOpen: !!document.querySelector('.modal-panel'),
    backOnTrigger: (document.activeElement?.textContent || '').includes('关于')
  }))
  if (afterEsc.stillOpen) failures.push('[375] Esc 没能关掉弹窗')
  if (!afterEsc.backOnTrigger) failures.push('[375] 关掉弹窗后焦点没还给打开它的那个按钮')

  if (pageErrors.length) failures.push(`[375] 弹窗焦点场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第六件事:Tab 焦点可见 ----
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('焦点可见自检')
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await page.waitForTimeout(1200)
  checked += 1

  for (const route of ['/cultivation', '/settings']) {
    await page.evaluate(r => {
      location.hash = `#${r}`
    }, route)
    await page.waitForTimeout(650)
    // 清掉上一页残留的焦点再数
    await page.evaluate(() => document.activeElement?.blur())
    const seen = []
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body || el === document.documentElement) return { blind: null, label: '(body)' }
        const cs = getComputedStyle(el)
        // 透明轮廓不算可见
        const hiddenOutline = cs.outlineColor === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(cs.outlineColor)
        const ring =
          (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && !hiddenOutline) || cs.boxShadow !== 'none'
        const label = `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12)}»`
        return { blind: ring ? null : label, label }
      })
      seen.push(info.label)
      if (info.blind) failures.push(`[375] ${route} 第 ${i + 1} 个 Tab 落点看不见焦点:${info.blind}`)
    }
    if (seen.filter(s => s !== '(body)').length === 0) failures.push(`[375] ${route} 的 Tab 落点一个都没数到`)
  }
  if (pageErrors.length) failures.push(`[375] 焦点可见场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第七件事:提示条点得掉 ----
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('浮层自检')
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await page.waitForTimeout(1200)
  const hostSel = '.pointer-events-none.fixed'
  const before = await page.evaluate(sel => {
    const buttons = [...document.querySelectorAll(`${sel} button`)]
    return {
      count: buttons.length,
      // 看计算后的 pointer-events:外框写 none 时按钮继承成 none,@click 收不到事件
      blocked: buttons.filter(b => getComputedStyle(b).pointerEvents === 'none').length
    }
  }, hostSel)
  checked += 1
  if (before.count === 0) failures.push('[375] 浮层场景:一条提示都没浮出来,这条判据没跑到东西')
  if (before.blocked > 0) failures.push(`[375] 浮层场景:${before.blocked} 条提示条点了没反应(pointer-events 被外框的 none 继承)`)
  if (before.count > 0 && before.blocked === 0) {
    /*
     * 判定「关掉一条就少一条」,不按按钮文字找。
     *
     * 关闭钮的文字恒为「×」,而开局那一下往往同时浮出好几条(成就 / 灵石 / 称号)——
     * 按文字找的话,点了第一条之后别的条还挂着自己的「×」,永远匹配得到,
     * 于是无论关没关掉都判失败。改成数条数。
     */
    const bodySel = `${hostSel} [role=status] > div`
    const bodiesBefore = await page.locator(bodySel).count()
    const firstText = ((await page.locator(bodySel).first().textContent()) ?? '').replace(/\s*×\s*$/, '').trim()
    await page.locator(`${hostSel} button`).first().click({ timeout: 3000 })
    // 1 秒窗口:须短于最短提示寿命(2.6 秒);glow-pulse 无限动画会让过渡探测把离场拖成 2.4 秒
    let gone = false
    for (let i = 0; i < 20 && !gone; i += 1) {
      await page.waitForTimeout(50)
      gone = (await page.locator(bodySel).count()) < bodiesBefore
    }
    if (!gone) failures.push(`[375] 浮层场景:点了「${firstText.slice(0, 12)}」1 秒内没消失(还挂在屏幕上)`)
  }
  if (pageErrors.length) failures.push(`[375] 浮层场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第八件事:引擎按概率触发的两扇弹窗(顿悟 / 洞府巡游) ----
/*
 * Math.random 钉成 0 让引擎那一掷必中(顿悟 8% × 境界存在感、巡游每日一次),下次心跳弹出后按弹窗尺子量。
 * RandomService 构造时已抓住 Math.random 的引用,引擎其余随机数不受影响。
 */
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('引擎事件自检')
  await page.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 0
  })
  const seen = new Map()
  for (let i = 0; i < 40 && seen.size < 2; i += 1) {
    await page.waitForTimeout(500)
    const info = await page.evaluate(() => {
      const panel = document.querySelector('.modal-panel')
      if (!panel) return null
      return {
        title: (panel.querySelector('h3')?.textContent || '').trim() || '(无标题)',
        label: panel.getAttribute('aria-label'),
        role: panel.getAttribute('role'),
        controls: [...panel.querySelectorAll('button, a, [role=button]')]
          .map(el => {
            const r = el.getBoundingClientRect()
            // 口径同巡页:声明 min-height ≥28 的给半像素容差
            const declared = parseFloat(getComputedStyle(el).minHeight) || 0
            const ok = r.height >= 28 || (declared >= 28 && r.height >= 27.5)
            return { name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14), h: r.height, ok }
          })
          .filter(c => c.h > 0)
      }
    })
    if (info && !seen.has(info.title)) {
      seen.set(info.title, info)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }
  }
  checked += 1
  if (seen.size === 0) failures.push('[375] 引擎事件场景:概率钉成必中之后,两扇弹窗一扇都没浮出来(触发接线断了?)')
  for (const [title, info] of seen) {
    if (info.role !== 'dialog') failures.push(`[375] 「${title}」没有 dialog 语义(role=${info.role})`)
    if (!info.label) failures.push(`[375] 「${title}」没有可访问名`)
    const bad = info.controls.filter(c => !c.name || !c.ok)
    if (bad.length) failures.push(`[375] 「${title}」里有 ${bad.length} 个控件不合格:${bad.map(c => `${c.h.toFixed(1)}px «${c.name || '无名'}»`).join(' | ')}`)
  }
  if (pageErrors.length) failures.push(`[375] 引擎事件场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第九件事:冷启动落在子页时「返回」不退出游戏 ----
/*
 * 书签 / deep link / PWA 冷启动时首次导航即落在子页,站内无上一页,裸 router.back() 会退到 about:blank。
 * 复现用同一 context 新开一页:共享 localStorage,历史全新。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const boot = await ctx.newPage()
  await boot.goto(INDEX, { waitUntil: 'load' })
  await boot.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  await boot.locator('input[type=checkbox]').first().check()
  await boot.getByRole('button', { name: /同意并开始/ }).first().click()
  await boot.waitForTimeout(3200)
  await boot.locator('input:not([type=file]):not([type=checkbox])').first().fill('返回自检')
  await boot.getByRole('button', { name: /踏\s*入\s*仙\s*途/ }).first().click()
  await boot.waitForTimeout(1200)
  await boot.close()

  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/dongfu', { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  // 防随机引擎事件挡住「返回」
  await clearOverlays(page)
  checked += 1
  const coldBack = await page.evaluate(() => ({
    back: (window.history.state || {}).back ?? null,
    hasBack: !!document.querySelector('main button')
  }))
  if (coldBack.back) failures.push(`[375] 冷启动场景:第一次导航就落在子页,history.state.back 竟是 ${coldBack.back}(复现条件没搭对)`)
  const backBtn = page.locator('main button', { hasText: /返\s*回/ }).first()
  if ((await backBtn.count()) === 0) {
    failures.push('[375] 冷启动场景:子页上没有「返回」入口,判据没跑到东西')
  } else {
    await backBtn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => ({
      hash: location.hash,
      alive: !!document.querySelector('#app')?.firstElementChild
    }))
    if (!after.alive) failures.push('[375] 冷启动场景:点「返回」把游戏退出了(界面没了,退到站外)')
    else if (after.hash !== '#/' && after.hash !== '') failures.push(`[375] 冷启动场景:点「返回」落在 ${after.hash},父页应是 #/`)
  }
  if (pageErrors.length) failures.push(`[375] 冷启动场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十件事:后期档的逐页复核 ----
/*
 * 夹具后期档(九位数数字、法宝、器魂、在途秘境、隔夜归来):先核归来卷轴,再逐页过同一把尺子。
 * 存档密钥写在包里(见 utils/crypto 的注释:并非安全边界)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now() - 86400000 * 30, lastActiveAt: Date.now() - 9 * 3600000, totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      major: 14,
      sub: 0,
      exp: gn(3, 9),
      age: 3000,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: { count: 2, daoFruit: 12, talents: [], insight: 400, lives: [], vow: null, trial: null, bonds: [] },
      // 五系杂灵根:灵根行最挤的一档(名字 + 五个圆环 + ×倍率)
      linggen: {
        roots: [
          { element: 'fire', aptitude: 42 },
          { element: 'water', aptitude: 38 },
          { element: 'wood', aptitude: 51 },
          { element: 'metal', aptitude: 33 },
          { element: 'earth', aptitude: 29 }
        ],
        gradeName: '杂灵根',
        growthMult: 0.85
      },
      // 镇压三态须都在夹具里:qingyun 7 小时(稳定)、wanyao 71 小时(倒计时转红)、guzhanchang 满一日(繁盛)
      suppressedRegions: ['qingyun', 'wanyao', 'guzhanchang'],
      suppressQualified: ['qingyun', 'wanyao', 'guzhanchang', 'heifeng'],
      suppressedSince: {
        qingyun: Date.now() - 7 * 3600000,
        wanyao: Date.now() - 71 * 3600000,
        guzhanchang: Date.now() - 30 * 3600000
      },
      regionStats: {
        qingyun: { totalFights: 40, avgRounds: 2.1, avgDamageTakenPct: 0.05, consecutiveWins: 9, lastUpdateAt: Date.now() - 3600000 },
        wanyao: { totalFights: 60, avgRounds: 2.4, avgDamageTakenPct: 0.06, consecutiveWins: 4, lastUpdateAt: Date.now() - 3600000 },
        guzhanchang: { totalFights: 55, avgRounds: 2.8, avgDamageTakenPct: 0.09, consecutiveWins: 3, lastUpdateAt: Date.now() - 3600000 },
        // 黑风林:已取得镇压资格、仍在历练态(画出「转为镇压收益」)
        heifeng: { totalFights: 14, avgRounds: 3.9, avgDamageTakenPct: 0.18, consecutiveWins: 2, lastUpdateAt: Date.now() - 600000 }
      },
      // 在途秘境:归来卷轴说「原样保留」,历练页画「在境中」
      secretRealm: { realmId: 'sr_kurong', enteredAt: Date.now() - 600000, layer: 2, wins: 1, losses: 0, spoils: ['灵石少许'], rules: ['治疗减半'], carriedHpPct: 0.7, finished: false }
    },
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 900, page: 300, dust: 500 },
    inventory: {
      items: [
        { uid: 'late_w', templateId: 'w_zidian', quality: 'heaven', tier: 20, level: 0, affixes: [{ id: 'bs3', roll: 1 }] },
        { uid: 'late_a', templateId: 'b_xingluo', quality: 'heaven', tier: 20, level: 0, affixes: [{ id: 'low2', roll: 1 }] }
      ],
      equipped: { weapon: 'late_w', body: 'late_a' },
      pills: { p_jvqidan: 5, p_huichun: 3 },
      artifacts: [{ defId: 'af_qinglian', level: 3 }, { defId: 'af_wuxiangzhu', level: 2 }],
      equippedArtifacts: ['af_qinglian', 'af_wuxiangzhu']
    },
    endgame: {
      daoPath: 'sword',
      daoSource: 1200,
      souls: [{ uid: 'late_s1', type: 'fengmang', grade: 1, fromName: '旧剑' }],
      equippedSouls: ['late_s1'],
      // 在途远征:归来卷轴说「原样保留」,天界页画「走到第二重」
      worldRun: {
        worldId: 'chiyan',
        pactId: null,
        gateId: null,
        layer: 1,
        bonus: 12,
        rows: [{ foeName: '焰魄', win: true, rounds: 7, hpLeftPct: 0.62 }],
        carriedHpPct: 0.62,
        totalRounds: 7,
        winStacks: 1
      }
    },
    // 解锁到黑风林一带:「镇压中 / 已取得资格」两种卡片都要渲染
    adventure: {
      unlocked: ['qingyun', 'luoxia', 'heifeng', 'wanyao', 'cangwu', 'guzhanchang'],
      cleared: ['qingyun', 'luoxia', 'heifeng', 'wanyao'],
      mortalCleared: [],
      session: null,
      pendingEventId: null,
      pendingEventSince: 0,
      seenOnceEvents: [],
      lastBattle: null,
      eventMemories: {}
    },
    // 洞府等级:代价「2,798 石 · 50 铁」;空档只有「200 石 20 铁」,量不出数字与量词被换行拆开。
    // 灵脉已投两位数:「营造」右侧入口够宽,200% 档才量得出它撑不撑破标题行
    dongfu: {
      levels: { mansion: 4, field: 5, alchemy: 5, forge: 4, library: 4 },
      offlineCapHours: 24,
      veinPoints: { gather: 52 },
      veinMain: 'gather'
    },
    settings: {
      privacyAccepted: true,
      sfxOn: false,
      musicOn: false,
      musicVol: 0,
      sfxVol: 0,
      reduceMotion: true,
      battleSpeed: 4,
      decomposeRanks: [],
      smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
      theme: 'dark'
    }
  }
  // payload 只做一次,320 那一遍复用;播种加闸(见第十四件事)
  const latePayload = Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  await ctx.addInitScript(decisivePayload => {
    if (localStorage.getItem('__layoutSeeded')) return
    for (const [k, v] of Object.entries(decisivePayload)) localStorage.setItem(k, v)
    localStorage.setItem('__layoutSeeded', '1')
  }, latePayload)
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2600)

  // (一)归来卷轴:不漏 NaN,收下即关
  checked += 1
  const offline = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel')
    if (!panel) return null
    const text = panel.innerText || ''
    return {
      label: panel.getAttribute('aria-label'),
      text: text.slice(0, 200),
      leaks: /NaN|undefined|Infinity/.test(text),
      rows: text.split('\n').filter(l => l.includes('+')).length
    }
  })
  if (!offline) {
    failures.push('[390] 后期档:隔夜 9 小时开局,「归来卷轴」没有弹出来')
  } else {
    if (!offline.label) failures.push('[390] 后期档:归来卷轴没有可访问名')
    if (offline.leaks) failures.push(`[390] 后期档:归来卷轴漏出占位符 —— ${offline.text.slice(0, 60)}`)
    if (offline.rows === 0) failures.push('[390] 后期档:归来卷轴一条收益都没列')
    const take = page.locator('.modal-panel button', { hasText: /收\s*下/ }).first()
    if ((await take.count()) === 0) failures.push('[390] 后期档:归来卷轴没有「收下」')
    else {
      await take.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(700)
      if (await page.locator('.modal-panel').count()) failures.push('[390] 后期档:点了「收下」归来卷轴没关掉')
    }
  }

  // (二)后期档逐页:与空档同一把尺子
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  await page.waitForTimeout(400)
  for (const route of ['/', '/cultivation', '/adventure', '/inventory', '/character', '/celestial', '/souls', '/collection', '/build', '/dongfu']) {
    await page.goto(INDEX + '#' + route, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    const info = await measurePage(page)
    checked += 1
    const problems = problemsOf(info)
    if (problems.length) failures.push(`[390-late] ${route} → ${problems.join(' / ')}`)
    const rail = await measureTabRail(page)
    const railFails = railProblems(rail)
    if (rail) checked += 1
    if (railFails.length) failures.push(`[390-late] ${route} → ${railFails.join(' / ')}`)
    // 200% 缩放:与空档同一把尺子,后期档才有的长数字、灵脉入口在这里量
    const zoom = await measureZoomScale(page, { width: 390, height: 844 })
    zoomSeenLate += 1
    const zoomBad = zoomProblems(zoom, '390')
    if (zoomBad.length) failures.push(`[200%-late] ${route} → ${zoomBad.join(' / ')}`)
  }

  // (三)在途秘境真点一次「再入一层」:要么浮出战报,要么卡片状态前移(层数/败次/探尽)
  await page.goto(INDEX + '#' + '/adventure', { waitUntil: 'load' })
  await page.waitForTimeout(800)
  checked += 1
  const beforeText = await page.evaluate(() => document.querySelector('main')?.innerText || '')
  const fightAgain = page.locator('main button', { hasText: /再\s*入\s*一\s*层/ }).first()
  if ((await fightAgain.count()) === 0) {
    failures.push('[390-late] 历练页:在途秘境没有「再入一层」入口 —— 夹具的秘境没被读出来?')
  } else {
    await fightAgain.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => ({
      text: document.querySelector('main')?.innerText || '',
      toasts: [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim())
    }))
    if (after.toasts.length === 0 && after.text === beforeText) {
      failures.push('[390-late] 历练页:点了「再入一层」既没战报也没变化(点了没反应)')
    }
    if (/NaN|undefined/.test(after.text + after.toasts.join(' '))) failures.push('[390-late] 历练页:秘境推进后漏出占位符')
    console.log(
      `  在途秘境推进一步:${after.toasts.length ? `战报「${after.toasts[0]?.slice(0, 26)}」` : '卡片状态前移'}` +
        `${after.toasts.length > 1 ? ` 等 ${after.toasts.length} 条` : ''}`
    )
  }
  if (pageErrors.length) failures.push(`[390] 后期档页面异常:${[...new Set(pageErrors)].join(' | ')}`)

  // (四)在途远征(赤炎天第二重,天界页直接开在远征册)真点一次择路:要么浮出战报,要么行程点列前移
  await page.goto(INDEX + '#' + '/celestial', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  checked += 1
  const runBefore = await page.evaluate(() => document.querySelector('main')?.innerText || '')
  // 入口:择路按钮写「道源 +N」(层号不在按钮里);走到界主时换成「决战」
  const pickNode = page.locator('main button', { hasText: /道源 \+\d+/ }).first()
  const runEntry = (await pickNode.count()) > 0 ? pickNode : page.locator('main button', { hasText: /决\s*战/ }).first()
  if (!/远征 ·/.test(runBefore)) {
    failures.push('[390-late] 天界页:在途远征没有渲染出来(夹具的 worldRun 没被读出来?)')
  } else if ((await runEntry.count()) === 0) {
    failures.push('[390-late] 天界页:在途远征没有可推进一步的入口(既无择路也无决战)')
  } else {
    const clicked = ((await runEntry.textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 18)
    await runEntry.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => ({
      text: document.querySelector('main')?.innerText || '',
      toasts: [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()),
      // 打输开战报弹窗;赢了只前移行程点列
      report: (document.querySelector('.modal-panel h3')?.textContent || '').trim()
    }))
    if (!after.report && after.toasts.length === 0 && after.text === runBefore) {
      failures.push('[390-late] 天界页:点了远征的推进入口既没战报也没变化(点了没反应)')
    }
    // 战报标题须叫得出这一界:收尾那场会清空 worldRun,先打后读则退成「远征」
    if (after.report && after.report !== '赤炎天') {
      failures.push(`[390-late] 天界页:远征战报弹窗标题是「${after.report}」,应为这一界的名字(赤炎天)`)
    }
    if (/NaN|undefined/.test(after.text + after.toasts.join(' ') + after.report)) failures.push('[390-late] 天界页:远征推进一步后漏出占位符')
    console.log(
      `  在途远征推进一步(点了「${clicked}」):` +
        (after.report ? `战报弹窗「${after.report}」` : after.toasts.length ? `战报「${after.toasts[0]?.slice(0, 24)}」` : '行程点列前移')
    )
  }
  if (pageErrors.length) failures.push(`[390] 后期档页面异常(远征):${[...new Set(pageErrors)].join(' | ')}`)

  /*
   * (四续)天道试炼:切到「试炼」册真按一次应试,须开出战报、写清止步/功成与赏格、不漏占位符。
   * 须另起无在途活动的夹具:终局共用 endgameBusy,在途秘境/远征会把应试按钮置灰。
   */
  {
    const idleSlices = {
      ...slices,
      player: { ...slices.player, secretRealm: null },
      endgame: { ...slices.endgame, worldRun: null }
    }
    const idlePayload = Object.fromEntries(Object.entries(idleSlices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
    const trialCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await trialCtx.addInitScript(decisivePayload => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(decisivePayload)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    }, idlePayload)
    const trialPage = await trialCtx.newPage()
    const trialErrors = []
    watchPageErrors(trialPage, trialErrors)
    await trialPage.goto(INDEX + '#' + '/celestial', { waitUntil: 'load' })
    await trialPage.waitForTimeout(1600)
    await clearOverlays(trialPage)
    // 收掉提示条再切册:toast(top-12 的 fixed 层)盖住「试炼」那格时会截走点击
    await trialPage.evaluate(() => {
      for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    })
    // 归来卷轴/引擎弹窗也可能盖住页签,再收一轮
    for (let i = 0; i < 3; i += 1) {
      if ((await trialPage.locator('.modal-panel').count()) > 0) await trialPage.keyboard.press('Escape')
      await trialPage.waitForTimeout(250)
    }
    await trialPage.evaluate(() => {
      for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    })
    const trialTab = trialPage.getByRole('tab', { name: /试\s*炼/ }).first()
    if ((await trialTab.count()) === 0) failures.push('[390-late] 天界页:找不到「试炼」册')
    else {
      // 页签切不过去时用 JS 直点兜底:toast 是浮层,挡不住 el.click()
      await trialTab.click({ timeout: 3000 }).catch(() => trialTab.evaluate(el => el.click()).catch(() => {}))
      await trialPage.waitForTimeout(500)
      checked += 1
      const trialBtn = trialPage.locator('main button', { hasText: /应\s*试/ }).first()
      if ((await trialBtn.count()) === 0) failures.push('[390-late] 试炼册里没有「应试」入口(判据没跑到东西)')
      else {
        const trialName = ((await trialBtn.textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 20)
        if (/在途|身在秘境/.test(trialName)) {
          failures.push(`[390-late] 试炼:夹具已摘掉在途活动,应试仍写着「${trialName}」—— 闸门误判`)
        }
        // 按标题认试炼那一扇:屏上常叠着几扇窗(归来卷轴、引擎弹窗),第一扇未必是战报
        const trialAfter = async () => await trialPage.evaluate(() => {
          const panels = [...document.querySelectorAll('.modal-panel')]
          const panel = panels.find(p => /试炼/.test(p.querySelector('h3')?.textContent || ''))
          const text = panel?.innerText || ''
          return {
            title: (panel?.querySelector('h3')?.textContent || '').trim(),
            text: text.replace(/\n+/g, ' ').slice(0, 90),
            rows: panel ? panel.querySelectorAll('p, li').length : 0,
            leaks: /NaN|undefined|Infinity/.test(text)
          }
        })
        const clickTrial = async () => {
          await trialBtn.click({ timeout: 4000 }).catch(() => trialBtn.evaluate(el => el.click()).catch(() => {}))
        }
        // 应试按钮在 toast 层底下,真实点击可能被截走:最多试两轮,每轮等面板浮出
        let after = await trialAfter()
        const opened = () => after.title.includes('试炼')
        for (let attempt = 0; attempt < 2 && !opened(); attempt += 1) {
          await clickTrial()
          await trialPage.waitForSelector('.modal-panel', { timeout: 6000 }).catch(() => {})
          await trialPage.waitForTimeout(400)
          after = await trialAfter()
        }
        if (!after.title) failures.push(`[390-late] 试炼:点了「${trialName}」没有开出战报`)
        else {
          // 战报的两种口径:全捷(打通)或止步第 N 战
          if (!/全捷|止步第/.test(after.text)) failures.push(`[390-late] 试炼:战报没写清结果 —— ${after.text}`)
          if (after.leaks) failures.push('[390-late] 试炼:战报漏出占位符')
          console.log(`  天道试炼(点了「${trialName}」):战报「${after.title}」· ${after.text.slice(0, 34)}…`)
          await trialPage.keyboard.press('Escape')
          await trialPage.waitForTimeout(400)
        }
      }
    }
    if (trialErrors.length) failures.push(`[390] 后期档页面异常(试炼):${[...new Set(trialErrors)].join(' | ')}`)
    await trialCtx.close()
  }
  await ctx.close()

  // (五)后期档在 320 再过一遍:主巡页的 320 只量空档,「长数字 + 满屏内容 + 最窄屏」最易撑破(防回归)
  {
    const narrow = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await narrow.addInitScript(decisivePayload => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(decisivePayload)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    }, latePayload)
    const p = await narrow.newPage()
    const errs = []
    watchPageErrors(p, errs)
    await p.goto(INDEX, { waitUntil: 'load' })
    await p.waitForTimeout(2400)
    await clearOverlays(p)
    for (const route of ROUTES) {
      await p.goto(INDEX + '#' + route, { waitUntil: 'load' })
      await p.waitForTimeout(600)
      const info = await measurePage(p)
      checked += 1
      const problems = problemsOf(info)
      if (problems.length) failures.push(`[320-late] ${route} → ${problems.join(' / ')}`)
    }
    if (errs.length) failures.push(`[320] 后期档页面异常:${[...new Set(errs)].join(' | ')}`)
    await narrow.close()
  }
}

// ---- 第十一件事:渡劫突破真打一次 ----
/*
 * 另起「炼气圆满」夹具(空档按钮是灰的,后期档未必卡在大关),点「引劫突破」真打一次。
 * 成败随机,判据只看形状:开出结果弹窗、写清成败与雷数、不漏占位符,成功须与页面境界对得上。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    // 炼气·圆满(大关);寿元已尽会被「寿元将尽」截住
    player: { major: 0, sub: 9, exp: gn(9, 30), age: 16, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 30, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'fire', aptitude: 90 }], gradeName: '单灵根', growthMult: 1.2 } },
    resources: { spiritStone: gn(3, 6), qi: 9999999, wudao: 300, herb: 400, ore: 400, page: 90, dust: 120 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/cultivation', { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)
  checked += 1
  const tribBtn = page.locator('main button', { hasText: /引\s*劫\s*突\s*破/ }).first()
  if ((await tribBtn.count()) === 0) {
    failures.push('[390] 渡劫场景:修为灵气给足、卡在炼气圆满,却没出现「引劫突破」(判据没跑到东西)')
  } else {
    await tribBtn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(1600)
    const view = await page.evaluate(() => {
      // 只认突破结果那一扇:屏上可能同时浮着别的(顿悟/巡游)
      const panels = [...document.querySelectorAll('.modal-panel')]
      const panel = panels.find(p => /突破成功|突破失败/.test(p.innerText || '')) ?? null
      const text = panel?.innerText || ''
      return {
        found: !!panel,
        others: panels.map(p => (p.querySelector('h3')?.textContent || p.getAttribute('aria-label') || '无标题').trim()).join('、'),
        text,
        label: panel?.getAttribute('aria-label') ?? null,
        outcome: /突破成功/.test(text) ? '成功' : /突破失败/.test(text) ? '失败' : null,
        hasWave: /共\s*\d+\s*道/.test(text),
        realm: (document.body.innerText.match(/炼气|筑基/) || [''])[0]
      }
    })
    if (!view.found) failures.push(`[390] 渡劫场景:点了「引劫突破」没有开出结果弹窗(此刻开着的是:${view.others || '无'})`)
    if (view.found) {
      if (!view.outcome) failures.push(`[390] 渡劫场景:结果弹窗没写清成败 —— ${view.text.slice(0, 40)}`)
      if (!view.hasWave) failures.push('[390] 渡劫场景:渡劫结果里没有雷数(「共 N 道」)')
      if (/NaN|undefined|Infinity/.test(view.text)) failures.push('[390] 渡劫场景:结果弹窗漏出占位符')
      if (view.outcome === '成功' && view.realm !== '筑基') {
        failures.push(`[390] 渡劫场景:弹窗说成功,页面上的境界却还是「${view.realm}」`)
      }
      // 「知道了」全站通用:只认突破结果那一扇里的那一枚
      const close = page.locator('.modal-panel', { hasText: /突破成功|突破失败/ }).locator('button', { hasText: /知道了/ }).first()
      if ((await close.count()) === 0) failures.push('[390] 渡劫场景:结果弹窗没有收尾按钮')
      else {
        await close.click({ timeout: 3000 }).catch(() => {})
        await page.waitForTimeout(600)
        if (await page.locator('.modal-panel').count()) failures.push('[390] 渡劫场景:点了收尾按钮弹窗没关掉')
      }
    }
    console.log(`\n渡劫突破:${view.outcome ?? '(没写成败)'} · 雷数${view.hasWave ? '有' : '缺'} · 页面境界 ${view.realm}`)
  }
  if (pageErrors.length) failures.push(`[390] 渡劫场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十二件事:走完一次转世(寿元将尽 → 此生已矣 → 轮回 → 新的一世) ----
/*
 * 转世是唯一会把存档推倒重来的流程:三步弹窗 + 择姿立题 + 新的一世。
 * 夹具把寿元写尽(一读档引擎就判定身故),然后一路点下去。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now() - 86400000 * 60, lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      major: 5,
      sub: 3,
      exp: gn(2, 7),
      age: 99999,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: { count: 1, daoFruit: 9, talents: [], insight: 120, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 90 }], gradeName: '单灵根', growthMult: 1.2 }
    },
    resources: { spiritStone: gn(4, 6), qi: 4000, wudao: 500, herb: 300, ore: 300, page: 60, dust: 80 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  // 只钉随机、收提示条,不关弹窗:开着的「寿元将尽」就是起点(故意不可关)
  // 钉随机:免得途中掷出顿悟/巡游浮层,搅红「关没关干净」的判据
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  await page.waitForTimeout(400)

  const readPanel = () =>
    page.evaluate(() => {
      const p = document.querySelector('.modal-panel')
      if (!p) return null
      return {
        title: (p.querySelector('h3')?.textContent || p.getAttribute('aria-label') || '').trim(),
        text: (p.innerText || '').replace(/\n+/g, ' '),
        buttons: [...p.querySelectorAll('button')].map(b => (b.textContent || '').trim())
      }
    })
  const step = async (label, expect) => {
    checked += 1
    const p = await readPanel()
    if (!p) {
      failures.push(`[390] 转世场景:${label}没有弹出对应的窗`)
      return null
    }
    if (!expect.test(p.title)) failures.push(`[390] 转世场景:${label}的窗标题是「${p.title}」,不是预期的${expect}`)
    if (/NaN|undefined|Infinity/.test(p.text)) failures.push(`[390] 转世场景:${label}漏出占位符 —— ${p.text.slice(0, 50)}`)
    return p
  }

  const death = await step('读档后(身故)', /寿元将尽/)
  if (death && !/兵解转世/.test(death.buttons.join(' '))) failures.push('[390] 转世场景:身故那屏没有「兵解转世」')
  await page.locator('.modal-panel button', { hasText: /兵\s*解\s*转\s*世/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(900)

  const review = await step('兵解后(回顾)', /此生已矣/)
  if (review && !/宿慧/.test(review.text)) failures.push('[390] 转世场景:回顾那一程没有交代宿慧')
  await page.locator('.modal-panel button', { hasText: /往\s*生/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(800)

  const next = await step('往生后(择姿立题)', /轮回/)
  if (next && !/道果/.test(next.text)) failures.push('[390] 转世场景:轮回那一程没有交代道果')
  // 有先天之姿就先择一个(不择则「踏入轮回」是灰的)。
  // 按品阶名找,不取面板首个按钮:来世灵根那块的「逆天改命」排在天赋之前,点了只会重刷灵根。
  const talent = page.locator('.modal-panel button', { hasText: /赋|姿/ }).first()
  if (next && next.buttons.some(b => /赋|姿/.test(b))) await talent.click({ timeout: 3000 }).catch(() => {})
  const confirm = page.locator('.modal-panel button', { hasText: /踏\s*入\s*轮\s*回/ }).first()
  if ((await confirm.count()) === 0) failures.push('[390] 转世场景:轮回那程没有「踏入轮回」')
  else {
    if (await confirm.isDisabled()) failures.push('[390] 转世场景:择了先天之姿,「踏入轮回」仍是灰的')
    await confirm.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(1800)
    const after = await page.evaluate(() => ({
      // 只认转世那几扇窗:新的一世里引擎随时可能浮出顿悟/巡游,不算没走完
      rebirthStillOpen: [...document.querySelectorAll('.modal-panel')]
        .map(p => (p.querySelector('h3')?.textContent || p.getAttribute('aria-label') || '').trim())
        .filter(t => /寿元将尽|此生已矣|轮回/.test(t)),
      text: (document.querySelector('main')?.innerText || '').replace(/\n+/g, ' ').slice(0, 200)
    }))
    if (after.rebirthStillOpen.length) failures.push(`[390] 转世场景:点「踏入轮回」之后还留着转世的窗 —— ${after.rebirthStillOpen.join('、')}`)
    if (/炼虚|99999/.test(after.text)) failures.push('[390] 转世场景:转世之后页面上还写着上一世的境界/寿数')
    console.log(`\n转世:${[death?.title, review?.title, next?.title].filter(Boolean).join(' → ')} → 新的一世(${after.text.slice(0, 24)}…)`)
  }
  if (pageErrors.length) failures.push(`[390] 转世场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十三件事:挂机引擎在跑(页面上的数自己在涨) ----
/*
 * 单测直接调引擎,测不出 engine.start() 被挡、tick 被掐(界面冻住、单测全绿)。
 * 灵气只给 1 点,真等两轮看它自己涨不涨。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      major: 5,
      sub: 3,
      exp: gn(1, 2),
      age: 40,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 }
    },
    resources: { spiritStone: gn(1, 5), qi: 1, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)
  // 灵气只在修炼页常驻(顶栏只留灵石)
  await page.goto(INDEX + '#/cultivation', { waitUntil: 'load' })
  await page.waitForTimeout(600)
  checked += 1
  const readQi = () => readFormatted(page, '灵气')
  const first = await readQi()
  await page.waitForTimeout(3200)
  const second = await readQi()
  await page.waitForTimeout(3200)
  const third = await readQi()
  const nums = [first.value, second.value, third.value]
  if (nums.some(v => v === null || !Number.isFinite(v))) {
    failures.push(`[390] 挂机场景:灵气读数解析不出来 —— ${[first, second, third].map(x => x.text).join(' / ')}`)
  } else if (!(nums[2] > nums[0] && nums[0] <= nums[1] && nums[1] <= nums[2])) {
    // 不要求每步严格变大:灵气到上限会平下来
    failures.push(`[390] 挂机场景:灵气没有在涨(页面上的数冻住了 —— 引擎没跑?) ${nums.join(' → ')}`)
  } else {
    console.log(`\n挂机 6 秒:灵气 ${first.text} → ${second.text} → ${third.text}(页面上的数自己在涨)`)
  }
  if (pageErrors.length) failures.push(`[390] 挂机场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十四件事:导出 → 改动 → 导入回来 ----
/*
 * 判据用不会自己变的数(灵石;夹具无洞府产出):导出时 S0 → 投灵脉花掉 → 导入 → 须回到 S0。
 * 会触发重载,夹具须只种一次:addInitScript 每次导航都跑,不加闸会把刚导入的存档盖回夹具。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '存读自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  const savePath = '/tmp/layout-roundtrip.save'
  /** 磁盘上那一份灵石(解密 resources 分片;GNum 是 m×10^e) */
  const storedStone = async () => {
    const cipher = await page.evaluate(() => localStorage.getItem('yunyin.resources') || '')
    if (!cipher) return null
    const plain = CryptoJS.AES.decrypt(cipher, SAVE_SECRET).toString(CryptoJS.enc.Utf8)
    if (!plain) return null
    const v = JSON.parse(plain).spiritStone
    return typeof v === 'number' ? v : v.m * Math.pow(10, v.e)
  }
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)
  checked += 1
  const s0 = await readFormatted(page, '灵石')
  let downloaded = ''
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.getByRole('button', { name: /导出存档/ }).first().click()
    ])
    downloaded = download.suggestedFilename()
    await download.saveAs(savePath)
  } catch (err) {
    failures.push(`[390] 存读场景:点「导出存档」没有拿到下载(${String(err).split('\n')[0]?.slice(0, 60)})`)
  }
  if (downloaded && !/\.save$/.test(downloaded)) failures.push(`[390] 存读场景:导出的文件名不像存档(${downloaded})`)

  // 投一点灵脉花掉灵石:灵脉投资在洞府页「营造」右侧,点开是弹窗
  await page.goto(INDEX + '#' + '/dongfu', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /灵脉投资/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  const invest = page.locator('#vein-panel button.btn-ghost:not([disabled])').first()
  let spent = null
  if ((await invest.count()) === 0) failures.push('[390] 存读场景:灵脉弹窗里没有可投的脉(判据没跑到东西)')
  else {
    await invest.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    spent = await readFormatted(page, '灵石')
    if (!(spent.value < s0.value)) {
      failures.push(`[390] 存读场景:投了灵脉灵石却没少(${s0.text} → ${spent.text}),后面的导入就证明不了什么`)
    }
    // 等节流把改动写进磁盘再导入:否则「导入后回到 S0」与「压根没写进去」读数上分不出
    await page.waitForTimeout(5600)
    const onDisk = await storedStone()
    if (spent.value !== null && (onDisk === null || Math.abs(onDisk - spent.value) > spent.value * 0.01)) {
      failures.push(`[390] 存读场景:投入之后磁盘上的灵石是 ${onDisk},页面上是 ${spent.text} —— 改动没落盘,这条判据没搭对`)
    }
  }

  // 导入回来:灵石须回到 S0
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    window.__beforeImport = 'alive'
  })
  await page.locator('input[type=file]').first().setInputFiles(savePath)
  await page.waitForTimeout(500)
  // 导入先弹确认(与重置同纪律),点「确认导入」才落库
  await page.getByRole('button', { name: /确认导入/ }).click({ timeout: 3000 })
  await page.waitForTimeout(700)
  const toast = await page.evaluate(() => [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|'))
  await page.waitForTimeout(2600)
  const after = await readFormatted(page, '灵石')
  const reloaded = await page.evaluate(() => window.__beforeImport === undefined)
  if (!/导入成功/.test(toast)) failures.push(`[390] 存读场景:导入没有成功提示(${toast || '无提示'})`)
  if (!reloaded) failures.push('[390] 存读场景:导入之后没有重新入定(页面没重载,内存里还是旧的一世)')
  if (spent && after.value !== null && Math.abs(after.value - s0.value) > s0.value * 0.001) {
    failures.push(`[390] 存读场景:导入后灵石 ${after.text},导出时是 ${s0.text}(存档没救回来)`)
  }
  const diskAfter = await storedStone()
  if (spent && diskAfter !== null && Math.abs(diskAfter - s0.value) > s0.value * 0.001) {
    failures.push(`[390] 存读场景:导入后磁盘上的灵石是 ${diskAfter},导出时是 ${s0.value}(写盘那份没换回来)`)
  }
  if (pageErrors.length) failures.push(`[390] 存读场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  console.log(`\n存读往返:导出时 ${s0.text} → 投脉后 ${spent?.text ?? '(没投成)'} → 导入后 ${after.text}`)
  rmSync(savePath, { force: true })
  await ctx.close()
}

// ---- 第二十六件事:智能收纳留下有投入的件 ----
/*
 * 该留的三类:练过的(+N / 重铸 / 封存)、成套共鸣件、词条近满件。
 *   一 清理确认框件数 = 该清件数(夹具 5 件里 2 件废物);
 *   二 清理后正好留下那 3 件(行囊 5 → 3),练过那件的「+3」还在。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '收纳自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 0 },
    inventory: {
      items: [
        // 两件该清:凡品、不带套、无词条或词条低
        { uid: 'j1', templateId: 'b_qingyun', quality: 'mortal', tier: 3, level: 0, affixes: [] },
        { uid: 'j2', templateId: 'b_qingyun', quality: 'mortal', tier: 3, level: 0, affixes: [{ id: 'atk1', roll: 0.12 }] },
        // 三件该留:练过(有投入)/ 成套共鸣 / 词条近满
        { uid: 'k_lv', templateId: 'b_qingyun', quality: 'mortal', tier: 3, level: 3, affixes: [], invested: { dust: 40, stone: gn(2, 3) } },
        { uid: 'k_set', templateId: 'w_xuantie', quality: 'mortal', tier: 3, level: 0, affixes: [] },
        { uid: 'k_roll', templateId: 'h_muzan', quality: 'mortal', tier: 3, level: 0, affixes: [{ id: 'atk1', roll: 0.95 }, { id: 'def1', roll: 0.9 }] }
      ],
      equipped: {},
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true, keepPerfectRolls: true, keepSetPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  const bagCount = () =>
    page.evaluate(() => {
      const m = /行囊\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
      return m ? Number(m[1]) : null
    })
  const opened = await page
    .locator('main button', { hasText: /收纳/ })
    .first()
    .click({ timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!opened) failures.push('[390] 收纳场景:行囊页找不到「收纳」入口')
  else {
    await page.waitForTimeout(400)
    const before = await bagCount()
    if (before !== 5) failures.push(`[390] 收纳场景:夹具没铺好 —— 开局行囊 ${before} 件(应为 5)`)
    const armed = await page
      .locator('.modal-panel button', { hasText: /清理行囊/ })
      .first()
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (!armed) failures.push('[390] 收纳场景:找不到「清理行囊」按钮')
    await page.waitForTimeout(300)
    const warn = await page.evaluate(() => (document.querySelector('.modal-panel')?.innerText || '').replace(/\n+/g, ' '))
    // 确认框两式都认:「共 N 件」/「将化尘 N 件 · 可得…」
    const promisedCount = Number((/将化尘\s*(\d+)\s*件/.exec(warn) || /共\s*(\d+)\s*件/.exec(warn) || [])[1] ?? NaN)
    if (promisedCount !== 2) {
      failures.push(`[390] 收纳场景:该清的只有 2 件废物,确认框写的是 ${promisedCount} 件 —— 练过/成套/近满的件被算进了清理名单(${warn.slice(0, 90)})`)
    }
    await page.locator('.modal-panel button', { hasText: /清理化尘/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(900)
    const after = await bagCount()
    const body = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\n+/g, ' '))
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
    )
    if (after !== 3) failures.push(`[390] 收纳场景:清理后行囊剩 ${after} 件(应为 3 —— 那 3 件有投入的必须留下)`)
    if (!/已化尘 2 件/.test(toast)) failures.push(`[390] 收纳场景:清理后的交代不对(${toast || '无提示'})`)
    for (const [uid, name] of [['k_set', '玄铁重剑'], ['k_roll', '桃木簪']]) {
      if (!body.includes(name)) failures.push(`[390] 收纳场景:${name}(${uid})被自动清理了`)
    }
    if (!/\+3/.test(body)) failures.push('[390] 收纳场景:练过的那件(+3)被自动清理了')
    if (after === 3 && promisedCount === 2) {
      console.log(`\n智能收纳:行囊 5 件 → 确认框「${promisedCount} 件」→ 清理后 ${after} 件(练过/成套/近满三件都留下)`)
    }
  }
  if (pageErrors.length) failures.push(`[390] 收纳场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十五件事:一键分解先勾后点 ----
/*
 * 勾选品质只是标记,不是执行:
 *   一 勾上「精品」后行囊件数不变,不出「化作器灵尘」的交代;
 *   二 点「分 解(2 件)」后才减少,且有交代。
 * 练过的件按八成退强化投入:夹具一件 0 级、一件 +4(投入尘 100 / 灵石 8000),
 * 返还 = 底材4 + (底材4 + 八成尘80) = 88 尘 + 灵石 6400;提示数须与器灵尘栏实涨数一致。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '分解自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 0 },
    inventory: {
      items: [
        { uid: 'b_1', templateId: 'b_qingyun', quality: 'excellent', tier: 3, level: 0, affixes: [] },
        { uid: 'b_2', templateId: 'b_qingyun', quality: 'excellent', tier: 3, level: 4, affixes: [], invested: { dust: 100, stone: gn(8, 3) } }
      ],
      equipped: {},
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  /** 行囊件数(只读 main;弹窗 Teleport 到 body,不在这棵子树里) */
  const bagCount = () =>
    page.evaluate(() => {
      const m = /行囊\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
      return m ? Number(m[1]) : null
    })
  /** 背包页顶上那栏「器灵尘 N」 */
  const dustCount = () =>
    page.evaluate(() => {
      const m = /器灵尘\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
      return m ? Number(m[1]) : null
    })
  const toasts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
    )
  const opened = await page
    .locator('main button', { hasText: /^分解$/ })
    .first()
    .click({ timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!opened) failures.push('[390] 分解场景:行囊页找不到「分解」入口')
  else {
    await page.waitForTimeout(400)
    const before = await bagCount()
    if (before !== 2) failures.push(`[390] 分解场景:夹具没铺好 —— 开局行囊 ${before} 件(应为 2)`)
    const box = page.locator('.modal-panel label', { hasText: '精品' }).locator('input[type=checkbox]').first()
    const ticked = await box
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (!ticked) failures.push('[390] 分解场景:弹窗里找不到「精品」的勾选框')
    await page.waitForTimeout(900)
    const marked = await bagCount()
    const markedToast = await toasts()
    if (marked !== 2) failures.push(`[390] 分解场景:只勾了「精品」,行囊就从 ${before} 件变成 ${marked} 件 —— 勾选把东西当场烧了(应先标记、等「分 解」)`)
    if (/化作器灵尘/.test(markedToast)) failures.push(`[390] 分解场景:勾选品质就弹了销毁交代(${markedToast})—— 玩家还没点「分 解」`)
    const footLabel = ((await page.locator('.modal-panel footer button').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    if (!/分\s*解\s*\(2\s*件\)/.test(footLabel)) {
      failures.push(`[390] 分解场景:勾选后按钮没写出「会拆几件」——「${footLabel}」`)
    }
    if (marked === 2) {
      const dustBefore = await dustCount()
      await page.locator('.modal-panel footer button').first().click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(900)
      const after = await bagCount()
      const afterToast = await toasts()
      if (after !== 0) failures.push(`[390] 分解场景:点了「分 解」行囊还剩 ${after} 件(两件精品都该拆掉)`)
      if (!/已化尘 2 件/.test(afterToast)) failures.push(`[390] 分解场景:点「分 解」之后没有交代(${afterToast || '无提示'})`)
      const promised = Number((/得器灵尘×(\d+)/.exec(afterToast) || [])[1] ?? NaN)
      const dustAfter = await dustCount()
      if (promised !== 88) {
        failures.push(`[390] 分解场景:两件精品(其中一件 +4,记账投入尘 100)该退 88 尘,提示写的是 ${promised}`)
      }
      if (!/灵石退还\s*6,400/.test(afterToast)) failures.push(`[390] 分解场景:练过的件没退灵石(记了 8000,该退 6400)—— ${afterToast}`)
      if (dustBefore === null || dustAfter === null || dustAfter - dustBefore !== promised) {
        failures.push(`[390] 分解场景:提示说给 ${promised} 尘,器灵尘那一栏 ${dustBefore} → ${dustAfter}(所见非所得)`)
      }
      if (promised === 88 && dustAfter - dustBefore === 88) {
        console.log(`\n一键分解:勾「精品」行囊仍是 ${marked} 件(未烧) · 「${footLabel}」→ 行囊 ${after} 件 · 得尘 ${promised}(对上,含强化八成)· 退灵石 6,400`)
      }
    }
  }
  if (pageErrors.length) failures.push(`[390] 分解场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十四件事:法宝炼化的两笔账 ----
/*
 * 炼化扣悟道点与灵石(见 forge.artifactUpCost)。
 * 判据:按钮写全两种代价;两种都按所写扣(读磁盘精确值,等开局奖励落定)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '炼化自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 7), qi: 1000, wudao: 5000, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [{ defId: 'af_lihuo', level: 0 }], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  /** 磁盘上的悟道点/灵石(等节流落盘,取精确值) */
  const readWal = async () => {
    await page.waitForTimeout(5600)
    const cipher = await page.evaluate(() => localStorage.getItem('yunyin.resources') || '')
    if (!cipher) return null
    const plain = CryptoJS.AES.decrypt(cipher, SAVE_SECRET).toString(CryptoJS.enc.Utf8)
    if (!plain) return null
    const r = JSON.parse(plain)
    const num = v => (typeof v === 'number' ? v : v.m * Math.pow(10, v.e))
    return { wudao: r.wudao, stone: num(r.spiritStone) }
  }
  await page.goto(INDEX + '#' + '/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.getByRole('tab', { name: /法\s*宝/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  const btn = page.locator('main button', { hasText: /炼\s*化/ }).first()
  if ((await btn.count()) === 0) failures.push('[390] 炼化场景:背包「法宝」页找不到「炼化」入口')
  else {
    const label = ((await btn.textContent()) || '').replace(/\s+/g, ' ').trim()
    const wantWudao = Number((/悟道\s*([\d,]+)/.exec(label.replace(/,/g, '')) || [])[1] ?? NaN)
    const stoneText = (/灵石\s*([\d,.]+)\s*(万|亿|兆)?/.exec(label) || [])[0] ?? ''
    const sm = /([\d,.]+)\s*(万|亿|兆)?/.exec(stoneText)
    const unit = sm?.[2] === '万' ? 1e4 : sm?.[2] === '亿' ? 1e8 : sm?.[2] === '兆' ? 1e12 : 1
    const wantStone = sm ? parseFloat(sm[1].replace(/,/g, '')) * unit : NaN
    if (!/灵石/.test(label)) {
      failures.push(`[390] 炼化场景:按钮只写了悟道、没写灵石 —— 实际两种都要扣(「${label}」)`)
    }
    const before = await readWal()
    await btn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
    const after = await readWal()
    if (before && after) {
      if (before.wudao - after.wudao !== wantWudao) {
        failures.push(`[390] 炼化场景:按钮写悟道 ${wantWudao},实际 ${before.wudao} → ${after.wudao}`)
      }
      // 灵石是浮点(stoneByTier 乘倍率),比较留容差
      if (!(Math.abs(before.stone - after.stone - wantStone) < 0.01)) {
        failures.push(`[390] 炼化场景:按钮写灵石 ${wantStone},实际 ${before.stone} → ${after.stone}`)
      }
      console.log(`\n法宝炼化:「${label}」→ 悟道 ${before.wudao} → ${after.wudao} · 灵石 ${before.stone} → ${after.stone}`)
    } else {
      failures.push('[390] 炼化场景:读不到资源分片(判据没跑到东西)')
    }
  }
  if (pageErrors.length) failures.push(`[390] 炼化场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十三件事:洞府营造按卡上所写扣料 ----
/*
 * 只核玄铁:灵石同时会被任务/成就奖励搅动,玄铁除营造无人动。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '营造自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 7), qi: 1000, wudao: 10, herb: 5, ore: 90000, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  checked += 1
  /** 玄铁余额取磁盘(精确到个位):界面只显示到万位三位小数(9万 → 8.998万),个位漂移会被舍入吃掉 */
  const readOre = async () => {
    await page.waitForTimeout(5600)
    const cipher = await page.evaluate(() => localStorage.getItem('yunyin.resources') || '')
    if (!cipher) return { text: '(无分片)', value: null }
    const plain = CryptoJS.AES.decrypt(cipher, SAVE_SECRET).toString(CryptoJS.enc.Utf8)
    if (!plain) return { text: '(解不开)', value: null }
    const v = JSON.parse(plain).ore
    const n = typeof v === 'number' ? v : v.m * Math.pow(10, v.e)
    return { text: String(n), value: n }
  }
  // 读 localStorage 前须先落到页面上
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  const oreBefore = await readOre()
  await page.goto(INDEX + '#' + '/dongfu', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  // 正则留空白余量:代价会在「·」后断行
  const buildBtn = page.locator('main button', { hasText: /起\s*造\s*·|再\s*营\s*·/ }).first()
  if ((await buildBtn.count()) === 0) {
    failures.push('[390] 营造场景:洞府页没有可动工的建筑(判据没跑到东西)')
  } else {
    const label = ((await buildBtn.textContent()) || '').replace(/\s+/g, ' ').trim()
    const oreCost = Number((/([\d,]+)\s*铁/.exec(label.replace(/,/g, '')) || [])[1] ?? NaN)
    await buildBtn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(800)
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
    )
    const oreAfter = await readOre()
    if (!Number.isFinite(oreCost)) failures.push(`[390] 营造场景:读不出卡片上的玄铁价(「${label}」)`)
    else if (oreBefore.value === null || oreAfter.value === null || oreBefore.value - oreAfter.value !== oreCost) {
      failures.push(`[390] 营造场景:卡片写「${label}」,玄铁实际 ${oreBefore.text} → ${oreAfter.text}(所见非所付)`)
    }
    if (!/已至\s*\d+\s*级/.test(toast)) failures.push(`[390] 营造场景:动工之后没有任何交代(${toast || '无提示'})`)
    console.log(`\n洞府营造:${label} → 玄铁 ${oreBefore.text} → ${oreAfter.text}(应扣 ${Number.isFinite(oreCost) ? oreCost : '?'})`)
  }
  if (pageErrors.length) failures.push(`[390] 营造场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十二件事:减少动效生效(音效开着点一路按钮) ----
/*
 * 减动效把时长压到 0.01ms 且只跑一次。
 * 本场音效音乐都开着:点击走 unlockAudio + playSfx,其余夹具一律关声音。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '音画自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: true, musicOn: true, musicVol: 60, sfxVol: 60, reduceMotion: false, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  /** 还会动的元素:名字在不算,要看时长与次数 */
  const movingCount = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('body *')].filter(el => {
        const cs = getComputedStyle(el)
        if (cs.animationName === 'none') return false
        const dur = cs.animationDuration.split(',').map(d => parseFloat(d))
        const iter = cs.animationIterationCount.split(',')
        return dur.some(d => d > 0.05) || iter.some(i => i === 'infinite')
      }).length
    )
  const before = await movingCount()
  if (before === 0) failures.push('[390] 减动效场景:默认设置下界面本来就不动,这条判据证明不了什么')
  for (const b of [0, 1, 2]) {
    await page.locator('main button').nth(b).click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(700)
  const box = page.locator('label', { hasText: /减少动效/ }).locator('input[type=checkbox]').first()
  if ((await box.count()) === 0) failures.push('[390] 减动效场景:设置页找不到「减少动效」开关')
  else {
    await box.check({ timeout: 2500 }).catch(() => {})
    await page.waitForTimeout(400)
    const off = await movingCount()
    if (off !== 0) failures.push(`[390] 减动效场景:开了「减少动效」仍有 ${off} 个元素在动(开关是摆设)`)
    await box.uncheck({ timeout: 2500 }).catch(() => {})
    await page.waitForTimeout(400)
    const back = await movingCount()
    if (back === 0) failures.push('[390] 减动效场景:关掉「减少动效」之后界面也一动不动(判据两向都得立得住)')
    console.log(`\n减动效:默认 ${before} 个在动 → 打开开关 ${off} 个 → 关回 ${back} 个(音效开着点了一路,无异常)`)
  }
  if (pageErrors.length) failures.push(`[390] 减动效场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十一件事:闭关中出发当场被拦 ----
/*
 * 闭关卡写明「期间不可历练」。判据:闭关起效(有倒计时)、出发当场被拦且不开模式窗、回修行页闭关还在。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '闭关自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/cultivation', { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  const retreatBtn = page.locator('main button', { hasText: /闭\s*关/ }).first()
  if ((await retreatBtn.count()) === 0) failures.push('[390] 闭关场景:修行页找不到「闭关」入口')
  else {
    await retreatBtn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(800)
    const started = await page.evaluate(() => ({
      toast: [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|'),
      countdown: /闭关中 · /.test(document.querySelector('main')?.innerText || '')
    }))
    if (!started.countdown) failures.push('[390] 闭关场景:点了闭关,修行页没有出现「闭关中」的倒计时')
    if (!/闭关/.test(started.toast)) failures.push(`[390] 闭关场景:闭关没有任何交代(${started.toast || '无提示'})`)
    await page.goto(INDEX + '#' + '/adventure', { waitUntil: 'load' })
    await page.waitForTimeout(900)
    await page.locator('main button', { hasText: /出\s*发/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(600)
    const blocked = await page.evaluate(() => ({
      toast: [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|'),
      modal: !!document.querySelector('.modal-panel'),
      running: /余 \d+分\d+秒/.test(document.querySelector('main')?.innerText || '')
    }))
    if (!/闭关/.test(blocked.toast)) failures.push(`[390] 闭关场景:闭关期间点出发,出面没有说「正在闭关」(${blocked.toast || '无提示'})`)
    if (blocked.modal) failures.push('[390] 闭关场景:闭关期间点出发,还开出了模式窗(该当场拦下,不让玩家白走一步)')
    if (blocked.running) failures.push('[390] 闭关场景:闭关期间居然真的出发了')
    await page.goto(INDEX + '#' + '/cultivation', { waitUntil: 'load' })
    await page.waitForTimeout(800)
    const back = await page.evaluate(() => {
      const text = document.querySelector('main')?.innerText || ''
      return { still: /闭关中 · /.test(text), line: (text.match(/闭关中 · [^\r\n]*/) || [''])[0] }
    })
    if (!back.still) failures.push('[390] 闭关场景:换页回来闭关状态就丢了')
    console.log(`\n闭关:起效「${back.line}」 · 历练当场被拦(未开模式窗) · 换页仍在`)
  }
  if (pageErrors.length) failures.push(`[390] 闭关场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十件事:背包账目按显示扣/给 ----
/*
 * 强化弹窗「器灵尘×N」、分解提示「得器灵尘×K」须与器灵尘栏的实际变化一致。
 * 不核灵石:任务/成就同时也发灵石。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '锻造自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 5000 },
    inventory: {
      items: [
        { uid: 'p_w', templateId: 'w_zidian', quality: 'heaven', tier: 20, level: 4, affixes: [] },
        { uid: 'b_1', templateId: 'b_qingyun', quality: 'excellent', tier: 3, level: 0, affixes: [] }
      ],
      equipped: { weapon: 'p_w' },
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  /** 背包页顶上那栏「器灵尘 N」 */
  const readDust = () =>
    page.evaluate(() => {
      const m = /器灵尘\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
      return m ? Number(m[1]) : null
    })
  // 按 uid 找背包里那件(未装备、未锁定),不按名字:改名会让点击静默落空;data-uid 见 EquipmentCard
  const BAG_UID = 'b_1'
  await page.locator(`main button[data-uid="${BAG_UID}"]`).first().click({ timeout: 3000 })
  await page.waitForTimeout(500)
  const costLine = await page.evaluate(() => {
    const p = document.querySelector('.modal-panel')
    const m = /器灵尘×(\d+)/.exec(p?.innerText || '')
    return m ? Number(m[1]) : null
  })
  if (costLine === null) failures.push('[390] 锻造场景:详情里没写出强化的器灵尘价(判据没跑到东西)')
  else {
    const before = await readDust()
    await page.locator('.modal-panel button', { hasText: /强\s*化/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(600)
    const after = await readDust()
    if (before === null || after === null || before - after !== costLine) {
      failures.push(`[390] 锻造场景:强化写着扣 ${costLine} 尘,实际 ${before} → ${after}(所见非所付)`)
    }
    // 分解同一件:提示给多少尘就给多少,且这件须出包
    const dustBeforeSplit = await readDust()
    await page.locator('.modal-panel footer button').filter({ hasText: /^$/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.locator('.modal-panel button', { hasText: /确认分解/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
    )
    const promised = Number((/已化尘 · 得器灵尘×(\d+)/.exec(toast) || [])[1] ?? NaN)
    const dustAfterSplit = await readDust()
    const stillInBag = await page.evaluate(uid => !!document.querySelector(`main button[data-uid="${uid}"]`), BAG_UID)
    if (Number.isFinite(promised)) {
      if (dustBeforeSplit === null || dustAfterSplit === null || dustAfterSplit - dustBeforeSplit !== promised) {
        failures.push(`[390] 锻造场景:分解说给 ${promised} 尘,实际 ${dustBeforeSplit} → ${dustAfterSplit}`)
      }
      if (stillInBag) failures.push('[390] 锻造场景:分解之后那件还留在背包里')
      console.log(`\n背包账目:强化扣尘 ${costLine}(对上) · 分解得尘 ${promised}(对上,且件已出包)`)
    } else {
      failures.push(`[390] 锻造场景:分解没有给出「已化尘 · 得器灵尘×N」的交代(${toast || '无提示'})`)
    }
  }
  if (pageErrors.length) failures.push(`[390] 锻造场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十九件事:真打一场历练战斗(战报回放与战斗分析) ----
/*
 * 判据:探索开起来、战报有行、结语写清回合与胜负、战斗分析可开且有数据面板(总输出/总承伤)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '战斗自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    // 高 Tier 武器:首战打得赢、回放短,判据不看运气
    inventory: { items: [{ uid: 'p_w', templateId: 'w_zidian', quality: 'heaven', tier: 20, level: 4, affixes: [] }], equipped: { weapon: 'p_w' }, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/adventure', { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  checked += 1
  await page.locator('main button', { hasText: /出\s*发/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(600)
  // 出发先开模式窗
  await page.locator('.modal-panel button', { hasText: /寻常游历/ }).first().click({ timeout: 3000 }).catch(() => {})
  // 须拉到前台:后台页定时器被节流(setInterval 从 1 秒拖到 1 分钟),引擎心跳 1 秒一拍
  await page.bringToFront()
  // 首战间隔 12 秒 ÷ 历练速度
  let summary = ''
  let logLines = 0
  let lastTail = ''
  // 停止条件须带「战报有行」:结语先出现、行随后才铺满,只看结语偶发数出 0 行
  for (let i = 0; i < 60 && !(summary && logLines > 0); i += 1) {
    await page.waitForTimeout(1000)
    // 每个战斗槽位先掷「际遇」,事件窗挡着战斗(超时才自动处理):遇到就选第一个选项了结
    const modalChoice = page.locator('.modal-panel button').nth(0)
    if ((await page.locator('.modal-panel').count()) > 0 && (await modalChoice.count()) > 0) {
      const evTitle = await page.evaluate(() => (document.querySelector('.modal-panel h3')?.textContent || '').trim())
      await modalChoice.click({ timeout: 2000 }).catch(() => {})
      console.log(`  (历练中遇到际遇「${evTitle}」,已按第一个选项了结,继续等战斗)`)
      await page.waitForTimeout(600)
      continue
    }
    const info = await page.evaluate(() => {
      const text = document.querySelector('main')?.innerText || ''
      return {
        running: /余 \d+分\d+秒/.test(text),
        // 战报行按元素数,不按关键词猜:暴击行「会心一击!…受创甚重」不含关键词,会误判成回放无内容
        lines: document.querySelectorAll('[data-battle-log]').length,
        summary: (text.match(/此战 \d+ 回合[^\r\n]*/) || [''])[0],
        tail: text.replace(/\s+/g, ' ').slice(-80)
      }
    })
    logLines = Math.max(logLines, info.lines)
    summary = info.summary
    lastTail = info.tail
    if (i === 0 && !info.running) failures.push('[390] 战斗场景:点了「出发」并择了模式,历练却没跑起来')
  }
  // 兜底再等一拍;真无战报行时仍是 0,照红
  if (summary && logLines === 0) {
    await page.waitForTimeout(1500)
    logLines = await page.evaluate(() => document.querySelectorAll('[data-battle-log]').length)
  }
  if (!summary) failures.push(`[390] 战斗场景:等了 60 秒也没等到一场的结语(战报回放没走完?) 当前页面:${lastTail}`)
  else {
    if (logLines === 0) failures.push('[390] 战斗场景:有结语却没有战报行(回放没出内容)')
    if (!/胜|负/.test(summary)) failures.push(`[390] 战斗场景:结语没写清胜负 —— ${summary}`)
    const analysisBtn = page.locator('main button', { hasText: /战斗分析/ }).first()
    if ((await analysisBtn.count()) === 0) failures.push('[390] 战斗场景:找不到「战斗分析」入口')
    else {
      await analysisBtn.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(400)
      // 分析在弹窗里(挂 body,不在 main 下)
      const analysisText = await page.evaluate(() =>
        [...document.querySelectorAll('.modal-panel')].map(p => p.innerText).join('\n')
      )
      if (!/总输出|总承伤/.test(analysisText)) failures.push('[390] 战斗场景:点开战斗分析也没看到数据面板(总输出/总承伤)')
      else console.log(`\n战斗回放:${summary} · 战报 ${logLines} 行 · 分析面板可开`)
    }
  }
  if (/NaN|undefined|Infinity/.test(await page.evaluate(() => document.body.innerText))) {
    failures.push('[390] 战斗场景:战报里漏出占位符')
  }
  if (pageErrors.length) failures.push(`[390] 战斗场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第三十六件事:敌人卡的最挤一档(长名字 + 满标签) ----
/*
 * 最挤一档:名字最长 9 字(残魂·堕落冰魄仙子)、标签最多 5 枚(首领 / 宿敌 + 3 个路数特性)、适配星级。
 * 夹具:认知层 2(特性显示)、宿敌记录、首领身份、真仙境敌人(名字最长)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const now = Date.now()
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: now - 86400000, lastActiveAt: now, totalPlaySec: 600, createRerolls: 8, createProfile: null },
    player: {
      name: '战斗卡自检',
      major: 12,
      sub: 3,
      exp: gn(1, 3),
      age: 300,
      dead: false,
      nemeses: [{ enemyId: 'e_icefairy', enemyName: '堕落冰魄仙子', regionId: 'leichi', lossCount: 3, lastLossAt: now }],
      reincarnation: { count: 1, daoFruit: 3, talents: [], insight: 50, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'ice', aptitude: 90 }], gradeName: '单灵根', growthMult: 1.2 }
    },
    resources: { spiritStone: gn(8, 7), qi: 5000, wudao: 200, herb: 100, ore: 100, page: 20, dust: 40 },
    inventory: {
      items: [{ uid: 'w1', templateId: 'w_zidian', quality: 'heaven', tier: 12, level: 2, affixes: [{ id: 'bs3', roll: 1 }, { id: 'low2', roll: 1 }] }],
      equipped: { weapon: 'w1' },
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    cultivation: { learned: { g_qingyun: 6 }, mainGongfa: 'g_qingyun', subGongfa: [], buffs: [], gongfaBranch: {} },
    lore: {
      materialLore: {},
      materialSeen: {},
      recipeLore: {},
      blueprintLore: {},
      skillExp: {},
      enemyLore: { e_icefairy: 2 }, // 知其路数 → 特性标签会显示
      enemySeen: { e_icefairy: 6 },
      studyFrac: 0,
      seeded: true
    },
    adventure: {
      unlocked: ['qingyun', 'luoxia', 'heifeng', 'leichi'],
      cleared: ['qingyun', 'luoxia'],
      mortalCleared: [],
      session: { regionId: 'leichi', mode: 'risky', startedAt: now - 60000, endsAt: now + 3600000, nextBattleAt: now + 12000, wins: 4, losses: 0, events: 1, stoneGain: gn(1.2, 6), expGain: gn(3.4, 6), itemGain: 3 },
      pendingEventId: null,
      pendingEventSince: 0,
      seenOnceEvents: [],
      lastBattle: {
        enemyName: '残魂·堕落冰魄仙子',
        enemyIcon: 'snowflake',
        enemyId: 'e_icefairy',
        isBoss: true,
        result: {
          win: true,
          rounds: 7,
          playerHpPct: 0.62,
          log: [
            { t: 'atk', text: '你挥剑直取,', php: 1, ehp: 0.8 },
            { t: 'crit', text: '会心一击!', dmg: '12', php: 1, ehp: 0.4 },
            { t: 'win', text: '你胜了。', php: 0.62, ehp: 0 }
          ]
        },
        at: now - 3000,
        loot: ['功法残页 +2', '玄冰剑']
      },
      eventMemories: {}
    },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'dark' }
  }
  await ctx.addInitScript(
    data => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/adventure', { waitUntil: 'load' })
  // 等敌人卡出现(最多 15 秒,读空则重载一次再等),不用固定定时读:整轮跑满时冷启动到首帧会慢过 8 秒
  const foeReady = () => page.waitForSelector('[data-foe-name]', { timeout: 15000 }).then(() => true).catch(() => false)
  if (!(await foeReady())) {
    await page.reload({ waitUntil: 'load' }).catch(() => undefined)
    await foeReady()
  }
  await page.evaluate(() => {
    Math.random = () => 1
  })
  const foe = await page.evaluate(() => {
    const name = document.querySelector('[data-foe-name]')
    if (!name) return { found: false }
    const r = name.getBoundingClientRect()
    const chips = [...document.querySelectorAll('.chip-ink')].filter(el => (el.textContent || '').trim())
    return {
      found: true,
      label: (name.textContent || '').trim(),
      height: Math.round(r.height),
      lineHeight: parseFloat(getComputedStyle(name).lineHeight) || 16,
      chips: chips.length
    }
  })
  checked += 1
  if (!foe.found) {
    failures.push('[320-battle] 敌人卡场景:战斗面板没渲染出来(夹具没被读出来?)')
  } else {
    const lines = Math.round(foe.height / foe.lineHeight)
    if (lines > 1) failures.push(`[320-battle] 敌人名字被折成 ${lines} 行:«${foe.label}»(${foe.height}px)`)
    if (foe.chips < 4) failures.push(`[320-battle] 敌人卡场景:标签只有 ${foe.chips} 枚(夹具该摆出首领+宿敌+3 特性)`)
    const info = await measurePage(page)
    for (const p of problemsOf(info)) failures.push(`[320-battle] /adventure → ${p}`)
  }
  if (pageErrors.length) failures.push(`[320-battle] 敌人卡场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第三十七件事:开炉炼丹弹窗的窄屏排版(议题 #21) ----
/*
 * 夹具备六张方子(含五字丹名「玄冥护体丹」「千年延寿丹」)与几项练过的技艺,三档宽度各开一次:
 *   一 通用尺子(竖排 / 量词分家 / 孤字标点 / 可点元素 ≥28px)对开着的弹窗再量一遍;
 *   二 丹名单行,方子信息栏不窄于卡片六成(右侧不许并排定宽列);
 *   三 正文外不许有第二个会滚的盒子(内层底边会切卡片);
 *   四 正文超长时底边有渐隐提示;滚到底后底边消失、顶边出现。
 */
for (const vp of [
  { width: 320, height: 568, tag: '320', dpr: 2 },
  { width: 375, height: 812, tag: '375', dpr: 3 },
  { width: 390, height: 844, tag: '390', dpr: 3 }
]) {
  const tag = `[${vp.tag}-craft]`
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const now = Date.now()
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: now - 86400000, lastActiveAt: now, totalPlaySec: 600, createRerolls: 8, createProfile: null },
    player: {
      name: '开炉自检',
      major: 4,
      sub: 2,
      exp: gn(1, 3),
      age: 120,
      dead: false,
      reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'fire', aptitude: 80 }], gradeName: '单灵根', growthMult: 1.2 }
    },
    resources: { spiritStone: gn(3.2, 7), qi: 500, wudao: 50, herb: 2400, ore: 100, page: 10, dust: 40 },
    inventory: { items: [], equipped: {}, pills: { p_jvqidan: 3 }, artifacts: [], equippedArtifacts: [] },
    lore: {
      materialLore: {},
      materialSeen: {},
      // 六张方子:一阶到高阶、含两个五字丹名,熟练度各异(把握数位数不同)
      recipeLore: { p_jvqidan: 1, p_huichun: 0.6, p_pojing: 0.4, p_xuanming: 0.3, p_yanshou: 0.5, p_qianshou: 0.2 },
      blueprintLore: {},
      skillExp: { herbLore: 400, pairing: 120, condense: 60, nurture: 900, flame: 1500, smithing: 30 },
      enemyLore: {},
      enemySeen: {},
      studyFrac: 0,
      seeded: true
    },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: false, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'dark' }
  }
  await ctx.addInitScript(
    data => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await clearOverlays(page)
  await page.getByRole('tab', { name: '丹药' }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  await page.locator('main button', { hasText: '开炉炼丹' }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(700)
  checked += 1
  if (SHOTS) await page.screenshot({ path: `${SHOTS_DIR}/craft-${vp.tag}-top.png` }).catch(() => {})

  const craft = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.modal-panel')].find(p => (p.querySelector('h3')?.textContent || '').includes('开炉'))
    if (!panel) return null
    const body = panel.querySelector('[data-modal-body]')
    const cards = [...panel.querySelectorAll('.card-ink')]
    const names = cards.map(card => {
      const name = card.querySelector('.font-kai')
      const info = card.querySelector('.min-w-0.grow')
      const nr = name?.getBoundingClientRect()
      const lh = name ? parseFloat(getComputedStyle(name).lineHeight) || 16 : 16
      return {
        label: (name?.textContent || '').trim(),
        lines: nr ? Math.round(nr.height / lh) : 0,
        infoRatio: info ? info.getBoundingClientRect().width / card.getBoundingClientRect().width : 0
      }
    })
    // 正文之外会滚的盒子
    const nestedScrollers = [...panel.querySelectorAll('*')]
      .filter(el => el !== body && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}(${el.clientHeight}/${el.scrollHeight}px)`)
    return { hasBody: !!body, cards: names, nestedScrollers }
  })

  if (!craft) {
    failures.push(`${tag} 开炉场景:点了「开炉炼丹」弹窗没出来`)
  } else if (craft.cards.length < 6) {
    failures.push(`${tag} 开炉场景:方子只画出 ${craft.cards.length} 张(夹具备了 6 张,lore 分片没读出来?)`)
  } else {
    for (const c of craft.cards) {
      if (c.lines > 1) failures.push(`${tag} 丹名被折成 ${c.lines} 行:«${c.label}»`)
      if (c.infoRatio < 0.6) failures.push(`${tag} 方子信息栏只占卡片 ${Math.round(c.infoRatio * 100)}% 宽(右侧又并排了定宽的列):«${c.label}»`)
    }
    if (craft.nestedScrollers.length) failures.push(`${tag} 弹窗正文里还套着会滚的盒子:${craft.nestedScrollers.join(' | ')}`)
    if (!craft.hasBody) failures.push(`${tag} 找不到弹窗正文(data-modal-body),渐隐判据没跑到东西`)

    // 弹窗开着再过通用尺子
    const info = await measurePage(page)
    for (const p of problemsOf(info)) failures.push(`${tag} 开炉弹窗 → ${p}`)
    const audit = await auditModalControls(page)
    if (audit?.small.length) failures.push(`${tag} 开炉弹窗里可点元素过小:${audit.small.join(' | ')}`)
    if (audit?.dimDisabled.length) failures.push(`${tag} 开炉弹窗里禁用态的字读不出来:${audit.dimDisabled.join(' | ')}`)
    if (audit?.badGroups.length) failures.push(`${tag} 开炉弹窗里选择组没选中态:${audit.badGroups.join(' | ')}`)
    if (audit?.unnamed.length) failures.push(`${tag} 开炉弹窗里有 ${audit.unnamed.length} 个无名控件`)

    // 渐隐提示:正文超长时,在顶 → 只亮底边;滚到底 → 只亮顶边
    const edgeState = () =>
      page.evaluate(() => {
        const panel = [...document.querySelectorAll('.modal-panel')].find(p => (p.querySelector('h3')?.textContent || '').includes('开炉'))
        const body = panel?.querySelector('[data-modal-body]')
        const shown = sel => {
          const el = panel?.querySelector(sel)
          return !!el && getComputedStyle(el).display !== 'none'
        }
        return {
          overflow: body ? body.scrollHeight - body.clientHeight : 0,
          top: shown('.modal-edge-top'),
          bottom: shown('.modal-edge-bottom'),
          found: !!panel?.querySelector('.modal-edge-top') && !!panel?.querySelector('.modal-edge-bottom')
        }
      })
    const atTop = await edgeState()
    if (!atTop.found) {
      failures.push(`${tag} 开炉弹窗没有渐隐提示层(.modal-edge-top / .modal-edge-bottom)`)
    } else if (atTop.overflow <= 2) {
      failures.push(`${tag} 开炉场景:正文没超长(${atTop.overflow}px),渐隐判据没跑到东西 —— 夹具方子太少?`)
    } else {
      if (!atTop.bottom) failures.push(`${tag} 正文下面还有 ${atTop.overflow}px,底边却没有渐隐提示`)
      if (atTop.top) failures.push(`${tag} 正文在顶上,顶边却亮着渐隐提示`)
      await page.evaluate(() => {
        const panel = [...document.querySelectorAll('.modal-panel')].find(p => (p.querySelector('h3')?.textContent || '').includes('开炉'))
        const body = panel?.querySelector('[data-modal-body]')
        if (body) body.scrollTop = body.scrollHeight
      })
      await page.waitForTimeout(300)
      const atBottom = await edgeState()
      if (atBottom.bottom) failures.push(`${tag} 滚到底了,底边渐隐提示还亮着`)
      if (!atBottom.top) failures.push(`${tag} 滚到底了,顶边没有渐隐提示(上面还有内容)`)
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS_DIR}/craft-${vp.tag}-bottom.png` }).catch(() => {})
  }
  if (pageErrors.length) failures.push(`${tag} 开炉场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第三十八件事:词条转移面板走一遍并对账(议题 #22) ----
/*
 * 最挤一档:源件为神品武器、九条词条(含最长效果句与重名的「破妄」);目标为已装备天品武器,七条满、封一条;
 * 另一件已有更高「洞虚」(置灰);再加八件候选逼出「全部 N 件」。三档宽度各走一遍:
 *   选「洞虚」→ 展开全部候选 → 选已装备那件 → 只有「顶替「破甲」」成立且已预选
 *   → 「转 移」→ 确认态写清顶替什么、源件失去什么 → 「确认转移」→ 器灵尘照价签扣。
 * 每一步都过通用尺子。
 */
for (const vp of [
  { width: 320, height: 568, tag: '320', dpr: 2 },
  { width: 375, height: 812, tag: '375', dpr: 3 },
  { width: 390, height: 844, tag: '390', dpr: 3 }
]) {
  const tag = `[${vp.tag}-transfer]`
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const now = Date.now()
  const roll9 = ids => ids.map(id => ({ id, roll: 0.9 }))
  const extras = ['w_zhuqing', 'w_xuantie', 'w_qingshuang', 'w_hanfeng', 'w_zhuqing', 'w_xuantie', 'w_qingshuang', 'w_hanfeng'].map((templateId, i) => ({
    uid: `tf_x${i}`,
    templateId,
    quality: i % 2 ? 'immortal' : 'heaven',
    tier: 25,
    level: 0,
    affixes: [{ id: 'atk1', roll: 0.5 }]
  }))
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: now - 86400000, lastActiveAt: now, totalPlaySec: 600, createRerolls: 8, createProfile: null },
    player: {
      name: '转移自检',
      major: 12,
      sub: 3,
      exp: gn(1, 3),
      age: 300,
      dead: false,
      reincarnation: { count: 1, daoFruit: 3, talents: [], insight: 50, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'metal', aptitude: 90 }], gradeName: '单灵根', growthMult: 1.2 }
    },
    resources: { spiritStone: gn(1, 40), qi: 5000, wudao: 200, herb: 100, ore: 100, page: 20, dust: 999999 },
    inventory: {
      items: [
        { uid: 'tf_src', templateId: 'w_hanfeng', quality: 'divine', tier: 25, level: 0, affixes: roll9(['exe2', 'bs2', 'fm2', 'lh2', 'pen3', 'dmg1', 'ac2', 'cdmg2', 'ls2']) },
        {
          uid: 'tf_main',
          templateId: 'w_zidian',
          quality: 'heaven',
          tier: 25,
          level: 3,
          affixes: [
            { id: 'pen1', roll: 0.5 },
            { id: 'atk1', roll: 0.5 },
            { id: 'def1', roll: 0.5 },
            { id: 'hp1', roll: 0.5 },
            { id: 'cult1', roll: 0.5 },
            { id: 'gain1', roll: 0.5 },
            { id: 'crit1', roll: 0.5 }
          ],
          sealedAffixIds: ['atk1']
        },
        { uid: 'tf_dup', templateId: 'w_qingshuang', quality: 'heaven', tier: 25, level: 0, affixes: [{ id: 'pen3', roll: 0.97 }] },
        ...extras
      ],
      equipped: { weapon: 'tf_main' },
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: false, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'dark' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__transferSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__transferSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await clearOverlays(page)

  /** 每一步都过的尺子:通用排版判据 + 弹窗控件 + 正文外无第二个滚动盒 */
  const rulers = async step => {
    checked += 1
    const info = await measurePage(page)
    for (const p of problemsOf(info)) failures.push(`${tag} ${step} → ${p}`)
    const audit = await auditModalControls(page)
    if (audit?.small.length) failures.push(`${tag} ${step}:可点元素过小 ${audit.small.join(' | ')}`)
    if (audit?.dimDisabled.length) failures.push(`${tag} ${step}:禁用态的字读不出来 ${audit.dimDisabled.join(' | ')}`)
    if (audit?.badGroups.length) failures.push(`${tag} ${step}:选择组没选中态 ${audit.badGroups.join(' | ')}`)
    if (audit?.unnamed.length) failures.push(`${tag} ${step}:${audit.unnamed.length} 个无名控件`)
    const nested = await page.evaluate(() => {
      const panel = document.querySelector('.modal-panel')
      const body = panel?.querySelector('[data-modal-body]')
      return panel
        ? [...panel.querySelectorAll('*')]
            .filter(el => el !== body && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
            .map(el => `${el.tagName.toLowerCase()}(${el.clientHeight}/${el.scrollHeight}px)`)
        : []
    })
    if (nested.length) failures.push(`${tag} ${step}:正文里还套着会滚的盒子 ${nested.join(' | ')}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS_DIR}/transfer-${vp.tag}-${step}.png` }).catch(() => {})
  }
  const radios = group => page.locator(`.modal-panel [role=group][aria-label="${group}"] button`)
  const dustOnPage = () =>
    page.evaluate(() => {
      const m = /器灵尘\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
      return m ? Number(m[1]) : null
    })

  await page.locator('main button[data-uid="tf_src"]').first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(600)
  const entry = page.locator('.modal-panel footer button', { hasText: '转移词条' }).first()
  if ((await entry.count()) === 0) {
    failures.push(`${tag} 转移场景:源件详情里没有「转移词条」入口(夹具没读出来?)`)
  } else {
    // 先滚到底再进转移:同一滚动盒整块换内容,须回顶,否则「转出」开头几条在视口上方
    await page.evaluate(() => {
      const body = document.querySelector('.modal-panel [data-modal-body]')
      if (body) body.scrollTop = body.scrollHeight
    })
    await page.waitForTimeout(200)
    await entry.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
    const firstRowHidden = await page.evaluate(() => {
      const body = document.querySelector('.modal-panel [data-modal-body]')
      const first = document.querySelector('.modal-panel [role=group][aria-label="转出"] button')
      if (!body || !first) return null
      return first.getBoundingClientRect().top < body.getBoundingClientRect().top - 1
    })
    if (firstRowHidden !== false) failures.push(`${tag} 进转移时正文没回顶:「转出」第一条在视口上方(或没渲染)`)
    const outCount = await radios('转出').count()
    if (outCount !== 9) failures.push(`${tag} 转出列了 ${outCount} 条(源件九条)`)
    await rulers('1-转出')

    await radios('转出').filter({ hasText: '洞虚' }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
    const shown = await radios('转入').count()
    const more = page.locator('.modal-panel button', { hasText: /全部 \d+ 件/ }).first()
    if (shown !== 8) failures.push(`${tag} 候选先列 ${shown} 件(应先列 8 件)`)
    if ((await more.count()) === 0) failures.push(`${tag} 候选 10 件却没有「全部 N 件」`)
    else await more.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
    const all = await radios('转入').count()
    if (all !== 10) failures.push(`${tag} 展开后候选 ${all} 件(应为 10)`)
    const dupDisabled = await radios('转入').filter({ hasText: '已有此条' }).first().isDisabled().catch(() => false)
    if (!dupDisabled) failures.push(`${tag} 已有更高「洞虚」的那件没置灰`)
    await rulers('2-转入')

    await radios('转入').filter({ hasText: '已装备' }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
    const slots = await page.evaluate(() =>
      [...document.querySelectorAll('.modal-panel [role=group][aria-label="位置"] button')].map(el => ({
        text: (el.textContent || '').replace(/\s+/g, ''),
        disabled: el.disabled,
        checked: el.getAttribute('aria-pressed') === 'true',
        dashed: getComputedStyle(el).borderTopStyle === 'dashed'
      }))
    )
    const append = slots.find(s => s.text.startsWith('新增'))
    const pen = slots.find(s => s.text.includes('顶替「破甲」'))
    if (!append || !append.disabled || !append.text.includes('词条已满')) failures.push(`${tag} 满条目标的「新增」没挡下/没写「词条已满」`)
    if (!pen || pen.disabled || !pen.checked) failures.push(`${tag} 唯一成立的「顶替「破甲」」没预选`)
    // 被挡的卡须为虚线框
    if (slots.some(s => s.disabled !== s.dashed)) failures.push(`${tag} 被挡的落位没有置灰(与可选的长得一样)`)
    const stacked = slots.filter(s => s.text.includes('属性重叠')).length
    if (stacked !== 6) failures.push(`${tag} 递减属性那几条应写「属性重叠」,实际 ${stacked} 条`)
    const sealOn = await page.locator('.modal-panel input[type=checkbox]').first().isChecked().catch(() => false)
    if (!sealOn) failures.push(`${tag} 「同时封存」默认没勾上`)
    await rulers('3-位置')

    const footer = (await page.locator('.modal-panel footer').innerText().catch(() => '')).replace(/\s+/g, ' ')
    const price = /尘×(\d+)/.exec(footer)
    const dustBefore = await dustOnPage()
    await page.locator('.modal-panel footer button', { hasText: /转\s*移/ }).last().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
    const armedText = (await page.locator('.modal-panel footer').innerText().catch(() => '')).replace(/\s+/g, '')
    if (!armedText.includes('洞虚') || !armedText.includes('顶替「破甲」') || !armedText.includes('源件失去「洞虚」')) {
      failures.push(`${tag} 确认态没写清:${armedText.slice(0, 60)}`)
    }
    await rulers('4-确认')
    await page.locator('.modal-panel footer button', { hasText: '确认转移' }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
    const dustAfter = await dustOnPage()
    if (!price || dustBefore === null || dustAfter === null) {
      failures.push(`${tag} 转移场景:读不到价签或器灵尘(价签 ${price?.[1]} · 前 ${dustBefore} · 后 ${dustAfter})`)
    } else if (dustBefore - dustAfter !== Number(price[1])) {
      failures.push(`${tag} 价签写尘×${price[1]},实扣 ${dustBefore - dustAfter}`)
    }
    const toast = await page.evaluate(() => document.body.innerText.includes('「洞虚」已转入'))
    if (!toast) failures.push(`${tag} 转完没有「「洞虚」已转入」提示`)
    const left = await radios('转出').count()
    if (left !== 8) failures.push(`${tag} 转完源件应剩 8 条、面板留在转移模式,实际列 ${left} 条`)
    if (vp.tag === '390') {
      console.log(`\n词条转移:「洞虚」→ 已装备的那件,顶替「破甲」· 价签尘×${price?.[1]} · 器灵尘 ${dustBefore} → ${dustAfter}`)
    }
  }
  if (pageErrors.length) failures.push(`${tag} 转移场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十八件事:切后台/离开页面时待刷存档立刻落盘 ----
/*
 * 写盘节流(见 savePersistence.spec);切后台/离开页面(visibilitychange → hidden 与 pagehide)须立刻落盘。
 * 单测只测 flushSaveWrites 本身,不测两个监听是否接上。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '落盘自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  await page.waitForTimeout(500)
  /** 磁盘上那一份灵石(解密 resources 分片) */
  const diskStone = async () => {
    const cipher = await page.evaluate(() => localStorage.getItem('yunyin.resources') || '')
    if (!cipher) return null
    const plain = CryptoJS.AES.decrypt(cipher, SAVE_SECRET).toString(CryptoJS.enc.Utf8)
    if (!plain) return null
    const v = JSON.parse(plain).spiritStone
    return typeof v === 'number' ? v : v.m * Math.pow(10, v.e)
  }
  const investOnce = async () => {
    // 灵脉投资是洞府页的弹窗。同一 URL 再 goto 是同文档跳转、页面不重挂:上一次开的弹窗还在,不再点入口(遮罩挡着会超时)
    await page.goto(INDEX + '#' + '/dongfu', { waitUntil: 'load' })
    await page.waitForTimeout(700)
    if (!(await page.locator('#vein-panel').isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /灵脉投资/ }).first().click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(400)
    }
    await page.locator('#vein-panel button.btn-ghost:not([disabled])').first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
    return readFormatted(page, '灵石')
  }
  checked += 1
  /*
   * 投入前派发 pagehide 强制刷盘,把节流周期(SAVE_FLUSH_MS = 5 秒)归零:引擎每秒都写,定时等待等不出安静窗口。
   * 下一次写入才起整 5 秒定时器,「投入 → 读磁盘」全程不到 2.5 秒。只有 storage.ts 监听 pagehide,派发无别的副作用。
   */
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(200)
  const start = await readFormatted(page, '灵石')
  const afterInvest = await investOnce()
  const onDiskBefore = await diskStone()
  // 先确认节流在起作用:此刻磁盘须仍是旧值
  if (onDiskBefore !== null && afterInvest.value !== null && Math.abs(onDiskBefore - afterInvest.value) < afterInvest.value * 0.001) {
    failures.push('[390] 落盘场景:投入之后磁盘立刻就变了 —— 节流没起作用,这条判据也就证明不了什么')
  }
  // ① 切后台
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(400)
  const afterHidden = await diskStone()
  if (afterInvest.value !== null && (afterHidden === null || Math.abs(afterHidden - afterInvest.value) > afterInvest.value * 0.01)) {
    failures.push(`[390] 落盘场景:切后台(visibilitychange→hidden)之后磁盘还是 ${afterHidden},页面已是 ${afterInvest.text} —— 待刷存档没落盘`)
  }
  // ② 离开页面(pagehide)
  const second = await investOnce()
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(400)
  const afterHide = await diskStone()
  if (second.value !== null && (afterHide === null || Math.abs(afterHide - second.value) > second.value * 0.01)) {
    failures.push(`[390] 落盘场景:pagehide 之后磁盘还是 ${afterHide},页面已是 ${second.text} —— 待刷存档没落盘`)
  }
  if (pageErrors.length) failures.push(`[390] 落盘场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  console.log(`\n落盘时机:开局 ${start.text} → 投脉后页面 ${afterInvest.text}(磁盘暂为旧值,节流中)→ 切后台落盘 · 再投一次 ${second.text} → pagehide 落盘`)
  await ctx.close()
}

// ---- 第十七件事:导出失败须有提示 ----
/*
 * Web 导出靠 saveAs(Blob + a[download]);受限 WebView、部分应用内浏览器里 URL.createObjectURL 不可用会抛错。
 * 打断下载能力后,界面须有提示。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '导出自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)
  checked += 1
  // 打断下载(受限 WebView / 应用内浏览器即如此)
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error('createObjectURL is not available')
    }
  })
  await page.getByRole('button', { name: /导出存档/ }).first().click()
  await page.waitForTimeout(1500)
  const said = await page.evaluate(() =>
    [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
  )
  if (!/导出|下载/.test(said)) failures.push(`[390] 导出失败场景:下载能力不可用时点了「导出存档」,界面一声不响(${said || '无提示'})`)
  else console.log(`\n导出失败也说话:「${said.split('|')[0]}」`)
  if (pageErrors.length) failures.push(`[390] 导出失败场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十六件事:坏档开局 ----
/*
 * 启动前 preflightScan 把读不出的分片挪到备份键,其余照常开局。
 * 判据:① 进得去(不白屏);② 启动时有提示;③ 设置页常驻说明哪一片坏了、原档在哪。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '坏档自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) {
        // 故意写坏一个分片(既不是本游戏密文,也不是合法 JSON)
        localStorage.setItem(k, k.endsWith('.resources') ? '这不是存档' : v)
      }
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  // 启动提示只活 2.6 秒:页面脚本运行前装好观察器,提示一进 DOM 就抄下
  await ctx.addInitScript(() => {
    window.__bootToastSaid = ''
    const pick = () => {
      const t = [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
      if (/损坏|异常|隔离/.test(t)) window.__bootToastSaid = t
    }
    // 须挂在 document 上:等 #app 再挂会错过(app.mount 与坏档提示同步执行);document_start 时 documentElement 还是 null
    new MutationObserver(pick).observe(document, {
      childList: true,
      subtree: true,
      characterData: true
    })
    pick()
  })
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  checked += 1
  // 优先用观察器记账(冷启动时等 load 回来提示可能已收走),再轮询;两者都空才算没说
  let bootToasts = await page.evaluate(() => window.__bootToastSaid || '')
  if (!bootToasts) {
    const live = await page
    .waitForFunction(
      () => {
        const t = [...document.querySelectorAll('[role=status] > div')].map(d => (d.textContent || '').replace(/\s*×\s*$/, '').trim()).join('|')
        return /损坏|异常|隔离/.test(t) ? t : false
      },
      { timeout: 8000 }
    )
    .then(h => h.jsonValue())
    .catch(() => '')
    if (live) bootToasts = live
  }
  const boot = await page.evaluate(() => ({
    alive: !!document.querySelector('#app')?.firstElementChild,
    hash: location.hash,
    backedUp: Object.keys(localStorage).some(k => k.startsWith('corrupt.'))
  }))
  if (!boot.alive) failures.push('[390] 坏档场景:坏掉一个分片之后界面都没起来(白屏)')
  if (!/损坏|异常|隔离/.test(bootToasts)) failures.push(`[390] 坏档场景:启动时没有交代坏档(${bootToasts || '无提示'})`)
  if (!boot.backedUp) failures.push('[390] 坏档场景:坏掉的分片没有被隔离备份(原档直接丢了)')
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  const notice = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card-ink')].find(c => (c.textContent || '').includes('存档版本'))
    return (card?.innerText || '').replace(/\n+/g, ' ')
  })
  if (!/未能读全|损坏/.test(notice)) failures.push('[390] 坏档场景:设置页没有常驻交代(只说一次两秒的提示,玩家回头找不到原因)')
  if (!/资源/.test(notice)) failures.push(`[390] 坏档场景:设置页没说出坏的是哪一片 —— ${notice.slice(0, 80)}`)
  if (!/原档.*(本机|删除)|留在本机/.test(notice)) failures.push('[390] 坏档场景:设置页没说出原档去向(玩家/帮他的人找不回来)')
  if (pageErrors.length) failures.push(`[390] 坏档场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  console.log(`
坏档开局:界面照常起来 · 启动提示「${bootToasts.split("|")[0] || "无"}」 · 设置页「${notice.slice(0, 46)}…」`)
  await ctx.close()
}

// ---- 第三十一件事:iOS 存档风险提示只在该出现的平台出现 ----
/*
 * WebKit 会清掉七天没打开过的站点的脚本可写存储(localStorage 与 Service Worker 缓存);添加到主屏幕后不受此限。
 *   一 iOS 未安装:主页出现,「知道了」后重载不再出现,设置页常驻一份
 *   二 iOS 已装到主屏幕:不出现
 *   三 桌面/安卓:不出现(用应用自己的存储)
 */
{
  const UA_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const UA_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  const gn = (m, e) => ({ m, e })
  const save = Object.fromEntries(
    Object.entries({
      game: { started: true, saveVersion: 2, createdAt: Date.now() - 40 * 86400000, lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
      player: { name: 'iOS 自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
      resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
      inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
      endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
      settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
    }).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)])
  )
  const openWith = async (userAgent, standalone = false) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent })
    await ctx.addInitScript(([data, sa]) => {
      if (!localStorage.getItem('__layoutSeeded')) {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
        localStorage.setItem('__layoutSeeded', '1')
      }
      if (sa) Object.defineProperty(navigator, 'standalone', { get: () => true })
    }, [save, standalone])
    const page = await ctx.newPage()
    return { ctx, page }
  }
  /** 以提示卡标题为锚点,精确匹配(步骤行里也有这几个字) */
  const cardCount = page => page.locator('text="添加到主屏幕"').count()

  {
    const { ctx, page } = await openWith(UA_IOS)
    await page.goto(INDEX, { waitUntil: 'load' })
    await page.waitForTimeout(1500)

    // 顺带量楷体由谁画(运行时):字体文件坏了或因 base 变形 404 都会静默回退到系统字体
    checked += 1
    const kaiFonts = await (async () => {
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('DOM.enable')
      await cdp.send('CSS.enable')
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'header .font-kai' })
      if (!nodeId) return null
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      await cdp.detach()
      return fonts.map(f => f.familyName)
    })()
    if (!kaiFonts) failures.push('[楷体] 顶栏里找不到 font-kai 的元素,判据没量到东西')
    // 只认前缀:字形分支(原版 / GB / 屏幕阅读版)可换,须是内置那一支
    else if (!kaiFonts.some(f => f.startsWith('LXGW WenKai'))) {
      failures.push(`[楷体] 楷体文字不是内置字体画的(实际 ${kaiFonts.join(' + ')})—— 字体没加载成功?`)
    } else {
      console.log(`\n楷体统一:顶栏名字由 ${kaiFonts.join(' + ')} 渲染`)
    }

    checked += 1
    const onHome = await cardCount(page)
    if (onHome === 0) failures.push('[iOS] 未安装时主页没有出现「添加到主屏幕」提示 —— 七天不打开就会被清档,而玩家不会知道')
    const dismiss = page.locator('button', { hasText: '知道了' }).first()
    if ((await dismiss.count()) === 0) failures.push('[iOS] 提示卡没有「知道了」—— 劝一次就得能关掉,不能变成常驻横幅')
    else {
      await dismiss.click()
      await page.waitForTimeout(200)
    }
    if ((await cardCount(page)) !== 0) failures.push('[iOS] 点了「知道了」之后提示还在')
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    if ((await cardCount(page)) !== 0) failures.push('[iOS] 关掉之后重载又冒出来了(关掉这个动作没落盘)')
    await page.goto(INDEX + '#/settings', { waitUntil: 'load' })
    await page.waitForTimeout(700)
    if ((await cardCount(page)) !== 1) failures.push('[iOS] 设置页没有常驻那一份 —— 玩家回头想装时找不到那两步')
    const backup = await page.evaluate(() => {
      const el = [...document.querySelectorAll('p')].find(p => (p.textContent || '').includes('上次导出备份'))
      return (el?.innerText || '').replace(/\s+/g, ' ')
    })
    if (!/上次导出备份/.test(backup)) failures.push('[iOS] 设置页没有「上次导出备份」那一行')
    else if (!/从未导出|天前|今天/.test(backup)) failures.push(`[iOS] 备份那一行读不出时间:「${backup}」`)
    console.log(`\niOS 存档提示:主页出现一次并可关闭、关掉后重载不再出现、设置页常驻 · 备份行「${backup.slice(0, 28)}…」`)
    await ctx.close()
  }
  {
    const { ctx, page } = await openWith(UA_IOS, true)
    await page.goto(INDEX, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    checked += 1
    if ((await cardCount(page)) !== 0) failures.push('[iOS] 已经是主屏幕应用了还在劝安装 —— 它早就不吃那条清存储规则')
    await ctx.close()
  }
  {
    const { ctx, page } = await openWith(UA_DESKTOP)
    await page.goto(INDEX, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const onHome = await cardCount(page)
    await page.goto(INDEX + '#/settings', { waitUntil: 'load' })
    await page.waitForTimeout(700)
    const onSettings = await cardCount(page)
    checked += 1
    if (onHome + onSettings !== 0) {
      failures.push('[桌面] 非 iOS 上出现了「iOS 会清掉存档」的提示 —— 那是胡说,玩家会当成游戏出错')
    }
    await ctx.close()
  }
}

// ---- 第二十六B件事:弹窗触控巡逻 ----
/*
 * 巡页量不到没打开的弹窗:主动开分解/收纳/装备详情/炼丹,量 28px 与可访问名。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '弹窗巡逻', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 100, herb: 20, ore: 20, page: 5, dust: 50 },
    inventory: {
      items: [
        { uid: 'p_1', templateId: 'w_zhuqing', quality: 'excellent', tier: 3, level: 1, affixes: [{ affixId: 'a_gongji', value: 5 }] },
        { uid: 'p_2', templateId: 'b_mabu', quality: 'excellent', tier: 3, level: 0, affixes: [] }
      ],
      equipped: {},
      pills: {},
      artifacts: [],
      equippedArtifacts: []
    },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__patrolSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__patrolSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/inventory', { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  checked += 1

  /** 点开一扇窗 → 量内部控件 → 关掉;开不出来的单独记一句,不连坐 */
  const patrol = async (name, click) => {
    const hit = await click()
    if (!hit) {
      // 入口没出现多半是夹具未铺该窗前置(收纳要有可清物、炼丹要有丹方),不判失败
      console.log(`弹窗巡逻:${name} · 入口没出现(夹具未铺该窗前置,留待人工核对)`)
      return
    }
    await page.waitForTimeout(450)
    const audit = await auditModalControls(page)
    // 弹出态再过排版尺子
    const info = await measurePage(page)
    for (const p of problemsOf(info)) failures.push(`[弹窗巡逻] ${name} 弹窗 → ${p}`)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(250)
    if (!audit || audit.count === 0) {
      failures.push(`[弹窗巡逻] ${name}:开出来了但面板里一个控件都没数到`)
      return
    }
    if (!audit.label) failures.push(`[弹窗巡逻] ${name} 弹窗没有可访问名(读屏只会念「对话框」)`)
    if (audit.unnamed.length) failures.push(`[弹窗巡逻] ${name} 里有 ${audit.unnamed.length} 个无名控件:${audit.unnamed.join(' | ')}`)
    if (audit.small.length) failures.push(`[弹窗巡逻] ${name} 里可点元素过小(<28px):${audit.small.join(' | ')}`)
    if (audit.dimDisabled.length) failures.push(`[弹窗巡逻] ${name} 里禁用态的字读不出来:${audit.dimDisabled.join(' | ')}`)
    if (audit.badGroups.length) failures.push(`[弹窗巡逻] ${name} 里选择组没选中态:${audit.badGroups.join(' | ')}`)
    console.log(`弹窗巡逻:${name} · ${audit.count} 控件${audit.small.length ? ' · 过小:' + audit.small.join(' | ') : ' · 触控达标'}`)
  }

  await patrol('分解', async () => {
    const btn = page.locator('main button', { hasText: /^分\s*解$/ }).first()
    if ((await btn.count()) === 0) return false
    await btn.click({ timeout: 3000 }).catch(() => {})
    return true
  })
  await patrol('收纳', async () => {
    const btn = page.locator('main button', { hasText: /^收\s*纳/ }).first()
    if ((await btn.count()) === 0) return false
    await btn.click({ timeout: 3000 }).catch(() => {})
    return true
  })
  await patrol('装备详情', async () => {
    const card = page.locator('main button[data-uid]').first()
    if ((await card.count()) === 0) return false
    await card.click({ timeout: 3000 }).catch(() => {})
    return true
  })
  await patrol('开炉炼丹', async () => {
    const btn = page.locator('main button', { hasText: /开\s*炉\s*炼\s*丹/ }).first()
    if ((await btn.count()) === 0) return false
    await btn.click({ timeout: 3000 }).catch(() => {})
    return true
  })
  if (pageErrors.length) failures.push(`[弹窗巡逻] 页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第三十九件事:丹炉缺草 → 去坊市,落点滚到灵草格(议题 #130) ----
/*
 *   ① 缺草时丹炉里出现「去坊市续草」;
 *   ② 点下去落到 buy 签,hash 带 focus=herb;
 *   ③ 高亮的是方子要的那一品灵草,且完整落在视口内。
 * 夹具把目标草格排到货架最末一行,前面摆一格别品的草:不滚、不按品挑都会红。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const now = Date.now()
  // 货架 15 格,目标草在最末一行(390 宽两列):真实 6 格在 844 高视口里本就看得见,量不出滚没滚
  // 第 6 格是另一品的草:按「有草就亮」挑会抢先点亮它
  const slot = (idx, matId, grade) => ({
    kind: 'material',
    idx,
    matId,
    ...(grade === undefined ? {} : { grade }),
    count: 12,
    price: gn(1, 3),
    sold: false
  })
  const stock = [
    ...Array.from({ length: 6 }, (_, i) => slot(i, 'ore')),
    slot(6, 'herb', 2),
    ...Array.from({ length: 7 }, (_, i) => slot(7 + i, 'ore')),
    // 玩家在炼气(3 境),天运丹要凡品草:目标格
    slot(14, 'herb', 1)
  ]
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: now - 86400000, lastActiveAt: now, totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '续草自检',
      major: 3,
      sub: 2,
      exp: gn(1, 2),
      age: 30,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 }
    },
    // 五品灵草全空;天运丹要 30 株凡品草,开局成就至多补到 10,仍缺 20
    resources: { spiritStone: gn(1, 9), qi: 1000, wudao: 0, herbByGrade: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, ore: 0, page: 0, dust: 0 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    dongfu: { levels: { mansion: 1, field: 1, alchemy: 5, forge: 1, library: 1 }, offlineCapHours: 24 },
    // 只给这张高耗草方子:入门三方的余量会遮掉「缺草」
    lore: { recipeLore: { p_tianyun: 0.5 } },
    market: { stock, stockedAt: now, consign: [] },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/inventory?tab=pill', { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)

  checked += 1
  const opener = page.getByRole('button', { name: /开\s*炉\s*炼\s*丹/ }).first()
  // 等入口可见再点,不靠固定等待
  await opener.waitFor({ state: 'visible', timeout: 8000 })
  await opener.click({ timeout: 3000 })
  const card = page.locator('.modal-panel .card-ink', { hasText: '天运丹' }).first()
  await card.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  if ((await card.count()) === 0) {
    failures.push('[390] 续草场景:丹炉里没渲染出天运丹(夹具没铺到缺草那一档)')
  } else {
    const blockedText = (await card.innerText()).replace(/\s+/g, ' ')
    if (!/灵草/.test(blockedText)) failures.push(`[390] 续草场景:缺草卡片没说是灵草不足 —— ${blockedText.slice(0, 60)}`)
    const link = card.getByRole('link', { name: /去坊市续草/ })
    if ((await link.count()) === 0) {
      failures.push('[390] 续草场景:灵草不足却没有「去坊市续草」的去路')
    } else {
      await link.click({ timeout: 3000 })
      // 等落点定下来(高亮或缺草说明),不靠固定延时
      await page
        .waitForFunction(
          () => !!document.querySelector('[data-focus-herb-missing]') || !!document.querySelector('.card-ink.ring-2'),
          undefined,
          { timeout: 8000 }
        )
        .catch(() => {})
      const landed = await page.evaluate(() => ({
        hash: location.hash,
        scrollTop: document.querySelector('main')?.scrollTop ?? 0,
        // 内容区的可视范围:上沿在顶栏之下,下沿在底栏之上
        view: (() => {
          const box = document.querySelector('main')?.getBoundingClientRect()
          return box ? { top: box.top, bottom: box.bottom } : null
        })(),
        missing: !!document.querySelector('[data-focus-herb-missing]'),
        herb: (() => {
          const el = document.querySelector('[data-card="14"]')
          if (!el) return null
          const box = el.getBoundingClientRect()
          return {
            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
            highlighted: el.className.includes('ring-2'),
            top: box.top,
            bottom: box.bottom
          }
        })(),
        // 另一品的那格草:不许被点亮
        wrongGrade: (() => {
          const el = document.querySelector('[data-card="6"]')
          return el
            ? { text: (el.textContent || '').replace(/\s+/g, ' ').trim(), highlighted: el.className.includes('ring-2') }
            : null
        })()
      }))
      if (!/focus=herb/.test(landed.hash)) failures.push(`[390] 续草场景:跳转没带上 focus=herb(${landed.hash})`)
      if (!/grade=1/.test(landed.hash)) failures.push(`[390] 续草场景:跳转没带上要补的品阶(${landed.hash})`)
      if (landed.missing) failures.push('[390] 续草场景:货架明明有灵草,却报「暂无此品灵草」')
      if (landed.wrongGrade?.highlighted) failures.push(`[390] 续草场景:点亮了别品的草 —— ${landed.wrongGrade.text.slice(0, 30)}`)
      if (!landed.herb) {
        failures.push('[390] 续草场景:坊市里找不到 fixture 的灵草格,判据没量到东西')
      } else {
        if (!/灵草/.test(landed.herb.text)) failures.push(`[390] 续草场景:高亮格不是灵草 —— ${landed.herb.text.slice(0, 40)}`)
        if (!landed.herb.highlighted) failures.push('[390] 续草场景:灵草格没被高亮(玩家仍要自己一格格找)')
        // 须完整落在内容区可视范围内(不被顶栏、底栏遮住)
        const view = landed.view
        if (!view) failures.push('[390] 续草场景:找不到内容区(main),判据没量到东西')
        else if (landed.herb.top < view.top || landed.herb.bottom > view.bottom) {
          failures.push(`[390] 续草场景:灵草格仍在视口外(top ${landed.herb.top.toFixed(0)} / bottom ${landed.herb.bottom.toFixed(0)},内容区 ${view.top.toFixed(0)}~${view.bottom.toFixed(0)})`)
        }
        if (landed.scrollTop <= 0) failures.push('[390] 续草场景:内容区一步都没滚 —— 灵草格是碰巧本来就在视口里?')
      }
      console.log(`\n续草落点:${landed.hash} · 灵草格 ${landed.herb ? `${landed.herb.top.toFixed(0)}~${landed.herb.bottom.toFixed(0)}px` : '未找到'} · 内容区 scrollTop ${landed.scrollTop.toFixed(0)}`)
    }
  }
  if (pageErrors.length) failures.push(`[390] 续草场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第三十九件事(续):架上无草 ----
/* 六格随机,架上可能没有该品草:须有明确提示 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const gn = (m, e) => ({ m, e })
  const now = Date.now()
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: now - 86400000, lastActiveAt: now, totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: {
      name: '空架自检',
      major: 3,
      sub: 2,
      exp: gn(1, 2),
      age: 30,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] },
      linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 }
    },
    resources: { spiritStone: gn(1, 9), qi: 1000, wudao: 0, herbByGrade: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, ore: 0, page: 0, dust: 0 },
    inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
    endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
    dongfu: { levels: { mansion: 1, field: 1, alchemy: 5, forge: 1, library: 1 }, offlineCapHours: 24 },
    lore: { recipeLore: { p_tianyun: 0.5 } },
    // 六格一件草都没有
    market: {
      stock: Array.from({ length: 6 }, (_, idx) => ({ kind: 'material', idx, matId: 'ore', count: 12, price: gn(1, 3), sold: false })),
      stockedAt: now,
      consign: []
    },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
  }
  await ctx.addInitScript(
    data => {
      if (localStorage.getItem('__layoutSeeded')) return
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
      localStorage.setItem('__layoutSeeded', '1')
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/market?focus=herb', { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  // 等提示落进 DOM,不靠固定等待
  await page
    .waitForFunction(() => !!document.querySelector('[data-focus-herb-missing]'), undefined, { timeout: 8000 })
    .catch(() => {})
  checked += 1
  const said = await page.evaluate(() => {
    const el = document.querySelector('[data-focus-herb-missing]')
    return (el?.textContent || '').replace(/\s+/g, ' ').trim()
  })
  // 架上没进这一品草(不是卖光),提示须与之对应
  if (!/暂无此品灵草/.test(said)) failures.push(`[390] 空架续草:架上没有这一品草却没说清(${said || '无提示'})`)
  else console.log(`\n空架续草:「${said.slice(0, 40)}…」`)
  if (pageErrors.length) failures.push(`[390] 空架续草页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

await browser.close()

// ---- 第二十七件事:外壳高度认 dvh,不认 vh ----
/*
 * 查构建产物:外壳高度须写成 dvh。无头浏览器 100vh 等于可视高度,换回 vh 运行时判据照样全绿;
 * 手机浏览器地址栏挂着时 vh 是大视口,底栏会被压住。
 */
{
  checked += 1
  const dir = join(ROOT, 'dist/assets')
  const css = readdirSync(dir)
    .filter(f => f.endsWith('.css'))
    .map(f => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
  // 四层选择器须都认这个高度,少一层即攒出可滚余量;按选择器查(压缩器会把连着的选择器并进一条规则)
  const covered = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => body.includes('height:var(--app-shell-height)'))
    .flatMap(([, sel]) => sel.split(',').map(s => s.trim()))
  const missing = ['html', 'body', '#app', '.app-shell'].filter(s => !covered.includes(s))
  if (missing.length) failures.push(`外壳高度没铺满四层,缺 ${missing.join(' / ')}(少一层就攒出可滚余量)`)
  if (!css.includes('100dvh')) {
    failures.push('外壳高度没走 dvh(手机浏览器地址栏挂在外面时,底栏会被压住)')
  }
  // 楷体栈内置那份须排第一,只能查产物:无头容器没有系统楷体,运行时量不出次序;真机上 iOS、Windows 会各自命中系统楷体
  const kaiRule = /--font-kai:([^;}]*)/.exec(css)
  if (!kaiRule) {
    failures.push('构建产物里找不到 --font-kai(字体栈的唯一事实源在 src/style.css)')
  } else if (!/^\s*"?LXGW WenKai"?/.test(kaiRule[1])) {
    failures.push(`楷体栈第一位不是内置字体(现在是${kaiRule[1].slice(0, 40)}…)—— 三端会各用各的系统楷体`)
  } else if (!/Kaiti SC|KaiTi/.test(kaiRule[1])) {
    failures.push('楷体栈里没了系统楷体兜底 —— 子集外的生僻字会直接掉到衬线')
  }
}

if (zoomSeen === 0) failures.push('200% 缩放档一处都没量到 —— 那条判据空转了(390 档的路由没跑完?)')
if (zoomSeenLate === 0) failures.push('后期档 200% 缩放一处都没量到 —— 那条判据空转了(后期档路由没跑完?)')

console.log(`\n排版自检:${checked} 个页面 × 视口组合`)
if (failures.length === 0) {
  console.log('✓ 无横向溢出、无越界元素、底部导航五项齐全、控件有名且不小于 28px、选择项有选中态')
  console.log('✓ 顶栏底栏钉死(文档层没有可滚余量,滚窗两栏不动),外壳高度认 dvh')
  console.log('✓ 五处页签栏吸顶(背包四册 / 图鉴 / 名号 / 界域志 / 天界),且铺满内容区宽度')
  console.log('✓ 顶栏一格一行(320 窄屏与横屏、桌面都不折行)')
  console.log('✓ iOS 存档风险提示只在该出现的平台出现,关一次就不再唠叨')
  console.log('✓ 楷体三端统一(内置排栈首,系统楷体留作兜底),且真由内置字体渲染')
  console.log('✓ 提示条点得掉、弹窗焦点与外壳偏移正常、引擎事件弹窗也过同一套尺子')
  if (SHOTS) console.log(`  截图已存 ${SHOTS_DIR}`)
} else {
  for (const f of failures) console.log(`✗ ${f}`)
  process.exitCode = 1
}
