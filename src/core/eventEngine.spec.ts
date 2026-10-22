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
import { autoResolveEvent, resolveEventChoice } from './eventEngine'
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
    const spy = vi.spyOn(rng, 'weighted').mockImplementationOnce(() => expOutcome)
    try {
      resolveEventChoice(spring, 0, 1)
    } finally {
      spy.mockRestore()
    }
    expect(toNum(player.exp)).toBeGreaterThan(expBefore)
    expect(toNum(adventure.session!.expGain), '际遇给的修为要写进会话账目').toBeGreaterThan(0)
  })
})

/**
 * 自动结算不许替玩家祭法宝。
 *
 * 离线整段、事件超时与「遇事勿扰」都走 `autoResolveEvent` —— 玩家**不在场**。
 * 从前它照默认 `autoEquip=true` 收法宝:挂一夜回来囊里多了一件,而随身那一格
 * 已经被换过,他从没点过那个按钮,也看不出是谁换的。
 * 离线结算的法宝通道早就守住了这条(offline.ts 传 autoEquip=false),
 * 际遇这条却漏着 —— 两条都是「趁玩家不在」,纪律该一样。
 */
describe('自动结算不替玩家祭法宝', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('autoResolveEvent 掉出法宝时只入囊,不占空着的随身位', () => {
    const inventory = useInventoryStore()
    const player = usePlayerStore()
    player.major = 5 // 法宝位已开,而随身那一格还空着 —— 自动祭上就是在这条缝里发生的
    expect(inventory.equippedArtifacts, '前置:随身那一格得是空的').toEqual([])

    const wine = eventDef('ev_wine_immortal')!
    const artifactOutcome = wine.choices[0]!.outcomes.find(o => o.effects.some(e => e.type === 'artifact'))!
    const spy = vi.spyOn(rng, 'weighted').mockImplementationOnce(() => artifactOutcome)
    try {
      autoResolveEvent('ev_wine_immortal', 5)
    } finally {
      spy.mockRestore()
    }

    expect(inventory.artifacts.length, '法宝该真的入囊').toBeGreaterThan(0)
    expect(inventory.equippedArtifacts, '玩家不在场,空着的随身位也不许被他祭上').toEqual([])
  })

  it('玩家亲手点的选项照旧自动祭上(不因修这条而好心办坏事)', () => {
    const inventory = useInventoryStore()
    const wine = eventDef('ev_wine_immortal')!
    const artifactOutcome = wine.choices[0]!.outcomes.find(o => o.effects.some(e => e.type === 'artifact'))!
    const spy = vi.spyOn(rng, 'weighted').mockImplementationOnce(() => artifactOutcome)
    try {
      resolveEventChoice(wine, 0, 5)
    } finally {
      spy.mockRestore()
    }
    expect(inventory.artifacts.length, '亲手选的选项照旧收法宝').toBeGreaterThan(0)
    expect(inventory.equippedArtifacts, '亲手在场:首个法宝照旧自动祭上').toHaveLength(1)
  })

  /**
   * 故障注入:把 autoResolveEvent 的 `{ autoEquipArtifact: false }` 去掉
   * → 本条红;手动那条仍绿(证明红的是这条纪律,不是整个法宝通道)。
   *
   * 差别只在「随身那一格还空着」时看得见:`addArtifact` 的自动祭上本来就是
   * 「空祭炼位才祭」(不抢占已有构筑),所以判据要在**空手**状态下比。
   */
  it('判据自家不空转:同一掷点下,自动路径不祭、手动路径祭', () => {
    const wine = eventDef('ev_wine_immortal')!
    const artifactOutcome = wine.choices[0]!.outcomes.find(o => o.effects.some(e => e.type === 'artifact'))!
    expect(artifactOutcome, '该事件里得有法宝结局,否则两条断言都失去对象').toBeDefined()

    const run = (auto: boolean): string[] => {
      setActivePinia(createPinia())
      const inventory = useInventoryStore()
      usePlayerStore().major = 5 // 法宝位已开
      expect(inventory.equippedArtifacts, '前置:随身那一格得是空的').toEqual([])
      const spy = vi.spyOn(rng, 'weighted').mockImplementationOnce(() => artifactOutcome)
      try {
        if (auto) autoResolveEvent('ev_wine_immortal', 5)
        else resolveEventChoice(wine, 0, 5)
      } finally {
        spy.mockRestore()
      }
      expect(inventory.artifacts.length, '法宝都得真的入囊').toBe(1)
      return [...inventory.equippedArtifacts]
    }
    expect(run(true), '玩家不在场:空手也不该被他手祭上').toEqual([])
    expect(run(false), '亲手在场:空手照旧自动祭上').toHaveLength(1)
  })
})
