/**
 * 属性来源明细 —— 「这个数从哪来」必须真的算得回来
 *
 * 面板上写「攻击 +42%」时,玩家迟早会问那 42% 是谁给的。答不上来(或者答得
 * 对不上)比不答更糟:一堆数字并排列着,相加却不是上面那个数,等于告诉他
 * 「这些数你不必信」。
 *
 * 这件事比看上去难:合并里有**两道非线性** —— 递减词条按来源强弱排队打折
 * (100%/75%/50%/25%),软阈值再对合计折算。直接把各来源的原始值列出来,
 * 明细之和必然对不上面板;故 mergeModsDetailed 把两道折算都摊回来源身上,
 * 这里守的就是「摊得对」:
 *
 *   一 逐键核对:明细之和 = 面板值(只算非「另乘」的那些);
 *   二 面板上出现的每个键,明细里都得有解释(不许出现无人认领的加成);
 *   三 来源必须具名 —— 名字漏写的会显示成「来源 N」,这条把它拦在测试里。
 *
 * 故障注入:把 mergeModsDetailed 里的软阈值折算去掉、或删掉「道果(修炼)」那一条
 * (computeFinalStats),本文件立刻变红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
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

/** 明细之和(只算并入百分比的行,CultivationSpeed 的钳制与实现同口径) */
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
    // 递减词条的合计仍与 mergeMods 一致(两者是同一套算法)
    expect(mods).toEqual(mergeMods(sources))
    // 且按来源降序打折:强的吃满,弱的吃 75%/50%
    expect(effective[0]!.counterRate).toBeCloseTo(0.1, 10)
    expect(effective[1]!.counterRate).toBeCloseTo(0.08 * 0.75, 10)
    expect(effective[2]!.counterRate).toBeCloseTo(0.05 * 0.5, 10)
    // 逐键相加 = 合并值(这就是面板要显示的口径)
    for (const k of ['counterRate', 'attackPct'] as AnyStatKey[]) {
      const sum = effective.reduce((s, e) => s + (e[k] ?? 0), 0)
      expect(sum, `${k} 的明细之和与合并值不符`).toBeCloseTo(mods[k] ?? 0, 10)
    }
  })

  it('越过软阈值时,折算同乘到每个来源身上 —— 明细之和依旧等于面板值', () => {
    // 暴击率软阈值 75%:两份各 60% 必然越界,合计要被折算
    const { mods, effective } = mergeModsDetailed([{ critRate: 0.6 }, { critRate: 0.6 }])
    const cap = SOFT_CAPS.critRate!
    // 先过递减词条(第二份吃 75%):0.6 + 0.6×0.75 = 1.05,再被软阈值折到 75% + 超出×50%
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
      // 修炼速度带钳制(不低于 -90%),其余键应当逐分对上
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

  /**
   * 修行页那一行字:「基础 × (1 + 各来源之和) = 修为/秒」。
   *
   * 修行速度是玩家盯得最紧的数,而它比别的属性多一层:页面把基础与加成拆开写,
   * 于是三个数必须真的乘得回来 —— 否则玩家照着算一遍,发现对不上,
   * 比不给解释更糟。
   */
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
  /** 构造一个修炼速度合计可控的 StatsInput(其余字段取零基准) */
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
    // 给定:低于阈值的修炼速度(T - 0.5),落在正常构筑区间
    const raw = CULT_SPEED_SOFT_CAP_T - 0.5
    const stats = computeFinalStats(cultInput({ cultivationSpeed: raw }))
    // 那么:软阈值不介入,面板值与输入逐位一致(bit-identical)
    expect(modOf(stats.mods, 'cultivationSpeed')).toBe(raw)
    // 且:未越过阈值时不标「软」、折算系数恒 1(展示层的份额原样呈现)
    expect(stats.cultSpeedSoftCapped).toBe(false)
    expect(stats.cultSpeedFactor).toBe(1)
  })

  it('给定合计越过阈值:超出部分被削弱,增长衰减(极端轮回堆叠的兜底)', () => {
    // 给定:多轮回堆叠把修炼速度推上阈值以上(T + 1)
    const raw = CULT_SPEED_SOFT_CAP_T + 1
    const stats = computeFinalStats(cultInput({ cultivationSpeed: raw }))
    // 那么:只对超出 (raw - T) 的部分打折,面板值 = T + 超出 × diminish
    const expected = CULT_SPEED_SOFT_CAP_T + (raw - CULT_SPEED_SOFT_CAP_T) * CULT_SPEED_SOFT_CAP_DIMINISH
    expect(modOf(stats.mods, 'cultivationSpeed')).toBeCloseTo(expected, 8)
    // 且:仍高于阈值(不是砍回阈值),但明显低于未封顶的原始值
    expect(modOf(stats.mods, 'cultivationSpeed')).toBeGreaterThan(CULT_SPEED_SOFT_CAP_T)
    expect(modOf(stats.mods, 'cultivationSpeed')).toBeLessThan(raw)
    // 且:越过阈值时标「软」,折算系数 = 封顶值/原值(展示层份额据此压低)
    expect(stats.cultSpeedSoftCapped).toBe(true)
    expect(stats.cultSpeedFactor).toBeCloseTo(expected / raw, 8)
  })

  it('给定越过阈值的合计:折算同乘摊回来源,明细之和 == 面板值', () => {
    // 给定:越过阈值的合计
    const stats = computeFinalStats(cultInput({ cultivationSpeed: CULT_SPEED_SOFT_CAP_T + 1 }))
    const sum = stats.breakdown
      .filter(r => !r.onTop)
      .reduce((s, r) => s + (r.mods.cultivationSpeed ?? 0), 0)
    // 那么:来源明细之和依旧等于面板值,不合糊
    expect(sum).toBeCloseTo(modOf(stats.mods, 'cultivationSpeed'), 8)
  })

  it('越过阈值时,道果「当前修行 +%」展示的那一份 = effectiveDaoFruit×倍率×折算系数(不虚报)', () => {
    // 给定:道果 + 功法把修炼速度推到阈值以上 —— 引擎对道果那一份也乘同一个 cultSpeedFactor
    const fruit = 30
    const input = { ...cultInput({ cultivationSpeed: CULT_SPEED_SOFT_CAP_T + 0.5 }), daoFruit: fruit }
    const stats = computeFinalStats(input)
    // 前提:本输入确实越过了阈值(否则这条测试没有在守东西)
    expect(stats.cultSpeedSoftCapped).toBe(true)
    // 明细里「道果(修炼)」那一行 = 引擎计入的份额
    const row = stats.breakdown.find(r => r.name === '道果(修炼)')!
    const eff = effectiveDaoFruit(fruit)
    // 展示层(CharacterView)就是用 eff × DAO_FRUIT_CULT_BONUS × cultSpeedFactor 显示 —— 应恰为面板那份
    expect(row.mods.cultivationSpeed!).toBeCloseTo(eff * DAO_FRUIT_CULT_BONUS * stats.cultSpeedFactor, 8)
    // 对照:若有人把展示层改回未折算的 eff × DAO_FRUIT_CULT_BONUS,会虚报(明显大于面板那份)
    expect(eff * DAO_FRUIT_CULT_BONUS).toBeGreaterThan(row.mods.cultivationSpeed!)
  })
})
