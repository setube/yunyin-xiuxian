/** 统一数值格式化:中文单位 + 科学计数法兜底 */
import type { GNum } from '@/types'
import { gn, toNum } from './gnum'

/** 每 4 个数量级一个中文单位 */
const UNITS = ['万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载', '极'] as const

/** 数值非法时的统一占位 */
const NOT_AVAILABLE = '--'

/**
 * 天数到这个量级就改用 formatGN 的中文单位,不再印裸数字。
 *
 * **上界是多少**:存档能塞进来的最大时间戳是 `MAX_TIMESTAMP_MS`(8.64e15 毫秒),
 * 减当前时刻再折算成天约 **1 亿天**(实测 99,979,231 天)。
 *
 * **门槛取多少**:`1e7`,即**一千万天**(约 2.7 万年)—— 比上面那个上界低一个数量级。
 * 首版取的正是 1e8,被 99,979,231 天擦过去,坏档仍印八位裸数字。
 *
 * **超过门槛之后印什么**:交给 `formatGN`。它有自己的单位表(万→极),
 * 表内印「9997万天」这类;超出「极」则退回它自己的科学计数兜底(`1.16e295天`)。
 * 那种极端值只在坏档里出现,能读出行数即可,不再为它另造单位。
 *
 * 真实游玩到不了这里:这里量的是**倒计时与时长**,
 * 由界面上限收着(离线上限 72 时、丹药增益 8 时)。
 */
const DURATION_DAY_UNIT_CAP = 1e7

/** 格式化大数:1,234 → 12.35万 → 1.235亿 → 1.24e52 */
export function formatGN(v: GNum | number): string {
  const g = typeof v === 'number' ? gn(v) : v
  /*
   * 坏值守卫。缺了它,几个坏输入会印出乱码而不是占位符:
   *   gn(1, NaN)      → 「NaNundefined」
   *   gn(1, Infinity) → 「1.00eInfinity」
   *   gn(NaN, 0)      → 「∞」(m 为 NaN 时后续判断全落空,最后走科学计数兜底)
   * formatPercent / formatDuration 等早已返回 `--`,只有这是漏的。
   * 存档经 sanitize 应已修好,但界面在 sanitize 之前也可能读到(见 storeResilience)。
   */
  if (!Number.isFinite(g.m) || !Number.isFinite(g.e)) return NOT_AVAILABLE
  /*
   * 指数**本身**也得是「小整数」,不只是有限。
   *
   * 兜底那条路是 `` `${m}e${g.e}` `` —— 直接拼 `g.e`。若 `g.e` 是 1e22,
   * 拼出来就是「1.00e1e+22」:科学计数里套了一层科学计数,读都读不出来。
   * `asBoundedGNum` 读档时已把 |e| 夹到 999,但这里是**公共函数**,
   * 不能假定每个调用方都先过那道关(界面上、审计脚本里都直接调)。
   * 与 SAVE_GNUM_MAX_EXP 同一把尺:超过它的指数只可能来自坏档。
   */
  if (Math.abs(g.e) > 999) return NOT_AVAILABLE
  if (g.m === 0) return '0'
  if (g.m < 0) {
    /*
     * 极小负数会被下面的定点格式化抹成 0(如 1e-10 → 「0」),
     * 加负号就成了「-0」—— 玩家读到的不是「几乎没有」而是一个显眼的畸形值。
     * 取正后若回到 0,就直接交 0,不保留负号。
     */
    const pos = formatGN({ m: -g.m, e: g.e })
    return pos === '0' ? '0' : '-' + pos
  }
  if (g.e < 4) {
    /*
     * 千位档直接取原值,不经 toNum 回算。
     *
     * gn(999.5) 存成 { m: 9.995, e: 2 },toNum 走 9.995 乘 100 得到 999.4999999999999,
     * Math.round 于是给 999 —— 而同一个函数对 999.6 给 1000、对 1000.5 给 1,001。
     * 同一档里半值进位时灵时不灵,玩家看到的是「999.5 显示成 999,1000.5 显示成 1,001」。
     *
     * 传进来就是 number 的,原值有完整精度,直接用它;传 GNum 的(来自存档)没有原值,
     * 只能按 m·10^e 回算,那是数据本来的精度,不算这里的问题。
     */
    const n = typeof v === 'number' ? Math.abs(v) : toNum(g)
    /*
     * 档位仍按取整**前**的值判:999.9 落在 <1000 档,写出「1000」不带千分位,
     * 这是既有口径(format.spec 明确钉着),本轮不改。
     */
    if (n < 1000) {
      if (n < 100 && !Number.isInteger(n)) {
        // 正数不显示成 0:位数随数量级抬升(0.04→2 位,0.004→3 位),封顶 6 位
        const tiny = n > 0 && n < 0.1 ? n.toFixed(Math.max(2, Math.min(6, 1 - Math.floor(Math.log10(n))))) : n.toFixed(1)
        return trimZero(tiny)
      }
      // 与 <100 档同为四舍五入
      return String(Math.round(n))
    }
    // 千位档同口径四舍五入
    return Math.round(n).toLocaleString('en-US')
  }
  const unitIdx = Math.floor(g.e / 4) - 1
  if (unitIdx >= UNITS.length) {
    // 科学计数兜底;mantissa 四舍五入到 10.00 时进位(9.99…e407 → 1.00e408)
    const m = g.m.toFixed(2)
    if (m === '10.00') return `1.00e${g.e + 1}`
    return `${m}e${g.e}`
  }
  const value = g.m * Math.pow(10, g.e - (unitIdx + 1) * 4)
  return trimZero(fixedByMag(value)) + UNITS[unitIdx]
}

function fixedByMag(v: number): string {
  if (v < 10) return v.toFixed(3)
  if (v < 100) return v.toFixed(2)
  if (v < 1000) return v.toFixed(1)
  return String(Math.floor(v))
}

/**
 * 差额专用格式化:量级与位数跟 formatGN 同一把尺,但**末位一律向上进一**。
 * 「灵石尚差」这类提示照它写才保证按提示补足一定够 —— formatGN 是四舍五入,
 * 1.824 会印成「1.8」,玩家补 1.8 仍然不够(见 docs/superpowers/plans/2026-11-01-format-gn-shortfall-underreport.md)。
 * 只给差额用,不要拿它替换全站展示的 formatGN:精度一变,阅读密度与列宽都会跟着动。
 */
export function formatGap(v: GNum | number): string {
  const g = typeof v === 'number' ? gn(v) : v
  // 与 formatGN 同一道守卫:对象分支不经过 gn(),坏值会一路走到 toNum/ceilTo
  if (!Number.isFinite(g.m) || !Number.isFinite(g.e)) return NOT_AVAILABLE
  /*
   * 指数**本身**也得是「小整数」,不只是有限。
   *
   * 兜底那条路是 `` `${m}e${g.e}` `` —— 直接拼 `g.e`。若 `g.e` 是 1e22,
   * 拼出来就是「1.00e1e+22」:科学计数里套了一层科学计数,读都读不出来。
   * `asBoundedGNum` 读档时已把 |e| 夹到 999,但这里是**公共函数**,
   * 不能假定每个调用方都先过那道关(界面上、审计脚本里都直接调)。
   * 与 SAVE_GNUM_MAX_EXP 同一把尺:超过它的指数只可能来自坏档。
   */
  if (Math.abs(g.e) > 999) return NOT_AVAILABLE
  if (g.m === 0) return '0'
  // 负数没有「尚差」语义,退回原格式化
  if (g.m < 0) return formatGN(g)
  if (g.e < 4) {
    const n = toNum(g)
    if (n < 1000) return trimZero(String(ceilTo(n, plainStep(n))))
    return ceilTo(n, 1).toLocaleString('en-US')
  }
  const unitIdx = Math.floor(g.e / 4) - 1
  if (unitIdx >= UNITS.length) return formatGN(g)
  const value = g.m * Math.pow(10, g.e - (unitIdx + 1) * 4)
  return trimZero(String(ceilTo(value, unitStep(value)))) + UNITS[unitIdx]
}

/** formatGN 在 n < 1000 档留到的末位(0.001 / 0.1 / 1),差额须进到同一位 */
function plainStep(n: number): number {
  if (n < 100 && !Number.isInteger(n)) {
    return n > 0 && n < 0.1 ? Math.pow(10, Math.floor(Math.log10(n)) - 1) : 0.1
  }
  return 1
}

/** formatGN 在中文单位档留到的末位,与 fixedByMag 的位数一一对应 */
function unitStep(v: number): number {
  if (v < 10) return 0.001
  if (v < 100) return 0.01
  if (v < 1000) return 0.1
  return 1
}

/** 向上进到 step 的整数倍;先抹浮点尾差,免得 1.8 因为 1.8000000000000002 多进一格 */
function ceilTo(n: number, step: number): number {
  const scaled = Math.round((n / step) * 1e6) / 1e6
  return Number((Math.ceil(scaled) * step).toFixed(10))
}

function trimZero(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

export function formatNum(n: number): string {
  // 不先 gn(n):那会把原值压成 { m, e },千位档的半值进位随之丢失(999.5 → 999)。
  // formatGN 自己会分辨 number 与 GNum。
  return formatGN(n)
}

/** 速率:xx/秒 */
export function formatRate(v: GNum | number): string {
  return `${formatGN(v)}/秒`
}

/**
 * 明细按显示精度取整并对账:先各自向下取整,差额按余数从大到小补齐,
 * 显示出来的各行相加正好等于原值合计的取整。unit 为最小显示单位(百分比一位小数即 0.001)。
 */
export function roundToSum(values: readonly number[], unit: number): number[] {
  /*
   * 坏值守卫。缺了它有三个坑:
   *   unit = 0 / NaN / Infinity → 每项都变 NaN(除以 0 或非有限数)
   *   values 里某一项是 NaN / Infinity → 那一项变 NaN,还会把 target 的合计带偏
   * 返回的 NaN 会原样进入调用方的展示与配色判断(见 cultivationText 的 breakthroughRateView)。
   * 默认返回全 0:调用方按「没有可分配的份额」处理,比一串 NaN 安全。
   */
  if (!Number.isFinite(unit) || unit <= 0) return values.map(() => 0)
  if (values.length === 0) return []
  if (!values.every(v => Number.isFinite(v))) return values.map(() => 0)
  // 先抹浮点尾差:0.8599999999999999 / 0.001 不该落到 859
  /*
   * 缩放**过程**本身也会上溢:unit 极小(1e-300)配 values 极大(1e300)时,
   * `v / unit` 得 Infinity,`Math.round(Infinity)` 仍是 Infinity ——
   * 上面三段守卫都过了(unit 有限且 > 0、每项都有限),可返回的却是一串 null。
   * 故缩放完再验一遍:任一项非有限,与「没有可分配的份额」同样处理。
   */
  const scaled = values.map(v => Math.round((v / unit) * 1e6) / 1e6)
  if (!scaled.every(v => Number.isFinite(v))) return values.map(() => 0)
  const target = Math.round(scaled.reduce((a, b) => a + b, 0))
  // 合计也可能上溢(单项都有限、加起来却成了 Infinity)
  if (!Number.isFinite(target)) return values.map(() => 0)
  const out = scaled.map(v => Math.floor(v))
  let short = target - out.reduce((a, b) => a + b, 0)
  const byRemainder = scaled.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r)
  for (const { i } of byRemainder) {
    if (short <= 0) break
    out[i] = (out[i] ?? 0) + 1
    short -= 1
  }
  return out.map(n => n * unit)
}

/** 百分比:0.125 → 12.5%;非法值(NaN/Infinity)显示 -- */
export function formatPercent(x: number, dp = 1): string {
  if (!Number.isFinite(x)) return NOT_AVAILABLE
  const v = x * 100
  // x 有限但 x*100 上溢(约 1e306 以上)
  if (!Number.isFinite(v)) return NOT_AVAILABLE
  // 极小值显示 0%,不出「-0%」
  if (Math.abs(v) < Math.pow(10, -dp)) return '0%'
  /*
   * 大值须自己兜底:`String(1e22)` 是 `1e+22`,而这条路径既过了 `isFinite`
   * (1e22 是有限数)也过了上面的上溢检查(×100 后仍是有限数)——
   * 于是 percent 会印出「1e+22%」这种非法数字。实测从 1e20 起就开始了。
   *
   * 兜底与 formatGN 同形:`1.00e22`(尾数两位、指数不带 + 号),
   * 而不是 JS 的 `1e+22` —— 全站只该有一种科学计数写法。
   */
  if (Math.abs(v) >= 1e21) {
    let exp = Math.floor(Math.log10(Math.abs(v)))
    let mant = v / Math.pow(10, exp)
    /*
     * 尾数进位:`mant` 可能四舍五入成 10.00(如 v = 9.9999e21 → 9.9999 → 10.00),
     * 那时须把指数抬一位、尾数回到 1.00 —— 否则输出 `10.00e21%`,
     * 它既不是规范写法,读起来也比真值小一个数量级。
     * formatGN 的兜底早有这一步(注释:`9.99…e407 → 1.00e408`),这里沿用同一条。
     */
    if (Math.abs(mant).toFixed(2) === '10.00') {
      exp += 1
      mant = v / Math.pow(10, exp)
    }
    return `${mant.toFixed(2)}e${exp}%`
  }
  const s = Number.isInteger(v) ? String(v) : v.toFixed(dp)
  return `${trimZero(s)}%`
}

/**
 * 时长:秒 → 中文可读;非法值(NaN/Infinity)显示 --。
 *
 * 末位为零的单位不写:整小时写「1小时」,不写「1小时0分」。
 * 这条与 formatChoiceSpan 的「整分钟写 10分钟」同一口径,是对同一种缺口的补齐 ——
 * 修行页的「修为圆满约 100天0小时」、历练页的「行程 1小时0分」都印着那个没信息的 0,
 * 而中文时长本就没有「1天0小时」这种说法。
 */
export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NOT_AVAILABLE
  const sec = Math.max(0, Math.floor(totalSec))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  /*
   * 天数过大时退回中文单位,不印裸数字。
   *
   * `Math.floor(1e300 / 86400)` 是有限值,能过上面的守卫,但拼出来是
   * 「1.1574074074074075e+295天17小时」—— 十七位小数的科学计数法。
   * 本作其余地方(灵石、修为)都用 UNITS 那套万进单位,时间这条也该一致:
   * 超过一亿天(≈27 万年)就交给 formatGN,写「1157万天」而不是一串浮点。
   * 真实游玩到不了这个量级(混沌道祖寿元约 1e15 载),它只拦坏档。
   */
  if (d >= DURATION_DAY_UNIT_CAP) return `${formatGN(d)}天${h > 0 ? `${h}小时` : ''}`
  if (d > 0) return h > 0 ? `${d}天${h}小时` : `${d}天`
  if (h > 0) return m > 0 ? `${h}小时${m}分` : `${h}小时`
  if (m > 0) return s > 0 ? `${m}分${s}秒` : `${m}分`
  return `${s}秒`
}

/** 选择项上的时长;整分钟写「10分钟」,不写「10分0秒」 */
export function formatChoiceSpan(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NOT_AVAILABLE
  const sec = Math.max(0, Math.floor(totalSec))
  if (sec > 0 && sec % 60 === 0 && sec < 3600) return `${sec / 60}分钟`
  return formatDuration(sec)
}

/**
 * 倒计时:与 formatDuration 同义,但同一量级内逐位定宽(状态胶囊 nowrap,宽度变化会挤动整排)。
 * 数字等宽另靠 .tabular(tabular-nums)。
 */
export function formatCountdown(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NOT_AVAILABLE
  const sec = Math.max(0, Math.floor(totalSec))
  const pad2 = (n: number): string => String(n).padStart(2, '0')
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  /*
   * 与 formatDuration 同一条门槛。
   *
   * 「逐位定宽」是为了状态胶囊 nowrap 时宽度不抖 —— 那是在**正常量级**内的诉求。
   * 天数到八位(坏档塞一个 MAX_TIMESTAMP_MS 内的极大时间戳就能到)时,
   * 定宽已无从谈起,裸数字反而读不出来,故一并改用中文单位。
   */
  if (d >= DURATION_DAY_UNIT_CAP) return `${formatGN(d)}天${pad2(h)}时`
  if (d > 0) return `${d}天${pad2(h)}时`
  if (h > 0) return `${pad2(h)}时${pad2(m)}分`
  return `${pad2(m)}分${pad2(s)}秒`
}

/**
 * 时间戳 → 「HH:MM」(本地时)。
 *
 * 坏值一律印占位符,不印 `NaN:NaN`:
 * 这个函数有两处输入**不是本机产生的** —— 导入确认框里的 `exportedAt` 来自别人导出的文件,
 * `diag` 留档的时间戳来自可能损坏的持久化分片。`new Date(8640000000000001)`
 * (超出 Date 范围)与 `Infinity` 都让 `getHours()` 返回 NaN,印出来就是「NaN:NaN」。
 * 判据见 format.spec「时钟时刻」。
 */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 时间戳 → 「月-日 HH:MM」(本地时)。
 *
 * 导入确认框原先用 `formatClock`,只印「14:32」—— 而那正是玩家决定要不要**整体覆盖**本档的地方。
 * 一份三天前导出的备份与一份一小时前导出的备份,印出来只差一个时刻,
 * 看不出哪份更新。跨年时补上年份,免得两份「01-03 09:00」分不清。
 *
 * 坏值同样印占位符:这个时间戳来自别人导出的文件,不是本机产生的。
 */
export function formatStamp(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--'
  const pad = (n: number): string => String(n).padStart(2, '0')
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const monthDay = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // 同一历年只印月日;跨年(或年份坏掉)时补年份
  if (d.getFullYear() === new Date(now).getFullYear()) return `${monthDay} ${clock}`
  return `${d.getFullYear()}-${monthDay} ${clock}`
}

/**
 * 寿元年数展示。
 *
 * 数字与「载」之间留一个空格,与全站其他单位一致:模板里 `{{ formatGN(x) }} 石`、
 * `{{ n }} 场`、`{{ n }} 层` 无一例外都是分开的(中英混排本来就该留),
 * 唯独这一个把单位拼进了函数返回值,印出来是「150载」。
 */
export function formatYears(y: number): string {
  // 坏值守卫:缺了它 Math.floor(NaN) 会印出「NaN 载」,Math.floor(-Infinity) 印「-Infinity 载」
  if (!Number.isFinite(y)) return NOT_AVAILABLE
  /*
   * 负值走 formatNum 那条,不走裸数字。
   *
   * 下面那句 `${Math.floor(y)} 载` 只适合小正数;`-1e22` 会被 JS 转成
   * 「-1e+22」,于是印出「-1e+22 载」。而负寿元本身就只可能来自坏档
   * (player.sanitize 把 age 拉回 START_AGE),这里不必保留「-」的语义,
   * 但也不该印脏串 —— 交给 formatNum,与正值同一条格式化路径。
   */
  if (Math.abs(y) >= 10000) return `${formatNum(Math.floor(y))} 载`
  return `${Math.floor(y)} 载`
}

/**
 * 小数字 → 汉字(4 → 四,21 → 二十一);页面上的数量从来源数出来再转,不手打。
 * 只做到 9999,范围外原样返回阿拉伯数字。
 */
export function cnNumber(n: number): string {
  // 坏值守卫:范围判断走 `!Number.isInteger(n)`,NaN 恰好命中并落到 String(n) → 「NaN」
  if (!Number.isFinite(n)) return NOT_AVAILABLE
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n)
  const DIGITS = '零一二三四五六七八九'
  const UNITS = ['', '十', '百', '千']
  if (n < 10) return DIGITS[n]!
  const str = String(n)
  const len = str.length
  let out = ''
  let pendingZero = false
  for (let i = 0; i < len; i++) {
    const digit = Number(str[i])
    if (digit === 0) {
      pendingZero = true
      continue
    }
    if (pendingZero && out) out += DIGITS[0]
    pendingZero = false
    // 十、十二、十四……前导的「一」不成词
    if (!(len === 2 && i === 0 && digit === 1)) out += DIGITS[digit]
    out += UNITS[len - 1 - i]
  }
  return out
}
