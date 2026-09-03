/* eslint-disable no-console */
/**
 * 真实存档校准
 *
 * 起因:轮回审计与道果曲线审计都建立在 progressionSim.hoursToReach 之上,
 * 而用真实存档一比,那套模型**高估了约 400 倍**——它算的是「纯修为累积需要多少秒」,
 * 而真实玩家的修为绝大部分来自战斗、事件、丹药、离线收益,不是坐着攒。
 *
 * 本套用例把两份真实存档钉成校准锚点。作用有二:
 *   1. 任何基于耗时模型的结论,都必须先过这里的量级检查
 *   2. 后续若改动修行曲线,这里会立刻显示与真实玩家的偏离
 *
 * 样本(均已修满真仙圆满,但路径截然相反):
 *   小黄鸭 22.7h / 18 世 / 每世 1.26h —— 快进快出,元婴即转世,天赋已集满 33 项
 *   白望舒 38.1h /  5 世 / 每世 7.62h —— 每世修深,合体才转世,天赋仅 11 项
 *
 * 存档不入库(含玩家数据),故这里只固化从中提取的统计量。
 * 原始档路径见 SAMPLE 注释,需要复核时按同样口径重新提取即可。
 */
import { describe, expect, it } from 'vitest'
import { daoFruitGain } from './formulas'
import { hoursToPeakAt } from './samsaraAudit'

/**
 * 真实存档提取的统计量。
 * 取自 2026-09-01 与 2026-09-03 两份导出档,均为真仙圆满状态
 */
export interface SaveSample {
  name: string
  /** 实际游玩小时(totalPlaySec) */
  playHours: number
  /** 存档跨越的真实时长(创建到最后活跃) */
  wallHours: number
  /** 已轮回世数 */
  reincarnations: number
  daoFruit: number
  talents: number
  /** 行为计数 */
  battles: number
  breakthroughs: number
  explores: number
  offlineClaims: number
}

export const SAMPLES: SaveSample[] = [
  {
    name: '小黄鸭',
    playHours: 22.7,
    wallHours: 29.9,
    reincarnations: 17,
    daoFruit: 463,
    talents: 33,
    battles: 6182,
    breakthroughs: 543,
    explores: 151,
    offlineClaims: 12
  },
  {
    name: '白望舒',
    playHours: 38.1,
    wallHours: 66.0,
    reincarnations: 4,
    daoFruit: 348,
    talents: 11,
    battles: 7948,
    breakthroughs: 259,
    explores: 71,
    offlineClaims: 33
  }
]

/** 每世平均实际游玩小时 */
function hoursPerLife(s: SaveSample): number {
  return s.playHours / (s.reincarnations + 1)
}

/** 每世平均凝得道果 → 反推转世时的大境界 */
function transmigrateMajor(s: SaveSample): number {
  const per = s.daoFruit / Math.max(1, s.reincarnations)
  for (let m = 0; m <= 9; m += 1) if (daoFruitGain(m, 9) >= per) return m
  return 9
}

describe('存档校准 · 真实节奏', () => {
  it('两份样本的实际节奏', () => {
    console.log('\n真实存档(均已修满真仙圆满):')
    for (const s of SAMPLES) {
      console.log(
        `  ${s.name}:${s.playHours}h / ${s.reincarnations + 1} 世 = 每世 ${hoursPerLife(s).toFixed(2)}h · ` +
          `道果 ${(s.daoFruit / s.reincarnations).toFixed(1)}/世(约 major ${transmigrateMajor(s)} 转世)· ` +
          `天赋 ${s.talents} 项 · 离线占 ${(((s.wallHours - s.playHours) / s.wallHours) * 100).toFixed(0)}%`
      )
    }
  })

  it('走完一世的真实量级是「小时」,不是「百小时」', () => {
    for (const s of SAMPLES) {
      const h = hoursPerLife(s)
      expect(h).toBeGreaterThan(0.5)
      expect(h).toBeLessThan(20)
    }
  })

  it('玩家不会每世都修满真仙——道果反推的转世境界远低于九', () => {
    // 这是耗时模型第一个错误假设:它按「每世修满真仙」计,
    // 而实际是元婴到合体之间就转世
    for (const s of SAMPLES) {
      const m = transmigrateMajor(s)
      expect(m).toBeGreaterThanOrEqual(3)
      expect(m).toBeLessThanOrEqual(7)
    }
  })

  it('两种玩法路径差异极大,不能用单一节奏描述轮回', () => {
    const [fast, slow] = SAMPLES
    // 快档轮回 17 世、慢档仅 4 世,而两人都到了真仙圆满
    expect(fast!.reincarnations).toBeGreaterThan(slow!.reincarnations * 3)
    // 每世耗时相差六倍
    expect(hoursPerLife(slow!)).toBeGreaterThan(hoursPerLife(fast!) * 4)
    console.log(
      `\n路径分化:${fast!.name} 每世 ${hoursPerLife(fast!).toFixed(2)}h × ${fast!.reincarnations + 1} 世` +
        ` vs ${slow!.name} 每世 ${hoursPerLife(slow!).toFixed(2)}h × ${slow!.reincarnations + 1} 世`
    )
  })
})

describe('存档校准 · 耗时模型的偏差', () => {
  it('progressionSim 高估两个数量级——凡引用其绝对值的结论一律作废', () => {
    for (const s of SAMPLES) {
      const lives = s.reincarnations + 1
      let modeled = 0
      for (let n = 1; n <= lives; n += 1) modeled += hoursToPeakAt(n)
      const ratio = modeled / s.playHours
      console.log(`\n${s.name}:模型 ${modeled.toFixed(0)}h vs 实际 ${s.playHours}h → 高估 ${ratio.toFixed(0)} 倍`)
      // 偏差在两个数量级以上,绝对值完全不可用
      expect(ratio).toBeGreaterThan(50)
    }
  })

  it('模型自己就声明了不可靠,只是幅度远超注释所说的 1.5~3 倍', () => {
    // progressionSim 头部注释:「未计入突破失败/灵气等待/历练时间,真实耗时约为估算的 1.5~3 倍」
    // 方向甚至反了——真实耗时远**低于**估算,因为修为主要来自战斗与离线收益而非静坐
    const s = SAMPLES[0]!
    let modeled = 0
    for (let n = 1; n <= s.reincarnations + 1; n += 1) modeled += hoursToPeakAt(n)
    expect(modeled).toBeGreaterThan(s.playHours * 3)
  })

  it('修为的主要来源是战斗与离线,不是静坐攒时间', () => {
    for (const s of SAMPLES) {
      // 每小时两百场以上的战斗,这才是修为的大头
      const battlesPerHour = s.battles / s.playHours
      expect(battlesPerHour).toBeGreaterThan(150)
      console.log(`\n${s.name}:每小时 ${battlesPerHour.toFixed(0)} 场战斗、${(s.breakthroughs / s.playHours).toFixed(1)} 次突破`)
    }
  })

  it('离线占比可观,进一步说明「在线时长」不是进度的量尺', () => {
    for (const s of SAMPLES) {
      const offlineShare = (s.wallHours - s.playHours) / s.wallHours
      expect(offlineShare).toBeGreaterThan(0.2)
    }
  })
})

describe('存档校准 · 对既有结论的影响', () => {
  it('仍然成立:道果无界而天赋有界,快档已集满 33 项', () => {
    const fast = SAMPLES[0]!
    // 天赋 33 项是硬上限,快档十七世已吃满;道果仍在涨
    expect(fast.talents).toBe(33)
    expect(fast.daoFruit).toBeGreaterThan(400)
  })

  it('作废:任何「第 N 世需要 X 小时」的绝对结论', () => {
    // 保留此用例作为路标——审计模块若再输出绝对时长,须先过存档校准
    const s = SAMPLES[0]!
    const modeled = hoursToPeakAt(1)
    // 模型说第一世 1730h,而玩家十八世总共才 22.7h
    expect(modeled).toBeGreaterThan(s.playHours * 50)
  })

  it('道果实际积累速度远低于模型假设', () => {
    for (const s of SAMPLES) {
      const modeledFruit = s.reincarnations * daoFruitGain(9, 9)
      expect(s.daoFruit).toBeLessThan(modeledFruit)
      console.log(`\n${s.name}:实际道果 ${s.daoFruit} vs 模型假设 ${modeledFruit}(按每世修满真仙计)`)
    }
  })
})
