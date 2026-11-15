/**
 * 今日天道的重入保护。
 *
 * `goDaily` 开头要 `await todayChallengeAsync()` —— 每次现算当日题(六个标准流派各跑 8 场),
 * 实测 30~257ms;而**扣道源发生在 await 之后**(`undertakeDaily` 里才 `spendDaoSource`)。
 * 这期间按钮仍是可点态:置灰靠的是 `busy`,那是「别的活动在途」(远征/秘境/历练),不含这一笔。
 *
 * 实测(真实浏览器,浏览器里连点三下):修复前道源 1200 → 1155,扣了 45 而不是 15 ——
 * 三笔入界费,只有一笔打。与「导出存档防连点」「转世交割单开头取走」同一类:
 * 异步动作必须在**进入时**就置位,不能等 await 回来。
 *
 * 这份 spec 钉住三件事:进入时置位、await 之前、无论成败都复位。
 * 复位那条尤其重要 —— 算不出题(`todayChallengeAsync` 返回 null)时若不复位,
 * 按钮会永久卡在「推演中」,而那是「今日无法应战」而不是「今日已完成」。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, './TrialPanel.vue'), 'utf-8')

/** `goDaily` 的函数体(到下一个同缩进的 `}` 为止) */
function goDailyBody(): string {
  const at = SRC.indexOf('async function goDaily()')
  expect(at, '找不到 goDaily —— 判据要跟着改名').toBeGreaterThan(-1)
  const end = SRC.indexOf('\n  }', at)
  expect(end, '找不到 goDaily 的结尾').toBeGreaterThan(at)
  return SRC.slice(at, end)
}

describe('今日天道 · 重入保护', () => {
  it('给定 goDaily,则进入时先判空置位,且在 await 之前', () => {
    const fn = goDailyBody()
    expect(fn, 'goDaily 缺重入判空').toContain('if (dailyPending.value) return')
    const guardAt = fn.indexOf('if (dailyPending.value) return')
    const setAt = fn.indexOf('dailyPending.value = true')
    const awaitAt = fn.indexOf('await todayChallengeAsync()')
    expect(awaitAt, 'goDaily 不再现算当日题了 —— 判据要跟着改').toBeGreaterThan(-1)
    expect(setAt, '置位没写').toBeGreaterThan(guardAt)
    /*
     * 这条是核心:置位若排在 await 之后,那 30~257ms 的窗口照样敞着,等于没修。
     * 实测故障注入:把置位挪到 await 之后,本条红。
     */
    expect(setAt, '置位必须在 await 之前 —— 排在后面等于窗口还开着').toBeLessThan(awaitAt)
  })

  it('给定 goDaily,则无论成败都复位', () => {
    const fn = goDailyBody()
    expect(fn, '没有 finally 复位:算不出题时按钮会永久卡在「推演中」').toContain('finally')
    expect(fn, 'finally 里没把标志复回 false').toMatch(/finally\s*\{[\s\S]*?dailyPending\.value = false/)
  })

  it('给定按钮,则在途时禁用并写出状态词', () => {
    expect(SRC, '按钮缺在途禁用').toContain(':disabled="dailyPending ||')
    // 状态词:与 ExpeditionPanel 的「窥探中」同族(在途事实,不是解释)
    expect(SRC, "在途时按钮应写「推演中」").toContain("'推演中'")
    // 它必须排在「今日已完成」之前:在途时那不是完成态,写成完成就是另一条事实
    const pendingAt = SRC.indexOf("dailyPending\n            ? '推演中'")
    const doneAt = SRC.indexOf("? '今日已完成'")
    expect(pendingAt, '找不到「推演中」那一支').toBeGreaterThan(-1)
    expect(doneAt, '找不到「今日已完成」那一支').toBeGreaterThan(-1)
    expect(pendingAt, '在途分支该排在完成态之前').toBeLessThan(doneAt)
  })

  it('给定 CSS 预算,则状态词不超过 UI 文案上限', () => {
    // 「推演中」3 字,远在 ≤8 字的普通状态词上限内 —— 这条防的是有人把它扩写成一句话
    expect('推演中'.length).toBeLessThanOrEqual(8)
  })
})
