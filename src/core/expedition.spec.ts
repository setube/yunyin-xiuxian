/* eslint-disable no-console -- 梯子表是给人看的 */
/**
 * 远征 · 端到端(终局的核心功能,此前只有零散判据碰过它)
 *
 * 这里走**真实路径**:花钱 → 开一趟 → 择路 → 打界主 → 结算,中间不绕开 store。
 * 盯三件事:
 *   一 **账目**:出发扣的道源,正是这一界写着的入界价;
 *   二 **梯子**:四重天界按锚点层级排成阶梯 —— 该境界的人打得动,
 *      差一大截的人打不动,高一境的人压着打(实测过锚点标定,见 celestialCaliber.spec);
 *   三 **判定看得见**:道之理解与境界压制的文案,战前预估与战报读同一份。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { forecastExpedition, startWorldExpedition, chooseRouteNode, challengeGuardian } from './expedition'
import { celestialJudgementLines } from './gauntlet'
import type { EquipSlot, EquipmentInstance } from '@/types'

const SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']
/** 人间界顶配那一身(飞升时能带走的最好家当) */
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
    expect(startWorldExpedition('chiyan', null)).toBeNull()
    expect(eg.worldRun).toBeNull()
    expect(eg.daoSource, '不开船还扣了道源').toBe(1)
  })
})

describe('远征 · 梯子(锚点定标:该境界的人才打得动)', () => {
  const rate = (major: number, tpls: string[], quality: EquipmentInstance['quality'], tier: number, worldId: string): number => {
    setActivePinia(createPinia())
    seated(major, tpls, quality, tier)
    const f = forecastExpedition(worldId, null)!
    // 星级是分档的,直接换算回可比较的量:★ 越多越有把握
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
    /**
     * 选一对**没有两端饱和**的:真仙打赤炎天(锚在玄仙,本就是压着打),
     * 裸装够呛、披挂能打。若拿道祖打无相天来比,两边都是五星(顶格),
     * 这条判据就量不出东西了 —— 不是属性不作数,是刻度用完了。
     */
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
    // 真仙去打锚在高一境的界,该有境界压制那一句
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
    // 一路打到终局:入界 → 三层 → 界主(中途败了也算终局)
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
    // 无装 = 空属性战力,赤炎天首战(界内敌人)必败——确定性败战
    seated(9, [], 'heaven', 20)
    const eg = useEndgameStore()
    const chiyan = world('chiyan')
    const before = eg.daoSource
    const outcome = startWorldExpedition(chiyan.id, null)
    expect(outcome).not.toBeNull()
    expect(before - eg.daoSource, '确已入界定战(非开船前被拒)').toBe(chiyan.entryCost)
    expect(outcome!.type).toBe('lost')
    // settle 会把 worldRun 清空:败战即结束本趟,不留下可免费续打的残局
    expect(eg.worldRun).toBeNull()
  })

  it('败战不留连胜/不退层(本就无可续):run 被清,无累计累增状态漂移', () => {
    seated(9, [], 'heaven', 20)
    const outcome = startWorldExpedition('chiyan', null)
    expect(outcome!.type).toBe('lost')
    expect(useEndgameStore().worldRun).toBeNull()
  })
})
