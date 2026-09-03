/* eslint-disable no-console */
/**
 * 道果非效率出口空间审计
 *
 * 断开速度职责必须与「建立非效率类消费出口」配套,否则道果会变成
 * 「无限增长 → 只堆战力 → 制造膨胀」。
 *
 * 本套用例回答三件事,不设计具体兑换、不改数值:
 *   1. 哪些出口绝对不能进效率链 —— 用图可达性判定,不靠感觉列清单
 *   2. 「消耗/永久」与「可复利/不可复利」是两个正交维度
 *   3. 零消费会让阈值型出口最终失去决策意义
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_STAT_KEYS,
  EFFICIENCY_REACH,
  OUTLETS,
  QUADRANTS,
  budgetCurve,
  idealQuadrant,
  qualifiedOutlets,
  reachesEfficiency,
  rejectedOutlets,
  statModsAllReachable,
  trivialAtLife
} from './fruitOutlets'

describe('出口空间 · 效率链可达性', () => {
  it('全部属性键到「轮回速度」的路径', () => {
    console.log('\n跳数  属性键                路径')
    for (const r of [...EFFICIENCY_REACH].sort((a, b) => a.hops - b.hops)) {
      console.log(`  ${r.hops}   ${String(r.key).padEnd(20)} ${r.via}`)
    }
  })

  it('最要紧的一条:没有一个属性键是安全的', () => {
    // 逐键判定的结果是全部可达 —— 因此禁止清单不该逐项去列
    expect(statModsAllReachable(ALL_STAT_KEYS)).toBe(true)
    const direct = EFFICIENCY_REACH.filter(r => r.hops === 1).length
    const indirect = EFFICIENCY_REACH.length - direct
    console.log(
      `\n${ALL_STAT_KEYS.length} 个属性键全部可达「轮回速度」:` +
        `直接 ${direct} 个,间接 ${indirect} 个。` +
        `\n结论:禁止的不是某几个键,而是**整个 StatMods 命名空间** ——` +
        `\n任何以属性形式发放的道果出口都会重建回路`
    )
  })

  it('间接路径才是陷阱:换成资源同样闭合回路', () => {
    // 「道果 → 修炼速度」被禁掉后,「道果 → 灵石 → 强化 → 战力 → 历练更快」
    // 依然把回路接回去,只是多绕两跳
    expect(reachesEfficiency('spiritStoneGain')).toBe(true)
    expect(reachesEfficiency('dropRate')).toBe(true)
    expect(reachesEfficiency('luck')).toBe(true)
    const res = EFFICIENCY_REACH.find(r => r.key === 'spiritStoneGain')!
    console.log(`\n灵石收益的路径:${res.via} —— 隔了三跳,回路照样闭合`)
  })

  it('战斗类词条也不安全:战力最终换算成历练效率', () => {
    expect(reachesEfficiency('attackPct')).toBe(true)
    expect(reachesEfficiency('lifesteal')).toBe(true)
    console.log(
      '\n战斗表现 → 历练更顺 → 修为与掉落更快 → 更早轮回。' +
        '\n这条路径比资源路径更短,却最容易被当成「只是战力,不影响速度」'
    )
  })
})

describe('出口空间 · 两个正交维度', () => {
  it('四象限', () => {
    console.log('\n象限                    判定')
    for (const q of QUADRANTS) console.log(`${q.label.padEnd(22)} ${q.verdict}`)
  })

  it('「花掉」不等于「安全」——这是两个维度而非一个', () => {
    // 反例:花掉道果买永久属性。余额确实减少了,回路却原样闭合
    const bad = OUTLETS.find(o => o.id === 'permStat')!
    expect(bad.spend).toBe('consume')
    expect(bad.rebuildsLoop).toBe(true)
    console.log(`\n反例:${bad.name} —— ${bad.note}`)
    console.log('故「消耗型 vs 永久型」回答的是「道果会不会被花掉」,')
    console.log('而「可复利 vs 不可复利」回答的是「会不会重建回路」,两者互不蕴含')
  })

  it('理想象限是「花掉 + 不进效率链」', () => {
    const ideal = idealQuadrant()
    expect(ideal.spend).toBe('consume')
    expect(ideal.loops).toBe(false)
    console.log(`\n理想:${ideal.label} —— ${ideal.verdict}`)
  })

  it('候选出口评估', () => {
    console.log('\n出口              花费      发放物    重建回路  已有宿主')
    for (const o of OUTLETS) {
      console.log(
        `${o.name.padEnd(16)} ${(o.spend === 'consume' ? '花掉' : '不花').padEnd(8)} ` +
          `${o.payload.padEnd(9)} ${(o.rebuildsLoop ? '是' : '否').padEnd(9)} ${o.hasHost ? '是' : '否'}`
      )
      console.log(`    ${o.note}`)
    }
  })

  it('合格出口里六项之中五项已有宿主系统,不必从零造', () => {
    const ok = qualifiedOutlets()
    const hosted = ok.filter(o => o.hasHost)
    expect(ok.length).toBeGreaterThan(rejectedOutlets().length)
    expect(hosted.length).toBeGreaterThanOrEqual(ok.length - 1)
    console.log(
      `\n合格 ${ok.length} 项:${ok.map(o => o.name).join('、')}` +
        `\n其中 ${hosted.length} 项已有可挂载的系统(lifeThemes / mutators / worldGen / lore / 图鉴),` +
        `\n只有「${ok.find(o => !o.hasHost)?.name}」需要新建`
    )
  })

  it('被否决的两项恰是最容易想到的两种兑换', () => {
    const bad = rejectedOutlets().map(o => o.name)
    expect(bad).toContain('兑换永久属性')
    expect(bad).toContain('兑换资源礼包')
    console.log(`\n否决:${bad.join('、')} —— 都是「把道果换成数值」的变体`)
  })
})

describe('出口空间 · 零消费的后果', () => {
  it('余额曲线与阈值型出口的失效点', () => {
    const P = 300
    console.log(`\n以定价 ${P} 道果的阈值型出口为例:`)
    console.log('世代  余额   相当于几个')
    for (const r of budgetCurve(P, 30)) {
      if (![6, 12, 15, 20, 25, 30].includes(r.life)) continue
      console.log(`${String(r.life).padStart(4)} ${String(r.balance).padStart(6)}   ×${r.timesPrice.toFixed(1)}`)
    }
    const t = trivialAtLife(P, 3)
    expect(t).toBeGreaterThan(0)
    console.log(
      `\n第 ${t} 世余额已达定价的三倍 —— 此后玩家不必权衡,只需等待。` +
        `\n零消费使任何阈值型出口都会**自动失效**`
    )
  })

  it('故道果必须真的被花掉,否则出口只是延后的既得', () => {
    // 只进不出 → 余额单调增 → 任何固定定价终将被淹没
    const early = trivialAtLife(100, 3)
    const late = trivialAtLife(1000, 3)
    expect(late).toBeGreaterThan(early)
    console.log(
      `\n定价 100 → 第 ${early} 世失效;定价 1000 → 第 ${late} 世失效。` +
        `\n抬价只能延后,不能解决 —— 因为余额无上限而定价是固定的。` +
        `\n真正的解法是让余额**下降**:积累 → 判断 → 花费`
    )
  })

  it('结论:断边与补出口是同一件事的两半', () => {
    const ok = qualifiedOutlets()
    const ideal = idealQuadrant()
    // 只断边不补出口 → 道果无限增长且只堆战力
    // 只补出口不断边 → 回路仍在
    expect(ok.length).toBeGreaterThan(0)
    expect(ideal.loops).toBe(false)
    console.log(
      '\n只断边不补出口:道果无限增长 → 只堆战力 → 制造膨胀' +
        '\n只补出口不断边:回路仍在,出口只是额外的花销' +
        '\n两者同时做,才得到「浅修赚取选择权,深修创造值得选择的东西」' +
        '\n\n下一步的约束已经可判定:出口的发放物不得属于 StatMods 命名空间,' +
        '\n也不得是可兑换成它的资源'
    )
  })
})
