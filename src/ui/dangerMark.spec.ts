/**
 * 地界危险度点阵:每处地界带 danger 1~5,而界面上只写成两个字。
 *
 * 「凶险」与「大凶」差多少,得先记住五个词的次序 —— 而它本来就是一个可数的量。
 * 本页另有同一种可数量的先例:本世地界页把事件密度画成一排点,危险度沿用同一套。
 *
 * 四条判据:
 *   一 档位 1~5 一一对应,五格恒满,实心数等于档位
 *   二 档名取自 data/regions 的 DANGER_NAMES,不另立
 *   三 坏值按最低档(宁可不加,不把一处地界画成绝地)
 *   四 界面接上了,且在脚本里算一次、模板不反复调
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DANGER_NAMES } from '@/data/regions'
import { DANGER_MAX, dangerMark, dangerPips } from './dangerMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const CARD = readFileSync(resolve(ROOT, 'src/components/adventure/RegionCard.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('危险度 · 一、档位与格数一一对应', () => {
  it('五档各自实心数等于档位,格数恒为 DANGER_MAX', () => {
    for (let level = 1; level <= DANGER_MAX; level += 1) {
      const mark = dangerMark(level)
      const pips = dangerPips(mark)
      expect(mark.level, `第 ${level} 档应原样读出`).toBe(level)
      expect(pips.length, '格数应恒为满格数').toBe(DANGER_MAX)
      expect(pips.filter(Boolean).length, `第 ${level} 档应亮 ${level} 格`).toBe(level)
    }
  })

  it('最高两档标 severe —— 转朱的那一档', () => {
    expect([1, 2, 3].map(d => dangerMark(d).severe)).toEqual([false, false, false])
    expect([4, 5].map(d => dangerMark(d).severe)).toEqual([true, true])
  })
})

describe('危险度 · 二、档名取自数据表', () => {
  it('与 DANGER_NAMES 逐项一致,不另抄一张表', () => {
    for (let level = 1; level <= DANGER_MAX; level += 1) {
      expect(dangerMark(level).name).toBe(DANGER_NAMES[level])
    }
    // DANGER_NAMES 的第 0 项是空串(1 起编号),刻度不该读它
    expect(DANGER_NAMES[0]).toBe('')
  })

  it('满格数与名字表的长度对得上 —— 分叉了会多点或少点一格', () => {
    expect(DANGER_MAX).toBe(DANGER_NAMES.length - 1)
  })
})

describe('危险度 · 三、坏值不画错', () => {
  it('NaN / undefined / 0 / 负数一律按最低档', () => {
    for (const bad of [Number.NaN, undefined, 0, -3]) {
      expect(dangerMark(bad).level, `${String(bad)} 应按最低档`).toBe(1)
      expect(dangerMark(bad).severe, '坏值不该被画成绝地').toBe(false)
    }
  })

  it('越界夹到最高档', () => {
    expect(dangerMark(99).level).toBe(DANGER_MAX)
    expect(dangerMark(99).severe).toBe(true)
  })
})

describe('危险度 · 四、界面接上了', () => {
  it('地界卡挂点阵,读屏说法带档位', () => {
    expect(CARD, '地界卡应渲染点阵').toContain('danger-pips')
    expect(CARD, '点阵应读形制').toContain('dangerPips(danger)')
    expect(CARD, '读屏说法应带档位').toContain('danger.label')
  })

  it('形制在脚本里算一次,模板不反复调 —— 与功法层数同一条约束', () => {
    const tpl = CARD.slice(0, CARD.indexOf('<script'))
    expect(tpl, '模板里反复调 dangerMark,既慢又难读').not.toContain('dangerMark(')
    expect(CARD, '应在脚本里算一次').toContain('computed(() => dangerMark(')
  })

  it('档名与判据都来自形制,模板不再直读 DANGER_NAMES', () => {
    // 直读表就绕过了「夹档 + 坏值兜底」,坏档会把 undefined 印上界面
    expect(CARD, '模板不该直读 DANGER_NAMES').not.toContain('DANGER_NAMES')
  })

  it('样式存在、不吃指针事件,且最高档换色', () => {
    expect(block('.danger-pips'), '缺 .danger-pips').not.toBe('')
    expect(block('.danger-pips'), '点阵不该吃指针事件').toContain('pointer-events: none')
    expect(block('.danger-pips--severe i.on'), '最高档应转朱').toContain('cinnabar')
  })
})
