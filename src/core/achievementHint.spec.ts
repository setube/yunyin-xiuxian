/**
 * 成就方向:未达成成就不现名目,但须给方向;方向由条件推出,CounterKey 与方向表双向对齐。
 * 故障注入:删掉方向表里任一条(如 events),或往 CounterKey 加一个新键,本文件红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ACHIEVEMENTS } from '@/data/achievements'
import { COUNTER_DIRECTIONS, achievementDirection, achievementGuide, COUNTER_GROUPS, ACHIEVEMENT_GROUP_LABEL, achievementGroup } from '@/ui/achievementHint'

/**
 * 从 types/index.ts 源码扫出 CounterKey 联合成员(手写联合,不重抄)。
 * 结束点取后一个类型声明(同 vocabularyCoverage 的 unionMembers),不用空行切块:CRLF 行尾下没有 `\n\n`,会滑到文件尾。
 */
function counterKeysFromTypes(): string[] {
  const src = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf8')
  const start = src.indexOf('export type CounterKey =')
  expect(start, 'types/index.ts 里找不到 CounterKey').toBeGreaterThanOrEqual(0)
  const end = src.indexOf('export type AchvCond', start)
  const block = src.slice(start, end > 0 ? end : undefined)
  return [...new Set([...block.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]!))]
}


/** 该条件是否带可读门槛(realm 的 major、quality 的 rank、counter 的 value>0) */
function guide_length_of(cond: { type: string; value?: number }): number {
  if (cond.type === 'custom') return 0
  if (cond.type === 'counter') return (cond.value ?? 0) > 0 ? 1 : 0
  return 1
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

  /**
   * 未达成成就显示「???」是防剧透(不现名目),但原先只给一条方向 ——
   * 同一组里六条未达成成就写成完全一样的字,分不出它们差在哪。
   * 条件里本就带着门槛(major / value / rank),那是「要走到哪」而不是「叫什么名字」:
   * 说出来不剧透,却让人知道还差什么。
   *
   * 故障注入:把 achievementGuide 改回只返回 achievementDirection,本条红。
   */
  it('同组的未达成成就要能互相分辨 —— 引导语带上门槛', () => {
    /*
     * custom 条件除外:它的 key 本身就是条件内容(「灵石逾百万」「寿元上限逾万载」),
     * 写出来就是剧透。那一组只能给方向,分辨不了是刻意的取舍,不是遗漏。
     */
    const byGroup = new Map<string, string[]>()
    for (const a of ACHIEVEMENTS) {
      if (a.cond.type === 'custom') continue
      const g = achievementGroup(a.cond)
      const list = byGroup.get(g) ?? []
      list.push(achievementGuide(a.cond))
      byGroup.set(g, list)
    }
    const dupGroups: string[] = []
    for (const [g, guides] of byGroup) {
      // 一组里若有多条,引导语不该全部相同
      const uniq = new Set(guides)
      if (guides.length > 1 && uniq.size === 1) dupGroups.push(`${g}(${guides.length} 条同文)`)
    }
    expect(dupGroups, `这些组里所有引导语一模一样,等于没给信息`).toEqual([])
  })

  it('custom 组仍只给方向 —— key 写出来就是剧透', () => {
    const customs = ACHIEVEMENTS.filter(a => a.cond.type === 'custom')
    expect(customs.length, '没有 custom 成就,这条判据覆盖不到').toBeGreaterThan(0)
    for (const a of customs) {
      expect(achievementGuide(a.cond), `${a.id} 的引导语漏了条件内容`).toBe(achievementDirection(a.cond))
    }
  })

  it('引导语必须比方向更长 —— 不长的就等于没加门槛', () => {
    const same: string[] = []
    for (const a of ACHIEVEMENTS) {
      const dir = achievementDirection(a.cond)
      const guide = achievementGuide(a.cond)
      expect(guide.startsWith(dir), `${a.id} 的引导语不以方向开头`).toBe(true)
    }
    // 四类条件里,凡门槛可读的都要比纯方向长
    for (const kind of ['realm', 'quality', 'counter'] as const) {
      const sample = ACHIEVEMENTS.find(a => a.cond.type === kind)
      if (!sample) continue
      if (guide_length_of(sample.cond) <= 0) { same.push(kind); continue }
      expect(achievementGuide(sample.cond).length, `条件 ${kind} 的引导语没带出门槛`).toBeGreaterThan(
        achievementDirection(sample.cond).length
      )
    }
    expect(same, `这些条件的门槛取不到`).toEqual([])
  })

  it('门槛名取数据层,不在本层手抄境界名', () => {
    const src = readFileSync(resolve(__dirname, '../ui/achievementHint.ts'), 'utf-8')
    expect(src, '该 import REALMS').toContain("from '@/data/realms'")
    expect(src, '该 import QUALITIES').toContain("from '@/data/qualities'")
    // 手抄的境界名会出现「炼气」「金丹」这类字面量
    expect(src, '引导语里手抄了境界名').not.toMatch(/'(炼气|筑基|金丹|元婴|化神)'/)
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
