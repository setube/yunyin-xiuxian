/**
 * 术数四门「描述即承诺」接线完整性 —— 卦力/命格/值日/择门 都真进玩法,不许纯显示。
 *
 * 回归点:四门术数(周易问卦 / 紫微命格 / 奇门择门 / 星象值日)此前逐条核实都已接进
 * 玩法(卦入 finalStats.mods、命格入 finalStats.mods、值日入 exploreEventChance、
 * 择门入交给 runGauntlet 的 CombatRules),但**没有任何东西逼一条未来的术数线自己交代
 * 玩法落点** —— 新加一门只当纯摆设也会静默过 CI。这里给整族钉住「描述即承诺」。
 *
 * 判据取真实落点(不是"函数存在"):
 *  - 卦力:在身之卦的词条真的并入 finalStats.mods(正值生效)
 *  - 命格:紫微一世之格的词条真的并入 finalStats.mods(正值生效)
 *  - 值日:今日星象所利的地界际遇更高,他处不加(exploreEventChance 拉开)
 *  - 择门:八门各自产出不同的 CombatRules —— 交到 runGauntlet 的就是这个对象
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { AnyStatKey, DaoMark, LinggenProfile } from '@/types'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
import { readingOfLines, readingMods } from '@/core/divination'
import { fateSeed, fateChart, fateMods } from '@/core/fate'
import { markRules } from '@/core/endgameService'
import { todayMansion, favoredWorld, mansionEventLuck } from '@/core/astronomy'
import { exploreEventChance } from '@/core/exploration'
import { GATES } from '@/data/qimen'
import { MANSION_EVENT_LUCK } from '@/data/constants'

describe('术数四门接线完整性 —— 描述即承诺', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('卦力:在身之卦的词条真正并入 finalStats.mods,不是摆设', () => {
    const player = usePlayerStore()
    // 自选一卦确有卦力(扫常见六爻,取首个卦力非零者);卦的效力靠数据,不靠猜
    const candidates: number[][] = [
      [1, 1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1, 0],
      [0, 0, 1, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [0, 1, 0, 1, 0, 1],
      [1, 0, 0, 1, 1, 0]
    ]
    let reading: ReturnType<typeof readingOfLines> = null
    let key: AnyStatKey | undefined
    let val = 0
    for (const lines of candidates) {
      const r = readingOfLines(lines, [])
      const m = r ? readingMods(r) : {}
      const k = (Object.keys(m) as AnyStatKey[]).find(kk => m[kk] !== 0)
      if (k) {
        reading = r
        key = k
        val = m[k]!
        break
      }
    }
    expect(reading, '需找到一卦卦力非零,否则断言形同虚设').not.toBeNull()
    expect(key, '需找到一卦卦力非零,否则断言形同虚设').toBeDefined()
    const r = reading!
    player.divination = {
      hexagram: r.hexagram.name,
      upper: r.upper.id,
      lower: r.lower.id,
      changed: r.changed?.name ?? null,
      changing: r.changing,
      changingAt: r.changingAt,
      lines: r.lines,
      castAt: 0,
      expiresAt: Date.now() + 60_000
    }
    expect(player.finalStats.mods[key!], `在身之卦的 ${key} 应进 finalStats.mods`).toBeGreaterThanOrEqual(val)
  })

  it('紫微命格:一世之格的词条真正并入 finalStats.mods,不是摆设', () => {
    const player = usePlayerStore()
    const prof = {
      linggenName: '测试',
      gradeName: '测试',
      growthMult: 1,
      roots: [{ element: 'metal', aptitude: 40 }]
    } as unknown as LinggenProfile
    player.initCharacter('测', prof)
    player.reincarnation.count = 0
    const fateM = fateMods(fateChart(fateSeed(player.linggen, 0)))
    expect(Object.keys(fateM).length, '命格应产词条,否则断言形同虚设').toBeGreaterThan(0)
    const key = (Object.keys(fateM) as AnyStatKey[])[0]!
    expect(player.finalStats.mods[key], `命格词条 ${key} 应进 finalStats.mods`).toBeGreaterThanOrEqual(fateM[key]!)
  })

  it('值日:今日星象所利的地界际遇更高,他处不加', () => {
    const game = useGameStore()
    game.totalPlaySec = 0 // 游戏日 0:值日宿固定,界域确定
    expect(favoredWorld(todayMansion())).toBe('mortal')
    // 值日所利之地 +10%,他处不加
    expect(mansionEventLuck('qingyun')).toBeCloseTo(MANSION_EVENT_LUCK, 6)
    expect(mansionEventLuck('yunhai')).toBe(0)
    // 所利之地际遇真被星象推开
    expect(exploreEventChance('qingyun', {})).toBeGreaterThan(exploreEventChance('yunhai', {}))
  })

  it('奇门:择门真的换了交给战斗的行军规则,不只是一格存档', () => {
    const rendered = new Set<string>()
    for (const gate of GATES) {
      const mark = { daoPathId: null, context: { gateId: gate.id } } as unknown as DaoMark
      const rules = markRules(mark, undefined, undefined)
      expect(rules, `门「${gate.name}」应产出战斗规则`).toBeDefined()
      rendered.add(JSON.stringify(rules))
    }
    expect(rendered.size, '八门应各有不同的行军规则,择门才会真改战斗').toBe(GATES.length)
  })
})
