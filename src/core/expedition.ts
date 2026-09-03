/**
 * 路线远征(Phase 21)—— 天道契约 × 逐层择路 × 道途深化 × 天道变数
 * 远征是状态机:入界战 → 三层二择其一 → 界主。层间可自由回凡界换构筑再续行
 */
import type { CelestialWorldDef, CombatantSnap, CombatRules, PactDef, StatMods, WorldFoeShape, WorldRouteNode } from '@/types'
import { rng } from '@/utils/random'
import { mulberry32, RandomService } from '@/utils/random'
import { celestialWorldDef } from '@/data/endgame'
import { PACTS, pactDef } from '@/data/pacts'
import { MUTATORS } from '@/data/mutators'
import { MUTATION_FOES } from '@/data/endgame'
import { buildPlayerSnap } from './playerSnap'
import { detectBuild } from './buildDetect'
import { mergeRules, runGauntlet, worldFoeSnap, type GauntletReport } from './gauntlet'
import { resolveCombat, sampleWinRate } from './combat'
import { modOf } from './statsCalc'
import { SLAUGHTER_PER_WIN, SWORD_PER_WIN, slaughterSpeedBonus, stackedMods } from './daoDepth'
import { currentDaoRules, endgameUnlocked, recordMark } from './endgameService'
import { recordMilestone, trackClearRecords } from './identity'
import { defaultHistory, generateApprovedWorld, type HistoryEntry } from './worldGen'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { SIM_REFERENCE } from './celestialSim'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore, type WorldRunState } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'

/** 单场战果 */
export interface StepOutcome {
  type: 'advance' | 'cleared' | 'lost' | 'pactBroken'
  row: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }
  rewardDaoSource: number
  /** 远征终局时附全程战报(此刻 store 中的 run 已清空) */
  finalRows?: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }[]
}

function chainRules(...list: (CombatRules | undefined)[]): CombatRules | undefined {
  return list.reduce((acc, cur) => mergeRules(acc, cur), undefined)
}

/** 世界定义查找:虚界('void')来自程序化生成,存于 store */
export function resolveWorld(id: string): CelestialWorldDef | undefined {
  if (id === 'void') return useEndgameStore().voidWorld ?? undefined
  return celestialWorldDef(id)
}

/** 道途逐胜叠层词条 */
function perWinMods(): StatMods | undefined {
  const dao = useEndgameStore().daoPath
  if (dao === 'sword') return SWORD_PER_WIN
  if (dao === 'slaughter') return SLAUGHTER_PER_WIN
  return undefined
}

/** 逆命契:封印当前主流派核心词条(生成负向词条快照) */
function sealCoreMods(): StatMods | null {
  const player = usePlayerStore()
  const build = detectBuild(player.finalStats.mods)
  if (!build) return null
  const sealed: StatMods = {}
  for (const k of Object.keys(build.style.core)) {
    const key = k as keyof StatMods
    const cur = modOf(player.finalStats.mods, key)
    if (cur > 0) sealed[key] = -cur
  }
  return Object.keys(sealed).length ? sealed : null
}

/** 契约的静态规则部分 */
function pactRules(pact: PactDef | undefined): CombatRules | undefined {
  return pact?.rules
}

/** 远征玩家快照:现取现算(层间换装立即生效)+ 契约与道途修饰 */
function runSnap(run: WorldRunState): CombatantSnap {
  const snap = buildPlayerSnap(true)
  const pact = run.pactId ? pactDef(run.pactId) : undefined
  let mods = snap.mods
  if (run.sealedMods) mods = stackedMods(mods, run.sealedMods, 1)
  const perWin = perWinMods()
  if (perWin && run.winStacks > 0) mods = stackedMods(mods, perWin, run.winStacks)
  return {
    ...snap,
    mods,
    artifacts: pact?.special === 'soloArtifact' ? (snap.artifacts ?? []).slice(0, 1) : snap.artifacts
  }
}

/** 本场合并规则(道途 + 世界 + 契约 + 节点) */
function runRules(world: CelestialWorldDef, run: WorldRunState, node?: WorldRouteNode): CombatRules | undefined {
  const pact = run.pactId ? pactDef(run.pactId) : undefined
  return chainRules(currentDaoRules(), world.rules, pactRules(pact), node?.rules)
}

/** 远征总场数(入界 + 三层 + 界主) */
const RUN_FIGHTS = 5

function settle(run: WorldRunState, world: CelestialWorldDef, cleared: boolean, pactBroken: boolean): number {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  let reward = 0
  if (cleared) {
    const pact = run.pactId ? pactDef(run.pactId) : undefined
    const speedBonus = endgame.daoPath === 'slaughter' ? slaughterSpeedBonus(run.totalRounds, RUN_FIGHTS) : 0
    reward = Math.floor((world.rewardDaoSource + run.bonus) * (pact?.sourceMult ?? 1) * (1 + speedBonus))
    endgame.addDaoSource(reward)
    endgame.recordWorldClear(world.id)
    // 修行节点与极限纪录(Phase 28)
    recordMilestone('first_world')
    if (run.pactId === 'ni') recordMilestone('first_ni')
    if (run.pactId === 'wushang') recordMilestone('first_wushang')
    if (world.id === 'void') recordMilestone('first_void')
    trackClearRecords(world.name, run.totalRounds, run.pactId, reward)
    ui.toast(`你踏破${world.name}!道源 +${reward}${speedBonus > 0 ? '(含杀伐速战之赏)' : ''}`, 'rare')
  } else if (pactBroken) {
    ui.toast(`契约崩碎,天道将你逐出${world.name}`, 'warn')
  } else {
    ui.toast(`${world.name}将你逐出天门`, 'warn')
  }
  recordMark(world.id, world.name, cleared, run.totalRounds, run.pactId)
  endgame.worldRun = null
  return reward
}

/** 打一场(内部通用):更新 run 状态并返回战果 */
function fightStep(run: WorldRunState, world: CelestialWorldDef, foeShape: WorldFoeShape, node?: WorldRouteNode): StepOutcome {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const stats = player.finalStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  const foe = worldFoeSnap(foeShape, ref)
  const rules = runRules(world, run, node)
  const startCap = rules?.playerStartHpPct ?? 1
  const fightRules: CombatRules = { ...(rules ?? {}), playerStartHpPct: Math.min(startCap, run.carriedHpPct) }
  const result = resolveCombat(runSnap(run), foe, rng, fightRules)

  const row = { foeName: foe.name, win: result.win, rounds: result.rounds, hpLeftPct: result.playerHpPct }
  const next: WorldRunState = {
    ...run,
    rows: [...run.rows, row],
    totalRounds: run.totalRounds + result.rounds,
    carriedHpPct: Math.min(startCap, result.playerHpPct + world.healBetweenPct)
  }
  const pact = run.pactId ? pactDef(run.pactId) : undefined

  if (!result.win) {
    endgame.worldRun = next
    settle(next, world, false, false)
    return { type: 'lost', row, rewardDaoSource: 0, finalRows: next.rows }
  }
  if (pact?.special === 'endHp80' && result.playerHpPct < 0.8) {
    endgame.worldRun = next
    settle(next, world, false, true)
    return { type: 'pactBroken', row, rewardDaoSource: 0, finalRows: next.rows }
  }
  next.winStacks += 1
  if (node) next.bonus += node.bonus

  const wasGuardian = run.layer === 3
  if (wasGuardian) {
    endgame.worldRun = next
    const reward = settle(next, world, true, false)
    return { type: 'cleared', row, rewardDaoSource: reward, finalRows: next.rows }
  }
  next.layer = node ? run.layer + 1 : 0
  endgame.worldRun = next
  return { type: 'advance', row, rewardDaoSource: 0 }
}

/** 启程:签契、扣道源、打入界战 */
export function startWorldExpedition(worldId: string, pactId: string | null): StepOutcome | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const world = resolveWorld(worldId)
  if (!world || !endgameUnlocked()) return null
  if (!endgame.daoPath) {
    ui.toast('先择道途,方可踏天', 'warn')
    return null
  }
  if (endgame.worldRun) {
    ui.toast('已有远征在途,先了结眼前的路', 'warn')
    return null
  }
  const pact = pactId ? pactDef(pactId) : undefined
  let sealedMods: StatMods | undefined
  if (pact?.special === 'sealCore') {
    const sealed = sealCoreMods()
    if (!sealed) {
      ui.toast('道途尚未成路,逆命契无从封印', 'warn')
      return null
    }
    sealedMods = sealed
  }
  if (!endgame.spendDaoSource(world.entryCost)) {
    ui.toast(`道源不足 ${world.entryCost}(天道熔炉可献祭闲置资财)`, 'warn')
    return null
  }
  const rules = chainRules(currentDaoRules(), world.rules, pactRules(pact))
  const run: WorldRunState = {
    worldId,
    pactId,
    layer: 0,
    bonus: 0,
    rows: [],
    carriedHpPct: rules?.playerStartHpPct ?? 1,
    totalRounds: 0,
    winStacks: 0,
    sealedMods
  }
  if (pact) ui.toast(`你与天道立下「${pact.name}」`, 'info')
  return fightStep(run, world, world.foes[0]!)
}

/** 择路进层(layer 0..2) */
export function chooseRouteNode(choice: 0 | 1): StepOutcome | null {
  const endgame = useEndgameStore()
  const run = endgame.worldRun
  if (!run || run.layer < 0 || run.layer > 2) return null
  const world = resolveWorld(run.worldId)
  if (!world) return null
  const node = world.routes[run.layer]?.[choice]
  if (!node) return null
  return fightStep(run, world, node.foe, node)
}

/** 决战界主 */
export function challengeGuardian(): StepOutcome | null {
  const endgame = useEndgameStore()
  const run = endgame.worldRun
  if (!run || run.layer !== 3) return null
  const world = resolveWorld(run.worldId)
  if (!world) return null
  return fightStep(run, world, world.guardian)
}

/** 中道而返(不退道源,记一笔殁) */
export function abandonExpedition(): void {
  const endgame = useEndgameStore()
  const run = endgame.worldRun
  if (!run) return
  const world = resolveWorld(run.worldId)
  if (world) {
    recordMark(world.id, world.name, false, run.totalRounds)
    useUiStore().toast(`你退出了${world.name},此行道源尽付东流`, 'info')
  }
  endgame.worldRun = null
}

// ---------- 天机透视 ----------

export interface FightPreview {
  skillLines: string[]
  /** 危险时间点与形势提示(信息,不是答案) */
  riskLines: string[]
  winText: string
}

const RATE_WORDS = (rate: number): string => (rate >= 0.55 ? '常发' : rate >= 0.35 ? '频发' : '偶发')
const EFFECT_WORDS: Record<string, string> = {
  multi: '多段',
  pierce: '真伤',
  stun: '震慑',
  drain: '汲血',
  bleed: '流血',
  shield: '结盾'
}

/** 天机道:窥见一场未来之战(招式明细 + 胜算) */
export function previewFight(foeShape: WorldFoeShape, node?: WorldRouteNode): FightPreview | null {
  const endgame = useEndgameStore()
  if (endgame.daoPath !== 'fate') return null
  const run = endgame.worldRun
  const world = run ? resolveWorld(run.worldId) : undefined
  const player = usePlayerStore()
  const stats = player.finalStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  const foe = worldFoeSnap(foeShape, ref)
  const skillLines = foeShape.skills.map(sk => {
    const tag = sk.effect ? (EFFECT_WORDS[sk.effect] ?? sk.effect) : '重击'
    return `【${sk.name}】${tag} · ${RATE_WORDS(sk.rate)} · 威力 ${sk.mult.toFixed(1)} 倍`
  })
  if (foeShape.mods?.dodgeRate) skillLines.push(`身法诡谲,闪避约 ${Math.round(foeShape.mods.dodgeRate * 100)}%`)
  const rules = world && run ? runRules(world, run, node) : currentDaoRules()
  // 危险时点:限时 / 杀意渐涨 / 重击预警 / 生机稀薄
  const riskLines: string[] = []
  if (rules?.maxRounds !== undefined) riskLines.push(`天时仅 ${rules.maxRounds} 回合,拖延即败`)
  if (rules?.perRounds) riskLines.push(`每 ${rules.perRounds.interval} 回合敌人杀意渐涨,战局越晚越凶`)
  const heavy = foeShape.skills.find(sk => sk.mult >= 2)
  if (heavy) riskLines.push(`【${heavy.name}】足以重创,留足气血以备不测`)
  if ((rules?.healMult ?? 1) < 0.7) riskLines.push('此地生机稀薄,回血难以为继')
  const snap = run ? runSnap(run) : buildPlayerSnap(true)
  const rate = sampleWinRate(snap, foe, rng, 3, rules)
  const winText = rate >= 0.9 ? '胜算在握' : rate >= 0.6 ? '约有七成胜算' : rate >= 0.35 ? '五五之数,凶险参半' : '凶多吉少'
  return { skillLines, riskLines, winText }
}

// ---------- 天道变数 ----------

export const MUTATION_ENTRY_COST = 18
export const MUTATION_BASE_REWARD = 55
export const MUTATION_FIGHTS = 6
export const MUTATION_ESCALATION = 1.06

/** 抽取本次变数(三条不重复) */
export function rollMutators(): string[] {
  const pool = [...MUTATORS]
  const picked: string[] = []
  for (let i = 0; i < 3 && pool.length; i += 1) {
    const idx = rng.int(0, pool.length - 1)
    picked.push(pool[idx]!.id)
    pool.splice(idx, 1)
  }
  return picked
}

export interface MutationResult {
  report: GauntletReport
  rewardDaoSource: number
}

/** 应战天道变数:随机规则 × 六连战 */
export function challengeMutation(mutatorIds: string[]): MutationResult | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!endgameUnlocked() || !endgame.daoPath) {
    ui.toast('先择道途,方可应变数', 'warn')
    return null
  }
  if (!endgame.spendDaoSource(MUTATION_ENTRY_COST)) {
    ui.toast(`道源不足 ${MUTATION_ENTRY_COST}`, 'warn')
    return null
  }
  const muts = mutatorIds.map(id => MUTATORS.find(m => m.id === id)).filter(m => m !== undefined)
  const rules = chainRules(currentDaoRules(), ...muts.map(m => m!.rules))
  const player = usePlayerStore()
  const stats = player.finalStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  const foes = []
  for (let i = 0; i < MUTATION_FIGHTS; i += 1) {
    foes.push(worldFoeSnap(MUTATION_FOES[i % MUTATION_FOES.length]!, ref, Math.pow(MUTATION_ESCALATION, i)))
  }
  const report = runGauntlet(buildPlayerSnap(true), foes, rules, 0.4, rng, { perWinPlayerMods: perWinMods() })
  let reward = 0
  if (report.cleared) {
    reward = MUTATION_BASE_REWARD
    endgame.addDaoSource(reward)
    ui.toast(`天道变数尽数破解!道源 +${reward}`, 'rare')
  } else {
    ui.toast(`变数难测,你止步第 ${report.fightsWon + 1} 战`, 'warn')
  }
  recordMark('mutation', '天道变数', report.cleared, report.totalRounds, null, { mutatorIds })
  return { report, rewardDaoSource: reward }
}

// ---------- 虚界之门(程序化世界) ----------

export const VOID_REROLL_COST = 10

/** 窥探虚界:花道源生成一个裁判过审的临时世界(进行中远征在虚界时不可重摇) */
export function rerollVoidWorld(): boolean {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (!endgameUnlocked() || !endgame.daoPath) {
    ui.toast('先择道途,方可窥探虚界', 'warn')
    return false
  }
  if (endgame.worldRun?.worldId === 'void') {
    ui.toast('虚界远征在途,此界尚不能散去', 'warn')
    return false
  }
  if (!endgame.spendDaoSource(VOID_REROLL_COST)) {
    ui.toast(`道源不足 ${VOID_REROLL_COST}`, 'warn')
    return false
  }
  const generated = generateApprovedWorld(Date.now() % 999983, 40, voidHistory())
  if (!generated) {
    // 极端情形兜底:裁判连续否决,退款
    endgame.addDaoSource(VOID_REROLL_COST)
    ui.toast('天机紊乱,虚界未能成形(道源已退还)', 'warn')
    return false
  }
  endgame.voidWorld = generated.world
  ui.toast(
    `虚界「${generated.world.name}」成形(迥异诸天 ${Math.round(generated.novelty * 100)}%,推演淘汰 ${generated.rejected} 个候选)`,
    'rare'
  )
  return true
}

/** 新颖度历史:手工四天 + 当前虚界(连摇也要与上一座不同) */
function voidHistory(): HistoryEntry[] {
  const endgame = useEndgameStore()
  const hist = [...defaultHistory()]
  if (endgame.voidWorld) hist.push({ world: endgame.voidWorld })
  return hist
}

// ---------- 天道赌约:远征前的整程预估 ----------

export interface ExpeditionForecast {
  /** 玩家当前构筑的整程胜算档 */
  difficulty: string
  /** 六大标准流派中可行的数目(≥35% 通率) */
  viableStyles: number
  /** 当前构筑相性(1~5 星) */
  stars: string
}

/**
 * 整程预估:玩家构筑 + 所选契约,对该世界的线性连战做小样本推演。
 * 只给分档与星级,不给精确数字——信息归玩家,答案也归玩家
 */
export function forecastExpedition(worldId: string, pactId: string | null): ExpeditionForecast | null {
  const world = resolveWorld(worldId)
  if (!world) return null
  const pact = pactId ? pactDef(pactId) : undefined
  const rules = chainRules(currentDaoRules(), world.rules, pactRules(pact))
  const opts = pact?.special === 'endHp80' ? { minHpAfterFight: 0.8 } : {}
  const seededRng = new RandomService(mulberry32(worldId.length * 1009 + (pactId?.length ?? 0) * 97 + world.name.length * 7))

  // 玩家构筑:含孤剑/逆命的快照修饰,敌人按玩家等比生成
  const player = usePlayerStore()
  const stats = player.finalStats
  const pRef = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  let snap = buildPlayerSnap(true)
  if (pact?.special === 'soloArtifact') snap = { ...snap, artifacts: (snap.artifacts ?? []).slice(0, 1) }
  if (pact?.special === 'sealCore') {
    const sealed = sealCoreMods()
    if (sealed) snap = { ...snap, mods: stackedMods(snap.mods, sealed, 1) }
  }
  const playerFoes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) playerFoes.push(worldFoeSnap(world.foes[i % world.foes.length]!, pRef))
  playerFoes.push(worldFoeSnap(world.guardian, pRef))
  let clears = 0
  for (let i = 0; i < 8; i += 1) {
    if (runGauntlet(snap, playerFoes, rules, world.healBetweenPct, seededRng, opts).cleared) clears += 1
  }
  const pRate = clears / 8

  // 六大标准流派的可行数(标准模拟空间)
  const simFoes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) simFoes.push(worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE))
  simFoes.push(worldFoeSnap(world.guardian, SIM_REFERENCE))
  let viableStyles = 0
  for (const profile of BUILD_PROFILES) {
    let wins = 0
    for (let i = 0; i < 5; i += 1) {
      if (runGauntlet(buildSnap(profile), simFoes, rules, world.healBetweenPct, seededRng, opts).cleared) wins += 1
    }
    if (wins / 5 >= 0.4) viableStyles += 1
  }

  const starN = pRate >= 0.85 ? 5 : pRate >= 0.6 ? 4 : pRate >= 0.4 ? 3 : pRate >= 0.15 ? 2 : 1
  return {
    difficulty: pRate >= 0.85 ? '胜券在望' : pRate >= 0.6 ? '略占上风' : pRate >= 0.4 ? '胜负各半' : pRate >= 0.15 ? '凶险' : '九死一生',
    viableStyles,
    stars: '★'.repeat(starN) + '☆'.repeat(5 - starN)
  }
}

export { PACTS }
