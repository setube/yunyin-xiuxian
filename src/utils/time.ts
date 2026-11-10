export function now(): number {
  return Date.now()
}

/** 本地日期字符串,用于每日任务重置 */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 时间戳 → 本地日整数(YYYYMMDD);纯函数,不碰墙钟 */
export function localDayNum(at: number): number {
  const d = new Date(at)
  /*
   * 超出 Date 可表示范围(±8.64e15)与 NaN 都会让 getFullYear 返回 NaN,
   * 于是这里吐出 NaN —— 而它的返回值要拿去和「今天的日号」比等号,
   * NaN 与任何数比较都是 false,「今日已做」的闸门会永久恒假。
   * 坏值按 0(即「很久以前」)处理。
   */
  if (Number.isNaN(d.getTime())) return 0
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * 本地日整数(YYYYMMDD),用于「每日一次」类闸门。
 * 与 todayStr 同一本地日口径,不用 UTC 日(否则同一本地日能巡游两次)。
 */
export function todayLocalNum(): number {
  return localDayNum(Date.now())
}

/**
 * 时间戳 → 可读「M月D日」。
 *
 * 坏值给占位符:超出 Date 范围的有限数(坏档里的 `lastAt: 1e300`)会让
 * `getMonth()` / `getDate()` 返回 NaN,印出来是「NaN月NaN日」——
 * 既不像日期也不像系统状态,而且不会报任何错。判据见 time.spec。
 */
export function formatDate(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 距下一个本地午夜还有多少秒(日课更替);与 todayLocalNum 同一本地日口径,纯函数 */
export function secsUntilNextMidnight(from: number): number {
  const d = new Date(from)
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0)
  return Math.max(0, (next.getTime() - from) / 1000)
}
