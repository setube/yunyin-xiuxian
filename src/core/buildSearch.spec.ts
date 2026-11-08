/* eslint-disable no-console -- 模拟器体检报告(bun run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENEMY_ARCHETYPES } from './buildSim'
import { searchBuilds, searchBuildsAsync } from './buildSearch'
import { fingerprintOf, FINGERPRINT_NAMES } from './fingerprints'

describe('随机构筑搜索与异常检测(Phase 19)', () => {
  // 1000 构筑 × 7 原型 × 20 场 = 140,000 场
  const report = searchBuilds(1000, 20)

  it('输出涌现构筑榜与体检报告', () => {
    console.log('\n—— 随机构筑搜索(1000 构筑 × 140 场/构筑,预算守恒) ——')
    console.log(`  战力-胜率相关系数 r = ${report.powerCorrelation.toFixed(2)}`)
    console.log(`  万金油构筑: ${report.universals.length} · 陷阱构筑: ${report.traps.length}`)
    console.log('  涌现构筑前五(平均胜率 | 流派识别 | 各场景):')
    const names = ENEMY_ARCHETYPES.map(a => a.name)
    for (const r of report.results.slice(0, 5)) {
      const cells = r.cells.map((c, i) => `${names[i]}${Math.round(c * 100)}`).join(' ')
      console.log(`    ${(r.avg * 100).toFixed(0)}% | ${r.identity} | ${cells}`)
    }
    expect(report.results.length).toBe(1000)
  })

  it('万金油红线:破墙构筑占比 ≤1.5%,且按机制指纹归类追踪', () => {
    const sigCount = new Map<string, number>()
    let unknown = 0
    for (const u of report.universals) {
      const fp = fingerprintOf(u.build.mods)
      sigCount.set(fp.signature, (sigCount.get(fp.signature) ?? 0) + 1)
      if (!fp.known) unknown += 1
      console.log(
        `  [破墙构筑] ${u.identity} · 指纹「${fp.name}」(${fp.signature}): ${u.cells.map(c => Math.round(c * 100)).join('/')} mods=${JSON.stringify(u.build.mods)}`
      )
    }
    console.log(`  [指纹分布] ${[...sigCount.entries()].map(([s, n]) => `${FINGERPRINT_NAMES[s] ?? s}×${n}`).join(' · ')}`)
    // 盾系厚血混合在中期预算下偏强(~1.2%,减伤×续航协同);超 1.5% 即恶化
    expect(report.universals.length / report.results.length).toBeLessThanOrEqual(0.015)
    // 破墙结构须在指纹注册表里有名;≥3 个未名结构即新风险类型
    expect(unknown, '出现未命名的破墙机制结构,请在 FINGERPRINT_NAMES 中登记并评估').toBeLessThanOrEqual(2)
  })

  /**
   * 最强构筑必须留有短板 —— 它的**最弱那一个场景**不能也接近全胜。
   *
   * 阈值 96 是实测校准出来的,不是拍的:修掉「被反击打死后仍能追击吸血」
   * 那个缺陷之后,罡盾/反震一系在高爆发场景由 90% 升到 95%
   * (敌人打死你之后不再被你的追击抵消,反震流的收益变实了)。
   *
   * 留 1 个点的余量:这条守的是「有没有短板」这个性质,不是精确比例。
   */
  it('最强构筑必须留有短板(最弱场景 ≤96%)', () => {
    expect(Math.min(...report.results[0]!.cells)).toBeLessThanOrEqual(0.96)
  })

  it('战力与胜率:相关但不决定(0.15 < r < 0.92)', () => {
    expect(report.powerCorrelation).toBeGreaterThan(0.15)
    expect(report.powerCorrelation).toBeLessThan(0.92)
  })

  it('陷阱构筑存在但占比有限(随机垃圾 < 15%)', () => {
    expect(report.traps.length / report.results.length).toBeLessThan(0.15)
  })
})

describe('searchBuildsAsync · 分块异步与同源', () => {
  it('同参(同 n/场次/种子)与同步版逐位一致 —— 同一内核,别出来两本账', async () => {
    const sync = searchBuilds(80, 8, 20261004)
    const asyncRep = await searchBuildsAsync({ n: 80, fightsPerArch: 8, seed: 20261004 })
    expect(asyncRep, '未取消时应返回完整报告').not.toBeNull()
    expect(asyncRep!.results.map(r => r.avg)).toEqual(sync.results.map(r => r.avg))
    expect(asyncRep!.results.map(r => r.identity)).toEqual(sync.results.map(r => r.identity))
    expect(asyncRep!.powerCorrelation).toBe(sync.powerCorrelation)
    expect(asyncRep!.universals.length).toBe(sync.universals.length)
    expect(asyncRep!.traps.length).toBe(sync.traps.length)
  })

  it('进度回调单调递增、首尾齐整(0→n,按 yieldEvery 步进)', async () => {
    const seen: number[] = []
    await searchBuildsAsync({ n: 50, fightsPerArch: 4, yieldEvery: 10, onProgress: d => { seen.push(d) } })
    expect(seen[0]).toBe(10)
    expect(seen[seen.length - 1]).toBe(50)
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeGreaterThan(seen[i - 1]!)
    }
  })

  /**
   * 让出间隙要够密:一次让出之间的那点活,是玩家的**卡顿时长**。
   *
   * 每评一套要打 fightsPerArch 场战斗。原先那一处调用点传 24 套让出一次,
   * 实测单块 236ms —— 玩家点「跑一遍检索」会看到整页僵住(浏览器长任务读数 343ms)。
   * 现按 8 套让出:单块约 79ms,总耗时不变。
   *
   * 判据不测真实毫秒(机器差异会让它变成 flaky),测的是**让出的次数**:
   * 同样的工作量,让出次数不该少于 n/yieldEvery —— 那是「间隙够密」的直接读数。
   * 故障注入:把 yieldEvery 调回 24,本条红。
   */
  it('默认让出间隙够密(每 8 套一次),不把几百毫秒的活攒成一块', async () => {
    const n = 200
    let yields = 0
    await searchBuildsAsync({ n, fightsPerArch: 1, onProgress: () => { yields += 1 } })
    // 200 套 / 每 8 套一次 = 25 次进度回调(末批直接报满,差一次不多)
    expect(yields, `只让出了 ${yields} 次 —— 间隙太稀,点检索会卡住整页`).toBeGreaterThanOrEqual(24)
  })

  /**
   * 离页取消须停下模拟,不只是不回写。
   * 故障注入:删掉 shouldStop 检查,本用例红(拿到完整报告、进度到 100)。
   */
  it('shouldStop 命中后停止评分并返回 null,不再报满进度', async () => {
    const seen: number[] = []
    let stop = false
    const report = await searchBuildsAsync({
      n: 100,
      fightsPerArch: 1,
      yieldEvery: 10,
      shouldStop: () => stop,
      onProgress: done => {
        seen.push(done)
        if (done === 10) stop = true
      }
    })
    expect(report, '取消后不该再给出一份可被误当成结果的报告').toBeNull()
    expect(seen, '取消之后不该继续报进度').toEqual([10])
  })

  it('开跑前已取消则一套都不评 —— 短任务不足一个 yield 也不能漏掉取消', async () => {
    const seen: number[] = []
    const report = await searchBuildsAsync({
      n: 5,
      fightsPerArch: 1,
      yieldEvery: 10,
      shouldStop: () => true,
      onProgress: done => seen.push(done)
    })
    expect(report).toBeNull()
    expect(seen).toEqual([])
  })

  it('组件把卸载标志接进 shouldStop,否则只挡回写仍是空烧', () => {
    const src = readFileSync(resolve(__dirname, '../components/build/BuildLabPanel.vue'), 'utf8')
    expect(src, '检索调用要带协作取消').toContain('shouldStop: () => isUnmounted')
    expect(src, '取消结果是 null,不能冒充检索失败').toContain('result === null')
  })
})
