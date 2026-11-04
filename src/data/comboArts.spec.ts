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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COMBO_ARTS, COMBO_SECONDARY_MIN, comboPairNames, matchComboArt } from '@/data/comboArts'
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

  /**
   * pair 是「哪两派配对」的唯一出处,界面据此把两派名摆出来。
   * 原先界面只显示技名与效果,玩家看不出是手上这两派的哪一对触发了它 ——
   * 数据里存着 pair,界面却没读。
   *
   * 故障注入:把 BuildView 里 pairNames 那行删掉,本条红。
   */
  it('界面把配对的两派名摆出来,且按 pair 原序不按主副', () => {
    const view = readFileSync(resolve(__dirname, '../views/BuildView.vue'), 'utf-8')
    expect(view, '该调 data 层的取名函数').toContain('comboPairNames(')
    expect(view, '该把两派名摆到卡上').toContain('comboInfo.pairNames')
    // 不能按主副重排:那会把同一招在两套构筑里写成不同样子
    expect(view, '不许按主副重排').not.toContain('pairNames: [b.style.name')
  })

  it('配对名按 pair 原序,主副反过来也一样', () => {
    const art = COMBO_ARTS.find(a => a.id === 'xuangang')!
    const gang = { id: 'gangdun', name: '罡盾流' }
    const fan = { id: 'fanzhen', name: '反震流' }
    // pair 原序是 [gangdun, fanzhen]
    expect(comboPairNames(art, gang, fan)).toEqual(['罡盾流', '反震流'])
    // 主副反过来,显示次序不变 —— 同一招在两套构筑里不能写成两个样子
    expect(comboPairNames(art, fan, gang)).toEqual(['罡盾流', '反震流'])
  })

  it('配不上的那侧回落为原 id —— 数据错了要看得见', () => {
    const art = COMBO_ARTS.find(a => a.id === 'xuangang')!
    const out = comboPairNames(art, { id: 'gangdun', name: '罡盾流' }, { id: 'zzz', name: '不存在' })
    expect(out).toEqual(['罡盾流', 'fanzhen'])
  })

  it('视图不再自己取名,只调 data 层的函数', () => {
    const view = readFileSync(resolve(__dirname, '../views/BuildView.vue'), 'utf-8')
    expect(view, '视图该调 comboPairNames').toContain('comboPairNames(')
    expect(view, '视图不该自己写取名逻辑').not.toContain('const nameOf')
  })

  it('每条的 pair 都指向真实存在的流派,且两派不同', () => {
    for (const art of COMBO_ARTS) {
      expect(art.pair, `${art.id} 的 pair 近了同一派`).not.toEqual([art.pair[0], art.pair[0]])
      // 两向都能匹配:组合技不限主副次序
      expect(matchComboArt(art.pair[0], art.pair[1])?.id, `${art.id} 正向匹配不上`).toBe(art.id)
      expect(matchComboArt(art.pair[1], art.pair[0])?.id, `${art.id} 反向匹配不上`).toBe(art.id)
    }
  })

  it('激活门槛是 (0,1) 之间的比例', () => {
    expect(COMBO_SECONDARY_MIN).toBeGreaterThan(0)
    expect(COMBO_SECONDARY_MIN).toBeLessThan(1)
  })
})
