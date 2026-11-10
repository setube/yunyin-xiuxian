/**
 * scripts/edge-states.mjs 的扫描口径(该脚本不在 CI 里跑,故用源码判据钉住)。
 *
 * 这里钉的每一条都是**已经踩过的坑**:
 *
 *  一 **扫整页,不扫 `main`**。寿元/灵石那几格在顶栏,不在 `main` 里 ——
 *    而 `1.7976931348623157e+308/1.013京 载` 正是只在顶栏露出来的形态。
 *
 *  二 **五类坏值,不只是 NaN/Infinity/undefined**。`Number.isFinite` 挡不住
 *    有限的超范围值:`age: MAX_VALUE`、`lastAt: 8640000000000001` 都过得了守卫,
 *    之后分别印成 `1.7976931348623157e+308` / 英文 `Invalid Date` / `NaN月NaN日`。
 *
 *  三 **夹具要给「有限巨值」**。原先这一档灌的是 `age = NaN` —— 那是被 `isFinite`
 *    挡下的那一类,于是新加的正则永远没有输入可抓(实测:只拆掉 age 上界、其余不动,
 *    旧夹具下仍然全绿;换成 MAX_VALUE 后立刻 18 个路由全红)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../../scripts/edge-states.mjs'), 'utf-8')

/** 取「单字段畸形走遍主路由」那一档的源码片段,后面几条判据都在它上面看 */
const SCENE_START = SRC.indexOf("name: '单字段畸形走遍主路由'")
const SCENE = SRC.slice(SCENE_START, SRC.indexOf('\n  }\n]', SCENE_START))

describe('edge-states · 坏值扫描的口径', () => {
  it('这一档还在,且夹得住(锚点没漂)', () => {
    expect(SCENE_START, '找不到「单字段畸形走遍主路由」这一档').toBeGreaterThan(-1)
    expect(SCENE.length, '切片太短,判据会空转').toBeGreaterThan(500)
  })

  it('扫整页而不只是 main —— 顶栏那几格不在 main 里', () => {
    expect(SCENE, '又退回只扫 main 了,顶栏的坏值会漏').not.toContain("querySelector('main')")
    expect(SCENE, '该扫整页').toContain('document.body')
  })

  it('正则盖住五类坏值,科学计数两种写法都要有', () => {
    // 科学计数的两种形态:裸插值 `1e+300` / `1.797…e+308`,formatGN 兜底 `1.80e308`
    expect(SCENE, '没扫科学计数').toMatch(/\[0-9\]e\\\+\?\[0-9\]\{2,\}/)
    expect(SCENE, '没扫英文 Invalid Date').toContain('Invalid Date')
    expect(SCENE, '没扫 [object Object]').toContain('object Object')
    expect(SCENE, '没扫 NaN').toContain('NaN')
    expect(SCENE, '没扫 Infinity').toContain('Infinity')
    expect(SCENE, '没扫 undefined').toContain('undefined')
  })

  it('夹具灌的是「有限巨值」,不是 NaN —— 后者过不了守卫,抓不到新缺陷', () => {
    expect(SCENE, 'age 又灌回 NaN 了:NaN 走的是另一条修复分支').toContain('s.player.age = Number.MAX_VALUE')
    expect(SCENE, '时间戳夹具该用超范围值').toContain('8_640_000_000_000_001')
    expect(SCENE, '寿元加算项也要灌巨值').toContain('lifespanBonusYears = Number.MAX_VALUE')
  })
})
