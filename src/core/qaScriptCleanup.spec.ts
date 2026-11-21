/**
 * QA 实测脚本的收尾纪律(这些脚本不在 CI 里跑,只能从源码钉形状)。
 *
 * 第 13 轮修了 edge-states 与 modal-patrol 的同一类缺陷:汇总打印在
 * `browser.close()` **之后**,于是任何一处 evaluate 超时都会让异常冒到顶层,
 * `failures` 里已经攒下的读数一条也出不来 —— 跑了十几分钟的巡查,
 * 最后屏幕上只有一行堆栈,分不清「只有这一处出问题」还是「前面全坏了」。
 *
 * 本轮把剩下的四个同构脚本一并收口。这条判据管的是「别再退回去」:
 * 每一份都必须是 try/catch/finally 收尾,且异常要进 failures。
 *
 * 故障注入:把任一脚本的 try/catch 去掉(只留 finally),对应那条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCRIPTS = [
  'orb-check',
  'world-check',
  'treasure-check',
  'edge-states',
  'modal-patrol',
  'detail-geometry',
  'offline-check',
  'ui-smoke',
  'layout-check',
  'focus-check',
  'multitab-check'
] as const
const src = (name: string): string => readFileSync(resolve(__dirname, '../../scripts', `${name}.mjs`), 'utf-8')

/** 剥掉整行注释 —— 注释里写着「原先没有 try」这类说明,不剥会让判据假绿 */
const code = (name: string): string =>
  src(name)
    .split('\n')
    .filter(line => !/^\s*(\*|\/\/)/.test(line))
    .join('\n')

describe('QA 脚本 · 崩溃时也要把已收集的失败报出来', () => {
  for (const name of SCRIPTS) {
    it(`${name}:主体包在 try 里,异常进 failures,浏览器在 finally 关`, () => {
      const s = code(name)
      expect(s, `${name} 没有 try —— 中途抛错会让已收集的失败全部丢失`).toContain('try {')
      /*
       * 收集容器有两种:多数脚本用 `failures`(字符串数组),
       * ui-smoke 用 `errors`(带 where 的对象数组)。两者都是「与其余失败并列报出」。
       */
      /*
       * 只认**顶层**那个 catch(行首无缩进)。
       *
       * 原先写 `/catch \(err\)[\s\S]{0,400}(failures|errors)\.push\(/` —— 脚本内部
       * 另有若干 `  } catch (err) {`,把它们任何一个的体也算进来,删掉顶层那个 catch 时
       * 这条判据照样绿(故障注入实测:去掉 layout-check 的顶层 catch,13 条全过)。
       * 顶层的写法是 `} catch (err) {` 起于行首,与内部的缩进两格不同。
       */
      expect(s, `${name} 的顶层 catch 没把异常记成一条失败`).toMatch(
        /^\} catch \(err\) \{[\s\S]{0,400}?(?:failures|errors)\.push\(/m
      )
      expect(
        s,
        `${name} 的 browser.close() 不在 finally 里 —— 崩了就不关浏览器`
      ).toMatch(/finally \{[\s\S]{0,160}browser\??\.close\(/)
      /*
       * 光有 try 不够 —— 要它**真的罩住主体**。
       *
       * 评审指出:留一个空的顶层 try/catch/finally、把主体挪到它外面,
       * 前面几条断言照样全过,而主体抛出的异常绕过失败收集与清理。
       * 实测我自己就踩了:try 一度下移到「第四件事」,前三件事
       * (含 VIEWPORTS 那一大段逐页巡览)在保护之外 —— 外观上有 try,实际没罩住。
       *
       * 这条只能**真的跑一次注入**才判得准。静态数位置数不出来:各脚本的判据多半写在
       * 辅助函数里(judge / auditModal / SCENES 里的闭包),定义在 try 之外、
       * 执行在 try 之内 —— 数定义位置会把完全正确的脚本判成「try 只罩了收尾」
       * (实测 edge-states 2、detail-geometry 0)。
       *
       * 做法:在主体开头插一句必抛的语句(定位取顶层 try 之后的第一条执行语句),
       * 起进程跑,断言 ①退出码非零 ②输出里有失败清单而不是只有堆栈。
       * 注入只写临时文件、跑完删掉,不碰仓库里的源码。
       */
      /*
       * 「主体是否真的在 try 里」由 `qaCrashReporting.spec` 用**真进程注入**验证,
       * 这里不做静态位置断言 —— 试过三种写法,都数不准:
       *
       *   · 数 try 内的 `failures.push` 处数:判据多半写在辅助函数里
       *     (judge / auditModal / SCENES 闭包),**定义在 try 外、执行在 try 内**,
       *     实测 edge-states 数出 2、detail-geometry 数出 0,而这两份收尾都是对的
       *   · 找「try 之前的顶层 await」:各脚本的 `async function open()` 定义里
       *     就有 `await browser.newContext`,那是定义不是执行,恒被误判
       *   · 找「try 之前的 await open(...) / page.goto」:同上,辅助函数体内就有
       *
       * 静态只能判断「形态在不在」,判断不了「执行时罩没罩住」。后者交给
       * qaCrashReporting.spec:它把各脚本自己的收尾片段抽出来、喂一次必抛,看有没有报。
       */
      const tryAt = s.search(/^try \{$/m)
      expect(tryAt, `${name} 没有行首无缩进的顶层 try`).toBeGreaterThan(-1)
      /*
       * 这里能判、且判得准的那一条:**try 之后紧跟的第一条语句必须是干活的**。
       *
       * 虚设 try 的形态是「空 try/catch/finally 在前,主体在后」—— 那样 try 后面
       * 紧跟的会是一句 `const x = ...` 之类的声明、或者直接就是 `await browser.close()`。
       * 八份脚本实测下来,try 后紧跟的第一条无注释语句全部是主体首句
       * (裸块 `{`、`for (const … of …)`、`await page.goto`、`await runXxx`、`await newPage`)。
       *
       * 判据:不许是声明,也不许是 close。
       */
      const firstStmt =
        s
          .slice(tryAt + 'try {'.length)
          .split('\n')
          .map(l => l.trim())
          .find(l => l.length > 0 && !/^(?:\/\/|\*|\/\*)/.test(l)) ?? ''
      expect(firstStmt, `${name} 的 try 之后没有语句`).not.toBe('')
      expect(firstStmt, `${name} 的 try 只罩了收尾(第一句是 close)`).not.toMatch(/^await browser\.close/)
      expect(
        firstStmt,
        `${name} 的 try 之后紧跟的是一句声明(${firstStmt.slice(0, 40)})—— 主体可能在保护之外`
      ).not.toMatch(/^(?:const|let|var)\s+(?!.*await )/)
      // 关闭之后再冒泡的写法是这次修的那一类:close 不许出现在 try 块之外的裸语句位置
      expect(s, `${name} 还留着裸的 \`await browser.close()\` —— 那条路径只有正常收尾才走到`).not.toMatch(
        /^\s*await browser\.close\(\)\s*$/
      )
    })
  }
})

/**
 * 带静态服务器的脚本(offline-check):两道收尾一个都不能漏。
 *
 * 它比其余几份多一样要关的 —— 一个监听在本机随机端口的服务器。
 * 原先 `browser.close()` 与 `server.close()` 都是裸语句:崩了浏览器不关,
 * 服务器也留着,而 `pass` 里已验过的条目跟着一起吞掉。
 *
 * 故障注入:把 `server.close` 从 finally 里挪回裸语句,本条红。
 */
describe('QA 脚本 · 服务器与浏览器都要在 finally 里关', () => {
  const SRC = readFileSync(resolve(__dirname, '../../scripts/offline-check.mjs'), 'utf-8')
  const CODE = SRC.split('\n').filter(line => !/^\s*(\*|\/\/)/.test(line)).join('\n')

  it('browser.close 与 server.close 都在 finally 块里', () => {
    const at = CODE.indexOf('} finally {')
    expect(at, '找不到 finally 块').toBeGreaterThan(-1)
    const block = CODE.slice(at, at + 400)
    expect(block, '浏览器没在 finally 里关').toContain('browser.close()')
    expect(block, '服务器没在 finally 里关 —— 崩一次就留一个监听端口').toContain('server.close')
  })

  it('没有裸在块外的 server.close', () => {
    expect(CODE, '还留着裸的 server.close()').not.toMatch(/^\s*server\.close\(\)\s*$/m)
  })
})

/**
 * 夹具自检是「基准的基准」,不许用固定睡眠去量它。
 *
 * 原先两页各固定等 1200ms。实测 `--late` 连跑两次:一次报「雾隐长枪没出现」、
 * 一次全过 —— 而单独打开行囊页时三样都在,1200ms 就够。差别只在于这条脚本此前
 * 已经跑过建号/夹具流程,页面忙闲不同。
 *
 * 固定睡眠量的是「加载中的一瞬」:它会报一个并不存在的夹具缺陷,
 * 而真正的夹具坏了时又可能被同样的运气掩盖 —— 两头都错。
 *
 * 故障注入:把 waitForAny 换回 waitForTimeout(1200),这条红。
 */
describe('ui-smoke · 夹具自检等目标文本,不固定睡眠', () => {
  const SRC = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8')

  it('两页都用轮询等目标文本', () => {
    expect(SRC, '找不到 waitForAny —— 又回到固定睡眠了').toContain('const waitForAny')
    /*
     * 评审指出:只查「声明还在 + 某种固定等待不在」不够 ——
     * 把 waitForAny 留着不用、换回别时长的固定等待,这条照样绿。
     * 改为要求**两处都真的调用了 waitForAny**,且各自等到的是自己那几项。
     */
    const homeCall = /waitForAny\(\['9\.038兆'[^\]]*\]\)/.exec(SRC)
    const invCall = /waitForAny\(\['雾隐长枪'[^\]]*\]\)/.exec(SRC)
    expect(homeCall, '首页那次没走 waitForAny(又换成固定等待了?)').not.toBeNull()
    expect(invCall, '行囊页那次没走 waitForAny(又换成固定等待了?)').not.toBeNull()
    // 两次 goto 之后到下一次 goto 之间,不许出现 page.waitForTimeout
    for (const [label, at] of [['首页', SRC.indexOf(homeCall![0])], ['行囊页', SRC.indexOf(invCall![0])]] as const) {
      const before = SRC.lastIndexOf('await page.goto(', at)
      const span = SRC.slice(before, at)
      expect(span, `${label}那一页在等 waitForAny 之前还留了固定睡眠`).not.toMatch(/page\.waitForTimeout\(/)
    }
  })

  it('等不到时照实报,不静默跳过', () => {
    // waitForAny 的 catch 只吞等超时,逐项判据仍会点出缺了哪几样
    expect(SRC, '缺项仍该逐条报出来').toContain('没有出现在界面上')
  })
})

/**
 * 只有 try/finally、没有 catch 的脚本 —— 崩溃时读数照样丢。
 *
 * 这一形态在 `focus-check` 与 `multitab-check` 上实测过:finally 会照关浏览器,
 * 但 `failures` 里已攒下的那些一条也打印不出来 —— 注入一条失败再抛错,
 * 输出里只剩堆栈。它比「没有 try」更隐蔽:外观上有保护、资源也回收了,
 * 唯独**结论丢了**。
 *
 * 判据只针对本仓这十份巡查脚本,不扫全目录:别的一次性脚本(打包、图标生成)
 * 没有「先攒失败再汇总」的结构,catch 无意义。
 *
 * 故障注入:把 focus-check 的 catch 去掉,本条红。
 */
describe('QA 巡查脚本 · 不许只有 try/finally', () => {
  for (const name of SCRIPTS) {
    it(`${name}:try 之后必须同时有 catch 与 finally`, () => {
      const s = code(name)
      const hasTry = /^try \{$/m.test(s)
      if (!hasTry) return
      expect(s, `${name} 有 try 却没有 catch —— 崩了读数照样丢`).toMatch(/^\} catch \(err\) \{/m)
      expect(s, `${name} 有 try 却没有 finally —— 崩了不关浏览器`).toMatch(/^\} finally \{/m)
    })
  }
})
