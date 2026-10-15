/**
 * 成就方向 · 每个「???」都得有地方可去
 *
 * 未达成的成就在界面上不现名目(成时自现),但**方向**得给:「方向:历练际遇」
 * 让玩家知道哪儿跟他有关。方向由条件推出,故这里守三件事:
 *
 *   一 每条成就都定得出方向(不许出现 undefined / 空话);
 *   二 计数器联合类型里的每一个键,方向表里都有 —— 从 types/index.ts 扫出来核,
 *      而不是重抄一份(CounterKey 是手写联合,重抄等于养第二份清单);
 *   三 反向也不许多:方向表里不许有已经消失的计数器(死条目)。
 *
 * 故障注入:删掉方向表里的任一条(如 events),或往 CounterKey 里加一个新键,本文件立刻红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ACHIEVEMENTS } from '@/data/achievements'
import { COUNTER_DIRECTIONS, achievementDirection, COUNTER_GROUPS, ACHIEVEMENT_GROUP_LABEL, achievementGroup } from '@/ui/achievementHint'

/**
 * 从类型声明里扫出 CounterKey 的联合成员 —— 手写联合,故只能扫源码。
 * 结束点取后一个类型声明(同 vocabularyCoverage 的 unionMembers),不能用空行切块:
 * Windows 上 CRLF 行尾下没有 `\n\n`,切块会滑到文件尾把无关字面量扫进来。
 */
function counterKeysFromTypes(): string[] {
  const src = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf8')
  const start = src.indexOf('export type CounterKey =')
  expect(start, 'types/index.ts 里找不到 CounterKey').toBeGreaterThanOrEqual(0)
  const end = src.indexOf('export type AchvCond', start)
  const block = src.slice(start, end > 0 ? end : undefined)
  return [...new Set([...block.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]!))]
}

describe('成就方向 · 每个「???」都有地方可去', () => {
  it('每条成就都定得出方向,不是空话', () => {
    const bad: string[] = []
    for (const a of ACHIEVEMENTS) {
      const dir = achievementDirection(a.cond)
      if (!dir || dir.length < 2) bad.push(`${a.id}(${a.name})`)
    }
    expect(bad, `这些成就给不出方向:${bad.join('、')}`).toEqual([])
  })

  it('计数器联合类型里的每个键,方向表里都有', () => {
    const declared = counterKeysFromTypes()
    expect(declared.length, '一个计数器都没扫到,断言形同虚设').toBeGreaterThan(10)
    const missing = declared.filter(k => !(k in COUNTER_DIRECTIONS))
    expect(missing, `这些计数器没有方向 —— 用到它的成就只会显示「???」:${missing.join('、')}`).toEqual([])
  })

  it('反向也不许多:方向表里不许有已经消失的计数器', () => {
    const declared = new Set(counterKeysFromTypes())
    const dead = Object.keys(COUNTER_DIRECTIONS).filter(k => !declared.has(k))
    expect(dead, `方向表里这些键已经不在 CounterKey 里了:${dead.join('、')}`).toEqual([])
  })

  it('四类条件都接得住(新增条件类型时这里会先红)', () => {
    const kinds = [...new Set(ACHIEVEMENTS.map(a => a.cond.type))]
    for (const kind of kinds) {
      const sample = ACHIEVEMENTS.find(a => a.cond.type === kind)!
      expect(achievementDirection(sample.cond), `条件类型 ${kind} 没有方向文案`).toBeTruthy()
    }
    expect(kinds.length, '成就只覆盖了一种条件类型,判据覆盖不到别的').toBeGreaterThanOrEqual(3)
  })

  it('每条成就在主题表里都有归属(分组标题读得到)', () => {
    const bad: string[] = []
    for (const a of ACHIEVEMENTS) {
      const g = achievementGroup(a.cond)
      if (!ACHIEVEMENT_GROUP_LABEL[g]) bad.push(a.id)
    }
    expect(bad, `这些成就没有主题标题:${bad.join('、')}`).toEqual([])
  })

  it('计数器联合类型的每个键,主题表里都有', () => {
    const declared = counterKeysFromTypes()
    expect(declared.length, '一个计数器都没扫到,断言形同虚设').toBeGreaterThan(10)
    const missing = declared.filter(k => !(k in COUNTER_GROUPS))
    expect(missing, `这些计数器没有主题:${missing.join('、')}`).toEqual([])
  })

  it('反向也不许多:主题表里不许有已经消失的计数器', () => {
    const declared = new Set(counterKeysFromTypes())
    const dead = Object.keys(COUNTER_GROUPS).filter(k => !declared.has(k))
    expect(dead, `主题表里这些键已经不在 CounterKey 里了:${dead.join('、')}`).toEqual([])
  })
})
