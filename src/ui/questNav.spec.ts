/** 修行志「去办」导航判据:能确认落点的给页面,拿不准的必须 null */
import { describe, expect, it } from 'vitest'
import type { AchvCond, CounterKey } from '@/types'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { dailyTaskNav, mainQuestNav } from './questNav'

const counter = (key: CounterKey): AchvCond => ({ type: 'counter', key, value: 1 })

describe('修行志导航 · questNav', () => {
  it('境界型主线 → 修炼页', () => {
    expect(mainQuestNav({ type: 'realm', major: 1 })).toEqual({ name: 'cultivation' })
  })

  it('计数键按性质落页:杀敌/扫荡/历练 → 历练,营建 → 洞府', () => {
    for (const key of ['kills', 'bossKills', 'explores'] as CounterKey[]) {
      expect(mainQuestNav(counter(key))!.name).toBe('adventure')
    }
    expect(mainQuestNav(counter('buildingUpgrades'))).toEqual({ name: 'dongfu' })
  })

  it('服丹/炼丹与强化 → 行囊对应签(带 tab 查询)', () => {
    expect(mainQuestNav(counter('pillsUsed'))).toEqual({ name: 'inventory', query: { tab: 'pill' } })
    expect(mainQuestNav(counter('pillsCrafted'))).toEqual({ name: 'inventory', query: { tab: 'pill' } })
    expect(mainQuestNav(counter('upgrades'))).toEqual({ name: 'inventory', query: { tab: 'equip' } })
  })

  it('功法/突破 → 修炼页;拿不准的键一律 null,不赌', () => {
    expect(mainQuestNav(counter('gongfaLearned'))).toEqual({ name: 'cultivation' })
    expect(mainQuestNav(counter('breakthroughs'))).toEqual({ name: 'cultivation' })
    for (const key of ['tribulations', 'decomposed', 'events', 'battles'] as CounterKey[]) {
      expect(mainQuestNav(counter(key)), `键 ${key} 应拿不准返回 null`).toBeNull()
    }
    // 境界里程碑 realm_<major>_<sub> 键 → 修炼页
    expect(mainQuestNav({ type: 'custom', key: 'realm_0_2' })).toEqual({ name: 'cultivation' })
    expect(mainQuestNav({ type: 'custom', key: 'realm_0_9' })).toEqual({ name: 'cultivation' })
    expect(mainQuestNav({ type: 'custom', key: 'stone1m' })).toBeNull()
  })

  it('日课按计数键同源:杀敌/历练 → 历练,服丹 → 行囊丹药签,突破 → 修炼页', () => {
    expect(dailyTaskNav('kills')).toEqual({ name: 'adventure' })
    expect(dailyTaskNav('explores')).toEqual({ name: 'adventure' })
    expect(dailyTaskNav('pillsUsed')).toEqual({ name: 'inventory', query: { tab: 'pill' } })
    expect(dailyTaskNav('breakthroughs')).toEqual({ name: 'cultivation' })
  })
})

/**
 * 任务表里出现的每一个条件都要有去处。
 *
 * `navForCond` 对拿不准的 key 返回 null(有意为之:品质型成就没有固定去处),
 * 但**返回到任务表**——一条主线或日课如果拿不到去处,那行就不显示「去办」,
 * 玩家看着任务却不知道点哪儿。
 *
 * 实测漏过一条:`q_equip`「披挂上阵 · 获得 5 件装备」,因为 `equipsGained`
 * 不在 switch 里。32 条主线里就它一个没入口,而没有任何判据在数这件事。
 *
 * 故障注入:把 case 里的任一 key 删掉,本条红。
 */
describe('任务导航 · 任务表逐条有去处', () => {
  it('主线全部有去处', () => {
    const missing = MAIN_QUESTS.filter(q => !mainQuestNav(q.cond)).map(q => `${q.id}「${q.name}」`)
    expect(missing, `这些主线拿不到「去办」去处:${missing.join('、')}`).toEqual([])
  })

  it('日课全部有去处', () => {
    const missing = DAILY_TASKS.filter(t => !dailyTaskNav(t.counterKey)).map(t => `${t.id}「${t.name}」`)
    expect(missing, `这些日课拿不到「去办」去处:${missing.join('、')}`).toEqual([])
  })

  it('拿不准的条件仍返回 null(不是一律硬塞去处)', () => {
    // 品质型成就没有固定去处,这是设计而非缺陷
    expect(mainQuestNav({ type: 'quality', rank: 6 })).toBeNull()
  })
})
