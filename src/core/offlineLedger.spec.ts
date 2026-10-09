/* eslint-disable no-console -- 离线对账表是给人看的 */
/**
 * 离线总结不许漏账 —— 变动了多少,就得说出多少
 *
 * 「归来」那个弹窗是玩家唯一一次看到离线期间发生了什么的机会。它漏掉一项,
 * 玩家就永远不知道自己拿到过(或失去过)什么:此前它报了修为/灵石/灵草/玄铁/
 * 悟道点/战斗/际遇/回收化尘,却没提**灵气回充**与**寿元流逝** —— 前者是白得的,
 * 后者是要命的(寿元归零就死了,而玩家只会发现「怎么忽然老了」)。
 *
 * 这里不重抄一份清单,而是**看真实差额**:跑一次 60 小时离线结算,
 * 拿每个资源的前后差去对摘要里报的数(灵气受上限约束,故对的是实际差额),
 * 再要求「凡变动过的东西,摘要里都有交代」。
 *
 * 故障注入:把 summary.qi / summary.ageYears 去掉,或把 ageYears 记成 0,本文件立刻红。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/** 记下每一次入账的结果:腾位那条用例要拿它对账(透传,不改行为) */
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

import { settleOffline } from './offline'
import { salvageOf } from './salvage'
import { useSettingsStore } from '@/stores/settings'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { useAdventureStore } from '@/stores/adventure'
import { useInventoryStore } from '@/stores/inventory'
import { gn } from '@/utils/gnum'
import { EXPLORE_MODES, BAG_CAPACITY } from '@/data/constants'

const GAP_HOURS = 60
const HOUR_MS = 3600 * 1000

/** 攒一份「每个离线产线都在动」的档 */
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

  it('装备清单如实标注可看性:入包件带真实 uid,已化尘的不带', () => {
    setupBusySave()
    const summary = settleOffline(Date.now())!
    const inventory = useInventoryStore()
    const bagged = summary.equipment.filter(e => !e.recycled)
    const recycled = summary.equipment.filter(e => e.recycled)
    // 这一档打得凶,包里至少该拾得装备;若断言因夹具变动而失效,先一眼看得出
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
    // 塞满行囊(120 件旧物、未锁),新掉落无处可放 —— 无智能收纳时一律化尘
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
    // 满包且无智能收纳:没有任何件真的入包,清单里不该再有「可点开」的件
    expect(bagged.length).toBe(0)
  })

  /**
   * 智能收纳腾位:新件值得留、包已满时,挤掉包里最差的一件旧物化尘再入包。
   * 此时入账结果是 bagged:true,而 dust 记的是那件旧物 —— 结算若只在 !bagged 时计尘,
   * 归来卷轴就少报了这份尘,件数也少算(审查讨论指出)。
   * 注入:offline.ts / suppress.ts 改回 `if (!res.bagged) recycledDust += res.dust` → 本条红。
   */
  it('智能收纳腾位归来:被挤掉的旧件化出的尘与件数都要报', () => {
    setupBusySave()
    const settings = useSettingsStore()
    settings.smartKeep = { ...settings.smartKeep, enabled: true, minQuality: 1, keepCoreAffix: false, keepComboPiece: false, keepSetPiece: false, keepPerfectRolls: false }
    const inventory = useInventoryStore()
    // 塞满凡品旧物(未锁、无投入,收纳判「无缘」可挤);良品以上的新掉落会把它们挤出去
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

    // 一 资源类:摘要报的数就是实际差额(灵气取整,故容 1)
    expect(summary.qi, '灵气回充没报,或报的数不是实际差额').toBeCloseTo(delta.qi, 0)
    expect(summary.herb).toBe(delta.herb)
    // 灵草逐品净增:各品实际差额要一一对上,且之和等于总差额 —— 灵田前瞻产的高一品不能被单品名吞掉
    const gradeDelta = ([1, 2, 3, 4, 5] as const)
      .map(g => ({ grade: g, amount: resources.herbOf(g) - (before.herbByGrade[g] ?? 0) }))
      .filter(e => e.amount > 0)
    expect(summary.herbByGrade, '逐品净增与各品实际差额不符').toEqual(gradeDelta)
    expect(gradeDelta.reduce((s, e) => s + e.amount, 0), '逐品之和应等于总差额').toBe(summary.herb)
    expect(summary.ore).toBe(delta.ore)
    expect(summary.wudao).toBe(delta.wudao)
    // 二 寿元:流逝多少就报多少(它不受离线上限约束,按真实时长算)
    expect(summary.ageYears, '寿元流逝没报').toBeCloseTo(delta.age, 0)
    expect(summary.ageYears, '这一档离开 60 小时,寿元不该一点没动').toBeGreaterThan(50)
    expect(
      summary.notes.some(n => n.startsWith('此去寿元流逝')),
      '寿元说明应写「此去」,别冒充闭关'
    ).toBe(true)
    // 三 凡变动过的,摘要里都得有交代 —— 不许有「悄悄动了」的资源
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
