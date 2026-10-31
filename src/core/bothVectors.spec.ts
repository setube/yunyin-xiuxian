/**
 * 两份「规则向量」的维度清单。
 *
 * motivationType.ruleVector 与 worldGen 的私有 ruleVector 在名义上相似,
 * 原注释甚至写「同构」,但实测两者维度不同:
 *   motivation 侧含 playerStartHpPct、不含 critDamage
 *   worldGen   侧含 critDamage、不含 playerStartHpPct
 *
 * 这**不是缺陷** —— 两侧服务不同场景(生命命题常改开局气血,终局变数常改暴击之伤)。
 * 本条要钉的是「这件事被记住」:任一侧增删字段,维度清单就会变,测试即红,
 * 后来者必须先想清楚两套坐标是否需要同步,而不是默默改掉。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ruleVector } from './motivationType'

const worldGenSrc = readFileSync(resolve(__dirname, 'worldGen.ts'), 'utf-8')

/** 从 worldGen 源码里抽出私有 ruleVector 的数组元素个数 */
function worldGenVectorSize(): number {
  const m = /function ruleVector\(w: CelestialWorldDef\): number\[\] \{\s*const r = w\.rules\s*return \[([\s\S]*?)\]/.exec(worldGenSrc)
  const captured = m?.[1]
  if (captured === undefined) throw new Error('没找到 worldGen 的 ruleVector')
  // 每个元素以逗号分隔,最后一项可能没有尾逗号
  return captured.split(',').map(s => s.trim()).filter(s => s.length > 0).length
}

describe('规则向量 · 维度清单', () => {
  it('motivation 侧是 9 维', () => {
    expect(ruleVector({}).length, 'motivation 的 ruleVector 维度变了').toBe(9)
  })

  it('motivation 侧第 7 维是 playerStartHpPct,不是 dodgeRate', () => {
    expect(ruleVector({}).length).toBe(9)
    const withHp = ruleVector({ playerStartHpPct: 0.5 })
    expect(withHp[6], '第 7 维(下标 6)应是开局气血').toBeCloseTo(0.5)
    const withDodge = ruleVector({ enemyExtraMods: { dodgeRate: 0.3 } })
    expect(withDodge[6], '闪避不该落在第 7 维').toBeCloseTo(1)
    expect(withDodge[7], '闪避应落在第 8 维(下标 7)').toBeCloseTo(0.3)
  })

  it('motivation 侧不认 critDamage(它不在这一套坐标里)', () => {
    const base = ruleVector({})
    const withCrit = ruleVector({ playerExtraMods: { critDamage: 0.5 } })
    expect(withCrit, 'critDamage 不该影响 motivation 侧的向量').toEqual(base)
  })

  it('worldGen 侧是 9 维,且最后一维是 critDamage', () => {
    expect(worldGenVectorSize(), 'worldGen 的 ruleVector 维度变了').toBe(9)
    expect(worldGenSrc, 'worldGen 侧丢了 critDamage 维度').toContain('playerExtraMods?.critDamage')
  })

  it('worldGen 侧不认 playerStartHpPct —— 两套坐标确不同构', () => {
    // 这一条是本文件存在的原因:如果哪天有人把两套合并,这条会红,提醒重读注释
    const fn = /function ruleVector\(w: CelestialWorldDef\)[\s\S]*?\n\}/.exec(worldGenSrc)
    expect(fn, '没找到 worldGen 的 ruleVector 函数体').not.toBeNull()
    expect(fn![0], 'worldGen 侧出现了 playerStartHpPct,说明两套坐标已合并,请重读 motivationType 的注释').not.toContain(
      'playerStartHpPct'
    )
  })
})
