/* eslint-disable no-console */
/**
 * 战力膨胀审计(Phase 32.8「天道膨胀审计」)
 *
 * 玩家反馈三条症状:金丹后升级过快、炼虚即可推完全图、真仙入天界仍是一脚踹死。
 * 本套用例把这三条量化成可回归的读数,并对结构性不对称设红线。
 *
 * 定位:这是一套**诊断**用例,不是平衡修复。断言阈值刻意贴着当前实测值,
 * 目的是「锁住现状、让后续调整可度量」——任何让膨胀继续恶化的改动都会在此变红,
 * 而修复膨胀时这些阈值应当被主动调紧(见每条断言旁的目标值注释)。
 */
import { describe, expect, it } from 'vitest'
import { REALMS } from '@/data/realms'
import { toNum } from '@/utils/gnum'
import { enemyGearFactor } from './formulas'
import {
  celestialCarryAudit,
  contentCoverageAudit,
  contentDeathMajor,
  CRUSH_RATIO,
  gearAsymmetry,
  gearProfile,
  GEAR_PROFILES,
  maxTierForMajor,
  modDepth,
  modelPlayer,
  powerSourceAudit,
  realmLeapAudit,
  reachableTiers
} from './inflationAudit'

const TYPICAL = gearProfile('typical')

describe('膨胀审计 · 结构性不对称', () => {
  it('玩家装备乘区与敌人装备补偿的增长速度差距(膨胀的第一来源)', () => {
    const a = gearAsymmetry()
    console.log(`\n玩家装备乘区 ${a.playerGearGrowth.toFixed(2)}x / 敌人补偿 ${a.enemyGearGrowth.toFixed(2)}x = ${a.ratio.toFixed(2)}x`)

    // 玩家:品质 1.0→9.5 且强化 0→10 级(+120%),合计 20.9 倍
    // 敌人:enemyGearFactor 0.9→2.2(tier 9 即封顶),合计 2.44 倍
    // 这条差距是「炼虚推完全图」最直接的结构性成因:玩家装备一路翻,敌人补偿早早封顶
    expect(a.playerGearGrowth).toBeGreaterThan(20)
    expect(a.enemyGearGrowth).toBeLessThan(2.5)
    // 现状 8.55x。目标应压到 3x 以内——修复后此断言要调紧
    expect(a.ratio).toBeGreaterThan(8)
    expect(a.ratio).toBeLessThan(9)
  })

  it('敌人装备补偿在 tier 9 后完全冻结,而区域一直排到 tier 20', () => {
    const frozen = enemyGearFactor(9)
    for (let t = 9; t <= 20; t += 1) {
      expect(enemyGearFactor(t)).toBe(frozen)
    }
    // 后 12 个层级敌人不再获得任何装备补偿,只靠 powerScale 线性跟随
    console.log(`\n敌人装备补偿自 tier 9 起冻结于 ${frozen}(区域共 20 层)`)
  })
})

describe('膨胀审计 · 境界跨越', () => {
  it('每次突破的战力跃升 vs 同期内容跨度', () => {
    for (const profile of GEAR_PROFILES) {
      const rows = realmLeapAudit(profile)
      console.log(`\n[${profile.name}] 境界跨越:`)
      for (const r of rows) {
        console.log(
          `  ${REALMS[r.fromMajor]!.name}→${REALMS[r.toMajor]!.name}: ` +
            `玩家 ${r.leapMult.toFixed(2)}x / 内容 ${r.contentMult.toFixed(2)}x = 脱节 ${r.detach.toFixed(2)}`
        )
      }
      // 单次突破不应超过 8 倍(极限档实测峰值 7.0x)
      for (const r of rows) {
        expect(r.leapMult).toBeLessThan(8)
      }
    }
  })

  it('金丹→元婴是全程脱节最严重的一跃(对应「进了金丹快速升级」)', () => {
    const rows = realmLeapAudit(TYPICAL)
    const jindanToYuanying = rows.find(r => r.fromMajor === 2)!
    // 玩家 6.39x vs 内容 4.49x
    expect(jindanToYuanying.leapMult).toBeGreaterThan(6)
    expect(jindanToYuanying.detach).toBeGreaterThan(1.4)

    // 它确实是前半程(炼气→化神)脱节最高的一跃
    const earlyHalf = rows.filter(r => r.fromMajor <= 3)
    const worst = earlyHalf.reduce((a, b) => (b.detach > a.detach ? b : a))
    expect(worst.fromMajor).toBe(2)
  })

  it('后期每一跃都跑在内容前面(脱节持续 >1,膨胀不断累积)', () => {
    const rows = realmLeapAudit(TYPICAL)
    // 化神→炼虚起,连续四跃全部脱节
    const late = rows.filter(r => r.fromMajor >= 4 && r.fromMajor <= 7)
    for (const r of late) {
      expect(r.detach).toBeGreaterThan(1.3)
    }
    const avgDetach = late.reduce((s, r) => s + r.detach, 0) / late.length
    console.log(`\n化神→渡劫四跃平均脱节 ${avgDetach.toFixed(2)}(每跃都比内容多涨三成以上)`)
    expect(avgDetach).toBeGreaterThan(1.4)
  })
})

describe('膨胀审计 · 内容覆盖', () => {
  it('各境界对可进入区域的压制程度', () => {
    for (const profile of GEAR_PROFILES) {
      const rows = contentCoverageAudit(profile)
      console.log(`\n[${profile.name}] 内容覆盖(压制判据:战力比 ≥${CRUSH_RATIO}):`)
      for (const r of rows) {
        console.log(
          `  ${REALMS[r.major]!.name}: 可进 ${r.reachable} 区 / 压制 ${r.crushed} 区 ` +
            `(${(r.crushRatio * 100).toFixed(0)}%) / 顶区战力比 ${r.topPowerRatio.toFixed(1)}x`
        )
      }
      const death = contentDeathMajor(rows)
      console.log(`  内容死亡点: ${death >= 0 ? REALMS[death]!.name : '无'}`)
    }
  })

  it('内容死亡点就落在金丹,与玩家反馈的起点完全吻合', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const death = contentDeathMajor(rows)
    expect(death).toBeGreaterThanOrEqual(0)
    // 筑基还剩 80% 压制率(尚有一区有威胁),金丹起 100% 且直到真仙再未恢复
    expect(death).toBe(2)
    expect(rows.find(r => r.major === 1)!.crushRatio).toBeLessThan(1)
    console.log(
      `\n内容死亡点 = ${REALMS[death]!.name} —— 玩家反馈「进了金丹快速升级」正是此处;` +
        '之后一路到真仙,没有任何一个境界重新出现有威胁的区域'
    )
  })

  it('炼虚时顶区战力比已达两位数(对应「炼虚就能推完全图」)', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const lianxu = rows.find(r => r.major === 5)!
    expect(lianxu.crushRatio).toBe(1)
    expect(lianxu.topPowerRatio).toBeGreaterThan(10)
    console.log(`\n炼虚顶区战力比 ${lianxu.topPowerRatio.toFixed(1)}x —— 最高区域也只有约十分之一的抗性`)
  })

  it('真仙时战力比膨胀到数十倍,人界内容彻底失效', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const zhenxian = rows.find(r => r.major === 9)!
    expect(zhenxian.topPowerRatio).toBeGreaterThan(60)
    // 极限档更夸张
    const extreme = contentCoverageAudit(gearProfile('optimized')).find(r => r.major === 9)!
    expect(extreme.topPowerRatio).toBeGreaterThan(80)
    console.log(`\n真仙顶区战力比:常规 ${zhenxian.topPowerRatio.toFixed(0)}x / 极限 ${extreme.topPowerRatio.toFixed(0)}x`)
  })
})

describe('膨胀审计 · 乘区来源归因', () => {
  it('装备平铺数值是压倒性的单一来源', () => {
    for (const major of [2, 5, 9]) {
      const rows = powerSourceAudit(major, TYPICAL)
      console.log(`\n${REALMS[major]!.name} 战力来源:`)
      for (const r of rows) console.log(`  ${r.name}: ${(r.share * 100).toFixed(1)}%`)

      const equipFlat = rows.find(r => r.id === 'equipFlat')!
      // 单一来源占比 >40% 即为危险信号;装备平铺在全程都稳在 55% 以上
      expect(equipFlat.share).toBeGreaterThan(0.55)
    }
  })

  it('境界基础的占比随进程持续萎缩,突破的意义被装备稀释', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'realm')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'realm')!
    // 金丹 17.2% → 真仙 4.4%
    expect(jindan.share).toBeGreaterThan(zhenxian.share * 3)
    console.log(
      `\n境界基础占比:金丹 ${(jindan.share * 100).toFixed(1)}% → 真仙 ${(zhenxian.share * 100).toFixed(1)}%` +
        '(玩家越到后期越靠刷装备而非靠突破)'
    )
  })

  it('功法在金丹阶段贡献为零,前期没有构筑选择的余地', () => {
    const gongfa = powerSourceAudit(2, TYPICAL).find(r => r.id === 'gongfa')!
    // 金丹可用功法的战斗词条几乎全是 cultivationSpeed,不进战力
    expect(gongfa.share).toBeLessThan(0.02)
  })
})

describe('膨胀审计 · 天界携带', () => {
  it('入天界时玩家构筑深度远超守关者(对应「天界一脚踹死」)', () => {
    const rows = celestialCarryAudit(TYPICAL)
    console.log('\n天界携带审计(基础三维已由 worldFoeSnap 等比抵消,故只比词条深度):')
    for (const r of rows) {
      console.log(
        `  ${REALMS[r.major]!.name}: 玩家词条深度 ${r.playerDepth.toFixed(2)} / 天界敌人 ${r.foeDepth.toFixed(2)} = ${r.asymmetry.toFixed(1)}x`
      )
    }
    // 天界敌人的 mods 是固定 shape,玩家词条却随人间进程无限累积
    for (const r of rows) {
      expect(r.asymmetry).toBeGreaterThan(25)
    }
  })

  it('天界的等比缩放只抵消了三维,没有抵消构筑深度', () => {
    const rows = celestialCarryAudit(TYPICAL)
    const zhenxian = rows.find(r => r.major === 9)!
    // 真仙入天界时词条深度约为守关者的 57 倍
    expect(zhenxian.asymmetry).toBeGreaterThan(50)
    expect(zhenxian.foeDepth).toBeLessThan(0.15)
    console.log(
      `\n真仙携带词条深度 ${zhenxian.playerDepth.toFixed(2)},天界敌人仅 ${zhenxian.foeDepth.toFixed(2)}` +
        '——「数值在天界互相抵消」只对基础三维成立,词条乘区被整份带了进去'
    )
  })

  it('玩家词条深度随境界单调累积,天界入口没有做任何转化', () => {
    const rows = celestialCarryAudit(TYPICAL)
    const lianxu = rows.find(r => r.major === 5)!
    const zhenxian = rows.find(r => r.major === 9)!
    expect(zhenxian.playerDepth).toBeGreaterThan(lianxu.playerDepth)
    // 敌人深度恒定,不随玩家境界变化——不对称只会越来越大
    expect(zhenxian.foeDepth).toBe(lianxu.foeDepth)
  })
})

describe('膨胀审计 · 建模自洽性', () => {
  it('区域可达性与境界门槛一致', () => {
    expect(reachableTiers(0).length).toBeGreaterThan(0)
    expect(maxTierForMajor(0)).toBeLessThan(maxTierForMajor(9))
    // 高境界能进入的区域是低境界的超集
    for (let m = 1; m <= 9; m += 1) {
      expect(reachableTiers(m).length).toBeGreaterThanOrEqual(reachableTiers(m - 1).length)
    }
  })

  it('modDepth 只统计构筑词条,排除已被等比抵消的基础三维', () => {
    const depth = modDepth({ attackPct: 5, defensePct: 5, maxHpPct: 5, cultivationSpeed: 5, critRate: 0.3, lifesteal: 0.2 })
    expect(depth).toBeCloseTo(0.5, 5)
  })

  it('玩家建模可复现:同参数两次调用结果一致', () => {
    const a = modelPlayer(5, 9, TYPICAL)
    const b = modelPlayer(5, 9, TYPICAL)
    expect(a.stats.power).toEqual(b.stats.power)
  })

  it('成型度档位单调:极限档战力高于常规档,常规档高于随缘档', () => {
    const casual = toNum(modelPlayer(5, 9, gearProfile('casual')).stats.power)
    const typical = toNum(modelPlayer(5, 9, gearProfile('typical')).stats.power)
    const optimized = toNum(modelPlayer(5, 9, gearProfile('optimized')).stats.power)
    expect(typical).toBeGreaterThan(casual)
    expect(optimized).toBeGreaterThan(typical)
  })
})
