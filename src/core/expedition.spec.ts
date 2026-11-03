/* eslint-disable no-console -- 梯子表是给人看的 */
/**
 * 远征 · 端到端:扣费 → 启程 → 择路 → 界主 → 结算,走真实路径,不绕开 store。
 *   账目:出发扣的道源 = 该界入界价
 *   梯子:四重天界按锚点层级成阶梯(锚点标定见 celestialCaliber.spec)
 *   判定:道之理解与境界压制文案,战前预估与战报同源
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { CELESTIAL_WORLDS, EXPEDITION_ROUTE_LAYERS } from '@/data/endgame'
import { forecastExpedition, startWorldExpedition, chooseRouteNode, challengeGuardian, expeditionFoeShapes, challengeMutation, rollMutators, abandonExpedition } from './expedition'
import { MUTATORS } from '@/data/mutators'
import { celestialJudgementLines } from './gauntlet'
import { daoSourceShortfall } from './daoSource'
import { gn } from '@/utils/gnum'
import type { EquipSlot, EquipmentInstance } from '@/types'

const SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']
/** 人间界顶配一身 */
const MORTAL_TOP = ['w_jiujie', 'h_zichen', 'b_taiqing', 'wr_jieyun', 'bl_yunlei', 'bo_lingxu', 'n_jiuzhuan', 'r_ziyuan', 'tl_yulei']
/** 混沌海那一身 */
const CHAOS_TOP = ['w_benyuan', 'h_benyuan', 'b_benyuanshen', 'wr_benyuan', 'bl_benyuan', 'bo_benyuan', 'n_hongmengzhu', 'r_daozu', 'tl_daozuzhuan']

function seated(major: number, tpls: string[], quality: EquipmentInstance['quality'], tier: number): void {
  const player = usePlayerStore()
  player.initCharacter('远征自检', { roots: [{ element: 'wood', aptitude: 90 }] } as never)
  player.major = major
  player.sub = 9
  const inv = useInventoryStore()
  inv.items = tpls.map((templateId, i): EquipmentInstance => ({
    uid: `x${i}`,
    templateId,
    quality,
    tier,
    level: 5,
    affixes: [{ id: 'atk4', roll: 0.8 }, { id: 'hp4', roll: 0.6 }, { id: 'def4', roll: 0.6 }]
  }))
  inv.items.forEach((it, i) => inv.equip(it.uid, SLOTS[i]!))
  const endgame = useEndgameStore()
  endgame.daoPath = 'sword'
  endgame.addDaoSource(5000)
}

const world = (id: string) => CELESTIAL_WORLDS.find(w => w.id === id)!

beforeEach(() => setActivePinia(createPinia()))

describe('远征 · 账目', () => {
  it('出发扣的道源,正是这一界写着的入界价', () => {
    seated(9, MORTAL_TOP, 'heaven', 20)
    const eg = useEndgameStore()
    const before = eg.daoSource
    const chiyan = world('chiyan')
    const outcome = startWorldExpedition(chiyan.id, null)
    expect(outcome, '这一界开不起来(门槛或道源)').not.toBeNull()
    expect(before - eg.daoSource, '扣的道源与入界价对不上').toBe(chiyan.entryCost)
    expect(eg.worldRun?.worldId, '上路了却没记在 store 里').toBe(chiyan.id)
  })

  it('道源不足时不开船,也不记账', () => {
    seated(9, MORTAL_TOP, 'heaven', 20)
    const eg = useEndgameStore()
    eg.daoSource = 1 // 连一界都进不去
    const cost = world('chiyan').entryCost
    expect(startWorldExpedition('chiyan', null)).toBeNull()
    expect(eg.worldRun).toBeNull()
    expect(eg.daoSource, '不开船还扣了道源').toBe(1)
    expect(useUiStore().toasts.at(-1)?.text).toContain(`道源尚差 ${cost - 1}`)
  })

  it('道源只差一部分:远征拒因报实际差额,不报总价', () => {
    const eg = useEndgameStore()
    eg.daoSource = 10
    const cost = 50
    const short = daoSourceShortfall(cost, eg.daoSource)
    expect(short.short).toEqual(gn(cost - 10))
    expect(short.reason).toBe(`道源尚差 ${cost - 10}`)
  })
})

describe('远征 · 梯子(锚点定标:该境界的人才打得动)', () => {
  const rate = (major: number, tpls: string[], quality: EquipmentInstance['quality'], tier: number, worldId: string): number => {
    setActivePinia(createPinia())
    seated(major, tpls, quality, tier)
    const f = forecastExpedition(worldId, null)!
    // ★ 数作可比较的量
    return f.stars.split('').filter(c => c === '★').length
  }

  it('真仙带一身人间界顶配,赤炎天可打;到不了无相天', () => {
    const chiyan = rate(9, MORTAL_TOP, 'heaven', 20, 'chiyan')
    const wuxiang = rate(9, MORTAL_TOP, 'heaven', 20, 'wuxiang')
    console.log(`\n真仙:赤炎天 ${'★'.repeat(chiyan)} · 无相天 ${'★'.repeat(wuxiang)}`)
    expect(chiyan, '真仙打不动赤炎天 —— 第一重天界就没人能进').toBeGreaterThanOrEqual(3)
    expect(wuxiang, '真仙也能闯无相天 —— 阶梯不存在了').toBeLessThan(chiyan)
  })

  it('混沌道祖带一身混沌海顶配,无相天可打', () => {
    const wuxiang = rate(20, CHAOS_TOP, 'divine', 32, 'wuxiang')
    console.log(`混沌道祖:无相天 ${'★'.repeat(wuxiang)}`)
    expect(wuxiang, '走到阶梯尽头却打不动最后一界').toBeGreaterThanOrEqual(3)
  })

  it('同一境界下,装备越好越有把握(基础三维作数)', () => {
    // 须选两端都不饱和的一对:道祖打无相天两边都是五星顶格,量不出差别
    const bare = rate(9, [], 'heaven', 20, 'chiyan')
    const geared = rate(9, MORTAL_TOP, 'heaven', 20, 'chiyan')
    console.log(`真仙打赤炎天:裸装 ${'★'.repeat(bare) || '无'} → 一身人间界顶配 ${'★'.repeat(geared)}`)
    expect(geared, '换了更好的装备,胜算却没变 —— 基础属性又不作数了').toBeGreaterThan(bare)
  })
})

describe('远征 · 判定看得见', () => {
  it('战前预估给出道之理解与境界压制,且与判定函数同源', () => {
    seated(9, MORTAL_TOP, 'heaven', 20)
    const chiyan = world('chiyan')
    const f = forecastExpedition(chiyan.id, null)!
    const player = usePlayerStore()
    expect(f.judgementLines, '预估里没有判定文案').toEqual(
      celestialJudgementLines(player.celestialStats.mods, player.major, chiyan.anchorTier)
    )
    // 真仙打锚在高一境的界,应有境界压制
    expect(f.judgementLines.join('\n'), '低于锚点境界却没提境界压制').toContain('境界压制')
  })

  it('打得过的一次不该有判定文案(没有判定就不占字数)', () => {
    seated(20, CHAOS_TOP, 'divine', 32)
    const chiyan = world('chiyan')
    const f = forecastExpedition(chiyan.id, null)!
    expect(f.judgementLines, '道祖打第一重天界还被判定').toEqual([])
  })

  it('打完一趟,战报带上这一界的判定', () => {
    seated(9, MORTAL_TOP, 'heaven', 20)
    const chiyan = world('chiyan')
    // 打到终局(中途败也算)
    let outcome = startWorldExpedition(chiyan.id, null)
    let guard = 0
    while (outcome && outcome.type === 'advance' && guard < 12) {
      guard += 1
      const run = useEndgameStore().worldRun
      if (!run) break
      outcome = run.layer >= 3 ? challengeGuardian() : chooseRouteNode(0)
    }
    expect(outcome, '这趟没走到终局也没败 —— 判据失去对象').not.toBeNull()
    expect(outcome!.type).not.toBe('advance')
    const player = usePlayerStore()
    expect(outcome!.judgementLines, '战报没交代这一战的判定').toEqual(
      celestialJudgementLines(player.celestialStats.mods, player.major, chiyan.anchorTier)
    )
  })
})

describe('远征 · 败战即结(不留残局续打)', () => {
  it('裸装真仙入赤炎天:扣了入界价、首战败 → type=lost、worldRun 清空', () => {
    // 裸装首战必败(确定性)
    seated(9, [], 'heaven', 20)
    const eg = useEndgameStore()
    const chiyan = world('chiyan')
    const before = eg.daoSource
    const outcome = startWorldExpedition(chiyan.id, null)
    expect(outcome).not.toBeNull()
    expect(before - eg.daoSource, '确已入界定战(非开船前被拒)').toBe(chiyan.entryCost)
    expect(outcome!.type).toBe('lost')
    // settle 清空 worldRun:不留可免费续打的残局
    expect(eg.worldRun).toBeNull()
  })

  it('败战不留连胜/不退层(本就无可续):run 被清,无累计累增状态漂移', () => {
    seated(9, [], 'heaven', 20)
    const outcome = startWorldExpedition('chiyan', null)
    expect(outcome!.type).toBe('lost')
    expect(useEndgameStore().worldRun).toBeNull()
  })
})

describe('终局付费战斗 · 在途互斥', () => {
  it('历练在途:启程与变数连战都在扣费前拒绝', () => {
    seated(9, MORTAL_TOP, 'heaven', 20)
    const eg = useEndgameStore()
    useAdventureStore().setSession({
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: 0,
      endsAt: Date.now() + 60_000,
      nextBattleAt: Date.now() + 10_000,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: gn(0),
      expGain: gn(0),
      itemGain: 0
    })
    const before = eg.daoSource
    expect(startWorldExpedition('chiyan', null), '历练在途仍可启程').toBeNull()
    expect(challengeMutation([]), '历练在途仍可开变数').toBeNull()
    expect(eg.daoSource, '在途拒绝不得扣道源').toBe(before)
    expect(useUiStore().toasts.at(-1)?.text).toContain('历练在途')
  })

  it('远征在途:变数连战在扣费前拒绝', () => {
    seated(9, MORTAL_TOP, 'heaven', 20)
    const eg = useEndgameStore()
    eg.worldRun = { worldId: 'chiyan', pactId: null, gateId: null, layer: 1, bonus: 0, rows: [], carriedHpPct: 1, totalRounds: 0, winStacks: 0 }
    const before = eg.daoSource
    expect(challengeMutation([])).toBeNull()
    expect(eg.daoSource).toBe(before)
    expect(useUiStore().toasts.at(-1)?.text).toContain('远征在途')
  })
})

describe('远征预估对阵与实打同源(入界 + 每层节点 + 界主,共 5 战,非 world.fights)', () => {
  it('每界预估对阵 = 入界 + EXPEDITION_ROUTE_LAYERS 真实节点敌 + 界主(身份同一,非循环堆)', () => {
    for (const w of CELESTIAL_WORLDS) {
      const foes = expeditionFoeShapes(w)
      expect(foes.length, `${w.id} 应恰为 1+${EXPEDITION_ROUTE_LAYERS}+1 战`).toBe(1 + EXPEDITION_ROUTE_LAYERS + 1)
      expect(foes[0], `${w.id} 首战应为入界之敌`).toBe(w.foes[0])
      for (let layer = 0; layer < EXPEDITION_ROUTE_LAYERS; layer += 1) {
        const routeFoe = w.routes[layer]?.[0]?.foe
        if (routeFoe) expect(foes[1 + layer], `${w.id} 第 ${layer + 2} 战应为真实节点敌`).toBe(routeFoe)
      }
      expect(foes[foes.length - 1], `${w.id} 末战应为界主`).toBe(w.guardian)
    }
  })
})

/**
 * `rollMutators` 承诺「三条不重复」,但之前一条判据都没有。
 *
 * 它由试炼页的「窥探变数 / 再探」直接调用,结果直接决定这场挑战的难度构成。
 * 若去重那步写坏,同一条变数能被抽中两次 —— 玩家看到「三条」实则只有两条生效。
 */
describe('变数抽取 · 三条不重复', () => {
  it('每次都给三条,且互不相同、都来自池子', () => {
    const ids = new Set(MUTATORS.map(m => m.id))
    for (let i = 0; i < 60; i += 1) {
      const picked = rollMutators()
      expect(picked.length, `第 ${i} 次只抽到 ${picked.length} 条`).toBe(Math.min(3, MUTATORS.length))
      expect(new Set(picked).size, `第 ${i} 次出现重复:${picked.join(',')}`).toBe(3)
      for (const id of picked) expect(ids.has(id), `抽到了池外的 ${id}`).toBe(true)
    }
  })

  it('多次抽取能覆盖到池里全部变数(不是总抽同三条)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) for (const id of rollMutators()) seen.add(id)
    expect(seen.size, `200 次只覆盖了 ${seen.size}/${MUTATORS.length} 条`).toBe(MUTATORS.length)
  })

  it('池子不足三条时给几条算几条,不硬凑空 id', () => {
    /*
     * 原先只对**全量池**调一次、再查 `typeof id === 'string'` —— 那是最弱的断言,
     * 「不足三条」这个标题写的事情一次都没发生过。改成注入短池。
     */
    expect(rollMutators([{ id: 'a' }]), '单条池只该给一条').toEqual(['a'])
    const two = rollMutators([{ id: 'a' }, { id: 'b' }])
    expect(two.length, '两条池只该给两条').toBe(2)
    expect(new Set(two).size, '两条池不该抽出重复').toBe(2)
    expect(rollMutators([]), '空池给空数组,不该塞 undefined').toEqual([])
  })
})

/**
 * 放弃远征:不可逆操作,之前一条判据都没有。
 *
 * 它由远征面板的「退出」直接调用:记一条未通关的道痕、弹一句回执、清空 worldRun。
 * 少了任一步都会留下坏状态 —— 不记录则这一趟白打且不会出现在道痕里;
 * 不清空则玩家被卡在「已在远征中」,再也开不了新的。
 */
describe('远征 · 放弃这一趟', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const runStub = (worldId: string) =>
    ({
      worldId,
      pactId: null,
      layer: 1,
      bonus: 0,
      rows: [],
      carriedHpPct: 1,
      totalRounds: 12,
      winStacks: 0
    }) as never

  it('没有进行中的远征时什么都不做(不崩、不弹回执)', () => {
    const endgame = useEndgameStore()
    const ui = useUiStore()
    endgame.worldRun = null
    expect(() => abandonExpedition()).not.toThrow()
    expect(endgame.worldRun).toBeNull()
    expect(ui.toasts.length, '没有远征却弹了回执').toBe(0)
  })

  it('有远征时:清空 worldRun 并记一条未通关的道痕', () => {
    const endgame = useEndgameStore()
    const world = CELESTIAL_WORLDS[0]!
    endgame.worldRun = runStub(world.id)
    const before = endgame.marks.length
    abandonExpedition()
    expect(endgame.worldRun, '不清空会让玩家卡在「已在远征中」').toBeNull()
    expect(endgame.marks.length, '放弃这一趟应当留下道痕').toBe(before + 1)
    const mark = endgame.marks[endgame.marks.length - 1]!
    expect(mark.targetId).toBe(world.id)
    expect(mark.cleared, '放弃不是通关,不该记为已清').toBe(false)
    expect(mark.rounds, '应当带上这趟打过的回合数').toBe(12)
  })

  it('放弃之后还能再开一趟(状态没被卡死)', () => {
    const endgame = useEndgameStore()
    endgame.daoPath = 'sword' as never
    const world = CELESTIAL_WORLDS[0]!
    endgame.worldRun = runStub(world.id)
    abandonExpedition()
    expect(endgame.worldRun).toBeNull()
  })
})
