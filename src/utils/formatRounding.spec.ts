/**
 * 千位档的半值进位。
 *
 * `gn(999.5)` 存成 `{ m: 9.995, e: 2 }`,回算 `9.995 * 100` 得到 `999.4999999999999`,
 * `Math.round` 于是给 999 —— 而同一个函数对 999.6 给 1000、对 1000.5 给 1,001。
 * 同一档里半值进位时灵时不灵,而差额、报价、奖励都走这条路。
 *
 * 修法:传进来就是 number 的,原值有完整精度,千位档直接用原值取整;
 * 传 GNum 的(来自存档)没有原值,按 m·10^e 回算是数据本来的精度。
 */
import { describe, expect, it } from 'vitest'
import { gn } from './gnum'
import { formatGN, formatNum, formatRate } from './format'

describe('formatGN · 千位档半值进位', () => {
  it('千位档的每个半值都与四舍五入一致', () => {
    // 千位档从 1000 起:999.x 里只有 999.5 会进位进档,按两支的各自口径核对
    const bad: string[] = []
    for (let i = 1000; i <= 1500; i += 1) {
      const v = i + 0.5
      const want = Math.round(v).toLocaleString('en-US')
      const got = formatNum(v)
      if (got !== want) bad.push(`${v} → ${got},应为 ${want}`)
    }
    // <1000 档下沿:999.5 进位成 1000,但档位按取整前判,故不带千分位(既有口径)
    if (formatNum(999.5) !== '1000') bad.push(`999.5 → ${formatNum(999.5)},应为 1000`)
    expect(bad, `这些半值被吃掉了:\n${bad.slice(0, 8).join('\n')}`).toEqual([])
  })

  it('999.5 这一处就是当初翻出来的那个', () => {
    // 修复前:gn(999.5) → { m: 9.995, e: 2 },toNum 回算 999.4999…,Math.round 给 999
    expect(formatNum(999.5)).toBe('1000')
    expect(formatGN(999.5)).toBe('1000')
    expect(formatRate(999.5)).toBe('1000/秒')
  })

  it('同档上下相邻值不再互相矛盾', () => {
    // 修复前 999.5→999 而 999.6→1,000,同一个「千位档」给出两种态度。
    // 999.4 走的是「< 1000 取整」那一支(不带千分位),这是既有口径,不是本轮改的
    expect(formatNum(999.4)).toBe('999')
    expect(formatNum(999.5)).toBe('1000')
    expect(formatNum(999.6)).toBe('1000')
  })

  it('低于千位仍保留小数,不被顺手取整', () => {
    expect(formatNum(9.5)).toBe('9.5')
    expect(formatNum(99.5)).toBe('99.5')
  })

  it('传 GNum 时按数据本来的精度回算(不是缺陷)', () => {
    // 存档里只有 { m, e },没有原值;9.995 乘 100 还原就是 999.4999…,这条钉住口径不变。
    // gn(999.5) 与手写 { m: 9.995, e: 2 } 是同一个值,故两者一致
    expect(formatGN(gn(999.5))).toBe('999')
    expect(formatGN({ m: 9.995, e: 2 })).toBe('999')
  })
})
