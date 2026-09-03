/* eslint-disable no-console */
/**
 * 轮回 ROI 审计
 *
 * 玩家反馈「轮回次数太多没意义」,真实存档显示 22.7 小时刷了 18 世。
 * 前一轮把题目问成了「道果永久收益该怎么递减」,那是错的——
 * 该问的是:**为什么高频轮回是显性最优解。**
 *
 * 本套用例的结论:这不是玩家习惯,是系统结构逼出来的。
 * 道果对境界二次增长、耗时对境界指数增长,分子二次分母指数,
 * 效率必然单调崩塌,浅修快轮回在数学上就是最优。
 *
 * 口径:绝对小时数不可信(见 saveCalibration),但本模块全部读数
 * 都是同一把尺子下的比值,偏差相除时抵消。
 */
import { describe, expect, it } from 'vitest'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { fullSecondsForMajor, growthOrders, marginalTable, optimalRebirthPoint, rebirthPoints } from './rebirthRoi'
import { estimateCultMult } from './progressionSim'
import { baseCultPerSec, expRequirement } from './formulas'
import { SUB_LEVELS } from '@/data/constants'
import { toNum } from '@/utils/gnum'

const NAMES = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '真仙']

describe('轮回 ROI · 各转世点的道果效率', () => {
  it('合法转世点的效率表', () => {
    const rows = rebirthPoints()
    const best = optimalRebirthPoint()
    console.log(`\n轮回门槛:major≥${MANUAL_REBIRTH_MIN_MAJOR}(${NAMES[MANUAL_REBIRTH_MIN_MAJOR]})`)
    console.log('境界   道果   修满耗时    道果/时   相对最优')
    for (const r of rows) {
      console.log(
        `${NAMES[r.major]!.padEnd(4)} ${String(r.fruit).padStart(4)} ${r.hours.toFixed(1).padStart(9)}h ` +
          `${r.efficiency.toFixed(3).padStart(9)} ${((r.efficiency / best.efficiency) * 100).toFixed(0).padStart(6)}%`
      )
    }
  })

  it('效率随境界单调递减——越浅修越划算', () => {
    const rows = rebirthPoints()
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.efficiency).toBeLessThan(rows[i - 1]!.efficiency)
    }
  })

  it('最优转世点就是门槛本身(金丹),不是玩家选出来的', () => {
    const best = optimalRebirthPoint()
    expect(best.major).toBe(MANUAL_REBIRTH_MIN_MAJOR)
    const worst = rebirthPoints()[rebirthPoints().length - 1]!
    // 金丹转世的道果效率是真仙转世的数百倍
    expect(best.efficiency / worst.efficiency).toBeGreaterThan(100)
    console.log(
      `\n最优:${NAMES[best.major]}(效率 ${best.efficiency.toFixed(2)}),` +
        `最差:${NAMES[worst.major]}(${worst.efficiency.toFixed(3)})——相差 ${(best.efficiency / worst.efficiency).toFixed(0)} 倍`
    )
  })
})

describe('轮回 ROI · 边际账:再修一境值不值', () => {
  it('每一段的边际效率', () => {
    console.log('\n从→到       道果  时间成本    边际效率  占「重刷一轮金丹」')
    for (const r of marginalTable()) {
      console.log(
        `${NAMES[r.from]}→${NAMES[r.to]}  +${String(r.fruitGain).padStart(3)} ${r.hoursCost.toFixed(1).padStart(9)}h ` +
          `${r.marginal.toFixed(3).padStart(9)} ${(r.vsOptimal * 100).toFixed(1).padStart(8)}%`
      )
    }
  })

  it('从金丹再往上修一境,收益就只剩重刷一轮的三分之一', () => {
    const first = marginalTable()[0]!
    expect(first.from).toBe(MANUAL_REBIRTH_MIN_MAJOR)
    expect(first.vsOptimal).toBeLessThan(0.4)
    console.log(`\n${NAMES[first.from]}→${NAMES[first.to]}:边际效率仅为重刷一轮金丹的 ${(first.vsOptimal * 100).toFixed(1)}%`)
  })

  it('元婴之后深修的边际收益跌破一成半,深修在数值上毫无理由', () => {
    for (const r of marginalTable()) {
      if (r.from < 3) continue
      expect(r.vsOptimal).toBeLessThan(0.15)
    }
  })

  it('边际效率同样单调递减,不存在「修到某境界忽然划算」的拐点', () => {
    const rows = marginalTable()
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.marginal).toBeLessThan(rows[i - 1]!.marginal)
    }
  })
})

describe('轮回 ROI · 结构成因', () => {
  it('道果二次增长而耗时指数增长,阶数不匹配', () => {
    const g = growthOrders()
    console.log(
      `\n金丹→真仙:道果 ×${g.fruitSpan.toFixed(1)},耗时 ×${g.hoursSpan.toFixed(0)}` +
        ` → 效率跌 ${g.efficiencyDrop.toFixed(0)} 倍`
    )
    // 道果按 Σ(i+1) 只涨几倍,耗时按 ~3.3^n 涨几千倍
    expect(g.fruitSpan).toBeLessThan(15)
    expect(g.hoursSpan).toBeGreaterThan(1000)
    // 这不是参数没调好,是分子二次分母指数的阶数问题
    expect(g.efficiencyDrop).toBeGreaterThan(100)
  })

  it('两位真实玩家的落点都在效率曲线的高位段', () => {
    // 小黄鸭 27.2 枚/世(约元婴)、白望舒 87.0 枚/世(约合体)
    // 前者效率 48%、后者 4%——快档玩家确实站在更优的位置
    const rows = rebirthPoints()
    const best = optimalRebirthPoint()
    const yuanying = rows.find(r => r.major === 3)!
    const heti = rows.find(r => r.major === 6)!
    expect(yuanying.efficiency / best.efficiency).toBeGreaterThan(heti.efficiency / best.efficiency * 5)
    console.log(
      `\n小黄鸭(约元婴)效率 ${((yuanying.efficiency / best.efficiency) * 100).toFixed(0)}% ` +
        `vs 白望舒(约合体)${((heti.efficiency / best.efficiency) * 100).toFixed(0)}%——` +
        `前者每小时拿到的道果是后者的 ${(yuanying.efficiency / heti.efficiency).toFixed(0)} 倍`
    )
  })

  it('结论:高频轮回不是玩法偏好,是唯一的数值最优解', () => {
    // 若深修在任何一段有正的比较优势,玩家就有理由慢玩;实测没有
    const anyWorthDeepening = marginalTable().some(r => r.vsOptimal >= 1)
    expect(anyWorthDeepening).toBe(false)
  })
})

describe('轮回 ROI · 口径完整性', () => {
  it('耗时已计入突破失败重试与灵气等待,不只是修为累积', () => {
    // 质疑:「修满耗时没算修炼速度、灵气恢复、突破成功率」
    // 修速倍率 progressionSim 本就有(功法/装备/建筑/灵根/道果);
    // 突破与灵气是本模块补的,fullSecondsForMajor 比纯修为口径更慢
    for (const m of [2, 5, 9]) {
      const full = fullSecondsForMajor(m)
      const bare = (() => {
        const mult = estimateCultMult(m, 0)
        let s = 0
        for (let sub = 0; sub < SUB_LEVELS; sub += 1) s += toNum(expRequirement(m, sub)) / (baseCultPerSec(m, sub) * mult)
        return s
      })()
      expect(full).toBeGreaterThan(bare)
      console.log(`\nmajor=${m}:纯修为 ${(bare / 3600).toFixed(1)}h → 计入突破与灵气 ${(full / 3600).toFixed(1)}h`)
    }
  })

  it('补齐漏项后结论不翻转:最优点仍是金丹', () => {
    // 三项漏掉的成本都随境界递增,分子分母同向放大,压不动阶数差
    expect(optimalRebirthPoint().major).toBe(MANUAL_REBIRTH_MIN_MAJOR)
    const g = growthOrders()
    // 跌幅由旧口径 466 倍变为 339 倍——收窄了,但远未消除
    expect(g.efficiencyDrop).toBeGreaterThan(100)
    expect(g.efficiencyDrop).toBeLessThan(466)
  })
})
