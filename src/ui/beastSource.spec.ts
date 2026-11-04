/**
 * 灵兽加成的来源拆解。
 *
 * 灵兽卡上只写它现在加多少,而那是两步放大出来的:
 *   ① 灵兽园等级:`1 + 等级 × BEAST_EFFECT_PER_LEVEL`
 *   ② 安抚灵兽的 buff(`beastPct`)
 * 玩家看到「+12%」时看不出十二个点里有多少是园子给的 ——
 * 而这两样一个靠花灵石升建筑、一个靠用丹,决策完全不同。
 *
 * 判据:
 *   一 两个倍率分开报,合值仍等于原式(gardenMult × sootheMult),不改数值。
 *   二 每级的放大取自 data/buildings,不另写一份。
 *   三 两段按较大值归一铺十格 —— 合值可以到几倍,按合值铺格就失去意义。
 *   四 安抚那一路与 petModsFor 同源(都读 ownedModSources 的 beastPct)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BEAST_EFFECT_PER_LEVEL } from '@/data/buildings'
import { BEAST_PIP_STEPS, beastSourcePips, beastSources } from './beastSource'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/TitlesView.vue'), 'utf-8')
const PLAYER = readFileSync(resolve(ROOT, 'src/stores/player.ts'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('灵兽来源 · 一、两段拆开,合值不变', () => {
  it('园子倍率 = 1 + 等级 × 每级放大', () => {
    for (const lv of [0, 1, 5, 10]) {
      expect(beastSources(lv, 0).gardenMult).toBeCloseTo(1 + lv * BEAST_EFFECT_PER_LEVEL, 10)
    }
  })

  it('合值等于两段相乘 —— 拆解不改数值', () => {
    for (const [lv, pct] of [
      [0, 0],
      [5, 0.3],
      [10, 0],
      [3, 0.15]
    ] as const) {
      const m = beastSources(lv, pct)
      expect(m.totalMult).toBeCloseTo(m.gardenMult * m.sootheMult, 10)
    }
  })

  it('两段各自报百分点,与倍率同源', () => {
    const m = beastSources(5, 0.3)
    expect(m.gardenPct).toBeCloseTo(5 * BEAST_EFFECT_PER_LEVEL * 100, 10)
    expect(m.soothePct).toBeCloseTo(30, 10)
  })
})

describe('灵兽来源 · 二、每级放大取自数据表', () => {
  it('模块直接读 BEAST_EFFECT_PER_LEVEL,不写死倍数', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/beastSource.ts'), 'utf-8')
    expect(src).toContain('BEAST_EFFECT_PER_LEVEL')
    // 不出现写死的 0.1
    expect(src, '别把每级放大写死').not.toMatch(/lv \* 0\.1\b/)
  })

  it('园 0 级时园子那段为 0', () => {
    expect(beastSources(0, 0.3).gardenPct).toBe(0)
    expect(beastSources(0, 0.3).soothePct).toBeCloseTo(30, 10)
  })
})

describe('灵兽来源 · 三、按较大值归一', () => {
  it('两段里较大的那一段铺满十格', () => {
    expect(beastSourcePips(beastSources(5, 0.3)).garden.filter(Boolean)).toHaveLength(BEAST_PIP_STEPS)
    expect(beastSourcePips(beastSources(0, 0.3)).soothe.filter(Boolean)).toHaveLength(BEAST_PIP_STEPS)
  })

  it('较小那一段按比例铺 —— 30/50 应落在六格', () => {
    const pips = beastSourcePips(beastSources(5, 0.3))
    expect(pips.garden.filter(Boolean)).toHaveLength(10)
    expect(pips.soothe.filter(Boolean)).toHaveLength(6)
  })

  it('两段都为 0 时一格不亮', () => {
    const pips = beastSourcePips(beastSources(0, 0))
    expect(pips.garden.filter(Boolean)).toHaveLength(0)
    expect(pips.soothe.filter(Boolean)).toHaveLength(0)
  })

  it('每段的格数恒为十格,不随数值变长', () => {
    for (const [lv, pct] of [
      [0, 0],
      [5, 0.3],
      [20, 1.5]
    ] as const) {
      const pips = beastSourcePips(beastSources(lv, pct))
      expect(pips.garden).toHaveLength(BEAST_PIP_STEPS)
      expect(pips.soothe).toHaveLength(BEAST_PIP_STEPS)
    }
  })
})

describe('灵兽来源 · 四、与到账数值同源', () => {
  it('安抚那一路在 store 里只取一次口径,petModsFor 复用同一处', () => {
    expect(PLAYER).toContain('beastSoothePct')
    // petModsFor 不再自己去 mergeMods 一遍
    expect(PLAYER, 'petModsFor 应复用 beastSoothePct').toContain('1 + beastSoothePct.value')
  })

  it('灵兽册渲染两段来源', () => {
    expect(VIEW).toContain('beast-src')
    expect(VIEW).toContain('beastSources(')
    expect(VIEW).toContain('beastSourcePips(')
  })

  it('只在出战的灵兽上显示 —— 未出战没有到账加成', () => {
    expect(VIEW).toMatch(/v-if="row\.active"[\s\S]{0,200}beast-src/)
  })

  it('两段用两种颜色,形制层不吃指针事件', () => {
    expect(block('.beast-src')).toContain('pointer-events')
    expect(block('.beast-src-pips--garden i.on')).toContain('jade')
    expect(block('.beast-src-pips--soothe i.on')).toContain('gold-ink')
  })
})
