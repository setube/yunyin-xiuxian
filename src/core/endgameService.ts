/**
 * 终局服务 —— 道途 / 天道熔炉 / 特殊世界远征 / 天道试炼 / 道痕
 */
import type { ArtifactDef, CombatantSnap, CombatRules, DaoMark, DaoPathId } from '@/types'
import { rng } from '@/utils/random'
import { formatGN } from '@/utils/format'
import { artifactDef } from '@/data/artifacts'
import { pactDef } from '@/data/pacts'
import { mutatorDef } from '@/data/mutators'
import { gateDef } from '@/data/qimen'
import { RULESET_VERSION, isStaleRuleset } from '@/data/ruleset'
import {
  celestialWorldDef,
  DAO_SOURCE_PER_FRUIT,
  daoPathDef,
  FURNACE_STONE_DAO_SOURCE,
  FURNACE_STONE_TIER_AMOUNT,
  TRIAL_FOES,
  trialDef,
  type FurnaceRate
} from '@/data/endgame'
import { MAX_MAJOR, WORLD_BREAK_MAJOR } from '@/data/realms'
import { maxTierForMajor } from '@/data/regions'
import { stoneByTier } from './formulas'
import { buildPlayerSnap } from './playerSnap'
import { detectBuild } from './buildDetect'
import { SWORD_PER_WIN, SLAUGHTER_PER_WIN } from './daoDepth'
import { recordMilestone, trackClearRecords } from './identity'
import { celestialJudgement, mergeRules, runGauntlet, worldFoeSnap, type GauntletReport } from './gauntlet'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'

/**
 * 真仙(仙界门槛)方可踏足天界。
 *
 * 旧设计里「满级 = 真仙 = 天界」,故门槛写作 major >= MAX_MAJOR;
 * 扩界后真仙之上还有玄仙至混沌道祖,若仍借 MAX_MAJOR,终局会随加境漂移。
 * 现改锚到具名的飞升门槛 WORLD_BREAK_MAJOR(真仙),语义与手感都不变。
 */
export function endgameUnlocked(): boolean {
  return usePlayerStore().major >= WORLD_BREAK_MAJOR
}

/** 当前道途的全局战斗规则(历练/离线同样生效) */
export function currentDaoRules(): CombatRules | undefined {
  const endgame = useEndgameStore()
  if (!endgame.daoPath) return undefined
  return daoPathDef(endgame.daoPath)?.rules
}

export function chooseDaoPath(id: DaoPathId): boolean {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!endgameUnlocked()) return false
  const def = daoPathDef(id)
  if (!def) return false
  if (!endgame.chooseDao(id)) {
    ui.toast('此生道途已定,来世方可另择', 'warn')
    return false
  }
  recordMilestone('first_dao')
  ui.toast(`你于天穹之下立誓——此生行${def.name}`, 'rare')
  return true
}

// ---------- 天道熔炉 ----------

export function furnaceConvert(rate: FurnaceRate): number {
  const resources = useResourcesStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const have = resources[rate.resource]
  const daoSource = Math.floor(have / rate.per)
  if (daoSource <= 0) {
    ui.toast(`${rate.name}不足 ${rate.per},不够熔铸一缕道源`, 'warn')
    return 0
  }
  resources.spendSmall(rate.resource, daoSource * rate.per)
  endgame.addDaoSource(daoSource)
  ui.toast(`${rate.name}×${daoSource * rate.per} 熔作道源 +${daoSource}`, 'success')
  return daoSource
}

/**
 * 灵石熔铸价 —— 按**玩家当前层级**折算,不是冻结在真仙那一层。
 *
 * 灵石收入随区域层级按 1.9^层级 涨(与强化、重铸、建筑同一条经济),
 * 而熔铸价从前写死 `stoneByTier(20, …)`:到混沌海(层级 32),一战的灵石
 * 就能换出一枚以上道果 —— 道果价相对收入塌了 1.9^12 ≈ 293 倍(ISS-214)。
 * 价随层级走之后,「熔一枚道源要多少灵石」相对玩家的收入恒定,
 * 道果在整条界外长尾上是同一个价。口径与强化/重铸一致:花的是**你这一层**的钱。
 */
export function furnaceStoneCost(): ReturnType<typeof stoneByTier> {
  const player = usePlayerStore()
  return stoneByTier(maxTierForMajor(player.major), FURNACE_STONE_TIER_AMOUNT)
}

export function furnaceConvertStone(): boolean {
  const resources = useResourcesStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const cost = furnaceStoneCost()
  if (!resources.spendStone(cost)) {
    ui.toast('灵石不足', 'warn')
    return false
  }
  endgame.addDaoSource(FURNACE_STONE_DAO_SOURCE)
  ui.toast(`灵石 ${formatGN(cost)} 熔作道源 +${FURNACE_STONE_DAO_SOURCE}`, 'success')
  return true
}

/** 道源凝道果:终局唯一数值出口,受道果软上限约束 */
export function condenseDaoFruit(): boolean {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  if (!endgame.spendDaoSource(DAO_SOURCE_PER_FRUIT)) {
    ui.toast(`道源不足 ${DAO_SOURCE_PER_FRUIT}`, 'warn')
    return false
  }
  player.addDaoFruit(1)
  const first = !endgame.daoFruitTutorialSeen
  if (first) endgame.daoFruitTutorialSeen = true
  // S5 首次道果教学:即时因果解释,建立"现在拿道果 = 以后更强"
  ui.toast(
    first ? '百缕道源凝作一枚道果——此物不随此身而灭,转世仍归你所有,来世修行更快。' : '百缕道源凝作一枚道果',
    'rare'
  )
  return true
}

// ---------- 远征与试炼 ----------

export interface ExpeditionResult {
  title: string
  report: GauntletReport
  rewardDaoSource: number
  markText: string
}

function recordMarkInternal(
  targetId: string,
  targetName: string,
  cleared: boolean,
  rounds: number,
  pactId: string | null,
  context?: DaoMark['context']
): void {
  const player = usePlayerStore()
  const endgame = useEndgameStore()
  const build = detectBuild(player.finalStats.mods)
  const snap = buildPlayerSnap()
  const mark: DaoMark = {
    life: player.reincarnation.count + 1,
    daoPathId: endgame.daoPath,
    targetId,
    targetName,
    cleared,
    rounds,
    buildName: build?.displayName ?? '杂学',
    powerText: formatGN(player.finalStats.power),
    at: Date.now(),
    ruleset: RULESET_VERSION,
    context,
    replay: {
      mods: { ...snap.mods },
      attack: snap.attack,
      defense: snap.defense,
      maxHp: snap.maxHp,
      speed: snap.speed,
      skills: snap.skills.map(s => ({ ...s })),
      artifacts: (snap.artifacts ?? []).map(a => ({ defId: a.def.id, level: a.level })),
      comboArt: snap.comboArt,
      pactId
    }
  }
  endgame.addMark(mark)
}

/** 道痕记录(远征/试炼/变数共用);附忆战快照、规则纪元与环境上下文 */
export function recordMark(
  targetId: string,
  targetName: string,
  cleared: boolean,
  rounds: number,
  pactId: string | null = null,
  context?: DaoMark['context']
): void {
  recordMarkInternal(targetId, targetName, cleared, rounds, pactId, context)
}

/** 从忆战快照复原战斗快照(忆战/构筑对照/今昔之比共用) */
export function snapFromReplay(name: string, r: NonNullable<DaoMark['replay']>): CombatantSnap {
  return {
    name,
    icon: 'user',
    isPlayer: true,
    attack: r.attack,
    defense: r.defense,
    maxHp: r.maxHp,
    speed: r.speed,
    mods: r.mods,
    skills: r.skills,
    artifacts: r.artifacts
      .map(a => ({ def: artifactDef(a.defId), level: a.level }))
      .filter((x): x is { def: ArtifactDef; level: number } => x.def !== undefined),
    comboArt: r.comboArt
  }
}

/** 道痕的环境规则(道途按当年 + 目标规则 + 变数 + 契约):忆战与重写共用 */
/** 道痕当年的规则(道途 + 界/试炼 + 变数 + 契约 + 所择之门)—— 忆战/重写按此重打 */
export function markRules(
  mark: DaoMark,
  world?: ReturnType<typeof celestialWorldDef>,
  trial?: ReturnType<typeof trialDef>
): CombatRules | undefined {
  const daoRules = mark.daoPathId ? daoPathDef(mark.daoPathId)?.rules : undefined
  let rules = mergeRules(daoRules, (world ?? trial)?.rules)
  for (const id of mark.context?.mutatorIds ?? []) {
    const m = mutatorDef(id)
    if (m) rules = mergeRules(rules, m.rules)
  }
  const pactId = mark.replay?.pactId
  if (pactId) rules = mergeRules(rules, pactDef(pactId)?.rules)
  const gateId = mark.context?.gateId
  if (gateId) rules = mergeRules(rules, gateDef(gateId)?.rules)
  return rules
}

/** 道痕目标解析:世界(含挑战书借 context 复原)或试炼 */
function markTarget(mark: DaoMark): { world?: ReturnType<typeof celestialWorldDef>; trial?: ReturnType<typeof trialDef> } {
  const world = celestialWorldDef(mark.targetId) ?? (mark.context?.worldId ? celestialWorldDef(mark.context.worldId) : undefined)
  const trial = trialDef(mark.targetId)
  return { world, trial }
}

/** 忆战:以道痕中冻结的当世构筑,重打当年的界或试炼(无奖励,不再留痕) */
export function replayMark(mark: DaoMark): ExpeditionResult | null {
  const ui = useUiStore()
  if (!mark.replay) {
    ui.toast('此痕年代久远,战况已不可考', 'warn')
    return null
  }
  const { world, trial } = markTarget(mark)
  if (!world && !trial) {
    ui.toast('此界早已散于天道,无从重临', 'warn')
    return null
  }
  const r = mark.replay
  const snap = snapFromReplay('当年的你', r)
  const stats = { attack: r.attack, defense: r.defense, maxHp: r.maxHp }
  // 词条对称按当年的构筑深度,与三维同口径——忆战要还原的是当年那一局
  const judgement = celestialJudgement(snap.mods, MAX_MAJOR, (world ?? trial)!.anchorTier)
  const foes = []
  if (world) {
    for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, stats, 1, judgement))
    foes.push(worldFoeSnap(world.guardian, stats, 1, judgement))
  } else if (trial) {
    for (let i = 0; i < trial.fights; i += 1) {
      foes.push(worldFoeSnap(TRIAL_FOES[i % TRIAL_FOES.length]!, stats, Math.pow(trial.escalation, i), judgement))
    }
  }
  const target = (world ?? trial)!
  const rules = markRules(mark, world, trial)
  const report = runGauntlet(snap, foes, rules, 'healBetweenPct' in target ? target.healBetweenPct : 0.5, rng)
  const era = isStaleRuleset(mark.ruleset) ? `(此战录于规则纪元 ${mark.ruleset},今为 ${RULESET_VERSION},天道已变)` : ''
  ui.toast(report.cleared ? '忆战功成——当年的你,如今依旧能赢' : '忆战未竟,当年之勇亦有时运', 'info')
  return {
    title: `忆战 · ${mark.targetName}`,
    report,
    rewardDaoSource: 0,
    markText: `${report.cleared ? '重现破界' : `止步第 ${report.fightsWon + 1} 战`}${era}`
  }
}

export const REWRITE_ENTRY_COST = 10

/**
 * 重写此痕(Phase 28):以今日之你,重打当年之战(同界同契同变数)。
 * 快过旧痕即【胜于旧我】——无道源之赏,赏的是历史本身
 */
export function rewriteMark(mark: DaoMark): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!mark.cleared || !mark.replay) return null
  const { world, trial } = markTarget(mark)
  if (!world && !trial) {
    ui.toast('此界早已散于天道,无从重写', 'warn')
    return null
  }
  if (!endgame.spendDaoSource(REWRITE_ENTRY_COST)) {
    ui.toast(`道源不足 ${REWRITE_ENTRY_COST}`, 'warn')
    return null
  }
  const player = usePlayerStore()
  const stats = player.celestialStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  if (!trial) return null
  const judgement = celestialJudgement(stats.mods, player.major, trial.anchorTier)
  const foes = []
  if (world) {
    for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref, 1, judgement))
    foes.push(worldFoeSnap(world.guardian, ref, 1, judgement))
  } else if (trial) {
    for (let i = 0; i < trial.fights; i += 1)
      foes.push(worldFoeSnap(TRIAL_FOES[i % TRIAL_FOES.length]!, ref, Math.pow(trial.escalation, i), judgement))
  }
  const target = (world ?? trial)!
  // 环境按当年(道途取今世——重写是今日之你应当年之局)
  const rules = mergeRules(currentDaoRules(), markRules({ ...mark, daoPathId: null }, world, trial))
  const perWin = endgame.daoPath === 'sword' ? SWORD_PER_WIN : endgame.daoPath === 'slaughter' ? SLAUGHTER_PER_WIN : undefined
  const report = runGauntlet(buildPlayerSnap(true), foes, rules, 'healBetweenPct' in target ? target.healBetweenPct : 0.5, rng, {
    perWinPlayerMods: perWin
  })
  const beaten = report.cleared && report.totalRounds < mark.rounds
  if (beaten) {
    recordMilestone('first_rewrite')
    trackClearRecords(mark.targetName, report.totalRounds, mark.replay.pactId, 0)
    ui.toast(`【胜于旧我】${mark.targetName}:${mark.rounds} 回合 → ${report.totalRounds} 回合`, 'rare')
  } else if (report.cleared) {
    ui.toast(`重写功成,但未快过当年(${report.totalRounds} vs ${mark.rounds} 回合)`, 'info')
  } else {
    ui.toast('重写未竟——当年之你,并不好胜过', 'warn')
  }
  recordMark(mark.targetId, `重写·${mark.targetName}`, report.cleared, report.totalRounds, mark.replay.pactId, mark.context)
  return {
    title: `重写 · ${mark.targetName}`,
    report,
    rewardDaoSource: 0,
    markText: beaten
      ? `胜于旧我:${mark.rounds} → ${report.totalRounds} 回合`
      : report.cleared
        ? `功成但未破纪录(旧痕 ${mark.rounds} 回合)`
        : `止步第 ${report.fightsWon + 1} 战`
  }
}

/** 天道试炼(极限 Build 挑战,记录最少总回合;剑意/杀意逐胜叠层同样生效) */
export function challengeTrial(trialId: string): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const trial = trialDef(trialId)
  if (!trial || !endgameUnlocked()) return null
  if (!endgame.daoPath) {
    ui.toast('先择道途,方可赴试炼', 'warn')
    return null
  }
  if (!endgame.spendDaoSource(trial.entryCost)) {
    ui.toast(`道源不足 ${trial.entryCost}`, 'warn')
    return null
  }
  const stats = player.celestialStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  if (!trial) return null
  const judgement = celestialJudgement(stats.mods, player.major, trial.anchorTier)
  const foes = []
  for (let i = 0; i < trial.fights; i += 1) {
    foes.push(worldFoeSnap(TRIAL_FOES[i % TRIAL_FOES.length]!, ref, Math.pow(trial.escalation, i), judgement))
  }
  const rules = mergeRules(currentDaoRules(), trial.rules)
  const perWin = endgame.daoPath === 'sword' ? SWORD_PER_WIN : endgame.daoPath === 'slaughter' ? SLAUGHTER_PER_WIN : undefined
  const report = runGauntlet(buildPlayerSnap(true), foes, rules, trial.healBetweenPct, rng, { perWinPlayerMods: perWin })

  let reward = 0
  if (report.cleared) {
    reward = trial.rewardDaoSource
    endgame.addDaoSource(reward)
    if (trial.id === 'qisha') recordMilestone('first_qisha')
    const prevBest = endgame.trialRecords[trial.id]?.bestRounds
    endgame.recordTrial(trial.id, report.totalRounds)
    ui.toast(
      prevBest !== undefined && report.totalRounds < prevBest
        ? `${trial.name}新纪录!${report.totalRounds} 回合(原 ${prevBest})`
        : `${trial.name}功成,道源 +${reward}`,
      'rare'
    )
  } else {
    ui.toast(`${trial.name}未竟(第 ${report.fightsWon + 1} 战失利)`, 'warn')
  }
  recordMark(trial.id, trial.name, report.cleared, report.totalRounds)
  return {
    title: trial.name,
    report,
    rewardDaoSource: reward,
    markText: report.cleared ? `${trial.fights} 战全捷,共 ${report.totalRounds} 回合` : `止步第 ${report.fightsWon + 1} 战`
  }
}

