/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { fullEconomyAudit, qiFillSeconds } from './economySim'
import { BT_QI_COST_RATIO } from '@/data/constants'

describe('经济闭环审计(Phase 19)', () => {
  const eras = fullEconomyAudit()

  it('输出全时期资源流水表', () => {
    console.log('\n—— 资源生产/消耗审计(每小时,按时期摊销) ——')
    for (const era of eras) {
      const cells = era.flows.map(f => `${f.resource}:${f.verdict}(${f.ratio === Infinity ? '∞' : f.ratio.toFixed(1)})`).join(' ')
      console.log(`  第${era.major}境(t${String(era.tier).padStart(2, ' ')}, ${era.eraHours.toFixed(1)}h): ${cells}`)
    }
    expect(eras.length).toBe(9)
  })

  it('无死资源:每种资源在每个时期都有非零消耗去向', () => {
    for (const era of eras) {
      for (const f of era.flows) {
        expect(f.sinkPerHour, `第${era.major}境的 ${f.resource}`).toBeGreaterThan(0)
      }
    }
  })

  it('灵石经济全程受控:既不窒息也不失去意义', () => {
    for (const era of eras) {
      const stone = era.flows.find(f => f.resource === 'stone')!
      expect(stone.ratio, `第${era.major}境灵石收支比`).toBeGreaterThan(0.3)
      expect(stone.ratio, `第${era.major}境灵石收支比`).toBeLessThan(30)
    }
  })

  it('炼丹材料买得起:灵草收入至少覆盖半数炼丹需求', () => {
    for (const era of eras) {
      const herb = era.flows.find(f => f.resource === 'herb')!
      expect(herb.ratio, `第${era.major}境灵草`).toBeGreaterThan(0.5)
    }
  })

  it('器灵尘自给:强化消耗可由分解收入覆盖', () => {
    for (const era of eras) {
      const dust = era.flows.find(f => f.resource === 'dust')!
      expect(dust.ratio, `第${era.major}境器灵尘`).toBeGreaterThan(0.6)
    }
  })

  it('灵气结构健康:回满不超过 30 分钟,突破消耗恒可负担', () => {
    for (let m = 0; m <= 9; m += 1) {
      expect(qiFillSeconds(m), `第${m}境灵气回满`).toBeLessThan(1800)
    }
    expect(BT_QI_COST_RATIO).toBeLessThan(1)
  })

  it('闲置预警:统计完全失去意义的资源(比值>10)并输出', () => {
    const idle: string[] = []
    for (const era of eras) {
      for (const f of era.flows) {
        if (f.verdict === '闲置') idle.push(`第${era.major}境:${f.resource}(×${f.ratio === Infinity ? '∞' : f.ratio.toFixed(0)})`)
      }
    }
    console.log(idle.length ? `\n  [闲置预警] ${idle.join(' · ')}` : '\n  [闲置预警] 无')
    // 允许存在过剩,但「全时期闲置」的资源不允许超过 1 种
    const chronic = new Map<string, number>()
    for (const era of eras) {
      for (const f of era.flows) {
        if (f.verdict === '闲置') chronic.set(f.resource, (chronic.get(f.resource) ?? 0) + 1)
      }
    }
    const chronicallyIdle = [...chronic.entries()].filter(([, n]) => n >= eras.length).map(([r]) => r)
    expect(chronicallyIdle.length, `长期闲置资源: ${chronicallyIdle.join(',')}`).toBeLessThanOrEqual(1)
  })
})
