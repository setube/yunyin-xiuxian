/* eslint-disable no-console */
/**
 * 道果职责拆分审计
 *
 * 问题前移一步:不问「道果该怎么衰减」,而问
 * **为什么道果必须同时承担「永久战力」与「永久修炼速度」两个职责**。
 *
 * 因为若不拆职责,任何软帽(^0.9 → log → 周期折算)都只是在压一个
 * 仍然存在的正反馈回路,结果只会是「晚一点爆」。
 */
import { describe, expect, it } from 'vitest'
import {
  DAO_FRUIT_COMBAT_BONUS,
  DAO_FRUIT_CULT_BONUS,
  FRUIT_CONSUMERS,
  NOT_FRUIT_DRIVEN,
  counterfactualAt,
  loopStopsAtLife,
  realConsumers,
  roleMagnitudes,
  steadySpeedupWithoutSpeedRole,
  unboundedLoopCount
} from './daoFruitRoles'

describe('道果职责 · 引用点全貌', () => {
  it('逐项归类', () => {
    const ROLE = { speed: '消费·速度', power: '消费·战力', production: '生产', display: '展示', sim: '模拟' }
    const NEED = { must: '非它不可', legacy: '历史遗留', replaceable: '可换来源' }
    const LOOP = { direct: '直接入环', indirect: '间接入环', none: '不入环' }
    console.log('\n引用点          角色        必要性      回环')
    for (const c of FRUIT_CONSUMERS) {
      console.log(
        `${c.name.padEnd(14)} ${ROLE[c.role].padEnd(10)} ` +
          `${(c.necessity ? NEED[c.necessity] : '—').padEnd(10)} ${LOOP[c.loop]}`
      )
      console.log(`    ${c.site}`)
      console.log(`    ${c.evidence}`)
    }
  })

  it('道果只有一个真消费者,却在同一处被赋予两个职责', () => {
    const real = realConsumers()
    expect(real).toHaveLength(2)
    // 两个职责挂在同一个函数、同一个 fruit 值上
    const sites = new Set(real.map(c => c.site.split(' → ')[0]))
    expect(sites.size).toBe(1)
    console.log(
      `\n真消费者 ${real.length} 项(${real.map(c => c.name).join('、')}),` +
        `\n但两者同出于 ${[...sites][0]} —— 一个 fruit 值,两条乘区`
    )
  })

  it('道果没有任何消费出口:它不解锁、不兑换、不参与阶位', () => {
    // 全部引用点里没有一处「花掉」道果
    const spends = FRUIT_CONSUMERS.filter(c => /消耗|扣除|spend|cost/i.test(c.evidence))
    expect(spends).toHaveLength(0)
    console.log('\n以下系统与道果无关(此前一度被认为相关):')
    for (const n of NOT_FRUIT_DRIVEN) console.log(`  ${n.name.padEnd(10)} ${n.actual}`)
    console.log('\n道果是纯单调递增的数字,只被读取,从不被花掉')
  })

  it('战力职责非它不可,速度职责是历史遗留', () => {
    const power = FRUIT_CONSUMERS.find(c => c.id === 'combat')!
    const speed = FRUIT_CONSUMERS.find(c => c.id === 'cultSpeed')!
    expect(power.necessity).toBe('must')
    expect(speed.necessity).toBe('legacy')
    // 两者的入环方式不同,这决定了它们的危害性质不同
    expect(speed.loop).toBe('direct')
    expect(power.loop).toBe('indirect')
    console.log(
      `\n战力:${power.loop === 'indirect' ? '间接入环' : ''} —— 玩家对「轮回有用」的主要体感,拿掉它轮回就没意义了` +
        `\n速度:${speed.loop === 'direct' ? '直接入环' : ''} —— 「更快→更早轮回→更多道果」的闭环正是由它闭合的`
    )
  })
})

describe('道果职责 · 两个职责的量级', () => {
  it('逐世量级表', () => {
    console.log(`\n速度系数 ${DAO_FRUIT_CULT_BONUS} · 战力系数 ${DAO_FRUIT_COMBAT_BONUS}`)
    console.log('世代  累计道果  有效道果  速度加成  战力乘区')
    for (const r of roleMagnitudes(30)) {
      if (![1, 3, 6, 12, 20, 30].includes(r.life)) continue
      console.log(
        `${String(r.life).padStart(4)} ${String(r.fruit).padStart(9)} ` +
          `${r.effective.toFixed(1).padStart(9)} ${`+${r.speedAdd.toFixed(2)}`.padStart(9)} ` +
          `${`×${r.powerMult.toFixed(2)}`.padStart(9)}`
      )
    }
  })

  it('两个职责到三十世都已是数量级级别的加成', () => {
    const m = roleMagnitudes(30)
    const last = m[m.length - 1]!
    // 速度加成是「倍率上再加」,战力是直接乘区
    expect(last.speedAdd).toBeGreaterThan(5)
    expect(last.powerMult).toBeGreaterThan(4)
    console.log(
      `\n第 30 世:修炼速度 +${last.speedAdd.toFixed(2)}、战力 ×${last.powerMult.toFixed(2)}。` +
        `\n同一个玩家在同一个金丹境界,战力是首世的 ${last.powerMult.toFixed(1)} 倍 ——` +
        `\n这正是「炼虚推完全图、天界一脚踹死」的算式来源`
    )
  })

  it('两者危害性质不同:速度制造回路,战力碾压内容', () => {
    const m = roleMagnitudes(30)
    const at12 = m.find(r => r.life === 12)!
    // 速度职责的后果是复利(回路),战力职责的后果是膨胀(碾压内容曲线)
    // 两者都大,但要用不同的手段处理
    expect(at12.speedAdd).toBeGreaterThan(1)
    expect(at12.powerMult).toBeGreaterThan(2)
    console.log(
      `\n第 12 世已是 速度 +${at12.speedAdd.toFixed(2)} / 战力 ×${at12.powerMult.toFixed(2)}。` +
        `\n速度职责 → 正反馈回路(轮回越来越快)` +
        `\n战力职责 → 内容曲线碾压(境界内容被越级推平)` +
        `\n同一个来源,两种病 —— 因此不该用同一个软帽同时治`
    )
  })
})

describe('道果职责 · 反事实:只剥离速度职责', () => {
  it('剥离后长期正反馈几乎全部消失', () => {
    console.log('\n世代   现状提速   剥离速度职责后   正反馈削减')
    for (const life of [3, 6, 12, 20, 30]) {
      const c = counterfactualAt(life)
      console.log(
        `${String(life).padStart(4)} ${c.now.toFixed(3).padStart(10)} ` +
          `${c.withoutSpeed.toFixed(3).padStart(15)} ${`${(c.removed * 100).toFixed(0)}%`.padStart(12)}`
      )
    }
    const c30 = counterfactualAt(30)
    expect(c30.removed).toBeGreaterThan(0.8)
    console.log(
      `\n第 30 世提速由 ${c30.now.toFixed(2)} 倍降到 ${c30.withoutSpeed.toFixed(2)} 倍,` +
        `削掉 ${(c30.removed * 100).toFixed(0)}% 的正反馈`
    )
  })

  it('剥离后提速在资质饱和点停住,不再随世代增长', () => {
    const stop = loopStopsAtLife()
    const s20 = steadySpeedupWithoutSpeedRole(20)
    const s30 = steadySpeedupWithoutSpeedRole(30)
    const s60 = steadySpeedupWithoutSpeedRole(60)
    // 资质地板封顶后,提速不再变化——第 20、30、60 世完全相同
    expect(s30).toBeCloseTo(s20, 6)
    expect(s60).toBeCloseTo(s30, 6)
    console.log(
      `\n剥离速度职责后:第 20/30/60 世提速均为 ${s30.toFixed(3)} 倍 ——` +
        `\n第 ${stop} 世资质地板封顶,此后**再轮回多少次都不会更快**。` +
        `\n轮回可以无限积累,但不再无限变快`
    )
  })

  it('核心指标:无界自动复利项由 1 归零', () => {
    expect(unboundedLoopCount(true)).toBe(1)
    expect(unboundedLoopCount(false)).toBe(0)
    console.log(
      '\n现状:无界自动复利项 = 1(道果)' +
        '\n剥离速度职责后 = 0(资质地板/称号/灵兽都会饱和)' +
        '\n这是比「浅轮回还剩几项资产」精确得多的健康指标'
    )
  })

  it('结论:该动的是职责,不是曲线', () => {
    // 若只改增长曲线(^0.9 → log → 周期折算),回路仍在,只是走得慢些;
    // 剥离速度职责则直接把回路断开,而道果可以继续无限增长
    const c = counterfactualAt(30)
    const speed = FRUIT_CONSUMERS.find(c2 => c2.id === 'cultSpeed')!
    expect(speed.loop).toBe('direct')
    expect(c.withoutSpeed).toBeLessThan(1.2)
    console.log(
      '\n改曲线:回路仍在,软帽只是让它晚一点爆' +
        '\n改职责:回路断开,道果可以继续无限增长而不再压缩游戏' +
        `\n\n剥离后长期提速稳定在 ${c.withoutSpeed.toFixed(2)} 倍,轮回农场照旧,` +
        '\n多出来的道果可以改投天界规则/命题/特殊选择等不进效率链的出口'
    )
  })
})
