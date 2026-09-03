/**
 * 器魂 —— 凡器入天界的存在形式
 *
 * 凡人的法器到了天界本就承不住:天道压顶,数值被尽数抹平,只余形意。
 * 那点残存的形意就是器魂——它记得这件法器是什么路数(锋、盾、棘、连、泽、背),
 * 却记不得它有多锋利。所以在天界,九件神品与三件精品若路数相同,并无分别;
 * 想更强只能改路数,不能靠更厚的数值。
 *
 * 器魂由凡器凝炼而来(销毁装备),分六类六阶:
 *   类型 —— 由该装备的主导词条判定,对应六大流派
 *   品阶 —— 由该装备品质决定,决定器魂词条的强度
 * 装配槽位有限(SOUL_SLOTS),必须取舍——这正是「选方向」取代「堆总量」的地方。
 */
import type { AnyStatKey, StatMods } from '@/types'

/** 器魂可装配槽位:少于流派数,逼出取舍 */
export const SOUL_SLOTS = 3

export type SoulTypeId = 'beishui' | 'gangdun' | 'fanzhen' | 'lianji' | 'muze' | 'fengmang'

export interface SoulTypeDef {
  id: SoulTypeId
  name: string
  /** 印章单字(与 BUILD_STYLES 同源) */
  seal: string
  desc: string
  /**
   * 该类器魂在一阶时提供的词条。
   * 数值刻意小于同名装备词条:器魂是形意残存,不是原样搬运
   */
  mods: StatMods
  /** 判定用主导词条:装备在这些键上的合计值决定它凝出哪一类器魂 */
  judgeKeys: AnyStatKey[]
}

export const SOUL_TYPES: SoulTypeDef[] = [
  {
    id: 'fengmang',
    name: '锋魂',
    seal: '锋',
    desc: '此器生来向前,不曾回头——形意里只剩一往无前的那一分锐',
    mods: { critRate: 0.04, fullHpDamage: 0.09, firstStrike: 0.08 },
    judgeKeys: ['critRate', 'critDamage', 'fullHpDamage', 'firstStrike']
  },
  {
    id: 'gangdun',
    name: '盾魂',
    seal: '盾',
    desc: '挡过太多次,连魂里都是那道罡气的形状',
    mods: { shieldOnStart: 0.07, shieldPower: 0.09, damageReduction: 0.03 },
    judgeKeys: ['shieldOnStart', 'shieldPower', 'damageReduction']
  },
  {
    id: 'fanzhen',
    name: '棘魂',
    seal: '棘',
    desc: '被劈砍得久了,便学会了把力还回去',
    mods: { counterRate: 0.1, counterDamage: 0.16 },
    judgeKeys: ['counterRate', 'counterDamage']
  },
  {
    id: 'lianji',
    name: '连魂',
    seal: '连',
    desc: '出手从来不止一次,这习惯连天道也抹不掉',
    mods: { comboRate: 0.08, comboDamage: 0.11, speed: 0.03 },
    judgeKeys: ['comboRate', 'comboDamage', 'speed']
  },
  {
    id: 'muze',
    name: '泽魂',
    seal: '泽',
    desc: '养过太多伤,魂里存着一点不肯断的生机',
    mods: { lifesteal: 0.03, regenPerRound: 0.012, overhealShield: 0.14 },
    judgeKeys: ['lifesteal', 'regenPerRound', 'overhealShield']
  },
  {
    id: 'beishui',
    name: '背魂',
    seal: '背',
    desc: '越是绝境越亮,这器物大约陪主人走过几回鬼门关',
    mods: { lowHpDamage: 0.14, lowHpReduction: 0.08, executeDamage: 0.07 },
    judgeKeys: ['lowHpDamage', 'lowHpReduction', 'executeDamage']
  }
]

const BY_ID = new Map<SoulTypeId, SoulTypeDef>(SOUL_TYPES.map(s => [s.id, s]))

export function soulTypeDef(id: SoulTypeId): SoulTypeDef | undefined {
  return BY_ID.get(id)
}

/**
 * 器魂品阶(六阶)。装备品质 rank 0~8 映射到此:
 * 凡/良→一阶,精→二阶,灵→三阶,玄→四阶,地→五阶,天/仙/神→六阶。
 * 高阶更强,但阶差刻意压得比装备品质差距小得多——
 * 天界比的是路数,品阶只是让好装备仍然值得刷
 */
export interface SoulGradeDef {
  rank: number
  name: string
  /** 器魂词条整体倍率 */
  mult: number
  color: string
}

export const SOUL_GRADES: SoulGradeDef[] = [
  { rank: 0, name: '朦胧', mult: 1.0, color: '#857F70' },
  { rank: 1, name: '清晰', mult: 1.25, color: '#6E8B74' },
  { rank: 2, name: '凝实', mult: 1.5, color: '#4F7699' },
  { rank: 3, name: '通灵', mult: 1.75, color: '#7B5EA7' },
  { rank: 4, name: '显形', mult: 2.0, color: '#B07D2B' },
  { rank: 5, name: '化真', mult: 2.3, color: '#C9A227' }
]

/** 装备品质 rank → 器魂品阶 */
export function soulGradeOfQuality(qualityRank: number): SoulGradeDef {
  const table = [0, 0, 1, 2, 3, 4, 5, 5, 5]
  return SOUL_GRADES[table[Math.max(0, Math.min(8, qualityRank))] ?? 0]!
}

export function soulGradeDef(rank: number): SoulGradeDef {
  return SOUL_GRADES[Math.max(0, Math.min(SOUL_GRADES.length - 1, rank))]!
}

/** 一枚已凝炼的器魂 */
export interface SoulInstance {
  uid: string
  type: SoulTypeId
  /** 品阶 rank */
  grade: number
  /** 凝自哪件法器(仅作展示,原器已毁) */
  fromName: string
}

/** 器魂实际提供的词条 = 类型基础 × 品阶倍率 */
export function soulMods(soul: SoulInstance): StatMods {
  const def = soulTypeDef(soul.type)
  if (!def) return {}
  const mult = soulGradeDef(soul.grade).mult
  const out: StatMods = {}
  for (const k in def.mods) {
    const key = k as keyof StatMods
    out[key] = (def.mods[key] ?? 0) * mult
  }
  return out
}

export function soulName(soul: SoulInstance): string {
  const def = soulTypeDef(soul.type)
  return `${soulGradeDef(soul.grade).name}·${def?.name ?? '器魂'}`
}
