/**
 * 法球进度环:周长只有一份、坏值不许画成满环。
 *
 * 这一环此前有两处独立缺陷,都不报错、只是画错:
 *
 * 一 **坏值画成满环**。读数原先是 `CIRCUMFERENCE * (1 - Math.min(1, props.progress))`
 *    —— `Math.min(1, NaN)` 仍是 NaN(AGENTS.md 记过这一类,ProgressBar 上一轮刚修过同款),
 *    拼出来是 `stroke-dashoffset: NaN`。真浏览器实测:这是 CSS **语法不合法**的值,
 *    整条声明被丢弃 —— 首帧就有时等于没写 → 元素按 dasharray 的默认偏移画成**满圈**;
 *    运行中才赋值时元素**保持上一个读数**。
 *    两种都不对:修为才一两成,那圈却画满了。
 *
 * 二 **周长写在两个地方**。TS 侧 `2 * Math.PI * 54` 与 CSS 侧 `stroke-dasharray: 339.292`
 *    是同一个数的手写副本。改半径只改一处,环就停在半圈上 —— 不报错,只是画错。
 *
 * 判据落在纯函数上(能真跑),再加上一条源码级的一致性检查(数值只能有一处)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ORB_PROGRESS_CIRCUMFERENCE,
  ORB_PROGRESS_RADIUS,
  orbDashOffset
} from './orbForm'

const ROOT = resolve(__dirname, '../..')
const ORB = readFileSync(resolve(ROOT, 'src/components/common/CultivationOrb.vue'), 'utf-8')

describe('法球进度环 · 一、坏值按空环画', () => {
  it('非有限读数不画满圈,给整周长(即一圈不画)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const v = orbDashOffset(bad)
      expect(Number.isFinite(v), `progress=${bad} 算出了非有限偏移`).toBe(true)
      expect(v, `progress=${bad} 画成了满圈`).toBe(ORB_PROGRESS_CIRCUMFERENCE)
    }
  })

  it('越界读数钳在 0~1,负进度不倒着画', () => {
    expect(orbDashOffset(-3)).toBe(ORB_PROGRESS_CIRCUMFERENCE)
    expect(orbDashOffset(9)).toBe(0)
  })

  it('正常读数线性对应:0 满圈偏移、1 不偏移', () => {
    expect(orbDashOffset(0), '进度 0 该画空环').toBeCloseTo(ORB_PROGRESS_CIRCUMFERENCE, 6)
    expect(orbDashOffset(1), '进度满该画满环').toBeCloseTo(0, 6)
    expect(orbDashOffset(0.25), '四分之一该空掉四分之三').toBeCloseTo(ORB_PROGRESS_CIRCUMFERENCE * 0.75, 6)
  })

  it('抓得住:旧写法 `Math.min(1, x)` 在 NaN 上不给有限值', () => {
    // 阴性对照 —— 把这条算式当成「已经被钳制过了」正是缺陷的来路
    const old = ORB_PROGRESS_CIRCUMFERENCE * (1 - Math.min(1, Number.NaN))
    expect(Number.isFinite(old), '旧写法本该算出非有限值,判据的前提变了').toBe(false)
  })
})

describe('法球进度环 · 二、周长只有一份', () => {
  it('周长由 ui/orbForm 的半径算出来,不是组件里的字面量', () => {
    expect(ORB_PROGRESS_RADIUS).toBe(54)
    expect(ORB_PROGRESS_CIRCUMFERENCE).toBeCloseTo(2 * Math.PI * 54, 9)
  })

  it('CSS 的 stroke-dasharray 与 TS 的周长是同一个数', () => {
    const m = /stroke-dasharray:\s*([\d.]+)/.exec(ORB)
    expect(m, '组件里找不到 stroke-dasharray').not.toBeNull()
    expect(Number(m![1]), 'CSS 与 TS 的周长对不上 —— 环会停在半圈上').toBeCloseTo(
      ORB_PROGRESS_CIRCUMFERENCE,
      2
    )
  })

  it('半径与圆心在模板里取常量,不再各写一份 r="54" cx="60"', () => {
    // 半径写死两处(CSS 的 dasharray 与模板的 r)时,改半径就是改一半
    expect(ORB, '模板里的半径该取 ORB_PROGRESS_RADIUS').toContain(':r="ORB_PROGRESS_RADIUS"')
    expect(ORB, '模板不该再写死 r="54"').not.toContain('r="54"')
    expect(ORB, '组件不该再自己算一遍周长').not.toContain('2 * Math.PI * 54')
  })
})
