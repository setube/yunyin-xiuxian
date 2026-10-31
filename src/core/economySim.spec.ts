/* eslint-disable no-console -- 体检报告输出,bun run test:report 依赖 */
import { describe, expect, it } from 'vitest'
import { auditEra, avgQualityRank, fullEconomyAudit, qiFillSeconds } from './economySim'
import { BT_QI_COST_RATIO } from '@/data/constants'
import { MAX_MAJOR, worldOf } from '@/data/realms'
import { maxTierForMajor } from '@/data/regions'
import { layerSeconds } from './pillValue'

/** 判据分两段:人间界(0~8)为模型校准段,守健康不变量;界外(9~20)出口在天道熔炉,守结构与道果代价。 */
describe('经济闭环审计(Phase 19 · Phase 40 补界外与修为)', () => {
  const eras = fullEconomyAudit()
  const mortal = eras.filter(e => worldOf(e.major).id === 'mortal')
  const outer = eras.filter(e => worldOf(e.major).id !== 'mortal')

  it('输出全时期流水表:0~20 境,含修为', () => {
    console.log('\n—— 资源生产/消耗审计(每小时,按时期摊销) ——')
    for (const era of eras) {
      const cells = era.flows
        .map(f => `${f.resource}:${f.verdict}(${f.ratio === Infinity ? '∞' : f.ratio.toFixed(1)})`)
        .join(' ')
      console.log(`  第${era.major}境(${worldOf(era.major).name}·t${era.tier}, ${era.eraHours.toFixed(1)}h): ${cells}`)
    }
    expect(eras.length).toBe(MAX_MAJOR + 1)
    expect(mortal.length, '人间界应有 0~8 共九境').toBe(9)
    expect(outer.length, '界外应有 9~20 共十二境').toBe(12)
    for (const era of eras) {
      expect(era.flows.length, `第${era.major}境缺流`).toBe(era.major >= 9 ? 8 : 7)
    }
    for (const era of mortal) expect(era.flows.some(f => f.resource === 'daoSource')).toBe(false)
    for (const era of outer) expect(era.flows.some(f => f.resource === 'daoSource')).toBe(true)
  })

  it('修为是一条流,且收支比不随境界漂移(Phase 39 修出的性质)', () => {
    const ratios = eras.map(era => {
      const exp = era.flows.find(f => f.resource === 'exp')
      expect(exp, `第${era.major}境没有修为流`).toBeDefined()
      return exp!.ratio
    })
    for (const [i, ratio] of ratios.entries()) {
      expect(ratio, `第${i}境修为收支比`).toBeGreaterThan(1)
      expect(ratio, `第${i}境修为收支比`).toBeLessThan(10)
    }
    // 比值漂移即有一侧按境界另算
    expect(Math.max(...ratios) - Math.min(...ratios), '修为收支比随境界漂移了').toBeLessThan(0.01)
  })

  it('区域层级取自区域表:界外十二境是 21~32,不再压死在 20', () => {
    for (const era of eras) {
      expect(era.tier, `第${era.major}境的层级`).toBe(maxTierForMajor(era.major))
    }
    expect(eras[0]!.tier).toBe(2)
    expect(eras.at(-1)!.tier, '混沌道祖的层级应是区域表上限').toBe(32)
  })

  it('界外十二境:每一格的读数都有定义(收入与消耗非负且有限)', () => {
    for (const era of outer) {
      for (const f of era.flows) {
        expect(Number.isFinite(f.incomePerHour), `第${era.major}境 ${f.resource} 收入`).toBe(true)
        expect(Number.isFinite(f.sinkPerHour), `第${era.major}境 ${f.resource} 消耗`).toBe(true)
        expect(f.incomePerHour, `第${era.major}境 ${f.resource} 收入`).toBeGreaterThanOrEqual(0)
        expect(f.sinkPerHour, `第${era.major}境 ${f.resource} 消耗`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('人间界无死资源:每种资源在每个时期都有非零消耗去向', () => {
    for (const era of mortal) {
      for (const f of era.flows) {
        expect(f.sinkPerHour, `第${era.major}境的 ${f.resource}`).toBeGreaterThan(0)
      }
    }
  })

  it('人间界灵石经济受控:既不窒息也不失去意义', () => {
    for (const era of mortal) {
      const stone = era.flows.find(f => f.resource === 'stone')!
      expect(stone.ratio, `第${era.major}境灵石收支比`).toBeGreaterThan(0.3)
      expect(stone.ratio, `第${era.major}境灵石收支比`).toBeLessThan(30)
    }
  })

  it('人间界炼丹材料买得起:灵草收入至少覆盖半数炼丹需求', () => {
    for (const era of mortal) {
      const herb = era.flows.find(f => f.resource === 'herb')!
      expect(herb.ratio, `第${era.major}境灵草`).toBeGreaterThan(0.5)
    }
  })

  it('人间界器灵尘自给:强化消耗可由分解收入覆盖', () => {
    for (const era of mortal) {
      const dust = era.flows.find(f => f.resource === 'dust')!
      expect(dust.ratio, `第${era.major}境器灵尘`).toBeGreaterThan(0.6)
    }
  })

  it('人间界玄铁/残页/悟道点有下限:允许早期瓶颈(流派摩擦),但不许砸成死资源', () => {
    // ore/page/wudao 早期偏低属设计摩擦,不设瓶颈级(0.7)门槛,只守不死资源下限;
    // ORE_DROP_CHANCE 腰斩会让 ore 从 ~0.27 跌到 ~0.13,本守卫即断
    for (const era of mortal) {
      const ore = era.flows.find(f => f.resource === 'ore')!
      expect(ore.ratio, `第${era.major}境玄铁`).toBeGreaterThan(0.15)
      const page = era.flows.find(f => f.resource === 'page')!
      expect(page.ratio, `第${era.major}境残页`).toBeGreaterThan(0.5)
      // 藏经阁筑基起建,m0 无悟道产出
      if (era.major >= 1) {
        const wudao = era.flows.find(f => f.resource === 'wudao')!
        expect(wudao.ratio, `第${era.major}境悟道点`).toBeGreaterThan(0.02)
      }
    }
  })

  it('人间界闲置预警:允许过剩,但「全时期闲置」的资源不允许超过 1 种', () => {
    const idle: string[] = []
    for (const era of mortal) {
      for (const f of era.flows) {
        if (f.verdict === '闲置') idle.push(`第${era.major}境:${f.resource}(×${f.ratio === Infinity ? '∞' : f.ratio.toFixed(0)})`)
      }
    }
    console.log(idle.length ? `\n  [人间界闲置预警] ${idle.join(' · ')}` : '\n  [人间界闲置预警] 无')
    const chronic = new Map<string, number>()
    for (const era of mortal) {
      for (const f of era.flows) {
        if (f.verdict === '闲置') chronic.set(f.resource, (chronic.get(f.resource) ?? 0) + 1)
      }
    }
    const chronicallyIdle = [...chronic.entries()].filter(([, n]) => n >= mortal.length).map(([r]) => r)
    expect(chronicallyIdle.length, `长期闲置资源: ${chronicallyIdle.join(',')}`).toBeLessThanOrEqual(1)
  })

  it('界外:每样材料都有非零出口(熔炉),不再出现 ∞ 与死资源', () => {
    for (const era of outer) {
      for (const f of era.flows) {
        expect(f.sinkPerHour, `第${era.major}境 ${f.resource} 没有出口`).toBeGreaterThan(0)
      }
      // 悟道点真出口未入模型,须自报口径
      const wudao = era.flows.find(f => f.resource === 'wudao')!
      expect(wudao.note, `第${era.major}境悟道流的出口没进模型,却不自报口径`).toContain('待补')
    }
  })

  /** 残余梯度来自器灵尘(分解尘随层级变多、熔炉尘价是绝对数),深处略便宜约 1.9 倍,不属价格冻死 */
  it('界外:凝一枚道果的材料代价不随层级漂移(旧病)', () => {
    const rows = outer.map(era => ({ major: era.major, hours: era.daoCostHours ?? 0 }))
    console.log('\n  [界外道果价] 凝一枚道果 ≈ 多少小时的材料产出:')
    for (const r of rows) console.log(`    第${r.major}境 ${r.hours.toFixed(2)}h`)
    const min = Math.min(...rows.map(r => r.hours))
    const max = Math.max(...rows.map(r => r.hours))
    expect(min, '凝一枚道果便宜到几分钟一枚 —— 终局数值出口会失去意义').toBeGreaterThan(0.1)
    expect(max, '凝一枚道果贵到一天以上 —— 终局会变成摆设').toBeLessThan(24)
    expect(max / min, `道果价随层级漂移了:${min.toFixed(2)}h → ${max.toFixed(2)}h`).toBeLessThan(2)
    // 量级锚:DAO_SOURCE_PER_FRUIT=200 时全境 ~1.8~3.4h,产品口径「2~3h 节奏」
    expect(min, '道果节奏不该比 1 小时还快').toBeGreaterThan(1)
    expect(max, '道果节奏不该超过 6 小时').toBeLessThan(6)
  })

  /** 界外一层以天计,30 分钟绝对线无意义,改守相对口径 */
  it('灵气结构健康:人间界回满 ≤30 分钟;界外回满 ≪ 本境一层耗时(永不成为瓶颈)', () => {
    expect(BT_QI_COST_RATIO).toBeLessThan(1)
    const rows: string[] = []
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      const fill = qiFillSeconds(m)
      expect(Number.isFinite(fill) && fill > 0, `第${m}境灵气回满读数`).toBe(true)
      if (m <= 8) expect(fill, `第${m}境灵气回满`).toBeLessThan(1800)
      else expect(fill / layerSeconds(m), `第${m}境回满占一层的比例`).toBeLessThan(0.01)
      rows.push(`第${m}境 ${fill.toFixed(0)}s`)
    }
    console.log(`\n  [灵气回满时长] ${rows.join(' · ')}`)
  })

  it('藏经阁没到建制境界不算产出:大境界 0(炼气)的悟道收入为 0(筑基才堪建)', () => {
    // 故障注入:把 auditEra 里 libLv 的 buildingLevel 去掉 unlock 门槛(改回 2+2×major),本用例红
    const w = auditEra(0).flows.find(f => f.resource === 'wudao')
    expect(w, '炼气期应有悟道流').toBeDefined()
    expect(w!.incomePerHour, '炼气期没有藏经阁,不应计入悟道产出').toBe(0)
  })

  it('强化耗尘按真实掉落品质估(非固定玄品):凡间低阶平均品阶 < 玄品 rank 3', () => {
    // 故障注入:把 auditEra 的强化 upgradeCost 品阶改回写死的 3,耗尘与分解收入重新分成两把尺;
    // 本用例只锁「真实取样品阶低于玄品」
    const r2 = avgQualityRank(2)
    expect(r2, '炼气层级(2)掉落平均品阶应低于玄品').toBeLessThan(3)
    expect(avgQualityRank(maxTierForMajor(MAX_MAJOR)), '终局层级平均品阶应不低于凡品').toBeGreaterThanOrEqual(1)
  })
})
