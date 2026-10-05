/* eslint-disable no-console -- 命中对闪避是"落空次数少了几成"的读数,打印出来便于复核 */
import { describe, expect, it } from 'vitest'
import type { CombatantSnap } from '@/types'
import { gn } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { enemyDef } from '@/data/enemies'
import { artifactDef } from '@/data/artifacts'
import { enemyPowerOf, makeEnemySnap, resolveCombat, sampleWinRate } from './combat'
import { toNum } from '@/utils/gnum'
import { powerScore } from './formulas'

const seeded = (seed = 1): RandomService => new RandomService(mulberry32(seed))

function playerSnap(power: number): CombatantSnap {
  return {
    name: '测试道人',
    icon: 'user',
    isPlayer: true,
    attack: gn(30 * power),
    defense: gn(15 * power),
    maxHp: gn(400 * power),
    speed: 1,
    mods: {},
    skills: [{ name: '试剑', mult: 1.6, rate: 0.25 }]
  }
}

describe('自动战斗', () => {
  const wolf = enemyDef('e_wolf')!

  it('敌战力标尺与 powerScore 同一把秤:由快照三维折出,不是界面另算', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const got = toNum(enemyPowerOf(enemy))
    const want = toNum(powerScore(enemy.attack, enemy.defense, enemy.maxHp))
    expect(got).toBeCloseTo(want, 6)
    // 层级越高战力越高:凡狼 (tier1) < 洪荒魔 (tier20)
    const far = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 2)
    expect(toNum(enemyPowerOf(far))).toBeGreaterThan(got)
  })

  it('碾压级战力必胜,战报以胜利收尾', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const result = resolveCombat(playerSnap(100), enemy, seeded(3))
    expect(result.win).toBe(true)
    expect(result.log[result.log.length - 1]!.t).toBe('win')
  })

  /**
   * 先手判定随战斗结果带出(供战后分析讲清「差多少」)。
   *
   * 判据是**阈值**语义本身:1 + 先手判定修正 ≥ 对手速度 才算抢先,差一点就是没有 ——
   * 这条一旦被写成连续收益,词条文案与分析面板就又要开始撒谎。
   */
  it('先手判定如实带出:恰好持平也算抢先,差一点就不算', () => {
    const enemy = { ...makeEnemySnap(wolf, 1, 1), speed: 1.1 }
    const atPar = resolveCombat({ ...playerSnap(10), mods: { speed: 0.1 } }, enemy, seeded(7))
    expect(atPar.firstMove, '战果里应当带上先手判定').toBeDefined()
    expect(atPar.firstMove!.playerSpeed).toBeCloseTo(1.1, 10)
    expect(atPar.firstMove!.enemySpeed).toBeCloseTo(1.1, 10)
    expect(atPar.firstMove!.playerFirst, '持平即抢先(≥)').toBe(true)

    const justShort = resolveCombat({ ...playerSnap(10), mods: { speed: 0.09 } }, enemy, seeded(7))
    expect(justShort.firstMove!.playerFirst, '差 0.01 就是没抢先').toBe(false)
    expect(justShort.firstMove!.playerSpeed).toBeCloseTo(1.09, 10)
  })

  it('战力悬殊过大则败,不会死循环', () => {
    const enemy = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 2)
    const result = resolveCombat(playerSnap(1), enemy, seeded(4))
    expect(result.win).toBe(false)
    expect(result.rounds).toBeLessThanOrEqual(50)
  })

  it('血量百分比始终在 0~1 之间', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const result = resolveCombat(playerSnap(2), enemy, seeded(5))
    for (const entry of result.log) {
      expect(entry.php).toBeGreaterThanOrEqual(0)
      expect(entry.php).toBeLessThanOrEqual(1)
      expect(entry.ehp).toBeGreaterThanOrEqual(0)
      expect(entry.ehp).toBeLessThanOrEqual(1)
    }
  })

  it('同层级适度成长即可取胜(数值曲线体检)', () => {
    // 玩家基础 ×2.5(相当于同大境界内数层成长 + 装备),应能击败同层小怪
    const enemy = makeEnemySnap(wolf, 1, 1)
    const p: CombatantSnap = {
      ...playerSnap(1),
      attack: gn(30),
      defense: gn(17),
      maxHp: gn(500)
    }
    const rate = sampleWinRate(p, enemy, seeded(9), 3)
    expect(rate).toBeGreaterThan(0.3)
  })

  it('sampleWinRate 取样数超表长时顶格,不越界取到 undefined→NaN', () => {
    // 表是 4 档(0.08/0.4/0.72/0.93),samples=5 且全胜时旧代码算 table[5] → NaN
    const enemy = makeEnemySnap(wolf, 1, 1)
    const rate = sampleWinRate(playerSnap(1000), enemy, seeded(9), 5)
    expect(rate).toBe(0.93)
    expect(Number.isFinite(rate)).toBe(true)
  })

  it('开局裸装带竹剑即可胜一层小怪(新手体验保护)', () => {
    // 炼气二层近似:基础三维 + 一柄凡品竹剑
    const p: CombatantSnap = {
      ...playerSnap(1),
      attack: gn(24),
      defense: gn(8),
      maxHp: gn(165),
      skills: [{ name: '太玄一气', mult: 1.5, rate: 0.2 }]
    }
    const enemy = makeEnemySnap(wolf, 1, 1)
    const rate = sampleWinRate(p, enemy, seeded(21), 3)
    expect(rate).toBeGreaterThan(0.6)
  })

  it('特殊词条不会让战斗崩溃', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const p = playerSnap(2)
    p.mods = {
      armorPen: 0.2,
      lifesteal: 0.1,
      counterRate: 0.3,
      comboRate: 0.3,
      stunRate: 0.2,
      shieldOnStart: 0.2,
      regenPerRound: 0.02,
      dodgeRate: 0.1,
      critRate: 0.3,
      critDamage: 0.5,
      lowHpDamage: 0.4,
      fullHpDamage: 0.3,
      shieldPower: 0.25,
      comboDamage: 0.5,
      counterDamage: 0.6,
      overhealShield: 0.8
    }
    const result = resolveCombat(p, enemy, seeded(12))
    expect(result.log.length).toBeGreaterThan(2)
    expect(typeof result.win).toBe('boolean')
  })

  it('流派机制生效:罡盾+满血增伤使输出显著提升(统计性)', () => {
    const base = playerSnap(1.2)
    const build: CombatantSnap = {
      ...playerSnap(1.2),
      mods: { shieldOnStart: 0.3, shieldPower: 0.4, fullHpDamage: 0.3 }
    }
    let baseRounds = 0
    let buildRounds = 0
    for (let i = 0; i < 20; i += 1) {
      baseRounds += resolveCombat(base, makeEnemySnap(wolf, 1, 1), seeded(100 + i)).rounds
      buildRounds += resolveCombat(build, makeEnemySnap(wolf, 1, 1), seeded(100 + i)).rounds
    }
    // 有流派加成的一方平均更快结束战斗
    expect(buildRounds).toBeLessThan(baseRounds)
  })

  it('双法宝均会自动施展', () => {
    const p = playerSnap(3)
    p.artifacts = [
      { def: artifactDef('af_lihuo')!, level: 0 },
      { def: artifactDef('af_xuantian')!, level: 0 }
    ]
    const result = resolveCombat(p, makeEnemySnap(enemyDef('e_bwking')!, 3, 1.2), seeded(7))
    const text = result.log.map(l => l.text).join('')
    expect(text.includes('离火珠') || text.includes('玄天镜')).toBe(true)
  })

  /**
   * 命中对闪避 —— 幻影类敌手此前是无解的。
   *
   * 蜃楼之主幻境 55%、冰魄化身 50%、大罗化身 48%:玩家没有命中这个属性时,
   * 面对这些敌手只能眼看一半的出手落空,战后分析还会说「连击与暴击难以衔接」。
   * 故这里量同一批种子的出手落空数:带命中必须明显更少,且不是靠别的数值赢。
   */
  it('命中按百分点抵掉闪避:同一批种子,带命中的一方落空更少', () => {
    /** 一只「只会闪、打不动、也打不死」的幻影靶子 */
    const phantom = (): CombatantSnap => {
      const e = makeEnemySnap(enemyDef('e_shen')!, 15, 1)
      e.mods = { dodgeRate: 0.55 }
      e.attack = gn(1)
      e.defense = gn(1e12)
      e.maxHp = gn(1e12)
      e.skills = []
      return e
    }
    const misses = (accuracy: number): number => {
      let out = 0
      for (let seed = 1; seed <= 20; seed += 1) {
        const p = playerSnap(1)
        p.mods = accuracy > 0 ? { accuracy } : {}
        p.attack = gn(1)
        p.maxHp = gn(1e12)
        p.defense = gn(1e12)
        out += resolveCombat(p, phantom(), seeded(seed)).stats!.player.missedHits
      }
      return out
    }
    const bare = misses(0)
    const keen = misses(0.4)
    expect(bare, '幻影一次都没闪开,这条判据失去对象').toBeGreaterThan(0)
    expect(keen, `20 场累计落空:无命中 ${bare} 次,带四成命中 ${keen} 次 —— 命中没有换来出手`).toBeLessThan(bare)
    console.log(`\n幻影(闪避 55%)× 20 场:无命中落空 ${bare} 次,带四成命中落空 ${keen} 次`)
  })
})
