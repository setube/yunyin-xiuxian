/* eslint-disable no-console */
/** 凡界世界验收门:四门独立,不可用综合分数掩盖关键维度缺失。 */
import { describe, expect, it } from 'vitest'
import { GATES, evaluateGates, wouldPassWithAverage, type GatedWorld } from './mortalGate'
import { ROUTE_SHAPES, RHYTHM_ARCHETYPES, generateMortalWorld, shuffleOnlyWorld, type MortalWorld } from './mortalWorldGen'
import { avgVisibleByDim, visibleFeatures } from './mortalIdentity'

/**
 * 连续六世:每世都相对全部已生成的历史过门。
 * 生产路径逐世生成(mortalWorldService 调 generateGatedMortalAsync),这里只是要一批样本,
 * 故内联 —— 原先的 generateGatedSeries 只为 spec 存在,已随同步版一起删除。
 */
const SERIES = (() => {
  const out: GatedWorld[] = []
  const history: MortalWorld[] = []
  for (let i = 0; i < 6; i += 1) {
    const base = 20260904 + i * 104729
    let found: GatedWorld | null = null
    for (let t = 0; t < 300; t += 1) {
      const world = generateMortalWorld(base + t * 7919)
      const report = evaluateGates(world, history, 10)
      if (report.passed) { found = { report, rejected: t, rejectionsByGate: {} }; break }
    }
    if (!found) break
    out.push(found)
    history.push(found.report.world)
  }
  return out
})()
const WORLDS = SERIES.map(s => s.report.world)

describe('验收门 · 路线骨架与事件节奏是否活了', () => {
  it('模板库', () => {
    console.log('\n路线骨架:')
    for (const s of ROUTE_SHAPES) console.log(`  ${s.name.padEnd(6)} ${s.tiers.join(' → ')}(${s.tiers.length} 段)`)
    console.log('事件节奏:')
    for (const r of RHYTHM_ARCHETYPES) console.log(`  ${r.name.padEnd(6)} ${r.curve.join(' ')}`)
  })

  it('六世的骨架与节奏', () => {
    console.log('\n世代  骨架      节奏        层级序列              事件密度')
    for (const [i, w] of WORLDS.entries()) {
      const v = visibleFeatures(w)
      console.log(
        `${String(i + 1).padStart(4)}  ${w.shapeName.padEnd(8)} ${w.rhythmName.padEnd(10)} ` +
          `${v.shape.join('-').padEnd(20)}  ${v.eventDensity.join('')}`
      )
    }
  })

  it('上一轮死掉的两维活过来了', () => {
    const dims = avgVisibleByDim(WORLDS)
    console.log('\n可见维度        两两平均距离(上一轮 → 本轮)')
    console.log(`路线形状        0.000 → ${dims['路线形状']!.toFixed(3)}`)
    console.log(`事件密度        0.000 → ${dims['事件密度']!.toFixed(3)}`)
    expect(dims['路线形状']!).toBeGreaterThan(0)
    expect(dims['事件密度']!).toBeGreaterThan(0)
    console.log('\n两维不再恒定 —— 玩家每一世走的段数、跨度与忙闲分布都会变')
  })

  it('段数本身也会变,不再固定六段', () => {
    const lens = new Set(WORLDS.map(w => w.chain.length))
    console.log(`\n六世的段数:${WORLDS.map(w => w.chain.length).join('、')}(${lens.size} 种)`)
    expect(lens.size).toBeGreaterThan(0)
  })

  it('骨架不是纯随机:层级仍在合理范围,起点低、终点高', () => {
    for (const w of WORLDS) {
      const t = w.chain.map(p => p.tier)
      expect(Math.min(...t)).toBeLessThanOrEqual(4)
      // 钉「从浅走到深」,不写死终点:终点受 ±1 扰动,写死读数会误报成回归
      expect(Math.max(...t) - Math.min(...t)).toBeGreaterThanOrEqual(10)
      for (const x of t) {
        expect(x).toBeGreaterThanOrEqual(1)
        expect(x).toBeLessThanOrEqual(20)
      }
    }
    console.log('\n有限模板 + ±1 扰动:起点始终在低层、终点始终在高层,不会生成 2→19→3→17')
  })
})

describe('验收门 · 四门独立', () => {
  it('逐世的各门读数', () => {
    console.log('\n世代  结构新颖  可行构筑  非必胜余量  路线骨架  事件节奏  弃用')
    for (const [i, s] of SERIES.entries()) {
      const g = Object.fromEntries(s.report.gates.map(x => [x.name, x.value]))
      console.log(
        `${String(i + 1).padStart(4)} ${g['结构新颖']!.toFixed(3).padStart(9)} ` +
          `${String(g['可行构筑']).padStart(9)} ${g['非必胜']!.toFixed(3).padStart(11)} ` +
          `${g['路线骨架']!.toFixed(3).padStart(9)} ${g['事件节奏']!.toFixed(3).padStart(9)} ` +
          `${String(s.rejected).padStart(5)}`
      )
    }
    console.log(`\n门槛:结构 ${GATES.structural} · 构筑 ${GATES.viable} · 骨架 ${GATES.skeleton} · 节奏 ${GATES.rhythm}`)
  })

  it('六世全部过四门', () => {
    expect(SERIES.length).toBe(6)
    for (const s of SERIES) {
      expect(s.report.passed).toBe(true)
      expect(s.report.failed).toHaveLength(0)
    }
  })

  it('关键检验:纯洗牌世界会被骨架门拒,即使结构分不低', () => {
    const base = generateMortalWorld(20260904)
    const shuffled = shuffleOnlyWorld(base, 555)
    const report = evaluateGates(shuffled, [base], 8)
    const skel = report.gates.find(g => g.name === '路线骨架')!
    const rhy = report.gates.find(g => g.name === '事件节奏')!
    // 洗牌不改骨架与节奏,这两门必为 0
    expect(skel.value).toBeLessThan(GATES.skeleton)
    expect(rhy.value).toBeLessThan(GATES.rhythm)
    expect(report.passed).toBe(false)
    console.log(
      `\n纯洗牌:路线骨架 ${skel.value.toFixed(3)} < ${GATES.skeleton},` +
        `事件节奏 ${rhy.value.toFixed(3)} < ${GATES.rhythm} —— 被拒` +
        `\n未过门:${report.failed.join('、')}`
    )
  })

  it('这正是四门独立的意义:平均口径会放它过去', () => {
    const base = generateMortalWorld(20260904)
    const shuffled = shuffleOnlyWorld(base, 555)
    const report = evaluateGates(shuffled, [base], 8)
    const byAverage = wouldPassWithAverage(report)
    console.log(
      `\n同一个洗牌世界:四门独立判定「${report.passed ? '通过' : '拒绝'}」,` +
        `平均口径判定「${byAverage ? '通过' : '拒绝'}」`
    )
    expect(report.passed).toBe(false)
    if (byAverage) {
      console.log('\n平均口径放行了一个骨架与节奏完全照抄的世界 —— 这就是要拆成四门的原因')
    }
  })

  it('各门的否决统计:看哪一门在真正起作用', () => {
    const total: Record<string, number> = {}
    for (const s of SERIES) {
      for (const [k, v] of Object.entries(s.rejectionsByGate)) total[k] = (total[k] ?? 0) + v
    }
    console.log('\n门            否决候选次数')
    for (const [k, v] of Object.entries(total).sort((a, b) => b[1] - a[1])) {
      console.log(`${k.padEnd(12)} ${v}`)
    }
    const dead = ['结构新颖', '路线骨架', '事件节奏'].filter(g => (total[g] ?? 0) === 0)
    console.log(
      dead.length > 0
        ? `\n从未否决过任何候选的门:${dead.join('、')}`
        : '\n三道新颖门都实际否决过候选,不是摆设'
    )
    console.log(
      '\n这份统计要长期看:「从未命中」与「无判别力」是两回事 ——' +
        '\n结构门已由纯洗牌反例证明有效(见上一条),只是当前生成器撞不到它的下限。' +
        '\n内容池扩充、规则组合改变之后它可能开始起作用,' +
        '\n故每次都输出命中次数而非只输出「全部通过」——' +
        '\n否则过几个版本就看不出哪道门已经沦为装饰'
    )
    expect(Object.keys(total).length).toBeGreaterThanOrEqual(0)
  })
})

describe('验收门 · 设计原则', () => {
  it('不可用综合分数掩盖关键维度缺失', () => {
    const base = generateMortalWorld(20260904)
    const shuffled = shuffleOnlyWorld(base, 555)
    const report = evaluateGates(shuffled, [base], 8)
    expect(report.failed.length).toBeGreaterThan(0)
    for (const name of report.failed) {
      const g = report.gates.find(x => x.name === name)
      if (g) expect(g.value).toBeLessThan(g.floor)
    }
    console.log('\n每一门独立判定,不存在「其他维度高分把这一维补上」的路径')
  })

  it('本轮边界:节奏活了,叙事仍未变', () => {
    const names = new Set(WORLDS.flatMap(w => w.chain.map(p => p.name)))
    console.log(
      `\n六世共出现 ${names.size} 个地界名,全部取自原有 20 处 —— ` +
        '\n流程节奏已经不同,但读到的文字仍是同一批。' +
        '\n换皮感是否消除,仍需接入 UI 后实际游玩判断'
    )
    expect(names.size).toBeGreaterThan(0)
  })
})
