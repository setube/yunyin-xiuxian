import { IMAGES, MANSIONS, type ImageId, type MansionDef } from '@/data/xiangxiu'
import type { WorldId } from '@/types'

/**
 * 四象二十八宿的盘。
 *
 * 星象页原先只写一句「今日值某宿」,再加一句「四象配四界」——
 * 二十八宿是哪几宿、分属哪一象、今天轮到了哪一宿,全靠读文字。
 * 而它们是**按象成组**的(东苍龙七宿、南朱雀七宿…),本来就能摆成一圈:
 * 哪一象的宿多、今值在哪个方位,一眼看得见。
 *
 * 这一层只做两件事:按象分组、标出今值。
 * 宿名、全名、分野、所宜全部转发 data/xiangxiu,不另立。
 */

/** 一象与其七宿 */
export interface ImageGroup {
  id: ImageId
  name: string
  direction: string
  world: WorldId
  /** 本象所辖之宿,按 MANSIONS 原序 */
  mansions: MansionDef[]
  /** 今值之宿是否落在此象 */
  here: boolean
}

/**
 * 四象分组。
 *
 * @param todayName 今值之宿的宿名(如「角」);传空则无一处标 here
 */
export function mansionGroups(todayName: string): ImageGroup[] {
  return IMAGES.map(img => {
    const mansions = MANSIONS.filter(m => m.image === img.id)
    return {
      id: img.id,
      name: img.name,
      direction: img.direction,
      world: img.world,
      mansions,
      here: todayName.length > 0 && mansions.some(m => m.name === todayName)
    }
  })
}

/** 二十八宿是否被四象分尽 —— 盘上不会漏宿 */
export function mansionsAccountedFor(): number {
  return IMAGES.reduce((n, img) => n + MANSIONS.filter(m => m.image === img.id).length, 0)
}

/** 今值那一宿;找不到返回 null(坏档或空名) */
export function todayMansionOf(todayName: string): MansionDef | null {
  return MANSIONS.find(m => m.name === todayName) ?? null
}

/**
 * 一象的方位刻度:本象七宿里,今值的宿排在第七位。
 * 不在本象时返回 null —— 不给一个假的 0,那会被读成「排第一」。
 */
export function mansionOrdinal(group: ImageGroup, todayName: string): number | null {
  const i = group.mansions.findIndex(m => m.name === todayName)
  return i >= 0 ? i + 1 : null
}
