/**
 * 流派组合技的配对表。
 *
 * 最大的静默失效风险:pair 里写了不存在的流派 id。
 * 那种情况下组合技永远触发不了,而**没有任何地方会报错** ——
 * 玩家只会觉得「这两个流派配合没什么特别的」。本条把配对 id 钉到真实的 BUILD_STYLES 上。
 *
 * 另钉三条:pair 两侧不许相同(自我组合没有意义)、不得超过两个流派、id 与 name 不重复。
 */
import { describe, expect, it } from 'vitest'
import { COMBO_ARTS, COMBO_SECONDARY_MIN, matchComboArt } from '@/data/comboArts'
import { BUILD_STYLES } from '@/core/buildDetect'

const STYLE_IDS = new Set(BUILD_STYLES.map(s => s.id))

describe('组合技 · 配对指向真实流派', () => {
  it('pair 里每个 id 都在 BUILD_STYLES 中(写错就是永不触发的死条目)', () => {
    for (const art of COMBO_ARTS) {
      for (const id of art.pair) {
        expect(STYLE_IDS.has(id), `「${art.name}」引用了不存在的流派 ${id},该组合技永远触发不了`).toBe(true)
      }
    }
  })

  it('pair 两侧不许相同(自我组合没有意义)', () => {
    for (const art of COMBO_ARTS) {
      expect(art.pair[0], `「${art.name}」自己和自己配对`).not.toBe(art.pair[1])
    }
  })

  it('同一对流派只登记一条组合技(重复会让 matchComboArt 只认先命中的)', () => {
    const seen = new Map<string, string>()
    for (const art of COMBO_ARTS) {
      const key = [...art.pair].sort().join('+')
      const prev = seen.get(key)
      expect(prev, `「${prev}」与「${art.name}」登记了同一对 ${key}`).toBeUndefined()
      seen.set(key, art.name)
    }
  })
})

describe('组合技 · 匹配函数', () => {
  it('次序不限:主副对调也能匹配到同一条', () => {
    for (const art of COMBO_ARTS) {
      const [a, b] = art.pair
      expect(matchComboArt(a, b)?.id, `正序没匹配到「${art.name}」`).toBe(art.id)
      expect(matchComboArt(b, a)?.id, `反序没匹配到「${art.name}」`).toBe(art.id)
    }
  })

  it('副体系为 undefined 时返回 null(没成形就没有组合技)', () => {
    for (const art of COMBO_ARTS) {
      expect(matchComboArt(art.pair[0], undefined)).toBeNull()
    }
  })

  it('不成对的流派返回 null,不误报', () => {
    const ids = [...STYLE_IDS]
    let checked = 0
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue
        const key = [a, b].sort().join('+')
        const registered = COMBO_ARTS.some(x => [...x.pair].sort().join('+') === key)
        if (registered) continue
        expect(matchComboArt(a, b), `${a}+${b} 没有登记却匹配到了组合技`).toBeNull()
        checked += 1
      }
    }
    expect(checked, '没有未登记的流派对,用例空转').toBeGreaterThan(0)
  })

  it('匹配到的是同一条对象(供引擎读 id 用)', () => {
    for (const art of COMBO_ARTS) {
      expect(matchComboArt(art.pair[0], art.pair[1])).toBe(art)
    }
  })
})

describe('组合技 · 结构不变式', () => {
  it('id 与 name 都不重复', () => {
    const ids = COMBO_ARTS.map(a => a.id)
    const names = COMBO_ARTS.map(a => a.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每条都有描述与代价说明(有代价才是有取舍的设计)', () => {
    for (const art of COMBO_ARTS) {
      expect(art.desc.length, `${art.id} 没描述`).toBeGreaterThan(0)
      expect(art.costText.length, `${art.id} 没写代价`).toBeGreaterThan(0)
    }
  })

  it('激活门槛是 (0,1) 之间的比例', () => {
    expect(COMBO_SECONDARY_MIN).toBeGreaterThan(0)
    expect(COMBO_SECONDARY_MIN).toBeLessThan(1)
  })
})
