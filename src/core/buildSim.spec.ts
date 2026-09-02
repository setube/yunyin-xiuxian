/* eslint-disable no-console -- 模拟器体检报告的正式输出(npm run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { BUILD_PROFILES, ENEMY_ARCHETYPES, fullMatrix, tribulationSurvives, tribulationSolvableKinds, type MatrixRow } from './buildSim'

const N = 80

function cell(rows: MatrixRow[], buildId: string, archId: string): number {
  return rows.find(r => r.build.id === buildId)!.cells[archId]!.winRate
}

describe('流派对战审计(Phase 16)', () => {
  const rows = fullMatrix(N)

  it('输出克制矩阵', () => {
    const header = ['流派  ', ...ENEMY_ARCHETYPES.map(a => a.name.padStart(4, ' ')), '  均值'].join(' | ')
    console.log('\n—— 流派 × 敌人原型 胜率矩阵(各 ' + N + ' 场) ——')
    console.log('  ' + header)
    for (const row of rows) {
      const cells = ENEMY_ARCHETYPES.map(a => `${Math.round(row.cells[a.id]!.winRate * 100)}%`.padStart(4, ' '))
      console.log(`  ${row.build.name} | ${cells.join(' | ')} | ${Math.round(row.avgWinRate * 100)}%`)
    }
    console.log('\n—— 天劫天时窗口(可渡劫型数 / 共 5 种;筑基劫 · 金丹劫) ——')
    for (const b of BUILD_PROFILES) {
      const w1 = tribulationSolvableKinds(b, 1).length
      const w2 = tribulationSolvableKinds(b, 2).length
      const mark = (n: number): string => (n === 5 ? '稳渡' : n > 0 ? '择时' : '无解')
      console.log(`  ${b.name}: ${w1}/5 ${mark(w1)} · ${w2}/5 ${mark(w2)}`)
    }
    expect(rows.length).toBe(6)
  })

  it('无废柴也无霸主:各流派综合胜率在健康区间', () => {
    for (const row of rows) {
      expect(row.avgWinRate, row.build.name).toBeGreaterThan(0.45)
      expect(row.avgWinRate, row.build.name).toBeLessThan(0.88)
    }
    const avgs = rows.map(r => r.avgWinRate)
    expect(Math.max(...avgs) - Math.min(...avgs)).toBeLessThan(0.3)
  })

  it('每个流派都有明确的优势与劣势场景(极差 ≥ 15%)', () => {
    for (const row of rows) {
      const rates = ENEMY_ARCHETYPES.map(a => row.cells[a.id]!.winRate)
      expect(Math.max(...rates) - Math.min(...rates), row.build.name).toBeGreaterThanOrEqual(0.15)
    }
  })

  it('克制关系成立:破盾斩杀墙前,高防之盾仍优于纯奶', () => {
    // 高爆发墙携带真伤后,护盾被无视——罡盾靠高防仍优于沐泽的纯回复
    expect(cell(rows, 'gangdun', 'burst')).toBeGreaterThan(cell(rows, 'muze', 'burst') + 0.05)
  })

  it('克制关系成立:反震吃多段,惧疾影', () => {
    expect(cell(rows, 'fanzhen', 'multi')).toBeGreaterThan(0.6)
    expect(cell(rows, 'fanzhen', 'multi')).toBeGreaterThan(cell(rows, 'fanzhen', 'dodge') + 0.12)
  })

  it('克制关系成立:连击遇疾影明显失灵', () => {
    expect(cell(rows, 'lianji', 'normal')).toBeGreaterThan(cell(rows, 'lianji', 'dodge') + 0.12)
  })

  it('克制关系成立:沐泽擅长首领久战,怕高爆发', () => {
    expect(cell(rows, 'muze', 'boss')).toBeGreaterThan(cell(rows, 'muze', 'burst') + 0.08)
  })

  it('克制关系成立:锋芒收割脆皮快于慢速反击流,攻坚仍乏力', () => {
    expect(cell(rows, 'fengmang', 'burst')).toBeGreaterThan(cell(rows, 'fanzhen', 'burst') + 0.08)
    expect(cell(rows, 'fengmang', 'boss')).toBeLessThan(0.4)
  })

  it('克制关系成立:背水的濒死缠斗最擅攻坚(优于其余攻击流)', () => {
    expect(cell(rows, 'beishui', 'boss')).toBeGreaterThan(cell(rows, 'lianji', 'boss') + 0.1)
    expect(cell(rows, 'beishui', 'boss')).toBeGreaterThan(cell(rows, 'fengmang', 'boss') + 0.1)
  })

  it('真伤是护盾体系的天敌', () => {
    // 罡盾对真伤的表现应显著差于其自身最擅长的场景
    const gangdun = rows.find(r => r.build.id === 'gangdun')!
    const best = Math.max(...ENEMY_ARCHETYPES.map(a => gangdun.cells[a.id]!.winRate))
    expect(best - cell(rows, 'gangdun', 'pierce')).toBeGreaterThan(0.12)
  })

  it('天劫存活分化:护持路数天时窗口更宽,纯攻流须择时而渡', () => {
    // Phase 32.1:天劫已类型化,分化不再是"能不能渡",而是"能渡哪几种劫"。
    // 纯攻流不是被堵死,而是要挑劫型——"今天渡不渡"由此成为真实决策。
    const kinds = (id: string, m: number): string[] => tribulationSolvableKinds(BUILD_PROFILES.find(b => b.id === id)!, m)

    // 首劫:任何流派都得有至少一个窗口,否则天劫成了硬墙
    for (const b of BUILD_PROFILES) {
      const ks = tribulationSolvableKinds(b, 1)
      console.log(`  ${b.name}:首劫可渡 ${ks.length}/5 [${ks.join('、')}]`)
      expect(ks.length, `${b.name}:首劫无劫可渡,天劫成了硬墙而非决策`).toBeGreaterThan(0)
    }
    // 护持路数的窗口应宽于纯攻流
    expect(kinds('gangdun', 1).length).toBeGreaterThan(kinds('fengmang', 1).length)

    // 金丹劫开始收窄:罡盾仍有多个窗口,纯攻流则须借丹药外力
    expect(kinds('gangdun', 2).length).toBeGreaterThanOrEqual(3)
    expect(kinds('lianji', 2).length).toBe(0)
    expect(kinds('fengmang', 2).length).toBe(0)
    // 严格口径(不挑天时也稳过)只有护持路数在首劫做得到
    expect(tribulationSurvives(BUILD_PROFILES.find(b => b.id === 'gangdun')!, 1)).toBe(true)
    expect(tribulationSurvives(BUILD_PROFILES.find(b => b.id === 'fengmang')!, 1)).toBe(false)
  })
})
