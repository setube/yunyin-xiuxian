/**
 * 词条递减的适用范围:哪些键受 DIMINISH_WEIGHTS 约束,哪些不受。
 *
 * 递减规则本身由 statsCalc.spec 钉着(越过递减权重后如何折算)。本条管的是**名单**:
 * 一个键漏进/漏出 DIMINISH_KEYS,递减规则就整体失效或误伤,而现有测试只取 DIMINISH_KEYS[0],
 * 察觉不到名单变化。
 *
 * 已知不一致(2026-11 记录待决,未擅自改):
 *   SOFT_CAPS 里五个属性,四个都在 DIMINISH_KEYS 内,只有 damageReduction 不在。
 *   后果是同类「云甲/霞衣/不坏」可以线性叠加 —— 9 槽 × 最多 9 词条时可轻易越过
 *   SOFT_CAPS.damageReduction 的 0.55。这可能是设计(常驻减伤不按触发型递减),
 *   也可能是遗漏,故只把现状钉成清单,不擅自把键加进去(会直接改平衡)。
 */
import { describe, expect, it } from 'vitest'
import { AFFIXES } from '@/data/affixes'
import { DIMINISH_KEYS, DIMINISH_WEIGHTS, SOFT_CAPS } from '@/data/constants'

const DIMINISH = new Set<string>(DIMINISH_KEYS)

describe('词条递减 · 名单形态', () => {
  it('递减权重是四条,且严格递减', () => {
    expect([...DIMINISH_WEIGHTS]).toEqual([1, 0.75, 0.5, 0.25])
  })

  it('递减名单非空且无重复', () => {
    expect(DIMINISH_KEYS.length).toBeGreaterThan(0)
    expect(new Set(DIMINISH_KEYS).size, '递减名单里有重复键').toBe(DIMINISH_KEYS.length)
  })

  it('递减名单里每个键都是真实存在的词条键(写错等于该键不受约束)', () => {
    const realKeys = new Set(AFFIXES.map(a => a.key as string))
    for (const k of DIMINISH_KEYS) {
      expect(realKeys.has(k), `DIMINISH_KEYS 里的 ${k} 没有任何词条在用,多半是拼写错误`).toBe(true)
    }
  })

  it('有软阈值的属性必须至少被递减或封顶其中之一管住', () => {
    for (const key of Object.keys(SOFT_CAPS)) {
      const capped = key in SOFT_CAPS
      const diminished = DIMINISH.has(key)
      expect(capped || diminished, `${key} 既无软阈值又不受递减约束`).toBe(true)
    }
  })
})

describe('词条递减 · 已知不一致', () => {
  /**
   * 现状清单:soft cap 里唯一不受递减约束的键。
   * 若将来把 damageReduction 加进 DIMINISH_KEYS,本条会红 —— 那时请把这条改成
   * 「所有 soft cap 键都受递减约束」的正向断言,而不要再留一份免责声明。
   */
  const SOFT_CAPPED_BUT_NOT_DIMINISHED = new Set(['damageReduction'])

  it('soft cap 键中不受递减约束的,只有已知这一个', () => {
    const loose = Object.keys(SOFT_CAPS).filter(k => !DIMINISH.has(k))
    expect(new Set(loose), '有新的 soft cap 键不受递减约束,请判断是有意还是遗漏').toEqual(
      SOFT_CAPPED_BUT_NOT_DIMINISHED
    )
  })

  it('damageReduction 确实有可叠加的词条(所以不受约束才有实际影响)', () => {
    const list = AFFIXES.filter(a => a.key === 'damageReduction')
    expect(list.length, 'damageReduction 没有词条,那么这个不一致就没有后果').toBeGreaterThan(0)
    const maxOne = Math.max(...list.map(a => a.max))
    const cap = SOFT_CAPS.damageReduction!.cap * 100
    // 单条就能占掉 cap 的可观比例,说明多次叠加足以越过 soft cap
    expect(maxOne / cap, '单条词条相对 soft cap 太小,叠加越界的风险可忽略').toBeGreaterThan(0.2)
  })

  it('递减名单的核心成员(invariants):这些键必须一直在名单里', () => {
    // 它们都是「同类多来源会失控」的触发型/常驻型属性,移除任一都会被误当成可线性叠加
    const CORE = [
      'critRate', 'critDamage', 'dodgeRate', 'accuracy',
      'shieldOnStart', 'counterRate', 'comboRate', 'lifesteal', 'stunRate'
    ]
    for (const k of CORE) {
      expect(DIMINISH.has(k), `核心递减键 ${k} 从名单里消失了,该属性会变为可线性叠加`).toBe(true)
    }
  })

  it('其余四个 soft cap 键都在递减名单里(说明 damageReduction 是例外而非常态)', () => {
    const others = Object.keys(SOFT_CAPS).filter(k => k !== 'damageReduction')
    expect(others.length).toBe(4)
    for (const k of others) {
      expect(DIMINISH.has(k), `${k} 不在递减名单里,例外可能不止一个`).toBe(true)
    }
  })
})
