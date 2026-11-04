/**
 * 进度条的三条形制不变式。
 *
 * 两处实测过的塌陷,都是「条形在、填充不在」:
 *   一 `.bar-fill` 写成 <span> 而漏了 block —— 行内元素不吃宽高百分比,
 *      整条塌成 0×0。BuildView 的「本世对局」七根胜率条就这样全是空槽。
 *   二 调用方传进来的 class(pb-1.5)落到槽体上 —— padding-bottom 与内联 height 相叠,
 *      槽被撑到 6px、内条仍按父高算,组内细条于是填充高度 0。
 *
 * 判据:
 *   一 .bar-fill 自证是块级,不靠调用方的标签碰运气。
 *   二 ProgressBar 把 $attrs 接到外壳,槽体只负责画 —— 外距压不进槽高。
 *   三 槽体高度只由 height 决定,不留给 padding 掺和。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const BAR = readFileSync(resolve(ROOT, 'src/components/common/ProgressBar.vue'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('进度条 · 一、填充自证块级', () => {
  it('.bar-fill 显式 display: block —— 写成 span 也不会塌成 0×0', () => {
    expect(block('.bar-fill')).toContain('display: block')
  })

  it('填充吃满槽高,不另给自己定高', () => {
    const bar = block('.bar-fill')
    expect(bar, '填充高应取父槽的百分比').toContain('height: 100%')
    // 自己定死 px 会与槽高脱钩;真正的 px 高由 ProgressBar 的 height 参数给槽
    expect(bar, '填充不许自定 px 高').not.toMatch(/height:\s*\d+px/)
  })

  it('槽体裁边 —— 填充圆角与溢出不外溢', () => {
    expect(block('.track-ink')).toContain('overflow: hidden')
  })
})

describe('进度条 · 二、$attrs 落到外壳', () => {
  it('ProgressBar 显式 v-bind="$attrs" 到外壳,不靠隐式继承压在槽体上', () => {
    expect(BAR, '要把 $attrs 接到外壳').toMatch(/<div v-bind="\$attrs">/)
  })

  it('外壳在槽体之外 —— 外距与槽高不再相叠', () => {
    const outer = BAR.indexOf('v-bind="$attrs"')
    const track = BAR.indexOf('class="track-ink')
    expect(outer, '找不到外壳').toBeGreaterThan(-1)
    expect(track, '找不到槽体').toBeGreaterThan(outer)
  })

  it('槽体的高度只由 height 参数给,模板里不另加 padding 类', () => {
    const trackLine = BAR.slice(BAR.indexOf('class="track-ink'), BAR.indexOf('<div class="bar-fill"'))
    expect(trackLine, '槽体上不许再挂外距/内边距类').not.toMatch(/class="[^"]*\bp[xy]?-/)
    expect(trackLine, '槽高只由 height 决定').toContain('height: `${props.height}px`')
  })

  it('实际调用方仍按老写法传外距类 —— 那正是回归入口', () => {
    const view = readFileSync(resolve(ROOT, 'src/views/CollectionView.vue'), 'utf-8')
    expect(view, '组内细条的外距仍在调用方给').toContain('class="pb-1.5"')
  })
})

describe('进度条 · 三、样式与组件同源', () => {
  it('ProgressBar 用的是 track-ink / bar-fill 这一对,不另立一套类名', () => {
    expect(BAR).toContain('track-ink')
    expect(BAR).toContain('bar-fill')
  })
})
