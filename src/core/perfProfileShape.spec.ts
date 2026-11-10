/**
 * scripts/perf-profile.mjs 的量法守卫(该脚本不在 CI 里跑)。
 *
 * 这里钉的三条都是**已经踩过的坑**,不是想象出来的:
 *  1. 取页面必须走 openPage():三个分支各写一遍 throttle(),上一轮就漏了 --startup 那处,
 *     4x 限速下启动分段读出来和未限速一样,而同一轮挂载期是 340ms —— 两个数对不上才发现。
 *  2. 限速必须在导航前装:导航之后再装,首屏那一段量的仍是未限速的。
 *  3. 内存档必须走 CDP 的 Runtime.getHeapUsage:performance.memory.usedJSHeapSize
 *     在本机 chromium 里是固定值,持有 40×20 万元素的数组读数纹丝不动,拿它判等于空转。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAW = readFileSync(resolve(__dirname, '../../scripts/perf-profile.mjs'), 'utf8')

/** 剥掉行注释与块注释:判据看的是代码,不是注释里提到过的词 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

const SCRIPT = stripComments(RAW)

describe('性能剖面的量法', () => {
  it('取页面统一走 openPage(),不留裸 context.newPage()', () => {
    const bare = SCRIPT.match(/context\.newPage\(\)/g) ?? []
    // 只允许 openPage 内部那一处
    expect(bare.length, `裸 newPage 还有 ${bare.length} 处 —— 新的分支会漏装限速`).toBe(1)
    expect(SCRIPT).toContain('async function openPage(context)')
    const callers = SCRIPT.match(/await openPage\(context\)/g) ?? []
    expect(callers.length, '三个模式各自要开页面').toBeGreaterThanOrEqual(3)
  })

  it('限速在导航前装进 openPage,不在页面打开后再补', () => {
    const body = SCRIPT.slice(SCRIPT.indexOf('async function openPage'), SCRIPT.indexOf('async function openPage') + 700)
    expect(body, '限速要落在 openPage 里').toContain('setCPUThrottlingRate')
    // 三个模式的 goto 都紧跟 openPage,中间不该再插 throttle
    expect(SCRIPT, 'openPage 之后不该再单独调 throttle').not.toMatch(/await throttle\(context/)
  })

  it('内存档走 CDP 的 getHeapUsage,不用 performance.memory', () => {
    expect(SCRIPT).toContain('Runtime.getHeapUsage')
    expect(SCRIPT, 'performance.memory 在本机是固定值,不能当判据').not.toContain('usedJSHeapSize')
  })

  it('内存档默认走真实负载:空闲心跳不分配,量出来必然平', () => {
    expect(SCRIPT).toContain('withActiveRun')
    expect(SCRIPT).toContain('const activeLoad = args.includes("--active")')
  })

  it('预算随限速倍数放宽,不拿绝对值卡限速档', () => {
    const scales = SCRIPT.match(/Math\.max\(1, Math\.min\(cpuRate, 4\)\)/g) ?? []
    expect(scales.length, '挂载期与启动合计两条预算都要按倍数放宽').toBeGreaterThanOrEqual(2)
  })

  it('巡页的 context 在 finally 里收 —— 一页崩了不许把后面几页一起拖红', () => {
    /*
     * 踩过:4x 限速下 goto 偶发超时,那一页的 context 带着渲染进程留着;
     * 后面几页接着开新 context,越堆越多,于是同一轮里 codex 与 dongfu 先后超时,
     * 而单独跑这两个都过 —— 一个假崩溃拖红了两页,读数全不可信。
     *
     * 实测(真 chromium,5 轮其中 1 轮抛异常):旧写法跑完剩 5 个 context 没关,
     * finally 写法剩 0 个。
     */
    expect(SCRIPT, '巡页循环里要有 context 变量在 try 外声明').toMatch(/let context = null/)
    expect(SCRIPT, 'context 必须在 finally 里关').toMatch(/finally \{[\s\S]{0,200}context\?\.close\(\)/)
    // 阴性对照:try 块里不许再单独收 context(那是「只有成功才收」的老写法)
    const loop = SCRIPT.slice(SCRIPT.indexOf('for (const view of VIEWS)'))
    const tryBody = loop.slice(loop.indexOf('try {'), loop.indexOf('} catch (err)'))
    expect(tryBody, '成功路径不再单独关 —— 收到 finally 里统一处理').not.toMatch(/await context\.close\(\)/)
  })
})

describe('内存档 · 「读数不变」守卫看原始字节', () => {
  /**
   * 这条守卫原来看**显示值**是否全同,而显示值取整到 0.1MB。
   *
   * GC 后的驻留本身在几十 KB 量级随机游走 —— 实测 4 点原始字节
   * 5883664 → 5861740 → 5857920 → 5861580,取整后全成 5.6MB,
   * 于是一次**正常的平坦测量**被误判成「度量手段失效,这一档等于空转」。
   * 同一配置连跑两次,两次都误报。
   *
   * 守卫要看的是原始字节是否一个字都没变 —— 那才是真·度量失效
   * (比如退回 performance.memory:它的 usedJSHeapSize 在本机是固定值)。
   */
  it('采样同时留原始字节,守卫比 rawBytes 而不是 mb', () => {
    expect(SCRIPT, '采样要同时返回原始字节').toMatch(/return \{ bytes: usedSize, mb: /)
    expect(SCRIPT, '守卫该比原始字节').toContain('rawBytes.every((v) => v === rawBytes[0])')
    // 阴性对照:拿显示值判「全同」的老写法不许回来
    expect(SCRIPT, '别再用显示值判全同').not.toContain('known.every((v) => v === known[0])')
  })

  it('判据抓得住:把守卫改回比显示值即红', () => {
    // 只钉语义边界:0.1MB 分辨率下,几十 KB 的真实差会被抹平
    const raw = [5883664, 5861740, 5857920, 5861580]
    const mb = raw.map((b) => Math.round((b / 1048576) * 10) / 10)
    expect(new Set(mb).size, '取整后确实全同').toBe(1)
    expect(new Set(raw).size, '原始字节并不同').toBe(4)
  })
})

describe('启动分段 · 顺序按真实打点', () => {
  /**
   * `boot:engineStart` 系那一串跑在 App.vue 的 `onMounted` 里,而 `onMounted`
   * 在 `app.mount()` **返回之前**就同步执行完了 —— 所以 engineStart 比 main.ts 里
   * 紧随 `app.mount()` 之后的 `boot:mounted` 还要**早**。
   *
   * 原先 order 数组把 mounted 排在 engineStart 前面,实测每次都算出负增量
   * (`+-5.3ms`),报表上像「有一段花了 -5 毫秒」。实测三次:engineStart 恒比 mounted 早约 5.3ms。
   */
  it('order 里 engineStart 排在 mounted 之前', () => {
    const start = SCRIPT.indexOf('const order = [')
    const order = SCRIPT.slice(start, SCRIPT.indexOf('];', start))
    const atEngine = order.indexOf('boot:engineStart')
    const atMounted = order.indexOf('boot:mounted')
    expect(atEngine, 'order 里找不到 engineStart').toBeGreaterThan(-1)
    expect(atMounted, 'order 里找不到 mounted').toBeGreaterThan(-1)
    expect(atEngine, 'engineStart 在 onMounted 里跑,比 mounted 打点更早').toBeLessThan(atMounted)
  })

  it('「启动合计」取序列末项,不写死某个标记名', () => {
    expect(SCRIPT, '写死 boot:achievements 会漏掉 mounted 那一段').not.toContain(
      'const last = byName.has("boot:achievements")'
    )
    expect(SCRIPT, '合计该取遍历后的 prev(即末项)').toContain('const last = prev;')
  })
})

describe('启动预算 · 按限速倍数放宽', () => {
  /**
   * 「预算按倍数放宽」本身由上面那条 `Math.max(1, Math.min(cpuRate, 4))` 计数判据覆盖
   * (它要求两处预算都放宽),这里不再重复钉同一条源码。
   *
   * 这一组只补两件上面没覆盖的事:
   *   一 判据比的是**主线程那一段**,不是含网络等待的合计;
   *   二 注释里的实测数字要与 `computeMs` 的口径一致。
   */
  it('判据比的是主线程那一段,不是含网络等待的合计', () => {
    // computeMs = last - boot:start;含导航等待的合计在弱网下会被网络时间撑爆
    expect(SCRIPT, '该扣掉 boot:start 之前的网络等待').toContain('byName.get("boot:start")')
    expect(SCRIPT, '超标时要比 computeMs 而不是 total').toContain('computeMs > STARTUP_BUDGET_MS')
  })

  it('注释里的实测数字与 computeMs 口径一致,不写含导航等待的旧数', () => {
    /*
     * **要看 RAW 而不是 SCRIPT**:SCRIPT 是 `stripComments(RAW)` 的结果,
     * 拿它去断言「注释里没有某个字符串」恒真 —— 判据空转。
     * 这一条是我自己写出来又自己抓到的(正向塞回旧注释,判据仍然绿)。
     */
    expect(RAW, '注释还留着与 computeMs 口径不符的旧数').not.toContain('late(2KB 存档)108ms')
    expect(RAW, '注释还留着与 computeMs 口径不符的旧数').not.toContain('4x 下实测 346ms')
  })
})

describe('启动开销曲线 · 存档变大的代价', () => {
  /**
   * `--items` 长期只是个手动开关,没有任何判据消费它 ——
   * 存档变大在启动路径上多花多少,此前只能人工读数,回归了没人拦。
   *
   * `--curve` 在**同一进程**里各量一次空包与满包:跨进程跑两次会把两次之间的
   * 机器负载差异也算进来,比不出「存档变大的代价」。
   *
   * 阈值 75ms 的推导见脚本注释(四次实测增量均值 54.3、最大 56.0,取均值 × 1.4)。
   * 先按 60 定过一版,余量只剩 4ms —— 那是误报源,不是判据。
   */
  it('--curve 存在,且在同一进程里跑空包与满包两档', () => {
    expect(SCRIPT, '缺 --curve 模式').toContain('const curveOnly = args.includes("--curve")')
    // 两档都得走同一个 measureStartup,才谈得上「只差存档大小」
    expect(SCRIPT, '该把启动测量抽成一处共用').toContain('async function measureStartup(')
    expect(SCRIPT, '空包档').toContain('measureStartup(viewport, stressSlices(0))')
    expect(SCRIPT, '满包档').toContain('measureStartup(viewport, stressSlices(120))')
  })

  it('判据比的是**增量**,不是绝对值 —— 机器快慢会整体平移', () => {
    expect(SCRIPT, '该比 right grew 增量').toContain('const grow = Math.round((full.computeMs - empty.computeMs)')
    expect(SCRIPT, '超标要红').toContain('if (grow > CURVE_BUDGET_MS)')
    expect(SCRIPT, '阈值该是 75 而不是 60').toContain('process.env.PERF_CURVE_MS ?? 75')
  })
})
