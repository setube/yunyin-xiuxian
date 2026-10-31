/**
 * 胜率档位文案:compare.ts 与 lab.ts 各写了一份同一套阈值链与文案表。
 * 两处不一致会让「构筑对照」和「换装推演」对同一个胜率给出不同档位 —— 玩家看到自相矛盾的说法。
 *
 * 这里不要求它们合并(重构会牵动两个调用点),只要求「别漂移」:
 * 从两边源码各抽一次阈值与文案,逐一比对。新增档位或调整阈值时,两边必须同时改,否则本条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = (f: string): string => readFileSync(resolve(__dirname, f), 'utf-8')

/** 抽出一段源码里出现的档位文案数组 */
function rankTexts(code: string): string[] {
  const m = /RANK_TEXT = \[([^\]]+)\]/.exec(code)
  if (!m) throw new Error('没找到 RANK_TEXT 数组')
  return [...m[1]!.matchAll(/'([^']+)'/g)].map(x => x[1]!)
}

/** 抽出阈值链(>= 后面跟的数字,按出现顺序) */
function thresholds(code: string): number[] {
  const line = /rate >= [\d.]+ \? \d[\s\S]*?: 0/.exec(code)
  if (!line) throw new Error('没找到阈值链')
  return [...line[0].matchAll(/rate >= ([\d.]+)/g)].map(x => Number(x[1]))
}

describe('胜率档位 · 两个模块不许漂移', () => {
  it('文案表一致', () => {
    const a = rankTexts(src('compare.ts'))
    const b = rankTexts(src('lab.ts'))
    expect(a, '两处档位文案必须相同').toEqual(b)
    expect(a.length).toBeGreaterThanOrEqual(3)
  })

  it('阈值链一致', () => {
    const a = thresholds(src('compare.ts'))
    const b = thresholds(src('lab.ts'))
    expect(a, '两处阈值必须逐项相同(顺序也算)').toEqual(b)
  })

  it('阈值从高到低排列 —— 否则档位判定会短路', () => {
    const ts = thresholds(src('compare.ts'))
    const sorted = [...ts].sort((x, y) => y - x)
    expect(ts, '阈值必须降序,三目链才有意义').toEqual(sorted)
  })

  it('档位数 = 阈值数 + 1(最低档是兜底)', () => {
    const texts = rankTexts(src('compare.ts'))
    const ts = thresholds(src('compare.ts'))
    expect(texts.length, '5 个文案对应 4 个阈值').toBe(ts.length + 1)
  })

  it('抽取器本身有效(阳性对照):确实抽到了东西', () => {
    expect(rankTexts(src('compare.ts')).length).toBeGreaterThan(0)
    expect(thresholds(src('compare.ts')).length).toBeGreaterThan(0)
  })
})
