/**
 * Phase 30.9:道源/道果认知服务审计
 * S1 生命周期标签 / S2 资源说明 / S3 道源→道果链路 / S4/S5 首次教学 / S6 认知埋点
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  daoSourceDialog,
  daoFruitDialog,
  fruitMarginalInfo,
  fruitCountLabel,
  fruitSoftCapText,
  shouldShowEndgameTutorial,
  markEndgameTutorialSeen,
  shouldShowFruitTutorial,
  markFruitTutorialSeen,
  cognitionStats,
  markResourceDialogSeen,
  DAO_SOURCE_ROLE,
  DAO_FRUIT_ROLE
} from './resourceGuidance'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import { condenseDaoFruit } from './endgameService'
import { effectiveDaoFruit } from './statsCalc'
import { DAO_SOURCE_PER_FRUIT } from '@/data/endgame'

describe('S1 生命周期语义', () => {
  it('道源=此世消耗,道果=永久积累', () => {
    expect(DAO_SOURCE_ROLE).toBe('此世消耗')
    expect(DAO_FRUIT_ROLE).toBe('永久积累')
  })

  it('说明弹窗内容完整', () => {
    const ds = daoSourceDialog()
    expect(ds.name).toBe('道源')
    expect(ds.usages.length).toBeGreaterThan(0)
    expect(ds.gains.length).toBeGreaterThan(0)
    expect(ds.lifecycle).toContain('本世')
    const df = daoFruitDialog()
    expect(df.name).toBe('道果')
    expect(df.lifecycle).toContain('跨世保留')
    expect(df.lifecycle).toContain('道躯')
  })
})

describe('S3 道果边际收益', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    usePlayerStore().$patch({ reincarnation: { count: 0, daoFruit: 10, talents: [] } })
  })

  it('凝聚一枚后有效收益增长,且边际递减', () => {
    const info = fruitMarginalInfo()
    expect(info.total).toBe(10)
    expect(info.nextEffective).toBeGreaterThan(info.effective)
    // 软上限:有效道果 = 道果^0.9
    // 增量 = ((11^0.9)/(10^0.9) - 1) ≈ 8.96%(基本等同 1.1^0.9 - 1,不随基数骤变)
    expect(info.effective).toBeCloseTo(effectiveDaoFruit(10), 9)
    expect(fruitCountLabel(info.effective)).toBe('7.9 枚')
    expect(fruitCountLabel(info.effective)).not.toBe('8 枚')
    expect(Number(info.deltaPct)).toBeGreaterThan(8)
    expect(Number(info.deltaPct)).toBeLessThan(10)
  })

  it('软上限白话文案', () => {
    expect(fruitSoftCapText(0)).toContain('尚未')
    expect(fruitSoftCapText(15)).toContain('软上限')
    expect(fruitSoftCapText(50)).toContain('微乎其微')
  })
})

describe('S4/S5 首次教学', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('真仙以下不触发终局教学', () => {
    expect(shouldShowEndgameTutorial()).toBe(false)
  })

  it('登真仙后首次触发教学,标记后不再弹', () => {
    const player = usePlayerStore()
    player.$patch({ major: 9 } as never)
    expect(shouldShowEndgameTutorial()).toBe(true)
    markEndgameTutorialSeen()
    expect(shouldShowEndgameTutorial()).toBe(false)
  })

  it('首次凝道果教学标记', () => {
    expect(shouldShowFruitTutorial()).toBe(true)
    markFruitTutorialSeen()
    expect(shouldShowFruitTutorial()).toBe(false)
  })
})

describe('S6 认知埋点', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('埋点统计:道源/道果/教学标记/说明弹窗', () => {
    const endgame = useEndgameStore()
    endgame.addDaoSource(DAO_SOURCE_PER_FRUIT)
    condenseDaoFruit()
    markResourceDialogSeen()
    const stats = cognitionStats()
    expect(stats.daoSource).toBe(0) // 凝果消耗后
    expect(stats.daoFruit).toBe(1)
    expect(stats.fruitSeen).toBe(true)
    expect(stats.dialogSeen).toBe(true)
    expect(stats.tutorialSeen).toBe(false)
  })
})
