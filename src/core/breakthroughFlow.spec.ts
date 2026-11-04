/**
 * 突破 / 渡劫端到端判据:门槛不满足时一分不动;结算后境界、灵气、修为、伤与计数各归其位。
 * 随机源固定:0 → 概率判定皆成、天雷取最小伤害;0.999 → 皆不成、天雷取最大伤害。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

let mockRand = 0
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return { ...mod, rng: new mod.RandomService(() => mockRand) }
})

import { attemptBreakthrough, breakthroughInfo } from './breakthrough'
import { BT_FAIL_EXP_LOSS } from '@/data/constants'
import { modOf } from './statsCalc'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useQuestsStore } from '@/stores/quests'
import { useUiStore } from '@/stores/ui'
import { ACHIEVEMENTS } from '@/data/achievements'
import { MAIN_QUESTS } from '@/data/quests'
import { toNum } from '@/utils/gnum'

/** 一次性赏钱先结清,免得成就的灵石/悟道点混进账 */
function settleRewards(): void {
  useQuestsStore().$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
}

/** 修为圆满 + 灵气充足的一境 */
function ready(major: number, sub: number): void {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  player.$patch({ major, sub, exp: { m: 1, e: 12 } })
  resources.$patch({ qi: 0 })
  resources.setQi(breakthroughInfo().qiCost, player.qiCapValue)
}

describe('突破 · 门槛不满足时一分不动', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  it('修为未满:不给结算,也不扣灵气', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.$patch({ major: 0, sub: 3, exp: { m: 0, e: 0 } })
    const qiBefore = resources.qi
    expect(attemptBreakthrough()).toBeNull()
    expect(player.sub).toBe(3)
    expect(resources.qi).toBe(qiBefore)
    expect(useUiStore().breakthrough).toBeNull()
  })

  it('灵气不足:同样不给结算 —— 门槛资源不是摆设', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.$patch({ major: 0, sub: 3, exp: { m: 1, e: 12 } })
    resources.$patch({ qi: 0 })
    expect(attemptBreakthrough()).toBeNull()
    expect(player.sub, '灵气不够却进境了').toBe(3)
    expect(resources.qi).toBe(0)
  })
})

describe('突破 · 小关(无劫)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  it('成了:进一小层,灵气与修为照门槛付清', () => {
    ready(0, 3)
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const info = breakthroughInfo()
    expect(info.needTribulation, '这一境不该有天劫').toBe(false)
    const qiBefore = resources.qi
    const expBefore = toNum(player.exp)

    const view = attemptBreakthrough()
    expect(view?.success).toBe(true)
    expect(player.major, '小关不该跨大境界').toBe(0)
    expect(player.sub).toBe(4)
    expect(qiBefore - resources.qi, '灵气没按门槛扣').toBe(info.qiCost)
    expect(toNum(player.exp), '修为没按这一境的门槛扣').toBeLessThan(expBefore)
    expect(useQuestsStore().counter('breakthroughs')).toBe(1)
  })

  it('败了:境界不动,掉修为、添伤势、记一次失败', () => {
    ready(0, 3)
    mockRand = 0.999
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    const expBefore = toNum(player.exp)

    const view = attemptBreakthrough()
    expect(view?.success).toBe(false)
    expect(player.sub, '失败却进境了').toBe(3)
    expect(useQuestsStore().counter('breakthroughFails')).toBe(1)
    expect(
      cultivation.buffs.some(b => b.defId === 'injury'),
      '突破失败该留下伤势'
    ).toBe(true)
    // 无退返词条时掉 BT_FAIL_EXP_LOSS
    expect(toNum(player.exp) / expBefore).toBeCloseTo(1 - BT_FAIL_EXP_LOSS, 3)
  })

  it('失败返还只少掉修为损耗,灵气仍按门槛扣光', () => {
    ready(0, 3)
    mockRand = 0.999
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.addTalent('t_yuanman')
    const refund = Math.min(0.8, modOf(player.finalStats.mods, 'breakRefund'))
    expect(refund, '圆融天赋该带上失败返还').toBeGreaterThan(0)
    const info = breakthroughInfo()
    const qiBefore = resources.qi
    const expBefore = toNum(player.exp)

    const view = attemptBreakthrough()
    expect(view?.success).toBe(false)
    expect(qiBefore - resources.qi, '失败不该把灵气退回来').toBe(info.qiCost)
    expect(toNum(player.exp) / expBefore).toBeCloseTo(1 - BT_FAIL_EXP_LOSS * (1 - refund), 3)
  })
})

describe('突破 · 大关(渡劫)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  it('渡过了:跨大境界,寿元随之抬升,天劫战报如实带出', () => {
    ready(0, 9)
    const player = usePlayerStore()
    const info = breakthroughInfo()
    expect(info.needTribulation, '练气圆满该引动天劫').toBe(true)
    const lifespanBefore = player.lifespanMax

    const view = attemptBreakthrough()
    expect(view?.success).toBe(true)
    expect(player.major).toBe(1)
    expect(player.sub).toBe(0)
    expect(player.lifespanMax, '跨了大境界寿元却一动没动').toBeGreaterThan(lifespanBefore)
    expect(view!.tribulationLog.length, '渡劫没有战报,玩家不知道自己怎么过来的').toBeGreaterThan(2)
    expect(view!.tribulationLog[view!.tribulationLog.length - 1]).toContain('渡劫')
    // 护持能让结余越过满值(1 + 护持 + 折算),结算照此走,但报数不能超过 100% ——
    // 「气血余 115%」是无意义读数,且会让同一场里按它画的柱子与数字各说各话
    for (const line of view!.tribulationLog) {
      const m = /气血余 (\d+)%/.exec(line)
      if (m) expect(Number(m[1]), `战报里出现了超过满值的气血:${line}`).toBeLessThanOrEqual(100)
    }
    expect(useQuestsStore().counter('tribulations')).toBe(1)
  })

  it('没渡过:境界不动,一样要赔修为与疗伤', () => {
    ready(0, 9)
    mockRand = 0.999
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    const view = attemptBreakthrough()
    expect(view?.success).toBe(false)
    expect(player.major, '渡劫失败却飞升了').toBe(0)
    expect(player.sub).toBe(9)
    expect(cultivation.buffs.some(b => b.defId === 'injury')).toBe(true)
    expect(useQuestsStore().counter('tribulations'), '没渡过就不该计数').toBe(0)
    expect(useQuestsStore().counter('breakthroughFails')).toBe(1)
    expect(view!.tribulationLog.some(l => l.includes('重伤坠地'))).toBe(true)
  })
})
