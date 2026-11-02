/** 以灵气疗伤(修复):灵气积余的用途 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    expect(high).toBeGreaterThan(low * 10)
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

  /**
   * 灵气按 dt 累积,余额与差额都带小数:1.824 若用 formatNum 会印成「尚差 1.8」,
   * 玩家照提示补 1.8 仍然不够 —— 与「灵石尚差」同一类少报(见 docs 的 format-gn 计划档),
   * 全站三十处差额都已换成 formatGap,疗伤这一处曾是漏网的最后一个。
   * 故障注入:把 formatGap 改回 formatNum,本条红。
   */
  it('小数差额向上进一:照提示补足一定够', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    injure()
    const cost = qiRepairCost()
    resources.setQi(cost - 1.824, player.qiCapValue)
    expect(repairWithQi()).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text, '差额被四舍五入少报').toContain('灵气尚差 1.9 缕')
    expect(text, '少报那一档会印成 1.8').not.toContain('灵气尚差 1.8 缕')
  })

  it('疗伤钮与 toast 读同一份差额,钮面也不四舍五入', () => {
    const view = readFileSync(resolve(__dirname, '../views/CultivationView.vue'), 'utf8')
    expect(view, '钮面差额须走 formatGap,与 toast 同一把尺').toContain('formatGap(repair.shortfall)')
    expect(view, '钮面差额不许退回四舍五入').not.toContain('formatNum(repair.shortfall)')
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
