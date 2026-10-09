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
// 层级映射的真相源在区域表(审计只是它的消费者,不再转发一份)
import { maxTierForMajor } from '@/data/regions'

const TYPICAL = gearProfile('typical')

describe('膨胀治理 · 装备乘区对称', () => {
  it('玩家装备乘区与敌人补偿的增速已基本对齐', () => {
    const a = gearAsymmetry()
    console.log(`\n玩家装备乘区 ${a.playerGearGrowth.toFixed(2)}x / 敌人补偿 ${a.enemyGearGrowth.toFixed(2)}x = ${a.ratio.toFixed(2)}x`)

    /**
     * 治理前 8.55x(玩家 20.9x vs 敌人 2.44x),Phase 33.2 治理后 1.27x。
     * Phase 37(品质=强度阶梯)改口径:玩家一侧不再取「凡品零级 → 神品满强化」
     * 那种谁也拿不到的跨度,而是**这一层的典型穿着**(掉落池中位品质)。
     * 比值 0.36 表示敌人补偿刻意跑在典型装备曲线之前 —— 玩家的优势来自
     * 撞上高品质的那一跃(五阶神品能压七阶地品),而不是人人都有一份的底子。
     * 所以这里守的是「同量级、不许反过来把玩家压死」,而不是「玩家必须赢过补偿」。
     */
    expect(a.ratio).toBeLessThan(1.6)
    expect(a.ratio).toBeGreaterThan(0.3)
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
      // Phase 37:品质那一跃是真的跃(五阶神品 ≈ 七阶地品),单次 10.4x 属设计内;
      // Phase 38 又把境界裸装差拉大(COMBAT_MAJOR_GROWTH 3.4→3.8),跨界的渡劫→真仙
      // 实测 12.0x —— 阈值随之抬到 14,守的仍是「单跃不许失控」而不是某个具体倍数
      for (const r of rows) {
        expect(r.leapMult).toBeLessThan(14)
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

  it('渡劫→真仙:飞升仙界,内容同步承接(不再是「无内容边界」)', () => {
    const rows = realmLeapAudit(TYPICAL)
    const last = rows.find(r => r.fromMajor === 8)!
    // 扩界前:真仙没有对应区域(tier 最高 20 = 渡劫),contentMult 恒为 1,脱节必然 >1。
    // 扩界后:真仙由 tier 21 的云海仙门承接,这一跃有了内容跨度。
    // 它是唯一一次「跨界飞升」,玩家跃升略快于内容(脱节 ~1.4)属设计留白,但必须收敛
    expect(last.contentMult).toBeGreaterThan(1)
    expect(last.leapMult).toBeLessThan(8)
    expect(last.detach).toBeLessThan(2)
  })

  it('界外每一跃脱节纳入纳管:天堑不塌成绝壁,蓄力不溢成跳崖', () => {
    // 人界各跃本就有界(平均脱节 <1.15、单跃 <1.25);界外(fromMajor>8)此前**只打印不设防**。
    // 实测三档(随缘/常规/极限)界外脱节在 0.31~2.21:
    //  - 神将→神王贴近 0.3:界外一境一天堑,内容刻意领先(晚境更难)属设计;
    //  - 太乙→大罗 / 混沌真灵→神魔贴近 2.2:装备换代那一下的蓄力落差,内容一时没跟上。
    // 两条都不许再恶化 → 上界 2.5(蓄力不得把内容甩得更开,甩开那段境=白给)、
    // 下界 0.25(天堑不得塌成绝壁,塌了晚境=卡死)。镜像人界的逐跃断言,只是界外带宽更宽。
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
    // 治理前 = 金丹(2):第三个大境界起内容就全线失效。
    // 扩展全套仙界/神界/混沌海区域后,常规档的压制比例会在各境回落,
    // 死亡点消失(-1)——这是比「推迟到炼虚之后」更强的好结果
    expect(death === -1 || death >= 5).toBe(true)
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

  /**
   * 扩界之后,0-9 号境界的曲线有专门守卫,10-20(神界/混沌海)却从来只被"打印"过 ——
   * contentCoverageAudit 会算到 MAX_MAJOR,但没有一条断言看那一半。故补两条上界守卫:
   * 顶区战力比必须是有限数,且有上界。下界(内容死亡点)已有专门用例,这里守上界。
   */
  it('全程顶区战力比都是有限数 —— 后期数值不许算出 NaN/Infinity', () => {
    for (const profile of GEAR_PROFILES) {
      for (const r of contentCoverageAudit(profile)) {
        expect(Number.isFinite(r.topPowerRatio), `[${profile.name}] ${REALMS[r.major]!.name} 顶区战力比不是有限数`).toBe(true)
        expect(Number.isFinite(r.crushRatio), `[${profile.name}] ${REALMS[r.major]!.name} 压制比不是有限数`).toBe(true)
      }
    }
  })

  it('顶区战力比全程有上界:任何境界都不该碾到「区域战斗彻底失去意义」', () => {
    // 实测(治理后):全程最高出现在真仙附近,常规档 5.8x、极限档 7.2x。
    // 取 12x 作为红线:留出余量,又能挡住"新界一加、补偿没跟上"的跑飞。
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

  it('境界基础的占比被显著抬回,突破重新有分量', () => {
    const jindan = powerSourceAudit(2, TYPICAL).find(r => r.id === 'realm')!
    const lianxu = powerSourceAudit(5, TYPICAL).find(r => r.id === 'realm')!
    const zhenxian = powerSourceAudit(9, TYPICAL).find(r => r.id === 'realm')!
    const top = powerSourceAudit(MAX_MAJOR, TYPICAL).find(r => r.id === 'realm')!
    // 治理前 金丹 17.2% / 炼虚 6.4% / 真仙 4.4%(一路萎缩到个位数)
    // 治理后 金丹 29.6% / 炼虚 14.4%;扩界后仙界以上共用平坦曲线,
    // 境界基础占比在 ~6% 处止跌回稳,不再逐境萎缩
    // Phase 37:装备平铺按品质阶梯抬升,境界基础的占比随之回落一档(金丹 21.8% / 炼虚 10.3%)
    expect(jindan.share).toBeGreaterThan(0.2)
    expect(lianxu.share).toBeGreaterThan(0.09)
    // Phase 37:顶段的战力大头落在装备平铺上(品质=强度阶梯),境界基础只剩 1.2% 量级
    expect(top.share).toBeGreaterThan(0.01)
    expect(top.share).toBeGreaterThan(zhenxian.share * 0.2)
    console.log(
      `\n境界基础占比:金丹 ${(jindan.share * 100).toFixed(1)}% / 炼虚 ${(lianxu.share * 100).toFixed(1)}% / ` +
        `真仙 ${(zhenxian.share * 100).toFixed(1)}% / ${REALMS[MAX_MAJOR]!.name} ${(top.share * 100).toFixed(1)}%(治理前 17.2 / 6.4 / 4.4)`
    )
  })

  it('装备平铺不再一路独大,后期让位给构筑与其他系统', () => {
    /**
     * 五个种子取均值。
     *
     * 单次掷点的读数会随内容增补而抖:同一份装备池改一改,镶嵌词条掷出的先后就变了,
     * 占比可以整整数个百分点上下(实测 0.519 ↔ 0.524)。而这条判据说的是**长期结构**,
     * 不是某一次掷点,故按多样本均值读。
     */
    const SEEDS = [20260904, 11111, 22222, 33333, 44444]
    const shareAt = (major: number): number =>
      SEEDS.reduce((sum, seed) => sum + powerSourceAudit(major, TYPICAL, seed).find(r => r.id === 'equipFlat')!.share, 0) /
      SEEDS.length
    const jindan = shareAt(2)
    const zhenxian = shareAt(9)
    const top = shareAt(MAX_MAJOR)
    const peak = Math.max(...Array.from({ length: MAX_MAJOR + 1 }, (_, m) => shareAt(m)))
    // 治理前 65.3% → 57.4%;治理后(20 层)53.0% → 46.9%;一阶一名之后在 52~59% 之间走平
    // 剥离法天然高估首位来源(剥掉装备等于裸装),故阈值不能按 40% 危险线直接卡,
    // 要看的是「是否随进程下行、是否给其他来源让出空间」
    // Phase 37:品质=强度阶梯之后,装备平铺在高品上确实更重(金丹 56.7%)——
    // 这是「拿到手枪就该赢」的代价,阈值随之放宽到 0.62;下面那条结构判据仍然守着
    expect(jindan).toBeLessThan(0.62)
    expect(zhenxian).toBeLessThan(0.66)
    expect(top).toBeLessThan(0.66)
    /**
     * 判据落在**结构**上:顶段不许是全程最高点 —— 峰值该出在中段(渡劫一带),
     * 此后要靠构筑与其他来源补上。原来这里比的是「顶段 < 金丹段」,那只是这条
     * 结构的一个脆代理:治理后它只赢 0.003,任何一次内容增补都能把它抖翻,
     * 而它想守的从来不是「金丹这一个点」,是「后期别让装备一家独大」。
     */
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
    /**
     * 旧判据是「真仙的词条占比 > 金丹」,那是 Phase 33.2 口径下成立的结构。
     * Phase 37 把成长的大头还给了平铺(品质=强度阶梯),词条占比不再随进程上升 ——
     * 改守「不许塌」:词条仍是构筑的载体,后期也得占到 3% 以上。
     */
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

    // 治理前:炼虚 33.2x → 真仙 57.1x,堆得越多差距越大,这就是「一脚踹死」
    // 治理后:守关者按玩家深度加厚,实效不对称几乎持平
    /**
     * 旧判据是「原始携带量仍在涨(×1.4)」,那是 Phase 33.2 口径(真仙 = 满身神品)。
     * Phase 37 的品质窗口把真仙的典型穿着压在灵/玄品,原始携带量因此不再增长
     * (实测 炼虚 35.1 → 真仙 34.1,基本持平)——**这条判据守的从来不是它**,
     * 而是下面那条:堆得多不等于碾得过。故只要求它不倒退。
     */
    expect(zhenxian.asymmetry).toBeGreaterThan(lianxu.asymmetry * 0.9)
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
