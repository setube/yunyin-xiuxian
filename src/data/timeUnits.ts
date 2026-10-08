/**
 * 古语时制与现代时长的对应 —— 文案里的古语必须落在这张表上
 *
 * 起因与 xian 同一处:云隐丹药曾写「服之如闭关半时 / 一时 / 二时 / 三时」,
 * 「时」读者自然会读成「时辰」,而一个时辰是**两小时** —— 于是一整套修为丹
 * 的时长文案都比实际值大一倍(半时 1800s 被读成半小时的时辰 1 小时,
 * 一时 3600s 被读成 1 时辰 2 小时)。「半个时辰内修炼倍增」的聚灵丹更是
 * 白纸黑字写了个时辰(1 小时),实际只持续一炷香(30 分钟)。
 *
 * 古色古香可以留,但古语一旦落到时长上,就得与现代时长对得上:
 * 玩家读「一炷香」时,界面里显示的分钟数必须真是 30。
 *
 * 传统对应(本作采用的口径,与 xian 同表):
 *   一盏茶 = 10 分钟 · 一刻 = 15 分钟 · 一炷香 = 30 分钟
 *   半个时辰 = 1 小时(即 4 刻)· 一个时辰 = 2 小时(即 8 刻)
 *   一夜 = 6 时辰,一日 = 12 时辰(24 小时)
 *
 * 两条纪律:
 *   一 只有**确切落在**表上的时长才用古语;落不上的用「将近 X / X 有余」,
 *      并在括号里给出分钟数 —— 宁可说"将近一刻(约九分)",不许把九分写成半刻;
 *   二 任何带时长的文案都由 timeUnits.spec 对着数据反查(见那个判据),
 *      改了数值忘了改文案,CI 直接红。
 *
 * 本表是时长文案的**唯一事实源**:丹药描述、buff 描述、以及「折合闭关」这类
 * 给玩家交代"这一味抵我多久"的地方,都从这里取字(见 core/pillService 与
 * ui/itemText),不再各写一份。通用时长棋子(倒计时 / 总时长 / 研读 ETA)仍走
 * utils/format 的 formatDuration/formatCountdown —— 那是"还有多久"的计时器,
 * 不该在定宽胶囊里冒出「一炷香」这种会跳宽的字。
 */

/** 一盏茶 */
export const TEA_SEC = 600
/** 一刻(一刻钟) */
export const KE_SEC = 900
/** 一炷香 */
export const INCENSE_SEC = 1800
/** 半个时辰(= 一时,1 小时) */
export const HALF_SHICHEN_SEC = 3600
/** 一个时辰(= 二时,2 小时) */
export const SHICHEN_SEC = 7200

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const

/** 1..99 的汉字数词(时辰/刻的倍数用得上) */
export function cnNum(n: number): string {
  if (n <= 10) return CN[n]!
  if (n < 20) return `十${n === 10 ? '' : CN[n - 10]}`
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${CN[tens]}十${ones === 0 ? '' : CN[ones]}`
}

/** 现代时长:小时优先,不足一小时说分钟 */
export function modernDuration(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} 小时`
  if (sec % 60 === 0) return `${sec / 60} 分钟`
  return `${Math.round(sec)} 秒`
}

/** 计数的量词用字:2 说「两」(两个时辰 / 两刻),其余走 cnNum */
function countWord(n: number): string {
  return n === 2 ? '两' : cnNum(n)
}

/**
 * 把秒数写成古今对照的一句:「一炷香(30 分钟)」。
 *
 * 落不在表上的时长不外推古语,而是给「将近 / 有余」并附分钟数 —— 古语可以模糊,
 * 但模糊必须写在明处。供「折合闭关」这类给玩家交代时长的文案复用。
 */
export function classicalDuration(sec: number): string {
  const exact: Record<number, string> = {
    [TEA_SEC]: '一盏茶',
    [KE_SEC]: '一刻',
    [INCENSE_SEC]: '一炷香',
    [HALF_SHICHEN_SEC]: '半个时辰',
    [SHICHEN_SEC]: '一个时辰',
  }
  const hit = exact[sec]
  if (hit) return `${hit}(${modernDuration(sec)})`
  if (sec % SHICHEN_SEC === 0) return `${countWord(sec / SHICHEN_SEC)}个时辰(${modernDuration(sec)})`
  // 半个时辰的奇数倍(1.5 / 2.5 时辰)—— 说「一个半时辰」比「十二刻」像人话
  if (sec % HALF_SHICHEN_SEC === 0)
    return `${countWord((sec - HALF_SHICHEN_SEC) / SHICHEN_SEC)}个半时辰(${modernDuration(sec)})`
  if (sec % KE_SEC === 0) return `${countWord(sec / KE_SEC)}刻(${modernDuration(sec)})`
  // 落在两档之间:说清它与最近那一档的关系,并给出确切分钟数
  const near = Math.floor(sec / KE_SEC) * KE_SEC
  if (near >= KE_SEC) return `${countWord(near / KE_SEC)}刻有余(${modernDuration(sec)})`
  return `将近一刻(${modernDuration(sec)})`
}

/**
 * 从文案里认出时制词 → 秒;认不出返回 null。
 *
 * 供判据反查用:凡文案里写了「X 个时辰 / X 刻 / 一炷香 / 一盏茶」,
 * 都能折成一个秒数,再与数据里的真实时长对账。
 */
const CN_DIGIT: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function cnToNum(s: string): number | null {
  if (s === '半') return 0.5
  if (s.length === 1 && CN_DIGIT[s] !== undefined) return CN_DIGIT[s]!
  if (s.startsWith('十')) return 10 + (s.length > 1 ? (CN_DIGIT[s[1]!] ?? 0) : 0)
  if (s.includes('十')) {
    const [a, b] = s.split('十')
    const tens = CN_DIGIT[a!] ?? 1
    const ones = b ? (CN_DIGIT[b] ?? 0) : 0
    return tens * 10 + ones
  }
  return null
}

export interface ClassicalClaim {
  /** 折出的秒数 */
  sec: number
  /**
   * 是确切说法还是"将近 / 有余"的近似说法。
   * 近似说法只许落在最近那一档的一刻之内,且方向要对(将近 < 值 < 有余)。
   */
  exact: boolean
}

export function parseClassicalDuration(text: string): ClassicalClaim | null {
  // 支持「半个时辰」「一个时辰」「一个半时辰」「两个半时辰」四种写法
  const m =
    /(将近|有余)?\s*(半|[一二两三四五六七八九十]+)?\s*(个)?\s*(半)?\s*(时辰|刻|炷香|盏茶)(有余)?/.exec(
      text
    )
  if (!m) return null
  const exact = !m[1] && !m[6]
  const unit = m[5]!
  const per =
    unit === '时辰'
      ? SHICHEN_SEC
      : unit === '刻'
        ? KE_SEC
        : unit === '炷香'
          ? INCENSE_SEC
          : TEA_SEC
  // 「一炷香」「一盏茶」是专名,数量词不参与乘法
  if (unit === '炷香' || unit === '盏茶') return { sec: per, exact }
  let n: number | null
  if (m[4]) {
    // 「一个半时辰」= 整数 + 半个
    const whole = m[2] && m[2] !== '半' ? cnToNum(m[2]) : 0
    n = whole === null ? null : whole + 0.5
  } else {
    n = m[2] ? cnToNum(m[2]) : 1
  }
  if (n === null) return null
  const sec = n * per
  return { sec, exact }
}
