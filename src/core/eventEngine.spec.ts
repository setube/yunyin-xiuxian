/**
 * 事件结算 · 灵石代价守恒
 *
 * 两条账目规则:
 *   O 选项声明了灵石门槛(cond),结算就真扣 —— 门槛不是免费取货券,
 *     凝本源为一丹「300 灵石」的代价必须真的从余额里扣掉;
 *   X 入不敷出的支出不许把整份余额清零 —— 负灵石支出付不起时就该拒绝,
 *     而不是「把余额全数奉上」(spendStone 传余额拷贝的写法会让 gte 恒真、
 *     subClamp 归零,一次越支 = 清零)。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EventDef } from '@/types'
import { add, gn, gte, mulN, sub, toNum } from '@/utils/gnum'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { eventDef } from '@/data/events'
import { rng } from '@/utils/random'
import { resolveEventChoice } from './eventEngine'
import { stoneByTier } from './formulas'

describe('事件结算 · 灵石代价守恒', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('入不敷出的灵石支出被拒绝,余额一分不动(不因一次越支而清零)', () => {
    const resources = useResourcesStore()
    resources.addStone(gn(50))
    const def: EventDef = {
      id: 'ev_test_stone',
      title: '测试',
      text: '',
      tags: ['general'],
      weight: 1,
      choices: [{ label: '掏钱', outcomes: [{ weight: 1, text: '花掉', effects: [{ type: 'stone', tierAmount: -60 }] }] }]
    }
    const res = resolveEventChoice(def, 0, 3)
    // 支出被拒:这条结算里没有任何扣灵石的字样(60 → 259.92 > 50,付不起)
    expect(res.lines.some(l => l.includes('灵石 -'))).toBe(false)
    // 余额绝不低于 50 —— 此前的 bug 是「整份余额奉上」清零(里程碑顺带发石也会让它变大,只断言下界)
    expect(gte(resources.spiritStone, gn(50))).toBe(true)
  })

  it('凝本源为一丹:声明了 300 灵石的门槛,实付就真扣 300(不是白拿丹药)', () => {
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    resources.addStone(gn(1_000_000_000))
    const def = eventDef('ev_hongmeng_benyuan')!
    const tier = 20 // 该事件 minRealm=20,取真实可达档位
    const before = resources.spiritStone
    resolveEventChoice(def, 1, tier) // 「凝本源为一丹」
    const cost = stoneByTier(tier, 300)
    // 付了声明的那笔:余额确确实实少了 cost(大数重构有尾数噪声,用容差比:与原值差 ≤ 1e-9 级)
    const spent = sub(before, resources.spiritStone)
    const tol = mulN(cost, 1e-6)
    expect(gte(add(spent, tol), cost), '花掉的应 ≥ cost(容差)').toBe(true)
    expect(gte(add(cost, tol), spent), '花掉的应 ≤ cost(容差)').toBe(true)
    // 药也真到手
    expect(inventory.pills['p_daoyuan']).toBe(1)
    // 顺手确认这笔不是负值(300 灵石代价在等价档位下真实大于零,不是虚设)
    expect(gte(cost, gn(1))).toBe(true)
  })

  it('事件 material 发灵草:文案显式报当前品(5 境 → 灵品)', () => {
    const player = usePlayerStore()
    player.initCharacter('事件', { roots: [] } as never)
    player.major = 5 // 灵品带(5~8)
    const def: EventDef = {
      id: 'ev_test_herb',
      title: '',
      text: '',
      tags: ['general'],
      weight: 1,
      choices: [{ label: '采', outcomes: [{ weight: 1, text: '得', effects: [{ type: 'material', id: 'herb', amount: 6 }] }] }]
    }
    const res = resolveEventChoice(def, 0, 3)
    expect(res.lines.some(l => l.includes('灵品灵草 +6')), '事件发草也该报品').toBe(true)
    expect(res.lines.some(l => l.includes('灵草 +6') && !l.includes('灵品')), '不得退回不带品的裸数').toBe(false)
  })
})

describe('际遇 haul(事件所得并入会话账目)', () => {
  it('历练途中事件修为并入 session.expGain(总结「得修为」不再漏计际遇)', () => {
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    adventure.setSession({
      regionId: 'qingyun', mode: 'normal', startedAt: 0, endsAt: Date.now() + 60_000,
      nextBattleAt: 0, wins: 1, losses: 0, events: 0,
      stoneGain: gn(0), expGain: gn(0), itemGain: 0
    })
    const expBefore = toNum(player.exp)
    // 结算取用 rng.weighted(依权重挑结局),不是 rng.chance —— 强制挑「饮下泉水」的 exp 结局,
    // 避免 75%/25% 掷点让断言在 CI 里偶发翻车(取到 injury 时 expGain 不动)
    const spring = eventDef('ev_spring')!
    const expOutcome = spring.choices[0]!.outcomes[0]!
    const spy = vi.spyOn(rng, 'weighted').mockReturnValue(expOutcome)
    try {
      resolveEventChoice(spring, 0, 1)
    } finally {
      spy.mockRestore()
    }
    expect(toNum(player.exp)).toBeGreaterThan(expBefore)
    expect(toNum(adventure.session!.expGain), '际遇给的修为要写进会话账目').toBeGreaterThan(0)
  })
})
