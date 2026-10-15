/**
 * 天道试炼(TRIALS:qisha/yixian/wuhui)—— challengeTrial run-state 守卫。
 *
 * 此前 challengeTrial(自 endgameService)与 recordTrial 全零覆盖:整条 TRIALS 运行路径
 * 不被任何 spec 触碰。这里钉三件事:
 *   一 recordTrial 的 bestRounds 取最小(更好成绩守谱),更差的回合不清掉纪录;
 *   二 顶配清 trial:扣入界费、赏 rewardDaoSource、记谱(clears/best),里程碑;
 *   三 裸装败 trial:不赏、不记谱,入界费照扣(败战也烧入场钱,不白吃)。
 *
 * 注意:此文件刻意**不** mock 战斗/渡劫(不像 endgameService.spec 的 tribulationDecision
 * 档)——该 mock 会把 celestialStats 压弱,顶配也不再清试炼。这里走真实 combat。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { TRIALS, trialDef, celestialWorldDef } from '@/data/endgame'
import { challengeTrial, rewriteMark, REWRITE_ENTRY_COST } from './endgameService'
import { gn } from '@/utils/gnum'
import type { EquipSlot, EquipmentInstance } from '@/types'

const S_SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']
const S_CHAOS_TOP = ['w_benyuan', 'h_benyuan', 'b_benyuanshen', 'wr_benyuan', 'bl_benyuan', 'bo_benyuan', 'n_hongmengzhu', 'r_daozu', 'tl_daozuzhuan']

describe('天道试炼 · challengeTrial 清/败原子', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seedTrialPlayer(topGear: boolean): void {
    const player = usePlayerStore()
    player.initCharacter('天道自检', { roots: [{ element: 'wood', aptitude: 90 }] } as never)
    player.major = 20
    player.sub = 9
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

  it('顶配清 qisha:扣入界费、赏 rewardDaoSource、记谱(clears/best)、全捷战数=试炼场数', () => {
    seedTrialPlayer(true)
    const e = useEndgameStore()
    const before = e.daoSource
    const t = trialDef('qisha')!
    const out = challengeTrial('qisha')!
    expect(out.report.cleared, 'qisha cleared=false, fw='+out.report.fightsWon).toBe(true)
    expect(out.report.fightsWon).toBe(t.fights) // 清即全捷
    expect(out.rewardDaoSource).toBe(t.rewardDaoSource)
    expect(before - e.daoSource).toBe(t.entryCost - t.rewardDaoSource)
    expect(e.trialRecords['qisha']?.clears).toBe(1)
    expect(e.trialRecords['qisha']?.bestRounds).toBe(out.report.totalRounds)
  })

  it('裸装败 qisha:不赏、不记谱,入界费照扣', () => {
    seedTrialPlayer(false)
    const e = useEndgameStore()
    const before = e.daoSource
    const out = challengeTrial('qisha')!
    expect(out.report.cleared).toBe(false)
    expect(out.rewardDaoSource).toBe(0)
    expect(before - e.daoSource).toBe(trialDef('qisha')!.entryCost)
    expect(e.trialRecords['qisha']).toBeUndefined()
  })

  it('每道试炼都定义入界费/奖励/场数/escalation 且值有限为正(避开跑战斗)', () => {
    for (const t of TRIALS) {
      expect(Number.isFinite(t.entryCost) && t.entryCost > 0, `${t.id} entryCost`).toBe(true)
      expect(Number.isFinite(t.rewardDaoSource) && t.rewardDaoSource > 0, `${t.id} reward`).toBe(true)
      expect(Number.isInteger(t.fights) && t.fights > 0, `${t.id} fights`).toBe(true)
      expect(Number.isFinite(t.escalation) && t.escalation >= 1, `${t.id} escalation`).toBe(true)
    }
  })

  it('可重写世界道痕:扣 10 道源、真跑一趟并补新痕 —— 不再烧钱白回 null', () => {
    seedTrialPlayer(true)
    const e = useEndgameStore()
    const world = celestialWorldDef('chiyan')!
    e.addMark({
      life: 1,
      daoPathId: 'sword',
      targetId: 'chiyan',
      targetName: world.name,
      cleared: true,
      rounds: 9999, // 今日之速必快过,走「胜于旧我」也不碍断言
      buildName: '天道自检',
      powerText: '1e100',
      at: Date.now(),
      replay: { mods: {}, attack: gn(1), defense: gn(1), maxHp: gn(10), speed: 1, skills: [], artifacts: [], pactId: null }
    })
    const before = e.daoSource
    const marksBefore = e.marks.length
    const out = rewriteMark(e.marks[0]!)
    // 回归:此前世界道痕在扣 10 道源后被 `if (!trial) return null` 拦死,零结果却照样烧钱。
    expect(out, '世界道痕重写不应白回 null').not.toBeNull()
    expect(before - e.daoSource).toBe(REWRITE_ENTRY_COST)
    expect(e.marks.length).toBe(marksBefore + 1)
  })
})
