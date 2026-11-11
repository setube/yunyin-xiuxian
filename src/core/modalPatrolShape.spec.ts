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
