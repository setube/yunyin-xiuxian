/* eslint-disable no-console */
/**
 * 收窄方案影响面审计
 *
 * 收窄决议已定,但动参数之前必须先确认这三样东西现在连着什么。
 * 上一轮审计证明模型稳定,这一轮要保证结构性修改不会把另一套系统打穿。
 *
 * 所有断言跑在两份真实存档的探针上,不跑假设的玩家行为。
 */
import { describe, expect, it } from 'vitest'
import {
  INSIGHT_CHANNELS,
  INSIGHT_CONSUMERS,
  LEGACY_ASSETS,
  PROBES,
  SAMSARA_STAGES,
  VEIN_MAIN_CAPACITY,
  VEIN_SIDE_CAP,
  aptitudeBinding,
  mainVeinEverUsed,
  migrationGap,
  openingConsumers,
  stageAt,
  stageDropIfStockRemoved,
  standingConsumers,
  stockShare,
  totalOf,
  veinPeakOf,
  veinTotalOf,
  verdictOf
} from './impactSurface'
import { legacyInsightOf } from '@/data/samsara'

describe('影响面 · 宿慧的来源有两条', () => {
  it('来源清单', () => {
    console.log('\n宿慧的两本账:')
    for (const c of INSIGHT_CHANNELS) {
      console.log(
        `  ${c.name.padEnd(8)} [${c.source === 'stock' ? '存量' : '现量'}] ` +
          `金丹一世 ${c.perGoldLife === null ? '不定' : `+${c.perGoldLife}`} · ` +
          `${c.persisted ? '落盘' : '实时算'} · ${c.realmGated ? '高阶受境界挡' : '无境界门槛'}`
      )
      console.log(`      ${c.evidence}`)
    }
  })

  it('「把宿慧移出浅轮回」对两条通道是两件事', () => {
    const stock = INSIGHT_CHANNELS.filter(c => c.source === 'stock')
    const live = INSIGHT_CHANNELS.filter(c => c.source === 'live')
    expect(stock.length).toBeGreaterThan(0)
    expect(live.length).toBeGreaterThan(0)
    // 只有现量天然带境界门槛 —— 这一条本就偏向深修,不需要改
    for (const c of live) expect(c.realmGated).toBe(true)
    for (const c of stock) expect(c.realmGated).toBe(false)
    console.log(
      `\n存量 ${stock.map(c => c.name).join('、')} 无境界门槛,是浅轮回真正吃到的那一条;` +
        `\n现量 ${live.map(c => c.name).join('、')} 高阶受 minRealm 硬挡,本就偏向深修`
    )
  })
})

describe('影响面 · 真实存档实测', () => {
  it('两份存档的宿慧构成', () => {
    console.log('\n存档            轮回  存量   现量   合计   存量占比  阶位')
    for (const p of PROBES) {
      console.log(
        `${p.name.padEnd(12)} ${String(p.rebirths).padStart(4)} ` +
          `${String(p.stockAfterLoad).padStart(5)} ${String(p.live).padStart(6)} ` +
          `${String(totalOf(p)).padStart(6)}   ${(stockShare(p) * 100).toFixed(0).padStart(5)}%  ` +
          `${stageAt(totalOf(p)).name}`
      )
    }
  })

  it('实测:靠本体系攒出的存量是零 —— 存量通道在真实玩家身上从未跑起来', () => {
    // 小黄鸭 17 世的 238 全部来自旧存档折算(字段缺失走 legacyInsightOf);
    // 白望舒 4 世字段为 0,一分未记。两人都没有一点存量是本体系发放的
    const duck = PROBES.find(p => p.name === '小黄鸭')!
    const bai = PROBES.find(p => p.name === '白望舒')!
    expect(duck.stockAfterLoad).toBe(legacyInsightOf(duck.rebirths))
    expect(bai.stockAfterLoad).toBe(0)
    console.log(
      `\n小黄鸭的 ${duck.stockAfterLoad} 点存量 100% 来自旧存档折算(count×14),` +
        `\n白望舒转世 ${bai.rebirths} 世但存量为 0 —— 「每世 +6」这条通道尚无实测产出`
    )
  })

  it('撑起宿慧的是现量:白望舒的 125 点百分之百来自认知', () => {
    const bai = PROBES.find(p => p.name === '白望舒')!
    expect(stockShare(bai)).toBe(0)
    expect(bai.live).toBeGreaterThan(100)
    console.log(
      `\n白望舒 total=${totalOf(bai)} 全部是认知折算 —— ` +
        `宿慧的实际大头在一条**本就受境界硬挡**的通道上`
    )
  })

  it('发现迁移欠账:字段存在但为 0 的老存档拿不到历世折算', () => {
    // sanitize 判据 `Number.isFinite(r?.insight) ? max(0,r.insight) : legacyInsightOf(count)`
    // 把「字段已建、值为 0」当成合法新值,于是不补折算
    const gaps = PROBES.map(p => ({ name: p.name, gap: migrationGap(p) }))
    const owed = gaps.filter(g => g.gap > 0)
    expect(owed.length).toBeGreaterThan(0)
    for (const g of gaps) {
      console.log(`  ${g.name.padEnd(12)} 迁移欠账 ${g.gap}`)
    }
    console.log(
      `\n白望舒本应折 ${legacyInsightOf(4)} 点却记 0。任何「insight 字段已建、` +
        `\n但转世发生在该体系之前」的存档都会丢掉全部历世阅历 ——` +
        `\n收窄宿慧来源之前必须先修这条判据,否则老玩家两头落空`
    )
  })
})

describe('影响面 · 宿慧的消费者链', () => {
  it('消费者按性质分两类', () => {
    console.log('\n宿慧的消费者:')
    for (const c of INSIGHT_CONSUMERS) {
      console.log(
        `  ${c.name.padEnd(16)} [${c.kind === 'standing' ? '持续能力' : '开局状态'}] ` +
          `经 ${c.via}(第 ${c.fromStage} 阶起)`
      )
      console.log(`      ${c.evidence}`)
    }
  })

  it('只有「持续能力」配叫永久继承资产,开局状态可被本世行为追平', () => {
    const standing = standingConsumers().map(c => c.name)
    const opening = openingConsumers().map(c => c.name)
    expect(standing.length).toBeGreaterThan(opening.length)
    expect(opening).toContain('睁眼即认得灵材')
    expect(opening).toContain('留一门功法不折半')
    console.log(
      `\n持续能力(追不平):${standing.join('、')}` +
        `\n开局状态(可追平):${opening.join('、')} —— carryLore 是**补足**不是保留,` +
        `\n认知本就不因转世清零,本世采药照样能认全`
    )
  })

  it('两项开局状态里有一项要顶阶才有,实际影响面比看上去窄', () => {
    const top = SAMSARA_STAGES.length - 1
    const keep = INSIGHT_CONSUMERS.find(c => c.id === 'keepGongfa')!
    expect(keep.fromStage).toBe(top)
    // 两份真实存档都停在第 1 阶,离顶阶还有三阶
    for (const p of PROBES) expect(stageAt(totalOf(p)).index).toBeLessThan(top)
    console.log(
      `\n「留一门功法」要第 ${top} 阶「${SAMSARA_STAGES[top]!.name}」才开,` +
        `\n两份真实存档都还停在第 ${stageAt(totalOf(PROBES[0]!)).index} 阶 —— 这条消费者尚未被任何人吃到`
    )
  })

  it('资质地板走双口径取 max,移出宿慧对它零影响', () => {
    // aptitudeFloorNow = max(次数×5, 宿慧/12)。两份存档都由次数口径决定
    for (const p of PROBES) expect(aptitudeBinding(p)).toBe('count')
    console.log(
      `\n两份存档的资质地板都由**次数口径**决定(${PROBES.map(p => p.name).join('、')}),` +
        `\n宿慧口径从未接管过 —— 这意味着资质地板其实是一条独立的、` +
        `\n纯次数驱动的浅轮回收益,收窄宿慧碰不到它`
    )
  })
})

describe('影响面 · 移出存量的后果落在谁身上', () => {
  it('唯一掉阶的是存量全部来自旧存档折算的那个玩家', () => {
    const rows = PROBES.map(p => ({ name: p.name, drop: stageDropIfStockRemoved(p) }))
    for (const r of rows) console.log(`  ${r.name.padEnd(12)} 掉 ${r.drop} 阶`)
    const duck = rows.find(r => r.name === '小黄鸭')!
    const bai = rows.find(r => r.name === '白望舒')!
    expect(duck.drop).toBeGreaterThan(0)
    expect(bai.drop).toBe(0)
    console.log(
      `\n小黄鸭掉 ${duck.drop} 阶,而他那 ${PROBES[0]!.stockAfterLoad} 点全部是旧存档折算;` +
        `\n白望舒纹丝不动,因为他的宿慧本就 100% 走认知。` +
        `\n结论:直接移出存量,惩罚会精确落在老玩家头上,而真正该被收窄的路径没被碰到`
    )
  })

  it('故因此:收窄宿慧应改「发放条件」而非「移除通道」', () => {
    // 存量通道本身产出极小(金丹世 +6),真正的问题不在它的量,
    // 而在它无境界门槛。改成按境界发放即可,不必整条移除 ——
    // 整条移除的唯一实际后果是让老存档的折算凭空蒸发
    const lifeRealm = INSIGHT_CHANNELS.find(c => c.id === 'lifeRealm')!
    expect(lifeRealm.perGoldLife).toBeLessThan(10)
    expect(lifeRealm.realmGated).toBe(false)
    console.log(
      `\n存量通道金丹一世仅 +${lifeRealm.perGoldLife},量级本就不大;` +
        `\n问题在它无境界门槛而非它的量 —— 该改的是发放条件,不是整条拆掉`
    )
  })
})

describe('影响面 · 灵脉与先天之姿的存量处理', () => {
  it('存量资产判定', () => {
    console.log('\n资产        饱和度  沉没成本  轮回触碰  判定')
    for (const a of LEGACY_ASSETS) {
      console.log(
        `${a.name.padEnd(10)} ${(a.saturation * 100).toFixed(0).padStart(5)}%  ` +
          `${a.sunkCost ? '  有  ' : '  无  '}    ${a.touchedByRebirth ? '是' : '否'}      ` +
          `${a.verdict === 'heritage' ? '历史遗产' : '本世建设'}`
      )
      console.log(`    ${a.evidence}`)
    }
  })

  it('灵脉:两份存档都已投满,清零是追溯性剥夺已付代价', () => {
    for (const p of PROBES) {
      expect(veinTotalOf(p)).toBe(100)
      console.log(`  ${p.name.padEnd(12)} ${JSON.stringify(p.veins)} = ${veinTotalOf(p)}/100`)
    }
    const vein = LEGACY_ASSETS.find(a => a.id === 'veins')!
    expect(vein.saturation).toBe(1)
    expect(verdictOf(vein)).toBe('heritage')
    console.log(
      `\n既已满投,「移出浅轮回」对现有玩家是零变化,只影响新玩家 ——` +
        `\n这恰恰是最干净的收窄:改未来获取条件,不动既得`
    )
  })

  it('意外发现:主脉机制从未被真实玩家用过', () => {
    // 主脉可投 70,副脉上限 30。两人都是「三条投满 30 + 第四条投剩下的 10」
    expect(mainVeinEverUsed()).toBe(false)
    for (const p of PROBES) {
      expect(veinPeakOf(p)).toBeLessThanOrEqual(VEIN_SIDE_CAP)
    }
    console.log(
      `\n主脉上限 ${VEIN_MAIN_CAPACITY}、副脉 ${VEIN_SIDE_CAP},但两份存档的单条峰值都只有 ` +
        `${PROBES.map(p => veinPeakOf(p)).join('、')} —— 玩家一律平铺四条副脉,` +
        `\n「立主脉深投」这条设计在真实行为里不存在。收窄灵脉时若指望主脉承载深修差异,前提不成立`
    )
  })

  it('先天之姿与灵脉同构,可照抄同一套处理', () => {
    const talents = LEGACY_ASSETS.find(a => a.id === 'talents')!
    expect(talents.touchedByRebirth).toBe(false)
    expect(verdictOf(talents)).toBe('heritage')
    // 饱和度分化明显:一个已满、一个三分之一,说明这条轴仍有推进空间
    const rates = PROBES.map(p => p.talents)
    expect(Math.max(...rates)).toBeGreaterThan(Math.min(...rates) * 2)
    console.log(
      `\n两份存档 ${rates.join(' / ')} 项,分化明显 —— 与灵脉的「都已满」不同,` +
        `\n先天之姿仍在推进中,改来源会被玩家立刻感知,须配套说明`
    )
  })

  it('三者共用一条处理规则:保既得、改来源', () => {
    // 轮回本就不触碰这三样,所以清零属于新增惩罚而非恢复原设计
    for (const a of LEGACY_ASSETS) expect(a.touchedByRebirth).toBe(false)
    console.log(
      '\n宿慧存量、灵脉、先天之姿:轮回代码本就一概不动。' +
        '\n故收窄的正确形态是**改变获取条件**,而非清空既得 ——' +
        '\n「浅轮回积累经历,深修积累质量」这条规则约束的是未来发放,不是历史'
    )
  })
})
