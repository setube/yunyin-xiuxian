/**
 * 提示条不该成为一层看不见的遮罩。
 *
 * 它浮在 `top-12`,最多叠五条约 260px。整条 `pointer-events-auto` 时,
 * 覆盖区里任何一个按钮都点不动 —— 实测 `/inventory` 有 12 个可点元素被压住,
 * 每个 2.6 秒(稀有 4.2 秒)。
 *
 * 现在的分工:条身 `pointer-events-none`(穿透),只有右侧关闭钮吃事件。
 * 真实 DOM 实测过:条身中心点 `elementsFromPoint` 命中的是它**下面**那颗按钮。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../components/common/ToastHost.vue'), 'utf-8')

describe('提示条 · 穿透', () => {
  it('条身不吃事件', () => {
    const body = /class="pointer-events-none[^"]*max-w-90[^"]*"/.exec(SRC)
    expect(body, '提示条本体不再是 pointer-events-none —— 它又变成一层遮罩了').toBeTruthy()
  })

  it('关闭钮吃事件,且是唯一的', () => {
    const auto = SRC.match(/pointer-events-auto/g) ?? []
    expect(auto, '吃事件的元素应该只有关闭钮一个').toHaveLength(1)
    expect(SRC, '关闭钮没挂 pointer-events-auto:条身穿透后它就点不到了').toMatch(
      /pointer-events-auto[^"]*"[\s\S]{0,200}?aria-label="关闭提示"/,
    )
  })

  it('关闭钮不低于触控下限,且不进 Tab 序', () => {
    // 28px 是 layout-check 的触控下限
    expect(SRC, '关闭钮的尺寸没守住 28px').toMatch(/h-7 w-7/)
    expect(SRC, '关闭钮进了 Tab 序:键盘焦点会落到一条即将消失的元素上').toMatch(/tabindex="-1"/)
  })

  it('关闭钮有一个能念出来的名字', () => {
    expect(SRC).toContain('aria-label="关闭提示"')
  })
})
