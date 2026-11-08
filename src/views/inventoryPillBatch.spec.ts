/**
 * 背包连服的数量可自定义,且被钳在 [1, 存量]。
 *
 * 原先这里写死 5:按钮永远「连服 ×5」,而洞府连升 / 灵脉连投 / 熔炉连凝都是
 * 「用尽手头可负担的量」—— 全站只有连服不遵循这一条。
 *
 * 吃丹不可逆,故不给「一键全部服下」,而是让玩家自己填:默认 5,可改到存量。
 * 判据钉三件事:输入框存在且带 max、按钮文案跟随输入、脚本侧对越界输入做钳制。
 * 故障注入:把 `pillBatchCount` 换回常量 5,或删掉 `Math.min(owned, ...)`,本条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const VIEW = readFileSync(resolve(__dirname, 'InventoryView.vue'), 'utf-8')

describe('背包连服 · 数量由玩家填', () => {
  it('丹药详情里有数量输入,上限是存量', () => {
    expect(VIEW, '找不到服用数量输入').toContain('aria-label="服用数量"')
    // 输入框的 max 必须绑到存量,不是另一个写死的数
    const input = /aria-label="服用数量"[\s\S]{0,40}?|v-model\.number="pillBatchCount"[\s\S]{0,600}?aria-label="服用数量"/.exec(VIEW)?.[0] ?? ''
    expect(VIEW).toMatch(/:max="currentPill\?\.count \?\? 1"/)
    void input
  })

  it('连服按钮文案跟随输入值,不再写死 5', () => {
    // 文案读的是钳制后的 pillBatchEffective(见下方「界面与行为同源」)
    expect(VIEW, '按钮文案该跟随数量').toMatch(/连服 ×\{\{ pillBatchEffective \}\}/)
    expect(VIEW, '按钮文案里不该再出现写死的 min(5, ...)').not.toMatch(/连服 ×\{\{ Math\.min\(5/)
  })

  it('脚本把输入钳在 [1, 存量]:键盘可改成 0 / 负数 / 超量', () => {
    // 钳制集中在 pillBatchEffective 一处,执行与文案共用
    expect(VIEW, '该按存量钳上限').toMatch(/Math\.min\(owned, Math\.floor\(pillBatchCount\.value\)/)
    expect(VIEW, '该保证至少服 1 枚').toMatch(/Math\.max\(1, /)
  })

  it('换一种丹药时数量回到默认,不把上次的 500 带过去', () => {
    expect(VIEW, 'pillDetail 变化时该复位').toMatch(/watch\(pillDetail, \(\) => \{\s*\n\s*pillBatchCount\.value = 5/)
  })
})

/**
 * 输入框高度不得低于全站 28px 触控下限。
 *
 * 首版写的是 `py-0.5`,浏览器实测盒高只有 23px —— 低于 layout-check 与 aria-check
 * 量的那条线。要连点的数字框尤其不能偏小。改成 `h-7`(=28px)后实测三档宽度都是 28。
 */
describe('连服数量输入 · 触控下限', () => {
  it('输入框带显式 28px 高度,不靠 padding 撑', () => {
    const input = /class="[^"]*"\s*\n?\s*aria-label="服用数量"/.exec(VIEW)?.[0] ?? ''
    const m = /v-model\.number="pillBatchCount"[\s\S]{0,400}?aria-label="服用数量"/.exec(VIEW)?.[0] ?? ''
    expect(m, '找不到数量输入框').toBeTruthy()
    expect(m, '输入框须用 h-7 给足 28px;py-0.5 实测只有 23px').toContain('h-7')
    void input
  })
})

/**
 * 界面说的与做的必须同源。
 *
 * 首版只在 `onUsePillBatch` 里钳数量,按钮文案直接挂 `pillBatchCount`:
 * 吃完一批后存量变少而输入框还留着旧值,按钮挂着「连服 ×50」而实际只吃 10 枚 ——
 * 正是 264d1278 修过的同一类毛病。现按钮文案与执行都读 `pillBatchEffective`。
 *
 * 判据钉两件事:按钮文案读钳制后的值、执行处不各算一次。
 * 故障注入:把按钮改回 `{{ pillBatchCount }}` 或让执行处重算,本条红。
 */
describe('连服 · 界面与行为同源', () => {
  it('按钮文案读钳制后的 pillBatchEffective,不直挂输入值', () => {
    expect(VIEW, '按钮文案该读 pillBatchEffective').toContain('连服 ×{{ pillBatchEffective }}')
    expect(VIEW, '按钮文案不许直挂未钳制的输入值').not.toContain('连服 ×{{ pillBatchCount }}')
  })

  it('执行处复用同一份钳制结果,不各算一次', () => {
    expect(VIEW, '执行处该直接用 pillBatchEffective').toMatch(/usePillBatch\(id, pillBatchEffective\.value\)/)
    // 执行处不该再自己写一遍 Math.min(owned, ...)
    const fn = /function onUsePillBatch[\s\S]{0,400}?\n  \}/.exec(VIEW)?.[0] ?? ''
    expect(fn, '找不到 onUsePillBatch').toBeTruthy()
    expect(fn, '执行处又各算一次钳制,会与文案分叉').not.toMatch(/Math\.min\(owned/)
  })

  it('存量变少时输入值被收回上限', () => {
    expect(VIEW, '缺少存量变化的 watch').toMatch(/watch\(\s*\n?\s*\(\) => inventory\.pills\[/)
  })
})
