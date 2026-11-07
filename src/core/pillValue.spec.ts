/* eslint-disable no-console */
/** 丹药价值审计:守定价法则,每一味新丹须过全部法则。已知未处置的失衡见文末「未处置的账」。 */
import { describe, it, expect } from 'vitest'
import {
  PILLS,
  pillDef,
  pillQualityColor,
  pillQualityName,
  pillRank,
  DAO_QUALITY_COLOR,
  DAO_QUALITY_NAME,
  DAO_QUALITY_RANK
} from '@/data/pills'
import { qualityDef } from '@/data/qualities'
import { buffDef } from '@/data/buffs'
import { MAX_MAJOR, WORLD_BREAK_MAJOR } from '@/data/realms'
import { BATTLE_EXP_SECS, INSTANT_EXP_LAYER_CAP, EXPLORE_BATTLE_INTERVAL } from '@/data/constants'
import { herbGradeOfMajor } from '@/data/herbGrades'
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
  layerSeconds,
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

/** 跨丹比较须统一境界 */
function unifiedRealm(pills: readonly { minRealm: number }[]): number {
  return pills.reduce((m, p) => Math.max(m, p.minRealm), 0)
}

// ============ 审计报告(只打印,不断言) ============

describe('丹药价值审计报告', () => {
  it('列出全丹药的价值表', () => {
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
  /** 【法则 A】掉落品药力 ≤ 同族、规格不低于它的最近可炼对照 × 0.6;比例取自寿元线 */
  it('A —— 掉落品不越过同规格可炼对照的六成', () => {
    for (const def of PILLS.filter(p => !p.recipe)) {
      const peer = craftPeerOf(def)
      if (!peer) continue // 内容缺口,不算定价违规
      const at = Math.max(def.minRealm, peer.minRealm)
      const theirs = pillGainSecAt(peer, at)
      if (theirs <= 0) continue
      const ratio = pillGainSecAt(def, at) / theirs
      expect(ratio, `${def.name} 白捡却抵得上 ${peer.name} 的 ${(ratio * 100).toFixed(0)}%`).toBeLessThanOrEqual(
        DROP_CRAFT_RATIO + 1e-9
      )
    }
  })

  /** 【法则 B】只在同线内比;跨线由法则 A 管 */
  it('B —— 同族同线内,品质越高药力不越低', () => {
    for (const fam of TIMED_FAMILIES) {
      for (const line of ['craft', 'drop'] as const) {
        const group = PILLS.filter(p => pillFamily(p) === fam && pillLine(p) === line)
        if (group.length < 2) continue
        const at = unifiedRealm(group)
        for (const a of group) {
          for (const b of group) {
            if (pillRank(a) >= pillRank(b)) continue
            expect(
              pillGainSecAt(a, at),
              `${FAMILY_NAME[fam]}族${line === 'craft' ? '可炼' : '掉落'}线:${a.name}(${pillQualityName(a)})` +
                ` 品质低于 ${b.name}(${pillQualityName(b)}) 却更管用`
            ).toBeLessThanOrEqual(pillGainSecAt(b, at) + 1e-9)
          }
        }
      }
    }
  })

  /**
   * 【法则 B2】同族同线内,高规格丹的药力必须严格高于低规格丹。
   *
   * 法则 B 写的是 `<=`,所以「完全相等」也过 —— 实测三味回满灵气丹
   * (灵乳 2 境草 16 / 仙泉玉液 11 境草 90 / 道液 18 境草 120)在任意境界下
   * 药力分毫不差:qiPct 三处都是 1,而 1 是当时以为的上限。
   * 玩家花 7.5 倍灵草换到一模一样的东西 —— 这是本条的由来。
   *
   * 实际灵气可积到标称容量的 QI_BANK_MULT(10)倍,qiPct 并不以 1 为顶;
   * 修法是给高阶两味 1.6 / 2.4,同境界药力就此拉开梯度。
   *
   * 折算境界取「两味里较高的准入境界」而非全组最大值:
   * expFixed 入门丹只服务 0 境(法则 D 已钉),用全组最大值会把它压成 0s 而误报。
   * 掉落线不在此列 —— 法则 A 管它,它本就该比可炼对照低。
   */
  it('B2 —— 可炼线内,高规格丹的药力必须严格高于低规格丹', () => {
    // 收集全部族再断言:逐族断言会在第一个族失败时断掉,后面的族根本没被查过
    const bad: string[] = []
    for (const fam of TIMED_FAMILIES) {
      const group = PILLS.filter(p => pillFamily(p) === fam && pillLine(p) === 'craft')
      if (group.length < 2) continue
      for (const a of group) {
        for (const b of group) {
          if (pillRank(a) >= pillRank(b)) continue
          const at = Math.max(a.minRealm, b.minRealm)
          const ga = pillGainSecAt(a, at)
          const gb = pillGainSecAt(b, at)
          if (gb <= ga + 1e-9) {
            bad.push(
              `${FAMILY_NAME[fam]}族:${a.name}(${pillQualityName(a)} 草${a.recipe?.herb}) ` +
                `与更高规格的 ${b.name}(${pillQualityName(b)} 草${b.recipe?.herb}) 药力同为 ${ga.toFixed(0)}s(在 ${at} 境)`
            )
          }
        }
      }
    }
    expect(bad, '高规格丹与低规格丹药力相同,炼贵的等于白花灵草').toEqual([])
  })

  /** 【法则 C】一个 buff 只许一味丹产出 */
  it('C —— 没有两味丹指向同一个增益', () => {
    const owner = new Map<string, string>()
    for (const p of PILLS) {
      if (p.kind !== 'buff' || !p.buffId) continue
      const prev = owner.get(p.buffId)
      expect(prev, `${p.name} 与 ${prev} 共用增益 ${p.buffId}`).toBeUndefined()
      owner.set(p.buffId, p.name)
    }
  })

  it('C2 —— buff 丹指向的增益确实存在,即时丹确实有效果', () => {
    for (const p of PILLS) {
      if (p.kind === 'buff') {
        expect(p.buffId, `${p.name} 是增益丹却没写 buffId`).toBeTruthy()
        expect(buffDef(p.buffId!), `${p.name} 指向不存在的增益 ${p.buffId}`).toBeDefined()
      } else {
        const i = p.instant ?? {}
        const has = [i.expSecs, i.expFixed, i.qiPct, i.lifespanYears, i.wudao].some(v => (v ?? 0) > 0)
        expect(has, `${p.name} 是即时丹却什么也不给`).toBe(true)
      }
    }
  })

  /** 【法则 D】expFixed 每大境界贬值 5.2 倍 */
  it('D —— 固定点数修为丹只用于入门(准入境界 0)', () => {
    for (const p of PILLS) {
      if (!(p.instant?.expFixed ?? 0)) continue
      expect(p.minRealm, `${p.name} 用固定点数却要求境界 ${p.minRealm} —— 一出生就已过期`).toBe(0)
    }
  })

  it('E —— 每个大境界的掉落池非空', () => {
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      expect(dropPoolAt(m).length, `境界 ${m} 掉不出任何丹药`).toBeGreaterThan(0)
    }
  })

  /** 【法则 E2】仙界及其上每一境的掉落池,至少一味准入境界 ≥ 仙界门槛 */
  it('E2 —— 仙界以上的掉落池不是入门丹的堆砌', () => {
    for (let m = WORLD_BREAK_MAJOR; m <= MAX_MAJOR; m += 1) {
      const pool = dropPoolAt(m)
      expect(
        pool.some(p => p.minRealm >= WORLD_BREAK_MAJOR),
        `境界 ${m} 只能捡到入门丹`
      ).toBe(true)
    }
  })

  /** 【法则 F】满额资源重置类必须是可炼品 */
  it('F —— 满额资源重置(灵气 ≥80%)必须炼得出来', () => {
    for (const p of PILLS) {
      if ((p.instant?.qiPct ?? 0) < 0.8) continue
      expect(p.recipe, `${p.name} 一口回满灵气却无需任何制备`).toBeDefined()
    }
  })

  /**
   * 【法则 G】三性质:药力不超过写死的时长;相对药力随境界只减不增;单枚永不满一层。
   * 按「当前一层需求的百分比」结算会让「囤低阶丹、到高境界嗑」成为最优解。
   */
  it('G —— 修为丹按等效闭关时长结算,囤到高境界只会更弱', () => {
    const expPills = PILLS.filter(p => pillFamily(p) === 'exp' && p.instant?.expSecs)
    expect(expPills.length, '修为线一味按时长计价的丹都没有?那这条法则无从守起').toBeGreaterThanOrEqual(8)
    for (const p of expPills) {
      const secs = p.instant!.expSecs!
      for (let m = p.minRealm; m <= MAX_MAJOR; m += 1) {
        expect(pillGainSecAt(p, m), `${p.name} 在境界 ${m} 的药力超过了它写死的那一段`).toBeLessThanOrEqual(secs + 1e-9)
      }
      const ownShare = pillGainSecAt(p, p.minRealm) / layerSeconds(p.minRealm)
      const topShare = pillGainSecAt(p, MAX_MAJOR) / layerSeconds(MAX_MAJOR)
      expect(topShare, `${p.name} 越到高境界越值钱 —— 百分比口径又回来了`).toBeLessThanOrEqual(ownShare + 1e-12)
      expect(ownShare, `${p.name} 在自己那一境就该满了一层`).toBeLessThanOrEqual(INSTANT_EXP_LAYER_CAP + 1e-9)
    }
    // 数据侧也不许留旧字段(类型上已删)
    for (const p of PILLS) {
      expect(
        (p.instant as Record<string, unknown> | undefined)?.expReqPct,
        `${p.name} 还留着按需求百分比结算的旧字段`
      ).toBeUndefined()
    }
  })

  /**
   * 【法则 G2】可炼修为丹 ≈ 灵草成本折算场次 × 2~5(溢价来自技艺、灵石与炸炉风险)。
   * 远贵于材料即成绕过境界壁垒的通路,远便宜则没人炼;掉落品由法则 A 管。
   */
  it('G2 —— 可炼修为丹的时长与其灵草成本同阶(2~5 倍于"多少场遭遇")', () => {
    const expCraft = PILLS.filter(p => pillFamily(p) === 'exp' && p.recipe && p.instant?.expSecs)
    expect(expCraft.length, '可炼修为丹一味都没有?').toBeGreaterThanOrEqual(6)
    for (const p of expCraft) {
      // 一场遭遇平均掉 1 味灵草(loot.afterWin),场次 ≈ herb
      const battlesWorth = (p.instant!.expSecs! * 1) / BATTLE_EXP_SECS
      const ratio = battlesWorth / p.recipe!.herb
      expect(ratio, `${p.name}:${p.instant!.expSecs} 秒 ≈ ${battlesWorth.toFixed(0)} 场,而它只要 ${p.recipe!.herb} 味灵草`).toBeGreaterThan(2)
      expect(ratio, `${p.name}:${p.instant!.expSecs} 秒 ≈ ${battlesWorth.toFixed(0)} 场,而它只要 ${p.recipe!.herb} 味灵草`).toBeLessThan(5)
    }
  })

  /** 【法则 H】全局天花板:规格高到没有对照的掉落丹也不得成为该族最强(同规格对位由法则 A 管) */
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

/**
 * 同品草带内,修为可炼丹的每-成本 perKsec 随境界单调不涨;倒挂则高一味成死内容。
 * perKsec = 炼成一枚的期望战斗场次 × 每场 12 秒 ÷ 准入境界药力(等效秒),越高越不划算。
 * 相对容差 1e-3:道源丹与混元丹设计上贴身相持,差不足千分之一。
 */
/*
 * 各族「同品草带内每-成本不倒挂」。
 *
 * 原先只查 exp 族。其余四族同样有这条要求:同一条草带里,高一味如果反而更不划算,
 * 它就是死内容。实测补查时抓到两处:
 *   一 tempo 品5 带:本源丹(18 境草 150)pk=0.215,混天丹(20 境草 400)pk=0.347 —— 倒挂 61%
 *   二 本源丹本身是同带异常点:带内其余丹草量都在 410~560,只有它 150
 * 修法是把本源丹提到 260、混天丹降到 340(都在带内合理区间),倒挂消失。
 *
 * qi 族的品1带(回灵丹 0.742 → 灵乳 1.099)不纳入:灵乳的溢价由「灵乳的单位灵气成本
 * 落在回灵丹的一到三倍之间」那条单独钉着,它是刻意的入门锚点。
 */
describe('带内各族无每-成本倒挂', () => {
  /** 参与本条的族;qi 的品1带另有专属判据,故排除 */
  const CHEKC_FAMILIES = ['exp', 'tempo', 'wudao', 'lifespan'] as const
  for (const fam of CHEKC_FAMILIES) {
    it(`同品草带内,${FAMILY_NAME[fam]}可炼丹的每-成本随境界单调不涨`, () => {
      const TOL = 1e-3
      const craft = PILLS.filter(p => pillFamily(p) === fam && p.recipe).sort((a, b) => a.minRealm - b.minRealm)
      if (craft.length < 2) return
      const bad: string[] = []
      let prevGrade: number | null = null
      let prevPk = 0
      let prevName = ''
      for (const p of craft) {
        const grade = herbGradeOfMajor(p.minRealm)
        const gain = pillGainSecAt(p, p.minRealm)
        if (!(gain > 0)) continue
        const pk = (craftBattlesOf(p) * EXPLORE_BATTLE_INTERVAL) / gain
        if (prevGrade !== grade) {
          prevGrade = grade
          prevPk = pk
          prevName = p.name
          continue
        }
        if (pk > prevPk * (1 + TOL)) {
          bad.push(
            `品${grade}草带内:${p.name}(境界 ${p.minRealm} 草${p.recipe?.herb}) 每-成本 ${pk.toFixed(4)} ` +
              `高于同带更低味 ${prevName} 的 ${prevPk.toFixed(4)} —— 高一味反而不如低一味划算`
          )
        }
        prevPk = pk
        prevName = p.name
      }
      expect(bad, '同带内出现了性价比倒挂').toEqual([])
    })
  }

  it('exp 线仍逐条比对(原有口径保持不变)', () => {
    const TOL = 1e-3
    const expCraft = PILLS.filter(p => pillFamily(p) === 'exp' && p.recipe && p.instant?.expSecs).sort(
      (a, b) => a.minRealm - b.minRealm
    )
    expect(expCraft.length).toBeGreaterThan(0)
    let prevGrade: number | null = null
    let prevPk = 0
    let prevName = ''
    for (const p of expCraft) {
      const grade = herbGradeOfMajor(p.minRealm)
      const pk = (craftBattlesOf(p) * EXPLORE_BATTLE_INTERVAL) / pillGainSecAt(p, p.minRealm)
      if (prevGrade !== grade) {
        prevGrade = grade
        prevPk = pk
        prevName = p.name
        continue
      }
      expect(
        pk,
        `品${grade}草带内:${p.name}(境界 ${p.minRealm}) 每-成本 ${pk.toFixed(4)} ` +
          `高于同带更低味 ${prevName} 的 ${prevPk.toFixed(4)} —— 高一味反而不如低一味划算`
      ).toBeLessThanOrEqual(prevPk * (1 + TOL))
      prevPk = pk
      prevName = p.name
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
    expect(p.alchemyLevel).toBeGreaterThanOrEqual(4)
  })

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
      (a, b) => pillRank(a) - pillRank(b)
    )
    const at = unifiedRealm(line)
    const names = line.map(p => `${p.name}(${pillQualityName(p)} ${dur(pillGainSecAt(p, at))})`)
    console.log(`\n  掉落修为线 @境界${at}:${names.join(' < ')}`)
    expect(line.length).toBeGreaterThanOrEqual(4)
  })

  /**
   * 未处置的账(已知,不动):
   * 1. 跨族性价比相差数百倍(藏经阁 1.5 悟道/时太慢、寿元按绝对年数不贬值),性价比只在族内比。
   * 2. 造化丹(天品)弱于聚灵丹(精品):与奇遇共用「道韵加身」,改增益波及 events.ts 十余处。
   * 3. 品质(quality)不参与效果计算,只影响掉落权重与图鉴配色;法则 B 替品质标签兜底。
   * 4. 炼制成本按丹药准入境界计价,不按玩家当下境界(pillCraftCost):入门方子石耗冻结在一层,
   *    效果却随境界长;改它须重做整条计价链。
   */
  it('存档:造化丹仍与奇遇共用道韵,本 Phase 不动它', () => {
    const p = pillDef('p_zaohua')!
    expect(p.buffId).toBe('bless_daoyun')
    const juling = pillDef('p_juling')!
    expect(pillGainSecAt(p, 5)).toBeLessThan(pillGainSecAt(juling, 5))
  })

  it('各族可炼线已至仙品以上 —— 曾经的「内容缺口」已由丹方补上', () => {
    // 法则 H 的另一面
    for (const fam of TIMED_FAMILIES) {
      const inFam = PILLS.filter(p => pillFamily(p) === fam)
      if (inFam.length === 0) continue
      const at = unifiedRealm(inFam)
      const craftPeak = familyPeakGain(fam, 'craft', at)
      const drops = inFam.filter(p => pillLine(p) === 'drop')
      const dropPeak = drops.length > 0 ? familyPeakGain(fam, 'drop', at) : 0
      expect(craftPeak, `${FAMILY_NAME[fam]}族没有可炼品`).toBeGreaterThan(0)
      if (dropPeak > 0) expect(craftPeak, `${FAMILY_NAME[fam]}族顶端仍被掉落品压过`).toBeGreaterThanOrEqual(dropPeak)
    }
  })
})

/**
 * 道品顶档的解析守卫。共享品质表 QUALITIES 只到神品(rank 8),「道品」只存在于 data/pills.ts;
 * 读丹药品阶的 rank/名/色须走 pillRank / pillQualityName / pillQualityColor,
 * 直接 qualityDef(pill.quality) 查无 'dao' 会静默回落凡品。
 */
describe('道品顶档的解析守卫', () => {
  const daoPills = PILLS.filter(p => p.quality === 'dao')

  it('确有道品位阶的丹药 —— 空断言防顶档被整档误删', () => {
    expect(daoPills.length, '没有一味道品丹?道品顶档被删空了').toBeGreaterThan(0)
  })

  it('每一味道品丹的 rank/名/色 都解析到道品档,而不是回落成凡品', () => {
    for (const p of daoPills) {
      expect(pillRank(p), `${p.name} 的 rank 没落到道品档`).toBe(DAO_QUALITY_RANK)
      expect(pillQualityName(p), `${p.name} 的名字应记「道品」`).toBe(DAO_QUALITY_NAME)
      expect(pillQualityColor(p), `${p.name} 的配色应记登峰金芒`).toBe(DAO_QUALITY_COLOR)
      // 直接 qualityDef 会回落凡品,两口径须分叉
      expect(qualityDef(p.quality as never).name, `${p.name} 竟以凡品口径解析`).not.toBe(DAO_QUALITY_NAME)
      expect(pillRank(p)).not.toBe(qualityDef(p.quality as never).rank)
    }
  })

  it('道品是丹药专属顶档,不入共享品质表(qualityDef 查无此档会回落凡品)', () => {
    expect(DAO_QUALITY_RANK).toBe(9)
    expect(DAO_QUALITY_NAME).toBe('道品')
    expect(DAO_QUALITY_COLOR).toBe('#E9B949')
    expect(qualityDef('dao' as never).name).toBe('凡品')
    expect(qualityDef('dao' as never).rank).toBe(0)
  })
})

/** 道品顶档的成员不变式:道品是各族可炼顶阶的专属名号,次席只给神品 */
describe('道品顶档的成员不变式', () => {
  const daoPills = PILLS.filter(p => p.quality === 'dao')

  it('道品只在混沌海(准入境界 ≥18)出现 —— 不入前中后期', () => {
    expect(daoPills.length).toBeGreaterThan(0)
    for (const p of daoPills) {
      expect(p.minRealm, `${p.name} 名登道品却不在混沌海(准入境界 ≥18)`).toBeGreaterThanOrEqual(18)
    }
  })

  it('任何一味道品可炼丹,都不被自家族内更晚更强的后辈压过', () => {
    // 口径同 contentDensity「丹方越晚越强」:在较高门槛处统一取值
    for (const d of daoPills) {
      if (!d.recipe) continue
      for (const c of PILLS) {
        if (!c.recipe || pillFamily(c) !== pillFamily(d)) continue
        if (c.minRealm <= d.minRealm) continue
        const at = c.minRealm
        expect(
          pillGainSecAt(c, at),
          `${d.name}(道品)之上竟有同族更晚且更强的 ${c.name}?道品名号空心化了`
        ).toBeLessThanOrEqual(pillGainSecAt(d, at) + 1e-9)
      }
    }
  })

  it('每族混沌海可炼顶阶(境界最高、药力最足)必须是道品;混沌海外的族不得叫道品', () => {
    const families: PillFamily[] = ['exp', 'qi', 'lifespan', 'wudao', 'tempo', 'state']
    for (const fam of families) {
      const apex = PILLS.filter(p => pillFamily(p) === fam && p.recipe).sort((a, b) => {
        const byRealm = b.minRealm - a.minRealm
        return byRealm !== 0 ? byRealm : pillGainSecAt(b, b.minRealm) - pillGainSecAt(a, a.minRealm)
      })[0]!
      if (apex.minRealm >= 18) {
        expect(apex.quality, `${FAMILY_NAME[fam]}族的混沌海可炼顶阶「${apex.name}」该登道品`).toBe('dao')
      } else {
        expect(apex.quality, `${FAMILY_NAME[fam]}族的顶阶不在混沌海,不该叫「道品」`).not.toBe('dao')
      }
    }
  })

  /**
   * 修速丹不该被同档修为丹碾压。
   *
   * 修速丹的等效挂机秒 = 时长 × 速率加成,**与境界无关**;
   * 它要顶替的那一次闭关(修为丹的 expSecs)却随境界涨了近 1500 倍。
   * 于是 1800 秒的高境界修速丹只值同档修为丹的 9% —— 同样要灵草、同样占一个丹方位,
   * 炼它不如直接炼修为丹。玩家不会算这一笔,只会觉得这味丹没用。
   *
   * 判据取下限 35%:低境界本就该由短时丹承担(聚灵丹与玄元丹持平是设计),
   * 这里只拦「高境界掉到零头」。上限 150% 拦反向:修速丹是副渠道,不该完全顶替闭关丹。
   */
  it('修速丹在各境界都不被同档修为丹碾压(≥35%),也不越权顶替(≤150%)', () => {
    const expPills = PILLS.filter(p => pillLine(p) === 'craft' && (p.instant?.expSecs ?? 0) > 0)
    const tempoPills = PILLS.filter(p => pillLine(p) === 'craft' && pillFamily(p) === 'tempo')
    expect(tempoPills.length, '判据失去对象').toBeGreaterThan(2)
    const bad: string[] = []
    for (const t of tempoPills) {
      const gain = pillGainSecAt(t, t.minRealm)
      // 同档口径:准入门槛最近的那味修为丹(±2 境界),没有则跳过
      const peer = expPills
        .filter(e => Math.abs(e.minRealm - t.minRealm) <= 2)
        .sort((a, b) => Math.abs(a.minRealm - t.minRealm) - Math.abs(b.minRealm - t.minRealm))[0]
      if (!peer) continue
      const ratio = gain / pillGainSecAt(peer, peer.minRealm)
      if (ratio < 0.35 || ratio > 1.5) {
        bad.push(`${t.name}(境界 ${t.minRealm}) 只值同档 ${peer.name} 的 ${(ratio * 100).toFixed(0)}%`)
      }
    }
    expect(bad, `这些修速丹与同档修为丹不成比例:\n${bad.join('\n')}`).toEqual([])
  })
})
