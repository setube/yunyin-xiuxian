/**
 * 统一数值格式化 —— 中文单位 + 科学计数法兜底
 */
import type { GNum } from '@/types'
import { gn, toNum } from './gnum'

/** 每 4 个数量级一个中文单位 */
const UNITS = ['万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载', '极'] as const

/** 格式化大数:1,234 → 12.35万 → 1.235亿 → 1.24e52 */
export function formatGN(v: GNum | number): string {
  const g = typeof v === 'number' ? gn(v) : v
  if (g.m === 0) return '0'
  if (g.m < 0) return '-' + formatGN({ m: -g.m, e: g.e })
  if (g.e < 4) {
    const n = toNum(g)
    if (n < 1000) {
      if (n < 100 && !Number.isInteger(n)) {
        // 0.04 显示成 0.04、0.004 也应收着——任何正收益都不该因为太细碎而显示成 0。
        // 位数随数量级抬升(0.04→2 位,0.004→3 位),封顶 6 位,杜绝 0.0000000001 刷屏
        const tiny = n > 0 && n < 0.1 ? n.toFixed(Math.max(2, Math.min(6, 1 - Math.floor(Math.log10(n))))) : n.toFixed(1)
        return trimZero(tiny)
      }
      // 与 <100 档(四舍五入)一致,不再向下取整:999.6 显示 1000 而非 999
      return String(Math.round(n))
    }
    return Math.floor(n).toLocaleString('en-US')
  }
  const unitIdx = Math.floor(g.e / 4) - 1
  if (unitIdx >= UNITS.length) {
    return `${g.m.toFixed(2)}e${g.e}`
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

function trimZero(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** 格式化普通数字(整数展示) */
export function formatNum(n: number): string {
  return formatGN(gn(n))
}

/** 速率:xx/秒 */
export function formatRate(v: GNum | number): string {
  return `${formatGN(v)}/秒`
}

/** 数值非法时的统一占位(避免界面出现 NaN%/Infinity%) */
const NOT_AVAILABLE = '--'

/** 百分比:0.125 → 12.5%;非法值(NaN/Infinity)显示 -- */
export function formatPercent(x: number, dp = 1): string {
  if (!Number.isFinite(x)) return NOT_AVAILABLE
  const v = x * 100
  // x 有限但 x*100 上溢(约 1e306 以上)时,v 会变 Infinity —— 同样要给占位,不能吐 "Infinity%"
  if (!Number.isFinite(v)) return NOT_AVAILABLE
  // -0.001% 这类连一位小数都到不了的极小值,不该显示成「-0%」吓人
  if (Math.abs(v) < Math.pow(10, -dp)) return '0%'
  const s = Number.isInteger(v) ? String(v) : v.toFixed(dp)
  return `${trimZero(s)}%`
}

/** 时长:秒 → 中文可读;非法值(NaN/Infinity)显示 -- */
export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NOT_AVAILABLE
  const sec = Math.max(0, Math.floor(totalSec))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (d > 0) return `${d}天${h}小时`
  if (h > 0) return `${h}小时${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

/**
 * 选择项上的时长。整分钟写成「10分钟」,不走倒计时那套「10分0秒」——
 * 那是为了定宽,放在三选一的说明里反而像计时器在跳。
 */
export function formatChoiceSpan(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NOT_AVAILABLE
  const sec = Math.max(0, Math.floor(totalSec))
  if (sec > 0 && sec % 60 === 0 && sec < 3600) return `${sec / 60}分钟`
  return formatDuration(sec)
}

/**
 * 倒计时 —— 与 formatDuration 同义,但**逐位定宽**。
 *
 * 状态面板里的每一枚状态胶囊都在倒计时,而 formatDuration 的宽度会随数值变:
 * 「9分59秒」(6 字)下一秒变「10分0秒」,再下一秒变「10分1秒」——
 * 胶囊是 nowrap 的,宽度一涨一缩,同一行里后面的胶囊整排跟着左右跳,
 * 于是玩家看到的就是「状态信息一直在抖」。
 *
 * 定宽的做法:分钟/秒一律补零到两位,不足一分钟也写「00分SS秒」,
 * 于是**同一量级内**每一秒的文本宽度完全相同(逐位替换,不换行不回流)。
 * 数字本身另由 .tabular(tabular-nums)保证等宽,两者合起来才真的不动。
 */
export function formatCountdown(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NOT_AVAILABLE
  const sec = Math.max(0, Math.floor(totalSec))
  const pad2 = (n: number): string => String(n).padStart(2, '0')
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (d > 0) return `${d}天${pad2(h)}时`
  if (h > 0) return `${pad2(h)}时${pad2(m)}分`
  return `${pad2(m)}分${pad2(s)}秒`
}

/** 时间戳 → 「HH:MM」(本地时)—— 倒计时旁那句「约几时归」的落点 */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 寿元年数展示 */
export function formatYears(y: number): string {
  if (y >= 10000) return formatNum(Math.floor(y)) + '载'
  return `${Math.floor(y)}载`
}

/**
 * 小数字 → 汉字(4 → 四,21 → 二十一)。
 *
 * 用途只有一个:**页面上写「四界二十一境」「六十四卦」这类数量时,数字得从来源数出来**,
 * 而不是手打。手打的数字在内容增长那天就变成谎话(加了第 5 个界域,文案还写四界),
 * 且没有任何地方会因此报错。
 *
 * 只做到 9999:此范围之外说明这个数字不该以汉字出现,原样返回阿拉伯数字更诚实。
 */
export function cnNumber(n: number): string {
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
