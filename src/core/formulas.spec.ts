import { describe, expect, it } from 'vitest'
import { add, gte, gn, lt, ratio, toNum } from '@/utils/gnum'
import {
  POWER_WEIGHTS,
  baseCombatStats,
  baseCultPerSec,
  breakthroughBaseRate,
  buildingCost,
  expRequirement,
  powerScale,
  tierMajor,
  upgradeCost,
  powerScore,
  stoneByTier,
  tribulationWaveDamage,
  winChanceFromRatio,
  gameDay
} from './formulas'
import { powerBreakdownRows, powerExplainText } from '@/ui/powerText'

describe('GameFormula 成长曲线', () => {
  it('战力：算式 = 攻×3 + 防×2 + 血×0.15，权重与释义同源，不许改一处漏一处', () => {
    const a = gn(10)
    const d = gn(20)
    const h = gn(100)
    const got = toNum(powerScore(a, d, h))
    const want = 10 * POWER_WEIGHTS.attack + 20 * POWER_WEIGHTS.defense + 100 * POWER_WEIGHTS.hp
    expect(got).toBeCloseTo(want, 6)
    expect(powerExplainText()).toBe(`攻×${POWER_WEIGHTS.attack} + 防×${POWER_WEIGHTS.defense} + 血×${POWER_WEIGHTS.hp}`)
  })
  it('战力构成行与 powerScore 同一批数相加:逐行权重折算,合计即总战力', () => {
    const s = {
      attack: gn(10),
      defense: gn(20),
      maxHp: gn(100),
      power: powerScore(gn(10), gn(20), gn(100)),
      mods: {},
      breakdown: [],
      cultSpeedSoftCapped: false,
      cultSpeedFactor: 1
    }
    const rows = powerBreakdownRows(s)
    expect(rows.map(r => [r.name, r.weight])).toEqual([
      ['攻击', POWER_WEIGHTS.attack],
      ['防御', POWER_WEIGHTS.defense],
      ['气血', POWER_WEIGHTS.hp]
    ])
    const sum = toNum(add(add(rows[0]!.value, rows[1]!.value), rows[2]!.value))
    expect(toNum(rows[0]!.value)).toBeCloseTo(10 * POWER_WEIGHTS.attack, 6)
    expect(sum).toBeCloseTo(toNum(s.power), 6)
  })
  it('突破需求单调递增', () => {
    const a = expRequirement(0, 0)
    const b = expRequirement(0, 5)
    const c = expRequirement(1, 0)
    const d = expRequirement(5, 9)
    expect(lt(a, b)).toBe(true)
    expect(lt(b, c)).toBe(true)
    expect(lt(c, d)).toBe(true)
  })

  it('炼气一层需求可在数十秒内达成(首破节奏)', () => {
    const req = toNum(expRequirement(0, 0))
    const speed = baseCultPerSec(0, 0)
    expect(req / speed).toBeLessThan(60)
  })

  it('战斗基础属性随境界增长', () => {
    const low = baseCombatStats(0, 0)
    const high = baseCombatStats(3, 5)
    expect(gte(high.attack, low.attack)).toBe(true)
    expect(ratio(high.maxHp, low.maxHp)).toBeGreaterThan(30)
  })

  /**
   * 区域层级越界不许把 undefined 漏进算式。
   *
   * `tierMajor` / `powerScale` 都拿 `tier - 1` 当下标,两头各钳一次
   * (`Math.max(0, Math.min(LEN - 1, ...))`)。这两道钳不是防负数的语义修饰 ——
   * 去掉之后越界取值是 `undefined`,`worldOf(undefined)` 当场崩。
   *
   * 真实路径上 tier 来自 `maxTierForMajor(major)`(最高 32,正好等于数组长度),
   * 边界外到不了;这条钉的是「钳还在」:将来有人把 tier 从别处喂进来时不会崩。
   */
  it('层级越界:两头都钳在表内,不返回 undefined', () => {
    for (const t of [0, -1, -100]) {
      expect(tierMajor(t), `tier=${t} 该钳到最低层`).toBe(tierMajor(1))
    }
    for (const t of [33, 100, 1e6]) {
      expect(tierMajor(t), `tier=${t} 该钳到最高层`).toBe(tierMajor(32))
    }
    // 钳出来的都必须是个真数,不是 undefined
    for (const t of [-5, 0, 1, 16, 32, 33, 999]) {
      const m = tierMajor(t)
      expect(typeof m, `tierMajor(${t}) 返回了 ${String(m)}`).toBe('number')
      expect(Number.isFinite(m), `tierMajor(${t}) 不是有限数`).toBe(true)
    }
  })

  it('层级越界:powerScale 不崩、仍给出有限值', () => {
    for (const t of [-5, 0, 33, 999]) {
      expect(() => powerScale(t), `powerScale(${t}) 崩了`).not.toThrow()
      const p = powerScale(t)
      expect(Number.isFinite(p.m), `powerScale(${t}) 的尾数不是有限数`).toBe(true)
      expect(Number.isFinite(p.e), `powerScale(${t}) 的指数不是有限数`).toBe(true)
    }
    // 越界的两头与各自边界同结果
    expect(powerScale(0), '低端越界该与 tier=1 同结果').toEqual(powerScale(1))
    expect(powerScale(999), '高端越界该与 tier=32 同结果').toEqual(powerScale(32))
  })

  /**
   * 强化成本的下限:`Math.max(0.4, 1 - discount)`。
   *
   * 折扣来自 forgeDiscount 词条(巧手 5~10、器道 10~20)。正常叠不满 100%,
   * 但这条钳是**唯一**挡住「打折超过 100% 时成本变负」的东西 ——
   * 不钳的话 discount=1.5 会让 dust 变成负数,玩家强化反而倒赚器灵尘。
   * 变异扫描点名这条钳没有判据盯着(这个函数此前在 spec 里一次都没被调过)。
   */
  it('强化成本:折扣再大也不为负,且低于 60% 折扣下限后不再降', () => {
    for (const d of [0, 0.3, 0.6, 0.99, 1, 1.5, 5, 100]) {
      const c = upgradeCost(10, 20, 3, d)
      expect(Number.isFinite(c.dust), `discount=${d} 的器灵尘不是有限数`).toBe(true)
      expect(c.dust, `discount=${d} 的器灵尘是负的 —— 钳制没了`).toBeGreaterThan(0)
      expect(Number.isFinite(c.stone.m), `discount=${d} 的灵石不是有限数`).toBe(true)
      expect(c.stone.m, `discount=${d} 的灵石是负的`).toBeGreaterThan(0)
    }
    // 折扣超过 60% 后成本封底,不再继续下降
    const floor = upgradeCost(10, 20, 3, 0.6)
    for (const d of [0.8, 1, 2, 10]) {
      expect(upgradeCost(10, 20, 3, d), `discount=${d} 该与 60% 同价(已触底)`).toEqual(floor)
    }
  })

  it('powerScale 与区域层级同向增长', () => {
    expect(ratio(powerScale(10), powerScale(1))).toBeGreaterThan(50)
    expect(ratio(powerScale(20), powerScale(10))).toBeGreaterThan(50)
  })

  it('突破成功率在钳制范围内', () => {
    for (let m = 0; m < 10; m += 1) {
      for (let s = 0; s < 10; s += 1) {
        const r = breakthroughBaseRate(m, s)
        expect(r).toBeGreaterThanOrEqual(0.15)
        expect(r).toBeLessThanOrEqual(0.98)
      }
    }
  })

  it('大境界突破比小层突破更难', () => {
    expect(breakthroughBaseRate(3, 9)).toBeLessThan(breakthroughBaseRate(3, 2))
  })

  it('胜率曲线:战力占优则胜率高', () => {
    expect(winChanceFromRatio(2)).toBeGreaterThan(0.85)
    expect(winChanceFromRatio(1)).toBeGreaterThan(0.5)
    expect(winChanceFromRatio(0.4)).toBeLessThan(0.2)
    expect(winChanceFromRatio(0)).toBe(0.05)
  })

  /**
   * 胜率夹在 [0.05, 0.95] 内。
   *
   * 这两条钳**是可达的**:r=0.001 时原始式算出 1/(1+(850)^4) ≈ 1e-12,r=10 时算出 0.99998 ——
   * 不钳的话离线估算会给出「必输」或「必胜」,而后续连乘直接变成 0 或 1,
   * 离线收益随之整块归零或爆表。变异扫描点名这两条钳没有判据盯着。
   *
   * 判据钉两头:极弱不许低于下限、极强不许高于上限,并且不出现 NaN。
   */
  it('胜率两头都夹住:极弱不低于 5%,极强不高于 95%', () => {
    for (const r of [0.001, 0.01, 0.05, 0.1]) {
      expect(winChanceFromRatio(r), `战力比 ${r} 的胜率低于下限`).toBe(0.05)
    }
    for (const r of [10, 100, 1e6]) {
      expect(winChanceFromRatio(r), `战力比 ${r} 的胜率高于上限`).toBe(0.95)
    }
    // 非正与无穷也算数:函数入口对 r<=0 单独早退,Infinity 走主式
    expect(winChanceFromRatio(-5), '负战力比该给下限').toBe(0.05)
    expect(winChanceFromRatio(Infinity), '无穷战力比该给上限').toBe(0.95)
  })

  it('单调:战力比越高,胜率不降低', () => {
    const rs = [0.01, 0.1, 0.3, 0.5, 1, 2, 5, 10, 100]
    for (let i = 1; i < rs.length; i += 1) {
      expect(winChanceFromRatio(rs[i]!), `r=${rs[i]} 的胜率低于 r=${rs[i - 1]}`).toBeGreaterThanOrEqual(
        winChanceFromRatio(rs[i - 1]!)
      )
    }
  })

  it('天劫伤害随波次与境界上升,御劫词条减伤', () => {
    expect(tribulationWaveDamage(3, 5, 0)).toBeGreaterThan(tribulationWaveDamage(3, 1, 0))
    expect(tribulationWaveDamage(3, 5, 0.5)).toBeLessThan(tribulationWaveDamage(3, 5, 0))
  })

  it('灵石与建筑成本为正且递增', () => {
    expect(toNum(stoneByTier(5, 10))).toBeGreaterThan(toNum(stoneByTier(1, 10)))
    expect(toNum(buildingCost(100, 3))).toBeGreaterThan(toNum(buildingCost(100, 0)))
  })

describe('游戏日换算 · gameDay', () => {
  it('整日边界:第 N 天从 N×86400 秒开始', () => {
    expect(gameDay(0)).toBe(0)
    expect(gameDay(86399), '86400 秒前仍算第 0 天').toBe(0)
    expect(gameDay(86400), '满 86400 秒进入第 1 天').toBe(1)
    expect(gameDay(86400 * 2 - 1)).toBe(1)
    expect(gameDay(86400 * 2)).toBe(2)
  })

  /**
   * 契约:入参必须是非负有限数。
   * 这不是 gameDay 自己能保证的 —— 上游 stores/game 的 sanitize 用
   * asFiniteNumber(totalPlaySec, 0, 0) 兜住了。本条把契约写下来,
   * 免得后来者以为 gameDay 会自己钳制而放心传入脏值。
   */
  it('契约:入参由 store 保证非负有限(负数/NaN 会原样传染,不做防御)', () => {
    expect(Number.isNaN(gameDay(Number.NaN)), 'gameDay 不做 NaN 防御,靠上游 sanitize').toBe(true)
    expect(gameDay(-1), 'gameDay 不做负数钳制,靠上游 sanitize').toBe(-1)
    expect(gameDay(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })

  it('单调不减:时间前进,天数不会倒退', () => {
    let prev = gameDay(0)
    for (const s of [1, 3600, 86399, 86400, 100000, 864000]) {
      const cur = gameDay(s)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })

  it('一天 = 86400 秒(与每日任务/每日奖励的重置口径同源)', () => {
    expect(gameDay(86400) - gameDay(0)).toBe(1)
  })
})
})
