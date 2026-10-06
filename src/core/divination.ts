/**
 * 问卦(Phase 34.3)—— 周易的门从"可读"走到"可用"
 *
 * 摇卦之法用最简的三钱法:每爻掷三枚,背为阳(三)、字为阴(二),
 * 合数 9 为老阳(变)、8 为少阴、7 为少阳、6 为老阴(变)。
 * 六爻自下而上成卦:下三爻为内卦(己身),上三爻为外卦(境遇)。
 *
 * 为什么效果由上下卦推出,而不是给 64 卦各写一套数值:
 * 手写 64 套数值必然与卦义打架(且没人能同时校对 64 条)。
 * 卦义本身就说清了"内外相济"—— 故一卦之力 = 下卦(己身) + 上卦(境遇),
 * 数值只写在八卦上(8 处,可校),重卦由象数自然得出。
 *
 * 变爻:老阳老阴为"动",动则变,变则成之卦。动得越多,事越促 ——
 * 卦力更盛而更短;六爻不动为静卦,力缓而久。
 */
import type { AnyStatKey, StatMods } from '@/types'
import { RandomService, rng } from '@/utils/random'
import { mergeMods } from './statsCalc'
import { hexagramOf, trigramDef, trigramOfLines, type HexagramDef, type TrigramDef, type TrigramId } from '@/data/yijing'

/** 问卦耗悟道点 / 动爻换挡 —— 真值在 data,这里导入并再导出,保持既有公共 API 同时供本模块 tierOf 使用 */
import { DIVINATION_COST } from '@/data/constants'
import { CHANGING_TIERS } from '@/data/yijing'
export { DIVINATION_COST, CHANGING_TIERS }

export interface HexagramReading {
  /** 本卦 */
  hexagram: HexagramDef
  upper: TrigramDef
  lower: TrigramDef
  /** 之卦(六爻不动时为 null) */
  changed: HexagramDef | null
  /** 动爻数 0~6 */
  changing: number
  /** 各爻自下而上(1 阳 / 0 阴),用于展示卦画 */
  lines: number[]
  /** 动爻位置(自下而上,1~6) */
  changingAt: number[]
}

/**
 * 摇卦:三钱六爻。rand 可注入,故同一序列必得同一卦(验收与模拟都要这个性质)。
 */
export function castLines(rand: RandomService = rng): { lines: number[]; changingAt: number[] } {
  const lines: number[] = []
  const changingAt: number[] = []
  for (let i = 0; i < 6; i += 1) {
    // 每爻三枚:背(阳)计 1,字(阴)计 0
    let backs = 0
    for (let c = 0; c < 3; c += 1) if (rand.chance(0.5)) backs += 1
    // 三钱:三背为老阳(变),二背为少阴,一背为少阳,零背为老阴(变)
    const old = backs === 3 || backs === 0
    const yang = backs >= 2
    lines.push(yang ? 1 : 0)
    if (old) changingAt.push(i + 1)
  }
  return { lines, changingAt }
}

/** 由六爻成卦:下三爻为内卦,上三爻为外卦 */
export function readingOfLines(lines: number[], changingAt: number[]): HexagramReading | null {
  if (lines.length !== 6) return null
  const lower = trigramOfLines([lines[0]!, lines[1]!, lines[2]!])
  const upper = trigramOfLines([lines[3]!, lines[4]!, lines[5]!])
  if (!lower || !upper) return null
  const hexagram = hexagramOf(upper.id, lower.id)
  if (!hexagram) return null
  let changed: HexagramDef | null = null
  if (changingAt.length > 0) {
    // 动爻反向,即成之卦
    const flipped = lines.map((v, i) => (changingAt.includes(i + 1) ? (v ? 0 : 1) : v))
    const cl = trigramOfLines([flipped[0]!, flipped[1]!, flipped[2]!])
    const cu = trigramOfLines([flipped[3]!, flipped[4]!, flipped[5]!])
    changed = cl && cu ? (hexagramOf(cu.id, cl.id) ?? null) : null
  }
  return { hexagram, upper, lower, changed, changing: changingAt.length, lines, changingAt }
}

/** 摇一卦(纯函数,不消耗、不落状态) */
export function drawHexagram(rand: RandomService = rng): HexagramReading {
  const { lines, changingAt } = castLines(rand)
  const reading = readingOfLines(lines, changingAt)
  if (!reading) throw new Error('摇卦失败:六爻未成卦')
  return reading
}

function tierOf(changing: number): (typeof CHANGING_TIERS)[number] {
  let out = CHANGING_TIERS[0]!
  for (const t of CHANGING_TIERS) if (changing >= t.min) out = t
  return out
}

/** 一卦之力:下卦(己身)+ 上卦(境遇),再按动爻数换挡 */
export function readingMods(reading: HexagramReading): StatMods {
  const power = tierOf(reading.changing).power
  const merged = mergeMods([reading.lower.mods, reading.upper.mods])
  const out: StatMods = {}
  for (const [k, v] of Object.entries(merged)) {
    if (typeof v === 'number' && v !== 0) out[k as AnyStatKey] = v * power
  }
  return out
}

/** 一卦能管多久(分钟) */
export function readingMinutes(reading: HexagramReading): number {
  return tierOf(reading.changing).minutes
}

/** 卦象白话:宜什么、忌什么、为何如此(展示层直接用,不另写一份) */
export function readingCounsel(reading: HexagramReading): string[] {
  const tier = tierOf(reading.changing)
  return [
    `内卦${reading.lower.name}为身,象${reading.lower.image} —— 宜「${reading.lower.good}」,忌「${reading.lower.bad}」。`,
    `外卦${reading.upper.name}为境,象${reading.upper.image} —— 宜「${reading.upper.good}」,忌「${reading.upper.bad}」。`,
    tier.note,
    reading.changed ? `动爻${reading.changingAt.join('、')}:${reading.hexagram.name}之${reading.changed.name}。` : '六爻皆静,守本卦而行。'
  ]
}

/** 存档里的卦象:只存成卦所需的最小信息,卦义与卦力由数据推导(陈旧存档也能重算) */
export interface DivinationState {
  /** 本卦卦名 */
  hexagram: string
  upper: TrigramId
  lower: TrigramId
  /** 之卦卦名(六爻不动为 null) */
  changed: string | null
  changing: number
  changingAt: number[]
  lines: number[]
  castAt: number
  expiresAt: number
}

/** 由存档状态复原这次问卦(重开游戏/读档后仍要看得见卦) */
export function readingFromState(state: {
  upper: TrigramId
  lower: TrigramId
  changing: number
  changingAt: number[]
  lines: number[]
}): HexagramReading | null {
  const upper = trigramDef(state.upper)
  const lower = trigramDef(state.lower)
  if (!upper || !lower) return null
  return readingOfLines([...state.lines], [...state.changingAt])
}

/** 卦画文案:自下而上的六爻,阳为实线,阴为断线;动爻带 ○ */
export function drawLines(reading: HexagramReading): string[] {
  return reading.lines.map((v, i) => {
    const bar = v ? '▬▬▬' : '▬ ▬'
    return reading.changingAt.includes(i + 1) ? `${bar} ○ 动` : bar
  })
}
