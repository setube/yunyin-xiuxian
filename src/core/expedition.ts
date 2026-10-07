/**
 * 路线远征(Phase 21)—— 天道契约 × 逐层择路 × 道途深化 × 天道变数
 * 远征是状态机:入界战 → 三层二择其一 → 界主。层间可自由回凡界换构筑再续行
 */
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
  type GauntletReport
} from './gauntlet'
import { VOID_ANCHOR_TIER } from './worldGen'
import { MAX_MAJOR } from '@/data/realms'
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
import { gateDef } from '@/data/qimen'
import { useUiStore } from '@/stores/ui'

/** 单场战果 */
export interface StepOutcome {
  type: 'advance' | 'cleared' | 'lost' | 'pactBroken'
  row: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }
  rewardDaoSource: number
  /** 远征终局时附全程战报(此刻 store 中的 run 已清空) */
  finalRows?: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }[]
  /** 敌人一侧的判定(道之理解 / 境界压制):终局时附上,输也要输得明白 */
  judgementLines?: string[]
}

/** 本界对**此刻的你**的判定文案(战报与战前预估同源,见 gauntlet.celestialJudgementLines) */
function judgementLinesOf(world: CelestialWorldDef): string[] {
  const player = usePlayerStore()
  return celestialJudgementLines(player.celestialStats.mods, player.major, world.anchorTier)
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

/** 择门所得的行军规则(未择门则为空 —— 审计基线与从前逐字相同) */
function gateRulesOf(gateId: string | null | undefined): CombatRules | undefined {
  return gateId ? gateDef(gateId)?.rules : undefined
}

/**
 * 这一场按什么规则打(道途 + 世界 + 契约 + 所择之门 + 节点)。
 *
 * 对外可见:预估(forecastExpedition)与实战(fightStep)都走它,
 * 故"所见即所打"这条契约可以被直接钉住 —— 两边各写一份规则,迟早对不上。
 */
export function expeditionRules(world: CelestialWorldDef, run: WorldRunState, node?: WorldRouteNode): CombatRules | undefined {
  const pact = run.pactId ? pactDef(run.pactId) : undefined
  return chainRules(currentDaoRules(), world.rules, pactRules(pact), gateRulesOf(run.gateId), node?.rules)
}

/**
 * 给规则压上「携带气血」这一层 —— 实战与天机预览都走它。
 *
 * 远征是连着打的:上一场剩多少血就带进下一场(playerStartHpPct 是开局上限)。
 * 故「所见即所打」的完整版不是「规则同源」,而是「**连血量也同源**」——
 * 预览若只看规则、不看携带气血,就会在玩家越残的时候报得越乐观。
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
  // 所择之门记进道痕环境:忆战/重写要按当年的门重打这一趟
  recordMark(world.id, world.name, cleared, run.totalRounds, run.pactId, run.gateId ? { gateId: run.gateId } : undefined)
  endgame.worldRun = null
  return reward
}

/** 打一场(内部通用):更新 run 状态并返回战果 */
function fightStep(run: WorldRunState, world: CelestialWorldDef, foeShape: WorldFoeShape, node?: WorldRouteNode): StepOutcome {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  // 参照与加厚口径由 gauntlet 统一给出:玩家按 celestialStats 出手,敌人就必须按同一份生成
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
    ui.toast('先择道途,方可踏天', 'warn')
    return null
  }
  if (endgame.worldRun) {
    ui.toast('已有远征在途,先了结眼前的路', 'warn')
    return null
  }
  const pact = pactId ? pactDef(pactId) : undefined
  const gate = gateId ? gateDef(gateId) : undefined
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
  if (pact) ui.toast(`你与天道立下「${pact.name}」`, 'info')
  if (gate) ui.toast(`你自「${gate.fullName}」入界 —— ${gate.desc}`, 'info')
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
  /** 这一眼看到的胜算(0~1)—— 与实战同一个口径,含携带气血 */
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
 *
 * 「所窥即所打」:算胜算用的规则必须与 fightStep 一模一样 —— 故走同一个
 * withCarriedHp(**含携带气血**)。此前这里只取了 expeditionRules,
 * 于是玩家越残,预览报得越乐观(实测:带六成气血时预览仍说「约有七成胜算」,
 * 而按实战规则只有一成,是「凶多吉少」)。
 * 随机源可注入,自检才能不掷运气地钉住这条口径。
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
  if (foeShape.mods?.dodgeRate) skillLines.push(`身法诡谲,闪避约 ${Math.round(foeShape.mods.dodgeRate * 100)}%`)
  // 实战(在途 run)吃 expeditionRules;出发前(run=null,带 prep)按首战那份规则合成:
  // 道途 × 世界 × 所择契约 × 所择之门 —— 「先算后战」算的就是那一场仗,不是另一场
  const rules =
    world && run
      ? expeditionRules(world, run, node)
      : prep && world
        ? chainRules(currentDaoRules(), world.rules, pactRules(prep.pactId ? pactDef(prep.pactId) : undefined), gateRulesOf(prep.gateId), node?.rules)
        : currentDaoRules()
  // 危险时点:限时 / 杀意渐涨 / 重击预警 / 生机稀薄
  const riskLines: string[] = []
  if (rules?.maxRounds !== undefined) riskLines.push(`天时仅 ${rules.maxRounds} 回合,拖延即败`)
  if (rules?.perRounds) riskLines.push(`每 ${rules.perRounds.interval} 回合敌人杀意渐涨,战局越晚越凶`)
  const heavy = foeShape.skills.find(sk => sk.mult >= 2)
  if (heavy) riskLines.push(`【${heavy.name}】足以重创,留足气血以备不测`)
  if ((rules?.healMult ?? 1) < 0.7) riskLines.push('此地生机稀薄,回血难以为继')
  const snap = run ? runSnap(run) : buildPlayerSnap(true)
  const fightRules = world && run ? withCarriedHp(rules, run) : rules
  const rate = sampleWinRate(snap, foe, rand, 3, fightRules)
  const winText = rate >= 0.9 ? '胜算在握' : rate >= 0.6 ? '约有七成胜算' : rate >= 0.35 ? '五五之数,凶险参半' : '凶多吉少'
  return { skillLines, riskLines, winText, rate }
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
  // 变数连战不属于任何一界:它站在阶梯最深处(与变数天界的锚点同档)
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
  /** 敌人一侧的判定(道之理解 / 境界压制)—— 战前就该看得见,不然玩家只能靠猜 */
  judgementLines: string[]
  /** 六大标准流派中可行的数目(≥35% 通率) */
  viableStyles: number
  /** 当前构筑相性(1~5 星) */
  stars: string
}

/**
 * 整程预估:玩家构筑 + 所选契约,对该世界的线性连战做小样本推演。
 * 只给分档与星级,不给精确数字——信息归玩家,答案也归玩家
 */
export function forecastExpedition(worldId: string, pactId: string | null, gateId: string | null = null): ExpeditionForecast | null {
  const world = resolveWorld(worldId)
  if (!world) return null
  const pact = pactId ? pactDef(pactId) : undefined
  // 预估须与真打同源:择了门就把门也算进去,否则玩家看到的胜算与实战不符
  const rules = chainRules(currentDaoRules(), world.rules, pactRules(pact), gateRulesOf(gateId))
  const opts = pact?.special === 'endHp80' ? { minHpAfterFight: 0.8 } : {}
  const seededRng = new RandomService(mulberry32(worldId.length * 1009 + (pactId?.length ?? 0) * 97 + world.name.length * 7))

  // 玩家构筑:含孤剑/逆命的快照修饰,敌人按玩家等比生成
  const player = usePlayerStore()
  // 预估与实战同源:同一份参照、同一个加厚系数(见 celestialFoeCaliber 的注释)
  const { ref: pRef, judgement: pJudgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, world.anchorTier)
  let snap = buildPlayerSnap(true)
  if (pact?.special === 'soloArtifact') snap = { ...snap, artifacts: (snap.artifacts ?? []).slice(0, 1) }
  if (pact?.special === 'sealCore') {
    const sealed = sealCoreMods()
    if (sealed) snap = { ...snap, mods: stackedMods(snap.mods, sealed, 1) }
  }
  const playerFoes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) playerFoes.push(worldFoeSnap(world.foes[i % world.foes.length]!, pRef, 1, pJudgement))
  playerFoes.push(worldFoeSnap(world.guardian, pRef, 1, pJudgement))
  let clears = 0
  for (let i = 0; i < 8; i += 1) {
    if (runGauntlet(snap, playerFoes, rules, world.healBetweenPct, seededRng, opts).cleared) clears += 1
  }
  const pRate = clears / 8

  /**
   * 六大标准流派的可行数(标准模拟空间)。
   *
   * 参照取 SIM_REFERENCE —— 这一项比的是**构筑形状**(同一份三维下,哪些流派打得动),
   * 不是绝对强度,故不走本界锚点。但判定要照实战口径算:厚构筑会被道之理解加厚,
   * 少了它,厚流派在这一栏会被高估。
   */
  let viableStyles = 0
  for (const profile of BUILD_PROFILES) {
    const styleSnap = buildSnap(profile)
    const styleJudgement = celestialJudgement(styleSnap.mods, MAX_MAJOR, world.anchorTier)
    const simFoes: CombatantSnap[] = []
    for (let i = 0; i < world.fights - 1; i += 1)
      simFoes.push(worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE, 1, styleJudgement))
    simFoes.push(worldFoeSnap(world.guardian, SIM_REFERENCE, 1, styleJudgement))
    let wins = 0
    for (let i = 0; i < 5; i += 1) {
      if (runGauntlet(styleSnap, simFoes, rules, world.healBetweenPct, seededRng, opts).cleared) wins += 1
    }
    if (wins / 5 >= 0.4) viableStyles += 1
  }

  const starN = pRate >= 0.85 ? 5 : pRate >= 0.6 ? 4 : pRate >= 0.4 ? 3 : pRate >= 0.15 ? 2 : 1
  return {
    difficulty: pRate >= 0.85 ? '胜券在望' : pRate >= 0.6 ? '略占上风' : pRate >= 0.4 ? '胜负各半' : pRate >= 0.15 ? '凶险' : '九死一生',
    judgementLines: celestialJudgementLines(player.celestialStats.mods, player.major, world.anchorTier),
    viableStyles,
    stars: '★'.repeat(starN) + '☆'.repeat(5 - starN)
  }
}

