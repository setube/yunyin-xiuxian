/** dead → 冒烟判失败(exitCode 1) */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifySmoke, isSelectedTabState, namePattern, SMOKE_ALLOWLIST } from '../../scripts/smoke-classify'

describe('冒烟死按钮分类器(纯决策)', () => {
  it('幂等选中项(白名单)归读数 —— 点当前已选中值,不判失败', () => {
    // 战报速度 ×1(已选中)
    const d = classifySmoke('/settings', 'page', '×1', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '应点明白是幂等选中项').toContain('幂等选中项')
    // 主题跟随系统(已选中)
    const t = classifySmoke('/settings', 'page', '跟随系统', null)
    expect(t.bucket).toBe('silent')
  })

  it('干净重试有变化(功能正常)归读数,抑制全流程误报', () => {
    const d = classifySmoke('/adventure', 'page', '出发', true)
    expect(d.bucket).toBe('silent')
    expect(d.line, '报成功能正常以别于死按钮').toContain('功能正常')
  })

  it('干净重试仍无变化 = 真死控件,判失败', () => {
    const d = classifySmoke('/adventure', 'page', '出发', false)
    expect(d.bucket).toBe('dead')
  })

  it('干净态无法单独复现(如弹窗按钮在干净态未开)归读数,不误伤', () => {
    const d = classifySmoke('/alchemy', 'modal', '结清', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '报成无法复现').toContain('无法单独复现')
  })

  it('空行格式:page 与 modal 的动词区分,dead 行即原样条目', () => {
    expect(classifySmoke('/a', 'page', 'X', false).line).toBe('/a 点「X」')
    expect(classifySmoke('/a', 'modal', 'X', false).line).toBe('/a 弹窗内点「X」')
  })

  it('白名单保持三条幂等选中项 —— 未来去重不得静默把工作控件翻成死按钮', () => {
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「×1」')
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「跟随系统」')
    expect(SMOKE_ALLOWLIST).toContain('/inventory 弹窗内点「不设」')
  })

  it('namePattern 定位同一按钮:在捕获到的空白处容忍空白多寡,别处不松口', () => {
    expect(namePattern('战 力▸拆解').test('战 力▸拆解')).toBe(true)
    expect(namePattern('战 力▸拆解').test('战  力▸拆解')).toBe(true)
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('别处')).toBe(false)
    expect(namePattern('战 力▸拆解').test('战 力 ▸ 拆解')).toBe(false)
  })

  /*
   * 带动态数值的按钮名。
   *
   * 「深入探寻小险 … 一胜约 219 石」里的数值是当次生成的,下一轮再点必然换数。
   * 按字面精确匹配的话 cleanRetry 永远找不到它,一律判成「干净态无法单独复现」
   * —— 那条读数是假的,该按钮其实从未被单独验证过。
   */
  it('namePattern 容忍按钮名里的动态数字,但文字骨架仍须逐字相同', () => {
    const a = '深入探寻小险 行程 1小时0分 · 收益 ×1.4 · 一胜约 219 石 · 36 修为'
    const b = '深入探寻小险 行程 1小时0分 · 收益 ×1.4 · 一胜约 7.065万 石 · 36 修为'
    expect(namePattern(a).test(b), '数值换了也该认得出是同一枚按钮').toBe(true)
    expect(namePattern(a).test(a)).toBe(true)
    // 文字变了不认
    expect(namePattern(a).test(b.replace('深入', '浅出'))).toBe(false)
    expect(namePattern(a).test(b.replace('小险', '大险'))).toBe(false)
    // 不带数字的名字不受影响
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('出发了')).toBe(false)
  })
})

/**
 * 冒烟取按钮的口径 —— 两处都曾经让整页空跑。
 *
 *  一 **只取 getByRole('button') 会漏掉标签组**。`InkTabs` 渲染的是 `role="tab"`,
 *    那是 WAI-ARIA 的正确写法(整组只留一个 tabindex=0,靠左右键走)——
 *    /codex 与 /collection 两页的按钮全是 tab,于是它们在此脚本里一次都没被点过。
 *  二 **先切再筛会把名额让给提示条的「×」**。`slice(0, DEPTH)` 之后在循环里 continue,
 *    那几个关闭钮占掉了 12 个名额,真正的入口卡被挤到切片之外。
 *
 * 两处都不报错:全局点击数仍然够,只是那几页空跑。
 */
describe('冒烟取按钮 · 两处口径', () => {
  const RAW = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8')
  /**
   * 剥掉整行注释再判。
   *
   * 解释「先前写成 buttons.slice(0, DEPTH)」的那段注释本身含有那个片段,
   * 直接扫原文会把注释当成回退的证据(实测就是这么红了一次)。
   * 只剥整行注释,不动行内 —— 脚本里有 `file://` 与正则,行内截断会误伤。
   */
  const SRC = RAW.replace(/^\s*(\*|\/\/).*$/gm, '')

  it('button 与 role=tab 都取', () => {
    expect(SRC, '没取 role=tab —— /codex 与 /collection 会整页空跑').toContain("getByRole('tab')")
    expect(SRC, '没取 button').toContain("getByRole('button')")
  })

  it('先筛再切片,不是先切再筛', () => {
    // 筛选循环必须在 slice 之前完成;写成 buttons.slice(0, DEPTH) 再筛就是回退
    expect(SRC, '又回到「先切再筛」—— 提示条的关闭钮会占掉名额').not.toMatch(/buttons\.slice\(0,\s*DEPTH\)/)
    expect(SRC, '该在筛完后再按 DEPTH 截断').toContain('buttons.length >= DEPTH')
  })

  it('提示条的关闭钮不算页面交互', () => {
    expect(SRC, '该排除「×」这类关闭钮').toMatch(/label === '×'/)
  })

  it('逐页读数只打印、不设下限', () => {
    // 页面状态会被前序点击改变(实测 /souls 跑到时已锁成「需真仙境」),
    // 设下限必误报 —— 故只保留读数
    expect(SRC, '逐页读数该保留').toContain('clickedPerRoute')
    expect(SRC, '逐页下限会误报,不该有').not.toContain('idlePages')
  })
})

/**
 * 视口外的钮不点,点不中不计数。
 *
 * 两处都是「点击」这一步本身的问题,不修就会以「死按钮」的形态误报:
 *
 *  一 **`isVisible()` 只问 CSS 可见性,不管在不在视口里**。
 *     /adventure 的「出发」在 y=833(视口高 812)——筛得到、点不着;
 *     Playwright 会先滚动过去,滚动又把别的元素移位,800ms 内点不中即超时。
 *  二 **点击超时也照样 `clicked += 1`**。于是 ① 读数虚高;
 *     ② 指纹没变就被判成「死按钮」,而它其实一下都没点到。
 *
 * 判据不能只查「源码里有没有那句话」——那证明不了**位置**对不对。
 * 所以这里逐处核结构:
 *   · 每个点击点都必须先接住结果,再决定计数与分类;
 *   · `classifySilent` 必须在该分支之后(否则点了没反应仍会被分类);
 *   · `inView` 必须两个方向都判、且认容器裁切。
 */
describe('冒烟点击 · 视口、计数与三处点击点', () => {
  const RAW = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8')
  const SRC = RAW.replace(/^\s*(\*|\/\/).*$/gm, '')

  /** 每个点击点:接住结果的变量名 */
  const CLICK_GUARDS = ['clickedOk', 'modalClickOk', 'ok']

  it('三处按钮点击都接住了结果(主循环 / 弹窗内 / 干净重试)', () => {
    /*
     * 只扫 `b` / `target` 这两个按钮变量。
     *
     * 导航链接那处 `link.click({ force: true }).catch(...)` 是**有意的例外**:
     * 它不看点击返回什么,而是看「hash 有没有真的落到目标」——
     * 落不到会进 silent 读数并留给别的路由重试,不存在「超时被当成有反应」的问题。
     */
    const swallowed = [...SRC.matchAll(/\b(?:b|target)\.click\(\{[^}]*\}\)\s*\.catch\(\(\) => \{\}\)/g)]
    expect(swallowed.length, '还有按钮点击把失败吞掉了 —— 超时会被当成「有反应」').toBe(0)
    for (const g of CLICK_GUARDS) {
      expect(SRC, `找不到 ${g} —— 那一处按钮点击没有接住结果`).toContain(g)
    }
    // 导航那处仍是 `.catch(() => {})`,别把它也改了 —— 它靠 hash 判落点
    expect(SRC, '导航链接那处被改成看点击结果了?它该看 hash 落点').toContain('link.click({ force: true, timeout: 800 }).catch(() => {})')
  })

  it('主循环:失败先 continue,分类在其后', () => {
    const i = SRC.indexOf('if (!clickedOk) continue')
    expect(i, '主循环没有「点不中就不往下走」').toBeGreaterThan(-1)
    const after = SRC.slice(i)
    const classifyAt = after.indexOf('classifySilent(route')
    expect(classifyAt, '主循环里找不到 classifySilent').toBeGreaterThan(-1)
    // 关键:分类必须发生在守卫**之后**(after 从守卫开始切,所以位置必为正)
    expect(classifyAt, 'classifySilent 跑到守卫前面去了 —— 没点到的也会被分类').toBeGreaterThan(0)
  })

  it('弹窗内点击同样守住了计数与分类', () => {
    const i = SRC.indexOf('if (!modalClickOk) continue')
    expect(i, '弹窗内点击没守住').toBeGreaterThan(-1)
    const after = SRC.slice(i, i + 600)
    expect(after, '弹窗内该在守卫后计数').toContain('clicked += 1')
    expect(after, '弹窗内该在守卫后分类').toContain("classifySilent(route, 'modal'")
  })

  it('干净重试:点不中返回 null(判不了),不当成死控件', () => {
    const i = SRC.indexOf('const ok = await b')
    expect(i, 'cleanRetry 没接住点击结果').toBeGreaterThan(-1)
    expect(SRC.slice(i, i + 300), '点不中该返回 null,不是 false').toContain('if (!ok) return null')
  })

  it('inView 两个方向都判,且认容器裁切', () => {
    const i = SRC.indexOf('const inView = await b')
    expect(i, '找不到 inView 判定').toBeGreaterThan(-1)
    const block = SRC.slice(i, i + 1600)
    expect(block, '只判了纵向,横向在视口外没被拦').toContain('innerWidth')
    expect(block, '该判纵向').toContain('innerHeight')
    expect(block, '不认容器裁切 —— main 自己可滚时元素在 main 可视区外仍会被点').toMatch(/overflowY/)
  })
})

/**
 * 干净重试的定位口径 —— 两处实测缺陷。
 *
 * 一 `getByRole('button')` 认不到页签
 *   页签在 DOM 上是 `<button role="tab">`,`getByRole('button')` 按 ARIA 角色匹配,
 *   找不到它们。于是 `/codex` 的「界域」、`/titles` 的「名号」、`/collection` 的「成就」
 *   每次都被判成「干净态无法单独复现」——读数照打、一条也不判失败,
 *   而它们**从未被单独验证过**。那三条读数是假的。
 *
 * 二 `hasText` 不认整串锚定的正则
 *   `namePattern` 返回 `^界域$`,那是给 `getByRole({ name })` 用的整串匹配。
 *   而 `hasText` 是子串语义:实测 `^界\s*域$` 对「界域」页签 count 为 0,
 *   去掉锚点后为 1。两处口径不同,直接套用会静默失效。
 *
 * 故障注入:把 cleanRetry 的定位改回 `getByRole('button', …)`,第一条红;
 * 去掉 source.replace(/^\^|\$$/g, …),第二条红。
 */
describe('干净重试 · 定位口径', () => {
  const SRC = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8').replace(
    /^\s*(\*|\/\/).*$/gm,
    ''
  )
  const CLEAN = /async function cleanRetry[\s\S]{0,2600}?\n\}/.exec(SRC)?.[0] ?? ''

  it('cleanRetry 不用 getByRole("button") 定位 —— 认不到 role=tab', () => {
    expect(CLEAN, '找不到 cleanRetry').not.toBe('')
    expect(CLEAN, '又回到 getByRole("button") —— 三个页签会被判成「无法复现」').not.toContain(
      "getByRole('button'"
    )
    expect(CLEAN, '该按 button 定位后按文本筛,与 ARIA 角色无关').toContain("locator('button')")
  })

  it('粗筛的正则去掉了整串锚点', () => {
    expect(CLEAN, '找不到取 namePattern 的那句').toContain('namePattern(label)')
    expect(
      CLEAN.replace(/\s+/g, ''),
      '把 ^…$ 直接喂给 hasText —— 子串语义下恒不匹配'
    ).toMatch(/whole\.source\.replace\(\/\^\\\^\|\\\$\$\/g, ?''\)/)
  })

  /*
   * 评审指出上一条不够:只查「那段替换表达式出现过」,它完全可能出现了却没被用上
   * (`const re = ...` 之后直接 `filter({ hasText: namePattern(label) })`),测试照样绿。
   * 故直接断言**筛选条件本身**:
   *   · 粗筛用去锚点后的式子
   *   · 逐个比对时用**整串**式子 `whole`
   */
  it('筛选条件是去锚点的式子,逐个比对用整串式子', () => {
    const compact = CLEAN.replace(/\s+/g, '')
    expect(compact, '粗筛没用去锚点的式子').toContain('filter({hasText:re})')
    expect(compact, '没有取整串式子').toContain('constwhole=namePattern(label)')
    expect(compact, '逐个比对没用整串式子 —— 子串会命中更长的按钮').toContain('whole.test(text)')
  })

  /*
   * 顺序:先筛「整串吻合 + 可见」,再判选中态。
   *
   * 评审指出:把选中态判断放在可见性之前时,列表里若有一个**隐藏的已选中期签**
   * 排在可见目标前面,它会被当成幂等报出去 —— 而真正该点的那个可见控件
   * 一次都没验过。顺序反了,缺陷就漏了。
   */
  it('先筛可见与整串吻合,再判选中态', () => {
    const compact = CLEAN.replace(/\s+/g, '')
    const testAt = compact.indexOf('whole.test(text)')
    const tabAt = compact.indexOf('isSelectedTabState')
    const visAt = compact.indexOf('cand.isVisible()')
    expect(testAt, '找不到整串比对').toBeGreaterThan(-1)
    expect(tabAt, '找不到选中态判断').toBeGreaterThan(-1)
    expect(visAt, '找不到可见性判断').toBeGreaterThan(-1)
    expect(visAt, '可见性判断排在选中态之后 —— 隐藏的已选中期签会被当成幂等').toBeLessThan(tabAt)
    expect(testAt, '整串比对排在选中态之后').toBeLessThan(tabAt)
  })
})

/**
 * 「点的是当前已选中的页签」按状态认,不写死路径。
 *
 * 白名单那三条是同一种情况的特例,但按「路径 + 标签」写死:
 * `/codex` 的「界域」与 `/collection` 的「成就」都是各自页面的默认页签,
 * 一次都没进白名单,于是每次都被判成真死按钮(实测两条)。
 *
 * 归因也要单列一档(`'selected-tab'`),不复用 `true`:
 * 两者都不判失败,但报表文案不同 —— 复用会写成「干净重试有变化,功能正常」,
 * 而实际是「它本来就是选中态」。归因错了,下次真出现一个点了没变化的页签时,
 * 人会照着这句话以为功能是好的。
 */
describe('页签幂等 · 按 aria-selected 认状态', () => {
  it('只认 role=tab 且 aria-selected=true', () => {
    expect(isSelectedTabState('tab', 'true')).toBe(true)
    expect(isSelectedTabState('tab', 'false')).toBe(false)
    expect(isSelectedTabState('button', 'true'), '普通按钮带 aria-selected 不一定是幂等页签').toBe(false)
    expect(isSelectedTabState(null, null)).toBe(false)
  })

  it('归因单列一档,不复用「有变化」', () => {
    const sel = classifySmoke('/codex', 'page', '界域', 'selected-tab')
    expect(sel.bucket, '已选中的页签不判失败').toBe('silent')
    expect(sel.line, '归因要说「已是选中态」,不能说成「干净重试有变化」').toContain('已是选中态')
    expect(sel.line, '复用 true 那句就是归因错了').not.toContain('功能正常')
  })
})

/**
 * 弹窗内控件的「没法重试」与「重试了但复现不了」要分开写。
 *
 * `cleanRetry` 只做「导航到路由 → 找按钮 → 点 → 比指纹」。弹窗内控件要先点开
 * 某一扇触发的窗,重放那一步得知道是哪扇、点哪个入口 —— 这份信息在
 * `clickInsideModal` 的循环里并没有留下。
 *
 * 原先弹窗内控件也走页面级干净重试:永远找不到、永远记成
 * 「干净态无法单独复现」,读数看起来像「试过了但复现不了」,实际是**根本没试**。
 * 两者后续动作完全不同(前者要补重放,后者要承认盲区),不该写成同一句话。
 *
 * 故障注入:把 classifySilent 的 `kind === 'modal'` 短路去掉,第一条红。
 */
describe('弹窗内控件 · 无法复现单独归因', () => {
  const SRC = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8').replace(
    /^\s*(\*|\/\/).*$/gm,
    ''
  )

  /*
   * 断言**行为**,不靠源码文本。
   *
   * 评审指出第一版的问题:它查「函数里有没有 `kind === 'modal'`」,
   * 而三元表达式的**任一分支**里有它就算过;`modal-unreachable` 只要有出现也算过。
   * 于是「modal 时仍调 cleanRetry」或「modal 时没传 modal-unreachable」
   * 这两种回归都能溜过去。
   *
   * 这里改成把 `classifySilent` 的取 clean 逻辑**复刻成一个纯函数**再测行为 ——
   * 逻辑只有一行三元,复刻得住;同时用源码判据钉住那一行与复刻一致(下一条)。
   */
  it('classifySilent 对 modal 走 modalRetry,不走页面级的 cleanRetry', () => {
    const fn = /async function classifySilent[\s\S]{0,2000}?\n\}/.exec(SRC)?.[0] ?? ''
    expect(fn, '找不到 classifySilent').not.toBe('')
    /*
     * 弹窗内控件现在**可以**重试了(重放「点开那扇窗」那一步,见 modalRetry),
     * 所以判据不再是「走短路」,而是「走的是 modalRetry 而不是 cleanRetry」。
     *
     * 仍要防的回归:modal 分支退回 cleanRetry —— 那条永远找不到弹窗内按钮。
     */
    const m = /const clean\s*=([\s\S]*?)\n\s*pushSmokeDecision/.exec(fn)
    expect(m, '取 clean 的写法变了 —— 判据要跟着改名').not.toBeNull()
    const body = m![1]!
    expect(body, 'modal 分支没走 modalRetry').toContain('modalRetry(')
    // modal 那一支不许出现 cleanRetry
    const modalBranch = /kind === 'modal'\s*\?([\s\S]*?):\s*await cleanRetry/.exec(body)?.[1] ?? ''
    expect(modalBranch, '找不到 modal 分支').not.toBe('')
    expect(modalBranch, 'modal 分支退回 cleanRetry —— 那条永远找不到弹窗内按钮').not.toContain(
      'cleanRetry'
    )
  })

  it('modalRetry 具备重放能力:重开入口、等面板、窗内找目标', () => {
    const fn = /async function modalRetry[\s\S]*?\n\}/.exec(SRC)?.[0] ?? ''
    expect(fn, '找不到 modalRetry —— 判据要跟着改名').not.toBe('')
    expect(fn, '没有重放入口那一步').toContain('namePattern(opener)')
    expect(fn, '没等面板挂上就找按钮').toContain(".modal-panel")
    expect(fn, '窗内找按钮没限定在面板里').toContain("locator('.modal-panel button')")
    expect(fn, '没有 opener 时该如实标成没法重试').toContain("'modal-unreachable'")
  })

  it('归因文案与「重试过但找不到」不同', () => {
    const modal = classifySmoke('/world', 'modal', '深入探寻', 'modal-unreachable')
    expect(modal.bucket, '这是覆盖盲区,不是死按钮').toBe('silent')
    expect(modal.line, '要说清是「复现不了那扇窗」').toContain('复现不了那扇窗')
    expect(modal.line, '不该写成「干净态无法单独复现」—— 那句暗示试过了').not.toContain(
      '干净态无法单独复现'
    )
    // 对照组:页面级真找不到时仍是原来那句
    const page = classifySmoke('/codex', 'page', '某按钮', null)
    expect(page.line, '页面级「找不到」的文案不该被改掉').toContain('干净态无法单独复现')
  })
})

/*
 * 类型/运行时的双重绑定:`'modal-unreachable'` 只对弹窗内控件成立。
 *
 * 评审指出:调用方传 `kind: 'page'` 加 `'modal-unreachable'` 时,若无校验就会
 * 走进那一支,把**页面级**控件记成「弹窗内盲点」—— 那是把真缺陷藏起来。
 * 页面控件复现不了通常是脚本或页面真出了问题,不该披上「复现不了那扇窗」的说法。
 */
describe('modal-unreachable 的适用范围', () => {
  it('页面控件收到这一档时判失败,不当成盲区放过', () => {
    const bad = classifySmoke('/codex', 'page', '某按钮', 'modal-unreachable')
    expect(bad.bucket, '页面控件不该被记成弹窗盲点 —— 那是把真缺陷藏起来').toBe('dead')
    expect(bad.line, '要说明这是归类错').toContain('归类错')
  })

  it('弹窗控件收到时才是盲区(对照组)', () => {
    const ok = classifySmoke('/world', 'modal', '深入探寻', 'modal-unreachable')
    expect(ok.bucket).toBe('silent')
    expect(ok.line).toContain('复现不了那扇窗')
  })
})

/**
 * 名字里「元素拼接处」的空格不稳定 —— 空白容错必须是零或多。
 *
 * 「深入探寻」与「小险」在 `ExploreModeDialog` 里是**两个 span**:
 *   `<span class="font-kai">{{ name }}</span>` 后跟难度标签
 * `innerText` 有时给一个空格、有时因布局紧凑不给 —— 同一个按钮,
 * 主循环读到的 label 是「深入探寻小险 行程」,重放后读到的却是「深入探寻小险行程」。
 *
 * 写成 `\s+` 时后者匹配不上,弹窗内控件的重试于是恒被判「找不到目标按钮」,
 * 十一个弹窗内控件全部记成死按钮。实测就是这么红的。
 *
 * `\s*` 对两种都成立;文字骨架仍逐字相同,不会误配。
 */
describe('namePattern · 空白容错是零或多', () => {
  it('元素拼接处少一个空格仍能定位', () => {
    const label = '深入探寻小险 行程 1小时 · 收益 ×1.4 · 遇险 ×1.74'
    const noSpace = '深入探寻小险行程 1小时 · 收益 ×1.4 · 遇险 ×1.6'
    /*
     * 只测**实际发生的那个方向**:主循环读到带空格的 label(innerText 给了空格),
     * 重放后同一按钮的 innerText 没给空格 —— `namePattern(label)` 用它去匹配。
     * 反向(label 里没空格、实际文本有空格)是另一回事:`小险行程` 会被当成
     * 一个整体,中间插不进 `\s*`,那条路本就不该指望 —— 判据不写这个方向。
     */
    expect(namePattern(label).test(noSpace), '拼接处少空格就认不出 —— 弹窗内重试会全线判死').toBe(true)
    /*
     * 反向也成立:label 里**没有**空格、实际文本有空格。
     * 评审指出原先只在原 label 已有空白的位置插 `\s*`,这个方向会漏 ——
     * 而同一份 innerText 在不同时刻给不给空格并不稳定,两个方向都会真实发生。
     * 做法:在中文字符边界补可选空白(ASCII 不动,免得 `x1` 与 `x 1` 混为一谈)。
     */
    expect(namePattern(noSpace).test(label), '反过来(label 无空格、实际有)也该成立').toBe(true)
  })

  it('文字骨架仍须逐字相同,不会因放宽空白而误配', () => {
    /*
     * 只挑**文字**差异,不挑数字差异 —— 数字段本来就该放宽(那是设计),
     * 拿「1小时 vs 2小时」当反例会把放宽数字这件事的基础判据推翻。
     */
    const re = namePattern('深入探寻小险 行程 1小时')
    expect(re.test('寻常游历安稳 行程 1小时'), '别的模式不该被认成「深入探寻」').toBe(false)
    expect(re.test('深入探寻极险 行程 1小时'), '难度标签是骨架的一部分,不许放松').toBe(false)
  })
})

/**
 * 「重放时已在途/闭关」与「真死控件」必须分开。
 *
 * 实测:`/world` 的六档历练模式按钮,主循环点「深入探寻」时**真的出发了**,
 * 存档里 `adventure.session` 从此为真;`modalRetry` 重放那一步时
 * `startExploration` 走「历练在途」分支 return false(带 toast 拒因),
 * 弹窗不关、界面不变 —— 十一处全被记成死按钮,冒烟退出码 1。
 *
 * 那不是缺陷:按钮在**可出发的状态下**是好的,重放时状态已经变了。
 * 两者的后续动作完全不同:前者说明判据的语境界不到(要换语景重放),
 * 后者说明控件真有问题(要修)。
 *
 * 故障注入:把 classifySilent 的 state-dependent 分支删掉 → 第一条红。
 */
describe('重放状态相关 · 与死控件分开', () => {
  it('归读数,文案说明是状态所致', () => {
    const d = classifySmoke('/world', 'modal', '深入探寻', 'state-dependent')
    expect(d.bucket, '状态相关不是死按钮').toBe('silent')
    expect(d.line, '要说清是「重放时已在途」').toContain('已在途')
    expect(d.line, '要说明按钮在可出发状态下才有效').toContain('可出发')
  })

  it('modalRetry 判状态门控:点后读互斥状态 + 控件正文属于在途动作', () => {
    const SRC2 = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8').replace(
      /^\s*(\*|\/\/).*$/gm,
      ''
    )
    const fn = /async function modalRetry[\s\S]*?\n\}/.exec(SRC2)?.[0] ?? ''
    expect(fn, '找不到 modalRetry').not.toBe('')
    /*
     * 判据从「点之前读快照」改成「点之后看有没有拒因 toast」——
     * 快照读错字段就漏判(闭关在 buffs 里、远征在 endgame.worldRun 里),
     * 且会把无关的死控件一并记成状态相关。拒因 toast 才是**这一下真的被拒**的证据。
     */
    // 四种拒因词(与 core/endgameActivity.BUSY_REASON 同源)
    for (const w of ['闭关中', '远征在途', '身在秘境', '历练在途']) {
      expect(SRC2, `拒因词表缺「${w}」—— 该状态下会被误判成死按钮`).toContain(w)
    }
    // 互斥状态读取:远征 / 秘境 / 历练 三个 store 字段 + 闭关 buff,一个都不许漏
    const reader = /async function readBusyState[\s\S]*?\n\}/.exec(SRC2)?.[0] ?? ''
    expect(reader, '找不到 readBusyState').not.toBe('')
    for (const key of ['worldRun', 'secretRealm', 'session', 'retreat']) {
      expect(reader, `readBusyState 没读 ${key} —— 那个状态下控件会被误判成死按钮`).toContain(key)
    }
    /*
     * 状态门控必须**同时**满足:页面确实在途 + 控件正文属于在途动作。
     * 只看前者会把无关的死控件一并放过(评审指出);只看后者会误伤普通按钮。
     */
    expect(fn, '要在点击之后才读互斥状态,不在点前拍快照').toMatch(/!== before\) return true[\s\S]{0,300}readBusyState/)
    expect(fn, '门控要看控件正文,不是只看到页面忙').toMatch(/gateWords[\s\S]{0,200}label/)
  })
})
