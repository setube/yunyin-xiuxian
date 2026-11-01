/**
 * 丹药文案里的时长必须与实发一致。
 *
 * pills.ts 的 desc 是手写字符串,19 条带具体时长(「服之如闭关一刻(15 分钟)」),
 * 真实值在 `instant.expSecs`(闭关等效秒数)或 `buff.durationSec`(buff 时长)。
 * 两者之间没有任何机制约束 —— 调数值忘了改文案,玩家读到的就是假的。
 *
 * 与 earlyGameText.spec 同一条思路(那边比的是百分比,这边是时长)。
 * 现状 19 条全部吻合,这条守卫是为了后续调数值时不脱节。
 */
import { describe, expect, it } from 'vitest'
import { PILLS } from '@/data/pills'
import { buffDef } from '@/data/buffs'

/** 从 desc 里抽括号内的时长,折算成秒;没有则 null */
function claimedSecIn(desc: string): number | null {
  const h = /\((\d+(?:\.\d+)?)\s*小时\)/.exec(desc)
  if (h) return Number(h[1]) * 3600
  const m = /\((\d+(?:\.\d+)?)\s*分钟\)/.exec(desc)
  if (m) return Number(m[1]) * 60
  return null
}

describe('丹药文案 · 时长与实发一致', () => {
  it('文案写了时长就必须能对上真实来源(expSecs 或 buff 时长)', () => {
    const problems: string[] = []
    for (const p of PILLS) {
      const claimed = claimedSecIn(p.desc)
      if (claimed === null) continue
      const actual = p.instant?.expSecs ?? (p.buffId ? buffDef(p.buffId)?.durationSec : undefined)
      if (actual === undefined) {
        problems.push(`${p.name}(${p.id}) 文案有时长,但既无 instant.expSecs 也无可用 buff`)
        continue
      }
      if (Math.abs(actual - claimed) > 1) {
        problems.push(`${p.name}(${p.id}) 文案 ${claimed}s,实际 ${actual}s`)
      }
    }
    expect(problems, problems.join('; ')).toEqual([])
  })

  it('至少覆盖到若干条时长文案(防止正则失效后空转)', () => {
    const n = PILLS.filter(p => claimedSecIn(p.desc) !== null).length
    expect(n, '一条时长文案都没抽到,正则可能已失配').toBeGreaterThanOrEqual(10)
  })

  it('没有「裸时长」—— 括号里带数字的都该被上面那条覆盖到', () => {
    // 若将来出现「(90 息)」这类新单位,这里会先红,提醒扩单位表而不是静默漏掉
    const odd = PILLS.filter(p => /\([^)]*\d[^)]*\)/.test(p.desc) && claimedSecIn(p.desc) === null)
    expect(odd.map(p => p.name), '出现了解析不了的时长写法').toEqual([])
  })
})
