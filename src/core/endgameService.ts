/** 终局服务:道途 / 天道熔炉 / 特殊世界远征 / 天道试炼 / 道痕 */
import type { ArtifactDef, CombatantSnap, CombatRules, DaoMark, DaoPathId } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { formatGN, formatGap } from '@/utils/format'
import { gte, mulN, subClamp } from '@/utils/gnum'
import { artifactDef } from '@/data/artifacts'
import { pactDef } from '@/data/pacts'
import { REALMS } from '@/data/realms'
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
import { celestialJudgement, mergeRules, runGauntlet, worldFoeLineup, worldFoeSnap, type GauntletReport } from './gauntlet'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'
import { daoSourceShortfall } from './daoSource'
import { endgameBusy, ENTRY_REASON } from './endgameActivity'

/** 真仙(WORLD_BREAK_MAJOR)方可踏足天界;借 MAX_MAJOR 会让终局随加境漂移 */
export function endgameUnlocked(): boolean {
  return usePlayerStore().major >= WORLD_BREAK_MAJOR
}

/**
 * 天界/器魂门槛的境界名,给两个视图的「需 X 境」直接用。
 *
 * 原来天界页与器魂页各自硬编码「真仙境」,而解锁逻辑读的是 WORLD_BREAK_MAJOR ——
 * 两处文案与一处常量靠人记着保持同步。将来若把门槛挪到别的境界,
 * 逻辑会自动跟着变、文案不会,玩家就会看到「需真仙境」却进不去(或反之)。
 * 由常量反查境界名,与 endgameUnlocked 同一事实源。
 */
export function endgameGateRealmName(): string {
  return REALMS[WORLD_BREAK_MAJOR]?.name ?? ''
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
    ui.toast('此生道途已定', 'warn')
    return false
  }
  recordMilestone('first_dao')
  ui.toast(`已择${def.name}`, 'rare')
  return true
}

// ---------- 天道熔炉 ----------

/** 熔铸一缕道源还差多少材料:够一炉为 0 */
export function furnaceMaterialShortfall(rate: FurnaceRate): number {
  const resources = useResourcesStore()
  const have = rate.resource === 'herb' ? resources.herbMeltable : resources[rate.resource]
  return Math.max(0, rate.per - have)
}

export function furnaceConvert(rate: FurnaceRate): number {
  const resources = useResourcesStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()
  // 灵草只计仙品+(≥3),凡/灵品只走坊市;读 resources.herb(五品总和)而只扣当前品会白拿道源
  const have = rate.resource === 'herb' ? resources.herbMeltable : resources[rate.resource]
  const daoSource = Math.floor(have / rate.per)
  if (daoSource <= 0) {
    ui.toast(`${rate.name}尚差 ${furnaceMaterialShortfall(rate)}`, 'warn')
    return 0
  }
  const spent = daoSource * rate.per
  const ok = rate.resource === 'herb' ? resources.spendHerbMeltable(spent) : resources.spendSmall(rate.resource, spent)
  if (!ok) {
    ui.toast(`${rate.name}尚差 ${furnaceMaterialShortfall(rate)}`, 'warn')
    return 0
  }
  endgame.addDaoSource(daoSource)
  ui.toast(`${rate.name}×${spent} 熔作道源 +${daoSource}`, 'success')
  return daoSource
}

/** 灵石熔铸价:按玩家当前层级折算,与强化/重铸同口径(灵石收入按 1.9^层级 涨);写死层级会使道果价相对收入塌掉 */
export function furnaceStoneCost(): ReturnType<typeof stoneByTier> {
  const player = usePlayerStore()
  return stoneByTier(maxTierForMajor(player.major), FURNACE_STONE_TIER_AMOUNT)
}

/**
 * 灵石熔道源。
 * @param n 熔几次(默认 1);整笔原子 —— 灵石不够全额就一次也不熔,免得留下半笔零头
 */
export function furnaceConvertStone(n = 1): boolean {
  const resources = useResourcesStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const want = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
  const cost = mulN(furnaceStoneCost(), want)
  if (!resources.spendStone(cost)) {
    const short = subClamp(cost, resources.spiritStone)
    ui.toast(`灵石尚差 ${formatGap(short)}`, 'warn')
    return false
  }
  const gained = FURNACE_STONE_DAO_SOURCE * want
  endgame.addDaoSource(gained)
  ui.toast(
    want === 1 ? `灵石 ${formatGN(cost)} 熔作道源 +${gained}` : `灵石 ${formatGN(cost)} 熔作道源 +${gained}(${want} 次)`,
    'success'
  )
  return true
}

/**
 * 手上灵石最多能熔几次 —— 一次熔铸的上限。
 * 与 furnaceConvertStone 同一口径:整次计,不算零头。
 */
export function furnaceStoneAffordable(cap = 999): number {
  const resources = useResourcesStore()
  const cost = furnaceStoneCost()
  if (cost.m === 0) return 0
  const have = resources.spiritStone
  /*
   * 从上限往下试「够不够 k 次的整价」,而不是拿余额做除法 —— 与 wudaoExchange 同一思路:
   * GNum 只有有限有效位,连续相减会在尾数上累积误差,先乘后比只做一次比较。
   */
  const top = Math.max(1, Math.min(Math.floor(cap), 999))
  for (let k = top; k > 0; k -= 1) {
    if (gte(have, mulN(cost, k))) return k
  }
  return 0
}

/**
 * 道源凝道果:终局唯一数值出口,受道果软上限约束。
 * @param n 凝几枚(默认 1);整笔原子 —— 道源不够全额就一枚也不凝,免得半途而废留下零头
 */
export function condenseDaoFruit(n = 1): boolean {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const want = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
  const total = DAO_SOURCE_PER_FRUIT * want
  const short = daoSourceShortfall(total, endgame.daoSource)
  if (!endgame.spendDaoSource(total)) {
    ui.toast(short.reason ?? `道源不足 ${total}`, 'warn')
    return false
  }
  player.addDaoFruit(want)
  // 道果说明归熔炉弹窗(resourceGuidance.daoFruitDialog),toast 只报结果;已见归玩家关掉说明时置,此处不置
  ui.toast(
    want === 1 ? `${DAO_SOURCE_PER_FRUIT} 缕道源凝作一枚道果` : `${formatGN(total)} 缕道源凝作 ${want} 枚道果`,
    'rare'
  )
  return true
}

/**
 * 手上道源最多能凝几枚 —— 一次连凝的可凝数。
 * 与 condenseDaoFruit 同一口径:整枚计,不算零头。
 */
export function condenseFruitAffordable(): number {
  const endgame = useEndgameStore()
  const have = Math.max(0, Math.floor(endgame.daoSource))
  return Math.floor(have / DAO_SOURCE_PER_FRUIT)
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
    // 忆战据此还原当年的境界压制
    major: player.major,
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

/** 忆战/重写/试炼的种子:只从目标 id 与世号派生,同一场可复现;远征仍走共享 rng */
function seedOf(targetId: string, life: number): number {
  let h = 0x5eed
  for (let i = 0; i < targetId.length; i += 1) {
    h = Math.imul(h ^ targetId.charCodeAt(i), 2654435761)
  }
  return (h ^ Math.imul(life + 1, 0x9e3779b1)) >>> 0
}

/** 道痕当年的规则(道途 + 界/试炼 + 变数 + 契约 + 所择之门):忆战/重写共用 */
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

/** 忆战:以道痕冻结的构筑重打当年的界或试炼;无奖励,不留痕 */
export function replayMark(mark: DaoMark): ExpeditionResult | null {
  const ui = useUiStore()
  if (!mark.replay) {
    ui.toast('战况不可考', 'warn')
    return null
  }
  const { world, trial } = markTarget(mark)
  if (!world && !trial) {
    ui.toast('此界已不存在', 'warn')
    return null
  }
  const busy = endgameBusy(useEndgameStore().worldRun, usePlayerStore().secretRealm, useEndgameStore().adventureSession)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return null
  }
  const r = mark.replay
  const snap = snapFromReplay('当年的你', r)
  const stats = { attack: r.attack, defense: r.defense, maxHp: r.maxHp }
  // 词条对称与境界都按当年;旧档无 major 回退 MAX
  const judgement = celestialJudgement(snap.mods, mark.major ?? MAX_MAJOR, (world ?? trial)!.anchorTier)
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
  const markRng = new RandomService(mulberry32(seedOf(mark.targetId, mark.life)))
  const report = runGauntlet(snap, foes, rules, 'healBetweenPct' in target ? target.healBetweenPct : 0.5, markRng)
  const era = isStaleRuleset(mark.ruleset) ? `(天道已变 · 纪元 ${mark.ruleset} → ${RULESET_VERSION})` : ''
  ui.toast(report.cleared ? '忆战功成' : '忆战未竟', 'info')
  return {
    title: `忆战 · ${mark.targetName}`,
    report,
    rewardDaoSource: 0,
    markText: `${report.cleared ? '重现破界' : `止步第 ${report.fightsWon + 1} 战`}${era}`
  }
}

export const REWRITE_ENTRY_COST = 10

/** 重写此痕:以今日之你重打当年之战(同界同契同变数);快过旧痕即【胜于旧我】,无道源之赏 */
export function rewriteMark(mark: DaoMark): ExpeditionResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!mark.cleared || !mark.replay) return null
  const { world, trial } = markTarget(mark)
  if (!world && !trial) {
    ui.toast('此界已不存在', 'warn')
    return null
  }
  const busy = endgameBusy(useEndgameStore().worldRun, usePlayerStore().secretRealm, useEndgameStore().adventureSession)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return null
  }
  const short = daoSourceShortfall(REWRITE_ENTRY_COST, endgame.daoSource)
  if (!endgame.spendDaoSource(REWRITE_ENTRY_COST)) {
    ui.toast(short.reason ?? `道源不足 ${REWRITE_ENTRY_COST}`, 'warn')
    return null
  }
  const player = usePlayerStore()
  const stats = player.celestialStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  // 世界与试炼都能重写;扣费之后再拦会照样烧掉 10 道源
  const judgement = celestialJudgement(stats.mods, player.major, (world ?? trial)!.anchorTier)
  const foes = []
  if (world) {
    foes.push(...worldFoeLineup(world, ref, judgement))
  } else if (trial) {
    for (let i = 0; i < trial.fights; i += 1)
      foes.push(worldFoeSnap(TRIAL_FOES[i % TRIAL_FOES.length]!, ref, Math.pow(trial.escalation, i), judgement))
  }
  const target = (world ?? trial)!
  // 环境按当年,道途取今世
  const rules = mergeRules(currentDaoRules(), markRules({ ...mark, daoPathId: null }, world, trial))
  const perWin = endgame.daoPath === 'sword' ? SWORD_PER_WIN : endgame.daoPath === 'slaughter' ? SLAUGHTER_PER_WIN : undefined
  const markRng = new RandomService(mulberry32(seedOf(mark.targetId, mark.life)))
  const report = runGauntlet(buildPlayerSnap(true), foes, rules, 'healBetweenPct' in target ? target.healBetweenPct : 0.5, markRng, {
    perWinPlayerMods: perWin
  })
  const beaten = report.cleared && report.totalRounds < mark.rounds
  if (beaten) {
    recordMilestone('first_rewrite')
    trackClearRecords(mark.targetName, report.totalRounds, mark.replay.pactId, 0)
    ui.toast(`【胜于旧我】${mark.targetName}:${mark.rounds} 回合 → ${report.totalRounds} 回合`, 'rare')
  } else if (report.cleared) {
    ui.toast(`重写功成 · 未破纪录(${report.totalRounds} vs ${mark.rounds} 回合)`, 'info')
  } else {
    ui.toast('重写未竟', 'warn')
  }
  recordMark(mark.targetId, `重写·${mark.targetName}`, report.cleared, report.totalRounds, mark.replay.pactId, mark.context)
  return {
    title: `重写 · ${mark.targetName}`,
    report,
    rewardDaoSource: 0,
    markText: beaten
      ? `胜于旧我:${mark.rounds} → ${report.totalRounds} 回合`
      : report.cleared
        ? `功成 · 未破纪录(旧痕 ${mark.rounds} 回合)`
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
    ui.toast(ENTRY_REASON.noDaoPath, 'warn')
    return null
  }
  const busy = endgameBusy(useEndgameStore().worldRun, usePlayerStore().secretRealm, useEndgameStore().adventureSession)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return null
  }
  const short = daoSourceShortfall(trial.entryCost, endgame.daoSource)
  if (!endgame.spendDaoSource(trial.entryCost)) {
    ui.toast(short.reason ?? `道源不足 ${trial.entryCost}`, 'warn')
    return null
  }
  const stats = player.celestialStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  const judgement = celestialJudgement(stats.mods, player.major, trial.anchorTier)
  const foes = []
  for (let i = 0; i < trial.fights; i += 1) {
    foes.push(worldFoeSnap(TRIAL_FOES[i % TRIAL_FOES.length]!, ref, Math.pow(trial.escalation, i), judgement))
  }
  const rules = mergeRules(currentDaoRules(), trial.rules)
  const perWin = endgame.daoPath === 'sword' ? SWORD_PER_WIN : endgame.daoPath === 'slaughter' ? SLAUGHTER_PER_WIN : undefined
  const trialRng = new RandomService(mulberry32(seedOf(trial.id, 0)))
  const report = runGauntlet(buildPlayerSnap(true), foes, rules, trial.healBetweenPct, trialRng, { perWinPlayerMods: perWin })

  let reward = 0
  if (report.cleared) {
    reward = trial.rewardDaoSource
    endgame.addDaoSource(reward)
    if (trial.id === 'qisha') recordMilestone('first_qisha')
    const prevBest = endgame.trialRecords[trial.id]?.bestRounds
    endgame.recordTrial(trial.id, report.totalRounds)
    ui.toast(
      prevBest !== undefined && report.totalRounds < prevBest
        ? `${trial.name}新纪录,${report.totalRounds} 回合(原 ${prevBest})`
        : `${trial.name}功成,道源 +${reward}`,
      'rare'
    )
  } else {
    ui.toast(`${trial.name}未竟,止步第 ${report.fightsWon + 1} 战`, 'warn')
  }
  recordMark(trial.id, trial.name, report.cleared, report.totalRounds)
  return {
    title: trial.name,
    report,
    rewardDaoSource: reward,
    markText: report.cleared ? `${trial.fights} 战全捷,共 ${report.totalRounds} 回合` : `止步第 ${report.fightsWon + 1} 战`
  }
}
