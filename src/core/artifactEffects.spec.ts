/* eslint-disable no-console -- 净念读数供复核 */
/** 故障注入:把仙琴的 stun 换回 weaken、把 tryStun 的挣脱判定掏空,对应判据即红。 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ARTIFACTS,
  ARTIFACT_LEVEL_BONUS,
  artifactActiveText,
  artifactDef,
  artifactLevelLabel,
  artifactNextLevelGain,
  artifactQualityMult,
  artifactValue
} from '@/data/artifacts'
import { RandomService, mulberry32 } from '@/utils/random'
import { formatPercent } from '@/utils/format'
import { gn, toNum } from '@/utils/gnum'
import { MITIGATION_K, SHIELD_CAP_RATIO } from '@/data/constants'
import { mulN } from '@/utils/gnum'
import { resolveCombat, makeEnemySnap } from './combat'
import { buildPlayerSnap } from './playerSnap'
import { enemyDef } from '@/data/enemies'

const seeded = (seed = 1): RandomService => new RandomService(mulberry32(seed))

/** 厚甲但打不死人的靶子:减伤不被上限压死,气血撑过十个回合 */
function tankyWolf(): ReturnType<typeof makeEnemySnap> {
  const snap = makeEnemySnap(enemyDef('e_wolf')!, 1, 1)
  snap.attack = gn(1)
  snap.defense = mulN(gn(1e6), MITIGATION_K) // 减伤 ≈ 50%
  snap.maxHp = gn(6e6)
  snap.speed = 1
  snap.mods = {}
  return snap
}

/** ArtifactEffect 是手写联合,只能扫源码取判别值 */
function effectTypesFromTypes(): string[] {
  const src = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf8')
  const start = src.indexOf('export type ArtifactEffect =')
  expect(start, 'types/index.ts 里找不到 ArtifactEffect').toBeGreaterThanOrEqual(0)
  const block = src.slice(start, src.indexOf('export interface ArtifactDef', start))
  return [...new Set([...block.matchAll(/type:\s*'([a-z]+)'/g)].map(m => m[1]!))]
}

/**
 * 封顶值在此**硬写**,不 import 被测量的常量。
 *
 * 原先 spec 读 ARTIFACT_WEAKEN_CAP 等四个常量来算期望值 —— 那是自证:
 * 常量若被改错,artifactValue 与 expected 会一起变,用例照样绿。
 * 硬写之后常量一改就会红,届时须显式确认是「有意调平衡」再同步改这里。
 */
const CAP_WEAKEN = 0.5
const CAP_SUNDER = 0.5
const CAP_PURGE = 0.9
const CAP_DRAIN_HEAL = 1

describe('法宝效果 · 词汇表不虚设', () => {
  it('每一种声明过的效果,都至少有一件法宝在用', () => {
    const declared = effectTypesFromTypes()
    expect(declared.length, '一种效果都没扫到,断言形同虚设').toBeGreaterThanOrEqual(4)
    const used = new Set(ARTIFACTS.map(a => a.active.effect.type))
    const dead = declared.filter(t => !used.has(t as (typeof ARTIFACTS)[number]['active']['effect']['type']))
    expect(dead, `这些效果声明了却没有任何法宝用它 —— 写了不用等于没写:${dead.join('、')}`).toEqual([])
  })

  it('高界法宝里不止是数值放大:至少有一件用的是别的手艺', () => {
    // fromTier ≥ 21:仙界/神界/混沌海
    const high = ARTIFACTS.filter(a => a.fromTier >= 21)
    expect(high.length, '高界法宝一件都没有,判据失去对象').toBeGreaterThan(4)
    const BASIC = ['damage', 'heal', 'shield', 'weaken']
    const beyondBasic = high.filter(a => !BASIC.includes(a.active.effect.type))
    expect(
      beyondBasic.length,
      `高界 ${high.length} 件法宝全在「打/回/盾/削」四样里按倍率放大 —— 境界涨了,手艺没涨`
    ).toBeGreaterThan(0)
  })

  /** 净念(无相念珠)除外:随身被动,interval 记 1 表「常在」(见 ArtifactEffect.purge),文案不写回合数 */
  it('说明里写的回合数 = 它真的出手的节拍', () => {
    const CN: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const bad: string[] = []
    let checkedCount = 0
    for (const a of ARTIFACTS) {
      if (a.active.effect.type === 'purge') continue
      const m = /每\s*([0-9一二三四五六七八九十]+)\s*回合/.exec(a.active.desc)
      if (!m) {
        bad.push(`${a.name}:说明里没有写回合数(「${a.active.desc}」)`)
        continue
      }
      const raw = m[1]!
      const n = /^\d+$/.test(raw) ? Number(raw) : CN[raw]
      checkedCount += 1
      if (n !== a.active.interval) bad.push(`${a.name}:说明写「每 ${raw} 回合」,节拍却是 ${a.active.interval}`)
    }
    expect(checkedCount, '一件法宝都没扫到,判据形同虚设').toBeGreaterThan(20)
    expect(bad, `这些法宝的说明与节拍对不上:\n${bad.join('\n')}`).toEqual([])
  })

  it('说明里写的数值 = 数据里的数值', () => {
    const CN: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const bad: string[] = []
    let checkedCount = 0
    for (const a of ARTIFACTS) {
      const eff = a.active.effect
      const desc = a.active.desc
      const pct = /([\d.]+)\s*%/.exec(desc)
      const cheng = /以([一二三四五六七八九十]+)成/.exec(desc)
      let claimed: number | null = null
      if (pct) claimed = Number(pct[1])
      else if (cheng) {
        const raw = cheng[1]!
        const n = /^\d+$/.test(raw) ? Number(raw) : CN[raw]
        // 「七成」= 70%
        if (n !== undefined) claimed = n * 10
      }
      let actual: number | null = null
      if (eff.type === 'heal' || eff.type === 'shield') actual = eff.pctMaxHp * 100
      else if (eff.type === 'damage' || eff.type === 'drain') actual = eff.mult * 100
      else if (eff.type === 'weaken' || eff.type === 'sunder') actual = eff.pct * 100
      else if (eff.type === 'purge') actual = eff.pct * 100
      if (actual === null) continue
      checkedCount += 1
      if (claimed === null) {
        bad.push(`${a.name}:说明里没写数值(「${desc}」),数据里却是 ${actual}%`)
        continue
      }
      if (Math.abs(claimed - actual) > 0.01) {
        bad.push(`${a.name}:说明写 ${claimed}%,数据是 ${actual}%`)
      }
      if (eff.type === 'drain') {
        const back = /回复其中\s*([\d.]+)\s*%/.exec(desc)
        checkedCount += 1
        if (!back) {
          bad.push(`${a.name}:吸命却没说回复几成(「${desc}」)`)
        } else if (Math.abs(Number(back[1]) - eff.healPct * 100) > 0.01) {
          bad.push(`${a.name}:说明写回复其中 ${back[1]}%,数据是 ${eff.healPct * 100}%`)
        }
      }
    }
    expect(checkedCount, '一件法宝的数值都没扫到,判据形同虚设').toBeGreaterThan(25)
    expect(bad, `这些法宝的说明与数据对不上:\n${bad.join('\n')}`).toEqual([])
  })
})

/**
 * 表里的数是凡品零重基线;品阶(凡 1.0 → 神 ≈3.08,见 ARTIFACT_QUALITY_EXP)与祭炼(九重 ×1.72)由 artifactValue 现算(战斗与文案读同一个函数)。
 * 守三件事:措辞不动、数值随品阶与祭炼走、封顶到了要写封顶值。
 */
describe('法宝说明 · 数字随品阶与祭炼等级走', () => {
  const asMortal = (a: (typeof ARTIFACTS)[number]) => ({ ...a, quality: 'mortal' as const })

  /** 期望值独立复算,不复用被测函数 */
  function expected(def: (typeof ARTIFACTS)[number], level: number): { main: number | null; heal?: number } {
    const eff = def.active.effect
    const mult = artifactQualityMult(def.quality) * (1 + level * ARTIFACT_LEVEL_BONUS)
    switch (eff.type) {
      case 'damage':
        return { main: eff.mult * mult }
      case 'drain':
        return { main: eff.mult * mult, heal: Math.min(CAP_DRAIN_HEAL, eff.healPct * mult) }
      case 'heal':
        return { main: eff.pctMaxHp * mult }
      case 'shield':
        // 单次护盾也受总盾上限约束(战斗侧 gainShield 钳在 SHIELD_CAP_RATIO)
        return { main: Math.min(SHIELD_CAP_RATIO, eff.pctMaxHp * mult) }
      case 'weaken':
        return { main: Math.min(CAP_WEAKEN, eff.pct * mult) }
      case 'sunder':
        return { main: Math.min(CAP_SUNDER, eff.pct * mult) }
      case 'purge':
        return { main: Math.min(CAP_PURGE, eff.pct * mult) }
      case 'stun':
        return { main: null }
    }
  }

  const pcts = (text: string): number[] => [...text.matchAll(/([\d.]+)\s*%/g)].map(m => Number(m[1]))
  /** 中文成数换算(净念写「七成」) */
  const CHENG = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const chengOf = (text: string): number | null => {
    const m = /([一二三四五六七八九十])成/.exec(text)
    return m ? CHENG.indexOf(m[1]!) + 1 : null
  }

  it('凡品零重时与原说明逐字相同 —— 只换数字,不碰措辞', () => {
    for (const a of ARTIFACTS) {
      expect(artifactActiveText(asMortal(a), 0), `${a.name} 的凡品零重说明被改写过了`).toBe(a.active.desc)
    }
  })

  it('品阶高于凡品时,零重的数已经是放大之后的 —— desc 说的是基线,不是面板', () => {
    const zhanxian = artifactDef('af_zhanxian')! // 良品 · 基线 460%
    expect(artifactActiveText(zhanxian, 0)).toContain(formatPercent(4.6 * artifactQualityMult('fine')))
    expect(artifactActiveText(zhanxian, 0)).not.toBe(zhanxian.active.desc)
  })

  it('0 / 3 / 9 级:说明里的数就是这一级真正生效的数(含封顶)', () => {
    for (const level of [0, 3, 9]) {
      for (const a of ARTIFACTS) {
        const want = expected(a, level)
        const text = artifactActiveText(a, level)
        if (want.main === null) {
          expect(pcts(text), `${a.name} 没有数值却出现了百分数`).toEqual([])
          continue
        }
        if (a.active.effect.type === 'purge') {
          const cheng = chengOf(text)
          expect(cheng, `${a.name} 该以成数写明挣脱概率:「${text}」`).not.toBeNull()
          expect(
            Math.abs(cheng! - want.main * 10),
            `${a.name} 第 ${level} 级写「${cheng}成」,实际 ${(want.main * 100).toFixed(1)}%`
          ).toBeLessThan(0.51)
          continue
        }
        const got = pcts(text)
        // 小数位由 formatPercent 决定,比到一位小数
        expect(got.length, `${a.name} 的说明少了数值:「${text}」`).toBeGreaterThan(0)
        expect(Math.abs(got[0]! - want.main * 100), `${a.name} 第 ${level} 级说明写 ${got[0]}%,实际 ${want.main * 100}%`).toBeLessThan(0.11)
        if (want.heal !== undefined) {
          expect(got.length, `${a.name} 的吸命该有两个百分数:「${text}」`).toBe(2)
          expect(Math.abs(got[1]! - want.heal * 100), `${a.name} 的回补比例对不上:${text}`).toBeLessThan(0.11)
        }
      }
    }
  })

  it('顶到封顶就写封顶值 —— 摄魂铃零重 30%,九重封在 50%', () => {
    const shehun = artifactDef('af_shehun')! // 凡品 · 削弱 30% 基线
    expect(artifactActiveText(shehun, 0)).toContain(formatPercent(0.3 * artifactQualityMult('mortal')))
    expect(artifactActiveText(shehun, 9), '削弱上限 50%,说明不能再报 51.6%').toContain('50%')
  })

  /**
   * 总盾上限:战斗侧 `gainShield` 把盾钳在 50% 气血。
   * 故障注入:把 effectValuesAt 的 shield 分支改回 `eff.pctMaxHp * mult`(不套 SHIELD_CAP_RATIO),下面四条各自转红。
   */
  it('护盾法宝的说明不越过总盾上限 —— 高祭炼的几件一律报 50%', () => {
    const capped = ['af_benyuanlian', 'af_qinglian', 'af_diquefu', 'af_taixu'].map(id => artifactDef(id)!)
    for (const def of capped) {
      const raw = (def.active.effect as { pctMaxHp: number }).pctMaxHp * artifactQualityMult(def.quality) * (1 + 9 * ARTIFACT_LEVEL_BONUS)
      expect(raw, `${def.name} 九重的原始值就该越过上限,否则这条判据失去对象`).toBeGreaterThan(SHIELD_CAP_RATIO)
      const text = artifactActiveText(def, 9)
      expect(pcts(text)[0], `${def.name} 九重报了 ${pcts(text)[0]}%,战斗里最多只有 ${formatPercent(SHIELD_CAP_RATIO)}`).toBeCloseTo(
        SHIELD_CAP_RATIO * 100,
        1
      )
    }
  })

  it('护盾封顶后「下一重」如实说只涨被动', () => {
    const lian = artifactDef('af_benyuanlian')!
    const gain = artifactNextLevelGain(lian, 8)!
    expect(gain.active!.to).toBeCloseTo(SHIELD_CAP_RATIO, 10)
    expect(gain.active!.capped, '护盾已吃到总盾上限,再炼不会更多').toBe(true)
    expect(gain.passive.length, '但它仍有被动可涨 —— 不能因此说「炼了等于没炼」').toBeGreaterThan(0)
  })

  it('品阶顶到封顶的那几件,零重就写封顶值(祭炼只涨被动)', () => {
    // 神鞭破甲基线 30% × 玄品 ≈1.67,已越过 50% 的顶
    const shenbian = artifactDef('af_shenbian')!
    expect(shenbian.quality, '神鞭若不是高品阶,这条判据就失去对象').not.toBe('mortal')
    expect(artifactActiveText(shenbian, 0), '破甲上限 50%,零重就该报 50%').toContain('50%')
    expect(artifactActiveText(shenbian, 9)).toContain('50%')
    // 净念七成的基线乘上品阶也已越顶:上限九成
    const nianzhu = artifactDef('af_wuxiangzhu')!
    expect(artifactActiveText(nianzhu, 0), '净念上限九成').toContain('九成')
    expect(artifactActiveText(nianzhu, 9)).toContain('九成')
  })

  it('封顶是绝对的:任何品阶 × 任何重数都不越过它 —— 品阶只改变到顶的早晚', () => {
    const capOf: Partial<Record<string, number>> = {
      shield: SHIELD_CAP_RATIO,
      weaken: CAP_WEAKEN,
      sunder: CAP_SUNDER,
      purge: CAP_PURGE,
      drain: CAP_DRAIN_HEAL
    }
    let saturatedAtZero = 0
    for (const a of ARTIFACTS) {
      const cap = capOf[a.active.effect.type]
      if (cap === undefined) continue
      /** 受封顶管的那一笔:吸命封回补,不封伤害 */
      const reach = (lv: number): number => {
        const v = artifactValue(a, lv).active
        return a.active.effect.type === 'drain' ? (v.heal ?? 0) : v.amount
      }
      expect(reach(9), `${a.name} 九重越过了 ${formatPercent(cap)} 的顶`).toBeLessThanOrEqual(cap + 1e-9)
      expect(reach(9), `${a.name} 越炼越小`).toBeGreaterThanOrEqual(reach(0))
      if (reach(0) >= cap - 1e-9) saturatedAtZero += 1
    }
    // 零重就在顶的:神鞭的破甲、神魔镜的回补、无相念珠的净念。
    // 故障注入:把品阶压回凡品,这几件退回「炼到第 N 重才到顶」,本判据转红。
    expect(saturatedAtZero, '一件零重到顶的都没有 —— 这条口径的注脚失去对象').toBeGreaterThan(0)
  })

  it('越界等级钳回 0..9,不会算出界面撑不住的数', () => {
    const a = ARTIFACTS[0]!
    expect(artifactActiveText(a, -3)).toBe(artifactActiveText(a, 0))
    expect(artifactActiveText(a, 99)).toBe(artifactActiveText(a, 9))
  })

  it('祭炼等级不叫「阶」——「阶」是地界与装备层级的词', () => {
    const label = artifactLevelLabel(3)
    expect(label).toContain('祭炼')
    expect(label, `法宝等级不该借用「阶」:${label}`).not.toContain('阶')
    expect(label).toContain('3')
  })
})

/** 下一重逐项(被动、神通主体、吸命回补)须对得上独立复算;不越炼越弱;顶上封顶的标出来 */
describe('法宝说明 · 下一重给多少', () => {
  const sutra = artifactDef('af_shenbian')! // 破甲 30%,上限 50%(玄品:零重已在顶)
  const ling = artifactDef('af_shehun')! // 削弱 30%,上限 50%(凡品:零重未到顶)
  const nianzhu = artifactDef('af_wuxiangzhu')! // 净念 70%,上限 90%
  const qin = artifactDef('af_xianqin')! // 震慑:没有数值
  const drum = artifactDef('af_yunshengu')! // 吸命:伤害 + 回补,回补上限 100%

  it('已至满重就没有「下一重」这一说', () => {
    expect(artifactNextLevelGain(qin, 9)).toBeNull()
    expect(artifactNextLevelGain(qin, 99)).toBeNull()
    expect(artifactNextLevelGain(qin, 8)?.level).toBe(9)
  })

  it('被动逐项与 artifactValue 的下一重值一致', () => {
    for (const level of [0, 4, 8]) {
      const gain = artifactNextLevelGain(sutra, level)!
      const now = artifactValue(sutra, level).passive
      const next = artifactValue(sutra, level + 1).passive
      expect(gain.passive.length).toBe(Object.keys(sutra.passive).length)
      for (const p of gain.passive) {
        expect(p.from).toBeCloseTo(now[p.key] ?? 0, 10)
        expect(p.to).toBeCloseTo(next[p.key] ?? 0, 10)
        expect(p.to, '祭炼不该让被动变小').toBeGreaterThanOrEqual(p.from)
      }
    }
  })

  it('神通主体按封顶报数:摄魂铃零重未到顶,神鞭与净念零重就已在顶', () => {
    const l0 = artifactNextLevelGain(ling, 0)!
    expect(l0.active!.capped, '零重离 50% 的顶还有余量,不该说已至上限').toBe(false)
    const l8 = artifactNextLevelGain(ling, 8)!
    expect(l8.active!.to).toBeCloseTo(CAP_WEAKEN, 10)
    expect(l8.active!.capped, '已经顶到 50% 了,得说清楚再炼也不会更多').toBe(true)
    const s0 = artifactNextLevelGain(sutra, 0)!
    expect(s0.active!.to).toBeCloseTo(CAP_SUNDER, 10)
    expect(s0.active!.capped, '破甲零重就在 50% 的顶上了').toBe(true)
    const n8 = artifactNextLevelGain(nianzhu, 8)!
    expect(n8.active!.to).toBeCloseTo(CAP_PURGE, 10)
    expect(n8.active!.capped).toBe(true)
  })

  it('震慑这类没有数值的神通,如实说「神通不变」', () => {
    const gain = artifactNextLevelGain(qin, 3)!
    expect(gain.active).toBeNull()
    expect(gain.passive.length).toBeGreaterThan(0)
  })

  it('吸命的两笔账都在:伤害继续涨,回补到顶后如实标出来', () => {
    const low = artifactNextLevelGain(drum, 0)!
    expect(low.active!.to).toBeGreaterThan(low.active!.from)
    expect(low.heal).toBeDefined()
    // 灵品 × 1.45 之后是 72%
    expect(low.heal!.capped, '零重还没吃到十成').toBe(false)
    const high = artifactNextLevelGain(drum, 8)!
    expect(high.heal!.to).toBeCloseTo(CAP_DRAIN_HEAL, 10)
    expect(high.heal!.capped, '回补已经吃到十成,再炼也只是伤害在涨').toBe(true)
    expect(high.active!.to, '回补封顶之后,伤害那一侧仍要继续涨').toBeGreaterThan(high.active!.from)
  })
})

describe('法宝效果 · 震慑真打断敌人那一手', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('仙琴每四回合摄神:敌人的出手被掐掉', () => {
    // 打不死彼此,回合数才走得到第 4 回合(法宝每 4 回合出手一次)
    const p = buildPlayerSnap()
    p.attack = gn(1)
    p.defense = gn(1e12)
    p.maxHp = gn(1e12)
    p.artifacts = [{ def: artifactDef('af_xianqin')!, level: 0 }]
    const enemy = makeEnemySnap(enemyDef('e_wolf')!, 1, 1)
    enemy.attack = gn(1)
    enemy.defense = gn(1e12)
    enemy.maxHp = gn(1e12)
    enemy.speed = 1
    let broken = 0
    let proc = 0
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = resolveCombat(p, enemy, seeded(seed))
      const text = result.log.map(l => l.text).join('\n')
      if (text.includes('摄住')) proc += 1
      // 只数敌人被跳过的那一手,不数法宝自己的台词
      broken += result.log.filter(l => l.text.includes('被生生打断')).length
    }
    expect(proc, '20 场里一次震慑都没触发 —— 效果没接上').toBeGreaterThan(0)
    expect(broken, '震慑触发了却没打断任何一手 —— 只是文案').toBeGreaterThan(0)
  })
})

describe('法宝效果 · 破甲真让后续打得更疼', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('神鞭裂甲:同一场对局里,破甲之后回合数更少', () => {
    /** 同一个种子跑两遍:带神鞭那遍从第 4 回合起敌人防御降三成,结束得更早 */
    const withSunder = (): { rounds: number; text: string } => {
      const p = buildPlayerSnap()
      p.mods = {}
      p.attack = gn(1e6)
      p.defense = gn(1e12)
      p.maxHp = gn(1e12)
      p.artifacts = [{ def: artifactDef('af_shenbian')!, level: 0 }]
      const enemy = tankyWolf()
      const result = resolveCombat(p, enemy, seeded(11))
      return { rounds: result.rounds, text: result.log.map(l => l.text).join('\n') }
    }
    const without = (): number => {
      const p = buildPlayerSnap()
      p.mods = {}
      p.attack = gn(1e6)
      p.defense = gn(1e12)
      p.maxHp = gn(1e12)
      p.artifacts = []
      const enemy = tankyWolf()
      return resolveCombat(p, enemy, seeded(11)).rounds
    }
    const a = withSunder()
    const b = without()
    expect(a.text, '破甲的台词没出现 —— 效果没接上').toContain('护体被撕开')
    expect(a.rounds, `带破甲 ${a.rounds} 回合,不带 ${b} 回合 —— 破甲没有让敌人更好打`).toBeLessThan(b)
  })
})

/** 必定摄魂、打不死人的靶子:技能率 100% 且带 stun(引擎里 stun 还要再过 50% 那一掷) */
function stunningFoe(): ReturnType<typeof makeEnemySnap> {
  const snap = makeEnemySnap(enemyDef('e_wolf')!, 1, 1)
  snap.name = '摄魂靶子'
  snap.skills = [{ name: '摄魂', mult: 1, rate: 1, effect: 'stun' }]
  snap.attack = gn(1)
  snap.defense = gn(1e12)
  snap.maxHp = gn(1e12)
  snap.speed = 1
  snap.mods = {}
  return snap
}

function stunnedTurnsAgainst(withPurge: boolean, seed: number): number {
  const p = buildPlayerSnap()
  p.mods = {}
  p.attack = gn(1)
  p.defense = gn(1e12)
  p.maxHp = gn(1e12)
  p.artifacts = withPurge ? [{ def: artifactDef('af_wuxiangzhu')!, level: 0 }] : []
  return resolveCombat(p, stunningFoe(), seeded(seed)).stats!.player.stunnedTurns
}

describe('法宝效果 · 净念真能挣脱震慑', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('同一批种子:带无相念珠,被震慑跳过的回合明显更少', () => {
    let bare = 0
    let withPurge = 0
    for (let seed = 1; seed <= 30; seed += 1) {
      bare += stunnedTurnsAgainst(false, seed)
      withPurge += stunnedTurnsAgainst(true, seed)
    }
    expect(bare, '靶子根本没摄住人,这条判据失去对象').toBeGreaterThan(0)
    expect(
      withPurge,
      `30 场累计被跳过 ${withPurge} 回合,不带念珠是 ${bare} 回合 —— 净念没有让任何一手打出来`
    ).toBeLessThan(bare)
    console.log(`\n必摄魂靶子 × 30 场:不带念珠被跳过 ${bare} 回合,带念珠 ${withPurge} 回合`)
  })

  it('挣脱是真的发生:日志里留下「散于无形」,且不占出手节拍', () => {
    const withPearls = (foe: ReturnType<typeof makeEnemySnap>, seed: number): ReturnType<typeof resolveCombat> => {
      const p = buildPlayerSnap()
      p.mods = {}
      p.attack = gn(1)
      p.defense = gn(1e12)
      p.maxHp = gn(1e12)
      p.artifacts = [{ def: artifactDef('af_wuxiangzhu')!, level: 0 }]
      return resolveCombat(p, foe, seeded(seed))
    }
    const fight = withPearls(stunningFoe(), 7)
    const text = fight.log.map(l => l.text).join('\n')
    expect(text, '念珠一次的台词都没出现 —— 挣脱没接上').toContain('摄魂之力散于无形')
    // 随身被动:对手不摄魂时一次都不该"出手"(删掉 combat 里那句 purge 跳过,它会每回合掉进 weaken 分支)
    const noStun = withPearls(tankyWolf(), 7)
    expect(
      noStun.stats!.player.artifactProcs,
      `对手不摄魂,念珠却"触发"了 ${noStun.stats!.player.artifactProcs} 次 —— 随身被动被当成每回合出手了`
    ).toBe(0)
  })
})

/** 故障注入:删掉 combat 里 drain 那条分支(掉进 else 的 weaken 分支),本用例红。 */
describe('法宝效果 · 吸命真把伤害补回自己身上', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 打得疼你但打不死你的靶子 */
  function bleedingFoe(): ReturnType<typeof makeEnemySnap> {
    const foe = tankyWolf()
    foe.attack = gn(3e5)
    return foe
  }

  function fight(withDrain: boolean, seed: number): ReturnType<typeof resolveCombat> {
    const p = buildPlayerSnap()
    p.mods = {}
    p.attack = gn(1e6)
    p.defense = gn(1e6)
    p.maxHp = gn(1e9)
    p.artifacts = withDrain ? [{ def: artifactDef('af_xuanxu')!, level: 0 }] : []
    return resolveCombat(p, bleedingFoe(), seeded(seed))
  }

  it('带玄虚拂尘的那一场,自己回的血更多,日志里留得下「吸取敌手精血」', () => {
    let withDrain = 0
    let bare = 0
    let sawLine = 0
    for (let seed = 1; seed <= 12; seed += 1) {
      const a = fight(true, seed)
      const b = fight(false, seed)
      if (a.log.map(l => l.text).join('\n').includes('吸取敌手精血')) sawLine += 1
      withDrain += toNum(a.stats!.player.healed)
      bare += toNum(b.stats!.player.healed)
    }
    expect(sawLine, '12 场里一次吸命都没触发 —— 效果没接上').toBeGreaterThan(0)
    expect(
      withDrain,
      `12 场累计回血:带拂尘 ${withDrain.toExponential(2)},不带 ${bare.toExponential(2)} —— 吸命没有把伤害补回来`
    ).toBeGreaterThan(bare)
  })
})

/**
 * 持续减益同类叠加取强不取新(同破甲的 `Math.max`):只对调佩带顺序,承伤须一模一样。
 * 故障注入:把 weaken 改回 `foe.weaken = values.amount`,判据必红。
 */
describe('法宝效果 · 削弱取强不取新,与佩带顺序无关', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 打得疼你但打不死你的靶子 */
  function heavyFoe(): ReturnType<typeof makeEnemySnap> {
    const foe = tankyWolf()
    foe.attack = gn(4e5)
    return foe
  }

  function takenWith(order: [string, string], seed: number): number {
    const p = buildPlayerSnap()
    p.mods = {}
    p.attack = gn(1)
    p.defense = gn(1e9)
    p.maxHp = gn(1e12)
    p.artifacts = order.map(id => ({ def: artifactDef(id)!, level: 0 }))
    return toNum(resolveCombat(p, heavyFoe(), seeded(seed)).stats!.player.taken)
  }

  it('缚妖索(20%)与摄魂铃(30%)对调佩带顺序,承伤分毫不差', () => {
    const strongFirst = ['af_shehun', 'af_fuyao'] as [string, string] // 30% 在前
    const weakFirst = ['af_fuyao', 'af_shehun'] as [string, string] // 20% 在前
    let strongSum = 0
    let weakSum = 0
    for (let seed = 1; seed <= 20; seed += 1) {
      strongSum += takenWith(strongFirst, seed)
      weakSum += takenWith(weakFirst, seed)
    }
    expect(strongSum, '20 场一次伤害都没吃到,这条判据失去对象').toBeGreaterThan(0)
    expect(
      weakSum,
      `20 场累计承伤:强在前 ${strongSum.toExponential(3)},弱在前 ${weakSum.toExponential(3)} —— ` +
        `顺序把削弱强度改写了,末位那件说了算`
    ).toBeCloseTo(strongSum, 6)
  })

  it('两件削弱同佩,拿到的就是更强的那一份 —— 不比只带强件更差(弱件在后)', () => {
    let onlyStrong = 0
    let both = 0
    for (let seed = 1; seed <= 20; seed += 1) {
      const withOnlyStrong = (() => {
        const p = buildPlayerSnap()
        p.mods = {}
        p.attack = gn(1)
        p.defense = gn(1e9)
        p.maxHp = gn(1e12)
        p.artifacts = [{ def: artifactDef('af_shehun')!, level: 0 }]
        return toNum(resolveCombat(p, heavyFoe(), seeded(seed)).stats!.player.taken)
      })()
      onlyStrong += withOnlyStrong
      // 弱件在后:削弱若是赋值,末位就把 30% 顶回 20%
      both += takenWith(['af_shehun', 'af_fuyao'], seed)
    }
    expect(onlyStrong, '只带摄魂铃的对照组一场都没吃到伤害,判据失去对象').toBeGreaterThan(0)
    expect(
      both,
      `补上更弱的缚妖索之后承伤反而变了(单带 ${onlyStrong.toExponential(3)} → 双带 ${both.toExponential(3)}) —— 弱件顶掉了强件`
    ).toBeCloseTo(onlyStrong, 6)
  })
})
