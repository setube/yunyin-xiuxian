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
