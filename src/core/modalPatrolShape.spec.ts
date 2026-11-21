/**
 * scripts/modal-patrol.mjs 的结构判据(该脚本不在 CI 里跑,故用源码钉住)。
 *
 * 本轮新增两扇窗:**悟道顿悟 / 洞府巡游**。它们与其余十七扇有三处本质不同,
 * 每一处写错都会让「开出来的每一扇都量过」变成空话:
 *
 *  一 **不由点击触发**。引擎每 30s 轮询、按 `EARLY_EVENT_DECAY` 的概率自己浮上来,
 *    故不能走 `patrol()` 那条「点一下 → 量」的路。
 *
 *  二 **只在前期档出现**。`cavePatrol` 的衰减表在元婴期起是 0(`yuanying: 0`,
 *    `later: 0`),而其余脚本全用后期档(major 14)—— 它们因此从未被量过。
 *
 *  三 **不能钉死 `Math.random`**。`open()` 里有 `Math.random = () => 1`,
 *    那是为了让随机事件不干扰测量;这两扇窗的触发源正是随机数,钉死就永远弹不出来。
 *
 * 另钉一条**判据集只有一份**:十七扇与两扇若各写一份,以后加一条判据只改一处,
 * 另一处悄悄不查。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../../scripts/modal-patrol.mjs'), 'utf-8')

/**
 * 引擎自动弹那一块的起点。
 *
 * 不能用 `indexOf('引擎自动弹的两扇')` —— 那句话在文件里出现两次:
 * 一次在 `judge()` 的注释里(说明两处共用判据),一次才是那一块的开头。
 * 取到前者会让正则在一个只含注释的片段里跑,报的全是「找不到」。
 */
const AUTO_AT = SRC.indexOf('引擎自动弹的两扇窗:悟道顿悟 / 洞府巡游')

describe('弹窗巡逻 · 引擎自动弹的两扇', () => {
  it('两扇窗都在待办清单里', () => {
    expect(SRC, '悟道顿悟不在待办清单里').toContain("'悟道顿悟'")
    expect(SRC, '洞府巡游不在待办清单里').toContain("'洞府巡游'")
  })

  it('单开前期档上下文,且不钉死 Math.random', () => {
    const at = AUTO_AT
    expect(at, '找不到那一段 —— 判据要跟着改名').toBeGreaterThan(-1)
    const block = SRC.slice(at, at + 4000)
    // 前期档:major 0 才让 cavePatrol 的衰减系数是 1.0
    expect(block, '没把大境界压到炼气期,两扇窗的触发概率会是 0').toMatch(/major:\s*0/)
    // 今日未巡游
    expect(block, '没清 lastCaveEventDay,今天已经巡游过就永远不弹').toContain('lastCaveEventDay: 0')
    // 关键:这一段里不许出现 Math.random 的钉死
    expect(block, '这一段里钉死了 Math.random —— 那正是这两扇窗的触发源,钉死就永远弹不出来').not.toMatch(
      /Math\.random\s*=/
    )
  })

  it('判据集只有一份:两处都调 judge(),且 judge 里含全部七条', () => {
    // 十七扇那条路
    expect(SRC, 'patrol() 没走 judge()').toMatch(/if \(!judge\(name, audit\)\) return/)
    // 自动弹的那两扇
    expect(SRC, '自动弹的两扇没走 judge()').toMatch(/judge\(title, audit\)/)
    // judge 本体必须把七条都查一遍 —— 少一条就是「另一处悄悄不查」
    const judgeAt = SRC.indexOf('function judge(')
    expect(judgeAt, '找不到 judge() —— 判据要跟着改名').toBeGreaterThan(-1)
    const judge = SRC.slice(judgeAt, judgeAt + 2000)
    for (const field of ['label', 'unnamed', 'small', 'dimDisabled', 'overflow', 'squeezed', 'wrapped', 'scrollClip']) {
      expect(judge, `judge() 少了 ${field} 这一条`).toContain(`audit.${field}`)
    }
  })

  it('等它自己弹,不是点开', () => {
    const at = AUTO_AT
    const block = SRC.slice(at, at + 4000)
    // 轮询上限要够:引擎 30s 一轮,给 70 轮有冗余
    expect(block, '轮询轮数太少,30s 一轮的引擎可能还没轮到').toMatch(/i\s*<\s*(\d+)/)
    const rounds = Number(/i\s*<\s*(\d+)/.exec(block)?.[1] ?? 0)
    expect(rounds, `只等 ${rounds} 轮,不够跨过一个 30s 轮询周期`).toBeGreaterThanOrEqual(35)
    // 没弹出来要进 notOpened(而不是静默通过)
    expect(block, '没弹出时该进 notOpened,否则「没量到」会被当成「通过」').toContain('notOpened.push')
  })
})

/**
 * 覆盖率下限。
 *
 * `notOpened` / `twoStepMissed` 这两份清单只打印、不参与判定(各有合理原因:
 * 夹具没铺到前置、有些窗本就没有不可逆操作)。正因如此,**入口大面积失效时脚本照样报绿** ——
 * 量到的扇数趋近零,「开出来的每一扇都量过」就成了空话。
 *
 * 故脚本末尾给两个下限。这里钉住它们:下限被顺手删掉或调成 0,
 * 这道兜底就没了,而脚本的其他部分看不出任何异常。
 */
describe('modal-patrol · 覆盖率下限', () => {
  it('两个下限都存在且非零', () => {
    const opened = /const MIN_OPENED = (\d+)/.exec(SRC)
    const twoStep = /const MIN_TWO_STEP = (\d+)/.exec(SRC)
    expect(opened, '找不到 MIN_OPENED —— 下限被删了,量到零扇也会报绿').toBeTruthy()
    expect(twoStep, '找不到 MIN_TWO_STEP —— 两步确认一扇没探到也会报绿').toBeTruthy()
    expect(Number(opened![1]), 'MIN_OPENED 是 0 等于没有下限').toBeGreaterThan(6)
    expect(Number(twoStep![1]), 'MIN_TWO_STEP 是 0 等于没有下限').toBeGreaterThan(1)
  })

  it('两个下限各自都要判,且并列报进 failures', () => {
    /*
     * 必须**分段**判:整段一起判时删掉任一个,另一个仍能让 toContain 成立(实测漏过一次)。
     *
     * 收口方式从 `process.exit(1)` 改成了 `failures.push(...)` —— 原先是 exit,
     * 一旦覆盖率不足就把后面的失败清单整段跳过:实测注入一次中途崩掉,
     * 屏幕上只有「只开到 1 扇(应 ≥ 12)」,而真正的根因
     * (「弹窗巡逻中途中断:某扇窗里 evaluate 超时」)一条都没露面。
     * 覆盖率不足与判据失败是同一类事,该并列在失败清单里,由末尾那个 exit 统一收口。
     */
    const at = SRC.indexOf('const MIN_OPENED')
    const twoStepAt = SRC.indexOf('MIN_TWO_STEP)', at)
    expect(at, '找不到下限块').toBeGreaterThan(-1)
    expect(twoStepAt, '找不到两步确认那条判定').toBeGreaterThan(at)
    const openedBlock = SRC.slice(at, twoStepAt)
    const twoStepBlock = SRC.slice(twoStepAt, twoStepAt + 400)

    expect(openedBlock, '开了几扇没判据').toContain('openedCount < MIN_OPENED')
    expect(openedBlock, '「开到几扇」低于下限时没进 failures —— 只打印等于没判').toContain('failures.push(')
    expect(twoStepBlock, '两步确认低于下限时没进 failures').toContain('failures.push(')
  })
})

/*
 * 开窗等待(第 3 轮修「分解:量不到 .modal-panel」误报时加的)。
 *
 * 原先 `patrol()` 点完固定等 450ms 就量。面板出现本身是瞬时的(实测 1~19ms),
 * 机器一忙 450ms 就不够;而量不到面板时代码仍继续跑背景滚动检查,
 * 于是并发那一轮「分解」报出两条自相矛盾的失败:
 * 「量不到 .modal-panel」+「弹窗开着时背景仍能被手指滚走」。
 *
 * 工具误报比缺陷更贵 —— 它会把一次「这扇没量到」写成「这扇查过且坏了」。
 */
describe('弹窗巡逻 · 开窗等待', () => {
  const AT = SRC.indexOf('async function patrol(')
  const BLOCK = SRC.slice(AT, AT + 2200)

  it('patrol 里是等面板可见,不是固定睡眠', () => {
    expect(AT, '找不到 patrol() —— 判据要跟着改名').toBeGreaterThan(-1)
    expect(BLOCK, 'patrol 没有等待面板可见的逻辑,又回到固定睡眠了').toContain('waitForFunction')
    expect(BLOCK, 'patrol 里的固定 450ms 又回来了').not.toContain('waitForTimeout(450)')
  })

  it('等不到就记「未量」并说明原因,不继续拿空面板去量', () => {
    expect(BLOCK, '等不到面板时没有提前返回').toMatch(/if \(!visible\)[\s\S]{0,200}return/)
    expect(BLOCK, '未量原因里没写清是点了没弹出来').toContain('没出现面板')
  })
})

/*
 * 中途崩掉时,真正的根因要排在最前(第 13 轮)。
 *
 * 两处问题叠在一起,只有一个能修都不够:
 *   一 逐扇巡逻没包 try —— 异常冒到顶层,汇总在 browser.close() 之后,一条也打印不出来
 *   二 覆盖率下限用 `process.exit(1)`,一旦不足就把后面的失败清单整段跳过
 * 实测注入一次中途崩掉,屏幕上只有「只开到 1 扇(应 ≥ 12)」——
 * 那是**后果**,根因(某扇窗里 evaluate 超时)一条都没露面。
 *
 * 故障注入:去掉 try/catch,第一条红;把 failures.push 换回 process.exit,第二条红。
 */
describe('弹窗巡逻 · 崩溃时根因要露面', () => {
  it('逐扇巡逻包在 try 里,崩溃记成一条失败', () => {
    const tryAt = SRC.indexOf('// ============ 各页的弹窗')
    const block = SRC.slice(tryAt, tryAt + 400)
    expect(block, '巡逻段没包 try —— 中途抛错会让已量过的读数全部丢失').toContain('try {')
    expect(SRC, '崩溃没进 failures').toContain('弹窗巡逻中途中断')
  })

  it('覆盖率下限走 failures,不当场 exit', () => {
    /*
     * 只量到「两步确认」那条 if 结束为止 —— 末尾那段统一收口的 `process.exit(1)`
     * 本来就该在(它是整个脚本的收口),把它算进来会让这条判据永远假红。
     */
    const at = SRC.indexOf('const MIN_OPENED')
    const end = SRC.indexOf('if (notOpened.length)', at)
    expect(at, '找不到下限块').toBeGreaterThan(-1)
    expect(end, '找不到下限块之后的未量清单').toBeGreaterThan(at)
    // 注释里也写着 process.exit(1)(解释为什么不再用它),先剥掉整行注释再查
    const block = SRC.slice(at, end)
      .split('\n')
      .filter(line => !/^\s*(\*|\/\/)/.test(line))
      .join('\n')
    expect(block, '覆盖率不足仍当场 exit —— 真正的根因排在它后面就永远看不到').not.toContain('process.exit')
    expect(block, '覆盖率不足该作为一条失败并列报出').toContain('failures.push(')
  })
})
