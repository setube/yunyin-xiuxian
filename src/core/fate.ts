/**
 * 命格(Phase 34.4)—— 紫微十二宫的一世之格
 *
 * 与问卦的分工写在 data/ziwei 里:卦是一时之机,命是一世之格。
 * 故命格**不落状态、不耗资源、不给时限**:它由灵根与转世数确定性推出来
 * (同一个人同一世,算多少次都是同一张命盘;转世则重算)。
 *
 * 再说一次:这不是排盘。真紫微斗数要以生辰起五行局再安紫微诸星,
 * 游戏内没有生辰 —— 此处按灵根与轮回归属安星,取的是十二宫与十四主星的象义。
 */
import type { LinggenProfile, StatMods } from '@/types'
import { PALACES, STARS, type PalaceDef, type StarDef } from '@/data/ziwei'
import { STAR_FOCUS_MULT } from '@/data/constants'
import { mulberry32 } from '@/utils/random'
import { mergeMods } from './statsCalc'

export interface FatePalace {
  palace: PalaceDef
  /** 此宫所落主星(可能有两颗) */
  stars: StarDef[]
}

export interface FateChart {
  /** 命宫主星 —— 一世之格的题眼 */
  lord: StarDef
  palaces: FatePalace[]
}

/**
 * 由灵根与轮回归属安星。
 *
 * 灵根取五行之多寡为序,转世数决定起星之位 —— 故同灵根者不必同命,
 * 而灵根一变(转世重掷)命盘必变。
 */
export function fateSeed(linggen: LinggenProfile | null | undefined, lifeCount: number): number {
  const roots = linggen?.roots ?? []
  // 用资质(30~100)而非比例:SpiritRoot 只有 element/aptitude,且灵的次序本身有意义
  const rootPart = roots.reduce((acc, r, i) => acc + (Number.isFinite(r.aptitude) ? r.aptitude : 0) * (i + 1), 0)
  const countPart = Math.max(0, Math.floor(lifeCount)) * 1_000_003
  return Math.floor(rootPart * 7919) + countPart + roots.length * 13 + 1
}

/**
 * 安星:命宫起于所定之位,十四主星依序布入十二宫。
 * 十四星入十二宫,故有两宫各得二星 —— 不取吉凶四化,只取星性。
 */
export function fateChart(seed: number): FateChart {
  const rand = mulberry32(seed)
  const start = Math.floor(rand() * PALACES.length)
  const offset = Math.floor(rand() * STARS.length)
  const palaces: FatePalace[] = PALACES.map(palace => ({ palace, stars: [] as StarDef[] }))

  // 十四主星布十二宫:各宫先得一星(计十二),余下两星归命宫与迁移宫(命宫之对宫)——
  // 十四入十二,必有两宫得双星;取其"本命与所对",不作吉凶判断
  const order = STARS.map((_, i) => STARS[(i + offset) % STARS.length]!)
  let k = 0
  for (let i = 0; i < PALACES.length; i += 1) {
    palaces[(start + i) % PALACES.length]!.stars.push(order[k++]!)
  }
  for (const idx of [0, 6]) {
    palaces[idx]!.stars.push(order[k++]!)
  }

  const lord = palaces.find(p => p.palace.id === 'ming')?.stars[0] ?? STARS[0]!
  return { lord, palaces }
}

/** 一世之格:十二宫各星之力相合(数值刻意低,命是底色) */
export function fateMods(chart: FateChart): StatMods {
  return mergeMods(chart.palaces.flatMap(p => p.stars.map(s => s.mods)))
}

/**
 * 点化主星(Phase A-1):择一主星显化。
 *
 * 命格本是把十四颗星全加的**常数**(见 fateMods)—— 同人同世谁看都一样,
 * 玩家对它没有任何选择、任何 sink。这里给它一个主动动词:把选中的主星之力
 * 放大 STAR_FOCUS_MULT,其余十三颗维持原值。
 *
 * 不变式逐一守住:
 * - 14 颗仍一颗不落布满(fateChart 不动,本函数只读图作放大);
 * - 确定性:focusStarId 是存档状态,不是随机 —— 同人同世同 focus 必同果;
 * - 单通道 <0.2:单颗主星至多 0.03,×2 后 0.06,与他星同通道相加仍远低于上限。
 *
 * focusStarId 认不出的(id 不在命盘/已损坏)按无焦点处理:不放大、不报错、不放大某通道。
 */
export function fateFocusMods(chart: FateChart, focusStarId: string | null): StatMods {
  const exists = focusStarId !== null && chart.palaces.some(p => p.stars.some(s => s.id === focusStarId))
  // 未点化(null)或认不出的 focus:就是常数底色本身,直接复用 fateMods
  if (!exists) return fateMods(chart)
  const parts: StatMods[] = []
  for (const palace of chart.palaces) {
    for (const star of palace.stars) {
      const m: StatMods = {}
      const mult = star.id === focusStarId ? STAR_FOCUS_MULT : 1
      for (const k of Object.keys(star.mods) as (keyof StatMods)[]) m[k] = (star.mods[k] ?? 0) * mult
      parts.push(m)
    }
  }
  return mergeMods(parts)
}

/** 命宫所落之星(展示用):题眼与同宫者 */
export function fateLordLine(chart: FateChart): string {
  const mine = chart.palaces.find(p => p.palace.id === 'ming')!
  const names = mine.stars.map(s => `${s.name}(${s.nature})`).join('、')
  return `命宫落${names} —— ${mine.stars[0]!.gist}`
}

