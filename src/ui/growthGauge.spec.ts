/**
 * 修行倍率的刻度。
 *
 * 建号页掷完灵根只给一个数「修行倍率 ×1.11」,而 1.11 算好还是不好无从判断 ——
 * 同屏有五个资质数、一个「杂灵根」标签,唯独没有「这一手在你可能拿到的牌里排哪一段」。
 *
 * 判据:
 *   一 区间两端由 core 的因子上下界推出,不是拍的:低 0.60、高 4.00。
 *   二 位置夹在 0~1,坏值不产出 NaN。
 *   三 绝品那一档刻意窄 —— 混沌灵根与满资质单灵根都在最右,不该占掉四分之一条。
 *   四 界面接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readFileSync as rf } from 'node:fs'
import { MULT_CEIL, MULT_FLOOR, growthGauge, growthPosition } from './growthGauge'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/CreateView.vue'), 'utf-8')
const REBIRTH = readFileSync(resolve(ROOT, 'src/components/character/ReincarnationDialog.vue'), 'utf-8')
const GEN = rf(resolve(ROOT, 'src/core/linggenGen.ts'), 'utf-8')

describe('倍率刻度 · 一、区间两端由因子上下界推出', () => {
  it('下界 = 五根杂灵根的最低倍率', () => {
    // (40/60) × COUNT_FACTOR[5]=0.9 × 无特殊
    const lowest = (40 / 60) * 0.9
    expect(MULT_FLOOR).toBeCloseTo(lowest, 2)
  })

  it('上界盖得住混沌灵根', () => {
    // 混沌:资质 85~100 → (100/60) × 1.6 × 1.5
    const chaosTop = (100 / 60) * 1.6 * 1.5
    expect(MULT_CEIL).toBeGreaterThanOrEqual(chaosTop)
    expect(MULT_CEIL).toBeGreaterThan(chaosTop - 0.01)
  })

  it('两端确实取自 core 的表,不是另写一套', () => {
    // core 里那三个数改了,本层的区间就该跟着改;此处钉住它们当前的来源
    expect(GEN, 'core 该有根数系数表').toContain('COUNT_FACTOR')
    expect(GEN, 'core 该有特殊灵根加成').toContain('hasSpecial ? 1.2 : 1')
    expect(GEN, 'core 该有除以 60 的资质基准').toContain('avgAptitude / 60')
  })
})

describe('倍率刻度 · 二、位置夹在 0~1', () => {
  it('两端各给 0 与 1', () => {
    expect(growthPosition(MULT_FLOOR)).toBeCloseTo(0, 6)
    expect(growthPosition(MULT_CEIL)).toBeCloseTo(1, 6)
  })

  it('越界不溢出', () => {
    expect(growthPosition(-99)).toBe(0)
    expect(growthPosition(999)).toBe(1)
    expect(growthPosition(Number.NaN)).toBe(0)
    expect(growthPosition(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('典型手牌落在可解释的位置', () => {
    // ×1.11 是截图里那一手:五根杂灵根、平均资质约 74
    const p = growthPosition(1.11)
    expect(p).toBeGreaterThan(0.1)
    expect(p).toBeLessThan(0.25)
    expect(growthGauge(1.11).tier).toBe('low')
  })
})

describe('倍率刻度 · 三、绝品那一档刻意窄', () => {
  it('四档说法各不同', () => {
    const labels = new Set(['low', 'mid', 'high', 'peak'].map(t => growthGauge(
      t === 'low' ? 0.7 : t === 'mid' ? 1.5 : t === 'high' ? 2.8 : 3.9
    ).label))
    expect(labels.size).toBe(4)
  })

  it('混沌灵根落在绝品', () => {
    expect(growthGauge(3.6).tier).toBe('peak')
    expect(growthGauge(4.0).tier).toBe('peak')
  })

  it('满资质单灵根也落在绝品', () => {
    // (100/60) × 1.6 × 1.2 = 3.20
    expect(growthGauge(3.2).tier).toBe('peak')
  })

  it('绝品段不到整条的三分之一', () => {
    // position ≥ 0.70 才是绝品 → 至多占 30%
    expect(1 - 0.7).toBeLessThan(0.34)
    expect(growthGauge(3.8).position).toBeGreaterThanOrEqual(0.7)
  })

  it('四档按真实牌型切,不按四等分', () => {
    // 五根杂灵根资质 70 → 1.05 仍在最低档;三根资质 70 → 1.34 进第二档
    expect(growthGauge(1.05).tier).toBe('low')
    expect(growthGauge(1.34).tier).toBe('mid')
    // 真灵根(二根)70 → 1.58 与单根异灵根 70 → 1.87 同属第二档
    expect(growthGauge(1.58).tier).toBe('mid')
    expect(growthGauge(1.87).tier).toBe('mid')
    // 变异灵根资质 70 → 2.24 才进上乘
    expect(growthGauge(2.24).tier).toBe('high')
  })

  it('坏值回落一档,不抛错', () => {
    const g = growthGauge(Number.NaN)
    expect(g.mult).toBe(1)
    expect(Number.isFinite(g.position)).toBe(true)
  })
})

/**
 * 端点处圆点不许探出轴外。
 *
 * position 由 growthPosition 严格夹到 0~1,端点必然出现(倍率 0.6 → 0%,4.0 → 100%)。
 * 圆 7px、translate(-50%) 居中,端点处半个圆(3.5px)本来会探到轴外 ——
 * 实测算下来圆心距两侧的 ×0.6 / ×4.0 只剩 2.5px,从「贴边」变成「几乎压上标签」。
 *
 * 故障注入:把 clamp 去掉,本条红(实测越界 3.5px)。
 */
describe('倍率刻度 · 五、端点处圆点夹在轴内', () => {
  const CSS = readFileSync(resolve(__dirname, '../style.css'), 'utf-8')

  function rule(sel: string): string {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
  }

  it('圆点的 left 用 clamp,下限与上限都等于半径', () => {
    const body = rule('.growth-gauge i')
    expect(body, '缺 .growth-gauge i').not.toBe('')
    expect(body, '该用 clamp 夹住圆心').toContain('clamp(')
    expect(body, '圆宽该是 7px').toMatch(/width:\s*7px/)
    expect(body, '下限该等于半径 3.5px').toMatch(/clamp\(\s*3\.5px\s*,/)
    expect(body, '上限该让出半径').toContain('calc(100% - 3.5px)')
  })

  it('位置仍由 --gauge-pos 决定,没被夹成常量', () => {
    expect(rule('.growth-gauge i'), '该仍读 --gauge-pos').toContain('var(--gauge-pos')
  })

  it('两处刻度都把位置写进 --gauge-pos,不再直接写 left', () => {
    for (const f of ['../views/CreateView.vue', '../components/character/ReincarnationDialog.vue']) {
      const src = readFileSync(resolve(__dirname, f), 'utf-8')
      expect(src, `${f} 该写 --gauge-pos`).toContain("'--gauge-pos'")
      expect(src, `${f} 不该再直接写 left 到 i 上`).not.toMatch(/<i :style="\{ left: `\$\{[^}]*\.position/)
    }
  })
})

describe('倍率刻度 · 四、建号页接上了', () => {
  it('倍率旁边有刻度与档次', () => {
    expect(VIEW).toContain('growthGauge')
    expect(VIEW, '该有一根刻度').toContain('growth-gauge')
    expect(VIEW, '该说出这一手属哪档').toContain('growthTier')
  })

  it('转世弹窗的来世灵根也走同一份 —— 同一个数、同一个区间', () => {
    // 建号页与转世弹窗掷的都是 rollLinggen(),growthMult 是同一个量纲
    expect(REBIRTH, '转世弹窗该走 ui/growthGauge').toContain("from '@/ui/growthGauge'")
    expect(REBIRTH, '该有一根刻度').toContain('growth-gauge')
    expect(REBIRTH, '该按档挂色').toContain('GROWTH_TONE')
    expect(REBIRTH, '该说出属哪档').toContain('nextGrowth.label')
  })

  it('两处都不再只甩一个数', () => {
    // 原写法:`修行倍率 ×{{ …growthMult.toFixed(2) }}` 后面什么也没有。
    // 建号页走 profile.growthMult,转世弹窗走 nextGrowth.mult —— 两种都须带参照。
    const markers = [
      [VIEW, '建号页', 'growthMult.toFixed(2)'],
      [REBIRTH, '转世弹窗', 'nextGrowth.mult.toFixed(2)']
    ] as const
    for (const [src, name, marker] of markers) {
      const at = src.indexOf(marker)
      expect(at, `${name}找不到倍率渲染处`).toBeGreaterThan(-1)
      const after = src.slice(at, at + 500)
      expect(after, `${name}的倍率后头没有参照`).toMatch(/floor|growth-gauge|label/)
    }
  })

  it('两处用的是同一个模块,不是各写一套判断', () => {
    const mods = [VIEW, REBIRTH].filter(s => s.includes("from '@/ui/growthGauge'"))
    expect(mods, '两处都该 import 同一份').toHaveLength(2)
  })

  it('轴两端有数 —— 没有参照的刻度等于没有', () => {
    expect(VIEW).toMatch(/growthTier\.floor|MULT_FLOOR/)
    expect(VIEW).toMatch(/growthTier\.ceil|MULT_CEIL/)
  })
})
