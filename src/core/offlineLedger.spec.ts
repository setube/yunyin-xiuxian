/* eslint-disable no-console -- 离线对账表是给人看的 */
/**
 * 离线总结不许漏账:跑 60 小时离线结算,拿各资源前后差对摘要报数(灵气受上限约束,对实际差额)。
 * 故障注入:把 summary.qi / summary.ageYears 去掉,或把 ageYears 记成 0,本文件红。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/** 记录每次入账结果,供腾位用例对账(透传,不改行为) */
const acquired = vi.hoisted(() => [] as { bagged: boolean; evicted: boolean; dust: number }[])
vi.mock('./loot', async orig => {
  const mod = await orig<typeof import('./loot')>()
  return {
    ...mod,
    acquireEquipment: (...args: Parameters<typeof mod.acquireEquipment>) => {
      const res = mod.acquireEquipment(...args)
      acquired.push({ bagged: res.bagged, evicted: res.evicted, dust: res.dust })
      return res
    }
  }
})

/** 离线采样胜率:宿敌用例钉 0 才能整批连败;null 时透传真实采样 */
const forcedWinRate = vi.hoisted(() => ({ value: null as number | null }))
vi.mock('./combat', async orig => {
  const mod = await orig<typeof import('./combat')>()
  return {
    ...mod,
    sampleWinRate: (...args: Parameters<typeof mod.sampleWinRate>) => forcedWinRate.value ?? mod.sampleWinRate(...args)
  }
})

import type { OfflineSummary } from '@/types'
import { settleOffline } from './offline'
import { exploreBattleGapSec, exploreEventChance } from './exploration'
import { placeContent } from './mortalWorldService'
import { modOf } from './statsCalc'
import { recordLossBatch } from './worldMemory'
import { enemyDef } from '@/data/enemies'
import { salvageOf } from './salvage'
import { useSettingsStore } from '@/stores/settings'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { useAdventureStore } from '@/stores/adventure'
import { useInventoryStore } from '@/stores/inventory'
import { useApprenticeStore } from '@/stores/apprentice'
import { apprenticeSpoils } from './apprenticeService'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { gn } from '@/utils/gnum'
import { EXPLORE_MODES, BAG_CAPACITY } from '@/data/constants'

const GAP_HOURS = 60
const HOUR_MS = 3600 * 1000

/** 各离线产线都在动的档 */
function setupBusySave(): void {
  const game = useGameStore()
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const dongfu = useDongfuStore()
  const adventure = useAdventureStore()

  game.markStarted()
  game.lastActiveAt = Date.now() - GAP_HOURS * HOUR_MS

  player.major = 4
  player.sub = 0
  player.age = 120
  // 灵气留空,离线回充才看得见
  resources.setQi(0, player.qiCapValue)
  player.suppressedRegions = ['qingyun']
  dongfu.setLevel('mansion', 4) // 离线封顶抬到 60h 以上
  dongfu.setLevel('field', 10)
  dongfu.setLevel('alchemy', 10)
  dongfu.setLevel('library', 10)
  adventure.session = {
    regionId: 'qingyun',
    mode: 'normal',
    startedAt: Date.now() - GAP_HOURS * HOUR_MS,
    endsAt: Date.now() + 999 * HOUR_MS,
    nextBattleAt: 0,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: gn(0),
    expGain: gn(0),
    itemGain: 0
  } as unknown as typeof adventure.session
  void EXPLORE_MODES
}

describe('离线总结 · 变动了多少就报多少', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** 故障注入:删掉 settleOffline 里的 collectFinished 调用,本条红 */
  it('离线期间完工的道童在归来结算时收割并入卷轴,不留到转世被清空', () => {
    const now = Date.now()
    const game = useGameStore()
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const apprentice = useApprenticeStore()
    game.markStarted()
    game.lastActiveAt = now - 10 * 60 * 1000
    player.major = 0
    const grade = herbGradeOfMajor(player.major)
    const before = resources.herbOf(grade)
    const expected = apprenticeSpoils('ap_luanniao', 'herb', player.major, 1).herb!
    apprentice.$patch({
      apprentices: [
        {
          uid: 'offline-reap',
          archId: 'ap_luanniao',
          level: 1,
          bond: 0,
          task: { spec: 'herb', startAt: now - 60 * 60 * 1000, finishAt: now - 1000 }
        }
      ]
    })

    const summary = settleOffline(now)!

    expect(apprentice.apprentices[0]!.task, '归来结算后任务应已收割').toBeNull()
    expect(resources.herbOf(grade) - before, '道童带回的灵草应已入账').toBe(expected)
    expect(summary.notes.some(n => n.includes('道童归来')), '归来卷轴应报出道童回执').toBe(true)
    expect(apprentice.collectFinished(now, player.major), '同一趟不该被二次收割').toEqual([])
  })

  it('装备清单如实标注可看性:入包件带真实 uid,已化尘的不带', () => {
    setupBusySave()
    const summary = settleOffline(Date.now())!
    const inventory = useInventoryStore()
    const bagged = summary.equipment.filter(e => !e.recycled)
    const recycled = summary.equipment.filter(e => e.recycled)
    // 守夹具:这一档须拾得装备
    expect(bagged.length, '60 小时沐浴一场,归来清单里该有入包的装备').toBeGreaterThan(0)
    for (const eq of bagged) {
      expect(eq.uid, '入包的装备该能点开详情,uid 不能缺').toBeTruthy()
      expect(inventory.findItem(eq.uid!), 'uid 需能在背包里找到对应实例,否则点开是空的').toBeTruthy()
    }
    for (const eq of recycled) {
      expect(eq.uid, '已化尘的装备已不在包,不该再留 uid').toBeUndefined()
    }
  })

  it('行囊已满归来:装不下的件都标回收且不带 uid(让回收断言真有事可断)', () => {
    setupBusySave()
    const inventory = useInventoryStore()
    // 塞满行囊(未锁),无智能收纳时新掉落一律化尘
    for (let i = 0; i < BAG_CAPACITY; i += 1) {
      inventory.items.push({ uid: `bagfull${i}`, templateId: 'b_mabu', quality: 'mortal', tier: 1, level: 0, affixes: [] })
    }
    const summary = settleOffline(Date.now())!
    const recycled = summary.equipment.filter(e => e.recycled)
    const bagged = summary.equipment.filter(e => !e.recycled)
    expect(recycled.length, '行囊塞满,新掉落与抑制区产出都应没处放、化作尘').toBeGreaterThan(0)
    for (const eq of recycled) {
      expect(eq.uid, '化尘的件已不在包,不该留 uid').toBeUndefined()
    }
    // 满包无收纳:无件入包
    expect(bagged.length).toBe(0)
  })

  /**
   * 腾位入包时 bagged 为真,dust 是被挤掉旧物的尘。
   * 故障注入:offline.ts / suppress.ts 改回 `if (!res.bagged) recycledDust += res.dust`,本条红。
   */
  it('智能收纳腾位归来:被挤掉的旧件化出的尘与件数都要报', () => {
    setupBusySave()
    const settings = useSettingsStore()
    settings.smartKeep = { ...settings.smartKeep, enabled: true, minQuality: 1, keepCoreAffix: false, keepComboPiece: false, keepSetPiece: false, keepPerfectRolls: false }
    const inventory = useInventoryStore()
    // 凡品旧物未锁、无投入,良品以上新掉落可挤掉
    const junk = Array.from({ length: BAG_CAPACITY }, (_, i) => ({ uid: `junk${i}`, templateId: 'b_mabu', quality: 'mortal' as const, tier: 1, level: 0, affixes: [] }))
    inventory.items = junk.map(j => ({ ...j }))
    acquired.length = 0
    const summary = settleOffline(Date.now())!
    const removed = junk.filter(j => !inventory.findItem(j.uid))
    expect(removed.length, '这一档该有新件把旧物挤出去,否则判据没跑到东西').toBeGreaterThan(0)
    expect(summary.evicted, '腾位化掉的旧件数').toBe(removed.length)
    const evictedDust = removed.reduce((sum, j) => sum + salvageOf(j).dust, 0)
    const producedRecycledDust = acquired.filter(a => !a.bagged).reduce((sum, a) => sum + a.dust, 0)
    expect(summary.recycledDust, '回收化尘报少了:腾位化掉的旧件没算进去').toBe(producedRecycledDust + evictedDust)
  })

  it('60 小时归来:资源差额与摘要逐项对得上,且每项变动都有交代', () => {
    setupBusySave()
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const before = {
      exp: { ...player.exp },
      stone: { ...resources.spiritStone },
      qi: resources.qi,
      herb: resources.herb,
      herbByGrade: { ...resources.herbByGrade },
      ore: resources.ore,
      wudao: resources.wudao,
      age: player.age
    }

    const summary = settleOffline(Date.now())!
    expect(summary, '这一档应当结算出离线收益').not.toBeNull()

    const delta = {
      qi: resources.qi - before.qi,
      herb: resources.herb - before.herb,
      ore: resources.ore - before.ore,
      wudao: resources.wudao - before.wudao,
      age: player.age - before.age
    }
    console.log(
      `\n60h 归来:修为 +${summary.exp.m}e${summary.exp.e} · 灵石 +${summary.stone.m}e${summary.stone.e}` +
        ` · 灵气 +${summary.qi}(实 ${delta.qi}) · 灵草 +${summary.herb} · 玄铁 +${summary.ore}` +
        ` · 悟道 +${summary.wudao} · 战斗 ${summary.battles} · 寿元 -${summary.ageYears}`
    )

    // 资源类报数 = 实际差额(灵气取整,容 1)
    expect(summary.qi, '灵气回充没报,或报的数不是实际差额').toBeCloseTo(delta.qi, 0)
    expect(summary.herb).toBe(delta.herb)
    // 逐品净增须逐品对上:灵田可产高一品
    const gradeDelta = ([1, 2, 3, 4, 5] as const)
      .map(g => ({ grade: g, amount: resources.herbOf(g) - (before.herbByGrade[g] ?? 0) }))
      .filter(e => e.amount > 0)
    expect(summary.herbByGrade, '逐品净增与各品实际差额不符').toEqual(gradeDelta)
    expect(gradeDelta.reduce((s, e) => s + e.amount, 0), '逐品之和应等于总差额').toBe(summary.herb)
    expect(summary.ore).toBe(delta.ore)
    expect(summary.wudao).toBe(delta.wudao)
    // 寿元不受离线上限约束,按真实时长
    expect(summary.ageYears, '寿元流逝没报').toBeCloseTo(delta.age, 0)
    expect(summary.ageYears, '这一档离开 60 小时,寿元不该一点没动').toBeGreaterThan(50)
    expect(
      summary.notes.some(n => n.startsWith('寿元流逝')),
      '寿元说明应写「寿元流逝」,别冒充闭关'
    ).toBe(true)
    // 凡变动过的,摘要都须有交代
    if (delta.qi > 0) expect(summary.qi, '灵气涨了但摘要没这一项').toBeGreaterThan(0)
    if (delta.qi > 0) expect(summary.notes.some(n => n.includes('寿元流逝')), '寿元流逝该有一句说明').toBe(true)
  })

  it('封顶也不改变「报的就是实际差额」:洞府 0 级时灵草只按 8 小时结', () => {
    setupBusySave()
    const dongfu = useDongfuStore()
    dongfu.setLevel('mansion', 0)
    const resources = useResourcesStore()
    const herbBefore = resources.herb
    const summary = settleOffline(Date.now())!
    expect(summary.capped, '洞府 0 级时 60h 缺席应当被封顶').toBe(true)
    expect(summary.herb, '摘要报的灵草数 = 实际进账数').toBe(resources.herb - herbBefore)
    expect(summary.qi, '摘要报的灵气数 = 实际进账数').toBeCloseTo(resources.qi, -1)
  })
})

/**
 * 宿敌行报入账后的实际败绩:离线一整批可从 0 直接累过门槛,不能写死门槛次数。
 * 故障注入:offline.ts 宿敌行改回 `败北${NEMESIS_THRESHOLD}次`,两条「5 次」红。
 */
describe('离线总结 · 宿敌行报实际败北次数', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    forcedWinRate.value = 0
  })
  afterEach(() => {
    forcedWinRate.value = null
  })

  /** 青云山麓缺席到恰好打 n 场;胜率钉 0,场场皆败 */
  function settleLosingTrip(n: number): OfflineSummary {
    const now = Date.now()
    const game = useGameStore()
    const adventure = useAdventureStore()
    game.markStarted()
    // 场次 = 遇敌 − round(遇敌 × 际遇率),与 settleOffline 同一份口径;逐个加遇敌数到恰好 n 场
    // 上限防死循环:际遇率趋近 1 时凑不出,交给下面的夹具断言报红
    const mods = usePlayerStore().finalStats.mods
    const gapSec = exploreBattleGapSec(modOf(mods, 'explorationSpeed'))
    const chance = exploreEventChance('qingyun', mods)
    let encounters = n
    while (encounters - Math.round(encounters * chance) < n && encounters < n * 10) encounters += 1
    // 多给半个间隔:遇敌数向下取整,不能落在整除边界上
    game.lastActiveAt = now - (encounters + 0.5) * gapSec * 1000
    adventure.session = {
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: game.lastActiveAt,
      endsAt: now + 999 * HOUR_MS,
      nextBattleAt: 0,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: gn(0),
      expGain: gn(0),
      itemGain: 0
    }
    const summary = settleOffline(now)!
    expect([summary.battles, summary.wins], `夹具须恰好连败 ${n} 场`).toEqual([n, 0])
    return summary
  }

  /** 本区每个可能遇上的敌手都预记败绩:离线敌群随机取一,逐个记才不赌抽签 */
  function seedLosses(times: number): void {
    const player = usePlayerStore()
    const ids = [...new Set(placeContent('qingyun').enemies)]
    player.setNemeses(
      ids.reduce(
        (list, id) => recordLossBatch(list, id, enemyDef(id)!.name, 'qingyun', Date.now() - HOUR_MS, times).list,
        player.nemeses
      )
    )
  }

  const nemesisNotes = (summary: OfflineSummary): string[] => summary.notes.filter(n => n.startsWith('【宿敌】'))

  it('一批连败 5 次:卷轴报「败北5次」', () => {
    const summary = settleLosingTrip(5)
    const nemeses = usePlayerStore().nemeses
    expect(nemeses.map(n => n.lossCount), '5 败整批入账').toEqual([5])
    expect(nemesisNotes(summary)).toEqual([`【宿敌】${nemeses[0]!.enemyName} · 败北5次`])
  })

  it('在线已败 2 次、离线再连败 3 次:报累计「败北5次」,不报本批场数', () => {
    seedLosses(2)
    const summary = settleLosingTrip(3)
    const hit = usePlayerStore().nemeses.filter(n => n.lossCount !== 2)
    expect(hit.map(n => n.lossCount), '抽中的敌手 2 + 3 败').toEqual([5])
    expect(nemesisNotes(summary)).toEqual([`【宿敌】${hit[0]!.enemyName} · 败北5次`])
  })

  it('恰好连败 3 次:报「败北3次」', () => {
    const summary = settleLosingTrip(3)
    const nemeses = usePlayerStore().nemeses
    expect(nemeses.map(n => n.lossCount), '3 败整批入账').toEqual([3])
    expect(nemesisNotes(summary)).toEqual([`【宿敌】${nemeses[0]!.enemyName} · 败北3次`])
  })

  it('已是宿敌的再败不重复报', () => {
    seedLosses(3)
    const summary = settleLosingTrip(3)
    expect(usePlayerStore().nemeses.map(n => n.lossCount), '抽中的宿敌照样记败').toContain(6)
    expect(nemesisNotes(summary), '已成宿敌不再报').toEqual([])
  })
})

/**
 * 时钟往前跳过之后的自愈。
 * 玩家把系统时间调快(stampActive 写下一个未来时间戳),此后再进游戏 now - lastActiveAt 为负,
 * dtSec 被 Math.max 夹成 0,离线收益会一直为 0 —— 直到他把时钟调回去。
 * 故障注入:删掉 settleOffline 里对未来时间戳的钳制,本条红。
 */
describe('离线结算 · 时间戳在未来时自愈', () => {
  /*
   * 新 pinia = 干净的 game / player 分片。
   *
   * 原先没有 beforeEach:本组只把 `player.major` 设成 0,而灵气上限等仍取自
   * 前面某条用例留下的状态 —— 乱序下 `settleOffline` 算出的 qi 变成负数
   * (`expected -1295000 to be greater than 0`),看着像结算真出了问题。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lastActiveAt 在未来:重锚到当下,下一次离线照常结算', () => {
    const now = Date.now()
    const game = useGameStore()
    const player = usePlayerStore()
    game.markStarted()
    player.major = 0
    // 系统时钟曾被调快一年,盖下的戳远在未来
    game.lastActiveAt = now + 365 * 24 * 3600 * 1000

    const first = settleOffline(now)
    expect(first, '未来时间戳这一趟没有可结算的时长,应为 null').toBeNull()
    expect(game.lastActiveAt, 'lastActiveAt 须被重锚到当下,否则之后每趟 dtSec 都是 0').toBe(now)

    // 重锚之后,再过 2 小时就能正常结算
    game.lastActiveAt = now - 2 * 3600 * 1000
    const second = settleOffline(now)
    expect(second, '重锚后离线结算应恢复正常').not.toBeNull()
    expect(second!.qi, '应有灵气入账').toBeGreaterThan(0)
  })
})
