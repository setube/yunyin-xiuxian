import type { PetDef } from '@/types'
import { EFFECTS, PERSONALITY_NAMES, type PetPersonalityEffects } from '@/core/petPersonality'

/**
 * 灵兽性格的形制。
 *
 * 四种性格(贪宝 / 慢稳 / 好战 / 谨慎)只影响历练时的四项倾向,而界面上此前只有名字与一句描述:
 * 「贪宝」与「好战」都算「凶」,但它们动的是**不同的量** —— 前者遇险更高且掉落更好,
 * 后者遇险更高得多。要挑一只配当前打法,得把描述那句话读两遍再在脑子里比对。
 *
 * 这一层把四项折成**方向纹**:每个性格有一组线纹,纹样数量与方向都从
 * `core/petPersonality` 的 EFFECTS 现算 —— 数据改了,纹样跟着改,不另立第二份阈值表。
 *
 * 铁律:
 *   1. 只表达方向,不表达强弱:纹样是「往哪边偏」,不是「偏多少」。
 *      偏多少写在描述句里(`personalityDesc`),两处不重复。
 *   2. 色只作辅助:性格是分类,不是品阶,故不套品阶色。
 */

/** 性格影响的四个维度,按固定次序 */
export type PersonalityAxis = 'duration' | 'danger' | 'luck' | 'guard'

/** 一维的倾向:往哪边偏 */
export type AxisTilt = 'up' | 'down' | 'flat'

export const PERSONALITY_AXIS_NAMES: Record<PersonalityAxis, string> = {
  duration: '行程',
  danger: '遇险',
  luck: '气运',
  guard: '护持'
}

export interface PersonalityMark {
  /** 性格 id */
  key: PetDef['personality']
  /** 性格名,原样转发 */
  name: string
  /** 四项各自的倾向 */
  tilts: Record<PersonalityAxis, AxisTilt>
  /** 有几项在动(1~4);0 表示这个性格什么也不改(不该出现,留着兜底) */
  active: number
  /** 读屏与 title 的说法:性格名 + 倾向条数 */
  label: string
}

/** 一项倍率 → 倾向。中性是 1(倍率)或 0(加减项),由调用方给中性值 */
function tiltOf(value: number, neutral: number): AxisTilt {
  if (!Number.isFinite(value)) return 'flat'
  if (value > neutral) return 'up'
  if (value < neutral) return 'down'
  return 'flat'
}

/** 把 EFFECTS 的四项读成四枚倾向;不另立阈值,只看「比中性大还是小」 */
export function tiltsOf(e: PetPersonalityEffects): Record<PersonalityAxis, AxisTilt> {
  return {
    // 行程与遇险是倍率,中性 1
    duration: tiltOf(e.exploreDurMult, 1),
    danger: tiltOf(e.dangerMult, 1),
    // 气运与护持是加减项,中性 0
    luck: tiltOf(e.dropLuck, 0),
    guard: tiltOf(e.lossReduction, 0)
  }
}

/** 一个性格的形制;认不出时四项全平、active 为 0,调用点据此不画 */
export function personalityMark(key: PetDef['personality']): PersonalityMark {
  const e = EFFECTS[key]
  const tilts = e ? tiltsOf(e) : { duration: 'flat', danger: 'flat', luck: 'flat', guard: 'flat' } as const
  const active = Object.values(tilts).filter(t => t !== 'flat').length
  return {
    key,
    name: PERSONALITY_NAMES[key] ?? '',
    tilts,
    active,
    label: e ? `${PERSONALITY_NAMES[key]} · ${active} 项倾向` : ''
  }
}

/** 一项倾向:维度键 + 中文名 + 倾向 */
export interface TiltRow {
  axis: PersonalityAxis
  axisName: string
  tilt: AxisTilt
}

/**
 * 只列**在动**的那几项(平的不占位)。
 * 四种性格最多动三项 —— 把不动的也列出来,一行就挤满了,而且「不变」本身不是信息。
 */
export function personalityTiltRows(mark: PersonalityMark): TiltRow[] {
  return (Object.keys(PERSONALITY_AXIS_NAMES) as PersonalityAxis[])
    .filter(axis => mark.tilts[axis] !== 'flat')
    .map(axis => ({ axis, axisName: PERSONALITY_AXIS_NAMES[axis], tilt: mark.tilts[axis] }))
}

/** 四种性格各有一组纹样,用于判据核对「每种都登记了」 */
export function personalityMarks(): PersonalityMark[] {
  return (Object.keys(PERSONALITY_NAMES) as PetDef['personality'][]).map(personalityMark)
}
