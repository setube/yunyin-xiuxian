/**
 * 以灵气疗伤(修复)—— 灵气积余的用途
 *
 * 积余若只进不出,灵气就成了账面数字。这条守住两件事:
 *   1. 修复代价随灵气容量(即境界)增长 —— 上界的"修复"是指数级开销
 *   2. 修复真的扣灵气、真的清负面,且负伤才可修、付不起不生效
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { QI_REPAIR_COST_RATIO, isInjured, qiRepairCost, qiRepairView, repairWithQi } from './qiRepair'
import { useUiStore } from '@/stores/ui'

function injure(): void {
  useCultivationStore().addBuff('injury', Date.now())
}

describe('灵气疗伤(修复)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('代价随灵气容量增长(境界越高越贵)', () => {
    const player = usePlayerStore()
    player.major = 0
    const low = qiRepairCost()
    player.major = 12
    const high = qiRepairCost()
    expect(high).toBeGreaterThan(low * 10) // 指数容量下的修复确实是指数级开销
  })

  it('负伤时以灵气疗伤:扣灵气、清负面', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    injure()
    expect(isInjured()).toBe(true)
    const cost = qiRepairCost()
    resources.setQi(cost + 123, player.qiCapValue)
    const ok = repairWithQi()
    expect(ok).toBe(true)
    expect(isInjured()).toBe(false)
    expect(resources.qi).toBeCloseTo(123, 6)
  })

  it('灵气不足时不生效(也不扣费)', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    injure()
    const cost = qiRepairCost()
    resources.setQi(cost - 1, player.qiCapValue)
    expect(repairWithQi()).toBe(false)
    expect(isInjured()).toBe(true)
    expect(resources.qi).toBeCloseTo(cost - 1, 6)
    expect(qiRepairView()).toMatchObject({ affordable: false, shortfall: 1 })
    expect(useUiStore().toasts.at(-1)?.text, '回执写实际差几缕,不只报总需求').toContain('灵气尚差 1 缕')
  })

  it('无伤时不可修', () => {
    const resources = useResourcesStore()
    const player = usePlayerStore()
    resources.setQi(player.qiCapValue, player.qiCapValue)
    expect(repairWithQi()).toBe(false)
    expect(resources.qi).toBeCloseTo(player.qiCapValue, 6)
  })

  it('代价比例与容量口径一致', () => {
    const player = usePlayerStore()
    expect(qiRepairCost()).toBe(Math.ceil(player.qiCapValue * QI_REPAIR_COST_RATIO))
  })
})
