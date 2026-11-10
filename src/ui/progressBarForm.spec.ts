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

  /**
   * 修行志的两处进度也接上了条。
   *
   * 誓愿是本世的核心目标,修行节点是本世的里程碑 —— 两处此前都只有「(已 / 需)」的读数,
   * 「走到哪了」要自己拿两个数相除。同一页的其他地方(成就分组/类目)早就有条了。
   * 故障注入:删掉任一处的 ProgressBar,本条红。
   */
  it('修行志的誓愿与修行节点都有条', () => {
    const view = readFileSync(resolve(ROOT, 'src/views/LegacyView.vue'), 'utf-8')
    expect(view, '誓愿应有一条').toContain(':value="vowProg.cur / vowProg.need"')
    expect(view, '修行节点应有一条').toContain('endgame.milestones.length / MILESTONE_DEFS.length')
    expect(view, '两处都走同一个组件').toMatch(/import ProgressBar from '@\/components\/common\/ProgressBar\.vue'/)
    // 阴性对照:誓愿那块不许自己拼一根 div 当条(道途占比条是另一回事,它是横比,不是进度)
    const vowBlock = view.slice(view.indexOf('vowTheme'), view.indexOf('本世未立题'))
    expect(vowBlock, '誓愿不该绕过 ProgressBar 自己画条').not.toContain('bar-fill')
  })

  /**
   * 洞府的营造进度也接上了条。
   *
   * 洞府是全游戏唯一「从零建到八」的地方,而标题旁只给「已启 N/8」两个数。
   * 这份长期目标此前在页面上没有任何位置感。
   * 故障注入:删掉那条 ProgressBar,本条红。
   */
  it('洞府的营造进度有条', () => {
    const view = readFileSync(resolve(ROOT, 'src/views/DongfuView.vue'), 'utf-8')
    expect(view, '营造应有一条').toContain('builtCount / BUILDINGS.length')
    expect(view, '走同一个组件').toMatch(/import ProgressBar from '@\/components\/common\/ProgressBar\.vue'/)
  })

  /**
   * 单条成就的进度也要有条。
   *
   * 同一页里,成就分组与收藏类目都有条,唯独单条成就只写「已 3 / 目标 10」——
   * 而这三处回答的是同一个问题(「走到哪了」),不该只有一处要玩家自己算比例。
   * 条与读数同处一行:条说走到哪,数字说还差几次。
   * 故障注入:删掉那行 ProgressBar,本条红。
   */
  it('单条成就的进度接上了条,与分组/类目同一套组件', () => {
    const view = readFileSync(resolve(ROOT, 'src/views/CollectionView.vue'), 'utf-8')
    expect(view, '单条成就该有条').toContain(':value="row.progress.current / row.progress.target"')
    expect(view, '读数仍要留着 —— 条只说走到哪,数字说还差几次').toContain('已 {{ row.progress.current }} / {{ row.progress.target }}')
    // 阴性对照:不许在成就行里自己拼一根 div 当条
    expect(view, '不该绕过 ProgressBar 自己画条').not.toMatch(/row\.progress[^\n]*<div[^>]*bar-fill/)
  })
})

describe('进度条 · 三、样式与组件同源', () => {
  it('ProgressBar 用的是 track-ink / bar-fill 这一对,不另立一套类名', () => {
    expect(BAR).toContain('track-ink')
    expect(BAR).toContain('bar-fill')
  })
})

describe('进度条 · 四、坏值不许把槽画满', () => {
  /**
   * `Math.max(0, Math.min(1, NaN))` 仍是 NaN(AGENTS.md 记过这一类,音频与成功率都踩过)。
   * 拼出来的是 `width: NaN%` —— 一个 CSS **语法不合法**的值,整条声明被丢弃。
   *
   * 真浏览器实测(300px 的槽)两种情形:
   *   · 首帧就在(NaN% 走 HTML 解析 / Vue 首次 patch 内联 style)→ 等于没写 → `width: auto`
   *     → 画出 **300px**,把槽画满;而 `width:0%` 画 0px。
   *   · 运行中才赋值 → 声明被丢弃 → 元素**保持上一个值**(实测 90px 赋值后仍是 90px)。
   *
   * 本组件每次重渲染都会 patch 内联 style,两种情形都可能撞上;共同点是**不报错、也不是 0**。
   */
  it('width 计算先过 Number.isFinite,坏值按 0 画', () => {
    expect(BAR, 'ProgressBar 的 width 要挡住坏值').toContain('Number.isFinite(props.value)')
    expect(BAR, '坏值该画成 0%,不是 NaN%').toContain("return '0%'")
  })

  it('判据抓得住:把 isFinite 去掉即红', () => {
    // 阴性对照:旧写法(裸 max/min 钳制)不该再出现在 width 计算里
    expect(BAR, 'width 仍是「钳制后直接拼百分数」的老写法').not.toMatch(
      /const width = computed\(\(\) => `\$\{Math\.max\(0, Math\.min\(1, props\.value\)\) \* 100\}%`\)/
    )
  })

  it('NaN 拼出来的是不合法的 CSS 值,不能指望它画成 0', () => {
    // 只钉住「这是要被挡在门外的那个串」:NaN% 会被浏览器丢弃,不是 0%
    const illegal = `${Math.max(0, Math.min(1, Number.NaN)) * 100}%`
    expect(illegal, '这是要被挡在门外的那个串').toBe('NaN%')
    expect(illegal, '它显然不是 0%').not.toBe('0%')
  })
})
