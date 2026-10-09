import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { heldHerbGrades, herbStashText } from './herbText'

describe('herbText · 逐品灵草存量口径', () => {
  it('heldHerbGrades 只列持有>0 的品,顺 HERB_GRADES 品序,带短名', () => {
    const viewed = new Set<number>()
    const herbOf = (g: number) => {
      viewed.add(g)
      return { 1: 40, 2: 0, 3: 8, 4: 0, 5: 1 }[g]!
    }
    const held = heldHerbGrades(herbOf)
    expect(held.map(h => `${h.name}:${h.count}`)).toEqual(['凡品:40', '仙品:8', '道品:1'])
    // 五品要被询问过(不只看前几格) —— 别漏了后几品
    expect([...viewed].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('herbStashText 逐品拼「品×数」,count 走传入的 fmt;全空则「无」', () => {
    const fmt = (n: number) => `${n}株`
    expect(herbStashText(g => ({ 1: 2, 2: 0, 3: 0, 4: 0, 5: 5 })[g]!, fmt)).toBe('凡品×2株 · 道品×5株')
    expect(herbStashText(() => 0, fmt)).toBe('无')
  })
})

describe('开炉炼丹面不再报跨品之和', () => {
  // 用户反馈的正是「炼丹页顶部显示一个跨品总和的灵草数,对不上逐品库存」。
  // 这两处从此只逐品陈列(herbStash / 当前品),一旦被拉回 resources.herb(五品之和)立即红。
  const view = readFileSync(resolve(__dirname, '../views/InventoryView.vue'), 'utf8')
  const pillCraftingSurfaces = () => {
    // 入口卡与弹窗头两处 —— 只取「灵草 xx」字眼所在的那几行,别把方子成本行(本就带品名)算进来
    return view
      .split('\n')
      .filter(l => /灵草/.test(l))
      .join('\n')
  }

  it('入口卡与弹窗头不再引用跨品总和 resources.herb', () => {
    const surfaces = pillCraftingSurfaces()
    expect(surfaces, '灵草总量被拉回五品之和').not.toMatch(/resources\.herb\b/)
    expect(surfaces, '应逐品陈列').toContain('herbStash')
    expect(surfaces, '入口卡应读当前品').toContain('HERB_GRADE_SHORT[herbGrade]')
  })
})
