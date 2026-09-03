/**
 * 玩家挑战协议(Phase 26)—— 简化版规则编辑器
 * 玩家定规则(世界 × 变数 × 契约 × 名号),系统定其余:
 * 难度实测、有解校验、奖励定价——全部由模拟裁判说了算,堵死「最低难度最高奖励」
 */
import type { CombatantSnap, CombatRules } from '@/types'
import { rng } from '@/utils/random'
import { mulberry32, RandomService } from '@/utils/random'
import { celestialWorldDef } from '@/data/endgame'
import { mutatorDef } from '@/data/mutators'
import { pactDef } from '@/data/pacts'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './celestialSim'
import { mergeRules, runGauntlet, worldFoeSnap } from './gauntlet'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules, endgameUnlocked, recordMark, type ExpeditionResult } from './endgameService'
import { recordMilestone } from './identity'
import { SLAUGHTER_PER_WIN, SWORD_PER_WIN } from './daoDepth'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'

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
  ref: { attack: CombatantSnap['attack']; defense: CombatantSnap['defense']; maxHp: CombatantSnap['maxHp'] }
): CombatantSnap[] {
  const world = celestialWorldDef(worldId)
  if (!world) return []
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref))
  foes.push(worldFoeSnap(world.guardian, ref))
  return foes
}

/**
 * 验证挑战:六大标准流派实测。近乎无解与形同虚设皆被天道驳回;
 * 奖励只由实测难度定价(契约/变数的难度贡献已被实测吸收,不重复计倍)
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
  const difficulty = best >= 0.85 ? '闲庭信步' : best >= 0.6 ? '略有凶险' : best >= 0.4 ? '凶险' : '九死一生'
  if (best < 0.15) {
    return { ok: false, reason: '此局近乎无解,天道不受此约', difficulty, viable, reward: 0 }
  }
  if (best > 0.97) {
    return { ok: false, reason: '此局形同虚设,不配称为挑战', difficulty, viable, reward: 0 }
  }
  const reward = Math.round(Math.min(90, Math.max(30, 45 * (1.9 - best))))
  return { ok: true, difficulty, viable, reward }
}

/** 立下挑战:玩家亲赴(道途生效),奖励用验证时的定价 */
export function undertakeChallenge(draft: ChallengeDraft, verdict: ChallengeVerdict): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!endgameUnlocked() || !endgame.daoPath || !verdict.ok) return null
  if (!endgame.spendDaoSource(CHALLENGE_ENTRY_COST)) {
    ui.toast(`道源不足 ${CHALLENGE_ENTRY_COST}`, 'warn')
    return null
  }
  const player = usePlayerStore()
  const stats = player.finalStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  const world = celestialWorldDef(draft.worldId)!
  const rules = mergeRules(currentDaoRules(), draftRules(draft))
  const pact = draft.pactId ? pactDef(draft.pactId) : undefined
  const opts = {
    ...(pact?.special === 'endHp80' ? { minHpAfterFight: 0.8 } : {}),
    perWinPlayerMods: endgame.daoPath === 'sword' ? SWORD_PER_WIN : endgame.daoPath === 'slaughter' ? SLAUGHTER_PER_WIN : undefined
  }
  const name = draft.name.trim() || '无名之约'
  const report = runGauntlet(buildPlayerSnap(true), draftFoes(draft.worldId, ref), rules, world.healBetweenPct, rng, opts)
  let reward = 0
  if (report.cleared) {
    reward = verdict.reward
    endgame.addDaoSource(reward)
    recordMilestone('first_custom')
    const player2 = usePlayerStore()
    endgame.updateRecord('best_custom', reward, player2.reincarnation.count + 1, name, 'max')
    ui.toast(`挑战书《${name}》功成!道源 +${reward}`, 'rare')
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
    markText: report.cleared ? `${report.rows.length} 战全捷,共 ${report.totalRounds} 回合` : `止步第 ${report.fightsWon + 1} 战`
  }
}
