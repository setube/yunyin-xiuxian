/**
 * 玩家挑战协议:玩家定规则(世界 × 变数 × 契约 × 名号),
 * 难度实测、有解校验、奖励定价全由模拟裁判定,堵死「最低难度最高奖励」。
 */
import type { CombatantSnap, CombatRules } from '@/types'
import { rateText } from '@/ui/rateRank'
import { mulberry32, RandomService, rng } from '@/utils/random'
import { celestialWorldDef } from '@/data/endgame'
import { mutatorDef } from '@/data/mutators'
import { pactDef } from '@/data/pacts'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './celestialSim'
import { celestialFoeCaliber, mergeRules, runGauntlet, worldFoeSnap, NO_JUDGEMENT, type CelestialJudgement } from './gauntlet'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules, endgameUnlocked, recordMark, type ExpeditionResult } from './endgameService'
import { recordMilestone } from './identity'
import { SLAUGHTER_PER_WIN, SWORD_PER_WIN } from './daoDepth'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'
import { daoSourceShortfall } from './daoSource'
import { endgameBusy } from './endgameActivity'

export const CHALLENGE_ENTRY_COST = 15
export const CHALLENGE_MAX_MUTATORS = 3

export interface ChallengeDraft {
  worldId: string
  mutatorIds: string[]
  pactId: string | null
  name: string
}

export interface ChallengeVerdict {
  ok: boolean
  reason?: string
  difficulty: string
  viable: number
  reward: number
}

function draftRules(draft: ChallengeDraft): CombatRules | undefined {
  const world = celestialWorldDef(draft.worldId)
  let rules = world?.rules
  for (const id of draft.mutatorIds.slice(0, CHALLENGE_MAX_MUTATORS)) {
    const m = mutatorDef(id)
    if (m) rules = mergeRules(rules, m.rules)
  }
  const pact = draft.pactId ? pactDef(draft.pactId) : undefined
  if (pact?.rules) rules = mergeRules(rules, pact.rules)
  return rules
}

function draftFoes(
  worldId: string,
  ref: { attack: CombatantSnap['attack']; defense: CombatantSnap['defense']; maxHp: CombatantSnap['maxHp'] },
  judgement: CelestialJudgement = NO_JUDGEMENT
): CombatantSnap[] {
  const world = celestialWorldDef(worldId)
  if (!world) return []
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref, 1, judgement))
  foes.push(worldFoeSnap(world.guardian, ref, 1, judgement))
  return foes
}

/**
 * 验证挑战:六大标准流派实测,近乎无解与形同虚设皆驳回。
 * 奖励只由实测难度定价,契约/变数的难度贡献已被实测吸收,不重复计倍。
 */
export function verifyChallenge(draft: ChallengeDraft): ChallengeVerdict | null {
  const world = celestialWorldDef(draft.worldId)
  if (!world) return null
  const rules = draftRules(draft)
  const foes = draftFoes(draft.worldId, SIM_REFERENCE)
  const pact = draft.pactId ? pactDef(draft.pactId) : undefined
  const opts = pact?.special === 'endHp80' ? { minHpAfterFight: 0.8 } : {}
  const rates = BUILD_PROFILES.map((p, i) => {
    const seeded = new RandomService(mulberry32(510000 + i * 61 + draft.mutatorIds.length * 7 + (draft.pactId?.length ?? 0)))
    let clears = 0
    for (let r = 0; r < 8; r += 1) {
      if (runGauntlet(buildSnap(p), foes, rules, world.healBetweenPct, seeded, opts).cleared) clears += 1
    }
    return clears / 8
  }).sort((a, b) => b - a)
  const best = rates[0]!
  const viable = rates.filter(r => r >= 0.35).length
  /*
   * 档位说法取 ui/rateRank —— 与远征(expedition.ts)、构筑对照(compare.ts)、
   * 换装推演(lab.ts)同一份阈值与措辞。
   *
   * 这里原先内联了一套自定义说法(闲庭信步 / 略有凶险 / 凶险),阈值与 rateRank 完全相同,
   * 只是措辞不同 —— 而两者都在天界页面上:「远征」tab 说「稳操胜券」,
   * 「试炼」tab 说「闲庭信步」,玩家会把它们当成两个不同的量。
   */
  const difficulty = rateText(best)
  if (best < 0.15) {
    return { ok: false, reason: '近乎无解', difficulty, viable, reward: 0 }
  }
  if (best > 0.97) {
    return { ok: false, reason: '形同虚设', difficulty, viable, reward: 0 }
  }
  // best∈[0.15,0.97] 内 `45*(1.9-best)` 恒落在 [41.85, 78.75],无需钳制;
  // 放宽上下拒绝阈值须加回钳制 Math.min(90, Math.max(30, …))
  const reward = Math.round(45 * (1.9 - best))
  return { ok: true, difficulty, viable, reward }
}

/** 立下挑战:玩家亲赴(道途生效),奖励用验证时的定价 */
export function undertakeChallenge(draft: ChallengeDraft, verdict: ChallengeVerdict): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!endgameUnlocked() || !endgame.daoPath || !verdict.ok) return null
  const busy = endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, endgame.adventureSession)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return null
  }
  // 先认界再扣费:草案可能来自过期 UI 状态或外部调用
  const world = celestialWorldDef(draft.worldId)
  if (!world) return null
  const short = daoSourceShortfall(CHALLENGE_ENTRY_COST, endgame.daoSource)
  if (!endgame.spendDaoSource(CHALLENGE_ENTRY_COST)) {
    ui.toast(short.reason ?? `道源不足 ${CHALLENGE_ENTRY_COST}`, 'warn')
    return null
  }
  const player = usePlayerStore()
  // 与远征/试炼同源
  const { ref, judgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, world.anchorTier)
  const rules = mergeRules(currentDaoRules(), draftRules(draft))
  const pact = draft.pactId ? pactDef(draft.pactId) : undefined
  const opts = {
    ...(pact?.special === 'endHp80' ? { minHpAfterFight: 0.8 } : {}),
    perWinPlayerMods: endgame.daoPath === 'sword' ? SWORD_PER_WIN : endgame.daoPath === 'slaughter' ? SLAUGHTER_PER_WIN : undefined
  }
  const name = draft.name.trim() || '无名之约'
  const report = runGauntlet(buildPlayerSnap(true), draftFoes(draft.worldId, ref, judgement), rules, world.healBetweenPct, rng, opts)
  let reward = 0
  if (report.cleared) {
    reward = verdict.reward
    endgame.addDaoSource(reward)
    recordMilestone('first_custom')
    const player2 = usePlayerStore()
    endgame.updateRecord('best_custom', reward, player2.reincarnation.count + 1, name, 'max')
    ui.toast(`《${name}》功成,道源 +${reward}`, 'rare')
  } else if (report.pactBroken) {
    // 违契终止非败北:报已胜场次,不报「止步第 N 战」
    ui.toast(`《${name}》违契而止,已胜 ${report.fightsWon} 战`, 'warn')
  } else {
    ui.toast(`《${name}》未竟,止步第 ${report.fightsWon + 1} 战`, 'warn')
  }
  recordMark('custom', `挑战书·${name}`, report.cleared, report.totalRounds, draft.pactId, {
    worldId: draft.worldId,
    mutatorIds: draft.mutatorIds
  })
  return {
    title: `挑战书 · ${name}`,
    report,
    rewardDaoSource: reward,
    markText: report.cleared
      ? `${report.rows.length} 战全捷,共 ${report.totalRounds} 回合`
      : report.pactBroken
        ? `违契而止,已胜 ${report.fightsWon} 战`
        : `止步第 ${report.fightsWon + 1} 战`
  }
}
