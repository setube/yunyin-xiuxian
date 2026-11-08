/** 事件结算灵石守恒:声明的灵石门槛(cond)真扣;付不起的支出被拒,不清零余额 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { EventDef, EventEffect } from '@/types'
import { add, gn, gte, mulN, sub, toNum } from '@/utils/gnum'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useLoreStore } from '@/stores/lore'
import { useQuestsStore } from '@/stores/quests'
import { useUiStore } from '@/stores/ui'
import { PILLS } from '@/data/pills'
import { PETS } from '@/data/pets'
import { GONGFA } from '@/data/gongfa'
import { MATERIALS, type MaterialBucket, type MaterialDef } from '@/data/materials'
import { eventDef } from '@/data/events'
import { rng } from '@/utils/random'
import { autoResolveEvent, resolveEventChoice } from './eventEngine'
import { stoneByTier } from './formulas'
import { rollFieldMaterial } from './loreService'

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
    // 60 → 259.92 > 50,付不起
    expect(res.lines.some(l => l.includes('灵石 -'))).toBe(false)
    // 里程碑顺带发石会让余额变大,只断言下界
    expect(gte(resources.spiritStone, gn(50))).toBe(true)
  })

  it('凝本源为一丹:声明了 300 灵石的门槛,实付就真扣 300(不是白拿丹药)', () => {
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    resources.addStone(gn(1_000_000_000))
    const def = eventDef('ev_hongmeng_benyuan')!
    const tier = 20 // 该事件 minRealm=20
    const before = resources.spiritStone
    resolveEventChoice(def, 1, tier) // 「凝本源为一丹」
    const cost = stoneByTier(tier, 300)
    // 大数有尾数噪声,用容差比
    const spent = sub(before, resources.spiritStone)
    const tol = mulN(cost, 1e-6)
    expect(gte(add(spent, tol), cost), '花掉的应 ≥ cost(容差)').toBe(true)
    expect(gte(add(cost, tol), spent), '花掉的应 ≤ cost(容差)').toBe(true)
    expect(inventory.pills['p_daoyuan']).toBe(1)
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
  it('历练途中事件修为并入 session.expGain(总结「修为 +」不再漏计际遇)', () => {
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    adventure.setSession({
      regionId: 'qingyun', mode: 'normal', startedAt: 0, endsAt: Date.now() + 60_000,
      nextBattleAt: 0, wins: 1, losses: 0, events: 0,
      stoneGain: gn(0), expGain: gn(0), itemGain: 0
    })
    const expBefore = toNum(player.exp)
    // 结局由 rng.weighted 挑:强制取 exp 结局,免得掷到 injury 时偶发失败
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

/** 离线整段、事件超时与「遇事勿扰」都走 autoResolveEvent,玩家不在场;纪律同 offline.ts 的 autoEquip=false */
describe('自动结算不替玩家祭法宝', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('autoResolveEvent 掉出法宝时只入囊,不占空着的随身位', () => {
    const inventory = useInventoryStore()
    const player = usePlayerStore()
    player.major = 5 // 法宝位已开
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
   * 故障注入:去掉 autoResolveEvent 的 { autoEquipArtifact: false },本用例红(手动那条仍绿)。
   * addArtifact 只在空祭炼位自动祭,判据须在空手状态下比。
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

/**
 * 事件发灵草/玄铁、灵兽撞重折草都计照面,每次各 1 回;数量照旧入账。
 * 故障注入:删掉 applyEffect 里任一处 harvestMaterials,对应用例红;任一处层级传错,层级那条红。
 */
describe('事件所得灵材计照面', () => {
  const TIER = 6

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seenIn(bucket: MaterialBucket): number {
    const lore = useLoreStore()
    return MATERIALS.filter(m => m.bucket === bucket).reduce((n, m) => n + lore.seenOf(m.id), 0)
  }

  function eventOf(...effects: EventEffect[]): EventDef {
    return {
      id: 'ev_test_lore',
      title: '',
      text: '',
      tags: ['general'],
      weight: 1,
      choices: [{ label: '取', outcomes: [{ weight: 1, text: '得', effects }] }]
    }
  }

  /** 新 pinia 里结算一件事件,返回灵草/玄铁增量与两类照面数 */
  function settle(def: EventDef): { herb: number; ore: number; seenHerb: number; seenOre: number } {
    setActivePinia(createPinia())
    const resources = useResourcesStore()
    const herb0 = resources.herb
    const ore0 = resources.ore
    resolveEventChoice(def, 0, TIER)
    return { herb: resources.herb - herb0, ore: resources.ore - ore0, seenHerb: seenIn('herb'), seenOre: seenIn('ore') }
  }

  it('发灵草、玄铁各计 1 回照面,数量照旧;残页等不计', () => {
    const base = settle(
      eventOf({ type: 'material', id: 'page', amount: 5 }, { type: 'material', id: 'dust', amount: 5 }, { type: 'material', id: 'wudao', amount: 5 })
    )
    const got = settle(eventOf({ type: 'material', id: 'herb', amount: 5 }, { type: 'material', id: 'ore', amount: 5 }))
    expect(base.seenHerb + base.seenOre, '残页、器灵尘、悟道点不是灵材').toBe(0)
    expect(got.seenHerb, '灵草计照面').toBe(1)
    expect(got.seenOre, '玄铁计照面').toBe(1)
    expect(got.herb - base.herb, '灵草数照旧').toBe(5)
    expect(got.ore - base.ore, '玄铁数照旧').toBe(5)
  })

  it('自动结算(离线 / 勿扰 / 超时)同一出口,照样计照面', () => {
    const def = eventDef('ev_herb_garden')!
    const outcomes = def.choices.find(c => c.isDefault)!.outcomes
    expect(outcomes, '前置:默认选项只一种结局').toHaveLength(1)
    const herb = outcomes[0]!.effects.find(
      (e): e is Extract<EventEffect, { type: 'material' }> => e.type === 'material' && e.id === 'herb'
    )
    expect(herb, '前置:默认结局发灵草').toBeDefined()
    const resources = useResourcesStore()
    const herb0 = resources.herb
    autoResolveEvent(def.id, TIER)
    expect(resources.herb - herb0, '灵草数照旧').toBe(herb!.amount)
    expect(seenIn('herb')).toBe(1)
    expect(seenIn('ore')).toBe(0)
  })

  it('灵兽撞重折作灵草,同样计 1 回照面', () => {
    useQuestsStore().collect('pet', 'pet_qingyu')
    const resources = useResourcesStore()
    const herb0 = resources.herb
    const res = resolveEventChoice(eventOf({ type: 'pet', id: 'pet_qingyu' }), 0, TIER)
    expect(res.lines.some(l => l.includes('灵草 +10')), '前置:撞重折草').toBe(true)
    expect(resources.herb - herb0, '灵草数照旧').toBe(10)
    expect(seenIn('herb')).toBe(1)
  })

  it('照面的是该区域层级的灵材:发草、发铁、折草都按事件层级抽', () => {
    // 灵材池一律取最末(最高阶)那味,其余照常掷:照面落在哪味,就钉住了按哪个层级抽
    const weighted = rng.weighted.bind(rng)
    const spy = vi
      .spyOn(rng, 'weighted')
      .mockImplementation((items, weightOf) =>
        items.length > 0 && items.every(x => MATERIALS.includes(x as MaterialDef)) ? items[items.length - 1]! : weighted(items, weightOf)
      )
    try {
      const herbTop = rollFieldMaterial(TIER, 'herb')!
      const oreTop = rollFieldMaterial(TIER, 'ore')!
      expect(herbTop.id, '前置:层级不同,抽中的不同').not.toBe(rollFieldMaterial(1, 'herb')!.id)
      expect(oreTop.id, '前置:层级不同,抽中的不同').not.toBe(rollFieldMaterial(1, 'ore')!.id)
      useQuestsStore().collect('pet', 'pet_qingyu')
      resolveEventChoice(
        eventOf({ type: 'material', id: 'herb', amount: 5 }, { type: 'material', id: 'ore', amount: 5 }, { type: 'pet', id: 'pet_qingyu' }),
        0,
        TIER
      )
      const lore = useLoreStore()
      expect(lore.seenOf(herbTop.id), '发草、折草各 1 回').toBe(2)
      expect(lore.seenOf(oreTop.id)).toBe(1)
      expect(seenIn('herb') + seenIn('ore'), '别的灵材不计').toBe(3)
    } finally {
      spy.mockRestore()
    }
  })
})


/**
 * 际遇赠顶档之物,同样翻开得宝仪典。
 *
 * 这条路的特殊性:仙品/神品神兽**只由指名事件发放**(泛型事件池只到天品),
 * 于是它恰恰是最该有一瞬的那条路 —— 而玩家若开着「遇事勿扰」或事件超时自动结算,
 * 那一刻并不在场,仪典不该替他补演(见 EventApplyOpts.silent)。
 */
describe('得宝仪典 · 际遇赠顶档之物', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function eventOf(...effects: EventEffect[]): EventDef {
    return {
      id: 'ev_test_treasure',
      title: '',
      text: '',
      tags: ['general'],
      weight: 1,
      choices: [{ label: '取', outcomes: [{ weight: 1, text: '得', effects }] }]
    }
  }

  const divinePet = PETS.find(p => p.quality === 'divine')!
  const divinePill = PILLS.find(p => p.quality === 'divine' && !p.recipe)!

  it('指名赠神品灵兽:翻开,且报出兽名', () => {
    const ui = useUiStore()
    ui.clearTreasure()
    resolveEventChoice(eventOf({ type: 'pet', id: divinePet.id }), 0, 20)
    expect(ui.treasure, '神品灵兽该开仪典').not.toBeNull()
    expect(ui.treasure!.kindName).toBe('灵兽')
    expect(ui.treasure!.name).toBe(divinePet.name)
  })

  it('赠天品灵兽不翻开 —— 落差只给最顶那一档', () => {
    const ui = useUiStore()
    const heaven = PETS.find(p => p.quality === 'heaven')!
    ui.clearTreasure()
    resolveEventChoice(eventOf({ type: 'pet', id: heaven.id }), 0, 20)
    expect(ui.treasure).toBeNull()
  })

  it('赠神品丹(无方之丹只由际遇来)翻开', () => {
    const ui = useUiStore()
    ui.clearTreasure()
    resolveEventChoice(eventOf({ type: 'pill', id: divinePill.id, count: 1 }), 0, 20)
    expect(ui.treasure, '际遇赠顶档丹该开仪典').not.toBeNull()
    expect(ui.treasure!.name).toBe(divinePill.name)
  })

  it('silent(自动结算 / 离线)不翻开 —— 玩家不在场,归来卷轴已交代', () => {
    const ui = useUiStore()
    ui.clearTreasure()
    resolveEventChoice(eventOf({ type: 'pet', id: divinePet.id }), 0, 20, { silent: true, autoEquipArtifact: false })
    expect(ui.treasure, '玩家不在场时不该补演那一刻').toBeNull()
  })

  it('静默结算照常入账 —— silent 只管仪典,不管所得', () => {
    const quests = useQuestsStore()
    resolveEventChoice(eventOf({ type: 'pet', id: divinePet.id }), 0, 20, { silent: true, autoEquipArtifact: false })
    expect(quests.collections.pet, '静默也照常收录').toContain(divinePet.id)
  })

  it('习得顶档功法翻开,且名取自功法表', () => {
    const ui = useUiStore()
    const divine = GONGFA.find(g => g.quality === 'divine')!
    ui.clearTreasure()
    resolveEventChoice(eventOf({ type: 'gongfa', id: divine.id }), 0, 20)
    expect(ui.treasure, '顶档功法该开仪典').not.toBeNull()
    expect(ui.treasure!.kindName).toBe('功法')
    expect(ui.treasure!.name).toBe(divine.name)
  })
})

/**
 * `applyEffect` 的分发表必须覆盖 `EventEffect` 的每一种类型。
 *
 * 那是个没有 `default` 的 `switch` —— 漏一个 case 不报错、不抛异常,只是静默返回 undefined,
 * 效果凭空消失。类型检查也拦不住:`EventEffect` 加一条并集分支时,`switch` 不加 case 照样编译过
 * (`applyEffect` 的返回类型是 `string | null`,不给 case 也算合法路径)。
 *
 * 之所以用源码扫描而不是行为:这个函数没有导出,外部只能经 `autoResolveEvent` 走完整事件流程,
 * 构造覆盖 11 种效果的用例代价远大于收益。这里钉的是「种类对得上」这一件事。
 *
 * 故障注入:往 types 里加一条 `| { type: 'foo' }` 而不加 case,本条红。
 */
describe('效果分发表 · 种类与类型定义同步', () => {
  const ENGINE = readFileSync(resolve(__dirname, 'eventEngine.ts'), 'utf-8')
  const TYPES = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf-8')

  const switchCases = (): string[] => {
    const body = /switch \(effect\.type\) \{([\s\S]*?)\n  \}/.exec(ENGINE)?.[1]
    expect(body, '找不到 applyEffect 的 switch,判据会空转').toBeTruthy()
    return [...body!.matchAll(/case '([a-z][a-z0-9]*)'/g)].map(m => m[1]!)
  }

  const typeKinds = (): string[] => {
    const body = /export type EventEffect =([\s\S]*?)\n\n/.exec(TYPES)?.[1]
    expect(body, '找不到 EventEffect 类型定义,判据会空转').toBeTruthy()
    return [...body!.matchAll(/type: '([a-z][a-z0-9]*)'/g)].map(m => m[1]!)
  }

  it('switch 的 case 集合与 EventEffect 的类型集合完全一致', () => {
    const cases = [...new Set(switchCases())].sort()
    const kinds = [...new Set(typeKinds())].sort()
    expect(cases.length, '没解析到任何 case,判据失去意义').toBeGreaterThan(5)
    expect(kinds.length, '没解析到任何类型,判据失去意义').toBeGreaterThan(5)
    expect(cases, '有类型没有对应的 case(效果会静默消失),或有 case 已经不在类型里').toEqual(kinds)
  })
})

describe('事件引擎 · 法宝池为空', () => {
  /**
   * `if (!id) return null` 是真守卫:randomDropArtifact 在「tier 低于所有法宝 fromTier」
   * 时返回 null(法宝池为空),此时该效果不产出任何一行 —— 去掉守卫后
   * acquireArtifact(null) 会带着 undefined 进商店,行囊里多出查无定义的器。
   */
  it('给定 tier 低于所有法宝门槛,当事件发法宝,则该效果不产出行也不写行囊', () => {
    setActivePinia(createPinia())
    const inv = useInventoryStore()
    const artifactsBefore = JSON.stringify(inv.artifacts)
    const def: EventDef = {
      id: 'ev_test_artifact_empty',
      title: '测试',
      text: '',
      tags: ['general'],
      weight: 1,
      choices: [{ label: '拿', outcomes: [{ weight: 1, text: '得了件法宝', effects: [{ type: 'artifact' }] }] }]
    }
    const res = resolveEventChoice(def, 0, 0)
    expect(res.lines.some(l => l.includes('获得')), '池空时不该报「获得 …」').toBe(false)
    expect(JSON.stringify(inv.artifacts), '池空时不该往行囊塞东西').toBe(artifactsBefore)
  })
})
