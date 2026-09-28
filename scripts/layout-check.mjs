/* eslint-disable no-console -- 自检脚本的产出就是给人看的报告 */
/**
 * 排版自检 —— 手机尺寸下逐页量一遍「有没有横向溢出」
 *
 * 用法:
 *   bun run build
 *   bunx playwright install chromium  # playwright 已是 devDependency;浏览器缓存在 ~/.cache/ms-playwright
 *   node scripts/layout-check.mjs     # 加 --shots 顺带存图到 /tmp/layout-shots
 *
 * 只作本地工具,不在 CI 里跑(2026-09-18 起从 deploy.yml / build.yml 摘掉:整套要十来分钟,
 * 且靠时机的判据在 runner 上时红时绿,曾连续挡住 Pages 部署与发版)。
 * Windows 上请用 node 而不是 bun 启动:Bun 起不来 Chromium 的调试管道(进程能拉起、握手不完成)。
 * playwright 写在 devDependencies 里(锁版本):它没有 postinstall,bun install 只带
 * JS 本体;真正占地的浏览器二进制由上面那句按需下。
 *
 * 它做这些事:
 *   一 走完真实建号流程(同意隐私 → 命名 → 踏入仙途),拿到一份真存档;
 *   二 在 390×844 / 375×812 / 320×568 三个宽度下,逐页量 scrollWidth 与越界元素,
 *      并核对**外壳本身**没被滚偏(overflow-hidden 的盒子玩家滚不动,浏览器滚得动);
 *   三 把「底部导航五项」「无 pageerror」「控件都有可访问名」「可点元素不小于 28px」也一并核对;
 *   四 把浏览器存储卡死(令 setItem 抛错),看设置页会不会把「写不进去」说出来 ——
 *      静默丢档是玩家看不见的事故,只能靠这一条端到端核。
 *   五 弹窗的 dialog 语义与焦点(进得去 / 困得住 / 关掉还给触发它的按钮);
 *   六 Tab 焦点看得见(全局 :focus-visible 是否有实际轮廓);
 *   七 浮出来的提示条点得掉 —— 它挂着 @click 关掉自己,不能被外框的
 *      pointer-events:none 继承掉(继承了就永远只能等超时)。
 *   八 引擎按概率触发的两扇弹窗(顿悟 / 洞府巡游):把概率钉成必中再量一遍 ——
 *      它们正常巡页碰不到,正是最容易悄悄退回「自己铺一层浮层」的角落。
 *   九 冷启动落在子页时,「返回」要回父页而不是退出游戏(书签 / deep link /
 *      PWA 恢复上次路由都会走到这个处境)。
 *   十 后期档复核:用夹具存档(神人境 + 装备/法宝/器魂/在途秘境 + 隔夜归来)
 *      再巡一遍 —— 空档量不出长数字与满屏内容,而归来卷轴那屏每几天就见一次。
 *   十一 渡劫突破真打一次:结果弹窗必须写清成败与雷数、成功要与页面境界对得上
 *      (每个玩家反复看的那一屏,此前从没被渲染过)。
 *   十二 走完一次转世(寿元将尽 → 此生已矣 → 轮回 → 新的一世):唯一会把存档
 *      推倒重来的仪式,此前一步都没被真浏览器走过。
 *   十三 挂机玩法真的在挂着跑:顶栏灵气只给 1 点,真等两轮看它自己涨不涨 ——
 *      「应用启动后引擎有没有跑起来」只有真浏览器能答。
 *   十四 存档往返:导出 → 投灵脉花掉灵石 → 导入回来,必须回到导出那一刻
 *      (最后一道保险,此前没人按过这两个按钮)。
 *   十五 后期档再走一遍 320 窄屏:「长数字 + 满屏内容 + 最窄屏」这个组合
 *      此前没量过(主巡页的 320 用的是刚建号的空档)。
 *   十六 坏档开局:坏掉一个分片也要进得去,并且说得出「哪一片坏了、原档在哪」。
 *   十七 导出失败也要说话:把浏览器的下载能力打断再点一次「导出存档」。
 *   十八 切后台/离开页面时,待刷的存档要立刻落盘(visibilitychange / pagehide)。
 *   十九 真打一场历练战斗:战报回放要出内容、结语要写清胜负、战斗分析点得开。
 *   二十 背包里的账目:强化写着扣多少尘就扣多少,分解说给多少尘就给多少。
 *   二十一 闭关期间不许历练:点出发要当场拦下(不开模式窗),换页回来闭关还在。
 *   二十二 减少动效真的减到了(并顺带在音效开着的情况下点一路按钮)。
 *   二十三 洞府营造的账目:卡片写多少石就扣多少石。
 *   二十四 法宝炼化的两笔账:按钮上两种代价都得写全,且两种都按所写扣。
 *   二十五 一键分解要「先勾后点」:勾品质只是标记,行囊里的东西须点「分 解」才化尘。
 *   二十六 智能收纳不替玩家扔「有投入的件」:练过/成套/近满的三件必须留下。
 *   二十七 顶栏底栏钉死:滚一遍窗口,两栏一步都不许动,文档层不许有纵向可滚余量。
 *      外加一条构建产物判据:外壳高度得认 dvh —— 无头浏览器的 100vh 恰好等于可视
 *      高度,把外壳换回 vh 它照样全绿,只有查产物这一条拦得住。
 *   二十八 页签栏吸顶:背包四册、图鉴、名号、界域志、天界的页签栏,滚过之后要贴在
 *      内容区顶、且铺满内容区宽度(空档滚不动,判据自己往容器里垫占位造余量)。
 *   二十九 不是手机竖屏的两档:横屏 844×390 与桌面 1280×800 也各巡一遍全量路由 ——
 *      自适应断点(高度 short:、大屏的册页留白)就在这两档上现形。
 *   三十 顶栏不许折行:数字断行看着像乱码,顶栏还会从 46px 涨到 58px(320 宽复发过)。
 *   三十一 iOS 存档风险提示:该出现的平台出现(且关掉就真不再出现),不该出现的平台
 *      一个字都不说 —— 桌面/安卓用应用自己的存储,在那儿喊「iOS 会清掉存档」是胡说。
 *   三十二 楷体统一:构建产物里内置字体必须排在字体栈第一位(系统楷体留作兜底),
 *      并且真渲染时楷体文字确实由它画出来(字体文件坏了、404 了都在这儿现形)。
 *   三十三 地界卡不许挤压:名字必须单行,头部与操作块不许相交。夹具里备了镇压中、
 *      临期复聚、已取得资格三态 —— 从前夹具一个镇压区域都没有,于是「自动产出」
 *      把地界名压成竖排的事故全绿通过(横向溢出量不到挤压:卡片没溢出,只是挤)。
 *   三十四 两条通用挤压判据,全页面生效:①文字被挤成竖排(宽 < 40px 且折成 3 行以上);
 *      ②数字与量词被换行拆开(「2,798 石」不许变成「2,798 / 石」)。两者都是
 *      「卡片没溢出、只是挤」这一类,横向溢出永远查不出来。
 *   三十五 标点不许被折成孤字:模板里把标点另起一行写(HTML 会把换行折成空格),
 *      窄屏上句号就会独自占一行 —— 量的是渲染结果,比在源码里认标点准。
 *   三十六 敌人卡最挤的一档:名字最长 9 字 + 满标签(首领/宿敌/3 特性)+ 星级。
 *      巡页用的档里敌人名字都短、认知层为 0(特性根本不显示),这一档从前没被量过。
 *
 * 判据是「横向溢出」这一类——它正是窄屏上最常见的排版事故。
 * 说明:这是无头 Chromium 的视口模拟,不是真机;字体渲染与安全区(刘海/手势条)
 * 仍需真机确认,故本脚本过绿不等于真机过绿。
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

const VIEWPORTS = [
  // 390×844 = iPhone 12/13/14/15 的标称宽度,当下最常见的一档;
  // 375/320 是旧机型与极窄档。三档一起量,免得只守住了其中一档。
  // dpr 只影响截图栅格化(1px 边框、字体抗锯齿),不影响 CSS 布局与判据 ——
  // 但 --shots 存下来的图因此更接近真机看到的密度,便于人眼复核。
  { width: 390, height: 844, tag: '390', dpr: 3 },
  { width: 375, height: 812, tag: '375', dpr: 3 },
  { width: 320, height: 568, tag: '320', dpr: 2 },
  // 两档「不是手机竖屏」的设备。它们各自暴露过一类毛病,故各占一档:
  //   横屏 844×390 —— 上下两栏吃掉 22% 的高度(改前 26%),而宽度只用掉一半;
  //   桌面 1280×800 —— 窄栏顶天立地;不在大屏上收成一册,它就只是一条带子。
  // 安卓壳与桌面客户端都能转到这两档;PWA manifest 锁了竖屏,浏览器里随意缩窗。
  { width: 844, height: 390, tag: '844x390', dpr: 2 },
  { width: 1280, height: 800, tag: '1280x800', dpr: 1 }
]
/**
 * 全量路由 —— 从前只巡八页,于是设置页与收藏页的排版与选中态从未被量过。
 * 页面各有各的布局风险,漏一页等于那一页没有守卫(加进来只多几秒)。
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

/**
 * 自检不许依赖公网。
 *
 * index.html 里挂着 `<script defer src="https://sdk.51.la/...">`(第三方统计)。`load` 事件
 * 要等它下载完才触发,而 GitHub 的 runner 到这家 CDN 时通时堵:堵住时 `page.goto(..., load)`
 * 就卡满 30 秒超时 —— 实测两次,一次在第一页(什么都还没跑),一次在第二十五件事的中途,
 * 位置随机、没有任何判据失败,只有 `goto: Timeout 30000ms`。
 * 让这个域名的 DNS 当场解析失败:脚本立刻 error、`load` 照常触发,统计脚本的运行时异常
 * 本来就由下面 watchPageErrors 分流不计。自检从此不再随别人的 CDN 起伏。
 */
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security', '--host-resolver-rules=MAP sdk.51.la ~NOTFOUND']
})
const failures = []
let checked = 0

/**
 * 弹窗**里面**的控件也要过页面上那两条尺子:有可访问名、不小于 28px。
 *
 * 逐页巡的那一遍只量得到页面上摆着的东西 —— 弹窗没打开就不存在,于是这两条
 * 判据一直没有覆盖弹窗内部。实测漏掉的有:共享的关闭键(一枚图标、无名、
 * 内外边距加起来 26px,每个弹窗都有它)、纯文字按钮「立契」(18px)、
 * 行内链接(命中区只有字体那 14px)。故这里量弹窗自己。
 */
async function auditModalControls(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.modal-panel')
    if (!panel) return null
    const rows = [...panel.querySelectorAll('button, a, [role=button]')]
      .map(el => {
        const r = el.getBoundingClientRect()
        return {
          name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14),
          h: Math.round(r.height)
        }
      })
      .filter(r => r.h > 0)
    return {
      count: rows.length,
      // 对话框自己也得有个名字:读屏遇到 role=dialog 要念得出是哪一扇
      label: (panel.getAttribute('aria-label') || panel.querySelector('h3')?.textContent || '').trim(),
      unnamed: rows.filter(r => !r.name).map(r => `${r.h}px`),
      small: rows.filter(r => r.h < 28).map(r => `${r.h}px «${r.name || '无名'}»`)
    }
  })
}

/**
 * 收集页面异常 —— 只认本项目代码抛的。
 *
 * 站点里挂了一段第三方统计脚本(51.la)。它自己抛的异常与游戏无关,却会把
 * 「无 pageerror」判否掉 —— 实测:把 Math.random 钉成常量(为了确定性地触发
 * 引擎事件)之后,那段脚本会抛 `TypeError: Invalid UUID`,而游戏本身一切正常。
 * 故按堆栈里的脚本来路分流:第三方脚本的异常只打印、不计入失败。
 */
function watchPageErrors(page, sink) {
  let thirdPartyNoted = false
  page.on('pageerror', e => {
    const stack = String(e.stack || e.message || '')
    if (/sdk\.51\.la/.test(stack)) {
      // 逐页重载会把它重复抛出来,同一处只提一次,免得报告被噪声淹没
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
 * 把取景收拾干净:收掉提示条、钉死随机事件、关掉已经浮上来的弹窗。
 *
 * 由来:弹窗焦点场景三次偶发假红,真凶每次都是引擎随机浮上来的「悟道顿悟」——
 * 它是一整层遮罩,点它盖着的入口自然点不动。只钉 Math.random 不够:
 * 引擎每秒一拍,从「踏入仙途」到这条场景动手之间已经够它掷出一次了。
 */
async function clearOverlays(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  /*
   * 关掉**已经浮起来**的浮层,并且等够一轮。
   *
   * 坑在这里:引擎掷出顿悟(每秒一拍)与弹窗自己每秒一次的轮询是两个独立定时器,
   * 事件已经产生、窗还没画出来 —— 这时数 .modal-panel 是 0,当场就收工,
   * 一秒后那扇窗才浮上来,正好盖住要点的入口。故这里固定转六圈(≈2.1 秒):
   * 有窗就按 Esc 收掉,没窗就等着 —— 反正随机源已钉死,等到的只会是**之前那一扇**。
   */
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
  return page.evaluate(() => [...document.querySelectorAll('.modal-panel')].map(p => (p.querySelector('h3')?.textContent || p.getAttribute('aria-label') || '?').trim()))
}

/** 把 formatGN 渲染出来的文本还原成数值(万/亿/兆…按 10^4 递进) */
async function readFormatted(page, title) {
  return page.evaluate(t => {
    const el = document.querySelector(`[title="${t}"]`)
    if (!el) return { text: `(找不到 ${t})`, value: null }
    const text = (el.textContent || '').trim().replace(/,/g, '')
    const UNITS = ['万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载', '极']
    const m = /([\d][\d]*(?:\.\d+)?)\s*(万|亿|兆|京|垓|秭|穰|沟|涧|正|载|极)?/.exec(text)
    if (!m) return { text, value: null }
    const unit = m[2] ? Math.pow(10, 4 * (UNITS.indexOf(m[2]) + 1)) : 1
    return { text, value: parseFloat(m[1]) * unit }
  }, title)
}

/**
 * 一页一量:横向溢出、外壳偏移、越界元素、无名控件、过小可点元素、选择组选中态、底部导航项数。
 *
 * 抽成函数是为了让**后期档**那一遍复用同一把尺子 —— 空档量不出长数字与满屏内容,
 * 而两遍若各写一份判据,迟早会分叉成两套标准。
 */
async function measurePage(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const overflows = [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.right <= vw + 2) return false
        // 纯装饰层(墨爆/传送门)故意超出视口,且不吃事件,不算排版事故
        return !el.classList.contains('pointer-events-none') && !el.closest('.pointer-events-none')
      })
      .slice(0, 4)
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}@${Math.round(el.getBoundingClientRect().right)}`)
    return {
      hash: location.hash,
      horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
      /**
       * 外壳(#app 的第一层)不能被滚偏,也不该有可滚的横向余量。
       *
       * 它是 overflow-hidden 的:玩家滚不动,但**浏览器滚得动**。
       * 云雾装饰故意越界画出盒子(左上 -64px、右下 -96px),曾把外壳撑到
       * scrollWidth 516 vs clientWidth 390;建号结束时浏览器顺手把 scrollLeft
       * 设成 24,此后整个界面永久左移 24px —— 顶栏名字被切掉左半边、底部
       * 第一栏「洞府」只剩半个字。而「查 documentElement 有没有横向溢出」查不出
       * 这件事:overflow-hidden 把子元素的溢出挡在外壳以内,量在最外层永远是绿的。
       * 故这里直接量外壳自己:scrollLeft 必须为 0,且不该有横向可滚区间。
       */
      shellShift: (() => {
        const shell = document.getElementById('app')?.firstElementChild
        if (!shell) return null
        return { scrollLeft: Math.round(shell.scrollLeft), overflowX: Math.round(shell.scrollWidth - shell.clientWidth) }
      })(),
      overflows,
      navItems: document.querySelectorAll('nav button, nav a').length,
      /**
       * 只有图标的控件必须自带可访问名(aria-label / 可见文字)。
       * 没有名字,读屏只会念「按钮」「链接」,自动化也无从按名字点它。
       */
      unnamed: [...document.querySelectorAll('button, a, [role=button]')]
        .filter(el => {
          const name = (el.getAttribute('aria-label') || el.textContent || '').trim()
          if (name) return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        .slice(0, 3)
        .map(el => el.outerHTML.slice(0, 80).replace(/\s+/g, ' ')),
      /**
       * 可点元素的高度下限 28px —— 拇指点得着的最起码尺寸。
       * 实测(带装备的后期档,375/320 两档):修前有 47 个不足 24px、26 个不足 28px,
       * 大多是把文字行直接当按钮(属性来源行、返回链接、设置里的胶囊按钮)。
       */
      smallTargets: [...document.querySelectorAll('button, a, [role=button]')]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 28)
        .slice(0, 3)
        .map(({ el, r }) => `${Math.round(r.height)}px «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 12)}»`),
      /**
       * 禁用按钮上的字也得读得出来。
       *
       * 禁用态往往正是「为什么不让我点」那句(「修为未至圆满」「灵石不足」),
       * 而它此前用最淡的 ink-ghost 打底 + 75% 白字 —— 实测对比度 1.79:1,
       * 在手机上基本看不见。这里量的是**算出来的**前景/背景对比度(两条都是不透明色)。
       */
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
          /**
           * 把一层层半透明底色**合成**成实际看到的颜色。
           *
           * .btn-ghost:disabled 的底是 rgb(ink / 0.04),只看这一层的 RGB 会当成纯黑,
           * 于是浅字对它算出 2.46:1 的假红。真实观感是「卡片色 + 4% 墨」,约 4:1。
           */
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
      /**
       * 顶栏里的字都只能占一行。
       *
       * 320 宽时曾把「3000/1000 亿载」「9 兆」「25.33 亿」折成两行 —— 数字一断行
       * 看着就像乱码,顶栏还从 46px 涨到 58px。故逐格量高:超过一行(≈24px)就是又折了。
       */
      headerTall: (() => {
        const header = document.querySelector('header')
        if (!header) return []
        return [...header.querySelectorAll('span, p')]
          .filter(el => el.getBoundingClientRect().height > 24)
          .slice(0, 3)
          .map(el => `${Math.round(el.getBoundingClientRect().height)}px «${(el.textContent || '').trim().slice(0, 10)}»`)
      })(),
      /**
       * 地界卡不许把名字挤成竖排,也不许让操作块压到名字那一行。
       *
       * 「横向溢出」量不出这类事故:卡片并没有溢出,只是右侧那一列把左边的名字压到只剩一个字宽,
       * 「青云山麓」当场变成一字一行,标签还会盖到产出字上 —— 玩家先看见,脚本量不到。
       * 故直接量两块元素的位置关系(名字高度 + 头部与操作块是否相交)。
       */
      regionCards: (() => {
        const tall = []
        const overlap = []
        for (const card of document.querySelectorAll('[data-region-card]')) {
          const name = card.querySelector('[data-region-name]')
          const label = (name?.textContent || '').trim()
          if (name) {
            const h = Math.round(name.getBoundingClientRect().height)
            // 15px 楷体单行约 22px;超过 30px 就是折行了(竖排四行能到 88px)
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
      /**
       * 通用挤压判据之一:**被挤成竖排的文字**。
       *
       * 一行 flex 里塞了「长文字 + shrink-0 的右列」时,左列会被压到只剩一个字宽,
       * 于是「青云山麓」一字一行 —— 卡片并没有溢出,横向溢出查不出来。
       * 判据取「宽度 < 40px 且折成 3 行以上」:正常的排版不会出现这种盒子。
       */
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
      /**
       * 通用挤压判据之二:**数字与量词分家**。
       *
       * 「升级 · 2,798石 50铁」在 320 宽上会断成「升级 · 2,798 / 石 50铁」——
       * 数与单位跨行看着像两个数。用 Range 逐字取矩形,量出「数字|量词」是否被换行拆开。
       */
      unitBreaks: (() => {
        const UNITS = '石铁尘株张载年次件层场阶枚缕时日'
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
          // 只量**标签/代价**这类短文本(≤24 字):长句子里的正常换行不算事故,
          // 否则整页散文都会被卷进来,判据就没人看了
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
      /**
       * 通用挤压判据之三:**孤零零的标点**。
       *
       * 「……仍受益的财富」换行 + 后面单独一个「。」时,句号会被推到下一行独自站着
       * (模板里把标点另起一行写的必然结果)。判据:某段只含标点的文字,
       * 与同一父节点里其余文字不在同一行。
       */
      orphanPunctuation: (() => {
        const out = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node && out.length < 3) {
          const t = node.nodeValue || ''
          const trimmed = t.trim()
          // 只认中文标点:半角「?」这类是占位符(未知装备就写着「?」),不是折行事故
          if (!/^[。、,]{1,2}$/.test(trimmed)) {
            node = walker.nextNode()
            continue
          }
          const parent = node.parentElement
          if (!parent) {
            node = walker.nextNode()
            continue
          }
          // 父节点里必须还有别的文字 —— 整块内容只有标点(装饰)不算孤字
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
          // 同一父节点里,有没有别的文字落在同一行(±4px)
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
      /**
       * 选择型控件的选中态要对机器可读,且**每组恰有一个**。
       *
       * 此前主题/战报速度/页签的选中全靠边色,读屏用户与自动化都看不出选了哪个
       * (上一轮补了 aria-label/aria-pressed,这里把「恰好一个」钉住)。
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
            if (on !== 1) out.push(`${attr} 组(${els.length} 项)里有 ${on} 个选中`)
          }
        }
        // 页签:每一组(同一父容器下 ≥2 个 role=tab)恰有一个 aria-selected=true
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
        // 设置页的两组选择(主题、战报速度)是明文约定:少了哪一组这里就红
        if (location.hash.startsWith('#/settings')) {
          const pressed = document.querySelectorAll('[aria-pressed]').length
          if (pressed < 6) out.push(`设置页的选择控件只有 ${pressed} 个带 aria-pressed(主题 3 + 速度 3)`)
        }
        return out.slice(0, 3)
      })(),
      /**
       * 顶栏与底栏必须钉死 —— 滚一遍,两栏一步都不许动。
       *
       * 结构上两栏是滚动宿主的**兄弟**(内容在 main 里滚),按理动不了。可一旦
       * **外壳比可视区高**,文档层就攒出纵向可滚余量,玩家一拖窗口两栏就跟着走,
       * 看着就是「没固定」。手机浏览器的 100vh 正是大视口(地址栏收起时的高度),
       * 所以这条 bug 只在手机浏览器里现形 —— 桌面与无头浏览器量不出差值,
       * 只能量它的**机制**:文档层有可滚余量,且滚窗口时两栏真的位移了。
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
 * 页签栏(InkTabs 的外壳 .tab-rail)要吸顶 —— 内容滚下去,它钉在内容区顶上。
 *
 * 这几册(背包四册、图鉴、名号、界域志、天界)都是越往下越长的列表,页签跟着滚走
 * 就得先滚回顶才能换一册。判据两条:滚过之后它还贴在内容区顶;盒子铺满内容区宽度
 * (两侧留缝的话,内容会从缝里明晃晃地穿过去)。
 *
 * 造余量那一段是有讲究的:空档的背包只有几件东西,页面根本滚不动,吸顶无从量起。
 * 于是往**视图根节点里**垫一块 1200px 的占位 —— 必须垫在容器里面:吸顶盒的活动
 * 范围是它的容器,容器到底了它就该跟着走;垫在容器外面等于没垫(第一版探针就是
 * 这么把背包页报成假红的)。
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

/** 页签吸顶读数 → 失败清单(null = 这一页没有页签栏,不判) */
function railProblems(rail) {
  const out = []
  if (!rail) return out
  if (rail.scrolled < 500) out.push(`页签吸顶没量到:内容只滚了 ${rail.scrolled}px(占位没垫进容器?)`)
  // 吸顶允许 1px 亚像素误差:getBoundingClientRect 是小数,滚动容器的顶与吸顶盒的顶
  // 各自落在半像素上时,差值四舍五入会在 0 与 1 之间跳(1280×800 的 /codex 实测时红时绿,
  // 两边仓库的 CI 都撞过)。「没吸顶」的读数是几百像素,不是 1 像素。
  if (Math.abs(rail.drift) > 1) out.push(`页签栏没吸顶:滚 ${rail.scrolled}px 后偏离内容区顶 ${rail.drift}px`)
  if (rail.bleed > 0) out.push(`页签栏没铺满内容区宽度,两侧共留 ${rail.bleed}px 缝(内容会从缝里穿过去)`)
  return out
}

/** 一页量出来的读数 → 失败清单(两遍巡页共用同一套判据) */
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

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr })
  const pageErrors = []
  watchPageErrors(page, pageErrors)

  await page.goto(INDEX, { waitUntil: 'load' })
  // 建号:同意隐私 → 传送门(约 2.5s)→ 命名 → 踏入仙途
  await page.getByRole('button', { name: /开\s*始\s*游\s*戏/ }).first().click()
  // 隐私弹窗也是弹窗:它的控件同样要过那两条尺子(页面上巡不到它)
  {
    const audit = await auditModalControls(page)
    checked += 1
    if (!audit || audit.count === 0) failures.push(`[${vp.tag}] 隐私弹窗里一个控件都没数到,判据没跑到东西`)
    if (audit && !audit.label) failures.push(`[${vp.tag}] 隐私弹窗没有可访问名(读屏只会念「对话框」)`)
    if (audit?.unnamed.length) failures.push(`[${vp.tag}] 隐私弹窗里有 ${audit.unnamed.length} 个无名控件`)
    if (audit?.small.length) failures.push(`[${vp.tag}] 隐私弹窗里可点元素过小:${audit.small.join(' | ')}`)
  }
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: /同意并开始/ }).first().click()
  await page.waitForTimeout(3200)
  await page.locator('input:not([type=file]):not([type=checkbox])').first().fill('排版自检')
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
    if (SHOTS) {
      mkdirSync(SHOTS_DIR, { recursive: true })
      await page.screenshot({ path: join(SHOTS_DIR, `${vp.tag}${route.replace(/\//g, '_')}.png`), fullPage: true })
    }
  }
  if (pageErrors.length) failures.push(`[${vp.tag}] 页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第四件事:存档写不进去时,设置页必须说话 ----
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

  // 卡死存储:此后任何写盘都抛配额错误(引擎每秒仍在改状态,故几秒内必然撞上一次刷盘)
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
  const warned = await page.evaluate(() => document.body.innerText.includes('上次写入存档失败'))
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

  /*
   * 先把浮出来的提示条收掉再点「关于」。
   *
   * 提示条是浮在顶上的一层(而且现在真的可点),建号后的成就提示会停留两三秒;
   * 它与设置页入口若落在同一区域,这条判据就会被一条无干的提示挡住而假红
   * (实测偶发:waitFor 过了、click 超时)。要测的是弹窗焦点,不是提示条 ——
   * 提示条自己那条判据在下面单独跑。
   */
  const stillOpen = await clearOverlays(page)
  if (stillOpen.length) failures.push(`[375] 弹窗焦点场景:动手前还开着浮层 —— ${stillOpen.join('、')}(取景没收拾干净)`)

  const trigger = page.getByRole('button', { name: /关于/ }).first()
  // 先等它真的画出来:懒加载的分包 + 页面淡入都要时间,直接点会得到
  // 「点了没反应」的假红(实测偶发),而这条判据要抓的是真问题,不是抢跑
  try {
    await trigger.waitFor({ state: 'visible', timeout: 10000 })
    await trigger.click({ timeout: 5000 })
  } catch (err) {
    // 把真实原因与**挡路的是谁**一起写进报告 —— 「页面没就绪?」这种猜测曾让人白跑两趟,
    // 第二次才发现挡路的是一层随机浮上来的浮盖。抓不到线索的判据等于没有判据。
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

  // 连按六次 Tab:焦点必须一直在弹窗里(此前会一路跑到页面与底部导航)
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

// ---- 第六件事:Tab 焦点看得见吗 ----
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
    // 从「没有焦点」的干净状态开始数 Tab,免得把上一页残留的焦点算进来
    await page.evaluate(() => document.activeElement?.blur())
    const seen = []
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body || el === document.documentElement) return { blind: null, label: '(body)' }
        const cs = getComputedStyle(el)
        // 透明的轮廓等于没有 —— 只看「有没有一圈线」会把 outline:transparent 也算通过
        const hiddenOutline = cs.outlineColor === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(cs.outlineColor)
        const ring =
          (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && !hiddenOutline) || cs.boxShadow !== 'none'
        const label = `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12)}»`
        return { blind: ring ? null : label, label }
      })
      seen.push(info.label)
      if (info.blind) failures.push(`[375] ${route} 第 ${i + 1} 个 Tab 落点看不见焦点:${info.blind}`)
    }
    // 落点一个没数到 = 这段判据没跑到东西,也要红
    if (seen.filter(s => s !== '(body)').length === 0) failures.push(`[375] ${route} 的 Tab 落点一个都没数到`)
  }
  if (pageErrors.length) failures.push(`[375] 焦点可见场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第七件事:浮出来的提示条能不能点掉 ----
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
      // 判据是**计算出来的** pointer-events:外框写 none 时按钮会继承成 none,
      // 于是 @click 挂在那儿却永远收不到事件 —— 写了不生效,等于没写
      blocked: buttons.filter(b => getComputedStyle(b).pointerEvents === 'none').length
    }
  }, hostSel)
  checked += 1
  if (before.count === 0) failures.push('[375] 浮层场景:一条提示都没浮出来,这条判据没跑到东西')
  if (before.blocked > 0) failures.push(`[375] 浮层场景:${before.blocked} 条提示条点了没反应(pointer-events 被外框的 none 继承)`)
  if (before.count > 0 && before.blocked === 0) {
    const first = page.locator(`${hostSel} button`).first()
    const text = ((await first.textContent()) ?? '').trim()
    await first.click({ timeout: 3000 })
    /*
     * 「点了要收」还得看它**多快**收:提示条带 glow-pulse 无限动画时,过渡探测
     * 会把 2.4 秒当成离场时长,点掉之后原地杵两秒才没(实测 460ms 仍在原地)。
     * 故给一个 1 秒的窗口 —— 它短于最短的提示寿命(2.6 秒),不会把「自己超时消失」错认成点掉了。
     */
    let gone = false
    for (let i = 0; i < 20 && !gone; i += 1) {
      await page.waitForTimeout(50)
      gone = (await page.locator(`${hostSel} button`, { hasText: text }).count()) === 0
    }
    if (!gone) failures.push(`[375] 浮层场景:点了「${text.slice(0, 12)}」1 秒内没消失(还挂在屏幕上)`)
  }
  if (pageErrors.length) failures.push(`[375] 浮层场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第八件事:引擎按概率触发的两扇弹窗(顿悟 / 洞府巡游) ----
/*
 * 这两扇由引擎自己掷概率弹出(顿悟 8% × 境界存在感、巡游每日一次),
 * 正常巡页永远碰不到;而它们此前是自己铺的 fixed inset-0,没有 dialog 语义、
 * 没有焦点管理。故这里把 Math.random 钉成 0 让那一掷必中 —— 下一次引擎心跳
 * 就会摆上来,然后按弹窗那套尺子量一遍。夹具只作用于测试页,不动生产代码
 * (注意 RandomService 在构造时就抓住了 Math.random 的函数引用,故引擎其余部分
 * 的随机数不受影响)。
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
          .map(el => ({ name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14), h: Math.round(el.getBoundingClientRect().height) }))
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
    const bad = info.controls.filter(c => !c.name || c.h < 28)
    if (bad.length) failures.push(`[375] 「${title}」里有 ${bad.length} 个控件不合格:${bad.map(c => `${c.h}px «${c.name || '无名'}»`).join(' | ')}`)
  }
  if (pageErrors.length) failures.push(`[375] 引擎事件场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await page.close()
}

// ---- 第九件事:冷启动落在子页时,「返回」不该把人送出游戏 ----
/*
 * 书签、外部 deep link、PWA 冷启动恢复上次路由,都会让**第一次**导航就落在
 * 子页上;此时站内没有上一页,裸 router.back() 会退到 about:blank ——
 * 实测整个界面连同这一局的上下文一起消失,而玩家只觉得「点了一下返回,游戏没了」。
 * 复现要用同一 context 里新开的一页:它共享存档(localStorage),但历史是全新的。
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
  // 这一页的第一次导航就是子页 —— 正是冷启动的处境
  await page.goto(INDEX + '#/dongfu', { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  // 同上:别让随机浮上来的引擎事件挡住「返回」
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

// ---- 第十件事:后期档的逐页复核(空档量不出长数字与满屏内容) ----
/*
 * 前面九件事量的是「刚建号」那一份空档。可同一个页面在神人境是另一副样子:
 * 数字长到九位数、法宝两件、器魂、在途秘境、以及隔夜归来时的「归来卷轴」。
 * 那一屏玩家每隔几天就会见一次,却从来没有被无头浏览器画出来过。
 * 故这里用一份自检夹具(存档密钥就写在包里,见 utils/crypto 的注释:并非安全边界),
 * 走一遍后期档:先核归来卷轴,再逐页过同一把尺子。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
      /*
       * 五系杂灵根:灵根行最挤的一档(名字 + 五个圆环 + ×倍率)。
       * 空档抽到「双灵根」时不挤,「杂灵根」被压成竖排的事故就靠运气才撞得到 ——
       * 这里钉死最挤的一份,让那个人物页状态每次都被量。
       */
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
      /*
       * 镇压三态都要在夹具里出现 —— 此前夹具一个镇压区域都没有,
       * 于是「自动产出」那条长信息把地界名挤成竖排的事故,这脚本从来没量过(玩家先看到的)。
       * qingyun 守了 7 小时(稳定)、wanyao 守到 71 小时(倒计时转红)、guzhanchang 守满一日(繁盛)。
       */
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
        // 黑风林:已取得镇压资格但当前仍在历练态(「转为镇压收益」那条要画出来)
        heifeng: { totalFights: 14, avgRounds: 3.9, avgDamageTakenPct: 0.18, consecutiveWins: 2, lastUpdateAt: Date.now() - 600000 }
      },
      // 在途秘境:归来卷轴要说「原样留着」,历练页也要画出「在境中」那一版
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
      // 在途远征:归来卷轴要说「原样留着」,天界页也要画出「走到第二重」那一版
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
    // 地界表:解锁到黑风林一带,好让「镇压中 / 已取得资格」两种卡片都渲染出来
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
    /*
     * 洞府等级:升级按钮上的代价是「数 + 量词」(2,798 石 · 50 铁),
     * 空档只有「200 石 20 铁」这种短数字,量不出「数字与量词被换行拆开」那条判据。
     */
    dongfu: { levels: { mansion: 4, field: 5, alchemy: 5, forge: 4, library: 4 }, offlineCapHours: 24 },
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
  // 夹具 payload 只做一次,后面 320 那一遍复用;播种加闸(见第十四件事的坑)
  const latePayload = Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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

  // (一)隔夜归来第一眼:数字不许漏 NaN,收下之后要真的关掉
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
  }

  /*
   * (三)在途秘境要真的推得动。
   *
   * 秘境这一整套此前只在单元用例里跑过 —— 界面上「再入一层」按下去会怎样,
   * 从没有人看过:点了没反应、刷不出战报、数字漏 NaN,都会静静留在这里。
   * 夹具身上带着一趟打到第二层的秘境,故这里真点一次:要么浮出战报,
   * 要么卡片状态前移(层数/败次/探尽),两者必有其一。
   */
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
      toasts: [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim())
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

  /*
   * (四)在途远征也要真的走得动。
   *
   * 与秘境同理:远征这一套只在单元用例里跑过,界面上「第 N 重择路」按下去会怎样,
   * 从没有人看过。夹具身上带着一趟打到第二重的赤炎天远征(天界页会直接开在远征册上),
   * 故这里真点一次择路:要么浮出战报、要么行程点列前移,并查占位符与页面异常。
   */
  await page.goto(INDEX + '#' + '/celestial', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  checked += 1
  const runBefore = await page.evaluate(() => document.querySelector('main')?.innerText || '')
  /*
   * 入口怎么认:两条路各自的按钮上写着「道源 +N」(层号那行是独立的文本,不在按钮里);
   * 若这一趟已经走到界主,入口换成「决战」。两者必有其一 —— 都找不到就是真没入口。
   */
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
      toasts: [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()),
      // 打输会开战报弹窗(赢了只是行程点列前移,不开弹窗)
      report: (document.querySelector('.modal-panel h3')?.textContent || '').trim()
    }))
    if (!after.report && after.toasts.length === 0 && after.text === runBefore) {
      failures.push('[390-late] 天界页:点了远征的推进入口既没战报也没变化(点了没反应)')
    }
    /*
     * 开出来的战报必须**叫得出这一界**:标题得在动手前取。
     * 从前先打后读 runWorld,而收尾那一场会把 worldRun 清空,标题就退成「远征」。
     */
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
   * (四续)天道试炼:第三条终局产线,同样只在单元用例里跑过。
   * 切到「试炼」册,真按一次应试,要求开出战报、且写清止步/功成与赏格、不漏占位符。
   */
  await page.goto(INDEX + '#' + '/celestial', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  // 上一步的远征战报还开着(它是一层遮罩),先收掉再切册 —— 否则点不动、还查不出原因
  const leftover = await clearOverlays(page)
  if (leftover.length) failures.push(`[390-late] 天界页:切试炼册前还开着浮层 —— ${leftover.join('、')}`)
  const trialTab = page.getByRole('tab', { name: /试\s*炼/ }).first()
  if ((await trialTab.count()) === 0) failures.push('[390-late] 天界页:找不到「试炼」册')
  else {
    await trialTab.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
    checked += 1
    const trialBtn = page.locator('main button', { hasText: /应\s*试/ }).first()
    if ((await trialBtn.count()) === 0) failures.push('[390-late] 试炼册里没有「应试」入口(判据没跑到东西)')
    else {
      const trialName = ((await trialBtn.textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 20)
      await trialBtn.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(2200)
      const after = await page.evaluate(() => {
        const panel = document.querySelector('.modal-panel')
        const text = panel?.innerText || ''
        return {
          title: (panel?.querySelector('h3')?.textContent || '').trim(),
          text: text.replace(/\n+/g, ' ').slice(0, 90),
          rows: panel ? panel.querySelectorAll('p, li').length : 0,
          leaks: /NaN|undefined|Infinity/.test(text)
        }
      })
      if (!after.title) failures.push(`[390-late] 试炼:点了「${trialName}」没有开出战报`)
      else {
        // 战报的两种口径:全捷(打通)或止步第 N 战
        if (!/全捷|止步第/.test(after.text)) failures.push(`[390-late] 试炼:战报没写清结果 —— ${after.text}`)
        if (after.leaks) failures.push('[390-late] 试炼:战报漏出占位符')
        console.log(`  天道试炼(点了「${trialName}」):战报「${after.title}」· ${after.text.slice(0, 34)}…`)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }
    }
  }
  if (pageErrors.length) failures.push(`[390] 后期档页面异常(试炼):${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()

  /*
   * (五)同一份后期档在 320 窄屏再过一遍。
   *
   * 主巡页在 320 量的是刚建号的空档(数字短、内容少);「长数字 + 满屏内容 + 最窄屏」
   * 这个组合此前没量过,而这正是最容易撑破的地方(实测当前全绿,故这一条是防回归)。
   */
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

// ---- 第十一件事:渡劫突破真打一次(一局里最要紧的那一屏,此前没人画过) ----
/*
 * 突破结果弹窗(成功/失败、渡劫雷数与「寿元增至」那一行)是每个玩家都会反复看的屏,
 * 而它从来没被无头浏览器渲染过 —— 空档修为不满,按钮是灰的;后期档又未必卡在大关上。
 * 故另起一份「炼气圆满」的夹具:修为与灵气给足、寿元留够,点「引 劫 突 破」真打一次。
 * 渡劫成不成是随机的,故判据只看**形状**:必须开出结果弹窗,写清成败与境界去向,
 * 失败不许漏占位符,成功要与页面上的境界对得上。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    // 炼气·圆满(大关)+ 修为灵气给足 + 寿元留够(寿元已尽会被「寿元将尽」截住)
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
      // 只认**突破结果**那一扇:屏幕上可能同时浮着别的(顿悟/巡游),拿错扇就诊断错人
      const panels = [...document.querySelectorAll('.modal-panel')]
      const panel = panels.find(p => /突破成功|突破失败/.test(p.innerText || '')) ?? null
      const text = panel?.innerText || ''
      return {
        found: !!panel,
        // 没开出来时,把「此刻开着的到底是谁」写进报告 —— 上一次注入就是靠这句才能一眼看懂
        others: panels.map(p => (p.querySelector('h3')?.textContent || p.getAttribute('aria-label') || '无标题').trim()).join('、'),
        text,
        label: panel?.getAttribute('aria-label') ?? null,
        outcome: /突破成功/.test(text) ? '成功' : /突破失败/.test(text) ? '失败' : null,
        hasWave: /共\s*\d+\s*道/.test(text),
        // 页面上当前境界(成功之后应当已经换名)
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
      const close = page.locator('.modal-panel button', { hasText: /继续问道|收拾心情/ }).first()
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
 * 转世是每一世收官的那套仪式,也是**唯一会把存档推倒重来**的流程 ——
 * 三步弹窗 + 择姿立题 + 新的一世,此前一步都没被真浏览器走过。
 * 夹具把寿元写尽(一读档引擎就判定身故),然后一路点下去。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  /*
   * 钉死随机源、收掉提示条 —— 但**不要**去关弹窗:这一屏正开着「寿元将尽」,
   * 它就是本场景的起点(而且它故意不可关)。钉随机的用意是免得引擎在转世途中
   * 掷出一个顿悟/巡游浮层,把「关没关干净」的判据搅红(实测偶发)。
   */
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  await page.waitForTimeout(400)

  /** 读一扇弹窗的形状:标题、正文、按钮、有没有漏占位符 */
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
  // 有先天之姿就先择一个(不择则「踏入轮回」是灰的)
  const talent = page.locator('.modal-panel button').first()
  if (next && next.buttons.some(b => /赋|姿/.test(b))) await talent.click({ timeout: 3000 }).catch(() => {})
  const confirm = page.locator('.modal-panel button', { hasText: /踏\s*入\s*轮\s*回/ }).first()
  if ((await confirm.count()) === 0) failures.push('[390] 转世场景:轮回那程没有「踏入轮回」')
  else {
    if (await confirm.isDisabled()) failures.push('[390] 转世场景:择了先天之姿,「踏入轮回」仍是灰的')
    await confirm.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(1800)
    const after = await page.evaluate(() => ({
      // 判据是「转世那几扇窗关干净了」,不是「一扇窗都没有」——新的一世里
      // 引擎随时可能浮出顿悟/巡游,那是正常玩法,不该被算作转世没走完
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

// ---- 第十三件事:挂机游戏真的在挂着跑(页面上的数自己在涨) ----
/*
 * 引擎每秒推进修为、灵气与洞府产出 —— 这是放置玩法的根,可此前没有被端到端看过一眼:
 * 单元用例直接调引擎,而「应用启动之后引擎到底跑起来没有」只有真浏览器能答。
 * 若哪天 engine.start() 被条件挡住、或 tick 被谁掐了,界面会安静地冻在那里,
 * 而所有单测照样全绿。故这里真等两轮:灵气只给 1 点,看它自己涨不涨。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)
  checked += 1
  /** 读顶栏灵气:文本按 formatGN 的档位(万/亿/兆…)还原成数值 */
  const readQi = () => readFormatted(page, '灵气')
  const first = await readQi()
  await page.waitForTimeout(3200)
  const second = await readQi()
  await page.waitForTimeout(3200)
  const third = await readQi()
  const nums = [first.value, second.value, third.value]
  if (nums.some(v => v === null || !Number.isFinite(v))) {
    failures.push(`[390] 挂机场景:顶栏灵气读数解析不出来 —— ${[first, second, third].map(x => x.text).join(' / ')}`)
  } else if (!(nums[2] > nums[0] && nums[0] <= nums[1] && nums[1] <= nums[2])) {
    // 判据是「一直在涨、至少涨了一截」——不要求每步都严格变大:灵气涨到上限会平下来
    failures.push(`[390] 挂机场景:灵气没有在涨(页面上的数冻住了 —— 引擎没跑?) ${nums.join(' → ')}`)
  } else {
    console.log(`\n挂机 6 秒:灵气 ${first.text} → ${second.text} → ${third.text}(页面上的数自己在涨)`)
  }
  if (pageErrors.length) failures.push(`[390] 挂机场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十四件事:导出 → 改动 → 导入回来(存档备份这条路真的走得通吗) ----
/*
 * 「存档只在本地」是这个游戏反复向玩家交代的一条(设置页也这么写),故「导出备份、
 * 事后导入救回来」是最后一道保险。单元用例测过 payload 的形状,却没人真按过这两个按钮:
 * 下载走的是 Blob + a[download],导入走 FileReader + 校验 + 写盘 + 重载,
 * 任何一环断了,玩家都要等到真丢档那天才知道。
 *
 * 判据用**不会自己变的数**(灵石;夹具里没有洞府产出):
 *   导出时的灵石 S0 → 投一点灵脉把灵石花掉(S1 < S0)→ 导入 → 必须回到 S0。
 *
 * 坑记一笔:这种会触发重载的场景,夹具**必须只种一次**
 * (addInitScript 每次导航都会跑,不加闸就会在重载时把刚导入的存档盖回夹具 —— 实测踩过)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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

  // 动一下不会自己变的数:投一点灵脉,把灵石花掉
  await page.goto(INDEX + '#' + '/', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /灵脉投资/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  const invest = page.locator('.modal-panel button.btn-ghost:not([disabled])').first()
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
    /*
     * 关键一步:等节流把这次改动**真写进磁盘**再导入。
     * 否则「导入后回到 S0」与「压根没写进去」在读数上分不出来 —— 注入验证时正是这么骗过判据的
     * (跳掉导入落盘,状态照样显示 100万,因为那次投入还躺在待刷队列里)。
     */
    await page.waitForTimeout(5600)
    const onDisk = await storedStone()
    if (spent.value !== null && (onDisk === null || Math.abs(onDisk - spent.value) > spent.value * 0.01)) {
      failures.push(`[390] 存读场景:投入之后磁盘上的灵石是 ${onDisk},页面上是 ${spent.text} —— 改动没落盘,这条判据没搭对`)
    }
  }

  // 导入回来:应当回到导出那一刻(灵石回到 S0)
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    window.__beforeImport = 'alive'
  })
  await page.locator('input[type=file]').first().setInputFiles(savePath)
  await page.waitForTimeout(700)
  const toast = await page.evaluate(() => [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|'))
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

// ---- 第二十六件事:智能收纳不替玩家扔「有投入的件」 ----
/*
 * 智能收纳卖的是「替你分辨值得留的」,而它此前只认品质/流派核心词条/组合技部件 ——
 * 于是三类明明该留的件会被当垃圾:练过的(+N / 重铸 / 封存)、成套共鸣件、词条近满件。
 * 「一键清理行囊」更狠:一按就把它们全化尘,连一次确认都只报个总数,玩家事后才知道少了什么。
 * 判据按玩家真按的两个按钮核:
 *   一 清理确认框写的件数 = 该清的件数(夹具 5 件里只有 2 件是废物);
 *   二 点下去之后,留下的正好是那 3 件有投入的(行囊 5 → 3),且练过那件的「+3」还在。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '收纳自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 0 },
    inventory: {
      items: [
        // 两件该走的:凡品、不带套、没词条 / 或词条拉胯
        { uid: 'j1', templateId: 'b_qingyun', quality: 'mortal', tier: 3, level: 0, affixes: [] },
        { uid: 'j2', templateId: 'b_qingyun', quality: 'mortal', tier: 3, level: 0, affixes: [{ id: 'atk1', roll: 0.12 }] },
        // 三件该留的:练过(有投入)/ 成套共鸣 / 词条条条近满
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
      const m = /藏品\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
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
      .locator('.modal-panel button', { hasText: /依此规则清理行囊/ })
      .first()
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (!armed) failures.push('[390] 收纳场景:找不到「依此规则清理行囊」按钮')
    await page.waitForTimeout(300)
    const warn = await page.evaluate(() => (document.querySelector('.modal-panel')?.innerText || '').replace(/\n+/g, ' '))
    const promisedCount = Number((/共\s*(\d+)\s*件/.exec(warn) || [])[1] ?? NaN)
    if (promisedCount !== 2) {
      failures.push(`[390] 收纳场景:该清的只有 2 件废物,确认框写的是 ${promisedCount} 件 —— 练过/成套/近满的件被算进了清理名单(${warn.slice(0, 90)})`)
    }
    await page.locator('.modal-panel button', { hasText: /清理化尘/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(900)
    const after = await bagCount()
    const body = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\n+/g, ' '))
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|')
    )
    if (after !== 3) failures.push(`[390] 收纳场景:清理后行囊剩 ${after} 件(应为 3 —— 那 3 件有投入的必须留下)`)
    if (!/收纳毕:2 件/.test(toast)) failures.push(`[390] 收纳场景:清理后的交代不对(${toast || '无提示'})`)
    for (const [uid, name] of [['k_set', '玄铁重剑'], ['k_roll', '桃木簪']]) {
      if (!body.includes(name)) failures.push(`[390] 收纳场景:${name}(${uid})被自动清理了`)
    }
    if (!/\+3/.test(body)) failures.push('[390] 收纳场景:练过的那件(+3)被自动清理了')
    if (after === 3 && promisedCount === 2) {
      console.log(`\n智能收纳:行囊 5 件 → 确认框「共 ${promisedCount} 件」→ 清理后 ${after} 件(练过/成套/近满三件都留下)`)
    }
  }
  if (pageErrors.length) failures.push(`[390] 收纳场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十五件事:一键分解要「先勾后点」,勾品质不许当场把东西烧了 ----
/*
 * 勾选框的语义是**标记**,不是**执行** —— 玩家勾「精品」是想说「精品算废料」,
 * 不是想让行囊里的精品立刻消失。此前 toggleRank 在勾上的一瞬间就调了
 * decomposeByRanks,于是「勾一下就没了」,勾错了没得后悔,也看不到会拆掉几件。
 * 判据按玩家的动作顺序核两拍:
 *   一 勾上「精品」之后 —— 行囊件数一件不能少,也不能出现「化作器灵尘」的交代;
 *   二 再点下方「分 解(2 件)」 —— 这才能少,而且要少出个交代来。
 * 顺带核第二笔账:练过的那件拆了要按八成退强化投入。夹具里一件 0 级、一件 +4
 * (记账投入尘 100 / 灵石 8000),故返还 = 底材4 + (底材4 + 八成尘80) = 88 尘 + 灵石 6400,
 * 并且提示里写的数必须与器灵尘那一栏真涨的数对得上(所见即所得)。
 * (勾选仍然会被记住,并继续管着「此后拾取自动回收」;那条是不占行囊的入包裁决,与本题无关。)
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
      const m = /藏品\s*(\d+)/.exec(document.querySelector('main')?.innerText || '')
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
      [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|')
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
      if (!/已分解\s*2\s*件/.test(afterToast)) failures.push(`[390] 分解场景:点「分 解」之后没有交代(${afterToast || '无提示'})`)
      const promised = Number((/得器灵尘×(\d+)/.exec(afterToast) || [])[1] ?? NaN)
      const dustAfter = await dustCount()
      if (promised !== 88) {
        failures.push(`[390] 分解场景:两件精品(其中一件 +4,记账投入尘 100)该退 88 尘,提示写的是 ${promised}`)
      }
      if (!/退灵石\s*6,400/.test(afterToast)) failures.push(`[390] 分解场景:练过的件没退灵石(记了 8000,该退 6400)—— ${afterToast}`)
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

// ---- 第二十四件事:法宝「炼化」的两笔账,一笔都不能少写 ----
/*
 * 炼化既扣悟道点、也扣灵石(见 forge.artifactUpCost),而按钮此前只写「悟道 N」——
 * 玩家按标签算账,回头发现灵石也少了一大截。判据两件:
 *   一 按钮上必须把两种代价都写出来;
 *   二 两种都按所写扣(读数取磁盘精确值,并等开局奖励落定)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
      // 灵石是浮点(stoneByTier 会乘倍率),比较留一点容差
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

// ---- 第二十三件事:洞府营造的账目 —— 卡上写多少料,就扣多少料 ----
/*
 * 洞府是中期最主要的一处灵石去处,卡上写着「建造 · 60石 6铁」。
 * 判据核的是**玄铁**那一半:灵石同一时间会被任务/成就奖励搅动(实测开局那一下
 * 就发了三十多万,差被冲得看不出来),而玄铁除了营造没人动它,差一分就是错。
 * 读数取自背包「材料」页(界面上的数),不去解密分片 —— 写盘是节流的,磁盘会落后。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  checked += 1
  /**
   * 玄铁余额:**磁盘那一份**(精确到个位)。
   *
   * 界面上的分片只有万位三位小数(9万 → 8.998万),一位数的漂移会被四舍五入吃掉 ——
   * 实测把造价 +1 的注入就这样混过去了。故这里等节流落盘后解密比对,不取显示值。
   */
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
  // 先落到页面上:任何 localStorage 读数都要有 document 在(localStorage 才能读)
  await page.goto(INDEX, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  await clearOverlays(page)
  const oreBefore = await readOre()
  await page.goto(INDEX + '#' + '/dongfu', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  // 正则留出空白余量:卡片上的代价换行(数 + 量词 nowrap)会在「·」后断行
  const buildBtn = page.locator('main button', { hasText: /建\s*造\s*·|升\s*级\s*·/ }).first()
  if ((await buildBtn.count()) === 0) {
    failures.push('[390] 营造场景:洞府页没有可动工的建筑(判据没跑到东西)')
  } else {
    const label = ((await buildBtn.textContent()) || '').replace(/\s+/g, ' ').trim()
    const oreCost = Number((/([\d,]+)\s*铁/.exec(label.replace(/,/g, '')) || [])[1] ?? NaN)
    await buildBtn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(800)
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|')
    )
    const oreAfter = await readOre()
    if (!Number.isFinite(oreCost)) failures.push(`[390] 营造场景:读不出卡片上的玄铁价(「${label}」)`)
    else if (oreBefore.value === null || oreAfter.value === null || oreBefore.value - oreAfter.value !== oreCost) {
      failures.push(`[390] 营造场景:卡片写「${label}」,玄铁实际 ${oreBefore.text} → ${oreAfter.text}(所见非所付)`)
    }
    if (!/升至|落成|建造/.test(toast)) failures.push(`[390] 营造场景:动工之后没有任何交代(${toast || '无提示'})`)
    console.log(`\n洞府营造:${label} → 玄铁 ${oreBefore.text} → ${oreAfter.text}(应扣 ${Number.isFinite(oreCost) ? oreCost : '?'})`)
  }
  if (pageErrors.length) failures.push(`[390] 营造场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第二十二件事:减少动效真的减到了(顺带在音效开着的情况下点一路按钮) ----
/*
 * 「减少动效」是个容易摆设的开关:加个类名、忘了写 CSS,界面上谁也看不出来
 * (动效仍然在动,而这条设置一般是给晕动/省电的人用的)。
 * 判据按「还会不会动」来量:animation-name 仍在不算,要看 duration 与 iteration ——
 * 减动效的做法是把时长压到 0.01ms 且只跑一次。
 * 同一场里音效与音乐都开着:每次点击都会走 unlockAudio + playSfx,这条路径
 * 冒烟夹具一律关掉声音,此前没走过。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
  // 音效开着,一路点点按钮(每次点击都会走 unlockAudio + playSfx)
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

// ---- 第二十一件事:闭关的跨页承诺 —— 闭关中不许历练,而且当场就说 ----
/*
 * 「静坐一炷香,修炼速度 +150%;闭关期间无法外出历练」是修行页明写的一条。
 * 这条承诺跨两个页面,此前也没人真走过:去历练页点出发,模式窗照开,三选一之后
 * 才被告知「你正在闭关静修」——话是对的,但让人先白走一步。
 * 判据三件:闭关真的起效(有倒计时)、出发当场被拦且不开模式窗、回修行页闭关还在。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
      toast: [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|'),
      countdown: /闭关中 · /.test(document.querySelector('main')?.innerText || '')
    }))
    if (!started.countdown) failures.push('[390] 闭关场景:点了闭关,修行页没有出现「闭关中」的倒计时')
    if (!/闭关/.test(started.toast)) failures.push(`[390] 闭关场景:闭关没有任何交代(${started.toast || '无提示'})`)
    // 去历练页点出发:应当当场被拦,且不开模式窗
    await page.goto(INDEX + '#' + '/adventure', { waitUntil: 'load' })
    await page.waitForTimeout(900)
    await page.locator('main button', { hasText: /出\s*发/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(600)
    const blocked = await page.evaluate(() => ({
      toast: [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|'),
      modal: !!document.querySelector('.modal-panel'),
      running: /余 \d+分\d+秒/.test(document.querySelector('main')?.innerText || '')
    }))
    if (!/闭关/.test(blocked.toast)) failures.push(`[390] 闭关场景:闭关期间点出发,出面没有说「正在闭关」(${blocked.toast || '无提示'})`)
    if (blocked.modal) failures.push('[390] 闭关场景:闭关期间点出发,还开出了模式窗(该当场拦下,不让玩家白走一步)')
    if (blocked.running) failures.push('[390] 闭关场景:闭关期间居然真的出发了')
    // 回修行页:闭关还在
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

// ---- 第二十件事:背包里的账目 —— 显示多少就扣/给多少 ----
/*
 * 强化与分解是玩家天天用的两个资源动作,而它们各自都有一处**手写数字**:
 *   强化弹窗写着「器灵尘×N · 灵石 M」;
 *   分解完弹一条「分解得器灵尘×K」。
 * 这些数字若与服务实际扣/给的对不上,玩家不会知道该信哪个。
 * 判据就一件事:拿界面上的数对界面自己的变化(器灵尘那一栏)。
 * 灵石不在判据里 —— 同一段时间里任务/成就也会发灵石,拿它做差会被别处的收益搅乱。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
  /**
   * 打开背包里那件(未装备、未锁定)——按 **uid** 找,不按名字找。
   *
   * 从前这里写死了「青云道袍」:内容一改名(这件后来按地界改成「风林道袍」),
   * 点击就静默落空,场景报的是「判据没跑到东西」,而真相只是名字变了。
   * 装备卡带上 data-uid(见 EquipmentCard),这一处从此与命名无关。
   */
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
    // 接着分解同一件:提示里说给多少尘,就该给多少 —— 而且这件要从包里消失
    const dustBeforeSplit = await readDust()
    await page.locator('.modal-panel footer button').filter({ hasText: /^$/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.locator('.modal-panel button', { hasText: /分解\?/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|')
    )
    const promised = Number((/分解得器灵尘×(\d+)/.exec(toast) || [])[1] ?? NaN)
    const dustAfterSplit = await readDust()
    const stillInBag = await page.evaluate(uid => !!document.querySelector(`main button[data-uid="${uid}"]`), BAG_UID)
    if (Number.isFinite(promised)) {
      if (dustBeforeSplit === null || dustAfterSplit === null || dustAfterSplit - dustBeforeSplit !== promised) {
        failures.push(`[390] 锻造场景:分解说给 ${promised} 尘,实际 ${dustBeforeSplit} → ${dustAfterSplit}`)
      }
      if (stillInBag) failures.push('[390] 锻造场景:分解之后那件还留在背包里')
      console.log(`\n背包账目:强化扣尘 ${costLine}(对上) · 分解得尘 ${promised}(对上,且件已出包)`)
    } else {
      failures.push(`[390] 锻造场景:分解没有给出「分解得器灵尘×N」的交代(${toast || '无提示'})`)
    }
  }
  if (pageErrors.length) failures.push(`[390] 锻造场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十九件事:真打一场历练战斗,看战报回放与战斗分析 ----
/*
 * 战报是这游戏里**看得最多**的一屏:出发 → 模式 → 等一场 → 逐行回放 → 结语,
 * 而这条链只在单元用例里跑过引擎、从没在真浏览器里走完过。
 * 判据只要四件事:探索真的开起来了、战报回放出了行、结语写清回合与胜负、
 * 战斗分析点得开且给得出数据面板(总输出/总承伤那一组)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
  const gn = (m, e) => ({ m, e })
  const slices = {
    game: { started: true, saveVersion: 2, createdAt: Date.now(), lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
    player: { name: '战斗自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
    resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
    // 一件高 Tier 的武器:让首战打得赢、回放短,判据才不至于看运气
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
  // 「出发」先开模式窗:此行欲作何打算
  await page.locator('.modal-panel button', { hasText: /寻常游历/ }).first().click({ timeout: 3000 }).catch(() => {})
  /*
   * 把这一页拉到前台:后台页面的定时器会被浏览器节流(setInterval 从 1 秒拖到 1 分钟),
   * 而引擎的心跳正是 1 秒一拍 —— 实测不拉前台时,45 秒里一场都没打(「胜 0 场」)。
   */
  await page.bringToFront()
  // 首战间隔 12 秒 ÷ 历练速度,故最多等 30 秒
  let summary = ''
  let logLines = 0
  let lastTail = ''
  // 停下来的条件要带上「战报有行」:回放是逐行画出来的,结语先出现、行随后才铺满 ——
  // 只看结语就收工,会偶发地在那一瞬数出 0 行(实测撞到过一次),把好代码判成坏代码
  for (let i = 0; i < 60 && !(summary && logLines > 0); i += 1) {
    await page.waitForTimeout(1000)
    /*
     * 历练的第一步未必是战斗:引擎每个战斗槽位都会先掷一次「际遇」,中了就弹事件窗,
     * 而事件窗挡着战斗(超时才会自动按默认选项处理)—— 实测这就是「等了 45 秒 0 场」的原因。
     * 故这里遇到事件窗就当场选第一个选项把它了结,让历练继续往下走。
     */
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
        /*
         * 战报行直接数回放框里的 <p>,不再拿关键词去猜文本。
         * 原来数的是 击中|施展|避开|打断|气血逆涌 五个词 —— 而暴击那行写的是
         * 「会心一击!…受创甚重」,五个词一个不沾;一击暴击定胜负的战斗(实测碰到过,
         * 战后气血 100%)于是被误判成「回放没出内容」,红得毫无道理。
         */
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
  // 兜底再等一拍:真的没有战报行时,这里仍然是 0,断言照旧会红
  if (summary && logLines === 0) {
    await page.waitForTimeout(1500)
    logLines = await page.evaluate(() => document.querySelectorAll('[data-battle-log]').length)
  }
  // 首战间隔 12 秒 ÷ 历练速度;45 秒还没等到,就把当前页面写进报告(「搜寻猎物中」还是「胜 N 场」一看便知)
  if (!summary) failures.push(`[390] 战斗场景:等了 60 秒也没等到一场的结语(战报回放没走完?) 当前页面:${lastTail}`)
  else {
    if (logLines === 0) failures.push('[390] 战斗场景:有结语却没有战报行(回放没出内容)')
    if (!/胜|负/.test(summary)) failures.push(`[390] 战斗场景:结语没写清胜负 —— ${summary}`)
    // 战斗分析:点开要看得到数据面板
    const analysisBtn = page.locator('main button', { hasText: /战斗分析/ }).first()
    if ((await analysisBtn.count()) === 0) failures.push('[390] 战斗场景:找不到「战斗分析」入口')
    else {
      await analysisBtn.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(400)
      const analysisText = await page.evaluate(() => document.querySelector('main')?.innerText || '')
      if (!/总输出|总承伤/.test(analysisText)) failures.push('[390] 战斗场景:点开战斗分析也没看到数据面板(总输出/总承伤)')
      else console.log(`\n战斗回放:${summary} · 战报 ${logLines} 行 · 分析面板可开`)
    }
  }
  if (/NaN|undefined|Infinity/.test(await page.evaluate(() => document.querySelector('main')?.innerText || ''))) {
    failures.push('[390] 战斗场景:战报里漏出占位符')
  }
  if (pageErrors.length) failures.push(`[390] 战斗场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第三十六件事:敌人卡的最挤一档(长名字 + 满标签) ----
/*
 * 敌人名字最长 9 字(残魂·堕落冰魄仙子),标签最多 5 枚(首领 / 宿敌 + 3 个路数特性),
 * 再叠上适配星级。从前这些全挤在一行 nowrap 的 flex 里,320 宽下名字被折成两行、
 * 标签压在一起 —— 而巡页用的档里敌人名字都短、认知层也是 0(特性根本不显示),
 * 这一档从来没有被量过:夹具缺什么,判据就瞎什么。
 *
 * 夹具直接摆出这一档:认知层 2(知其路数 → 特性显示)、宿敌记录(→ 宿敌标签)、
 * 首领身份(→ 首领标签)、真仙境的敌人(→ 名字最长的那个)。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
        loot: ['功法残页×2', '玄冰剑']
      },
      eventMemories: {}
    },
    settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'dark' }
  }
  await ctx.addInitScript(
    data => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
    },
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#/adventure', { waitUntil: 'load' })
  /**
   * 等敌人卡出现,而不是固定等 2200ms 再读一次。
   *
   * 装备表涨到 288 件之后,冷启动到首帧的时间开始浮动 —— 单次定时读会偶发读空,
   * 于是这条判据报的是「夹具没读出来」,而真相只是「还没画到」。判据本身不变:
   * 卡必须出现,名字必须单行,标签必须够四枚。只是把「读一次」改成「等到出现为止」。
   */
  await page
    .waitForSelector('[data-foe-name]', { timeout: 8000 })
    .catch(() => undefined)
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

// ---- 第十八件事:切后台/离开页面时,待刷的存档要立刻落盘 ----
/*
 * 写盘是节流的(省电,见 savePersistence.spec),于是「刚做的改动」可能还躺在队列里;
 * 手机上的保命时机就是切后台/离开页面 —— `visibilitychange → hidden` 与 `pagehide`。
 * 单元用例测过 flushSaveWrites 本身,却没人测过这两个监听究竟接上没有:
 * 接不上,玩家切出去接个电话、回来时这一段时间就没了,而且是无声无息地没。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
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
    await page.getByRole('button', { name: /灵脉投资/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
    await page.locator('.modal-panel button.btn-ghost:not([disabled])').first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    return readFormatted(page, '灵石')
  }
  checked += 1
  /**
   * 投入之前先**强制刷一次盘**,把节流周期归零。
   *
   * 存档是节流的(SAVE_FLUSH_MS = 5 秒),定时器由「上次刷盘后的第一笔写入」启动 ——
   * 而引擎每秒都在写(修为、灵气、产出),所以任何时刻都有一个定时器在跑、剩余 0~5 秒不等。
   * 此前这里是「等满 5.8 秒再投入」,以为等出一个安静窗口;但引擎从不安静,
   * 投入落在周期里的哪一点全凭运气:落在末尾 1.2 秒内,磁盘就「立刻变了」,
   * 判据误报「节流没起作用」(CI 实测约四分之一的运行撞上,两边仓库都红过)。
   *
   * 派发 pagehide 即触发 flushSaveWrites:待写清空、定时器清掉。下一次写入(最迟 1 秒后
   * 的引擎 tick)才重新起一个整 5 秒的定时器,而下面「投入 → 读磁盘」全程不到 2.5 秒,
   * 稳落在窗口之内 —— 这条判据从此由节流说了算,不再由时机说了算。
   * (仓库里只有 storage.ts 监听 pagehide,派发它没有别的副作用。)
   */
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(200)
  const start = await readFormatted(page, '灵石')
  const afterInvest = await investOnce()
  const onDiskBefore = await diskStone()
  // 先确认节流确实在起作用:此刻磁盘还该是旧值,否则后面那一步证明不了什么
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

// ---- 第十七件事:导出失败必须说出来(打断浏览器的下载能力再点一次) ----
/*
 * 「导出存档」是玩家丢档前唯一的保险。而 Web 这条路靠 `saveAs`(Blob + a[download])——
 * 受限 WebView、部分应用内浏览器里 `URL.createObjectURL` 直接不可用,于是它抛错。
 * 调用方是 `void exportSaveToDevice()`,既不看返回值也不接异常,结果就是:
 * 点下去既没文件、也没提示。故这里把下载能力打断,要求界面**说得出这句话**。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX + '#' + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await clearOverlays(page)
  checked += 1
  // 把下载这条路打断 —— 受限 WebView / 应用内浏览器正是这样
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error('createObjectURL is not available')
    }
  })
  await page.getByRole('button', { name: /导出存档/ }).first().click()
  await page.waitForTimeout(1500)
  const said = await page.evaluate(() =>
    [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|')
  )
  if (!/导出|下载/.test(said)) failures.push(`[390] 导出失败场景:下载能力不可用时点了「导出存档」,界面一声不响(${said || '无提示'})`)
  else console.log(`\n导出失败也说话:「${said.split('|')[0]}」`)
  if (pageErrors.length) failures.push(`[390] 导出失败场景页面异常:${[...new Set(pageErrors)].join(' | ')}`)
  await ctx.close()
}

// ---- 第十六件事:坏档也能进游戏,而且要说得清哪一片坏了 ----
/*
 * 分片损坏是最容易变成「白屏」或「我的东西怎么没了」的一种事故:
 * 启动前的 preflightScan 会把读不出来的分片挪到备份键、其余照常开局。
 * 这条判据查三件事:① 照样进得去(不白屏);② 启动时说了话;
 * ③ 设置页常驻一条说得出「哪一片坏了、原档还在哪」——坏档只弹一条两秒的提示是不够的,
 *    玩家多半是先发现「灵石怎么归零了」,再回来找原因。
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
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
    Object.fromEntries(Object.entries(slices).map(([k, v]) => [`yunyin.${k}`, enc(v)]))
  )
  const page = await ctx.newPage()
  const pageErrors = []
  watchPageErrors(page, pageErrors)
  await page.goto(INDEX, { waitUntil: 'load' })
  checked += 1
  /**
   * 启动提示只活两秒多,而冷启动到首帧的耗时是浮动的 —— 固定读一次会偶发读空
   * (实测同一份产物两次跑,一次读到、一次读到空串)。故轮询到它出现为止:
   * 判据不变(提示文本必须含「损坏/异常/隔离」),只是不再拿运气当判据。
   *
   * 但「等到它出现」和「再读一次」之间还有一次往返:CI 机器慢的时候这一步就超过两秒,
   * 再读时提示已经收走、位子上换成了别的提示(实测读到「成就达成「万古长生」」而误判)。
   * 所以匹配那一刻**顺手把提示文本带回来**,断言用带回来的那份,不再第二次去读。
   */
  const bootToasts = await page
    .waitForFunction(
      () => {
        const t = [...document.querySelectorAll('.pointer-events-none.fixed button')].map(b => (b.textContent || '').trim()).join('|')
        return /损坏|异常|隔离/.test(t) ? t : false
      },
      { timeout: 8000 }
    )
    .then(h => h.jsonValue())
    .catch(() => '')
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

// ---- 第三十一件事:iOS 的存档风险提示,该说的说、不该说的一个字不说 ----
/*
 * 由来:WebKit 会把**七天没被打开过**的站点的脚本可写存储整个清掉 —— localStorage 里
 * 那份存档与 Service Worker 缓存一起没。而这是个放置游戏,「隔几天回来」正是常态。
 * 唯一真管用的办法是让游戏成为已安装的 Web App(添加到主屏幕),故 iOS 未安装时提示一次。
 *
 * 判据两头都要钉,因为**说错话的代价**比不说更大:
 *   一 iOS 未安装:主页要出现,且「知道了」之后重载不再出现(写盘真落了),设置页常驻一份可回查
 *   二 iOS 已装到主屏幕:不再劝(它已经不吃那条规则了)
 *   三 桌面/安卓:一个字都不许说 —— 它们用应用自己的存储,在那儿喊「iOS 会清存档」是胡说
 */
{
  const UA_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const UA_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  const SAVE_SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'
  const enc = o => CryptoJS.AES.encrypt(JSON.stringify(o), SAVE_SECRET).toString()
  const gn = (m, e) => ({ m, e })
  const save = Object.fromEntries(
    Object.entries({
      game: { started: true, saveVersion: 2, createdAt: Date.now() - 40 * 86400000, lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null },
      player: { name: 'iOS 自检', major: 5, sub: 3, exp: gn(1, 2), age: 40, lifespanBonusYears: 0, dead: false, reincarnation: { count: 0, daoFruit: 0, talents: [], insight: 0, lives: [], vow: null, trial: null, bonds: [] }, linggen: { roots: [{ element: 'wood', aptitude: 70 }], gradeName: '单灵根', growthMult: 1.1 } },
      resources: { spiritStone: gn(1, 6), qi: 1000, wudao: 10, herb: 5, ore: 5, page: 2, dust: 2 },
      inventory: { items: [], equipped: {}, pills: {}, artifacts: [], equippedArtifacts: [] },
      endgame: { daoPath: null, daoSource: 0, souls: [], equippedSouls: [] },
      settings: { privacyAccepted: true, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'light' }
    }).map(([k, v]) => [`yunyin.${k}`, enc(v)])
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
  /** 提示卡的标题就是它唯一的文案锚点 */
  const cardCount = page => page.locator('text=把游戏「添加到主屏幕」').count()

  {
    const { ctx, page } = await openWith(UA_IOS)
    await page.goto(INDEX, { waitUntil: 'load' })
    await page.waitForTimeout(1500)

    /*
     * 同一条已开局的页面,顺手把「楷体由谁画」也量了(再开一套存档不值当)。
     * 查的是运行时那一半:产物里的次序对,不代表字体真加载成功 —— 文件坏了、因 base
     * 变形而 404,都会安静地回退到系统字体,界面看着只是「有点不一样」,没人报错。
     */
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
    // 只认前缀:字形分支可能换(原版 / GB / 屏幕阅读版),但「用的是我们内置那一支」不许变
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

await browser.close()

// ---- 第二十七件事:外壳高度认 dvh,不认 vh ----
/*
 * 上面「两栏钉死」那条量的是**机制**,可无头浏览器的 100vh 恰好等于可视高度 ——
 * 把外壳换回 vh,它照样全绿。差别只在手机浏览器里出现:地址栏挂着时 vh 是大视口,
 * 底栏被压在工具栏底下。所以这条退一步查**构建产物**:外壳高度得写成 dvh。
 */
{
  checked += 1
  const dir = join(ROOT, 'dist/assets')
  const css = readdirSync(dir)
    .filter(f => f.endsWith('.css'))
    .map(f => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
  // 认这个高度的选择器要凑齐四层 —— 少一层,那点差值就成了文档层的可滚余量
  // (压缩器会把连着的选择器并进一条规则,所以这里是按选择器查,不是按声明数数)
  const covered = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => body.includes('height:var(--app-shell-height)'))
    .flatMap(([, sel]) => sel.split(',').map(s => s.trim()))
  const missing = ['html', 'body', '#app', '.app-shell'].filter(s => !covered.includes(s))
  if (missing.length) failures.push(`外壳高度没铺满四层,缺 ${missing.join(' / ')}(少一层就攒出可滚余量)`)
  if (!css.includes('100dvh')) {
    failures.push('外壳高度没走 dvh(手机浏览器地址栏挂在外面时,底栏会被压住)')
  }
  /*
   * 楷体栈:内置那份必须**排第一**。
   *
   * 这条只能查产物,查运行时没有意义:无头容器里没有系统楷体,排在第四位也一样会被
   * 选中 —— 绿得毫无信息。而真机上的差别恰恰全在次序里(iOS 会命中华文楷体、Windows
   * 会命中楷体,三端于是三种字形)。谁要是「顺手优化」把次序换回系统优先,只有这条拦得住。
   */
  const kaiRule = /--font-kai:([^;}]*)/.exec(css)
  if (!kaiRule) {
    failures.push('构建产物里找不到 --font-kai(字体栈的唯一事实源在 src/style.css)')
  } else if (!/^\s*"?LXGW WenKai"?/.test(kaiRule[1])) {
    failures.push(`楷体栈第一位不是内置字体(现在是${kaiRule[1].slice(0, 40)}…)—— 三端会各用各的系统楷体`)
  } else if (!/Kaiti SC|KaiTi/.test(kaiRule[1])) {
    failures.push('楷体栈里没了系统楷体兜底 —— 子集外的生僻字会直接掉到衬线')
  }
}

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
