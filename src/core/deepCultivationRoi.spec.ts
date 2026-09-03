/* eslint-disable no-console */
/**
 * 深修补偿审计(A/B 两案)
 *
 * 轮回 ROI 审计已定性:阶数不匹配锁死了「浅修最优」,调参数改不了排序。
 * 本套用例验算两条结构性出路的代价,只出数据不改代码。
 *
 * 设计立场(写进判据):**允许金丹成为最快的道果农场,本身不是问题。**
 * 问题是除了收割道果,系统没有任何理由让玩家把这一世继续活下去。
 * 所以要找的不是「把效率抹平」,而是「让深修成为另一种目标下的最优解」。
 */
import { describe, expect, it } from 'vitest'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { compensationTable, distinctRouteCount, exponentialFruitTable, requiredFruitGrowth } from './deepCultivationRoi'
import { optimalRebirthPoint } from './rebirthRoi'
import { MAX_MAJOR } from '@/data/realms'

const NAMES = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '真仙']

describe('深修补偿 · A 案:道果阶数追平耗时', () => {
  it('追平所需的道果增长率与由此产生的膨胀', () => {
    const k = requiredFruitGrowth(0.5)
    console.log(`\nA 案:要让各境界效率都不低于最优的 50%,道果须按 ×${k.toFixed(2)}/境界 指数增长`)
    console.log('境界   现行道果      A案道果    放大    单世战力加成')
    for (const r of exponentialFruitTable(k)) {
      console.log(
        `${NAMES[r.major]!.padEnd(4)} ${String(r.current).padStart(6)} ${r.proposed.toExponential(2).padStart(11)} ` +
          `${r.inflation.toFixed(0).padStart(6)}x   +${(r.combatBonus * 100).toFixed(0)}%`
      )
    }
  })

  it('追平需要接近耗时增长率的指数——道果必须从二次改成指数', () => {
    const k = requiredFruitGrowth(0.5)
    // 耗时约 3.3 倍/境界,道果要追到 2.8 倍才够
    expect(k).toBeGreaterThan(2.5)
    expect(k).toBeLessThan(3.5)
  })

  it('代价:真仙单世道果暴涨百倍以上,重新成为膨胀源', () => {
    const rows = exponentialFruitTable(requiredFruitGrowth(0.5))
    const zhenxian = rows[rows.length - 1]!
    expect(zhenxian.major).toBe(MAX_MAJOR)
    // 现行 168 枚 → A 案约 2.85 万枚
    expect(zhenxian.inflation).toBeGreaterThan(100)
    // 单**一世**就给出天文级战力加成
    expect(zhenxian.combatBonus).toBeGreaterThan(50)
    console.log(
      `\nA 案真仙:道果 ${zhenxian.current} → ${zhenxian.proposed.toExponential(2)}(×${zhenxian.inflation.toFixed(0)}),` +
        `单世战力 +${(zhenxian.combatBonus * 100).toFixed(0)}%——为了追平效率,把道果重新做成了膨胀源`
    )
  })

  it('A 案自相矛盾:治膨胀的手段本身制造更大的膨胀', () => {
    const rows = exponentialFruitTable(requiredFruitGrowth(0.5))
    // 金丹是基准点道果不变,其上逐境放大——放大倍数本身必须单调递增
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.inflation).toBeGreaterThan(rows[i - 1]!.inflation)
    }
    expect(rows[0]!.inflation).toBeCloseTo(1, 6)
    // 而深世的单世战力加成会冲到几十上百倍(现行真仙仅 +2.5% 量级)
    const worst = rows[rows.length - 1]!
    expect(worst.combatBonus).toBeGreaterThan(50)
  })
})

describe('深修补偿 · B 案:纯效率补偿的深坑', () => {
  it('各境界追平最优 50% 所需的等效额外价值', () => {
    console.log('\nB 案(纯效率口径,追平最优 50%):')
    console.log('境界   现效率   需额外价值   相当于道果的')
    for (const r of compensationTable(0.5)) {
      console.log(
        `${NAMES[r.major]!.padEnd(4)} ${((r.ratio * 100).toFixed(0) + '%').padStart(6)} ${r.needed.toFixed(0).padStart(11)} ` +
          `${(r.timesFruit.toFixed(1) + ' 倍').padStart(10)}`
      )
    }
  })

  it('补偿需求随境界指数发散,真仙要 168 倍道果的额外价值', () => {
    const rows = compensationTable(0.5)
    const zhenxian = rows[rows.length - 1]!
    expect(zhenxian.timesFruit).toBeGreaterThan(100)
    // 且是指数发散,不是线性
    const heti = rows.find(r => r.major === 6)!
    expect(zhenxian.timesFruit / heti.timesFruit).toBeGreaterThan(10)
    console.log(
      `\n合体需 ${heti.timesFruit.toFixed(1)} 倍 → 真仙需 ${zhenxian.timesFruit.toFixed(1)} 倍,` +
        `跨三境放大 ${(zhenxian.timesFruit / heti.timesFruit).toFixed(0)} 倍——补偿路线越走越陡`
    )
  })

  it('即便只求「不落后到十分之一」,深世仍需数十倍补偿', () => {
    const rows = compensationTable(0.1)
    const zhenxian = rows[rows.length - 1]!
    expect(zhenxian.timesFruit).toBeGreaterThan(20)
    const needCount = rows.filter(r => r.needed > 0).length
    console.log(`\n目标降到最优的 10%,仍有 ${needCount}/8 境需补偿,真仙要 ${zhenxian.timesFruit.toFixed(1)} 倍`)
  })

  it('金丹与元婴无须补偿——它们本就在效率曲线的高位', () => {
    const rows = compensationTable(0.5)
    expect(rows.find(r => r.major === MANUAL_REBIRTH_MIN_MAJOR)!.needed).toBe(0)
    expect(rows.find(r => r.major === 3)!.needed).toBe(0)
  })
})

describe('深修补偿 · 结论:补偿路线走不通,出路在不可替代性', () => {
  it('两案都失败:A 制造新膨胀,B 需要指数级补偿', () => {
    const aInflation = exponentialFruitTable(requiredFruitGrowth(0.5))[7]!.inflation
    const bCompensation = compensationTable(0.5)[7]!.timesFruit
    expect(aInflation).toBeGreaterThan(100)
    expect(bCompensation).toBeGreaterThan(100)
    console.log(
      `\nA 案真仙道果放大 ${aInflation.toFixed(0)} 倍;B 案真仙需 ${bCompensation.toFixed(0)} 倍补偿。` +
        `\n两条路都在同一个陷阱里——它们都试图用「可折算的量」去追一条指数曲线`
    )
  })

  it('真正的出路:深修给的必须是金丹拿不到的东西', () => {
    // 只要第二回报与道果可折算,就仍然落在效率比较里,补偿量必然指数发散。
    // 唯一跳出比较的方式是让它不可替代——那时问题从「多少倍」
    // 变成「玩家此刻要的是哪一种东西」
    const routes = distinctRouteCount()
    expect(routes).toBe(MAX_MAJOR - MANUAL_REBIRTH_MIN_MAJOR + 1)
    console.log(
      `\n金丹之上共 ${routes} 个可作停世点的境界。若每境有各自独一份的回报` +
        `(如灵兽师承 / 炼丹炼器 / 区域规则认知 / 天界道痕),` +
        `\n玩家面对的就不再是「元婴只有 58% 效率」,而是「我这一世要的是什么」`
    )
  })

  it('警告:深修回报不可做成必须逐级拿齐的线性任务', () => {
    // 若元婴给A、化神给B、炼虚给C 且都必须收集,玩家仍会算出唯一最优停世点,
    // 只是把「金丹最优」换成了「某个固定境界最优」。
    // 判据:可作停世点的境界数须大于 1,且各自回报应服务于不同目标
    expect(distinctRouteCount()).toBeGreaterThan(1)
  })

  it('金丹作为最快道果农场可以保留——它只该是某一种资源的最优解', () => {
    // MANUAL_REBIRTH_MIN_MAJOR 本就公开宣告「此处可安全收割」,
    // 不必消灭它;要消灭的是「它同时也是整个游戏的最优解」这件事
    expect(optimalRebirthPoint().major).toBe(MANUAL_REBIRTH_MIN_MAJOR)
  })
})
