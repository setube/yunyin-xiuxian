import { REALMS, WORLDS } from '@/data/realms'

/**
 * 境界谱的界域进度形制。
 *
 * 境界谱把 21 境按四个界域平铺,而每个界域的标题只写「第 1–9 境」:
 *   —— 身在人间界第 4 境时,本界域还剩几境、已经过了几境,都得自己拿 4 去比 1 与 9。
 *   —— 四个界域各含几境也不一样(9/5/4/3),「第 1–9 境」与「第 18–21 境」量级差三倍。
 *
 * 这一层只做一件事:给每个界域一排刻度 —— 界域含几境就几格,已过几格。
 * 境界总数与界域分界全部取自 REALMS / WORLDS,不另立。
 */

/** 已过几境才算「过」:严格低于当前境界 */
export interface WorldProgress {
  id: string
  name: string
  /** 本界域共几境 */
  total: number
  /** 本界域内已过几境 */
  passed: number
  /** 是否当前所在界域 */
  here: boolean
}

/**
 * 四个界域的进度。
 *
 * @param major 当前大境界下标(0 起);传 null 表示尚未开局
 */
export function worldProgress(major: number | null): WorldProgress[] {
  const cur = major !== null && Number.isFinite(major) ? Math.max(0, Math.min(REALMS.length - 1, Math.floor(major))) : null
  return WORLDS.map(w => {
    const total = w.end - w.start + 1
    // 已过:界域内严格低于当前境界的那几境;身处更晚的界域时整段算过
    const passed = cur === null ? 0 : Math.max(0, Math.min(total, cur - w.start))
    return {
      id: w.id,
      name: w.name,
      total,
      passed,
      here: cur !== null && cur >= w.start && cur <= w.end
    }
  })
}

/** 刻度:界域含几境就几格,已过的为 true。格数随界域变,不是一律九格 */
export function worldPips(row: WorldProgress): boolean[] {
  return Array.from({ length: row.total }, (_, i) => i < row.passed)
}

/** 全谱已过几境 / 共几境 —— 页级那条总进度 */
export function realmTotals(major: number | null): { passed: number; total: number } {
  const cur = major !== null && Number.isFinite(major) ? Math.max(0, Math.min(REALMS.length, Math.floor(major))) : 0
  return { passed: cur, total: REALMS.length }
}
