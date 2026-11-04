/**
 * 天劫波次形制:把「第 N 道天雷,气血余 X%」的文字行,翻成可数的波次柱。
 *
 * 渡劫是整局里唯一把气血摆上台面的环节:一道一道雷落下,每道之后还剩多少。
 * 而弹窗里那时只是一串同形的灰字 —— 二十道雷就是二十行,哪一道最险、
 * 从第几道开始吃紧,只能逐行读百分数自己比。
 *
 * 这里只做一件事:从战报原文里认出每道雷落定后的余血,落成一根根柱。
 * 不动叙事文案 —— 战报是叙事,形制是读法,两者同源不同表。
 */

/** 一道天雷落定后的读数 */
export interface TribWave {
  /** 第几道,从 1 起 */
  index: number
  /** 落定后气血余量,0~1 */
  hpPct: number
}

/** 战报里那道雷的写法:「第 3 道天雷落下,你咬牙硬撼,气血余 62%。」 */
const WAVE_RE = /第\s*(\d+)\s*道天雷[^。]*?气血余\s*(\d+)%/

/** 最后一击的写法:「第 7 道天雷轰然落下,你护体灵光崩碎,重伤坠地。」 */
const FALL_RE = /第\s*(\d+)\s*道天雷[^。]*?重伤坠地/

/**
 * 从渡劫战报里解出逐道余血。
 *
 * 只认战报里真写了的数字,不从别处推算 —— 柱子与旁边的字必须同源,
 * 否则玩家会读到两套互相矛盾的气血。
 */
export function tribWaves(log: readonly string[]): TribWave[] {
  const out: TribWave[] = []
  for (const line of log) {
    if (typeof line !== 'string') continue
    const fell = FALL_RE.exec(line)
    if (fell) {
      // 坠地:这一道之后气血归零,是序列里真实的一格
      out.push({ index: Number(fell[1]), hpPct: 0 })
      continue
    }
    const m = WAVE_RE.exec(line)
    if (!m) continue
    const pct = Number(m[2])
    if (!Number.isFinite(pct)) continue
    out.push({ index: Number(m[1]), hpPct: Math.max(0, Math.min(1, pct / 100)) })
  }
  return out.sort((a, b) => a.index - b.index)
}

/**
 * 最高的一根柱按满格画,其余按比例。
 * 渡劫开头气血本来就在满值附近,一律以 100% 为顶会让前几道挤成一排等高柱,落差读不出来。
 */
export function tribPeak(waves: readonly TribWave[]): number {
  if (waves.length === 0) return 1
  const max = Math.max(...waves.map(w => w.hpPct))
  return max > 0 ? max : 1
}

/** 一根柱的高度百分比;以本场最高的那道为满格 */
export function tribBarPct(wave: TribWave, peak: number): number {
  const top = peak > 0 ? peak : 1
  const raw = (Math.max(0, wave.hpPct) / top) * 100
  return Math.max(0, Math.min(100, raw))
}

/** 余血低于此即染色 —— 只有真到危境才标,免得满屏都是险 */
export const TRIB_DANGER_PCT = 0.3

/** 除坠地那道之外最险的一格;无可险者返回 null */
export function tribWorst(waves: readonly TribWave[]): TribWave | null {
  const alive = waves.filter(w => w.hpPct > 0)
  if (alive.length === 0) return null
  return alive.reduce((a, b) => (b.hpPct < a.hpPct ? b : a))
}
