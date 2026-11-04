import { DAO_PATHS } from '@/data/endgame'
import { daoMark, type DaoMark } from './daoMark'

/**
 * 修行画像里的道途占比形制。
 *
 * 画像把这一世走过的道痕按四条道途分账,画成四根**一模一样的朱砂条**:
 * 哪一根是剑道、哪一根是杀伐道,只能读左边的名字;
 * 而名字本身又只有「剑道 / 长生道 / 天机道 / 杀伐道」四行,色与形都没有分别。
 *
 * 道途的形制上一轮已经做出来了(见 ui/daoMark:剑为单锋、长生为回环、
 * 天机为三横、杀伐为交刃,各有道色)。画像这里只是没接上 ——
 * 同一个东西在两处长得不一样,玩家就得学两套。
 *
 * 这一层只做接线,外加一条判断:条长共用一把尺。
 */

/** 一位道途占比 */
export interface DaoShareRow {
  /** 道途名,转发 data 里的既有名字 */
  name: string
  /** 占比,整数百分比 */
  pct: number
  /** 这根条的长度百分比;以四条中最大的那根为满格 */
  barPct: number
  /** 道途形制;坏档里的野 id 认不出时为 undefined,调用点据此不挂纹 */
  mark: DaoMark | undefined
  /** 是否这一世走得最多的那条 */
  top: boolean
}

/**
 * 画像的四根道途条。
 *
 * 条长以本组最大的那根为满格,不按 100% 画:四条占比之和本来就不到一百
 * (还有无道途的道痕),按 100% 画会让四根都短得像没走过路。
 * 以最大者为满格,「走得最多的是哪条」与「它比次多的多出多少」同时读得出来。
 */
export function daoShareRows(shares: readonly { name: string; pct: number }[]): DaoShareRow[] {
  const rows = shares.filter(s => Number.isFinite(s.pct) && s.pct > 0)
  const peak = rows.reduce((m, s) => Math.max(m, s.pct), 0)
  return rows.map(s => ({
    name: s.name,
    pct: Math.round(s.pct),
    barPct: peak > 0 ? Math.max(0, Math.min(100, (s.pct / peak) * 100)) : 0,
    // 名 → 形制:data 里的道名是唯一事实源,不在这里另写一张对照表
    mark: daoMark(DAO_PATHS.find(d => d.name === s.name)?.id ?? ''),
    top: peak > 0 && s.pct === peak
  }))
}
