import { FURNACE_RATES, FURNACE_STONE_DAO_SOURCE, FURNACE_STONE_TIER_AMOUNT } from '@/data/endgame'

/**
 * 天道熔炉的「熔率」形制。
 *
 * 熔炉能熔四类东西(玄铁/残页/灵草/器灵尘),而它们的兑换率差得很远:
 * 玄铁 25 个换 1 缕道源,器灵尘要 80 个才换 1 缕 —— 三倍多。
 * 界面此前把这四行排成四个同样的内嵌块,玩家看到的是四个等价的选项,
 * 「我这一堆该先熔哪个」得自己拿 25、15、60、80 去比。
 *
 * 这一层把兑换率画成可数的东西:
 *   率阶(rate):每 1 缕道源要多少个 —— 数字越小越划算。分「丰 / 中 / 薄」三档;
 *   率纹(bar):一条按比例画出的刻度,越短越划算 —— 不必读数字也能比。
 *
 * 唯一的量:`FURNACE_RATES[].per`(数据层已经是一份事实源)。
 * 本模块只做「换算成人能一眼比的东西」,不新增数值、不改价。
 */

/** 率阶:以四类里最划算的一类为基准 */
export type RateTier = 'rich' | 'mid' | 'thin'

export interface RateMark {
  /** 每 1 缕道源要几个 */
  per: number
  /** 率阶 */
  tier: RateTier
  /** 相对最划算那一类的倍数(最划算 = 1) */
  ratio: number
  /** 刻度长度 0~1:越划算越长 */
  fill: number
  /** 读屏与 title 的说法 */
  label: string
}

const TIER_LABEL: Record<RateTier, string> = { rich: '熔率丰', mid: '熔率中', thin: '熔率薄' }

/** 四类里最划算的那一档(per 最小) */
function bestPer(): number {
  return Math.min(...FURNACE_RATES.map(r => r.per))
}

/** 四类里最不划算的那一档(per 最大) */
function worstPer(): number {
  return Math.max(...FURNACE_RATES.map(r => r.per))
}

/**
 * 率阶判定。三档以「相对最划算的倍数」划线:
 *   ≤1.5 倍 → 丰;≤2.5 倍 → 中;其余 → 薄。
 * 用相对倍数而不是绝对个数:将来若调价(比如整体翻倍),
 * 三档的相对关系不该跟着变。
 */
export function rateTierOf(per: number): RateTier {
  if (!Number.isFinite(per) || per <= 0) return 'thin'
  const ratio = per / bestPer()
  if (ratio <= 1.5) return 'rich'
  if (ratio <= 2.5) return 'mid'
  return 'thin'
}

/**
 * 刻度长度:0~1,越划算越长。
 * 用反向归一 —— 最划算的一类是满格,最不划算的一类只剩个短条,
 * 中间几类按位置落。两端都由数据现算,不写死 15 与 80。
 */
export function rateFillOf(per: number): number {
  const lo = bestPer()
  const hi = worstPer()
  if (!Number.isFinite(per) || per <= 0) return 0
  if (hi <= lo) return 1
  const t = (per - lo) / (hi - lo)
  return Math.max(0.12, Math.min(1, 1 - t))
}

/** 一类物资的熔率形制;坏值按最薄的一档处理,不抛错 */
export function rateMark(per: number, name: string): RateMark {
  const best = bestPer()
  const ratio = Number.isFinite(per) && per > 0 ? per / best : Infinity
  return {
    per,
    tier: rateTierOf(per),
    ratio: Number.isFinite(ratio) ? ratio : 0,
    fill: rateFillOf(per),
    label: `${name} · 每 ${per} 个换 1 道源 · ${TIER_LABEL[rateTierOf(per)]}`
  }
}

/** 四类全部形制;用于判据核对每一类都算得出来 */
export function furnaceMarks(): RateMark[] {
  return FURNACE_RATES.map(r => rateMark(r.per, r.name))
}

/**
 * 灵石献祭的换算:每 `FURNACE_STONE_TIER_AMOUNT` 灵石换 `FURNACE_STONE_DAO_SOURCE` 缕。
 * 返回「每 1 缕要多少灵石」,与四类物资的 per 同一把尺,可以放在一起比。
 * 灵石按层级折算,这里是**份数与缕数的固定比例**,不是绝对值。
 */
export function stonePerDaoSource(): number {
  if (!Number.isFinite(FURNACE_STONE_TIER_AMOUNT) || FURNACE_STONE_DAO_SOURCE <= 0) return 0
  return FURNACE_STONE_TIER_AMOUNT / FURNACE_STONE_DAO_SOURCE
}

export { TIER_LABEL }
