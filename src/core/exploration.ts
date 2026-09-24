/**
 * 历练服务 —— 历练会话 / 遭遇循环 / 战斗与事件调度
 */
import type { AdventureSession, CombatRules, ExploreMode, FoeOrigin, RegionDef } from '@/types'
import { rng } from '@/utils/random'
import { add, gnZero } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { enemyDef } from '@/data/enemies'
import { regionDef, REGIONS } from '@/data/regions'
import {
  EVENT_AUTO_RESOLVE_SECONDS,
  EXPLORE_BATTLE_INTERVAL,
  EXPLORE_BOSS_AFTER_WINS,
  EXPLORE_EVENT_CHANCE,
  EXPLORE_MODES
} from '@/data/constants'
import { mansionEventLuck } from './astronomy'
import type { StatMods } from '@/types'
import { makeEnemySnap, mortalFoeOriginFromParts, resolveCombat } from './combat'
import { petDef } from '@/data/pets'
import type { RegionEventId } from './regionEvent'
import { mergeRules } from './gauntlet'
import { lifeTrialRules } from './lifeTrialService'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules } from './endgameService'
import { afterWin } from './loot'
import { autoResolveEvent, pickEventFor } from './eventEngine'
import { eventTierDef, eventTierOf } from './eventTier'
import { modOf } from './statsCalc'
import { track } from './progress'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import type { LastBattleView } from '@/stores/adventure'
import { useCultivationStore } from '@/stores/cultivation'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { checkSuppression, memorialLine, MEMORIAL_CHANCE } from './suppress'
import { recordLoss, isNemesis, markAvenged, ghostOf, ghostTitle, ghostLeadIn, ECHO_GHOST_CHANCE } from './worldMemory'
import { personalityEffects } from './petPersonality'
// 连胜与宿敌各有一个 recordLoss,一个管连胜清空、一个管宿敌(败北阈值):
// 前者来自 Phase 28 前期玩法(earlyGameService),后者来自世界记忆(worldMemory),
// 这里都走别名,免得互相遮蔽
import { recordWin as recordStreakWin, recordLoss as recordStreakLoss, isRetreating } from './earlyGameService'
import { currentRegionEvent, regionEventDef, rollRegionEvent } from './regionEvent'
import { noteEnemy } from './loreService'
import { noteTaboo } from './samsaraService'
import { useInventoryStore } from '@/stores/inventory'
import { advanceRoute, canEnterRegion, entryBlockReason, placeContent } from './mortalWorldService'
import { terrainOf } from './mortalIdentity'
import {
  advanceBond,
  candidatesFor,
  destinedCandidate,
  meet,
  offerBondEvent,
  sparkIntent,
  speakIntent
} from './daoluService'

/**
 * 该区域这一世能否进入。
 *
 * 判据本体已收进 mortalWorldService.canEnterRegion —— 界面按钮与这里
 * 必须共用同一个谓词。曾经界面自己按 adventure.unlocked 算了一套,
 * 于是路线上未轮到的地界按钮亮着却进不来(玩家反馈「显示了进入按钮
 * 但依旧进不去」)。判据只留一份,分叉才不会重来
 */
function routeAllows(regionId: string): boolean {
  return canEnterRegion(regionId)
}

export function startExploration(regionId: string, mode: ExploreMode): boolean {
  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const region = regionDef(regionId)
  if (!region || player.dead) return false
  // Phase 28 闭关禁令:闭关期间不得外出历练(与 startRetreat 的互斥守卫配对,双向互斥)
  if (isRetreating()) {
    ui.toast('你正在闭关静修,心无旁骛,暂勿外出历练', 'warn')
    return false
  }
  // 拒绝必须让玩家看见 —— 静默 return false 在界面上等同于「点了没反应」
  if (adventure.session) {
    ui.toast('你正在历练途中,先了结眼下这一程', 'warn')
    return false
  }
  if (!routeAllows(regionId)) {
    ui.toast(entryBlockReason(regionId) ?? `${region.name}此时去不得`, 'warn')
    return false
  }
  // 踏入一处新地界 —— 眼前是没走过的路,她可能有话要说
  offerBondEvent('enterPlace')
  const now = Date.now()
  const modeDef = EXPLORE_MODES[mode]
  const durationSec = exploreDurationSec(mode, player.petId)
  const session: AdventureSession = {
    regionId,
    mode,
    startedAt: now,
    endsAt: now + durationSec * 1000,
    nextBattleAt: now + exploreBattleGapSec(modOf(player.finalStats.mods, 'explorationSpeed')) * 1000,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: gnZero(),
    expGain: gnZero(),
    itemGain: 0
  }
  adventure.setSession(session)
  ui.toast(`你动身前往${region.name},开始${modeDef.name}`, 'info')
  // Phase 31 A2:出发时低频判定区域事件(妖潮等,30~120 分钟)
  const ev = rollRegionEvent(region)
  if (ev) {
    const def = regionEventDef(ev.eventId)
    ui.toast(`${region.name}风云突变——${def?.name ?? '异象'}!`, 'warn')
  }
  // Phase 31.4 区域凭吊:重访已镇压之地,低概率世界说起你的旧事
  if (player.suppressedRegions.includes(region.id) && rng.chance(MEMORIAL_CHANCE)) {
    const line = memorialLine(region.id, player)
    if (line) ui.toast(line, 'info')
  }
  return true
}

export function stopExploration(reason: 'manual' | 'defeat' | 'complete'): void {
  const adventure = useAdventureStore()
  const ui = useUiStore()
  const s = adventure.session
  if (!s) return
  const region = regionDef(s.regionId)
  adventure.setSession(null)
  adventure.setPendingEvent(null, 0)
  if (s.wins + s.losses >= 3 || reason === 'complete') {
    track('explores')
  }
  // 总结带上这一趟的实际所得(会话账目即 afterWin 的真实入账):只说胜场与际遇,
  // 玩家还得自己去翻行囊才知道赚没赚
  const haul = `得灵石 ${formatGN(s.stoneGain)}、修为 ${formatGN(s.expGain)}${
    s.itemGain > 0 ? `、拾获 ${s.itemGain} 件` : ''
  }`
  if (reason === 'complete') {
    ui.toast(`此行${region?.name ?? ''}历练圆满,胜 ${s.wins} 场,际遇 ${s.events} 次;${haul}`, 'success')
  } else if (reason === 'defeat') {
    ui.toast(`你身负重伤,不得不中断历练归来疗伤;此行${haul}`, 'warn')
  } else {
    ui.toast(`你收拾行囊,提前结束了这次历练;此行${haul}`, 'info')
  }
}

/**
 * 战斗危险因子 —— 在线/离线唯一实现(HYP-015:同源,禁内联复刻)。
 *   base        = 历练模式倍率(normal 1 / deep 1.45 / risky 2.1)
 *   地域差值    = 1 + (region.danger - 1) × 0.05(层级越险,敌越强)
 *   灵兽性格    = petEff.dangerMult(好战 1.15 更高,谨慎 0.95 更低)
 *   区域事件    = regEventDanger(妖潮更险),无事件为 1
 * 四者相乘。离线曾漏后两项 —— 灵兽「好战/谨慎」与妖潮离线毫无作用。
 */
export function dangerFactorFor(
  modeDangerMult: number,
  regionDanger: number,
  petDangerMult: number,
  eventDanger: number
): number {
  return modeDangerMult * (1 + (regionDanger - 1) * 0.05) * petDangerMult * eventDanger
}

/**
 * 这一场敌人的加成**逐项摊开** —— 与 dangerFactorFor 同一批输入、同一份乘法,
 * 只是把「危地」这个笼统的数还给它的四项来源:出行方式 / 地界凶险 / 灵兽之性 / 区域事件。
 *
 * 总数未必等于玩家在界面上一眼看懂的东西:一个 ×1.45 的「深入探寻」与
 * 一个 ×1.45 的「妖潮」是两件事,前者能改(换寻常游历),后者只能等。
 */
export function explorationFoeDanger(o: {
  tier: number
  mode: ExploreMode
  regionDanger: number
  petId: string | null
  eventId: RegionEventId | null
}): { total: number; origin: FoeOrigin } {
  const modeMult = EXPLORE_MODES[o.mode].dangerMult
  const pet = personalityEffects(o.petId)
  const evDef = o.eventId ? regionEventDef(o.eventId) : undefined
  const eventMult = evDef?.dangerMult ?? 1
  const total = dangerFactorFor(modeMult, o.regionDanger, pet.dangerMult, eventMult)
  const petName = o.petId ? petDef(o.petId)?.name : undefined
  const origin = mortalFoeOriginFromParts(o.tier, [
    { label: EXPLORE_MODES[o.mode].name, ratio: modeMult },
    { label: '地界凶险', ratio: 1 + (o.regionDanger - 1) * 0.05 },
    { label: petName ? `${petName}之性` : '灵兽之性', ratio: pet.dangerMult },
    { label: evDef?.name ?? '区域事件', ratio: eventMult }
  ])
  return { total, origin }
}

/**
 * 选地卡片上的一行敌情 —— 只含**与出行方式无关**的部分:
 * 层级补偿(这一层该有的装备水平)与地界凶险(含当前的区域事件)。
 * 出行方式与灵兽之性等到出行那一刻再摊开(那时玩家才做得了选择)。
 */
export function regionFoeOrigin(region: RegionDef): FoeOrigin {
  const ev = currentRegionEvent(region.id)
  const evDef = ev ? regionEventDef(ev.eventId) : undefined
  return mortalFoeOriginFromParts(region.tier, [
    { label: '地界凶险', ratio: 1 + (region.danger - 1) * 0.05 },
    { label: evDef?.name ?? '区域事件', ratio: evDef?.dangerMult ?? 1 }
  ])
}

/**
 * 历练战斗规则 —— 在线/离线唯一实现(与 dangerFactorFor 同一条判据:HYP-015,
 * 同一件事两处算法必漏一处,抽成一个函数)。道途规则 × 本世逆旅契。
 * 从前只有在线合并逆旅契,离线结算(普通战/boss战)只带 currentDaoRules,
 * 「孤行/疾行/残躯/逆锋」四契的加难在本世最大的时段(离线挂机)里完全不生效。
 */
export function explorationRules(): CombatRules | undefined {
  return mergeRules(currentDaoRules(), lifeTrialRules())
}

/**
 * 距挑战区域之主还差几胜 —— 界面提示与 runBattle 的首领判定共用这一个函数。
 *
 * 从前门槛 10 只写在 runBattle 里,战斗页因此说不出"还差几胜";
 * 若界面自己再写一个 10,调门槛的那一刻提示就会开始撒谎。
 *
 * @returns null = 此地之主已被击败(不再有首领);0 = 下一战即是首领
 */
export function winsUntilRegionBoss(wins: number, cleared: boolean): number | null {
  if (cleared) return null
  return Math.max(0, EXPLORE_BOSS_AFTER_WINS - wins)
}

/** 战斗遭遇(含首领判定) */
function runBattle(now: number): void {
  const adventure = useAdventureStore()
  const cultivation = useCultivationStore()
  const player = usePlayerStore()
  const s = adventure.session
  if (!s) return
  const region = regionDef(s.regionId)
  if (!region) return
  const modeDef = EXPLORE_MODES[s.mode]

  const notCleared = !adventure.cleared.includes(region.id)
  // 每积累 EXPLORE_BOSS_AFTER_WINS 胜,方有资格挑战区域之主(避免开局撞见首领)
  const bossDue = winsUntilRegionBoss(s.wins, !notCleared) === 0
  // 敌群与首领取自**本世路线节点**,不是 REGIONS ——
  // 同一处地界放进不同世界,遇到的就该是不同的东西
  const content = placeContent(region.id)
  const eDefId = bossDue ? content.boss : rng.pick([...content.enemies])
  const eDef = enemyDef(eDefId)
  if (!eDef) return

  // Phase 31.4 宿敌残魂:已雪耻宿敌低概率(3%)以历史形态再现(纯叙事)
  let ghostLead = ''
  const ghost = rng.chance(ECHO_GHOST_CHANCE) ? ghostOf(player.nemeses, eDef.id) : null
  if (ghost) {
    ghostLead = ghostLeadIn(ghost)
    useUiStore().toast(ghostLead, 'info')
  }

  // Phase 31 S4:灵兽性格修正危险(好战更高,谨慎更低)
  const regEv = currentRegionEvent(region.id)
  // 危险因子与它的来源说明书一次算出来:两处各乘一遍,迟早有一个悄悄变了
  const { total: dangerFactor, origin: foeOrigin } = explorationFoeDanger({
    tier: region.tier,
    mode: s.mode,
    regionDanger: region.danger,
    petId: player.petId,
    eventId: regEv?.eventId ?? null
  })
  const pSnap = buildPlayerSnap()
  const eSnap = makeEnemySnap(eDef, region.tier, dangerFactor, foeOrigin)
  // 道途在世,一切战斗皆循此规则
  // 逆旅契:本世签下的契对每一场历练战斗生效(道果的非效率出口)
  const result = resolveCombat(pSnap, eSnap, rng, explorationRules())
  // Phase 32.5:「独行」之誓看的是有没有真的祭出法宝,不是有没有法宝在身
  if (useInventoryStore().equippedArtifacts.length > 0) noteTaboo('artifact')

  maybeEncounter(s.regionId)
  // 战斗情境 → 关系事件:首胜之后是「刀下」,濒死之际是「重伤」
  if (result.win) {
    if (s.wins === 0) offerBondEvent('firstVictory')
  } else {
    offerBondEvent('nearDeath')
  }
  const view: LastBattleView = {
    enemyName: ghost ? ghostTitle(ghost) : eDef.name,
    enemyIcon: eDef.icon,
    enemyId: eDef.id,
    isBoss: Boolean(eDef.isBoss),
    result,
    at: now
  }
  adventure.recordBattle(view)
  track('battles')
  // Phase 32.5:交过手才谈得上认识它 —— 这份认知随神魂转世不灭
  noteEnemy(eDef.id, result.win)

  if (result.win) {
    track('kills')
    // Phase 28 连胜:再下一城,3/5/10 档发放只管奖(见 earlyGameService.recordWin)
    recordStreakWin()
    // Phase 31 A2:区域事件掉落修正(妖潮/古墓/商队更丰)
    const regReward = regEv ? (regionEventDef(regEv.eventId)?.rewardMult ?? 1) : 1
    const drops = afterWin(region, modeDef.rewardMult * regReward, Boolean(eDef.isBoss))
    // 战报带上这一场的掉落明细:线上一向只数件数、把 lines 丢掉,玩家看不到自己得了什么
    adventure.recordBattle({ ...view, loot: drops.lines })
    // 会话账目直接取 afterWin 的**真实入账**(灵石/修为/实物件数),
    // 不再自己按 stoneByTier 另算一份 —— 那份漏了福缘、区域事件与首领倍率,与行囊对不上
    adventure.setSession({
      ...s,
      wins: s.wins + 1,
      stoneGain: add(s.stoneGain, drops.stone),
      expGain: add(s.expGain, drops.exp),
      itemGain: s.itemGain + drops.items,
      nextBattleAt: nextBattleTime(now)
    })
    if (eDef.isBoss) {
      track('bossKills')
      clearRegionAndUnlockNext(region.id)
    }

    // Phase 30: 更新区域统计并判定镇压
    const damageTakenPct = 1 - result.playerHpPct
    const ui = useUiStore()
    player.updateRegionStats(region.id, result.win, result.rounds, damageTakenPct)
    player.recordRegionWin(region.id)
    // 取得镇压资格即永久:「镇压过就不必再镇压」。
    // 首次达成时自动转为收益态;此后收不收收益由玩家自行开关(见 AdventureView 的切换)。
    const suppressed = checkSuppression(player, region.id)
    if (suppressed && !player.suppressQualified.includes(region.id)) {
      player.markSuppressQualified(region.id)
      player.suppressRegion(region.id)
      ui.toast(`你已彻底镇压${region.name},此地将自动产出资源`, 'rare')
    }

    // Phase 30.9 S2: 击中宿敌 → 雪耻
    if (isNemesis(player.nemeses, eDef.id)) {
      player.setNemeses(markAvenged(player.nemeses, eDef.id, now))
      ui.toast(`【雪耻】宿敌${eDef.name}已被斩于剑下!`, 'rare')
    }
  } else {
    // Phase 31 S4:灵兽护主 —— 慢稳/谨慎的灵兽(lossReduction>0)在危急时低概率
    // 护住这一击:免于重伤、不计败绩、历练继续(「失败率下降」落到实处)。
    // 好战型 lossReduction=0,恒不触发,与无灵兽行为一致
    const ui = useUiStore()
    if (rng.chance(personalityEffects(player.petId).lossReduction)) {
      adventure.setSession({ ...s, nextBattleAt: nextBattleTime(now) })
      ui.toast('灵兽机警,替你挡开了这一击,历练继续', 'info')
      return
    }
    cultivation.addBuff('injury', now)
    adventure.setSession({ ...s, losses: s.losses + 1 })

    // Phase 28 连胜:真正的败北清空连胜(灵兽护住的那次不在此列)
    recordStreakLoss()
    // Phase 30.9 S2: 记录败北,达到阈值标记宿敌
    const { list, becameNemesis } = recordLoss(player.nemeses, eDef.id, eDef.name, region.id, now)
    if (becameNemesis) {
      player.setNemeses(list)
      ui.toast(`【宿敌】你已在${eDef.name}手下败北三次——此敌已成你的宿敌!`, 'warn')
    } else {
      player.setNemeses(list)
    }
    stopExploration('defeat')
  }
}

/** 一次历练遭遇里,相遇发生的概率 */
const MEET_CHANCE = 0.06

/**
 * 途中可能遇见一个人。
 *
 * 相遇是**世界里的事**:她偏好的地貌须在这一世的路线上。
 * 世界不同 → 路径不同 → 遇见谁不同 —— 轮回与世界生成由此连上。
 *
 * 注意这里只推进关系,不发放任何东西
 */
function maybeEncounter(regionId: string): void {
  const player = usePlayerStore()
  const w = useAdventureStore().mortalWorld
  if (!w) return
  const bond = player.bond
  if (bond) {
    // 已相识:并肩走过一段险路,缘分与信任增长,契合另算
    if (!bond.fallen && rng.chance(MEET_CHANCE)) {
      advanceBond({ fate: 3, trust: 2, shared: true })
      // 又一次并肩 —— 她心里那件事又近了一点
      sparkIntent('shared')
    }
    // 她想说的时候就说,不必等世界给一个情境位
    speakIntent()
    return
  }
  if (!rng.chance(MEET_CHANCE)) return
  const terrains = w.chain.map(p => terrainOf(p.fromId))
  // 宿缘优先:上一世走得深的人有机会再遇,但绝不保证
  const destined = destinedCandidate(player.reincarnation.bonds, terrains)
  const pool = destined ? [destined] : candidatesFor(terrains)
  if (pool.length === 0) return
  const here = regionDef(regionId)
  // 同地貌的人更可能在此处照面
  const local = here ? pool.filter(d => d.terrains.length === 0 || d.terrains.includes(terrainOf(regionId))) : pool
  const pick = (local.length > 0 ? local : pool)[rng.int(0, (local.length > 0 ? local : pool).length - 1)]!
  meet(pick.id)
}

/** 标记区域首领已清并连锁解锁后续区域(在线/离线共用) */
export function clearRegionAndUnlockNext(regionId: string): void {
  const adventure = useAdventureStore()
  const ui = useUiStore()
  if (!adventure.markCleared(regionId)) return
  const region = regionDef(regionId)
  ui.toast(`你击败了${region?.name ?? ''}之主!`, 'rare')
  // 击破首领 —— 打开了本不该开的地方
  offerBondEvent('bossDefeated')
  // 也可能翻出与她未了之事有关的东西
  if (rng.chance(0.5)) sparkIntent('omen')
  // 本世路线推进:通过这一段,下一段自开
  const nextPlace = advanceRoute(regionId)
  if (nextPlace) ui.toast(`此世前路已明——${nextPlace}`, 'rare')
  for (const r of REGIONS) {
    if (r.requireCleared === regionId && adventure.unlock(r.id)) {
      ui.toast(`新的历练之地已开放——${r.name}`, 'rare')
    }
  }
}

function nextBattleTime(now: number): number {
  const player = usePlayerStore()
  return now + exploreBattleGapSec(modOf(player.finalStats.mods, 'explorationSpeed')) * 1000
}

/** 这一程实际走多久。灵兽之性改时长;历练遇敌不改。出发按钮与 startExploration 共用。 */
export function exploreDurationSec(mode: ExploreMode, petId: string | null): number {
  return Math.round(EXPLORE_MODES[mode].durationSec * personalityEffects(petId).exploreDurMult)
}

/** 两场遭遇的间隔(秒)。explorationSpeed 只收紧这一截,不缩短整程。 */
export function exploreBattleGapSec(explorationSpeed: number): number {
  const speed = 1 + explorationSpeed
  return (EXPLORE_BATTLE_INTERVAL * 1000) / speed / 1000
}

/** 取胜收益倍率:档位 × 当前区域事件。没有事件时就是档位自己。 */
export function exploreRewardMult(mode: ExploreMode, eventId: RegionEventId | null): number {
  const extra = eventId ? (regionEventDef(eventId)?.rewardMult ?? 1) : 1
  return EXPLORE_MODES[mode].rewardMult * extra
}

/**
 * 一次遭遇里出际遇的概率 —— **在线 Tick 与离线结算共用这一份口径**。
 *
 * 从前两边各写一遍:在线加自身福缘,离线也加自身福缘;星象接进来时只改了在线,
 * 于是同一天同一地,离线挂机算出的事件数比在线少一成。故抽成一处,
 * 让"所见即所算"有地方可钉(见 astronomy.spec 的在线/离线同源一条)。
 */
export function exploreEventChance(regionId: string, mods: StatMods): number {
  return EXPLORE_EVENT_CHANCE * (1 + modOf(mods, 'eventLuck') + mansionEventLuck(regionId))
}

/** 每 Tick 推进历练(由引擎调用) */
export function tickExploration(now: number): void {
  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const s = adventure.session
  if (!s || player.dead) return

  // 待处理事件:阻塞战斗;超时自动按默认选项处理
  if (adventure.pendingEventId) {
    if (now - adventure.pendingEventSince > EVENT_AUTO_RESOLVE_SECONDS * 1000) {
      const region = regionDef(s.regionId)
      autoResolveEvent(adventure.pendingEventId, region?.tier ?? 1)
      adventure.setPendingEvent(null, now)
      const cur = adventure.session
      if (cur) adventure.setSession({ ...cur, events: cur.events + 1, nextBattleAt: nextBattleTime(now) })
    }
    return
  }

  if (now >= s.endsAt) {
    stopExploration('complete')
    return
  }

  if (now >= s.nextBattleAt) {
    const region = regionDef(s.regionId)
    if (!region) return
    if (rng.chance(exploreEventChance(region.id, player.finalStats.mods))) {
      // 事件标签同样走本世内容
      const ev = pickEventFor({ ...region, eventTags: [...placeContent(region.id).eventTags] })
      if (ev && useSettingsStore().dndEvents) {
        /*
         * 遇事勿扰(玩家反馈「手动关闭际遇事件触发」)关闭弹窗:
         * 撞见际遇/机缘/奇缘时按超时同一条路(默认好愿)当场结清 ——
         * 奖励照拿、不卡手、也不把这一 Tick 的战斗窗口吞掉。
         */
        autoResolveEvent(ev.id, region.tier)
        const cur = adventure.session
        if (cur) adventure.setSession({ ...cur, events: cur.events + 1, nextBattleAt: nextBattleTime(now) })
        return
      }
      if (ev) {
        adventure.setPendingEvent(ev.id, now)
        /**
         * 三档各报各的名。
         *
         * 弹窗是从「际遇」这个入口弹出来的,机缘与奇缘若不吭声,玩家看到的
         * 就只是又一次寻常遭遇 —— 千分之几的稀有度在体感上等于零。
         * 档名与颜色取自 core/eventTier,不在这里另写一份判据。
         */
        const tier = eventTierDef(eventTierOf(ev.id))
        if (tier.id === 'jiyuan') useUiStore().toast(`千载难逢 —— 机缘「${ev.title}」`, 'rare')
        else if (tier.id === 'qiyuan') useUiStore().toast(`缘分再续 —— 「${ev.title}」`, 'info')
        return
      }
    }
    runBattle(now)
  }
}

/** 玩家在事件弹窗中做出选择后调用 */
export function afterEventResolved(now: number): void {
  const adventure = useAdventureStore()
  adventure.setPendingEvent(null, now)
  const s = adventure.session
  if (s) {
    adventure.setSession({ ...s, events: s.events + 1, nextBattleAt: nextBattleTime(now) })
  }
}
