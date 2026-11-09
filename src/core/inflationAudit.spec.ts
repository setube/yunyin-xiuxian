/* eslint-disable no-console */
/** 战力膨胀治理回归:阈值卡在治理后实测值附近,膨胀回潮即红 */
import { describe, expect, it } from 'vitest'
import { MAX_MAJOR, REALMS } from '@/data/realms'
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
  modDepth,
  modelPlayer,
  powerSourceAudit,
  realmLeapAudit,
  reachableTiers
} from './inflationAudit'
// 层级映射的真相源在区域表
import { maxTierForMajor } from '@/data/regions'

const TYPICAL = gearProfile('typical')

describe('膨胀治理 · 装备乘区对称', () => {
  it('玩家装备乘区与敌人补偿的增速已基本对齐', () => {
    const a = gearAsymmetry()
    console.log(`\n玩家装备乘区 ${a.playerGearGrowth.toFixed(2)}x / 敌人补偿 ${a.enemyGearGrowth.toFixed(2)}x = ${a.ratio.toFixed(2)}x`)

    /**
     * 玩家一侧取这一层的典型穿着(掉落池中位品质)。比值 0.36:敌人补偿刻意跑在典型装备曲线之前。
     * 守的是「同量级、不许反过来把玩家压死」,不是「玩家必须赢过补偿」。
     */
    expect(a.ratio).toBeLessThan(1.6)
    expect(a.ratio).toBeGreaterThan(0.3)
  })

  it('敌人补偿全程跟随,不再有封顶断崖', () => {
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
      // 渡劫→真仙实测 12.0x;阈值 14 守的是「单跃不许失控」,不是某个具体倍数
      for (const r of rows) {
        expect(r.leapMult).toBeLessThan(14)
      }
    }
  })

  it('人界各跃不再持续跑在内容前面(脱节收敛到 1 附近)', () => {
    const rows = realmLeapAudit(TYPICAL)
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
    expect(jindanToYuanying.detach).toBeLessThan(1.1)
    console.log(`\n金丹→元婴 脱节 ${jindanToYuanying.detach.toFixed(2)}(治理前 1.42)`)
  })

  it('渡劫→真仙:飞升仙界,内容同步承接(不再是「无内容边界」)', () => {
    const rows = realmLeapAudit(TYPICAL)
    const last = rows.find(r => r.fromMajor === 8)!
    // 真仙由 tier 21 承接;唯一一次跨界飞升,脱节 ~1.4 属设计留白,但须收敛
    expect(last.contentMult).toBeGreaterThan(1)
    expect(last.leapMult).toBeLessThan(8)
    expect(last.detach).toBeLessThan(2)
  })

  it('界外每一跃脱节纳入纳管:天堑不塌成绝壁,蓄力不溢成跳崖', () => {
    // 三档界外实测脱节 0.31~2.21:神将→神王贴近 0.3(内容刻意领先),
    // 太乙→大罗 / 混沌真灵→神魔贴近 2.2(装备换代落差)。两头都不许再恶化
    for (const profile of GEAR_PROFILES) {
      const rows = realmLeapAudit(profile)
      for (const r of rows.filter(x => x.fromMajor > 8)) {
        const name = `${REALMS[r.fromMajor]!.name}→${REALMS[r.toMajor]!.name}`
        expect(
          r.detach,
          `${profile.name} ${name} 脱节 ${r.detach.toFixed(2)} 破上界:内容被甩开,该境变白给`
        ).toBeLessThan(2.5)
        expect(
          r.detach,
          `${profile.name} ${name} 脱节 ${r.detach.toFixed(2)} 破下界:内容压过头,成绝壁`
        ).toBeGreaterThan(0.25)
      }
    }
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

  it('内容死亡点:常规档全程不再出现(金丹之后内容始终有威胁)', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const death = contentDeathMajor(rows)
    expect(death === -1 || death >= 5).toBe(true)
    console.log(`\n内容死亡点 = ${death >= 0 ? REALMS[death]!.name : '无'}(治理前:金丹)`)
  })

  it('炼虚顶区战力比从两位数压回个位数', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const lianxu = rows.find(r => r.major === 5)!
    expect(lianxu.topPowerRatio).toBeLessThan(4.5)
    console.log(`\n炼虚顶区战力比 ${lianxu.topPowerRatio.toFixed(1)}x(治理前 11.1x)`)
  })

  it('真仙时人界仍被压制,但幅度从数十倍降到个位数', () => {
    const rows = contentCoverageAudit(TYPICAL)
    const zhenxian = rows.find(r => r.major === 9)!
    // 真仙压制人界是设计意图,但幅度须可控
    expect(zhenxian.topPowerRatio).toBeLessThan(12)
    const extreme = contentCoverageAudit(gearProfile('optimized')).find(r => r.major === 9)!
    expect(extreme.topPowerRatio).toBeLessThan(16)
    console.log(`\n真仙顶区战力比:常规 ${zhenxian.topPowerRatio.toFixed(1)}x / 极限 ${extreme.topPowerRatio.toFixed(1)}x(治理前 68.1 / 85.1)`)
  })

  it('低成型度玩家在后期仍会遇到真正的阻力', () => {
    const rows = contentCoverageAudit(gearProfile('casual'))
    const dujie = rows.find(r => r.major === 8)!
    expect(dujie.crushRatio).toBeLessThan(1)
    console.log(`\n随缘档渡劫:压制 ${dujie.crushed}/${dujie.reachable} 区,顶区战力比 ${dujie.topPowerRatio.toFixed(1)}x`)
  })

  /** 全程(含 10-20 号境界)的上界守卫;下界(内容死亡点)见上方用例 */
  it('全程顶区战力比都是有限数 —— 后期数值不许算出 NaN/Infinity', () => {
    for (const profile of GEAR_PROFILES) {
      for (const r of contentCoverageAudit(profile)) {
        expect(Number.isFinite(r.topPowerRatio), `[${profile.name}] ${REALMS[r.major]!.name} 顶区战力比不是有限数`).toBe(true)
        expect(Number.isFinite(r.crushRatio), `[${profile.name}] ${REALMS[r.major]!.name} 压制比不是有限数`).toBe(true)
      }
    }
  })

  it('顶区战力比全程有上界:任何境界都不该碾到「区域战斗彻底失去意义」', () => {
    // 实测全程最高在真仙附近:常规档 5.8x、极限档 7.2x;红线 12x
    for (const profile of GEAR_PROFILES) {
      for (const r of contentCoverageAudit(profile)) {
        expect(r.topPowerRatio, `[${profile.name}] ${REALMS[r.major]!.name} 顶区战力比 ${r.topPowerRatio.toFixed(1)}x 超过上界`).toBeLessThan(12)
      }
    }
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

  /*
   * 来源结构的两条硬约束:每项非负、合计为 1。
   *
   * 变异扫描把其中一处 `Math.max(0, fullPower - withParts(...))` 报成「改坏了不会红」——
   * 这一批夹子是**等价变异**:五类来源在当前配置下都是正贡献(实测丹药灵脉那项 10.7%~22.5%),
   * 夹不夹读出来一样。故锁的是结果契约:占比是给玩家看的饼,负数或合计不为 1 就是坏读数。
   */
  it('每项占比非负,且五项合计为 1', () => {
    for (const major of [2, 5, 9, MAX_MAJOR]) {
      const rows = powerSourceAudit(major, TYPICAL)
      expect(rows.length, `major=${major} 该有五项`).toBe(5)
      for (const r of rows) {
        expect(r.share, `${REALMS[major]!.name} 的「${r.name}」占比为负`).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(r.share), `${REALMS[major]!.name} 的「${r.name}」占比非有限数`).toBe(true)
      }
      const sum = rows.reduce((acc, r) => acc + r.share, 0)
      expect(sum, `${REALMS[major]!.name} 五项合计该是 1`).toBeCloseTo(1, 6)
    }
  })

  it('境界基础的占比被显著抬回,突破重新有分量', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'realm')!
    const lianxu = powerSourceAudit(5, TYPICAL).find(r => r.id === 'realm')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'realm')!
    const top = powerSourceAudit(MAX_MAJOR, TYPICAL).find(r => r.id === 'realm')!
    // 实测 金丹 21.8% / 炼虚 10.3%
    expect(jindan.share).toBeGreaterThan(0.2)
    expect(lianxu.share).toBeGreaterThan(0.09)
    // 顶段战力大头在装备平铺,境界基础只剩 1.2% 量级
    expect(top.share).toBeGreaterThan(0.01)
    expect(top.share).toBeGreaterThan(zhenxian.share * 0.2)
    console.log(
      `\n境界基础占比:金丹 ${(jindan.share * 100).toFixed(1)}% / 炼虚 ${(lianxu.share * 100).toFixed(1)}% / ` +
        `真仙 ${(zhenxian.share * 100).toFixed(1)}% / ${REALMS[MAX_MAJOR]!.name} ${(top.share * 100).toFixed(1)}%(治理前 17.2 / 6.4 / 4.4)`
    )
  })

  it('装备平铺不再一路独大,后期让位给构筑与其他系统', () => {
    /** 五个种子取均值:单次掷点随内容增补抖动(实测 0.519 ↔ 0.524) */
    const SEEDS = [20260904, 11111, 22222, 33333, 44444]
    const shareAt = (major: number): number =>
      SEEDS.reduce((sum, seed) => sum + powerSourceAudit(major, TYPICAL, seed).find(r => r.id === 'equipFlat')!.share, 0) /
      SEEDS.length
    const jindan = shareAt(2)
    const zhenxian = shareAt(9)
    const top = shareAt(MAX_MAJOR)
    const peak = Math.max(...Array.from({ length: MAX_MAJOR + 1 }, (_, m) => shareAt(m)))
    // 剥离法天然高估首位来源(剥掉装备等于裸装),阈值不按 40% 危险线卡;金丹实测 56.7%
    expect(jindan).toBeLessThan(0.62)
    expect(zhenxian).toBeLessThan(0.66)
    expect(top).toBeLessThan(0.66)
    /** 顶段不许是全程最高点,峰值该在中段(渡劫一带)。「顶段 < 金丹段」只差 0.003,会被内容增补抖翻 */
    expect(top, `顶段 ${(top * 100).toFixed(1)}% 成了全程峰值 ${(peak * 100).toFixed(1)}% —— 装备平铺在后期反而更独大`).toBeLessThan(
      peak
    )
    console.log(
      `\n装备平铺占比(五种子均值):金丹 ${(jindan * 100).toFixed(1)}% · 真仙 ${(zhenxian * 100).toFixed(1)}% · ` +
        `${REALMS[MAX_MAJOR]!.name} ${(top * 100).toFixed(1)}% · 全程峰值 ${(peak * 100).toFixed(1)}%`
    )
  })

  it('装备词条的占比不塌 —— 构筑始终有一份', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'equipMod')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'equipMod')!
    /** 成长大头在平铺,词条占比不随进程上升;只守不许塌(≥3%) */
    expect(zhenxian.share).toBeGreaterThan(0.03)
    expect(jindan.share).toBeGreaterThan(0.03)
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

    // 原始携带量实测基本持平(炼虚 35.1 → 真仙 34.1),只要求不倒退;要守的是下面的实效漂移
    expect(zhenxian.asymmetry).toBeGreaterThan(lianxu.asymmetry * 0.9)
    const drift = zhenxian.effectiveAsymmetry / lianxu.effectiveAsymmetry
    expect(drift).toBeLessThan(1.15)
    console.log(
      `\n炼虚→真仙:词条深度 +${(((zhenxian.playerDepth - lianxu.playerDepth) / lianxu.playerDepth) * 100).toFixed(0)}%,` +
        `实效不对称仅 +${((drift - 1) * 100).toFixed(0)}% —— 堆叠不再换来碾压`
    )
  })

  it('守关者只在玩家越过基准深度后才加厚,浅构筑不受影响', () => {
    expect(celestialDepthScale({})).toBe(1)
    expect(celestialDepthScale({ critRate: 0.2 })).toBe(1)
    const shallow = celestialDepthScale({ critRate: CELESTIAL_BASE_DEPTH * 0.9 })
    const deep = celestialDepthScale({ critRate: CELESTIAL_BASE_DEPTH * 3 })
    expect(shallow).toBe(1)
    expect(deep).toBeGreaterThan(1)
  })

  it('加厚严格等比,堆厚度的净收益归零(堵死「不靠器魂堆到赢」)', () => {
    // 指数 <1 时净优势随深度单调增长:不受器魂约束的来源(功法/灵脉/天赋/称号)堆够即碾过天界
    const ratios = [2, 4, 8, 32, 128].map(k => {
      const depth = CELESTIAL_BASE_DEPTH * k
      return depth / (CELESTIAL_BASE_DEPTH * celestialDepthScale({ critRate: depth }))
    })
    for (const r of ratios) expect(r).toBeCloseTo(1, 6)
    console.log(`\n深度翻 2→128 倍,净优势恒为 ${ratios[0]!.toFixed(3)} —— 堆厚度不再有任何收益`)
  })

  it('基准以下不加厚,六大标准流派完全不受影响', () => {
    // 流派深度 1.02~2.43,基准 2.6
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
