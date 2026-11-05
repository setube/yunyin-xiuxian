/**
 * 灵脉形制:四条脉原先各按本脉上限填条,主脉 42 点填到 60%、副脉 20 点填到 67% ——
 * **点数多的那条反而显得短**。四条横条不是同一把尺量的,而「哪条投得多」正是这张卡
 * 唯一要回答的问题(总容量 100 < 四脉上限之和 160,必须放弃 60 点)。
 *
 * 四条判据:
 *   一 共用横轴:四条一律按 0→主脉上限 填,副脉上限在轴上落一枚刻度。
 *   二 预算分段:顶上一条按总容量切段,段长即点数,空着的那截就是还能投多少。
 *   三 边界:超容量的旧档截断、零点不画成段、负数与 NaN 一律当 0。
 *   四 界面真的接上了,且轴长读的是 data/constants,不手抄。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VEINS, type VeinId } from '@/data/veins'
import { VEIN_MAIN_CAPACITY, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY } from '@/data/constants'
import { axisPct, veinBudget } from './veinShape'

const ROOT = resolve(__dirname, '../..')
const CARD = readFileSync(resolve(ROOT, 'src/components/dongfu/VeinInvestCard.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

const zero = (): Record<VeinId, number> => ({ gather: 0, craft: 0, alchemy: 0, insight: 0 })

describe('灵脉形制 · 一、四条共用一把尺', () => {
  it('点数多的那条一定画得更长 —— 这是共用横轴的全部意义', () => {
    // 原先的算法:各按本脉上限。42/70 = 60%,20/30 = 67% —— 多的那条更短
    expect(axisPct(42, VEIN_MAIN_CAPACITY)).toBeLessThan(axisPct(20, VEIN_SIDE_CAP))
    // 共用主脉轴后反过来:42 点确实比 20 点长
    expect(axisPct(42, VEIN_MAIN_CAPACITY)).toBeGreaterThan(axisPct(20, VEIN_MAIN_CAPACITY))
  })

  it('轴满格就是主脉上限;副脉上限落在轴上同一处', () => {
    expect(axisPct(VEIN_MAIN_CAPACITY, VEIN_MAIN_CAPACITY)).toBe(100)
    expect(axisPct(VEIN_SIDE_CAP, VEIN_MAIN_CAPACITY)).toBeCloseTo((VEIN_SIDE_CAP / VEIN_MAIN_CAPACITY) * 100, 6)
    // 副脉上限刻度的位置算得出来,不必手抄
    expect(axisPct(VEIN_SIDE_CAP, VEIN_MAIN_CAPACITY)).toBeGreaterThan(0)
    expect(axisPct(VEIN_SIDE_CAP, VEIN_MAIN_CAPACITY)).toBeLessThan(100)
  })
})

describe('灵脉形制 · 二、总容量上的分段', () => {
  it('四段之和就是已投,余下的是还能投多少', () => {
    const b = veinBudget({ gather: 42, craft: 20, alchemy: 8, insight: 4 }, VEIN_TOTAL_CAPACITY)
    expect(b.bands.map(x => x.points)).toEqual([42, 20, 8, 4])
    expect(b.spent).toBe(74)
    expect(b.free).toBe(26)
    expect(b.freePct).toBeCloseTo(26, 6)
    expect(b.bands.reduce((s, x) => s + x.pct, 0) + b.freePct).toBeCloseTo(100, 6)
  })

  it('点满时余量为 0,不再留一截空色', () => {
    const b = veinBudget({ gather: 70, craft: 30, alchemy: 0, insight: 0 }, VEIN_TOTAL_CAPACITY)
    expect(b.free).toBe(0)
    expect(b.freePct).toBe(0)
  })

  it('一段就是一个点数,不折成「占比」再乘回去', () => {
    const b = veinBudget({ gather: 1, craft: 0, alchemy: 0, insight: 0 }, VEIN_TOTAL_CAPACITY)
    expect(b.bands).toHaveLength(1)
    expect(b.bands[0]!.pct).toBeCloseTo(1, 6)
  })
})

describe('灵脉形制 · 三、边界', () => {
  it('零点的脉不出段 —— 画出来是一截看不见的空色,还会把圆角切开', () => {
    const b = veinBudget({ gather: 10, craft: 0, alchemy: 0, insight: 0 }, VEIN_TOTAL_CAPACITY)
    expect(b.bands.map(x => x.id)).toEqual(['gather'])
  })

  it('超容量的旧档按容量截断:条只有一根,画到轴外也无处可见', () => {
    const b = veinBudget({ gather: 70, craft: 70, alchemy: 70, insight: 70 }, VEIN_TOTAL_CAPACITY)
    expect(b.spent).toBe(4 * VEIN_MAIN_CAPACITY)
    expect(b.free).toBe(0)
    // 轴位置各自照实,封顶在 100
    expect(axisPct(70, VEIN_MAIN_CAPACITY)).toBe(100)
  })

  it('负数、NaN、容量为 0 都不产生负宽或 NaN 宽', () => {
    const b = veinBudget({ gather: -5, craft: Number.NaN, alchemy: 3, insight: 0 }, VEIN_TOTAL_CAPACITY)
    expect(b.bands.map(x => x.id)).toEqual(['alchemy'])
    expect(axisPct(-5, VEIN_MAIN_CAPACITY)).toBe(0)
    expect(axisPct(Number.NaN, VEIN_MAIN_CAPACITY)).toBe(0)
    const empty = veinBudget(zero(), 0)
    expect(empty.freePct).toBe(0)
    expect(Number.isNaN(empty.freePct)).toBe(false)
  })

  it('段序按 VEINS 的数据表次序,改表即改序', () => {
    const points = zero()
    for (const def of VEINS) points[def.id] = 5
    const b = veinBudget(points, VEIN_TOTAL_CAPACITY)
    expect(b.bands.map(x => x.id)).toEqual(VEINS.map(v => v.id))
  })
})

describe('灵脉形制 · 四、界面接上了', () => {
  it('卡片读的是本模块,不自己再算一遍百分比', () => {
    expect(CARD, '卡片没有接 veinBudget').toContain('veinBudget(')
    expect(CARD, '卡片没有接 axisPct').toContain('axisPct(')
  })

  it('轴长从 constants 取,不手抄 70 / 30 / 100', () => {
    expect(CARD).toContain('VEIN_MAIN_CAPACITY')
    expect(CARD).toContain('VEIN_SIDE_CAP')
    expect(CARD).toContain('VEIN_TOTAL_CAPACITY')
    for (const hand of ['70 点', '30 点', '总容量 100']) {
      expect(CARD, `手抄的「${hand}」应改成读常数`).not.toContain(hand)
    }
  })

  it('总容量段条只用既有语义色,不新造 token', () => {
    const from = CSS.indexOf('.vein-budget')
    expect(from, 'style.css 里没有 .vein-budget 段落').toBeGreaterThan(-1)
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'ink-faint', 'jade', 'cinnabar', 'gold-ink', 'violet-ink'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  /**
   * 灵脉行的读数在 setup 里算一次。
   *
   * 原先主循环里 `currentLevel(v.id)` 被调 4 次、`veinEffectText` 2 次,
   * 连投区还要再调一次 —— 全是同一个 `dongfu.veinPoints[veinId]` 的查表。
   * 与 TrialPanel / 丹匣 / 器魂页同法。
   *
   * 故障注入:把段条宽度改回模板里调 axisPct,本条红。
   */
  it('灵脉行的读数算一次,模板不再逐行查表', () => {
    expect(CARD, '应在 computed 里算齐').toContain('const veinRows = computed(')
    const tpl = CARD.slice(0, CARD.indexOf('<script'))
    for (const fn of ['currentLevel(', 'axisPct(', 'surplusPoints(', 'veinEffectText(']) {
      expect(tpl, `模板不该再调 ${fn}`).not.toContain(fn)
    }
    // 阳性对照:读数确实来自行上的字段
    expect(tpl, '段条宽度应读 row.axisWidth').toContain('row.axisWidth')
    expect(tpl, '效果句应读 row.effect').toContain('row.effect')
    expect(tpl, '点数应读 row.level').toContain('row.level')
  })

  it('段条与刻度都不吃指针事件 —— 它们只是形制,不是控件', () => {
    for (const sel of ['.vein-budget', '.vein-axis']) {
      expect(block(sel), `${sel} 缺 pointer-events: none`).toContain('pointer-events: none')
    }
  })
})
