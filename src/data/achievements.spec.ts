/**
 * 成就文案与判定条件必须对得上 —— 62 条成就一条都不许错位。
 *
 * AchievementDef.desc 是玩家在收藏页读到的唯一说明,cond 是真正解锁的条件。
 * 两者之间没有机制约束,写错一个数字玩家就会按错误预期去攒进度,而且永远等不到解锁。
 *   计数器型:desc「累计突破 10 次」 ↔ cond.value 10
 *   境界型:  desc「突破筑基境」     ↔ realmDef(cond.major).name === '筑基'
 *
 * 另查三条结构不变式:未达成一律显示「???」的前提是没有隐藏成就(每条都要有 desc)、
 * id 唯一、奖励里的称号必须真实存在。
 */
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '@/data/achievements'
import { realmDef } from '@/data/realms'
import { titleDef } from '@/data/titles'

/** 取 desc 里代表目标数量的数;小数字项目里常写成中文 */
const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const firstInt = (s: string): number | null => {
  const m = /\d+/.exec(s)
  if (m) return Number(m[0])
  for (const ch of s) {
    const v = CN_NUM[ch]
    if (v !== undefined) return v
  }
  return null
}

describe('成就 · 文案与条件一致', () => {
  it('计数器型:desc 里的数字等于 cond.value', () => {
    let checked = 0
    for (const a of ACHIEVEMENTS) {
      if (a.cond.type !== 'counter') continue
      const claimed = firstInt(a.desc)
      expect(claimed, `「${a.name}」是计数器型,文案里却没写数字:${JSON.stringify(a.desc)}`).not.toBeNull()
      expect(claimed, `「${a.name}」文案 ${JSON.stringify(a.desc)} 与条件值 ${a.cond.value} 不符`).toBe(a.cond.value)
      checked += 1
    }
    expect(checked, '没有计数器型成就,说明结构变了').toBeGreaterThan(0)
  })

  it('境界型:desc 里的境界名等于 realmDef(cond.major)', () => {
    let checked = 0
    for (const a of ACHIEVEMENTS) {
      if (a.cond.type !== 'realm') continue
      const realmName = realmDef(a.cond.major).name
      expect(a.desc, `「${a.name}」文案写「${a.desc}」,但 major ${a.cond.major} 是「${realmName}」`).toContain(realmName)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('成就 · 结构不变式', () => {
  it('id 唯一', () => {
    const ids = ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size, '成就 id 必须唯一').toBe(ids.length)
  })

  it('name 唯一(收藏页靠名字区分)', () => {
    const names = ACHIEVEMENTS.map(a => a.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每条都有非空 desc 与 name —— 无隐藏成就的前提', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length, `${a.id} 没名字`).toBeGreaterThan(0)
      expect(a.desc.length, `${a.id} 没描述,会在收藏页露成空白`).toBeGreaterThan(0)
    }
  })

  it('奖励里的称号都真实存在', () => {
    let checked = 0
    for (const a of ACHIEVEMENTS) {
      if (!a.reward?.titleId) continue
      expect(titleDef(a.reward.titleId), `「${a.name}」奖励的称号 ${a.reward.titleId} 不存在`).toBeDefined()
      checked += 1
    }
    expect(checked, '没有任何成就给称号,说明结构变了').toBeGreaterThan(0)
  })

  it('有奖励的成就,奖励内容不为空对象', () => {
    for (const a of ACHIEVEMENTS) {
      if (!a.reward) continue
      expect(Object.keys(a.reward).length, `「${a.name}」的奖励是空对象`).toBeGreaterThan(0)
    }
  })
})
