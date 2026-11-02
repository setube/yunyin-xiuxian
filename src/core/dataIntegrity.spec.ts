/**
 * 数据完整性
 *   一 每个声明的属性键都有数据在写("没人读"由 vocabularyCoverage 管)。
 *      属性键拼错由类型系统拦(vue-tsc 实测),不另加正则。
 *   二 内容门槛不超出可达上界(minStage / minRealm / rank)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MAX_MAJOR } from '@/data/realms'
import { REGIONS } from '@/data/regions'
import { QUALITIES } from '@/data/qualities'
import { LIFE_THEMES } from '@/data/lifeThemes'
import { SAMSARA_STAGES } from '@/data/samsara'
import { ENEMIES, enemyDef } from '@/data/enemies'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { PILLS } from '@/data/pills'
import { ARTIFACTS } from '@/data/artifacts'
import { AFFIXES } from '@/data/affixes'
import { MATERIALS } from '@/data/materials'
import { GONGFA } from '@/data/gongfa'
import { PETS } from '@/data/pets'
import { TITLES } from '@/data/titles'
import { EVENTS } from '@/data/events'
import { BUILDINGS } from '@/data/buildings'
import { SECRET_REALMS } from '@/data/secretRealms'

const DATA_DIR = resolve(__dirname, '../data')
const TYPES_SRC = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf8')
const STAT_BLOCK = TYPES_SRC.slice(TYPES_SRC.indexOf('export type PercentStatKey'), TYPES_SRC.indexOf('export type AnyStatKey'))
const DECLARED_STAT_KEYS = new Set([...STAT_BLOCK.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]!))

function dataFiles(): string[] {
  return readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map(f => join(DATA_DIR, f))
}

describe('数据完整性 · 属性键必须有人写、也有人读', () => {
  it('每个声明的属性键都有内容在写(否则就是一条永不生效的通道)', () => {
    expect(DECLARED_STAT_KEYS.size).toBeGreaterThan(30)
    const corpus = dataFiles().map(f => readFileSync(f, 'utf8')).join('\n')
    const unused = [...DECLARED_STAT_KEYS].filter(k => !new RegExp(`\\b${k}\\s*:`).test(corpus))
    expect(unused, `这些属性键没有任何数据在用:${unused.join('、')}`).toEqual([])
  })
})

/**
 * 每张表的 id 是查表键(Map),重复时后写的覆盖前写的:
 * 实测 enemies 里 e_meteorbeast 写过两次(17 阶陨铁兽 / 25 阶陨星仙兽),
 * xingyun(17 阶)引它,实际取到的是 25 阶那条 —— 低层区域白挨高层怪。
 * 故障注入:把任一表的两条改成同 id,本条红。
 */
describe('数据完整性 · id 必须唯一', () => {
  it('各表的 id 无重复', () => {
    const TABLES: Array<[string, ReadonlyArray<{ id: string }>]> = [
      ['enemies', ENEMIES],
      ['regions', REGIONS],
      ['equipment', EQUIPMENT_TEMPLATES],
      ['pills', PILLS],
      ['artifacts', ARTIFACTS],
      ['affixes', AFFIXES],
      ['materials', MATERIALS],
      ['gongfa', GONGFA],
      ['events', EVENTS],
      ['buildings', BUILDINGS],
      ['secretRealms', SECRET_REALMS]
    ]
    for (const [name, list] of TABLES) {
      const seen = new Set<string>()
      const dup: string[] = []
      for (const x of list) {
        if (seen.has(x.id)) dup.push(x.id)
        seen.add(x.id)
      }
      expect(dup, `表 ${name} 有重复 id:${dup.join('、')} —— 查表只会取到后写的那条`).toEqual([])
    }
  })

  /**
   * 显示名也要唯一 —— id 唯一不等于名字唯一。
   *
   * 上面那条守的是查表键,玩家看不到;玩家看到的是 `name`。
   * 两件都叫「静心锁」时,查表不会出错,但列表里就是两条一样的名字,
   * 那正是「各件之间区分度不够」最直接的一种。
   * 只收按「一类一物」设计的表;装备/词缀/灵材的名字按设计会有复用(同款不同阶),不收。
   * 故障注入:把任一表的两个 name 改成同一个,本条红。
   */
  it('各表显示名无重复', () => {
    const TABLES: Array<[string, ReadonlyArray<{ name: string }>]> = [
      ['artifacts', ARTIFACTS],
      ['pets', PETS],
      ['gongfa', GONGFA],
      ['titles', TITLES],
      ['pills', PILLS]
    ]
    for (const [name, list] of TABLES) {
      const seen = new Set<string>()
      const dup: string[] = []
      for (const x of list) {
        if (seen.has(x.name)) dup.push(x.name)
        seen.add(x.name)
      }
      expect(dup, `表 ${name} 有重复显示名:${dup.join('、')} —— 玩家会在列表里看到两条一样的`).toEqual([])
    }
  })

  it('区域引用的敌人阶级与该区域阶级不相差太远', () => {
    const far = REGIONS.filter(r => r.enemies.some(id => Math.abs((enemyDef(id)?.tier ?? 0) - r.tier) > 4))
    expect(far.map(r => r.id), `这些区域挂着阶级差 >4 的怪:${far.map(r => r.id).join('、')}`).toEqual([])
  })
})

describe('数据完整性 · 内容门槛必须可达', () => {
  const MAX_REGION_TIER = Math.max(...REGIONS.map(r => r.tier))
  const MAX_QUALITY_RANK = Math.max(...QUALITIES.map(q => q.rank))
  const MAX_STAGE = Math.max(...SAMSARA_STAGES.map(s => s.index))

  it('命题的 minStage 不超阶位;每个阶位都够三条可选', () => {
    for (const t of LIFE_THEMES) {
      expect(t.minStage, `命题「${t.name}」要第 ${t.minStage} 阶,而阶位只到 ${MAX_STAGE}`).toBeLessThanOrEqual(MAX_STAGE)
    }
    for (const st of SAMSARA_STAGES) {
      const avail = LIFE_THEMES.filter(t => t.minStage <= st.index).length
      expect(avail, `阶位「${st.name}」只有 ${avail} 条命题可选,不够三条`).toBeGreaterThanOrEqual(3)
    }
  })

  it('最高区域层级与最高品质档位与数据一致(门槛类判据的上界来源)', () => {
    expect(MAX_REGION_TIER).toBeGreaterThan(0)
    expect(MAX_QUALITY_RANK).toBe(8)
    expect(MAX_MAJOR).toBeGreaterThan(0)
  })
})
