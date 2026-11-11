/**
 * 路线远征 —— 天道契约 × 逐层择路 × 道途深化 × 天道变数
 * 状态机:入界战 → 三层二择一 → 界主;层间可回凡界换构筑再续行
 */
import { rateStarsText, rateText } from '@/ui/rateRank'
import type { CelestialWorldDef, CombatantSnap, CombatRules, PactDef, StatMods, WorldFoeShape, WorldRouteNode } from '@/types'
import { rng } from '@/utils/random'
import { mulberry32, RandomService } from '@/utils/random'
import { celestialWorldDef } from '@/data/endgame'
import { pactDef } from '@/data/pacts'
import { MUTATORS } from '@/data/mutators'
import { EXPEDITION_GUARDIAN_LAYER, EXPEDITION_ROUTE_LAYERS, MUTATION_FOES } from '@/data/endgame'
import { buildPlayerSnap } from './playerSnap'
import { detectBuild } from './buildDetect'
import {
  celestialFoeCaliber,
  celestialJudgement,
  celestialJudgementLines,
  mergeRules,
  runGauntlet,
  worldFoeSnap,
  SIM_REFERENCE,
  type GauntletReport
} from './gauntlet'
import { VOID_ANCHOR_TIER } from './worldGen'
import { MAX_MAJOR } from '@/data/realms'
import { resolveCombat, sampleWinRate } from './combat'
import { modOf } from './statsCalc'
import { perWinModsOf, slaughterSpeedBonus, stackedMods } from './daoDepth'
import { currentDaoRules, endgameUnlocked, recordMark } from './endgameService'
import { recordMilestone, trackClearRecords } from './identity'
import { defaultHistoryAsync, generateApprovedWorldAsync, type HistoryEntry } from './worldGen'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore, type WorldRunState } from '@/stores/endgame'
import { gateDef } from '@/data/qimen'
import { useUiStore } from '@/stores/ui'
import { daoSourceShortfall } from './daoSource'
import { endgameBusy, ENTRY_REASON } from './endgameActivity'

/** 单场战果 */
export interface StepOutcome {
  type: 'advance' | 'cleared' | 'lost' | 'pactBroken'
  row: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }
  rewardDaoSource: number
  /** 远征终局时附全程战报(此刻 store 中的 run 已清空) */
  finalRows?: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }[]
  /** 敌人一侧的判定(道之理解 / 境界压制),终局时附上 */
  judgementLines?: string[]
}

/** 本界对当前玩家的判定文案;与战前预估同源(gauntlet.celestialJudgementLines) */
function judgementLinesOf(world: CelestialWorldDef): string[] {
  const player = usePlayerStore()
  return celestialJudgementLines(player.celestialStats.mods, player.major, world.anchorTier)
}

function chainRules(...list: (CombatRules | undefined)[]): CombatRules | undefined {
  return list.reduce((acc, cur) => mergeRules(acc, cur), undefined)
}

/** 世界定义;虚界('void')为程序化生成,存于 store */
export function resolveWorld(id: string): CelestialWorldDef | undefined {
  if (id === 'void') return useEndgameStore().voidWorld ?? undefined
  return celestialWorldDef(id)
}

/** 道途逐胜叠层词条(选择逻辑收在 daoDepth.perWinModsOf,与 tryChallenge 等共用) */
function perWinMods(): StatMods | undefined {
  return perWinModsOf(useEndgameStore().daoPath)
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

/**
 * 契约对玩家侧的约束(逆命契封核心、孤剑契只带一件法宝)。
 * 预估(forecastExpedition)与出发前预览(previewFight)共用,须与实战一致。
 */
export function pactBoundedSnap(base: CombatantSnap, pact: PactDef | undefined): CombatantSnap {
  let snap = base
  if (pact?.special === 'soloArtifact') snap = { ...snap, artifacts: (snap.artifacts ?? []).slice(0, 1) }
  if (pact?.special === 'sealCore') {
    const sealed = sealCoreMods()
    if (sealed) snap = { ...snap, mods: stackedMods(snap.mods, sealed, 1) }
  }
  return snap
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

/** 择门所得的行军规则;未择门为空(审计基线依此不变) */
function gateRulesOf(gateId: string | null | undefined): CombatRules | undefined {
  return gateId ? gateDef(gateId)?.rules : undefined
}

/**
 * 本场规则:道途 + 世界 + 契约 + 所择之门 + 节点。
 * 实战(fightStep)走它;导出以便钉住「所见即所打」。
 */
export function expeditionRules(world: CelestialWorldDef, run: WorldRunState, node?: WorldRouteNode): CombatRules | undefined {
  const pact = run.pactId ? pactDef(run.pactId) : undefined
  return chainRules(currentDaoRules(), world.rules, pactRules(pact), gateRulesOf(run.gateId), node?.rules)
}

/**
 * 给规则压上携带气血(上一场余血带进下一场;playerStartHpPct 为开局上限)。
 * 实战与天机预览共用;预览漏掉它会在残血时报得过于乐观。
 */
export function withCarriedHp(rules: CombatRules | undefined, run: WorldRunState): CombatRules {
  const startCap = rules?.playerStartHpPct ?? 1
  return { ...(rules ?? {}), playerStartHpPct: Math.min(startCap, run.carriedHpPct) }
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
    recordMilestone('first_world')
    if (run.pactId === 'ni') recordMilestone('first_ni')
    if (run.pactId === 'wushang') recordMilestone('first_wushang')
    if (world.id === 'void') recordMilestone('first_void')
    trackClearRecords(world.name, run.totalRounds, run.pactId, reward)
    ui.toast(`${world.name}已破 · 道源 +${reward}${speedBonus > 0 ? '(含速战之赏)' : ''}`, 'rare')
  } else if (pactBroken) {
    ui.toast('契约崩碎', 'warn')
  } else {
    ui.toast(`被逐出${world.name}`, 'warn')
  }
  // 所择之门记入道痕:忆战/重写按当年的门重打
  recordMark(world.id, world.name, cleared, run.totalRounds, run.pactId, run.gateId ? { gateId: run.gateId } : undefined)
  endgame.worldRun = null
  return reward
}

/** 打一场:更新 run 状态并返回战果 */
function fightStep(run: WorldRunState, world: CelestialWorldDef, foeShape: WorldFoeShape, node?: WorldRouteNode): StepOutcome {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  // 参照与加厚口径取自 gauntlet:敌人须按玩家 celestialStats 同一份生成
  const { ref, judgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, world.anchorTier)
  const foe = worldFoeSnap(foeShape, ref, 1, judgement)
  const baseRules = expeditionRules(world, run, node)
  const startCap = baseRules?.playerStartHpPct ?? 1
  const fightRules = withCarriedHp(baseRules, run)
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
    return { type: 'lost', row, rewardDaoSource: 0, finalRows: next.rows, judgementLines: judgementLinesOf(world) }
  }
  if (pact?.special === 'endHp80' && result.playerHpPct < 0.8) {
    endgame.worldRun = next
    settle(next, world, false, true)
    return { type: 'pactBroken', row, rewardDaoSource: 0, finalRows: next.rows, judgementLines: judgementLinesOf(world) }
  }
  next.winStacks += 1
  if (node) next.bonus += node.bonus

  const wasGuardian = run.layer === EXPEDITION_GUARDIAN_LAYER
  if (wasGuardian) {
    endgame.worldRun = next
    const reward = settle(next, world, true, false)
    return { type: 'cleared', row, rewardDaoSource: reward, finalRows: next.rows, judgementLines: judgementLinesOf(world) }
  }
  next.layer = node ? run.layer + 1 : 0
  endgame.worldRun = next
  return { type: 'advance', row, rewardDaoSource: 0 }
}

/** 启程:签契、扣道源、打入界战 */
export function startWorldExpedition(worldId: string, pactId: string | null, gateId: string | null = null): StepOutcome | null {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const world = resolveWorld(worldId)
  if (!world || !endgameUnlocked()) return null
  if (!endgame.daoPath) {
    ui.toast(ENTRY_REASON.noDaoPath, 'warn')
    return null
  }
  const busy = endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, endgame.adventureSession)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return null
  }
  const pact = pactId ? pactDef(pactId) : undefined
  const gate = gateId ? gateDef(gateId) : undefined
  let sealedMods: StatMods | undefined
  if (pact?.special === 'sealCore') {
    const sealed = sealCoreMods()
    if (!sealed) {
      ui.toast('无流派可封', 'warn')
      return null
    }
    sealedMods = sealed
  }
  const short = daoSourceShortfall(world.entryCost, endgame.daoSource)
  if (!endgame.spendDaoSource(world.entryCost)) {
    ui.toast(short.reason ?? `道源不足 ${world.entryCost}`, 'warn')
    return null
  }
  const rules = chainRules(currentDaoRules(), world.rules, pactRules(pact), gateRulesOf(gate?.id))
  const run: WorldRunState = {
    worldId,
    pactId,
    gateId: gate?.id ?? null,
    layer: 0,
    bonus: 0,
    rows: [],
    carriedHpPct: rules?.playerStartHpPct ?? 1,
    totalRounds: 0,
    winStacks: 0,
    sealedMods
  }
  if (pact) ui.toast(`已立「${pact.name}」`, 'info')
  if (gate) ui.toast(`自「${gate.fullName}」入界`, 'info')
  return fightStep(run, world, world.foes[0]!)
}

/** 择路进层(layer 0..EXPEDITION_ROUTE_LAYERS-1) */
export function chooseRouteNode(choice: 0 | 1): StepOutcome | null {
  const endgame = useEndgameStore()
  const run = endgame.worldRun
  if (!run || run.layer < 0 || run.layer >= EXPEDITION_ROUTE_LAYERS) return null
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
    useUiStore().toast(`已退出${world.name}`, 'info')
  }
  endgame.worldRun = null
}

// ---------- 天机透视 ----------

export interface FightPreview {
  skillLines: string[]
  /** 危险时间点与形势提示 */
  riskLines: string[]
  winText: string
  /** 胜算(0~1),与实战同口径,含携带气血 */
  rate: number
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

/**
 * 天机道:窥见一场未来之战(招式明细 + 胜算)。
 * 胜算规则须与 fightStep 一致,走同一个 withCarriedHp(含携带气血)。随机源可注入,供自检钉住口径。
 */
export function previewFight(
  foeShape: WorldFoeShape,
  node?: WorldRouteNode,
  rand: RandomService = rng,
  prep?: { worldId: string; pactId: string | null; gateId: string | null }
): FightPreview | null {
  const endgame = useEndgameStore()
  if (endgame.daoPath !== 'fate') return null
  const run = endgame.worldRun
  const world = run ? resolveWorld(run.worldId) : prep ? resolveWorld(prep.worldId) : undefined
  if (!world) return null
  const player = usePlayerStore()
  const { ref, judgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, world.anchorTier)
  const foe = worldFoeSnap(foeShape, ref, 1, judgement)
  const skillLines = foeShape.skills.map(sk => {
    const tag = sk.effect ? (EFFECT_WORDS[sk.effect] ?? sk.effect) : '重击'
    return `【${sk.name}】${tag} · ${RATE_WORDS(sk.rate)} · 威力 ${sk.mult.toFixed(1)} 倍`
  })
  if (foeShape.mods?.dodgeRate) skillLines.push(`闪避 ${Math.round(foeShape.mods.dodgeRate * 100)}%`)
  // 在途按 expeditionRules;出发前(带 prep)按首战规则合成:道途 × 世界 × 契约 × 门
  const rules =
    world && run
      ? expeditionRules(world, run, node)
      : prep && world
        ? chainRules(currentDaoRules(), world.rules, pactRules(prep.pactId ? pactDef(prep.pactId) : undefined), gateRulesOf(prep.gateId), node?.rules)
        : currentDaoRules()
  const riskLines: string[] = []
  if (rules?.maxRounds !== undefined) riskLines.push(`天时仅 ${rules.maxRounds} 回合`)
  if (rules?.perRounds) riskLines.push(`每 ${rules.perRounds.interval} 回合敌人杀意渐涨`)
  const heavy = foeShape.skills.find(sk => sk.mult >= 2)
  if (heavy) riskLines.push(`【${heavy.name}】可致重创`)
  if ((rules?.healMult ?? 1) < 0.7) riskLines.push('生机稀薄')
  // 契约负担(封核心、只带一件法宝)预览不得勾销
  const snap = run
    ? runSnap(run)
    : pactBoundedSnap(buildPlayerSnap(true), prep?.pactId ? pactDef(prep.pactId) : undefined)
  const fightRules = world && run ? withCarriedHp(rules, run) : rules
  const rate = sampleWinRate(snap, foe, rand, 3, fightRules)
  const winText = rate >= 0.9 ? '胜算在握' : rate >= 0.6 ? '七成胜算' : rate >= 0.35 ? '五五之数' : '凶多吉少'
  return { skillLines, riskLines, winText, rate }
}

// ---------- 天道变数 ----------

export const MUTATION_ENTRY_COST = 18
export const MUTATION_BASE_REWARD = 55
export const MUTATION_FIGHTS = 6
export const MUTATION_ESCALATION = 1.06

/** 抽取本次变数(三条不重复) */
export function rollMutators(source: readonly { id: string }[] = MUTATORS): string[] {
  const pool = [...source]
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
    ui.toast(ENTRY_REASON.noDaoPath, 'warn')
    return null
  }
  const busy = endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, endgame.adventureSession)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return null
  }
  const short = daoSourceShortfall(MUTATION_ENTRY_COST, endgame.daoSource)
  if (!endgame.spendDaoSource(MUTATION_ENTRY_COST)) {
    ui.toast(short.reason ?? `道源不足 ${MUTATION_ENTRY_COST}`, 'warn')
    return null
  }
  const muts = mutatorIds.map(id => MUTATORS.find(m => m.id === id)).filter(m => m !== undefined)
  const rules = chainRules(currentDaoRules(), ...muts.map(m => m!.rules))
  const player = usePlayerStore()
  // 变数连战不属任何一界:锚点取阶梯最深处(与变数天界同档)
  const { ref, judgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, VOID_ANCHOR_TIER)
  const foes = []
  for (let i = 0; i < MUTATION_FIGHTS; i += 1) {
    foes.push(worldFoeSnap(MUTATION_FOES[i % MUTATION_FOES.length]!, ref, Math.pow(MUTATION_ESCALATION, i), judgement))
  }
  const report = runGauntlet(buildPlayerSnap(true), foes, rules, 0.4, rng, { perWinPlayerMods: perWinMods() })
  let reward = 0
  if (report.cleared) {
    reward = MUTATION_BASE_REWARD
    endgame.addDaoSource(reward)
    ui.toast(`变数已破 · 道源 +${reward}`, 'rare')
  } else {
    ui.toast(`止步第 ${report.fightsWon + 1} 战`, 'warn')
  }
  recordMark('mutation', '天道变数', report.cleared, report.totalRounds, null, { mutatorIds })
  return { report, rewardDaoSource: reward }
}

// ---------- 虚界之门(程序化世界) ----------

export const VOID_REROLL_COST = 10

/** 窥探进行中:防重入(连点会在几秒内多次扣道源) */
let voidRerolling = false

/** 窥探是否在途 —— 界面据此置灰并写「窥探中」 */
export function isVoidRerolling(): boolean {
  return voidRerolling
}

/**
 * 窥探虚界:花道源生成一个过审的临时世界。
 *
 * 生成是分块异步的 —— 单次候选的审计约 70ms,maxTries=40 时整趟最坏 3183ms、中位 654ms。
 * 扣费同步做(立即给回执),生成让出主线程,期间 `voidRerolling` 挡掉连点。
 */
export async function rerollVoidWorld(): Promise<boolean> {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (voidRerolling) return false
  if (!endgameUnlocked() || !endgame.daoPath) {
    ui.toast(ENTRY_REASON.noDaoPath, 'warn')
    return false
  }
  if (endgame.worldRun?.worldId === 'void') {
    ui.toast('虚界远征在途', 'warn')
    return false
  }
  const short = daoSourceShortfall(VOID_REROLL_COST, endgame.daoSource)
  if (!endgame.spendDaoSource(VOID_REROLL_COST)) {
    ui.toast(short.reason ?? `道源不足 ${VOID_REROLL_COST}`, 'warn')
    return false
  }
  voidRerolling = true
  ui.toast('窥探中', 'warn')
  try {
    const generated = await generateApprovedWorldAsync(Date.now() % 999983, 40, await voidHistory())
    if (!generated) {
      // 裁判连续否决:退款
      endgame.addDaoSource(VOID_REROLL_COST)
      ui.toast('虚界未成形 · 道源已退还', 'warn')
      return false
    }
    endgame.voidWorld = generated.world
    ui.toast(`虚界「${generated.world.name}」成形`, 'rare')
    return true
  } finally {
    voidRerolling = false
  }
}

/** 新颖度历史:手工四天 + 当前虚界(连摇须与上一座不同) */
async function voidHistory(): Promise<HistoryEntry[]> {
  const endgame = useEndgameStore()
  const hist = [...(await defaultHistoryAsync())]
  if (endgame.voidWorld) hist.push({ world: endgame.voidWorld })
  return hist
}

// ---------- 天道赌约:远征前的整程预估 ----------

export interface ExpeditionForecast {
  /** 玩家当前构筑的整程胜算档 */
  difficulty: string
  /** 敌人一侧的判定(道之理解 / 境界压制) */
  judgementLines: string[]
  /** 六大标准流派中可行的数目 */
  viableStyles: number
  /** 当前构筑相性(1~5 星) */
  stars: string
}

/**
 * 远征真实对阵:入界 + 每层择路节点(取第 0 个选择)+ 界主,共 EXPEDITION_ROUTE_LAYERS+2 战。
 * 不得用 world.fights(挑战/重演的敌数 6):预估会多算一战、用错敌方形态,并给剑/杀多叠一层 per-win。
 * 节点各自的 rules 不逐战建模(gauntlet 只吃一份全局规则)。
 */
export function expeditionFoeShapes(world: CelestialWorldDef): WorldFoeShape[] {
  const foes: WorldFoeShape[] = [world.foes[0]!]
  for (let layer = 0; layer < EXPEDITION_ROUTE_LAYERS; layer += 1) {
    const node = world.routes[layer]?.[0]
    if (node) foes.push(node.foe)
  }
  foes.push(world.guardian)
  return foes
}

/** 整程预估:玩家构筑 + 所选契约,对该世界线性连战做小样本推演;只给分档与星级,不给精确数字 */
export function forecastExpedition(worldId: string, pactId: string | null, gateId: string | null = null): ExpeditionForecast | null {
  const world = resolveWorld(worldId)
  if (!world) return null
  const pact = pactId ? pactDef(pactId) : undefined
  // 与真打同源:含所择之门
  const rules = chainRules(currentDaoRules(), world.rules, pactRules(pact), gateRulesOf(gateId))
  const endHp80 = pact?.special === 'endHp80' ? { minHpAfterFight: 0.8 } : {}
  // 玩家侧计入剑意 / 杀意逐胜叠层(与真打同源);
  // 流派可行性比的是标准构筑形状,与玩家道途无关,不加叠层
  const opts = { ...endHp80 }
  const playerOpts = { ...endHp80, perWinPlayerMods: perWinMods(), buildLog: false }
  const seededRng = new RandomService(mulberry32(worldId.length * 1009 + (pactId?.length ?? 0) * 97 + world.name.length * 7))

  const player = usePlayerStore()
  // 敌人按玩家等比生成;参照与加厚系数与实战同源(celestialFoeCaliber)
  const { ref: pRef, judgement: pJudgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, world.anchorTier)
  const snap = pactBoundedSnap(buildPlayerSnap(true), pact)
  const playerFoes: CombatantSnap[] = expeditionFoeShapes(world).map(f => worldFoeSnap(f, pRef, 1, pJudgement))
  let clears = 0
  for (let i = 0; i < 8; i += 1) {
    if (runGauntlet(snap, playerFoes, rules, world.healBetweenPct, seededRng, playerOpts).cleared) clears += 1
  }
  const pRate = clears / 8

  // 六大标准流派可行数。参照取 SIM_REFERENCE:比构筑形状,不比绝对强度,不走本界锚点;
  // 判定仍照实战口径,漏掉道之理解加厚会高估厚流派。
  let viableStyles = 0
  for (const profile of BUILD_PROFILES) {
    const styleSnap = buildSnap(profile)
    const styleJudgement = celestialJudgement(styleSnap.mods, MAX_MAJOR, world.anchorTier)
    const simFoes: CombatantSnap[] = expeditionFoeShapes(world).map(f => worldFoeSnap(f, SIM_REFERENCE, 1, styleJudgement))
    let wins = 0
    for (let i = 0; i < 5; i += 1) {
      if (runGauntlet(styleSnap, simFoes, rules, world.healBetweenPct, seededRng, opts).cleared) wins += 1
    }
    if (wins / 5 >= 0.4) viableStyles += 1
  }

  // 档位与说法收在 ui/rateRank:与 core/compare、core/lab 同一份阈值,不在这里再写一遍
  return {
    difficulty: rateText(pRate),
    judgementLines: celestialJudgementLines(player.celestialStats.mods, player.major, world.anchorTier),
    viableStyles,
    stars: rateStarsText(pRate)
  }
}
