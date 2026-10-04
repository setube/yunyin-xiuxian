/**
 * questNav —— 修行志「去办」导航判据。
 * 纯函数契约:能确认落点的给页面,拿不准的必须 null(不给错地方,比不给更坏)。
 */
import { describe, expect, it } from 'vitest'
import type { AchvCond, CounterKey } from '@/types'
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
    expect(mainQuestNav({ type: 'custom', key: 'stone1m' })).toBeNull()
  })

  it('日课按计数键同源:杀敌/历练 → 历练,服丹 → 行囊丹药签,突破 → 修炼页', () => {
    expect(dailyTaskNav('kills')).toEqual({ name: 'adventure' })
    expect(dailyTaskNav('explores')).toEqual({ name: 'adventure' })
    expect(dailyTaskNav('pillsUsed')).toEqual({ name: 'inventory', query: { tab: 'pill' } })
    expect(dailyTaskNav('breakthroughs')).toEqual({ name: 'cultivation' })
  })
})
