/**
 * 短期秘境服务(Phase 31.0 S3 · Phase 34.9 接上玩法)
 *
 * 结构:进入(付入口代价)→ 随机规则 1~2 条 → 三层 → 最终宝藏。
 * 复用 resolveCombat / makeEnemySnap / stoneByTier / generateEquipment,不建新数值体系。
 *
 * 本轮之前这里只有骨架:定义了状态与目录,却没有任何入口 ——
 * 玩家进不去,player.secretRealm 永远是 null,而轮回清单还在交代它的去留。
 */
import type { CombatantSnap, CombatRules, GNum } from '@/types'
import type { WorldFoeShape } from '@/types'
import { formatGN } from '@/utils/format'
import { rng } from '@/utils/random'
import { ENEMIES, enemyDef } from '@/data/enemies'
import { beastIcon } from '@/data/beastFamilies'
import { maxTierForMajor } from '@/data/regions'
import { SECRET_LAYERS, SECRET_MAX_LOSSES, SECRET_REALMS, SECRET_RULES, secretRealmDef, type SecretRealmDef } from '@/data/secretRealms'
import { resolveCombat } from './combat'
import { mergeRules, worldFoeSnap } from './gauntlet'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules } from './endgameService'
import { stoneByTier } from './formulas'
import { generateEquipment } from './equipGen'
import { acquireEquipment } from './loot'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { useEndgameStore } from '@/stores/endgame'

export interface SecretRealmState {
  /** 秘境定义 id */
  realmId: string
  /** 进入时刻 */
  enteredAt: number
  /** 当前层 1~3 */
  layer: number
  /** 已胜场 */
  wins: number
  /** 已失败次数(失败 2 次强制出) */
  losses: number
  /** 累计战利描述 */
  spoils: string[]
  /** 本趟的随机规则(1~2 条,文本给玩家看、规则给引擎用) */
  rules: string[]
  /** 层间携带的气血比例 */
  carriedHpPct: number
  /** 结束标记(结束后即清空状态,故仅在一次结算内为真) */
  finished: boolean
}

/**
 * 玩家当前地界层级(入口代价按它折算)。
 * 与装备来源上限是同一件事 —— 同源在数据层,不在这里再筛一遍区域表。
 */
export function tierOfMajor(major: number): number {
  return maxTierForMajor(major)
}

/** 入口代价:凡境按当前层级折算灵石;天界是道源定额 */
export function entryCostOf(def: SecretRealmDef, major: number): { kind: 'stone'; stone: GNum } | { kind: 'daoSource'; daoSource: number } {
  return 'stone' in def.cost
    ? { kind: 'stone', stone: stoneByTier(tierOfMajor(major), def.cost.stone) }
    : { kind: 'daoSource', daoSource: def.cost.daoSource }
}

/** 代价的可读文案(界面直接用,不另写一份) */
export function entryCostText(def: SecretRealmDef, major: number): string {
  const c = entryCostOf(def, major)
  return c.kind === 'stone' ? `灵石 ${formatGN(c.stone)}` : `道源 ${c.daoSource}`
}

/** 该册是否已开:至少有一处够格可入(凡境册元婴起,天界册真仙起) */
export function realmUnlock(gate: SecretRealmDef['gate'] = 'mortal'): boolean {
  const player = usePlayerStore()
  return SECRET_REALMS.some(r => r.gate === gate && player.major >= r.minMajor)
}

/** 该册里可以进的秘境(未达门槛的不列出) */
export function availableRealms(gate: SecretRealmDef['gate'] = 'mortal'): SecretRealmDef[] {
  const player = usePlayerStore()
  return SECRET_REALMS.filter(r => r.gate === gate && player.major >= r.minMajor)
}

/** 当前秘境(无则 null) */
export function currentRealm(): SecretRealmState | null {
  return usePlayerStore().secretRealm
}

export interface EnterResult {
  ok: boolean
  reason?: string
}

/** 进秘境:验门槛、付代价(灵石或道源)、掷规则、落状态 */
export function enterSecretRealm(defId: string): EnterResult {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const def = secretRealmDef(defId)
  if (!def) return { ok: false, reason: '此境不存在' }
  if (player.major < def.minMajor) return { ok: false, reason: `${def.name}需更高境界` }
  if (player.secretRealm) return { ok: false, reason: '已在秘境之中' }
  const cost = entryCostOf(def, player.major)
  if (cost.kind === 'stone') {
    if (!resources.hasStone(cost.stone)) {
      ui.toast(`灵石不足 ${formatGN(cost.stone)}`, 'warn')
      return { ok: false, reason: '灵石不足' }
    }
    resources.spendStone(cost.stone)
  } else {
    if (!endgame.spendDaoSource(cost.daoSource)) {
      ui.toast(`道源不足 ${cost.daoSource}`, 'warn')
      return { ok: false, reason: '道源不足' }
    }
  }
  // 随机规则 1~2 条,不重复
  const n = rng.int(1, 2)
  const pool = [...SECRET_RULES]
  const texts: string[] = []
  while (texts.length < n && pool.length > 0) {
    const pick = pool.splice(rng.int(0, pool.length - 1), 1)[0]!
    texts.push(pick.text)
  }
  player.setSecretRealm({
    realmId: def.id,
    enteredAt: Date.now(),
    layer: 1,
    wins: 0,
    losses: 0,
    spoils: [],
    rules: texts,
    carriedHpPct: 1,
    finished: false
  })
  return { ok: true }
}

/** 本趟生效的战斗规则:道途 + 秘境自带 + 随机规则(+ 层级递进的凶险) */
export function secretFightRules(state: SecretRealmState, layer = state.layer): CombatRules {
  const def = secretRealmDef(state.realmId)
  const rolled = state.rules
    .map(text => SECRET_RULES.find(r => r.text === text)?.rules)
    .filter((r): r is CombatRules => !!r)
  const escalation: CombatRules = { enemyAtkMult: 1 + 0.1 * (layer - 1), enemyHpMult: 1 + 0.12 * (layer - 1) }
  const base = mergeRules(currentDaoRules(), def?.rules)
  const withRolled = rolled.reduce<CombatRules | undefined>((acc, cur) => mergeRules(acc, cur), base)
  return mergeRules(withRolled, escalation) ?? {}
}

export interface SecretLayerResult {
  win: boolean
  /** 是否整趟结束(通关或被逐出) */
  finished: boolean
  cleared: boolean
  /** 本层战利/结果描述 */
  lines: string[]
}

/**
 * 本层的敌人 —— **按玩家缩放**,与远征/试炼同法(不是按层级绝对值)。
 *
 * 秘境是一次性副本,和远征/试炼同类;若照地界那样按 tier 绝对值生成,
 * 一个刚飞升、还没来得及换装的真仙会撞上 tier 21 的绝对数值 —— 付了道源,
 * 两场就被逐出。玩家相对口径才谈得上"这是给你的考验",而不是"你换装慢了"。
 *
 * 抽成对外函数是为了可测:用例直接看「敌我比值」,不必跑完整场战斗。
 */
export function secretLayerFoe(state: SecretRealmState, rand: typeof rng = rng): { snap: CombatantSnap; shape: WorldFoeShape } {
  const player = usePlayerStore()
  const tier = tierOfMajor(player.major)
  const pool = ENEMIES.filter(e => e.tier <= tier && e.tier >= Math.max(1, tier - 3))
  const foeDef = pool.length > 0 ? rand.pick(pool) : enemyDef(ENEMIES[0]!.id)!
  const stats = player.finalStats
  const ref = { attack: stats.attack, defense: stats.defense, maxHp: stats.maxHp }
  const shape: WorldFoeShape = {
    name: foeDef.name,
    icon: beastIcon(foeDef.family),
    atkR: foeDef.atkMult,
    defR: foeDef.defMult,
    hpR: foeDef.hpMult,
    speed: foeDef.speed,
    skills: foeDef.skills.map(sk => ({ ...sk })),
    mods: foeDef.mods
  }
  return { snap: worldFoeSnap(shape, ref, 1 + 0.12 * (state.layer - 1)), shape }
}

/**
 * 本层战利:灵石随**层数**与**本境倍率**上浮,材料只随层数。
 *
 * 材料不吃倍率是有意的:倍率是「此地物产丰饶」的说法,若材料也跟着乘,
 * 高倍率境会把材料也顶穿,几条产线的产出结构就拉平了。抽成纯函数是为了可测 ——
 * 用例直接比「同一层级下两境倍率之比」,不必掷运气打完整场。
 */
export function secretLayerReward(tier: number, layer: number, rewardMult: number): { stone: GNum; material: number } {
  return { stone: stoneByTier(tier, (12 + 6 * layer) * rewardMult), material: 2 + layer }
}

/** 打一层 */
export function fightSecretLayer(): SecretLayerResult | null {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const state = player.secretRealm
  if (!state) return null
  const def = secretRealmDef(state.realmId)
  if (!def) return null

  const { snap } = secretLayerFoe(state)
  const tier = tierOfMajor(player.major)
  const playerSnap: CombatantSnap = buildPlayerSnap()
  const rules = { ...secretFightRules(state), playerStartHpPct: state.carriedHpPct }
  const result = resolveCombat(playerSnap, snap, rng, rules)
  const lines: string[] = []

  if (result.win) {
    // 战利:灵石 + 材料,随层数与本境倍率上浮
    const { stone, material: mat } = secretLayerReward(tier, state.layer, def.rewardMult)
    resources.addStone(stone)
    resources.addSmall('herb', mat)
    lines.push(`胜 ${snap.name} · 灵石 +${formatGN(stone)} · 灵草 +${mat}`)
    const nextLayer = state.layer + 1
    if (nextLayer > SECRET_LAYERS) {
      // 通关:最终宝藏
      const inst = generateEquipment(tier, rng, { minQualityRank: 2 })
      lines.push(`破境而出!${acquireEquipment(inst).line}`)
      resources.addSmall('wudao', 3)
      lines.push('悟道点 +3')
      player.setSecretRealm(null)
      ui.toast(`${def.name}已探尽`, 'rare')
      return { win: true, finished: true, cleared: true, lines }
    }
    const carried = Math.min(1, result.playerHpPct + def.healBetweenPct)
    player.setSecretRealm({
      ...state,
      layer: nextLayer,
      wins: state.wins + 1,
      spoils: [...state.spoils, ...lines],
      carriedHpPct: Math.max(0.05, carried)
    })
    return { win: true, finished: false, cleared: false, lines }
  }

  const losses = state.losses + 1
  lines.push(`不敌 ${snap.name} · 气血余 ${Math.round(result.playerHpPct * 100)}%`)
  if (losses >= SECRET_MAX_LOSSES) {
    player.setSecretRealm(null)
    lines.push('连败两场,被逐出秘境')
    ui.toast('你被逐出了秘境', 'warn')
    return { win: false, finished: true, cleared: false, lines }
  }
  player.setSecretRealm({
    ...state,
    losses,
    spoils: [...state.spoils, ...lines],
    carriedHpPct: Math.max(0.05, result.playerHpPct + def.healBetweenPct)
  })
  return { win: false, finished: false, cleared: false, lines }
}

/** 离开秘境(结束/放弃):已得的战利不退 */
export function abandonRealm(): void {
  usePlayerStore().setSecretRealm(null)
}

export { SECRET_LAYERS, SECRET_MAX_LOSSES, SECRET_REALMS, secretRealmDef }
