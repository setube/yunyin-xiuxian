/**
 * 度劫机关(gauntlet.ts)—— runGauntlet 原始波次环单测。
 *
 * runGauntlet 此前只在远征/试炼/相元挑战里被**间接**覆盖(integration 断言
 * cleared→fightsWon===fights),波次环本身(全胜即清/中途败停当层/零波)从未作为
 * 被测单元直接验证过。这里的核心契约:
 *   cleared ⇔ 全部波次都打赢(fightsWon === foes.length);
 *   中途某场败 → 立即停:cleared=false、fightsWon=已胜场数、rows 含败的那场;
 *   零波 → cleared=true、fightsWon=0。
 *
 * 确定性:runGauntlet 把 rng 作为**形参**(非全局),这里喂固定种子的 RandomService,
 * 战报完全确定;用「满维碾压 vs 纸糊」的极大幅差(1e9 vs 100)让任何随机骰都改变不了
 * 胜负。snap 需带 skills([])才走通 resolveCombat。
 */
import { describe, expect, it } from 'vitest'
import { RandomService, mulberry32 } from '@/utils/random'
import { gn } from '@/utils/gnum'
import { runGauntlet } from './gauntlet'
import type { CombatantSnap } from '@/types'

const rng = new RandomService(mulberry32(999))

/** 满维碾压玩家:攻/防/血爆表,一击一个、谁也别想打死它 */
const GOD: CombatantSnap = { name: 'god', icon: 'p', isPlayer: true, attack: gn(1e9), defense: gn(1e9), maxHp: gn(1e9), speed: 1, mods: {}, skills: [] }

/** 纸糊玩家:一下都吃不起 */
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
    // 每场 rows 都胜,战报行数与胜场数一致
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
    const r = runGauntlet(WEAK, [foe('a', 1e9, 100)], undefined, 0, rng)
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
})
