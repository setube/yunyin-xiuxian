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
    expect(VIEW, '按钮文案该读 pillBatchCount').toContain('连服 ×{{ pillBatchCount }}')
    expect(VIEW, '按钮文案里不该再出现写死的 min(5, ...)').not.toMatch(/连服 ×\{\{ Math\.min\(5/)
  })

  it('脚本把输入钳在 [1, 存量]:键盘可改成 0 / 负数 / 超量', () => {
    expect(VIEW, '该按存量钳上限').toMatch(/Math\.min\(owned, Math\.floor\(pillBatchCount\.value\)/)
    expect(VIEW, '该保证至少服 1 枚').toMatch(/Math\.max\(1, /)
  })

  it('换一种丹药时数量回到默认,不把上次的 500 带过去', () => {
    expect(VIEW, 'pillDetail 变化时该复位').toMatch(/watch\(pillDetail, \(\) => \{\s*\n\s*pillBatchCount\.value = 5/)
  })
})
