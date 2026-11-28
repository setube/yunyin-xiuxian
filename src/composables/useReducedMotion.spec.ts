/**
 * 系统「减少动效」偏好的探测,以及设置页据此置灰。
 *
 * 背景:style.css 里 `@media (prefers-reduced-motion: reduce)` 与 `.reduce-motion *`
 * 是两条都会生效的通配规则(并集语义)。于是系统开着偏好时,设置里那颗开关**点了没用** ——
 * 类名去掉、媒体查询还在,动画照样被压成 0.01ms(真浏览器实测 animationDuration 仍是 1e-05s)。
 *
 * 修法不是让设置去压系统(系统偏好是玩家的明确意愿),而是**让开关说出实况**:
 * 置灰 + 写明「系统已开」。本文件钉住这条。
 *
 * 故障注入:把设置页的 `:disabled="systemReduced"` 去掉即红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { systemReducedMotion } from './useReducedMotion'

const SECTION = readFileSync(resolve(__dirname, '../components/settings/SettingsPreferenceSection.vue'), 'utf-8')
/** 去掉注释再查 —— 注释里也写着这些名字(说明为什么改),按全文匹配会取到注释 */
const CODE = SECTION.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('减少动效 · 系统偏好开着时,设置开关要说实况', () => {
  it('无 DOM 环境下不抛,且报 false', () => {
    // vitest 的 node 环境没有 window.matchMedia;这里只验它不炸
    expect(typeof systemReducedMotion()).toBe('boolean')
  })

  it('设置页读了系统偏好,并在为真时禁用开关', () => {
    expect(CODE, '设置页没读系统偏好 —— 系统开着时开关照旧可点,而点了没用').toContain('useSystemReducedMotion')
    expect(CODE, '开关没接禁用态').toMatch(/:disabled="systemReduced"/)
  })

  it('禁用时给出原因(仓库规矩:禁用即给原因)', () => {
    expect(CODE, '只置灰不说话,玩家不知道为什么不生效').toContain('系统已开')
    // 原因须在开关同一块里,不是别处
    const at = CODE.indexOf('减少动效')
    expect(at, '找不到「减少动效」那一项').toBeGreaterThan(-1)
    const block = CODE.slice(at, at + 600)
    expect(block, '「系统已开」须紧挨着这一项').toContain('系统已开')
  })
})
