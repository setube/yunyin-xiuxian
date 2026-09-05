/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { REALMS } from '@/data/realms'
import { firstLifeMilestones, multiLifeTable, secondsForMajor } from './progressionSim'

const fmt = (h: number): string => (h < 1 ? `${(h * 60).toFixed(1)}分` : h < 48 ? `${h.toFixed(1)}时` : `${(h / 24).toFixed(1)}天`)

describe('数值曲线审计(Phase 14)', () => {
  it('第一世里程碑落在目标区间内', () => {
    const rows = firstLifeMilestones()
    // 输出审计表
    console.log('\n—— 第一世抵达各大境界(在线等效,真实约 ×1.5~3) ——')
    for (const r of rows) {
      console.log(`  ${REALMS[r.major]!.name.padEnd(4, ' ')} ${fmt(r.hours)}`)
    }
    const h = (m: number): number => rows.find(r => r.major === m)!.hours
    expect(h(1)).toBeGreaterThan(0.03) // 筑基不至于秒到
    expect(h(1)).toBeLessThan(1.5) // 首日内可筑基
    expect(h(2)).toBeLessThan(12) // 金丹一两日
    expect(h(3)).toBeLessThan(48) // 元婴首周内
    expect(h(9)).toBeGreaterThan(300) // 真仙不可速通(>12天)
    expect(h(9)).toBeLessThan(3500) // 也不至于遥遥无期(<146天)
  })

  it('每个大境界耗时增幅在 2~6 倍之间(平滑放置曲线)', () => {
    for (let m = 1; m <= 8; m += 1) {
      const ratio = secondsForMajor(m, 0) / secondsForMajor(m - 1, 0)
      expect(ratio).toBeGreaterThan(2)
      expect(ratio).toBeLessThan(6)
    }
  })

  it('多周目:转世加速但绝非无限加速器', () => {
    const table = multiLifeTable([1, 2, 3, 5, 10, 20])
    console.log('\n—— 多周目对照(每世修至元婴后转世) ——')
    console.log('  世数 | 道果 | 至筑基 | 至金丹 | 至元婴')
    for (const r of table) {
      console.log(
        `  第${String(r.life).padStart(2, ' ')}世 | ${String(r.daoFruit).padStart(4, ' ')} | ${fmt(r.toZhuji).padStart(7, ' ')} | ${fmt(r.toJindan).padStart(7, ' ')} | ${fmt(r.toYuanying).padStart(7, ' ')}`
      )
    }
    const l1 = table[0]!
    const l2 = table[1]!
    const l20 = table[5]!
    // 第二世应更快,但保留至少两成耗时
    expect(l2.toZhuji / l1.toZhuji).toBeGreaterThan(0.2)
    expect(l2.toZhuji / l1.toZhuji).toBeLessThan(0.9)
    // 第二十世依旧不能瞬间到元婴(软上限生效)
    expect(l20.toYuanying).toBeGreaterThan(0.15)
    // 单调递减
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i]!.toYuanying).toBeLessThan(table[i - 1]!.toYuanying)
    }
  })

  it('道果软上限:20 世加速倍率被控制在 10 倍以内', () => {
    const table = multiLifeTable([1, 20])
    const accel = table[0]!.toYuanying / table[1]!.toYuanying
    expect(accel).toBeGreaterThan(2) // 多周目要有获得感
    expect(accel).toBeLessThan(10) // 但不是无限加速器
  })

  it('百世压测:加速持续放缓,不存在隐性指数膨胀(Phase 19)', () => {
    const table = multiLifeTable([1, 20, 50, 100])
    const base = table[0]!.toYuanying
    console.log('\n—— 百世加速压测(至元婴耗时相对第一世) ——')
    for (const row of table) {
      console.log(
        `  第${String(row.life).padStart(3, ' ')}世 | 道果 ${String(row.daoFruit).padStart(4, ' ')} | ×${(base / row.toYuanying).toFixed(1)} 加速`
      )
    }
    const accel20 = base / table[1]!.toYuanying
    const accel50 = base / table[2]!.toYuanying
    const accel100 = base / table[3]!.toYuanying
    // 百世加速有上界(软上限有效)
    expect(accel100).toBeLessThan(25)
    expect(accel100).toBeGreaterThan(accel50)
    // 边际递减:50→100 世的增益小于 20→50 世
    expect(accel100 / accel50).toBeLessThan(accel50 / accel20)
    // 第 100 世到元婴依旧不能是瞬间(> 3 分钟)
    expect(table[3]!.toYuanying).toBeGreaterThan(0.05)
  })
})
