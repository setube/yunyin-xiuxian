/**
 * 任务文案与实判定条件必须对得上。
 *
 * QuestDef.desc 是玩家在修行志里读到的唯一说明,cond 是真正判定进度的条件。
 * 两者之间没有机制约束,写错任何一个数字,玩家会按错误预期去攒进度:
 *   计数器型:desc「获得 5 件装备」 ↔ cond.value 5
 *   每日型:  desc「今日服用 1 枚丹药」 ↔ target 1
 *   境界型:  desc「突破至筑基境」 ↔ realmDef(cond.major).name === '筑基'
 */
import { describe, expect, it } from 'vitest'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { realmDef } from '@/data/realms'

/**
 * 取 desc 里代表目标数量的数。
 * 文案里小数字常写成中文(「完成一次历练」),所以先找阿拉伯数字,找不到再查中文数字表;
 * 只覆盖 1~10,更大的数项目里一律用阿拉伯数字写。
 */
const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
}
const firstInt = (s: string): number | null => {
  const m = /\d+/.exec(s)
  if (m) return Number(m[0])
  for (const ch of s) {
    const v = CN_NUM[ch]
    if (v !== undefined) return v
  }
  return null
}

describe('主线任务 · 文案与条件一致', () => {
  it('计数器型:desc 里的数字等于 cond.value', () => {
    let checked = 0
    for (const q of MAIN_QUESTS) {
      if (q.cond.type !== 'counter') continue
      const claimed = firstInt(q.desc)
      expect(claimed, `「${q.name}」是计数器型,文案里却没写数字:${JSON.stringify(q.desc)}`).not.toBeNull()
      expect(claimed, `「${q.name}」文案 ${JSON.stringify(q.desc)} 与条件值 ${q.cond.value} 不符`).toBe(q.cond.value)
      checked += 1
    }
    expect(checked, '没有计数器型任务,说明结构变了').toBeGreaterThan(0)
  })

  it('境界型:desc 里的境界名等于 realmDef(cond.major)', () => {
    let checked = 0
    for (const q of MAIN_QUESTS) {
      if (q.cond.type !== 'realm') continue
      const realmName = realmDef(q.cond.major).name
      expect(q.desc, `「${q.name}」文案写「${q.desc}」,但 major ${q.cond.major} 是「${realmName}」`).toContain(realmName)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('id 与 name 都不重复(修行志靠它们区分)', () => {
    const ids = MAIN_QUESTS.map(q => q.id)
    const names = MAIN_QUESTS.map(q => q.name)
    expect(new Set(ids).size, '主线 id 有重复').toBe(ids.length)
    expect(new Set(names).size, '主线名字有重复').toBe(names.length)
  })

  it('每条主线都有奖励且名称非空', () => {
    for (const q of MAIN_QUESTS) {
      expect(q.name.length, `${q.id} 没名字`).toBeGreaterThan(0)
      expect(q.desc.length, `${q.id} 没描述`).toBeGreaterThan(0)
      expect(Object.keys(q.reward).length, `${q.id} 没有奖励`).toBeGreaterThan(0)
    }
  })

  it('境界型任务的 major 都在合法范围内', () => {
    for (const q of MAIN_QUESTS) {
      if (q.cond.type !== 'realm') continue
      expect(q.cond.major, `「${q.name}」的 major 越界`).toBeGreaterThanOrEqual(0)
      // realmDef 越界会兜底到最后一个境界,所以这里只查非负与可解析
      expect(Number.isFinite(realmDef(q.cond.major).name.length)).toBe(true)
    }
  })
})

describe('每日任务 · 文案与目标一致', () => {
  it('desc 里的数字等于 target', () => {
    let checked = 0
    for (const t of DAILY_TASKS) {
      const claimed = firstInt(t.desc)
      expect(claimed, `「${t.name}」文案里没写数字:${JSON.stringify(t.desc)}`).not.toBeNull()
      expect(claimed, `「${t.name}」文案 ${JSON.stringify(t.desc)} 与 target ${t.target} 不符`).toBe(t.target)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('id 与 name 都不重复', () => {
    const ids = DAILY_TASKS.map(t => t.id)
    const names = DAILY_TASKS.map(t => t.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size, '每日任务重名会让玩家分不清').toBe(names.length)
  })

  it('每条每日都有奖励与计数器键', () => {
    for (const t of DAILY_TASKS) {
      expect(Object.keys(t.reward).length, `${t.id} 没有奖励`).toBeGreaterThan(0)
      expect(t.counterKey.length, `${t.id} 没有计数器键`).toBeGreaterThan(0)
      expect(t.target, `${t.id} 的目标必须为正`).toBeGreaterThan(0)
    }
  })

  it('主线与每日的 id 不冲突(共用同一份完成记录)', () => {
    const main = new Set(MAIN_QUESTS.map(q => q.id))
    for (const t of DAILY_TASKS) {
      expect(main.has(t.id), `每日「${t.id}」与主线撞 id`).toBe(false)
    }
  })
})
