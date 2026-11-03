/**
 * 灵草五品的形制:复用既有品阶语言,不另立色表。
 *
 * 这一层为什么单开:灵草入的是五品分账(凡/灵/仙/神/道),而界面此前只写「灵草×N」,
 * 玩家看不出采到的是哪一品。品阶语言在装备、丹药、法宝上已经建立:
 * `qualityTier`(浓淡)→ `qualityAura`(角饰/柔光)→ `luster`(最上档形制)。
 * 灵草接上去即可 —— 不新起第五套色表,也不另立阈值。
 *
 * 三条判据:
 *   一 品名同名:五品短名与品阶表同名(凡品/灵品/仙品/神品),道品取丹药那一枚。
 *      任一侧改名而对不上,这条会红 —— 那时才需要显式决定新的对应关系,而不是静默错位。
 *   二 与既有模块同源:rank / 色 / 浓淡 / 质感一律转发,不许在本模块另写数值。
 *   三 最上档才给质感:神品与道品才有御纹与流光,与法宝、丹药同一档。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HERB_GRADES, HERB_GRADE_SHORT } from '@/data/herbGrades'
import { DAO_QUALITY_COLOR, DAO_QUALITY_NAME, DAO_QUALITY_RANK, pillQualityTextColor } from '@/data/pills'
import { qualityDef } from '@/data/qualities'
import { qualityAuraByRank } from './qualityAura'
import { qualityTierByRank } from './qualityTier'
import { lusterByRank, DIVINE_TOP_RANK } from './luster'
import {
  herbQualityLuster,
  herbQualityRank,
  herbQualityTextColor,
  herbQualityTier,
  herbQualityTone
} from './herbQuality'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/InventoryView.vue'), 'utf-8')
const SHELF = readFileSync(resolve(ROOT, 'src/components/market/MarketShelfSection.vue'), 'utf-8')
const SELL = readFileSync(resolve(ROOT, 'src/components/market/MarketSellSection.vue'), 'utf-8')

describe('灵草形制 · 一、品名与品阶表同名', () => {
  it('凡/灵/仙/神四品各对上一档同名品阶', () => {
    expect(qualityDef('mortal').name).toBe(HERB_GRADE_SHORT[1])
    expect(qualityDef('spirit').name).toBe(HERB_GRADE_SHORT[2])
    expect(qualityDef('immortal').name).toBe(HERB_GRADE_SHORT[3])
    expect(qualityDef('divine').name).toBe(HERB_GRADE_SHORT[4])
    // 道品不在 QualityId 联合里,取丹药那一枚(rank 9)
    expect(DAO_QUALITY_NAME).toBe(HERB_GRADE_SHORT[5])
  })

  it('五品 rank 严格递增,道品落在神品之上', () => {
    const ranks = HERB_GRADES.map(g => herbQualityRank(g))
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i], `第 ${HERB_GRADES[i]} 品的 rank 不该低于前一品`).toBeGreaterThan(ranks[i - 1]!)
    }
    expect(herbQualityRank(5)).toBe(DAO_QUALITY_RANK)
    expect(DAO_QUALITY_RANK).toBeGreaterThan(DIVINE_TOP_RANK)
  })
})

describe('灵草形制 · 二、与既有模块同源', () => {
  it('浓淡、光环、质感都是转发,不是另算', () => {
    for (const g of HERB_GRADES) {
      const rank = herbQualityRank(g)
      expect(herbQualityTier(g), `第 ${g} 品的浓淡应与 rank 入口一致`).toEqual(qualityTierByRank(rank))
      expect(herbQualityLuster(g), `第 ${g} 品的质感应与 rank 入口一致`).toBe(lusterByRank(rank))
    }
  })

  it('识别色与文字色分别取各自的事实源', () => {
    expect(herbQualityTone(1)).toBe(qualityDef('mortal').color)
    expect(herbQualityTone(4)).toBe(qualityDef('divine').color)
    expect(herbQualityTone(5)).toBe(DAO_QUALITY_COLOR)
    // 文字另有一套(品阶色直接当字用有几档过不了 4.5:1),不拿识别色冒充
    expect(herbQualityTextColor(5)).toBe(pillQualityTextColor({ quality: 'dao' }))
    expect(herbQualityTextColor(3)).not.toBe(herbQualityTone(3))
  })

})

describe('灵草形制 · 三、最上档才给质感', () => {
  it('只有神品与道品有御纹与流光', () => {
    expect(herbQualityLuster(1)).toBeNull()
    expect(herbQualityLuster(2)).toBeNull()
    expect(herbQualityLuster(3)).toBeNull()
    expect(herbQualityLuster(4)).not.toBeNull()
    expect(herbQualityLuster(5)).not.toBeNull()
  })

  it('凡品无角饰 —— 起点那档必须朴素,否则稀有感从第一格就没了', () => {
    expect(qualityAuraByRank(herbQualityRank(1)).tier).toBe('plain')
    expect(qualityAuraByRank(herbQualityRank(2)).tier, '灵品以上才有形制').not.toBe('plain')
  })

  it('界面真的接上了 —— 定义了却从不使用的形制是死代码', () => {
    // 行囊材料格与详情
    expect(VIEW, '灵草格该挂品阶光环').toContain(':rank="herbQualityRank(m.herbGrade)"')
    expect(VIEW, '灵草格该挂最上档质感').toContain('m.luster')
    expect(VIEW, '详情里应逐品陈列并带品阶色').toContain('herbQualityTextColor(')
    // 坊市货格与售出段
    expect(SHELF, '坊市灵草格该读品阶光环').toContain('herbQualityRank(c.herbGrade)')
    expect(SELL, '售出段该按品阶上色').toContain('herbQualityTextColor(')
  })
})
