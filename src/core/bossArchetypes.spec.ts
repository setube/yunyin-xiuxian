/**
 * Boss 机制家族(bossArchetypes.ts)—— 数据完整性守卫。
 *
 * ARCHETYPES(8 种机制家族)此前零 spec 覆盖:只有 samsara.spec 里一行注释提及。
 * 每场 Boss 战都吃这张表(核心词条/技能/相位/数值人格);任一相位阈值越界、
 * 倍率 NaN、印重复都会静默腐蚀 Boss 行为。这里把表的形状钉死(沿 r281 路线树
 * / r295 soulForge 数据守卫同款):键与类型联合一一对应、无缺无余、域值有限有界。
 */
import { describe, expect, it } from 'vitest'
import { ARCHETYPES, type ArchetypeDef } from './bossArchetypes'
import type { BossArchetype } from '@/types'

// 与 types/index.ts 的 BossArchetype 联合逐字对齐：数据表必须恰好覆盖这 8 个
const EXPECTED_ARCHETYPES: BossArchetype[] = [
  'berserk', 'counter', 'truedmg', 'antiheal', 'spellbane', 'evasive', 'attrition', 'threshold'
]

const STAT_PERSONALITY_KEYS = ['atkMult', 'defMult', 'hpMult'] as const

describe('Boss 机制家族 · 数据结构', () => {
  it('键与类型联合一一对应:无缺无余、无重复(round-trip)', () => {
    const keys = Object.keys(ARCHETYPES) as BossArchetype[]
    // 不重复
    expect(new Set(keys).size).toBe(keys.length)
    // 恰好覆盖全部 8 个(多一个指出 type 没合并进来,少一个指出数据漏了)
    expect([...keys].sort()).toEqual([...EXPECTED_ARCHETYPES].sort())
  })

  it('每个家族的 id 与键一致,名/印/述非空', () => {
    for (const [key, def] of Object.entries(ARCHETYPES) as Array<[BossArchetype, ArchetypeDef]>) {
      expect(def.id, `${key} id`).toBe(key)
      expect(def.name, `${key} name`).toBeTruthy()
      expect(def.desc, `${key} desc`).toBeTruthy()
    }
  })

  it('印(seal)各唯一且为单个汉字(异族不共形、一句一印)', () => {
    const seals = Object.values(ARCHETYPES).map(d => d.seal)
    expect(new Set(seals).size, '印不得重复').toBe(seals.length)
    for (const s of seals) {
      expect(s.length, `印「${s}」应为一个汉字`).toBe(1)
      expect(/\p{Script=Han}/u.test(s), `印「${s}」非汉字`).toBe(true)
    }
  })

  it('核心词条(coreMods)全为有限数', () => {
    for (const [key, def] of Object.entries(ARCHETYPES) as Array<[string, ArchetypeDef]>) {
      for (const v of Object.values(def.coreMods)) {
        expect(Number.isFinite(v), `${key} coreMods 含非有限值`).toBe(true)
      }
    }
  })

  it('数值人格:攻/防/血倍率均有限且为正(不该出现 0/负/NaN 的 Boss)', () => {
    for (const [key, def] of Object.entries(ARCHETYPES) as Array<[string, ArchetypeDef]>) {
      for (const k of STAT_PERSONALITY_KEYS) {
        const v = def.statPersonality[k]
        expect(Number.isFinite(v), `${key} statPersonality.${k}`).toBe(true)
        expect(v! > 0, `${key} statPersonality.${k} 应>0`).toBe(true)
      }
    }
  })

  it('相位阈值在 (0,1) 内,多相位严格递减(跌破才进,顺序不能乱)', () => {
    for (const [key, def] of Object.entries(ARCHETYPES) as Array<[string, ArchetypeDef]>) {
      const ph = def.phases
      for (let i = 0; i < ph.length; i += 1) {
        const t = ph[i]!.hpThreshold
        expect(t > 0 && t < 1, `${key} phase[${i}] hpThreshold=${t} 应 ∈(0,1)`).toBe(true)
        if (i > 0) {
          expect(ph[i]!.hpThreshold, `${key} 相位阈值应严格递减`).toBeLessThan(ph[i - 1]!.hpThreshold)
        }
      }
    }
  })

  it('技能(核心/相位)mult 有限为正,rate 在 (0,1] 内', () => {
    for (const [key, def] of Object.entries(ARCHETYPES) as Array<[string, ArchetypeDef]>) {
      const skills = [...def.coreSkills, ...def.phases.flatMap(p => p.skillChanges ?? [])]
      for (const sk of skills) {
        expect(Number.isFinite(sk.mult) && sk.mult > 0, `${key} skill "${sk.name}" mult`).toBe(true)
        expect(sk.rate > 0 && sk.rate <= 1, `${key} skill "${sk.name}" rate`).toBe(true)
        expect(sk.name, `${key} 技能名非空`).toBeTruthy()
      }
    }
  })
})
