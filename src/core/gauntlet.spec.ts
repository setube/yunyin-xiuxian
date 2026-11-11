/**
 * 度劫机关(gauntlet.ts)· runGauntlet 波次环单测
 * rng 为形参,喂固定种子;1e9 vs 100 的幅差让随机骰改变不了胜负。
 * snap 须带 skills([])才走通 resolveCombat。
 */
import { describe, expect, it } from 'vitest'
import { RandomService, mulberry32 } from '@/utils/random'
import { gn } from '@/utils/gnum'
import { runGauntlet } from './gauntlet'
import type { CombatantSnap } from '@/types'

const rng = new RandomService(mulberry32(999))

/** 满维碾压玩家 */
const GOD: CombatantSnap = { name: 'god', icon: 'p', isPlayer: true, attack: gn(1e9), defense: gn(1e9), maxHp: gn(1e9), speed: 1, mods: {}, skills: [] }

/** 纸糊玩家 */
const WEAK: CombatantSnap = { name: 'weak', icon: 'p', isPlayer: true, attack: gn(100), defense: gn(1), maxHp: gn(100), speed: 1, mods: {}, skills: [] }

function foe(name: string, atk: number, hp: number): CombatantSnap {
  return { name, icon: 'f', isPlayer: false, attack: gn(atk), defense: gn(1), maxHp: gn(hp), speed: 1, mods: {}, skills: [] }
}

describe('度劫机关 · 波次环(runGauntlet)', () => {
  it('全胜即清:打满全部波次,cleared=true、fightsWon=波数、逐场记 rows', () => {
    const r = runGauntlet(GOD, [foe('a', 1, 100), foe('b', 1, 100), foe('c', 1, 100)], undefined, 0, rng)
    expect(r.cleared).toBe(true)
    expect(r.fightsWon).toBe(3)
    expect(r.rows).toHaveLength(3)
    expect(r.rows.map(x => x.win)).toEqual([true, true, true])
    expect(r.rows.map(x => x.foeName)).toEqual(['a', 'b', 'c'])
    expect(r.totalRounds).toBeGreaterThanOrEqual(3)
  })

  it('中途败即停当层:第一场胜、第二场被碾压 → cleared=false、fightsWon=已胜场数、败场也进 rows', () => {
    const r = runGauntlet(WEAK, [foe('a', 1, 10), foe('b', 1e9, 100)], undefined, 0, rng)
    expect(r.cleared).toBe(false)
    expect(r.fightsWon).toBe(1)
    expect(r.rows).toHaveLength(2) // 含败的那场
    expect(r.rows[0]!.win).toBe(true)
    expect(r.rows[1]!.win).toBe(false)
    expect(r.rows[1]!.foeName).toBe('b')
  })

  it('首场即败:fightsWon=0、rows 只记败的那一场', () => {
    /*
     * 独立种子,不复用模块级 `rng`。
     *
     * 模块级 `rng`(seed 999)被全组按顺序消费:上面几条用例已经把它推到某个位置,
     * 而 seed 999 的**第一个**随机值恰好让纸糊玩家赢下这一场 ——
     * 实测把本组打乱后,这条就红(`cleared` 该为 false 却为 true)。
     * 这条要验的是「必败时的记录形状」,与骰子无关,故给它自己的必输种子。
     */
    const r = runGauntlet(WEAK, [foe('a', 1e9, 100)], undefined, 0, new RandomService(mulberry32(1)))
    expect(r.cleared).toBe(false)
    expect(r.fightsWon).toBe(0)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]!.win).toBe(false)
  })

  it('零波:一道机关都没有 → 直接清,cleared=true、fightsWon=0、无 rows', () => {
    const r = runGauntlet(GOD, [], undefined, 0, rng)
    expect(r.cleared).toBe(true)
    expect(r.fightsWon).toBe(0)
    expect(r.rows).toHaveLength(0)
  })

  it('违契终止:该场明明胜了,fightsWon 要计入这一胜,跟 rows 的 win=true 一致', () => {
    // 独立种子,不依赖其它用例消费 stream;胜后血量 < 80% 契线即违契停
    const rrng = new RandomService(mulberry32(7))
    const p: CombatantSnap = { name: 'p', icon: 'p', isPlayer: true, attack: gn(200), defense: gn(1), maxHp: gn(500), speed: 1, mods: {}, skills: [] }
    const r = runGauntlet(p, [foe('a', 300, 200)], undefined, 0, rrng, { minHpAfterFight: 0.8 })
    expect(r.cleared).toBe(false)
    expect(r.pactBroken).toBe(true)
    expect(r.rows[0]!.win).toBe(true)
    expect(r.fightsWon).toBe(1) // 不计入则展示报「止步/败」,与赢行矛盾
  })
})
