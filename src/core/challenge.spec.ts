/**
 * 相元挑战(challenge.ts)—— undertakeChallenge 清/败原子守卫。
 *
 * 此前的零覆盖审计发现 undertakeChallenge(自 challenge)不被任何 spec 直接触碰:
 * verifyChallenge 只在 r293 的今日天道 spec 里走过校验定价,真正的「立约应战」路径
 * (扣入场费 → 真刀真枪打 → 赏/记谱)无人看守。任何一个让「未清也发奖」或
 * 「入场费不扣」的回归都会沉默通过 CI。
 *
 * 刻意不 mock 战斗(避免压弱 celestialStats,同 trialChallenge 惯例):走真实 combat,
 * 用「顶配清/裸装败」的极大战力差驱动确定性的清/败两案。
 *
 * 草案选用 chiyan(赤炎天)无变数:经天道裁判(verifyChallenge)判定 ok、
 * 报酬有限为正;真仙(major 9,ENDGAME 门槛)裸装必败、一身混沌顶配必清
 * (same 极大战力差惯例 as expedition 败战即结;实测跨随机状态 20/20 稳定)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import type { EquipSlot, EquipmentInstance } from '@/types'
import { CHALLENGE_ENTRY_COST, verifyChallenge, undertakeChallenge, type ChallengeDraft } from './challenge'

const S_SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']
const S_CHAOS_TOP = ['w_benyuan', 'h_benyuan', 'b_benyuanshen', 'wr_benyuan', 'bl_benyuan', 'bo_benyuan', 'n_hongmengzhu', 'r_daozu', 'tl_daozuzhuan']

const DRAFT: ChallengeDraft = { worldId: 'chiyan', mutatorIds: [], pactId: null, name: '相元之约' }

describe('相元挑战 · undertakeChallenge 清/败原子', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed(topGear: boolean): void {
    const player = usePlayerStore()
    player.initCharacter('挑战自检', { roots: [{ element: 'wood', aptitude: 90 }] } as never)
    // 真仙 = WORLD_BREAK_MAJOR = 9(endgame 门槛),裸装空属性战力必败赤炎天
    player.major = 9
    player.sub = 0
    if (topGear) {
      const inv = useInventoryStore()
      inv.items = S_CHAOS_TOP.map((templateId, i): EquipmentInstance => ({
        uid: `t${i}`, templateId, quality: 'divine', tier: 60, level: 25,
        affixes: [{ id: 'atk4', roll: 0.8 }, { id: 'hp4', roll: 0.6 }, { id: 'def4', roll: 0.6 }]
      }))
      inv.items.forEach((it, i) => inv.equip(it.uid, S_SLOTS[i]!))
    }
    const e = useEndgameStore()
    e.daoPath = 'sword'
    e.addDaoSource(500)
  }

  it('该草案经天道裁判 ok 且报酬有限为正(清/败两案的定价前提)', () => {
    const verdict = verifyChallenge(DRAFT)
    expect(verdict).not.toBeNull()
    expect(verdict!.ok).toBe(true)
    expect(verdict!.reward).toBeGreaterThan(0)
    expect(verdict!.reward).toBeLessThanOrEqual(90)
  })

  it('顶配清:扣入场费、赏裁判定价的 rewardDaoSource、记 best_custom 纪录与里程碑', () => {
    seed(true)
    const verdict = verifyChallenge(DRAFT)!
    const e = useEndgameStore()
    const before = e.daoSource
    const out = undertakeChallenge(DRAFT, verdict)
    expect(out).not.toBeNull()
    expect(out!.report.cleared, '顶配应清, fw=' + out!.report.fightsWon).toBe(true)
    expect(out!.rewardDaoSource).toBe(verdict.reward)
    // 原子:入场费 -15,奖 +rewardDaoSource
    expect(before - e.daoSource).toBe(CHALLENGE_ENTRY_COST - verdict.reward)
    expect(e.records.best_custom?.value).toBe(verdict.reward)
    expect(e.milestones.some(m => m.id === 'first_custom'), '清约应记 first_custom 里程碑').toBe(true)
  })

  it('裸装败:不赏、不记谱,入场费照扣(败战也烧入场钱,不白吃)', () => {
    seed(false)
    const verdict = verifyChallenge(DRAFT)!
    const e = useEndgameStore()
    const before = e.daoSource
    const out = undertakeChallenge(DRAFT, verdict)
    expect(out).not.toBeNull()
    expect(out!.report.cleared).toBe(false)
    expect(out!.rewardDaoSource).toBe(0)
    expect(before - e.daoSource).toBe(CHALLENGE_ENTRY_COST)
    expect(e.records.best_custom).toBeUndefined()
    expect(e.milestones.some(m => m.id === 'first_custom')).toBe(false)
  })

  it('道源不足：不进战斗、不扣账、返回 null', () => {
    seed(true)
    const e = useEndgameStore()
    e.daoSource = 10 // 入场费 15，不够
    const verdict = verifyChallenge(DRAFT)!
    const before = e.daoSource
    const out = undertakeChallenge(DRAFT, verdict)
    expect(out).toBeNull()
    expect(e.daoSource).toBe(before)
  })

  it('入场费单一来源:常数为正且有限(原子守卫的经济根基)', () => {
    expect(Number.isInteger(CHALLENGE_ENTRY_COST)).toBe(true)
    expect(CHALLENGE_ENTRY_COST).toBeGreaterThan(0)
  })
})
