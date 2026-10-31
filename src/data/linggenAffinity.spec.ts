/**
 * 五行灵根的天然牌面:倾向文案、劫型通道与缓解词条三者必须对得上。
 *
 * ElementAffinity.tendency 的接口注释写着「只描述牌面,不承诺数值」,
 * 所以这里**不比对数值**,只钉三件必须一致的事:
 *   1. tendency 里写的劫名 = tribulationDef(kind).name(写错劫名玩家会按错的劫去配装)
 *   2. kind 为 null(混沌通吃)时,tendency 必须说「五劫」而不是某个具体劫
 *   3. 有 kind 就必须有 relief 且非空(说了走哪条通道却不解锁任何缓解,等于空头承诺)
 */
import { describe, expect, it } from 'vitest'
import { ELEMENT_AFFINITY } from '@/data/linggenAffinity'
import { TRIBULATIONS, tribulationDef } from '@/data/tribulations'

const ENTRIES = Object.entries(ELEMENT_AFFINITY)

describe('灵根牌面 · 倾向文案与劫型一致', () => {
  it('tendency 里写的劫名等于该元素对应的劫型名', () => {
    let checked = 0
    for (const [el, aff] of ENTRIES) {
      if (aff.kind === null) continue
      const name = tribulationDef(aff.kind).name
      expect(aff.tendency, `「${el}」写「${aff.tendency}」,但 kind=${aff.kind} 是「${name}」`).toContain(name)
      checked += 1
    }
    expect(checked, '没有任何元素绑定具体劫型,说明结构变了').toBeGreaterThan(0)
  })

  it('kind 为 null 时文案说「五劫」,且不点名任何一种劫', () => {
    let checked = 0
    for (const [el, aff] of ENTRIES) {
      if (aff.kind !== null) continue
      expect(aff.tendency, `「${el}」通吃五劫,文案却没写「五劫」`).toContain('五劫')
      for (const t of TRIBULATIONS) {
        expect(aff.tendency.includes(t.name), `「${el}」通吃却点名了「${t.name}」`).toBe(false)
      }
      checked += 1
    }
    expect(checked, '没有通吃型元素,说明结构变了').toBeGreaterThan(0)
  })

  it('有劫型就必须解锁至少一条缓解通道', () => {
    for (const [el, aff] of ENTRIES) {
      if (aff.kind === null) {
        // 通吃型可以不带 relief:它靠的是「五劫皆缓解」这一整体牌面
        continue
      }
      expect(Object.keys(aff.relief).length, `「${el}」说了走 ${aff.kind} 通道,却没解锁任何缓解`).toBeGreaterThan(0)
    }
  })

  it('缓解值都是正数(减少量,负数等于加压)', () => {
    for (const [el, aff] of ENTRIES) {
      for (const [k, v] of Object.entries(aff.relief)) {
        expect(v as number, `「${el}」的 ${k}=${v} 应为正数`).toBeGreaterThan(0)
      }
    }
  })

  it('每种劫型至少有一个元素对应(否则那条通道永远解锁不了)', () => {
    for (const t of TRIBULATIONS) {
      const owners = ENTRIES.filter(([, a]) => a.kind === t.id).map(([el]) => el)
      expect(owners.length, `劫型「${t.name}」没有任何元素对应`).toBeGreaterThan(0)
    }
  })
})

describe('灵根牌面 · 权重结构', () => {
  it('所有元素的功法/机缘权重都大于 1(倾向必须比中性更易撞见)', () => {
    for (const [el, aff] of ENTRIES) {
      expect(aff.gongfaWeight, `「${el}」的功法权重 ${aff.gongfaWeight} 不大于 1`).toBeGreaterThan(1)
      expect(aff.fortuneWeight, `「${el}」的机缘权重 ${aff.fortuneWeight} 不大于 1`).toBeGreaterThan(1)
    }
  })

  it('权重是有限正数(Infinity 会让该元素独占全部同类抽签)', () => {
    for (const [el, aff] of ENTRIES) {
      expect(Number.isFinite(aff.gongfaWeight), `「${el}」的功法权重不是有限数`).toBe(true)
      expect(Number.isFinite(aff.fortuneWeight), `「${el}」的机缘权重不是有限数`).toBe(true)
    }
  })

  it('每个元素的 tendency 都非空且以「同源功法易得」开头(牌面格式统一)', () => {
    for (const [el, aff] of ENTRIES) {
      expect(aff.tendency.length, `「${el}」没有倾向文案`).toBeGreaterThan(0)
      expect(aff.tendency.startsWith('同源功法易得'), `「${el}」的文案格式与其余不一致`).toBe(true)
    }
  })

  it('元素数量与劫型数量无关,但至少覆盖全部劫型', () => {
    expect(ENTRIES.length, '元素表不该为空').toBeGreaterThan(0)
    expect(ENTRIES.length).toBeGreaterThanOrEqual(TRIBULATIONS.length)
  })
})
