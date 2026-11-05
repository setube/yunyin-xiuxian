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

/**
 * 自检脚本采集 toast 的选择器必须跟着宿主结构走。
 *
 * `scripts/layout-check.mjs` 曾用 `.pointer-events-none.fixed button` 取提示文本,
 * 那时条身还是可点的。11-03 把条身改成 `pointer-events-none`(只有关闭钮吃事件)之后,
 * `button` 里只剩一个「×」—— 脚本从此永远读不到提示内容,
 * 于是十来个场景全线报「没有交代」,而脚本不在 CI 里,一直没人发现。
 *
 * 这条判据把两边钉在一起:宿主用 `role=status` 作容器、提示条是它的直接 div,
 * 脚本就必须按同一结构取。宿主改了结构而脚本没跟,这里直接红。
 *
 * 故障注入:把脚本里的选择器改回 `button`,本条红。
 */
describe('提示条 · 自检脚本的选择器与宿主结构一致', () => {
  const SCRIPT = readFileSync(resolve(__dirname, '../../scripts/layout-check.mjs'), 'utf-8')

  it('宿主确实是 role=status 作容器、提示条是直接 div 子元素', () => {
    expect(SRC, '宿主容器应带 role=status').toContain('role="status"')
    // 提示条本体:紧跟 TransitionGroup 之后的那个 div
    expect(SRC, '提示条应是宿主下的 div,正文写在里面').toMatch(/v-for="t in ui\.toasts"[\s\S]{0,400}?\{\{\s*t\.text\s*\}\}/)
  })

  it('脚本按同一结构取正文,而不是取 button 的文字', () => {
    expect(SCRIPT, '脚本应读 role=status 下的 div').toContain("[role=status] > div")
    // 阴性对照:采集处不该再用「宿主的 button」当正文来源
    expect(SCRIPT, '不该再拿 button 的文字当提示正文').not.toMatch(
      /querySelectorAll\('\.pointer-events-none\.fixed button'\)\]\.map\(b => \(b\.textContent/,
    )
  })

  it('关闭钮仍按 button 找 —— 它确实是唯一吃事件的元素', () => {
    // 这一处是对的,别被上一条误伤:点击关闭钮就该按 button 找
    expect(SCRIPT, '点关闭钮仍按 button 找').toMatch(/querySelectorAll\('\.pointer-events-none\.fixed button'\)\) b\.click\(\)/)
  })
})
