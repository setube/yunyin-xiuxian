/**
 * scripts/focus-check.mjs 的「键盘可达性」那一段(该脚本不在 CI 里跑,故用源码判据钉住)。
 *
 * 这一段是后加的:此前它只验「切页后焦点落在哪」与「弹窗内焦点不逃逸」,
 * **不验「能不能 Tab 到」** —— 真有 17 个可点元素 Tab 不到,一查全是
 * `role="tab"` 的 roving tabindex(整个 tablist 只留一个 tabindex=0,靠左右键走)。
 *
 * 所以这里要钉两件事:
 *  一 判据确实在扫 `button / a[href] / [role=button]` 三类,不是漏扫;
 *  二 **规矩的 roving 必须被排除**,否则报的全是假阳性 —— 而排除条件写错
 *     (比如只认 `role=tablist` 不认同组里那个 tabindex=0),就会把真正的缺陷一起漏掉。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../../scripts/focus-check.mjs'), 'utf-8')

/** 取「键盘可达性」那一块的源码 */
const START = SRC.indexOf('键盘可达性')
const BLOCK = START < 0 ? '' : SRC.slice(START, SRC.indexOf('\n  }\n', START))

describe('focus-check · 键盘可达性', () => {
  it('这一段还在,且夹得住(锚点没漂)', () => {
    expect(START, '找不到「键盘可达性」那一段').toBeGreaterThan(-1)
    expect(BLOCK.length, '切片太短,判据会空转').toBeGreaterThan(400)
  })

  it('扫三类可点元素,不只扫 button', () => {
    expect(BLOCK, '该扫 button').toContain('button')
    expect(BLOCK, '该扫带 href 的 a').toContain('a[href]')
    expect(BLOCK, '该扫 role=button').toContain('[role=button]')
  })

  it('排除规矩的 roving tabindex —— 缺这条会满屏假阳性', () => {
    // 条件一:在 role=tablist 里且自己是 role=tab
    expect(BLOCK, '该认 role=tablist 里的 role=tab').toContain("closest('[role=tablist]')")
    expect(BLOCK, '该认 role=tab 本身').toContain("getAttribute('role') === 'tab'")
    // 条件二:同组里另有一个 tabindex=0 的兄弟,说明整组留了入口
    expect(BLOCK, '该认同组的 tabindex=0 才算规矩 roving').toContain(':scope > [tabindex="0"]')
    // 两条同时成立才豁免
    expect(BLOCK, '豁免须同时满足两条').toContain('inTablist && hasRoving')
  })

  it('跳过禁用与不可见,否则报的是噪音', () => {
    expect(BLOCK, '该跳过 disabled').toContain('el.disabled')
    expect(BLOCK, '该跳过不可见(offsetParent 为空)').toContain('el.offsetParent === null')
  })

  it('覆盖全部主路由,不是只挑几页', () => {
    const routes = BLOCK.match(/'\/[a-z]*'/g) ?? []
    expect(routes.length, `只覆盖了 ${routes.length} 个路由,该是全部主路由`).toBeGreaterThanOrEqual(17)
  })
})

/**
 * 首启那两页的键盘判据(`/welcome` 与 `/create`)。
 *
 * 它们**不能进上面那份 17 页清单**:那份清单铺了 lateSlices,而路由守卫
 * `if (game.started) return { name: 'home' }` 会把带存档的访问弹回首页 ——
 * 两页从来不在清单里,可点元素也从未验过能不能 Tab 到。
 * 且 `edge-states` 虽能进这两页,它只验状态解释与触控尺寸,不验键盘。
 *
 * 这里钉四件事(每一条都对应一种会静默失效的写法):
 *  一 用**新上下文**、不注入存档(注入了就落到首页,整段白跑);
 *  二 等够 3500ms —— 传送动画 `enterTimer` 是 2500ms,等短了会停在 /welcome
 *    而「建号页 Tab 到不了」那一行根本不会执行;
 *  三 欢迎页的 Tab 首落点必须是同意勾选(不是底部的「开始游戏」);
 *  四 按下空格后勾选真的变了 —— 只验 tabIndex 不验行为,勾选逻辑坏了照样绿。
 */
describe('focus-check · 首启两页的键盘可达性', () => {
  const AUTO_AT = SRC.indexOf('首启的两页:**必须是没存档的上下文**')
  const BLOCK = AUTO_AT >= 0 ? SRC.slice(AUTO_AT, AUTO_AT + 6000) : ''

  it('那一段存在', () => {
    expect(AUTO_AT, '找不到首启两页那一段 —— 判据要跟着改名').toBeGreaterThan(-1)
  })

  it('用新上下文且不注入存档', () => {
    expect(BLOCK, '该新开一个上下文').toMatch(/browser\.newContext\(/)
    expect(BLOCK, '这一段里不该 seedSave —— 注入了就落到首页').not.toContain('seedSave(')
    expect(BLOCK, '该进 /welcome').toContain("#/welcome")
  })

  it('等够传送动画', () => {
    const waits = [...BLOCK.matchAll(/waitForTimeout\((\d+)\)/g)].map(m => Number(m[1]))
    expect(waits.some(w => w >= 3500), `最长只等了 ${Math.max(...waits, 0)}ms,不够跨过 2500ms 的传送动画`).toBe(true)
  })

  it('验的不只是 tabIndex,还有「空格能勾上」这个行为', () => {
    expect(BLOCK, '该验 Tab 首落点').toContain("'checkbox'")
    expect(BLOCK, '该按空格').toMatch(/keyboard\.press\('Space'\)/)
    expect(BLOCK, '该回读勾选状态').toContain('.checked')
    expect(BLOCK, '勾不上该报失败').toMatch(/勾不上同意/)
  })

  it('两页都要查,且建号页落位失败要报出来', () => {
    expect(BLOCK, '没查 /welcome 的可点元素').toContain('/welcome 可点元素')
    expect(BLOCK, '没查 /create 的可点元素').toContain('/create 可点元素')
    expect(BLOCK, '没验落位到 #/create').toContain("'#/create'")
  })
})


/**
 * 扫描面必须包含表单控件。
 *
 * 原先只扫 `button, a[href], [role=button]` —— 设置页那四个 checkbox
 * 不在其中,而它们真能 Tab 到、也能用空格切。判据扫不到它们,
 * 「能不能到」这个问题在那四个控件上就从未被问过。
 *
 * 实测(后期档 17 页):只有 /settings 的四个 checkbox 落在扫描面之外,
 * 其余页面没有可聚焦但漏扫的元素。
 */
describe('focus-check · 扫描面含表单控件', () => {
  const at = SRC.indexOf('const ROUTES = [')
  const block = SRC.slice(at, at + 6000)

  it('选择器含 input / select / textarea', () => {
    expect(block, '又漏了表单控件 —— 设置页那四个 checkbox 会落到扫描面外').toContain('input:not([type=hidden])')
    expect(block, '该含 select').toContain('select')
    expect(block, '该含 textarea').toContain('textarea')
  })

  it('仍保留原有的三类', () => {
    for (const sel of ['button', 'a[href]', '[role=button]']) {
      expect(block, `扫描面丢了 ${sel}`).toContain(sel)
    }
  })

  it('隐藏输入不算(取不到的看不见,报出来是噪音)', () => {
    expect(block, '该排除 type=hidden').toContain(':not([type=hidden])')
  })
})
