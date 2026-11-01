import { ARTIFACT_MAX_LEVEL } from '@/data/artifacts'

/**
 * 满级标记:装备强化到顶、法宝祭炼满重,都是玩家投入后才有的一次「到底了」。
 *
 * 为什么单开一个模块而不并进 `qualityAura`:
 * 品阶是**掉落时就定下**的属性,满级是**玩家挣来**的状态。两者的形制语言必须分得开 ——
 * 品阶用角饰与外发光(越稀有越亮),满级用顶边一道实心横杠(与稀有度无关,神品凡品都可以满级)。
 * 混在一起,玩家会以为「发光的都是强化过的」。
 *
 * 现在的表现只有一个颜色差:`+N` 与祭炼格在满级时变金色。
 * 金色是「好」,但不是「到头了」—— 一个 +9 与一个 +10 在格子上没有形状差别。
 *
 * 装备的上限随炼器台等级走,故由调用方传入 —— 本模块不 import core/forge
 * (`equipLevelCap` 要读 store),与 `data/buildings.EQUIP_LEVEL_SANITIZE_CAP` 同一取舍:
 * 纯判定留在 ui 层,取值的责任在使用点。
 */

/** 满级状态;不是满级返回 null */
export interface MasteryMark {
  /** 读屏与 title 用的说法:「强化至顶」/「祭炼已满」 */
  label: string
}

/** 装备是否强化至顶。cap 取 `core/forge.equipLevelCap()`(随炼器台等级变) */
export function equipMastery(level: number, cap: number): MasteryMark | null {
  if (!Number.isFinite(level) || !Number.isFinite(cap) || cap <= 0) return null
  return level >= cap ? { label: '强化至顶' } : null
}

/** 法宝是否祭炼满重 */
export function artifactMastery(level: number): MasteryMark | null {
  return Number.isFinite(level) && level >= ARTIFACT_MAX_LEVEL ? { label: '祭炼已满' } : null
}
