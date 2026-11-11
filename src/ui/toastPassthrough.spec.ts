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

  /**
   * 拼接后的选择器必须真的能命中。
   *
   * 上一版把正文选择器写成 `${hostSel} [role=status] > div` ——
   * 而 `hostSel` 本身就是带 `role=status` 的那个容器,中间那个空格让它变成「后代」,
   * 于是永远匹配不到,脚本在第一个场景就超时。
   *
   * 字符串存在 ≠ 选择器有效。这条判据只查能机械判定的部分:
   * 正文选择器里 `hostSel` 与 `[role=status]` 之间不许有空格。
   *
   * 故障注入:把 `${hostSel}[role=status]` 改成 `${hostSel} [role=status]`,本条红。
   */
  it('正文选择器与 hostSel 之间不许有后代空格', () => {
    const line = /const bodySel = `\$\{hostSel\}([^`]*)`/.exec(SCRIPT)
    expect(line, '找不到正文选择器的拼接处').toBeTruthy()
    expect(line![1]!.startsWith('[role=status]'), 'hostSel 后应直接跟 [role=status],中间不许有空格').toBe(true)
  })

  it('关闭钮仍按 button 找 —— 它确实是唯一吃事件的元素', () => {
    // 这一处是对的,别被上一条误伤:点击关闭钮就该按 button 找
    expect(SCRIPT, '点关闭钮仍按 button 找').toMatch(/querySelectorAll\('\.pointer-events-none\.fixed button'\)\) b\.click\(\)/)
  })
})

/**
 * 量触控尺寸要用布局高度,不用 getBoundingClientRect。
 *
 * 提示条离场时带着 `transform: translateY(-6px) scale(0.96)`,而自检注入的
 * `transition:none` 让它立刻停在终态 —— 28px 的关闭钮于是量成 26.9px(28×0.96),
 * 报「可点元素过小」。那不是触控缺陷,是量到了动画中的缩放。
 *
 * `offsetHeight` 是布局高度,不受 transform 影响,量的才是这颗钮真实的命中尺寸。
 * 两处测量(巡页与弹窗巡逻)必须同尺,否则同一颗钮在两种场景下判得不一样。
 *
 * 故障注入:把任一处改回只读 getBoundingClientRect,本条红。
 */
describe('提示条 · 自检量的必须是布局尺寸', () => {
  const SCRIPT = readFileSync(resolve(__dirname, '../../scripts/layout-check.mjs'), 'utf-8')

  it('两处触控尺寸测量都取 offsetHeight', () => {
    const hits = SCRIPT.match(/const h = el\.offsetHeight \|\| rect\.height/g) ?? []
    expect(hits.length, '巡页与弹窗巡逻两处都要按布局高度量').toBe(2)
  })

  it('判据不再直接拿 getBoundingClientRect 的高度去比 28', () => {
    // 阴性对照:不该出现「rect.height >= 28」这种直接比法
    expect(SCRIPT, '不该再拿缩放后的 rect.height 直接比 28').not.toMatch(/rect?\.height >= 28/)
  })
})

/**
 * 离场时长只有一处事实源。
 *
 * `TOAST_ANIM_MS = 250`(组件)与 style.css 里 `.toast-slide-*-active` 的 `0.25s` 是两处手写,
 * 靠注释里一句「须与 CSS 对齐」约定着,没有任何判据。改一处忘了另一处,
 * 后果是元素提前被移除(动画截断,看着突然消失)或移除晚于动画(留一帧僵住的空位)。
 *
 * 判据:两边算出的毫秒数必须相等。
 */
describe('提示条 · 离场时长两处对齐', () => {
  const CSS = readFileSync(resolve(__dirname, '../style.css'), 'utf-8')

  it('组件里的 TOAST_ANIM_MS 等于 CSS 过渡时长', () => {
    const msMatch = /const TOAST_ANIM_MS = (\d+)/.exec(SRC)
    expect(msMatch, 'TOAST_ANIM_MS 不见了或不再是字面量').toBeTruthy()
    const ms = Number(msMatch![1])

    // 取 .toast-slide-enter-active / .toast-slide-leave-active 那条 transition 里的秒数
    const block = /\.toast-slide-enter-active,\s*\n?\.toast-slide-leave-active \{([\s\S]*?)\}/.exec(CSS)?.[1] ?? ''
    expect(block, '找不到 .toast-slide 的过渡块').not.toBe('')
    const sec = /opacity ([\d.]+)s/.exec(block)?.[1]
    expect(sec, '过渡块里读不到 opacity 的时长').toBeTruthy()

    expect(ms, `TOAST_ANIM_MS(${ms}ms) 与 CSS(${sec}s) 不一致 —— 动画会被截断或留空位`).toBe(Math.round(Number(sec) * 1000))
  })

  it('duration 是显式写死的,不交给自动探测', () => {
    // 稀有提示的 animate-glow-pulse 是 2.4s 无限动画,自动探测会把它当成离场时长
    expect(SRC, '不该去掉 :duration —— 自动探测会被无限动画带偏').toContain(':duration="TOAST_ANIM_MS"')
    expect(SRC, '稀有提示确实带无限动画,这条前提仍成立').toContain('animate-glow-pulse')
  })
})
