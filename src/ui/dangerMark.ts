import { DANGER_NAMES } from '@/data/regions'

/**
 * 地界危险度的形制。
 *
 * 每处地界都带 `danger`(1~5),而界面上它只写成两个字:平缓 / 寻常 / 凶险 / 大凶 / 绝地。
 * 「凶险」与「大凶」差多少,得先记住这五个词的次序 —— 而它本来就是一个可数的量:
 * 一格到五格,数得出来。
 *
 * 本页另有同一种可数量的先例:「本世地界」页把事件密度画成一排点(见 views/MortalWorldView)。
 * 危险度是同一类东西,故沿用同一套形制,不另造。
 *
 * 铁律:
 *   1. 档位与名字都取自 `data/regions` 的 `DANGER_NAMES` —— 那是唯一事实源,改表即改刻度。
 *   2. 只在**最高两档**转朱:色是辅助,点数才是主判据(色弱玩家照样数得出)。
 */

/** 危险度档位 1~5,与 RegionDef['danger'] 同域 */
export type DangerLevel = 1 | 2 | 3 | 4 | 5

/** 危险度刻度的满格数:五档 */
export const DANGER_MAX = 5

/** 一档危险度的形制 */
export interface DangerMark {
  /** 夹进 1~5 的档位 */
  level: DangerLevel
  /** 满格数,取自 DANGER_MAX */
  max: number
  /** 档名(「平缓」/「绝地」),取自 DANGER_NAMES */
  name: string
  /** 是否最高两档 —— 转朱的那一档 */
  severe: boolean
  /** 读屏与 title 的说法:危险度 + 档名 */
  label: string
}

/**
 * 一处地界的危险度形制。
 *
 * 坏值按最低档处理:形制是加成,判不出时宁可不加,也不把一处地界画成「绝地」。
 */
export function dangerMark(danger: number | undefined): DangerMark {
  const raw = Number.isFinite(danger) ? Math.floor(danger as number) : 1
  const level = Math.max(1, Math.min(DANGER_MAX, raw)) as DangerLevel
  const name = DANGER_NAMES[level] ?? ''
  return {
    level,
    max: DANGER_MAX,
    name,
    severe: level >= 4,
    label: `${name}(${level}/${DANGER_MAX})`
  }
}

/** 危险度刻度:已满的格为 true。格数恒为 DANGER_MAX,模板不再自己数 */
export function dangerPips(mark: DangerMark): boolean[] {
  return Array.from({ length: mark.max }, (_, i) => i < mark.level)
}
