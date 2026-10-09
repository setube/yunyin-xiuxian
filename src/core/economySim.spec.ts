/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
import { describe, expect, it } from 'vitest'
import { fullEconomyAudit, qiFillSeconds } from './economySim'
import { BT_QI_COST_RATIO } from '@/data/constants'
import { MAX_MAJOR, worldOf } from '@/data/realms'
import { maxTierForMajor } from '@/data/regions'
import { layerSeconds } from './pillValue'

/**
 * 审计的判据分两段,理由写在 economySim 的文件头:
 *
 * - **人间界(0~8)**:模型在此校准(建筑还在长、掉落按人间界层级),健康不变量按原样守 ——
 *   灵石不窒息也不失意义、灵草买得起丹、器灵尘自给、无死资源。
 * - **界外十二境(9~20)**:出口是**天道熔炉**(材料/灵石 → 道源 → 道果),现已入模型(ISS-210 结清)。
 *   这一段守「结构」:每样材料都有非零出口、道源流存在且只在界外、层级跟随区域表、修为比值不漂移;
 *   并把「材料换道源的速率远超终局节奏」这条**已知失衡**当成断言钉住(ISS-214)——
 *   它是一处真实的定价问题,不是读数噪声,故不假装健康、也不藏起来。
 */
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
    // 道源流只在界外出现 —— 人间界还没有熔炉可开
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
      // 收入 = 挂机(底)+ 历练(两条线都随修速缩放),消耗 = 通关本境的修为需求。
      // 两侧同尺,故「历练在任何境界都是同一个倍率」——
      // 反过来说:这个数一旦随境界漂移,就是有一侧又按境界另算了一遍(ISS-208 的旧病)。
      expect(ratio, `第${i}境修为收支比`).toBeGreaterThan(1)
      expect(ratio, `第${i}境修为收支比`).toBeLessThan(10)
    }
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
      // 悟道点是唯一例外 —— 它的真出口(功法进修 / 法宝炼化)没进模型,故必须自报口径
      const wudao = era.flows.find(f => f.resource === 'wudao')!
      expect(wudao.note, `第${era.major}境悟道流的出口没进模型,却不自报口径`).toContain('待补')
    }
  })

  /**
   * 终局的进度杠杆:**凝一枚道果要多少小时的材料产出**。
   *
   * ISS-214 的旧病是"价格冻死":灵石收入按 1.9^层级 涨,而熔炉的灵石价写死在真仙那一层
   * (tier 20),于是到混沌海(tier 32)道果相对收入便宜了 1.9^12 ≈ 293 倍 ——
   * 一战的灵石就够换一枚以上道果。定价改随层级之后,这个代价落在 **1 小时上下**,
   * 而且整条长尾上只差一个量级以内。
   *
   * 守两条:① 绝对量级(几分钟一枚太贱、一天一枚太贵);② 量级不漂移。
   * 允许的残余梯度来自器灵尘 —— 高品质装备分解出的尘随层级变多,而熔炉的尘价是绝对数,
   * 故深处略便宜(1.68h → 0.90h,约 1.9 倍);那是品质窗口的副作用,不是价格冻死。
   * 「每境凝几枚道果」是玩法节奏,不是审计能替玩家定的。
   */
  it('界外:凝一枚道果的材料代价不随层级漂移(ISS-214 的旧病)', () => {
    const rows = outer.map(era => ({ major: era.major, hours: era.daoCostHours ?? 0 }))
    console.log('\n  [界外道果价] 凝一枚道果 ≈ 多少小时的材料产出:')
    for (const r of rows) console.log(`    第${r.major}境 ${r.hours.toFixed(2)}h`)
    const min = Math.min(...rows.map(r => r.hours))
    const max = Math.max(...rows.map(r => r.hours))
    expect(min, '凝一枚道果便宜到几分钟一枚 —— 终局数值出口会失去意义').toBeGreaterThan(0.1)
    expect(max, '凝一枚道果贵到一天以上 —— 终局会变成摆设').toBeLessThan(24)
    expect(max / min, `道果价随层级漂移了:${min.toFixed(2)}h → ${max.toFixed(2)}h`).toBeLessThan(2)
    // 量级锚:DAO_SOURCE_PER_FRUIT=200 后,全境落 ~1.8~3.4h。钉住「2~3h 节奏」这一产品口径,
    // 别让它被哪一次的调参悄悄拉回 ~1h(太快)或翻到 6h+(太慢)。
    expect(min, '道果节奏不该比 1 小时还快').toBeGreaterThan(1)
    expect(max, '道果节奏不该超过 6 小时').toBeLessThan(6)
  })

  /**
   * 灵气是突破的门槛资源(一次耗上限的四成),所以它的体检问题只有一个:
   **它会不会成为卡关的那一环**。判据按界域分段,因为"多久算久"在这里本就不同:
   · 人间界(0~8):突破节奏以分钟计,回满要是拖到半小时以上,玩家就真的在等灵气 ——
     故沿用 30 分钟这条绝对线(Phase 19 定的口径)。
   · 界外(9~20):一层修为以**天**计(真仙一层 124 天),而回满只有小时级,
     灵气不可能成为瓶颈 —— 故这一段守的是**相对**口径:回满 ≤ 本境一层耗时的 1%。
     绝对线在这一段没有意义(第 16 境回满 78 分钟,而那一层要修 700 年)。
   (ISS-212 原本报的是"30 分钟这条线只覆盖 0~9 境"这个覆盖缺口,现按上口径补全。)
   */
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
})
