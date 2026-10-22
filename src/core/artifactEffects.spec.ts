/* eslint-disable no-console -- 净念一例是"多少回合被救回来"的读数,打印出来便于复核 */
/**
 * 法宝效果的三个承诺 —— 词汇表不虚设,震慑真打断,净念真能挣脱
 *
 * 一、**声明即承诺**:ArtifactEffect 联合里写下的每种效果,都得有法宝在用。
 *     高界法宝此前一律是 damage/heal/shield/weaken 四种的数值放大(32 件里没有
 *     一件是别的手艺),于是「更高境界的法宝」只是打得更疼 —— 与「纯数值阶梯」
 *     是同一个毛病。本轮新增 { type: 'stun' },这条判据守着它别成为一纸空文。
 *
 * 二、**效果要真的发生**:震慑不是文案 —— 它在敌人该出手时把那一手掐掉。
 *     故这里真打一场(仙琴每 4 回合摄神),数敌人的「被打断回合」。
 *
 * 三、**防身型效果也要真的发生**:{ type: 'purge' } 是第一条「我扛得住你的阴招」。
 *     此前玩家对震慑毫无还手之力:十三种敌人会摄魂,中了白丢一回合,而战后分析
 *     只会说「N 个回合被震慑打断,节奏尽失」。故这里放一只必摄魂的敌人,
 *     同一批种子跑两遍(带/不带无相念珠),数玩家自己被跳过的回合数。
 *
 * 故障注入:把仙琴的 stun 换回 weaken、把 tryStun 的挣脱判定掏空,对应判据即红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ARTIFACTS,
  ARTIFACT_DRAIN_HEAL_CAP,
  ARTIFACT_LEVEL_BONUS,
  ARTIFACT_PURGE_CAP,
  ARTIFACT_SUNDER_CAP,
  ARTIFACT_WEAKEN_CAP,
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

/**
 * 一只「厚甲但打不死人」的靶子:防御让减伤落在五成上下(不是被上限压死),
 * 气血够厚到能撑过十个回合 —— 这样破甲带来的有效伤害提升才量得出来。
 */
function tankyWolf(): ReturnType<typeof makeEnemySnap> {
  const snap = makeEnemySnap(enemyDef('e_wolf')!, 1, 1)
  snap.attack = gn(1)
  snap.defense = mulN(gn(1e6), MITIGATION_K) // 减伤 ≈ 50%
  snap.maxHp = gn(6e6)
  snap.speed = 1
  snap.mods = {}
  return snap
}

/** 从类型声明里扫出 ArtifactEffect 的判别值 —— 手写联合,只能扫源码 */
function effectTypesFromTypes(): string[] {
  const src = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf8')
  const start = src.indexOf('export type ArtifactEffect =')
  expect(start, 'types/index.ts 里找不到 ArtifactEffect').toBeGreaterThanOrEqual(0)
  const block = src.slice(start, src.indexOf('export interface ArtifactDef', start))
  return [...new Set([...block.matchAll(/type:\s*'([a-z]+)'/g)].map(m => m[1]!))]
}

describe('法宝效果 · 词汇表不虚设', () => {
  it('每一种声明过的效果,都至少有一件法宝在用', () => {
    const declared = effectTypesFromTypes()
    expect(declared.length, '一种效果都没扫到,断言形同虚设').toBeGreaterThanOrEqual(4)
    const used = new Set(ARTIFACTS.map(a => a.active.effect.type))
    const dead = declared.filter(t => !used.has(t as (typeof ARTIFACTS)[number]['active']['effect']['type']))
    expect(dead, `这些效果声明了却没有任何法宝用它 —— 写了不用等于没写:${dead.join('、')}`).toEqual([])
  })

  it('高界法宝里不止是数值放大:至少有一件用的是别的手艺', () => {
    // 「高界法宝」泛指 fromTier ≥ 21 的那批(仙界/神界/混沌海)
    const high = ARTIFACTS.filter(a => a.fromTier >= 21)
    expect(high.length, '高界法宝一件都没有,判据失去对象').toBeGreaterThan(4)
    // 基础四效 = 打/回/盾/削:高界若全在这四样里按倍率放大,那就是纯数值阶梯
    const BASIC = ['damage', 'heal', 'shield', 'weaken']
    const beyondBasic = high.filter(a => !BASIC.includes(a.active.effect.type))
    expect(
      beyondBasic.length,
      `高界 ${high.length} 件法宝全在「打/回/盾/削」四样里按倍率放大 —— 境界涨了,手艺没涨`
    ).toBeGreaterThan(0)
  })

  /**
   * 文案里写的回合数,必须就是它真的出手的节拍。
   *
   * 法宝的主动说明是手写的(「每 4 回合青莲护身…」),而节拍写在 `active.interval` 里。
   * 两处各写各的,改一处忘另一处不会有任何报错 —— 玩家照着文案数回合,发现对不上,
   * 却没有任何地方能告诉他哪个是对的。故这里把「每 N 回合」与 interval 钉在一起。
   *
   * 唯一的例外是净念(无相念珠):它是随身被动,不走节拍(interval 记 1 表「常在」,
   * 见 types 里 ArtifactEffect.purge 的注释),文案也刻意不写回合数。
   */
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

  /**
   * 说明里的**数值**也必须等于数据里的数值。
   *
   * 与上一条同源:主动说明是手写的(「每 4 回合获得 32% 生命护盾」「造成 260% 攻击伤害」
   * 「其攻击降低 20%」),而真正的账在 effect 里(pctMaxHp / mult / pct)。
   * 手写的数字不会自己跟着数据走 —— 改数据忘改文案,玩家就会按错的数去配装。
   *
   * 例外:净念写的是「七成」(中文成数),单独换算。
   */
  it('说明里写的数值 = 数据里的数值', () => {
    const CN: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const bad: string[] = []
    let checkedCount = 0
    for (const a of ARTIFACTS) {
      const eff = a.active.effect
      const desc = a.active.desc
      /** 说明里写的百分比(数值主体) */
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
      /** 数据里写的百分比 */
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
      // 浮点比较留一点余量(0.1 的倍数级别)
      if (Math.abs(claimed - actual) > 0.01) {
        bad.push(`${a.name}:说明写 ${claimed}%,数据是 ${actual}%`)
      }
      // 吸命还有第二个数:回复占比(`healPct`)也要与「回复其中 N%」对得上
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
 * 品阶与祭炼之后,说明得跟着说实话。
 *
 * 上一条对账只比「基线文案」与「基线数值」—— 而表里的数写的是**凡品零重基线**:
 * 玩家手里那件还带着自己的品阶(凡 1.0 → 神 ≈3.08,见 ARTIFACT_QUALITY_EXP),
 * 再炼到九重(×1.72)。战斗一直按这两条倍率算,卡片上印的却永远是基线那句:
 * 实测玄虚拂尘写着「造成 230% 攻击伤害」,真打出去是 395.6%;神鞭写着「防御降低 30%」,
 * 实际早已顶到 50% 的上限。故说明改成由 artifactValue 现算(战斗与文案读同一个函数),
 * 这里守住三件事:措辞不动、数值随品阶与祭炼走、封顶到了要写封顶值。
 */
describe('法宝说明 · 数字随品阶与祭炼等级走', () => {
  /** 把一件法宝压回「凡品」—— desc 说的就是这个基线,不是任意一件的零重 */
  const asMortal = (a: (typeof ARTIFACTS)[number]) => ({ ...a, quality: 'mortal' as const })

  /** 期望值独立复算:从原始 effect 字段 + 品阶倍率 + 祭炼增幅 + 封顶推出来,不复用被测函数 */
  function expected(def: (typeof ARTIFACTS)[number], level: number): { main: number | null; heal?: number } {
    const eff = def.active.effect
    const mult = artifactQualityMult(def.quality) * (1 + level * ARTIFACT_LEVEL_BONUS)
    switch (eff.type) {
      case 'damage':
        return { main: eff.mult * mult }
      case 'drain':
        return { main: eff.mult * mult, heal: Math.min(ARTIFACT_DRAIN_HEAL_CAP, eff.healPct * mult) }
      case 'heal':
        return { main: eff.pctMaxHp * mult }
      case 'shield':
        // 护盾单次给的那一份也受总盾上限约束(战斗侧 gainShield 钳在 SHIELD_CAP_RATIO)
        return { main: Math.min(SHIELD_CAP_RATIO, eff.pctMaxHp * mult) }
      case 'weaken':
        return { main: Math.min(ARTIFACT_WEAKEN_CAP, eff.pct * mult) }
      case 'sunder':
        return { main: Math.min(ARTIFACT_SUNDER_CAP, eff.pct * mult) }
      case 'purge':
        return { main: Math.min(ARTIFACT_PURGE_CAP, eff.pct * mult) }
      case 'stun':
        return { main: null }
    }
  }

  const pcts = (text: string): number[] => [...text.matchAll(/([\d.]+)\s*%/g)].map(m => Number(m[1]))
  /** 中文成数换算(净念写的是「七成」,不比百分号) */
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
        // 小数位由 formatPercent 决定,故比对到一位小数
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
   * 护盾也有一条**总盾上限** —— 战斗侧 `gainShield` 把盾钳在 50% 气血。
   *
   * 这一条从前漏在封顶名单外:`effectValuesAt` 的 shield 分支只乘倍率,
   * 于是本源莲台(仙品)九重报 76.2%、混沌青莲 69.5%、帝阙神符 69.1%、
   * 太虚镜 61.5% —— 真打出去最多 50%,卡片、图鉴、法宝谱三处一起撒谎。
   *
   * 故障注入:把 shield 分支改回 `eff.pctMaxHp * mult`(不套 SHIELD_CAP_RATIO),
   * 下面四条各自转红。
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
    // 神鞭的破甲基线是 30%,乘上它的品阶(玄品 ≈1.67)已经越过 50% 的顶
    const shenbian = artifactDef('af_shenbian')!
    expect(shenbian.quality, '神鞭若不是高品阶,这条判据就失去对象').not.toBe('mortal')
    expect(artifactActiveText(shenbian, 0), '破甲上限 50%,零重就该报 50%').toContain('50%')
    expect(artifactActiveText(shenbian, 9)).toContain('50%')
    // 净念七成的基线乘上品阶也已越顶:上限九成,留一丝「摄魂也不是吃素的」
    const nianzhu = artifactDef('af_wuxiangzhu')!
    expect(artifactActiveText(nianzhu, 0), '净念上限九成').toContain('九成')
    expect(artifactActiveText(nianzhu, 9)).toContain('九成')
  })

  it('封顶是绝对的:任何品阶 × 任何重数都不越过它 —— 品阶只改变到顶的早晚', () => {
    const capOf: Partial<Record<string, number>> = {
      shield: SHIELD_CAP_RATIO,
      weaken: ARTIFACT_WEAKEN_CAP,
      sunder: ARTIFACT_SUNDER_CAP,
      purge: ARTIFACT_PURGE_CAP,
      drain: ARTIFACT_DRAIN_HEAL_CAP
    }
    let saturatedAtZero = 0
    for (const a of ARTIFACTS) {
      const cap = capOf[a.active.effect.type]
      if (cap === undefined) continue
      /** 受封顶管的那一笔(吸命的伤害那一侧本来就不封顶,封的是回补) */
      const reach = (lv: number): number => {
        const v = artifactValue(a, lv).active
        return a.active.effect.type === 'drain' ? (v.heal ?? 0) : v.amount
      }
      expect(reach(9), `${a.name} 九重越过了 ${formatPercent(cap)} 的顶`).toBeLessThanOrEqual(cap + 1e-9)
      expect(reach(9), `${a.name} 越炼越小`).toBeGreaterThanOrEqual(reach(0))
      if (reach(0) >= cap - 1e-9) saturatedAtZero += 1
    }
    // 高品阶的那几件零重就在顶(神鞭的破甲、神魔镜的回补、无相念珠的净念)——
    // 这是设计:品阶买的是「更早到顶」,不是「更高的顶」。故障注入:把品阶压回凡品,
    // 这几件会各自退回「炼到第 N 重才到顶」,本判据随之转红。
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

/**
 * 祭炼下一重的账 —— 「值不值」要在按下之前答得出来。
 *
 * 炼化按钮原先只报代价(悟道点 × 灵石),收益留给玩家自己按 ×1.08 心算。
 * 这里把下一重逐项算好(被动、神通主体、吸命回补),顶上封顶的标出来 ——
 * 判据是**逐项对得上独立复算**,且不会出现「越炼越弱」或「到顶还劝你炼」。
 */
describe('法宝说明 · 下一重给多少', () => {
  const sutra = artifactDef('af_shenbian')! // 破甲 30%,有 50% 上限(玄品:零重就已经在顶)
  const ling = artifactDef('af_shehun')! // 削弱 30%,有 50% 上限(凡品:零重 30%,炼得上去)
  const nianzhu = artifactDef('af_wuxiangzhu')! // 净念 70%,有 90% 上限
  const qin = artifactDef('af_xianqin')! // 震慑:没有数值
  const drum = artifactDef('af_yunshengu')! // 吸命:伤害 + 回补,回补有 100% 上限

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
    expect(l8.active!.to).toBeCloseTo(ARTIFACT_WEAKEN_CAP, 10)
    expect(l8.active!.capped, '已经顶到 50% 了,得说清楚再炼也不会更多').toBe(true)
    const s0 = artifactNextLevelGain(sutra, 0)!
    expect(s0.active!.to).toBeCloseTo(ARTIFACT_SUNDER_CAP, 10)
    expect(s0.active!.capped, '破甲零重就在 50% 的顶上了').toBe(true)
    const n8 = artifactNextLevelGain(nianzhu, 8)!
    expect(n8.active!.to).toBeCloseTo(ARTIFACT_PURGE_CAP, 10)
    expect(n8.active!.capped).toBe(true)
  })

  it('震慑这类没有数值的神通,如实说「不随祭炼变」', () => {
    const gain = artifactNextLevelGain(qin, 3)!
    expect(gain.active).toBeNull()
    // 但它仍有被动可涨 —— 否则这件法宝炼了等于没炼,那是另一个 bug
    expect(gain.passive.length).toBeGreaterThan(0)
  })

  it('吸命的两笔账都在:伤害继续涨,回补到顶后如实标出来', () => {
    const low = artifactNextLevelGain(drum, 0)!
    expect(low.active!.to).toBeGreaterThan(low.active!.from)
    expect(low.heal).toBeDefined()
    // 灵品 × 1.45 之后是 72%,离十成的顶还有余量
    expect(low.heal!.capped, '零重还没吃到十成').toBe(false)
    const high = artifactNextLevelGain(drum, 8)!
    expect(high.heal!.to).toBeCloseTo(ARTIFACT_DRAIN_HEAL_CAP, 10)
    expect(high.heal!.capped, '回补已经吃到十成,再炼也只是伤害在涨').toBe(true)
    expect(high.active!.to, '回补封顶之后,伤害那一侧仍要继续涨').toBeGreaterThan(high.active!.from)
  })
})

describe('法宝效果 · 震慑真打断敌人那一手', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('仙琴每四回合摄神:敌人的出手被掐掉', () => {
    // 造一场「打不死彼此」的仗,好让回合数走到第 4 回合(法宝每 4 回合出手一次)
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
      // 真正算数的是**敌人的那一手被跳过**那一条(只数法宝自己的台词等于没验)
      broken += result.log.filter(l => l.text.includes('被生生打断')).length
    }
    expect(proc, '20 场里一次震慑都没触发 —— 效果没接上').toBeGreaterThan(0)
    expect(broken, '震慑触发了却没打断任何一手 —— 只是文案').toBeGreaterThan(0)
  })
})

describe('法宝效果 · 破甲真让后续打得更疼', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('神鞭裂甲:同一场对局里,破甲之后回合数更少', () => {
    /**
     * 造一对「防御很厚、彼此都打不死」的对手,让破甲的效果能被量出来:
     * 同一个种子跑两遍 —— 带神鞭的那一遍从第 4 回合起敌人的防御降三成,
     * 于是同样的伤害掷点打出更高的有效伤害,结束得更早。
     */
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

/**
 * 一只「必定摄魂、但打不死人」的靶子:e_hog 的技能率拉到 100% 且带 stun,
 * 于是玩家每回合都有约一半的机会被震慑(引擎里 stun 还要再过 50% 那一掷)。
 * 攻击与气血都调成打不死彼此 —— 量的是「被跳过多少个回合」,不是谁赢。
 */
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

/** 打一场「打不死彼此」的对局,返回玩家被震慑跳过的回合数 */
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
    // 它是随身被动:对手不摄魂时,它一次都不该"出手"
    // (若有人把 combat 里那句 purge 跳过删掉,它就会每回合掉进 weaken 分支刷满触发)
    const noStun = withPearls(tankyWolf(), 7)
    expect(
      noStun.stats!.player.artifactProcs,
      `对手不摄魂,念珠却"触发"了 ${noStun.stats!.player.artifactProcs} 次 —— 随身被动被当成每回合出手了`
    ).toBe(0)
  })
})

/**
 * 吸命(drain)—— 高界法宝的第五种手艺:**打的与回的,是同一件事**。
 *
 * 此前高界法宝的续航全是「回复 N% 生命」(与输出各占一件),故一个法宝位永远要在
 * 「打得更疼」与「活得久一点」之间二选一。吸命让一份伤害同时办两件事,
 * 于是「带哪一件」这个问题在高界多出一种答案。
 *
 * 这里量的是真发生:同一批种子、同一只靶子,带拂尘的那一场回的血更多,
 * 且日志里留得下「吸取敌手精血」那一条。故障注入:把 combat 里 drain 那条分支
 * 删掉,它就掉进 else 的 weaken 分支 —— 回血不见了,判据立刻红。
 */
describe('法宝效果 · 吸命真把伤害补回自己身上', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 一只打得疼你但打不死你的靶子:好让"回血"这件事有量可量 */
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
 * 削弱(weaken)—— 与破甲并列的第二种「本场余下回合持续」的减益。
 *
 * 持续减益一旦落在对手身上就**从不回落**,故同类叠加只能取强不取新。
 * 破甲一直是这么做的(`Math.max`),削弱却长期是**直接赋值** ——
 * 于是两个法宝位各带一件削弱时,出手顺序决定谁说了算:缚妖索(20%)排在
 * 摄魂铃(30%)之后,末了一赋值就把 30% 顶回 20%,玩家把更强的法宝换上第二个位,
 * 反而削得更少。这里量的正是那条**与顺序无关**的不变式:
 * 同一对法宝、同一批种子,只把佩带顺序对调,玩家承伤必须一模一样。
 *
 * 故障注入:把 weaken 改回 `foe.weaken = values.amount`,`弱在前`那一组的承伤
 * 会立刻高于`强在前` —— 判据必红。
 */
describe('法宝效果 · 削弱取强不取新,与佩带顺序无关', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 一只「打得疼你但打不死你」的靶子:好让削弱带来的减伤有量可量 */
  function heavyFoe(): ReturnType<typeof makeEnemySnap> {
    const foe = tankyWolf()
    foe.attack = gn(4e5)
    return foe
  }

  /** 按给定佩带顺序打一场,返回玩家这一场承伤 */
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
      // 弱件排在后面:若削弱是赋值,末位就把 30% 顶回 20%,这一组立刻变差
      both += takenWith(['af_shehun', 'af_fuyao'], seed)
    }
    expect(onlyStrong, '只带摄魂铃的对照组一场都没吃到伤害,判据失去对象').toBeGreaterThan(0)
    expect(
      both,
      `补上更弱的缚妖索之后承伤反而变了(单带 ${onlyStrong.toExponential(3)} → 双带 ${both.toExponential(3)}) —— 弱件顶掉了强件`
    ).toBeCloseTo(onlyStrong, 6)
  })
})
