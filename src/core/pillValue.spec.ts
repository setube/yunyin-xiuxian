/* eslint-disable no-console */
/**
 * Phase 32.6:丹药价值审计
 *
 * 这一组测试守的不是某个数值,而是**定价法则本身**。
 *
 * 玩家的原话是「灵乳回得太多」,但真问题在他没说出口的那半句:凭什么白捡的比炼的强?
 * 于是这里立七条法则,让三十二味丹各安其位 —— 不是把某个数按下去了事,
 * 而是让往后每一味新丹都得先过这七关。
 *
 * 其中最要紧的一条(法则 A)不是我定的,是**从游戏自己的数据里读出来的**:
 * 凤髓膏对千年延寿丹、蟠桃对万寿金丹,两处掉落品都恰是同规格可炼品的五成。
 * 寿元线一直做对了,只是其余四条线没跟上。
 *
 * 另有若干失衡不在本 Phase 处置(改它们等于重做丹药结构),只在报告里点名存档,
 * 见文末「未处置的账」。
 */
import { describe, it, expect } from 'vitest'
import { PILLS, pillDef } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import { qualityDef } from '@/data/qualities'
import { MAX_MAJOR } from '@/data/realms'
import {
  DROP_CRAFT_RATIO,
  craftBattlesOf,
  craftPeerOf,
  dropPoolAt,
  familyPeakGain,
  pillFamily,
  pillGainSecAt,
  pillLine,
  pillValueTable,
  type PillFamily
} from './pillValue'

const FAMILY_NAME: Record<PillFamily, string> = {
  exp: '修为',
  qi: '灵气',
  lifespan: '寿元',
  wudao: '悟道',
  tempo: '修速',
  state: '状态'
}

/** 可折成时间的五族 —— state 族不入排序,只审规格一致性 */
const TIMED_FAMILIES: PillFamily[] = ['exp', 'qi', 'lifespan', 'wudao', 'tempo']

// ---------- 排版 ----------

function textWidth(s: string): number {
  let n = 0
  for (const ch of s) n += /[⺀-鿿　-〿＀-￯]/.test(ch) ? 2 : 1
  return n
}
function padR(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - textWidth(s)))
}
function padL(s: string, n: number): string {
  return ' '.repeat(Math.max(0, n - textWidth(s))) + s
}
function dur(sec: number): string {
  if (!(sec > 0)) return '—'
  if (sec < 60) return `${sec.toFixed(1)}秒`
  if (sec < 3600) return `${(sec / 60).toFixed(1)}分`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}时`
  return `${(sec / 86400).toFixed(1)}天`
}
function num(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '—'
  if (Math.abs(v) >= 1e5 || Math.abs(v) < 0.01) return v.toExponential(1)
  return v.toFixed(digits)
}

/** 跨丹比较必须统一境界,否则比出来的是境界差不是丹药差 */
function unifiedRealm(pills: readonly { minRealm: number }[]): number {
  return pills.reduce((m, p) => Math.max(m, p.minRealm), 0)
}

// ============ 审计报告(只打印,不断言) ============

describe('丹药价值审计报告', () => {
  it('列出三十二味丹的价值表', () => {
    const rows = pillValueTable()
    console.log('\n=== 丹药价值总表 ===')
    console.log('  药力 = 折成等效挂机秒数(在该丹准入境界处取值);代价 = 折成战斗场次')
    console.log(
      `\n  ${padR('丹名', 14)}${padR('族', 6)}${padR('线', 6)}${padR('品质', 8)}${padL('境', 4)}` +
        `${padL('药力', 10)}${padL('炼制场次', 10)}${padL('成功率', 9)}${padL('性价比', 9)}${padL('见一枚', 10)}${padL('池占', 8)}`
    )
    let lastFamily = ''
    for (const r of rows) {
      if (r.family !== lastFamily) {
        console.log(`  ${'-'.repeat(50)} ${FAMILY_NAME[r.family]}族`)
        lastFamily = r.family
      }
      console.log(
        `  ${padR(r.name, 14)}${padR(FAMILY_NAME[r.family], 6)}${padR(r.line === 'craft' ? '可炼' : '掉落', 6)}` +
          `${padR(r.quality, 8)}${padL(String(r.minRealm), 4)}${padL(dur(r.gainSec), 10)}` +
          `${padL(num(r.craftBattles, 1), 10)}${padL(r.craftRate > 0 ? `${(r.craftRate * 100).toFixed(0)}%` : '—', 9)}` +
          `${padL(num(r.ratio), 9)}${padL(r.dropBattles > 0 ? `${r.dropBattles.toFixed(0)}场` : '—', 10)}` +
          `${padL(r.dropShare > 0 ? `${(r.dropShare * 100).toFixed(0)}%` : '—', 8)}`
      )
    }
    expect(rows.length).toBe(PILLS.length)
  })

  it('列出掉落品与其可炼对照的差距(法则 A 的实证)', () => {
    console.log('\n=== 掉落 vs 可炼:同族同规格对照 ===')
    console.log(`  红线:掉落品药力 ≤ 对照 × ${DROP_CRAFT_RATIO}(统一到两者准入境界的较高处折算)`)
    for (const def of PILLS.filter(p => !p.recipe)) {
      const peer = craftPeerOf(def)
      if (!peer) {
        console.log(`  ${padR(def.name, 12)} ${padR(FAMILY_NAME[pillFamily(def)], 6)} 无同规格可炼对照 —— 该族顶端尚无可炼品(内容缺口)`)
        continue
      }
      const at = Math.max(def.minRealm, peer.minRealm)
      const mine = pillGainSecAt(def, at)
      const theirs = pillGainSecAt(peer, at)
      const ratio = theirs > 0 ? mine / theirs : Infinity
      const mark = ratio <= DROP_CRAFT_RATIO ? '✓' : '✗'
      console.log(
        `  ${mark} ${padR(def.name, 12)} 对 ${padR(peer.name, 14)} ` +
          `@境界${at}  ${padL(dur(mine), 9)} / ${padL(dur(theirs), 9)} = ${padL(ratio.toFixed(2), 6)}`
      )
    }
    expect(PILLS.some(p => !p.recipe)).toBe(true)
  })

  it('列出各大境界的掉落池规模', () => {
    console.log('\n=== 各境界掉落池 ===')
    console.log('  池窄意味着前期"每次掉的都是同一味" —— 这是内容缺口,补法是加丹不是改数')
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      const pool = dropPoolAt(m)
      const top = [...pool].sort((a, b) => pillGainSecAt(b, m) - pillGainSecAt(a, m))[0]
      console.log(
        `  境界 ${m}:${padL(String(pool.length), 3)} 味  ` +
          `${padR(pool.map(p => p.name).join('、'), 40)} ` +
          `最强:${top ? top.name : '—'}`
      )
    }
    expect(dropPoolAt(MAX_MAJOR).length).toBeGreaterThan(0)
  })

  it('列出各族的可炼线与掉落线顶端', () => {
    console.log('\n=== 各族两线顶端(统一到该族最高准入境界折算)===')
    for (const fam of TIMED_FAMILIES) {
      const inFam = PILLS.filter(p => pillFamily(p) === fam)
      if (inFam.length === 0) continue
      const at = unifiedRealm(inFam)
      const craft = familyPeakGain(fam, 'craft', at)
      const drop = familyPeakGain(fam, 'drop', at)
      const mark = drop <= craft ? '✓' : '✗'
      console.log(
        `  ${mark} ${padR(FAMILY_NAME[fam], 6)}@境界${at}  可炼顶端 ${padL(dur(craft), 10)}   掉落顶端 ${padL(dur(drop), 10)}`
      )
    }
    expect(TIMED_FAMILIES.length).toBe(5)
  })
})

// ============ 定价法则(断言) ============

describe('定价法则', () => {
  /**
   * 【法则 A】掉落品的药力 ≤ 同族、规格不低于它的最近可炼对照 × 0.6。
   *
   * 白捡的东西不该比炼的强,这是整套价值预算的地基。比例取自寿元线现成的做法。
   */
  it('A —— 掉落品不越过同规格可炼对照的六成', () => {
    for (const def of PILLS.filter(p => !p.recipe)) {
      const peer = craftPeerOf(def)
      if (!peer) continue // 该族顶端无可炼品,是内容缺口,不是定价违规
      const at = Math.max(def.minRealm, peer.minRealm)
      const theirs = pillGainSecAt(peer, at)
      if (theirs <= 0) continue
      const ratio = pillGainSecAt(def, at) / theirs
      expect(ratio, `${def.name} 白捡却抵得上 ${peer.name} 的 ${(ratio * 100).toFixed(0)}%`).toBeLessThanOrEqual(
        DROP_CRAFT_RATIO + 1e-9
      )
    }
  })

  /**
   * 【法则 B】同族同线内,药力序与品质序一致。
   *
   * 只在同一条线内要求 —— 跨线由法则 A 管,把两条线混在一起排会自相矛盾。
   */
  it('B —— 同族同线内,品质越高药力不越低', () => {
    for (const fam of TIMED_FAMILIES) {
      for (const line of ['craft', 'drop'] as const) {
        const group = PILLS.filter(p => pillFamily(p) === fam && pillLine(p) === line)
        if (group.length < 2) continue
        const at = unifiedRealm(group)
        for (const a of group) {
          for (const b of group) {
            if (qualityDef(a.quality).rank >= qualityDef(b.quality).rank) continue
            expect(
              pillGainSecAt(a, at),
              `${FAMILY_NAME[fam]}族${line === 'craft' ? '可炼' : '掉落'}线:${a.name}(${qualityDef(a.quality).name})` +
                ` 品质低于 ${b.name}(${qualityDef(b.quality).name}) 却更管用`
            ).toBeLessThanOrEqual(pillGainSecAt(b, at) + 1e-9)
          }
        }
      }
    }
  })

  /**
   * 【法则 C】一个 buff 只许一味丹产出。
   *
   * 两味丹指向同一个增益,等于其中一味零成本复制了另一味的产出,
   * 品质与配方的差别当场作废。
   */
  it('C —— 没有两味丹指向同一个增益', () => {
    const owner = new Map<string, string>()
    for (const p of PILLS) {
      if (p.kind !== 'buff' || !p.buffId) continue
      const prev = owner.get(p.buffId)
      expect(prev, `${p.name} 与 ${prev} 共用增益 ${p.buffId}`).toBeUndefined()
      owner.set(p.buffId, p.name)
    }
  })

  /** 每一味 buff 丹都得真有那个 buff,否则是个吃下去什么也不发生的空壳 */
  it('C2 —— buff 丹指向的增益确实存在,即时丹确实有效果', () => {
    for (const p of PILLS) {
      if (p.kind === 'buff') {
        expect(p.buffId, `${p.name} 是增益丹却没写 buffId`).toBeTruthy()
        expect(buffDef(p.buffId!), `${p.name} 指向不存在的增益 ${p.buffId}`).toBeDefined()
      } else {
        const i = p.instant ?? {}
        const has = [i.expReqPct, i.expFixed, i.qiPct, i.lifespanYears, i.wudao].some(v => (v ?? 0) > 0)
        expect(has, `${p.name} 是即时丹却什么也不给`).toBe(true)
      }
    }
  })

  /**
   * 【法则 D】固定点数的修为丹只配给准入境界 0。
   *
   * expFixed 每上一个大境界贬值 5.2 倍。入门丹如此是设计意图(它本就该被淘汰),
   * 但一味准入金丹期的丹若还用固定点数,它在自己首次现身的那一刻就已经过期了。
   */
  it('D —— 固定点数修为丹只用于入门(准入境界 0)', () => {
    for (const p of PILLS) {
      if (!(p.instant?.expFixed ?? 0)) continue
      expect(p.minRealm, `${p.name} 用固定点数却要求境界 ${p.minRealm} —— 一出生就已过期`).toBe(0)
    }
  })

  /** 【法则 E】每个大境界都得掉得出东西来 */
  it('E —— 每个大境界的掉落池非空', () => {
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      expect(dropPoolAt(m).length, `境界 ${m} 掉不出任何丹药`).toBeGreaterThan(0)
    }
  })

  /**
   * 【法则 F】满额资源重置类必须是可炼品。
   *
   * 灵气是突破的门槛资源(突破耗去上限的四成),一枚回满即抵两次半突破。
   * 战术上最强的即时效果必须付出制备代价 —— 它可以贵、可以稀有、可以难炼,
   * 但不能是白捡的。这条是本次校准里唯一动结构的地方。
   */
  it('F —— 满额资源重置(灵气 ≥80%)必须炼得出来', () => {
    for (const p of PILLS) {
      if ((p.instant?.qiPct ?? 0) < 0.8) continue
      expect(p.recipe, `${p.name} 一口回满灵气却无需任何制备`).toBeDefined()
    }
  })

  /**
   * 【法则 H】掉落品不得碾压该族可炼线的顶端。
   *
   * 法则 A 管的是同规格对位,这条管的是全局天花板:哪怕某味掉落丹规格高到
   * 没有对照,它也不该成为该族最强。否则炼丹这条线在终局直接失去意义。
   */
  it('H —— 掉落线顶端不越过可炼线顶端', () => {
    for (const fam of TIMED_FAMILIES) {
      const inFam = PILLS.filter(p => pillFamily(p) === fam)
      const drops = inFam.filter(p => pillLine(p) === 'drop')
      if (drops.length === 0) continue
      const at = unifiedRealm(inFam)
      const craftPeak = familyPeakGain(fam, 'craft', at)
      if (craftPeak <= 0) {
        console.log(`  ! ${FAMILY_NAME[fam]}族全无可炼品 —— 内容缺口,本条豁免`)
        continue
      }
      const dropPeak = familyPeakGain(fam, 'drop', at)
      expect(dropPeak, `${FAMILY_NAME[fam]}族最强的一味是白捡的,炼丹在这条线上失去意义`).toBeLessThanOrEqual(
        craftPeak + 1e-9
      )
    }
  })
})

// ============ 校准落点的定点复核 ============

describe('本次校准的落点', () => {
  it('灵乳:从白捡的回满改为高规格可炼品,效果不减', () => {
    const p = pillDef('p_lingru')!
    expect(p.instant?.qiPct, '回满灵气这一效果本身没有错,错的是它不要钱').toBe(1)
    expect(p.recipe, '必须付出制备代价').toBeDefined()
    expect(p.minRealm, '规格要求须与其战术价值相称').toBeGreaterThanOrEqual(2)
    // 炉火要求远高于入门期的回灵丹,丹方也须另行习得
    expect(p.alchemyLevel).toBeGreaterThanOrEqual(4)
  })

  /**
   * 给灵乳定价的那条线:贵得起,但不能贵到没人炼。
   *
   * 回灵丹是开局就会的方子,两枚即抵一枚灵乳。灵乳的单位灵气成本一旦超过它太多,
   * 这味丹就成了图鉴里的一行字 —— 把异常从"过强"搬到"死内容",不算修好。
   */
  it('灵乳的单位灵气成本落在回灵丹的一到三倍之间 —— 是溢价,不是天价', () => {
    const lingru = pillDef('p_lingru')!
    const huichun = pillDef('p_huichun')!
    const perQi = (def: typeof lingru): number => craftBattlesOf(def) / (def.instant?.qiPct ?? 1)
    const premium = perQi(lingru) / perQi(huichun)
    console.log(`\n  灵乳单位灵气成本 = 回灵丹的 ${premium.toFixed(2)} 倍`)
    expect(premium, '灵乳比回灵丹还便宜,溢价无从体现').toBeGreaterThan(1)
    expect(premium, '贵到这个份上没人会炼,等于把它从游戏里删掉').toBeLessThanOrEqual(3)
  })

  it('妖血丹:回到入门定位 —— 便宜、常用、低风险', () => {
    const p = pillDef('p_yaoxue')!
    expect(p.minRealm, '固定点数的丹只在入门期才不算过期').toBe(0)
    expect(pillFamily(p)).toBe('exp')
    expect(pillLine(p)).toBe('drop')
    // 它接手灵乳腾出的位置:炼气期唯一掉得出的丹
    expect(dropPoolAt(0).map(x => x.id)).toContain('p_yaoxue')
  })

  it('雷灵丹:不再与战灵丹共用战意,改走修为线', () => {
    const p = pillDef('p_leiling')!
    expect(p.kind).toBe('instant')
    expect(pillFamily(p)).toBe('exp')
    expect(pillDef('p_zhanling')!.buffId, '战意重归战灵丹独有').toBe('buff_zhanli')
  })

  it('掉落修为线自成一条干净的递进', () => {
    const line = PILLS.filter(p => pillFamily(p) === 'exp' && pillLine(p) === 'drop').sort(
      (a, b) => qualityDef(a.quality).rank - qualityDef(b.quality).rank
    )
    const at = unifiedRealm(line)
    const names = line.map(p => `${p.name}(${qualityDef(p.quality).name} ${dur(pillGainSecAt(p, at))})`)
    console.log(`\n  掉落修为线 @境界${at}:${names.join(' < ')}`)
    expect(line.length).toBeGreaterThanOrEqual(4)
  })

  /**
   * 未处置的账 —— 本 Phase 明确不动,记在这里免得下次重新发现一遍。
   *
   * 1. **可炼修为丹的性价比跨一百余倍**(聚气散 → 九转还魂丹):药力按需求百分比走,
   *    成本按材料线性走,两条曲线量纲不同。修它等于重设全部材料成本曲线。
   * 2. **跨族性价比相差数百倍**:藏经阁 1.5 悟道/时太慢、寿元按绝对年数不贬值。
   *    所以本文件的性价比只在族内比较。
   * 3. **悟道族与修速族的可炼线止于玄品/精品**,其上由掉落品独占 —— 内容缺口,
   *    补法是加丹方,不是砍掉落。
   * 4. **造化丹(天品)比聚灵丹(精品)还弱**:高规格低内容。它与奇遇系统共用
   *    「道韵加身」,改增益会波及 events.ts 十余处,本 Phase 不动。
   * 5. **品质(quality)不参与任何效果计算**,只影响掉落权重与图鉴配色。
   *    本文件的法则 B 正是在替品质标签兜底 —— 让它至少与药力序对得上。
   * 6. **炼制成本按丹药的准入境界计价,而非按玩家当下的境界**(见 pillService
   *    的 pillCraftCost:tier 取自 def.minRealm)。于是回灵丹这类入门方子的灵石
   *    开销永远冻结在一层,效果(按上限百分比回灵气)却随境界一路长 ——
   *    这是「低成本高即时价值」的结构性来源,但改它等于重做整条计价链,不在本 Phase。
   */
  it('存档:造化丹仍与奇遇共用道韵,本 Phase 不动它', () => {
    const p = pillDef('p_zaohua')!
    expect(p.buffId).toBe('bless_daoyun')
    // 它虽是天品却弱于精品的聚灵丹 —— 记录在案,不在本 Phase 处置
    const juling = pillDef('p_juling')!
    expect(pillGainSecAt(p, 5)).toBeLessThan(pillGainSecAt(juling, 5))
  })
})
