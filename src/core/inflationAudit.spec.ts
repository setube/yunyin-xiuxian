/* eslint-disable no-console */
/**
 * 战力膨胀审计与治理回归(Phase 33.1 建模 / 33.2 治理)
 *
 * 33.1 把玩家反馈的三条症状量化成读数:金丹后升级过快、炼虚推完全图、天界一脚踹死。
 * 33.2 据此做了三处结构性调整(敌人补偿去封顶、装备价值从平铺转向构筑、天界词条对称)。
 *
 * 本套用例现在的职责是**守住治理成果**:阈值卡在治理后的实测值附近,
 * 任何让膨胀回潮的改动都会在此变红。每条断言旁注明治理前 → 治理后的对照。
 */
import { describe, expect, it } from 'vitest'
import { REALMS } from '@/data/realms'
import { toNum } from '@/utils/gnum'
import { enemyGearFactor } from './formulas'
import { CELESTIAL_BASE_DEPTH, celestialDepthScale } from './gauntlet'
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

describe('膨胀治理 · 装备乘区对称', () => {
  it('玩家装备乘区与敌人补偿的增速已基本对齐', () => {
    const a = gearAsymmetry()
    console.log(`\n玩家装备乘区 ${a.playerGearGrowth.toFixed(2)}x / 敌人补偿 ${a.enemyGearGrowth.toFixed(2)}x = ${a.ratio.toFixed(2)}x`)

    // 治理前 8.55x(玩家 20.9x vs 敌人 2.44x),治理后 1.27x
    // 玩家侧:品质对平铺按 ^0.6 压缩;敌人侧:补偿改指数跟随、去掉 tier 9 封顶
    expect(a.ratio).toBeLessThan(1.6)
    expect(a.ratio).toBeGreaterThan(1) // 玩家仍略占优,构筑收益不被抹平
  })

  it('敌人补偿全程跟随,不再有封顶断崖', () => {
    // 治理前 tier 9 起冻结在 2.2,后 12 个层级不再获得任何补偿
    for (let t = 2; t <= 20; t += 1) {
      expect(enemyGearFactor(t)).toBeGreaterThan(enemyGearFactor(t - 1))
    }
    console.log(`\n敌人补偿 tier1 ${enemyGearFactor(1).toFixed(2)} → tier20 ${enemyGearFactor(20).toFixed(2)}(全程单调,无封顶)`)
  })
})

describe('膨胀治理 · 境界跨越', () => {
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
      for (const r of rows) {
        expect(r.leapMult).toBeLessThan(8)
      }
    }
  })

  it('人界各跃不再持续跑在内容前面(脱节收敛到 1 附近)', () => {
    const rows = realmLeapAudit(TYPICAL)
    // 治理前化神→渡劫四跃平均脱节 1.51(每跃都比内容多涨五成),治理后约 1.04
    const late = rows.filter(r => r.fromMajor >= 4 && r.fromMajor <= 7)
    const avgDetach = late.reduce((s, r) => s + r.detach, 0) / late.length
    console.log(`\n化神→渡劫四跃平均脱节 ${avgDetach.toFixed(2)}(治理前 1.51)`)
    expect(avgDetach).toBeLessThan(1.15)
    for (const r of late) {
      expect(r.detach).toBeLessThan(1.25)
    }
  })

  it('金丹→元婴的跃升已回到与内容同步(玩家反馈的起点)', () => {
    const rows = realmLeapAudit(TYPICAL)
    const jindanToYuanying = rows.find(r => r.fromMajor === 2)!
    // 治理前 6.39x / 脱节 1.42,治理后 5.09x / 脱节 0.93
    expect(jindanToYuanying.detach).toBeLessThan(1.1)
    console.log(`\n金丹→元婴 脱节 ${jindanToYuanying.detach.toFixed(2)}(治理前 1.42)`)
  })

  it('渡劫→真仙仍然脱节,这是内容边界而非数值问题', () => {
    const rows = realmLeapAudit(TYPICAL)
    const last = rows.find(r => r.fromMajor === 8)!
    // 真仙没有对应区域(tier 最高 20 = 渡劫),内容跨度为 1,脱节必然 >1。
    // 此处正是玩家该转入天界的位置,保留断言是为了标注这条边界的存在
    expect(last.contentMult).toBe(1)
    expect(last.detach).toBeGreaterThan(1)
  })
})

describe('膨胀治理 · 内容覆盖', () => {
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

  it('内容死亡点从金丹推迟到炼虚之后', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const death = contentDeathMajor(rows)
    // 治理前 = 金丹(2):第三个大境界起内容就全线失效
    expect(death).toBeGreaterThanOrEqual(5)
    console.log(`\n内容死亡点 = ${death >= 0 ? REALMS[death]!.name : '无'}(治理前:金丹)`)
  })

  it('炼虚顶区战力比从两位数压回个位数', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const lianxu = rows.find(r => r.major === 5)!
    // 治理前 11.1x —— 最高区域也只剩十分之一抗性;治理后 3.3x
    expect(lianxu.topPowerRatio).toBeLessThan(4.5)
    console.log(`\n炼虚顶区战力比 ${lianxu.topPowerRatio.toFixed(1)}x(治理前 11.1x)`)
  })

  it('真仙时人界仍被压制,但幅度从数十倍降到个位数', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const zhenxian = rows.find(r => r.major === 9)!
    // 治理前常规 68.1x / 极限 85.1x。真仙压制人界是设计意图(该去天界了),
    // 但幅度必须可控,否则最后几个区域从「简单」变成「不存在」
    expect(zhenxian.topPowerRatio).toBeLessThan(12)
    const extreme = contentCoverageAudit(gearProfile('optimized')).find(r => r.major === 9)!
    expect(extreme.topPowerRatio).toBeLessThan(16)
    console.log(`\n真仙顶区战力比:常规 ${zhenxian.topPowerRatio.toFixed(1)}x / 极限 ${extreme.topPowerRatio.toFixed(1)}x(治理前 68.1 / 85.1)`)
  })

  it('低成型度玩家在后期仍会遇到真正的阻力', () => {
    const rows = contentCoverageAudit(gearProfile('casual'))
    // 随缘档在渡劫仍有区域未被压制——不肯经营构筑的玩家会撞墙,
    // 这正是「观察生态 → 调整 Build → 攻坚」得以成立的前提
    const dujie = rows.find(r => r.major === 8)!
    expect(dujie.crushRatio).toBeLessThan(1)
    console.log(`\n随缘档渡劫:压制 ${dujie.crushed}/${dujie.reachable} 区,顶区战力比 ${dujie.topPowerRatio.toFixed(1)}x`)
  })
})

describe('膨胀治理 · 乘区来源归因', () => {
  it('战力来源结构(逐项剥离取跌幅)', () => {
    for (const major of [2, 5, 9]) {
      const rows = powerSourceAudit(major, TYPICAL)
      console.log(`\n${REALMS[major]!.name} 战力来源:`)
      for (const r of rows) console.log(`  ${r.name}: ${(r.share * 100).toFixed(1)}%`)
    }
  })

  it('境界基础的占比被显著抬回,突破重新有分量', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'realm')!
    const lianxu = powerSourceAudit(5, TYPICAL).find(r => r.id === 'realm')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'realm')!
    // 治理前 金丹 17.2% / 炼虚 6.4% / 真仙 4.4%(一路萎缩到个位数)
    // 治理后 金丹 29.6% / 炼虚 14.4% / 真仙 14.8%(后期止跌回稳)
    expect(jindan.share).toBeGreaterThan(0.25)
    expect(lianxu.share).toBeGreaterThan(0.12)
    expect(zhenxian.share).toBeGreaterThan(0.12)
    console.log(
      `\n境界基础占比:金丹 ${(jindan.share * 100).toFixed(1)}% / 炼虚 ${(lianxu.share * 100).toFixed(1)}% / ` +
        `真仙 ${(zhenxian.share * 100).toFixed(1)}%(治理前 17.2 / 6.4 / 4.4)`
    )
  })

  it('装备平铺不再一路独大,后期让位给构筑与其他系统', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'equipFlat')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'equipFlat')!
    // 治理前 65.3% → 57.4%;治理后 53.0% → 46.9%
    // 剥离法天然高估首位来源(剥掉装备等于裸装),故阈值不能按 40% 危险线直接卡,
    // 要看的是「是否随进程下行、是否给其他来源让出空间」
    expect(jindan.share).toBeLessThan(0.56)
    expect(zhenxian.share).toBeLessThan(0.5)
    expect(zhenxian.share).toBeLessThan(jindan.share)
  })

  it('装备词条的占比随进程上升,成长确实转向了构筑', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'equipMod')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'equipMod')!
    expect(zhenxian.share).toBeGreaterThan(jindan.share)
  })
})

describe('膨胀治理 · 天界词条对称', () => {
  it('入天界的构筑深度对照(对称前 / 后)', () => {
    const rows = celestialCarryAudit(TYPICAL)
    console.log('\n天界携带审计(三维已由 worldFoeSnap 等比抵消,此处只比词条):')
    for (const r of rows) {
      console.log(
        `  ${REALMS[r.major]!.name}: 玩家深度 ${r.playerDepth.toFixed(2)} / 守关者 ${r.foeDepth.toFixed(2)} ` +
          `→ 加厚 ${r.depthScale.toFixed(2)}x / 实效不对称 ${r.effectiveAsymmetry.toFixed(1)}x(原始 ${r.asymmetry.toFixed(1)}x)`
      )
    }
  })

  it('实效不对称不再随玩家堆叠而发散(治理的核心目标)', () => {
    const rows = celestialCarryAudit(TYPICAL)
    const lianxu = rows.find(r => r.major === 5)!
    const zhenxian = rows.find(r => r.major === 9)!

    // 治理前:炼虚 33.2x → 真仙 57.1x,堆得越多差距越大,这就是「一脚踹死」
    // 治理后:守关者按玩家深度加厚,实效不对称几乎持平
    expect(zhenxian.asymmetry).toBeGreaterThan(lianxu.asymmetry * 1.4) // 原始携带量仍在涨
    const drift = zhenxian.effectiveAsymmetry / lianxu.effectiveAsymmetry
    expect(drift).toBeLessThan(1.15) // 实效差距却几乎不动
    console.log(
      `\n炼虚→真仙:词条深度 +${(((zhenxian.playerDepth - lianxu.playerDepth) / lianxu.playerDepth) * 100).toFixed(0)}%,` +
        `实效不对称仅 +${((drift - 1) * 100).toFixed(0)}% —— 堆叠不再换来碾压`
    )
  })

  it('守关者只在玩家越过基准深度后才加厚,浅构筑不受影响', () => {
    expect(celestialDepthScale({})).toBe(1)
    expect(celestialDepthScale({ critRate: 0.2 })).toBe(1)
    // 基准以内不加厚,越过后单调跟随
    const shallow = celestialDepthScale({ critRate: CELESTIAL_BASE_DEPTH * 0.9 })
    const deep = celestialDepthScale({ critRate: CELESTIAL_BASE_DEPTH * 3 })
    expect(shallow).toBe(1)
    expect(deep).toBeGreaterThan(1)
  })

  it('加厚严格等比,堆厚度的净收益归零(堵死「不靠器魂堆到赢」)', () => {
    // 曾用指数 0.85,理由是「留给构筑优化的收益空间」——那是设计错误:
    // 指数 <1 时净优势随深度单调增长,功法/灵脉/天赋/称号这些不受器魂约束的来源
    // (占真仙玩家词条深度六成)只要堆够就能碾过天界。
    // 改为严格等比后,无论堆到多深,净优势恒定
    const ratios = [2, 4, 8, 32, 128].map(k => {
      const depth = CELESTIAL_BASE_DEPTH * k
      return depth / (CELESTIAL_BASE_DEPTH * celestialDepthScale({ critRate: depth }))
    })
    for (const r of ratios) expect(r).toBeCloseTo(1, 6)
    console.log(`\n深度翻 2→128 倍,净优势恒为 ${ratios[0]!.toFixed(3)} —— 堆厚度不再有任何收益`)
  })

  it('基准以下不加厚,六大标准流派完全不受影响', () => {
    // 流派深度 1.02~2.43 全在基准 2.6 以下,天界平衡门照旧
    for (const d of [1.02, 1.6, 2.43]) {
      expect(celestialDepthScale({ critRate: d })).toBe(1)
    }
  })
})

describe('膨胀审计 · 建模自洽性', () => {
  it('区域可达性与境界门槛一致', () => {
    expect(reachableTiers(0).length).toBeGreaterThan(0)
    expect(maxTierForMajor(0)).toBeLessThan(maxTierForMajor(9))
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
