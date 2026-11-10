/**
 * scripts/edge-states.mjs 的扫描口径(该脚本不在 CI 里跑,故用源码判据钉住)。
 *
 * 这里钉的每一条都是**已经踩过的坑**:
 *
 *  一 **扫整页,不扫 `main`**。寿元/灵石那几格在顶栏,不在 `main` 里 ——
 *    而 `1.7976931348623157e+308/1.013京 载` 正是只在顶栏露出来的形态。
 *
 *  二 **五类坏值,不只是 NaN/Infinity/undefined**。`Number.isFinite` 挡不住
 *    有限的超范围值:`age: MAX_VALUE`、`lastAt: 8640000000000001` 都过得了守卫,
 *    之后分别印成 `1.7976931348623157e+308` / 英文 `Invalid Date` / `NaN月NaN日`。
 *
 *  三 **夹具要给「有限巨值」**。原先这一档灌的是 `age = NaN` —— 那是被 `isFinite`
 *    挡下的那一类,于是新加的正则永远没有输入可抓(实测:只拆掉 age 上界、其余不动,
 *    旧夹具下仍然全绿;换成 MAX_VALUE 后立刻 18 个路由全红)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../../scripts/edge-states.mjs'), 'utf-8')

/** 取「单字段畸形走遍主路由」那一档的源码片段,后面几条判据都在它上面看 */
const SCENE_START = SRC.indexOf("name: '单字段畸形走遍主路由'")
const SCENE = SRC.slice(SCENE_START, SRC.indexOf('\n  }\n]', SCENE_START))

describe('edge-states · 坏值扫描的口径', () => {
  it('这一档还在,且夹得住(锚点没漂)', () => {
    expect(SCENE_START, '找不到「单字段畸形走遍主路由」这一档').toBeGreaterThan(-1)
    expect(SCENE.length, '切片太短,判据会空转').toBeGreaterThan(500)
  })

  it('扫整页而不只是 main —— 顶栏那几格不在 main 里', () => {
    expect(SCENE, '又退回只扫 main 了,顶栏的坏值会漏').not.toContain("querySelector('main')")
    expect(SCENE, '该扫整页').toContain('document.body')
  })

  it('正则盖住五类坏值,科学计数两种写法都要有', () => {
    // 科学计数的两种形态:裸插值 `1e+300` / `1.797…e+308`,formatGN 兜底 `1.80e308`
    expect(SCENE, '没扫科学计数').toMatch(/\[0-9\]e\\\+\?\[0-9\]\{2,\}/)
    expect(SCENE, '没扫英文 Invalid Date').toContain('Invalid Date')
    expect(SCENE, '没扫 [object Object]').toContain('object Object')
    expect(SCENE, '没扫 NaN').toContain('NaN')
    expect(SCENE, '没扫 Infinity').toContain('Infinity')
    expect(SCENE, '没扫 undefined').toContain('undefined')
  })

  it('夹具灌的是「有限巨值」,不是 NaN —— 后者过不了守卫,抓不到新缺陷', () => {
    expect(SCENE, 'age 又灌回 NaN 了:NaN 走的是另一条修复分支').toContain('s.player.age = Number.MAX_VALUE')
    expect(SCENE, '时间戳夹具该用超范围值').toContain('8_640_000_000_000_001')
    expect(SCENE, '寿元加算项也要灌巨值').toContain('lifespanBonusYears = Number.MAX_VALUE')
  })
})

/**
 * 两个脚本要同一套口径。
 *
 * `ui-smoke` 用**好人存档**走 22 页并点击交互,`edge-states` 用**坏档**走 18 个路由 ——
 * 覆盖面互补,缺一处就漏一半。两个脚本各写各的模式表,历史上就是
 * `ui-smoke` 停在 `['NaN','Infinity','undefined']` 而 `edge-states` 已经认五类。
 *
 * 这里不比对字面量(两份代码形态不同:一个用正则、一个原本用 includes),只比**行为**:
 * 同一批样本喂给两边的模式表,结论必须一致。
 */
describe('坏值扫描 · 两个脚本同口径', () => {
  const SMOKE = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8')

  /**
   * 从 ui-smoke 源码里取出 NUMERIC_LEAK 那一组正则。
   *
   * 按**行**取,不按 `]` 截断:`/[0-9]e\+?[0-9]{2,}/g` 这种模式里带 `]`,
   * 按字符找右括号会把它截断(实测只取到 4 条而不是 6 条)。
   * 每条模式都独占一行,形如 `  /.../g,` 或 `  /.../g`。
   */
  function smokePatterns(): RegExp[] {
    const at = SMOKE.indexOf('const NUMERIC_LEAK = [')
    const end = SMOKE.indexOf('\n]', at)
    const block = SMOKE.slice(at, end)
    const out: RegExp[] = []
    for (const line of block.split('\n')) {
      const s = line.trim()
      if (!s.startsWith('/')) continue
      // 取最后一个 `/g` 作为结束定界符(`/` 在模式正文里不会以 /g 结尾的形式出现)
      const close = s.lastIndexOf('/g')
      if (close < 0) continue
      out.push(new RegExp(s.slice(1, close), 'g'))
    }
    return out
  }

  /** edge-states 里那条扫描正则(整行一条,末尾是 /g) */
  function edgePatterns(): RegExp {
    const at = SRC.indexOf('const re = /')
    const line = SRC.slice(at, SRC.indexOf('\n', at))
    const close = line.lastIndexOf('/g')
    return new RegExp(line.slice(line.indexOf('/') + 1, close), 'g')
  }

  const HIT = [
    '1.7976931348623157e+308', // 裸插值的有限巨值
    '1.80e308',               // formatGN 兜底
    'Invalid Date',           // 超范围时间戳的英文输出
    'NaN',
    'Infinity',
    'undefined',
    '[object Object]'
  ]
  const CLEAN = [
    '寿元 3000/1000亿 载',
    '2026/11/10 21:09 收录',
    '9.038兆 · 1,200 道源',
    '异界 · 器魂 · 秘境'
  ]

  it('ui-smoke 的模式表认得全部七类坏值', () => {
    const pats = smokePatterns()
    expect(pats.length, '没从 ui-smoke 里取到模式表').toBeGreaterThanOrEqual(6)
    for (const s of HIT) {
      expect(pats.some(p => new RegExp(p.source, 'g').test(s)), `ui-smoke 漏了「${s}」`).toBe(true)
    }
  })

  it('ui-smoke 的模式表对正常文案零误报', () => {
    const pats = smokePatterns()
    for (const s of CLEAN) {
      expect(pats.some(p => new RegExp(p.source, 'g').test(s)), `ui-smoke 误报「${s}」`).toBe(false)
    }
  })

  it('edge-states 的正则也认得全部七类', () => {
    const re = edgePatterns()
    for (const s of HIT) {
      expect(new RegExp(re.source, 'g').test(s), `edge-states 漏了「${s}」`).toBe(true)
    }
    for (const s of CLEAN) {
      expect(new RegExp(re.source, 'g').test(s), `edge-states 误报「${s}」`).toBe(false)
    }
  })
})

/**
 * 首启全流程那一档(欢迎页 → 同意 → 传送动画 → 建号页)。
 *
 * 上面几条钉的是「单字段畸形走遍主路由」那一档;这一档是后加的,
 * 验的是**流程能不能走通**,而不只是页面画出来对不对。
 *
 * 它存在的直接原因是一次误判:第一次量时点完「同意并开始」只等 2 秒就看路由,
 * 停在 `#/welcome` —— 差一点当成「点了没反应」去修。查 `confirmStart()` 才看到
 * 中间有 2500ms 的传送动画。**那不是缺陷,是等待太短。**
 * 所以判据要把「等多久」与「等到之后该在哪」一起钉住。
 */
describe('edge-states · 首启全流程', () => {
  const SCENE_START = SRC.indexOf("name: '首启全流程走到建号页'")
  const SCENE = SCENE_START < 0 ? '' : SRC.slice(SCENE_START, SRC.indexOf("\n  {\n", SCENE_START))

  it('这一档还在,且夹得住(锚点没漂)', () => {
    expect(SCENE_START, '找不到「首启全流程走到建号页」这一档').toBeGreaterThan(-1)
    expect(SCENE.length, '切片太短,判据会空转').toBeGreaterThan(600)
  })

  it('三步都验:弹窗、置灰、落地', () => {
    expect(SCENE, '该验点了「开始游戏」会不会弹隐私确认').toContain('asked')
    expect(SCENE, '该验没勾同意时确认钮置灰').toContain('blockedBefore')
    expect(SCENE, '该验最终落在哪个路由').toContain("landed !== '#/create'")
  })

  it('等待要盖过 2500ms 的传送动画 —— 等短了会误判成「点了没反应」', () => {
    // 传送动画 2500ms;判据等 3200ms 留 700ms 余量
    expect(SCENE, '等待时长丢了').toContain('waitForTimeout(3200)')
    const shortWait = /waitForTimeout\(1[0-9]{3}\)[\s\S]{0,80}location\.hash/.test(SCENE)
    expect(shortWait, '又退回 1.x 秒的等待 —— 那样会落在 #/welcome 上误报').toBe(false)
  })

  it('落在建号页还要验内容,不只验路由', () => {
    expect(SCENE, '该验建号页真渲染出了道号/灵根/踏入仙途').toContain('道\\s*号|灵\\s*根|踏\\s*入\\s*仙\\s*途')
  })
})
