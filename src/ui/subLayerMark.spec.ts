/**
 * 小境界十档刻度:全作最核心的进度读数,原先只有两个字。
 *
 * 同样是「三层」,从一层走到三层与从七层退到三层不是一回事;
 * 「圆满」离大关只差一次突破 —— 这些都得自己拿两个字去比。
 *
 * 四条判据:
 *   一 十档就是十格,且「从一层起第一格就实心」—— 玩家已站在这一档,不是还没进去
 *   二 门槛与名字都取自 data/realms 与 data/constants,不另立
 *   三 坏值退回一层(形制是加成,判不出宁可不加)
 *   四 界面真的接上了,且只在修炼页 —— 顶栏宽度被寿元占住,见模块注释
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUB_NAMES } from '@/data/realms'
import { SUB_LEVELS } from '@/data/constants'
import { subLayerMark, subLayerPips } from './subLayerMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const VIEW = readFileSync(resolve(ROOT, 'src/views/CultivationView.vue'), 'utf-8')
const TOP_BAR = readFileSync(resolve(ROOT, 'src/components/common/TopStatusBar.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('小境界刻度 · 一、十档就是十格', () => {
  it('每一档的格数恒为 SUB_LEVELS,实心数随层序递增', () => {
    let prevOn = 0
    for (let sub = 0; sub < SUB_LEVELS; sub += 1) {
      const mark = subLayerMark(sub)
      const pips = subLayerPips(mark)
      expect(pips.length, `第 ${sub} 档的格数应等于 SUB_LEVELS`).toBe(SUB_LEVELS)
      const on = pips.filter(Boolean).length
      expect(on, `第 ${sub} 档的实心数应比上一档多一格`).toBeGreaterThan(prevOn)
      prevOn = on
    }
  })

  it('从一层起第一格就实心 —— 玩家已站在这一档,不是还没进去', () => {
    // 与 .realm-layer-pips(已过几层)刻意不同:那边从零开始,这边从一
    const first = subLayerPips(subLayerMark(0))
    expect(first[0], '一层时第一格该是实心').toBe(true)
    expect(first.filter(Boolean).length, '一层只有一格实心').toBe(1)
  })

  it('「圆满」是最末一档,整排实心且标出 complete', () => {
    const mark = subLayerMark(SUB_LEVELS - 1)
    expect(mark.complete).toBe(true)
    expect(mark.toComplete).toBe(0)
    expect(subLayerPips(mark).every(Boolean), '圆满时整排实心').toBe(true)
    // 倒数第二档还不算圆满
    expect(subLayerMark(SUB_LEVELS - 2).complete).toBe(false)
    expect(subLayerMark(SUB_LEVELS - 2).toComplete).toBe(1)
  })
})

describe('小境界刻度 · 二、门槛与名字不另立', () => {
  it('格数取自 SUB_LEVELS,档名取自 SUB_NAMES', () => {
    expect(subLayerMark(0).total).toBe(SUB_LEVELS)
    for (let sub = 0; sub < SUB_LEVELS; sub += 1) {
      expect(subLayerMark(sub).label, '档名应与 data/realms 一致').toBe(SUB_NAMES[sub])
    }
  })

  it('SUB_NAMES 的长度就是 SUB_LEVELS —— 两个数一旦分叉,刻度会多点或少点一格', () => {
    expect(SUB_NAMES.length).toBe(SUB_LEVELS)
  })
})

describe('小境界刻度 · 三、坏值不画错', () => {
  it('NaN / 负数退回一层;越界夹到末档', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      expect(subLayerMark(bad).index, `坏值 ${String(bad)} 应退回一层`).toBe(0)
    }
    expect(subLayerMark(999).index).toBe(SUB_LEVELS - 1)
    expect(subLayerMark(999).complete).toBe(true)
  })
})

describe('小境界刻度 · 四、界面接上了,且只在修炼页', () => {
  it('修炼页挂上刻度,读屏说法带档位', () => {
    expect(VIEW, '修炼页应渲染刻度').toContain('sub-layer-pips')
    expect(VIEW, '应读形制').toContain('subLayerPips(subMark)')
    expect(VIEW, '形制应取 player.sub').toContain('subLayerMark(player.sub)')
    expect(VIEW, '刻度应有读屏说法').toContain('aria-label')
    expect(VIEW, '圆满态应有单独类').toContain('sub-layer-pips--complete')
  })

  it('顶栏不挂 —— 320 宽下会把境界名压成省略号', () => {
    // 顶栏那一行已被寿元与「N 世」占住,layout-check 钉着不许折行
    expect(TOP_BAR, '顶栏不该塞十格刻度').not.toContain('sub-layer-pips')
  })

  it('样式存在、不吃指针事件,且圆满态换色', () => {
    const pips = block('.sub-layer-pips')
    expect(pips, '缺 .sub-layer-pips').not.toBe('')
    expect(pips, '刻度不该吃指针事件').toContain('pointer-events: none')
    expect(block('.sub-layer-pips i'), '缺格样式').not.toBe('')
    expect(block('.sub-layer-pips--complete i.on'), '圆满态应换色').toContain('cinnabar')
  })
})
