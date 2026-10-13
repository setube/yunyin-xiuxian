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
import { DAO_FRUIT_CULT_BONUS } from '@/data/constants'

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

  it('软上限白话文案:如实报出下一枚的边际收益(不虚报「微乎其微」)', () => {
    expect(fruitSoftCapText(0)).toContain('尚未')
    for (const total of [5, 15, 20, 50, 200]) {
      const t = fruitSoftCapText(total)
      const eff = effectiveDaoFruit(total)
      const next = effectiveDaoFruit(total + 1)
      const marginalEff = next - eff
      const effPct = (marginalEff / eff) * 100
      const cultPct = marginalEff * DAO_FRUIT_CULT_BONUS * 100
      // 文案列出的两个百分比 = 引擎现算的真实边际(改指数/倍率即同步变真)
      expect(t, `total=${total}`).toContain(`+${effPct.toFixed(1)}%`)
      expect(t, `total=${total}`).toContain(`+${cultPct.toFixed(1)}%`)
      // 引用当前道果数,不硬编码「二十」;也不用夸大字眼糊弄(200 枚边际依旧存在)
      expect(t, `total=${total}`).toContain(`道果已 ${total} 枚`)
      expect(t, `total=${total}`).not.toContain('微乎其微')
      // 任何总量下边际都仍为正 —— 若文案说成「已尽」即此处红
      expect(Number(effPct.toFixed(1))).toBeGreaterThan(0)
    }
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
