/**
 * 递减打折与软阈值折算都须由 mergeModsDetailed 摊回来源。
 * 故障注入:去掉 mergeModsDetailed 的软阈值折算,或删掉 computeFinalStats 的「道果(修炼)」一条,本文件红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { AnyStatKey, StatMods } from '@/types'
import { mergeMods, mergeModsDetailed, computeFinalStats, modOf, effectiveDaoFruit } from './statsCalc'
import { baseCultPerSec } from './formulas'
import { SOFT_CAPS, CULT_SPEED_SOFT_CAP_T, CULT_SPEED_SOFT_CAP_DIMINISH, DAO_FRUIT_CULT_BONUS } from '@/data/constants'
import { gnZero } from '@/utils/gnum'
import type { StatsInput } from './statsCalc'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'

/** 明细之和(只算并入百分比的行) */
function summedBreakdown(rows: { mods: StatMods; onTop?: boolean }[]): StatMods {
  const out: StatMods = {}
  for (const r of rows) {
    if (r.onTop) continue
    for (const k in r.mods) {
      const key = k as AnyStatKey
      const v = r.mods[key]
      if (typeof v !== 'number' || v === 0) continue
      out[key] = (out[key] ?? 0) + v
    }
  }
  return out
}

describe('属性来源明细 · 合并的两道折算都要摊回来源', () => {
  it('递减词条打折后的那一份,记在给它的那个来源名下', () => {
    const sources: StatMods[] = [
      { counterRate: 0.1, attackPct: 0.2 },
      { counterRate: 0.08 },
      { counterRate: 0.05 }
    ]
    const { mods, effective } = mergeModsDetailed(sources)
    expect(mods).toEqual(mergeMods(sources))
    expect(effective[0]!.counterRate).toBeCloseTo(0.1, 10)
    expect(effective[1]!.counterRate).toBeCloseTo(0.08 * 0.75, 10)
    expect(effective[2]!.counterRate).toBeCloseTo(0.05 * 0.5, 10)
    for (const k of ['counterRate', 'attackPct'] as AnyStatKey[]) {
      const sum = effective.reduce((s, e) => s + (e[k] ?? 0), 0)
      expect(sum, `${k} 的明细之和与合并值不符`).toBeCloseTo(mods[k] ?? 0, 10)
    }
  })

  it('越过软阈值时,折算同乘到每个来源身上 —— 明细之和依旧等于面板值', () => {
    // 暴击率软阈值 75%
    const { mods, effective } = mergeModsDetailed([{ critRate: 0.6 }, { critRate: 0.6 }])
    const cap = SOFT_CAPS.critRate!
    // 先过递减(第二份 ×0.75),再过软阈值
    const beforeSoftCap = 0.6 + 0.6 * 0.75
    expect(mods.critRate!, '两份 60% 暴击本就该进软阈值区').toBeLessThan(1.2)
    expect(mods.critRate!).toBeCloseTo(cap.cap + (beforeSoftCap - cap.cap) * cap.diminish, 10)
    const sum = effective.reduce((s, e) => s + (e.critRate ?? 0), 0)
    expect(sum, '软阈值折算没有摊回来源,明细之和会对不上面板').toBeCloseTo(mods.critRate!, 10)
  })
})

describe('属性来源明细 · 面板读的那一份', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('真存档里:明细之和 = 面板值,且每个键都有人认领', () => {
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    player.major = 4
    cultivation.learn('m_taixuan')
    useInventoryStore().addArtifact('af_youming')
    player.reincarnation.daoFruit = 12
    player.reincarnation.talents = ['t_fuyuan']

    const stats = player.finalStats
    const summed = summedBreakdown(stats.breakdown)
    expect(stats.breakdown.length, '明细为空 —— 面板没东西可显示').toBeGreaterThan(0)
    for (const k in stats.mods) {
      const key = k as AnyStatKey
      const panel = stats.mods[key] ?? 0
      if (panel === 0) continue
      const explained = summed[key] ?? 0
      // 修炼速度带钳制(不低于 -90%),与实现同口径
      const expected = key === 'cultivationSpeed' ? Math.max(-0.9, explained) : explained
      expect(expected, `${key}:面板 ${panel} 与明细之和 ${explained} 不符`).toBeCloseTo(panel, 8)
    }
  })

  it('来源都有名字 —— 谁新增了来源却忘了起名,这里点名', () => {
    const player = usePlayerStore()
    player.reincarnation.daoFruit = 3
    const unnamed = player.finalStats.breakdown.filter(r => /^来源 \d+$/.test(r.name))
    expect(unnamed.map(r => r.name), '有来源没写名字,面板会显示成「来源 N」').toEqual([])
  })

  it('道果的账分得清:修炼那一份并入百分比,攻防血那一份标成「另乘」', () => {
    const player = usePlayerStore()
    player.reincarnation.daoFruit = 30
    const rows = player.finalStats.breakdown
    const cult = rows.find(r => r.name === '道果(修炼)')
    const combat = rows.find(r => r.name === '道果(攻防血)')
    expect(cult, '道果对修炼的加成没人认领').toBeDefined()
    expect(cult!.onTop).toBeFalsy()
    expect(combat, '道果对攻防血的加成没人认领').toBeDefined()
    expect(combat!.onTop, '这一份是乘上去的,不能混进百分比相加').toBe(true)
  })

  it('修行页那行字与引擎速率对得上:基础 × (1 + 来源之和) = cultPerSec', () => {
    const player = usePlayerStore()
    player.major = 6
    player.sub = 3
    player.reincarnation.talents = ['t_fuyuan']
    player.reincarnation.daoFruit = 16
    const breakdownSum = player.finalStats.breakdown
      .filter(r => !r.onTop)
      .reduce((s, r) => s + (r.mods.cultivationSpeed ?? 0), 0)
    expect(breakdownSum, '来源之和与面板上的总加成不符').toBeCloseTo(modOf(player.finalStats.mods, 'cultivationSpeed'), 8)
    const expected = baseCultPerSec(player.major, player.sub) * Math.max(0.05, 1 + breakdownSum)
    expect(player.cultPerSec, '基础 × (1 + 来源之和) 不等于引擎算出的速率').toBeCloseTo(expected, 6)
  })
})

describe('修炼速度软阈值(computeFinalStats 那道防线)', () => {
  /** 修炼速度可控的 StatsInput,其余字段取零基准 */
  function cultInput(mods: StatMods): StatsInput {
    return {
      major: 0,
      sub: 0,
      linggenMult: 1,
      modSources: [mods],
      sourceNames: ['测试源'],
      equipFlats: { attack: gnZero(), defense: gnZero(), maxHp: gnZero() },
      daoFruit: 0,
      qiRich: false
    }
  }

  it('给定合计低于阈值:软阈值完全休眠,输出 == 输入(常规构筑分毫不动)', () => {
    const raw = CULT_SPEED_SOFT_CAP_T - 0.5
    const stats = computeFinalStats(cultInput({ cultivationSpeed: raw }))
    expect(modOf(stats.mods, 'cultivationSpeed')).toBe(raw)
    expect(stats.cultSpeedSoftCapped).toBe(false)
    expect(stats.cultSpeedFactor).toBe(1)
  })

  it('给定合计越过阈值:超出部分被削弱,增长衰减(极端轮回堆叠的兜底)', () => {
    const raw = CULT_SPEED_SOFT_CAP_T + 1
    const stats = computeFinalStats(cultInput({ cultivationSpeed: raw }))
    const expected = CULT_SPEED_SOFT_CAP_T + (raw - CULT_SPEED_SOFT_CAP_T) * CULT_SPEED_SOFT_CAP_DIMINISH
    expect(modOf(stats.mods, 'cultivationSpeed')).toBeCloseTo(expected, 8)
    expect(modOf(stats.mods, 'cultivationSpeed')).toBeGreaterThan(CULT_SPEED_SOFT_CAP_T)
    expect(modOf(stats.mods, 'cultivationSpeed')).toBeLessThan(raw)
    expect(stats.cultSpeedSoftCapped).toBe(true)
    expect(stats.cultSpeedFactor).toBeCloseTo(expected / raw, 8)
  })

  it('给定越过阈值的合计:折算同乘摊回来源,明细之和 == 面板值', () => {
    const stats = computeFinalStats(cultInput({ cultivationSpeed: CULT_SPEED_SOFT_CAP_T + 1 }))
    const sum = stats.breakdown
      .filter(r => !r.onTop)
      .reduce((s, r) => s + (r.mods.cultivationSpeed ?? 0), 0)
    expect(sum).toBeCloseTo(modOf(stats.mods, 'cultivationSpeed'), 8)
  })

  it('越过阈值时,道果「当前修行 +%」展示的那一份 = effectiveDaoFruit×倍率×折算系数(不虚报)', () => {
    const fruit = 30
    const input = { ...cultInput({ cultivationSpeed: CULT_SPEED_SOFT_CAP_T + 0.5 }), daoFruit: fruit }
    const stats = computeFinalStats(input)
    // 前提:确实越过阈值,否则本条空转
    expect(stats.cultSpeedSoftCapped).toBe(true)
    const row = stats.breakdown.find(r => r.name === '道果(修炼)')!
    const eff = effectiveDaoFruit(fruit)
    // 须与展示层(CharacterView)同式
    expect(row.mods.cultivationSpeed!).toBeCloseTo(eff * DAO_FRUIT_CULT_BONUS * stats.cultSpeedFactor, 8)
    // 对照:未折算的式子会虚报
    expect(eff * DAO_FRUIT_CULT_BONUS).toBeGreaterThan(row.mods.cultivationSpeed!)
  })
})

/**
 * 「来源明细」的名字与 mod 源必须一一对应。
 *
 * `computeFinalStats` 按索引配对:`input.modSources.map((_, i) => name: sourceNames?.[i] ?? '来源 N')`。
 * player store 里有两处 `modSources` / `sourceNames` 并列数组(凡界一套、天界一套),
 * 注释写着「须与上面一一对应」,但没有任何判据。
 *
 * 错位的后果不是崩,而是**把数值归到错误的名字下**:面板照常显示,
 * 玩家看到「灵脉 +12%」实际那是「称号」给的 —— 这类错误没有任何报错,也难靠肉眼发现。
 * 少一条则印出占位符「来源 12」。
 *
 * 判据:两处数组的**固定项**条数相等(天赋那一段是展开的,两边都用同一个 spread,天然对齐)。
 */
describe('属性来源明细 · 名字与 mod 源一一对应', () => {
  const SRC = readFileSync(resolve(__dirname, '../stores/player.ts'), 'utf-8')

  /** 取出某个键的数组字面量正文(到配对的 ] 为止) */
  function arrayBody(key: string, from = 0): string {
    const at = SRC.indexOf(`${key}: [`, from)
    expect(at, `找不到 ${key}: [`).toBeGreaterThan(-1)
    const open = SRC.indexOf('[', at)
    let depth = 0
    for (let i = open; i < SRC.length; i += 1) {
      if (SRC[i] === '[') depth += 1
      else if (SRC[i] === ']') {
        depth -= 1
        if (depth === 0) return SRC.slice(open + 1, i)
      }
    }
    return ''
  }

  /**
   * 数「顶层项」:去掉嵌套括号后按逗号切。
   *
   * **必须先剥注释** —— modSources 第一项上方挂着一整段块注释,
   * 里面的逗号会被当成项分隔符(实测把 13 项数成 14 项,判据当场误报)。
   */
  function topLevelCount(body: string): number {
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    let depth = 0
    let count = 0
    for (const ch of code) {
      if ('([{'.includes(ch)) depth += 1
      else if (')]}'.includes(ch)) depth -= 1
      else if (ch === ',' && depth === 0) count += 1
    }
    return count + (code.trim() ? 1 : 0)
  }

  it('凡界那套:modSources 与 sourceNames 条数相等', () => {
    const sources = topLevelCount(arrayBody('modSources'))
    const names = topLevelCount(arrayBody('sourceNames'))
    expect(sources, 'modSources 一项都没数到').toBeGreaterThan(5)
    expect(names, `modSources ${sources} 条、sourceNames ${names} 条 —— 明细会错位`).toBe(sources)
  })

  it('天界那套:modSources 与 sourceNames 条数相等', () => {
    const second = SRC.indexOf('modSources: [', SRC.indexOf('modSources: [') + 1)
    expect(second, '找不到第二处 modSources —— 判据要跟着改名').toBeGreaterThan(-1)
    const sources = topLevelCount(arrayBody('modSources', second))
    const names = topLevelCount(arrayBody('sourceNames', second))
    expect(names, `天界:modSources ${sources} 条、sourceNames ${names} 条 —— 明细会错位`).toBe(sources)
  })

  it('两处都用同一个 spread 处理天赋,不会各自错位', () => {
    const spreads = [...SRC.matchAll(/\.\.\.(\w*[Tt]alent\w*)/g)].map(m => m[1])
    expect(spreads.length, '天赋 spread 不见了').toBeGreaterThanOrEqual(2)
    expect(new Set(spreads).size, '两处用了不同的天赋来源').toBe(1)
  })
})
