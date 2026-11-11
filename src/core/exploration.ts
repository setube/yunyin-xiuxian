/** 历练服务 —— 历练会话 / 遭遇循环 / 战斗与事件调度 */
import type { AdventureSession, CombatRules, ExploreMode, FoeOrigin, RegionDef } from '@/types'
import { rng } from '@/utils/random'
import { add, gnZero } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { sessionRecordText } from '@/ui/adventureText'
import { enemyLoreView } from '@/ui/enemyLore'
import { enemyDef } from '@/data/enemies'
import { beastIcon } from '@/data/beastFamilies'
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
import { applyCombatRuleSnap, makeEnemySnap, mortalFoeOriginFromParts, resolveCombat, snapPower } from './combat'
import { petDef } from '@/data/pets'
import type { RegionEventId } from './regionEvent'
import { mergeRules } from './gauntlet'
import { lifeTrialRules } from './lifeTrialService'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules } from './endgameService'
import { afterWin } from './loot'
import { autoResolveEvent, pickEventFor } from './eventEngine'
import { eventTierDef, eventTierOf } from './eventTier'
import { capChance, modOf } from './statsCalc'
import { track } from './progress'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore, type LastBattleView } from '@/stores/adventure'
import { useCultivationStore } from '@/stores/cultivation'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useEndgameStore } from '@/stores/endgame'
import { checkSuppression, memorialLine, suppressRateLine, MEMORIAL_CHANCE } from './suppress'
import { recordLoss, isNemesis, markAvenged, ghostOf, ghostTitle, ghostLeadIn, ECHO_GHOST_CHANCE, NEMESIS_THRESHOLD, regionRecallFor } from './worldMemory'
import { personalityEffects } from './petPersonality'
// earlyGameService(连胜)与 worldMemory(宿敌)各有一个 recordLoss,连胜那份走别名以免遮蔽
import { recordWin as recordStreakWin, recordLoss as recordStreakLoss, isRetreating } from './earlyGameService'
import { currentRegionEvent, regionEventDef, rollRegionEvent } from './regionEvent'
import { BUSY_REASON, endgameBusy } from './endgameActivity'
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
 * 界面按钮须与此共用 mortalWorldService.canEnterRegion;另按 adventure.unlocked 算会让按钮亮着却进不去。
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
  // 闭关与历练双向互斥(另一半在 startRetreat)
  if (isRetreating()) {
    ui.toast(BUSY_REASON.retreat, 'warn')
    return false
  }
  // 拒绝须有 toast,不得静默 return false
  if (adventure.session) {
    ui.toast(BUSY_REASON.exploration, 'warn')
    return false
  }
  if (player.secretRealm) {
    ui.toast(BUSY_REASON.secretRealm, 'warn')
    return false
  }
  // 远征在途不许开历练;判据与拒因取 endgameBusy,不手抄。
  // 只传 worldRun:历练会话已在上方单独拒绝。
  const busy = endgameBusy(useEndgameStore().worldRun, null, null)
  if (busy) {
    ui.toast(busy.reason, 'warn')
    return false
  }
  if (!routeAllows(regionId)) {
    ui.toast(entryBlockReason(regionId) ?? `${region.name}未解锁`, 'warn')
    return false
  }
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
  ui.toast(`前往${region.name} · ${modeDef.name}`, 'info')
  // 出发时低频判定区域事件(妖潮等,30~120 分钟)
  const ev = rollRegionEvent(region)
  if (ev) {
    const def = regionEventDef(ev.eventId)
    ui.toast(`${region.name} · ${def?.name ?? '异象'}`, 'warn')
  }
  // 区域凭吊
  if (player.suppressedRegions.includes(region.id) && rng.chance(MEMORIAL_CHANCE)) {
    const line = memorialLine(region.id, player)
    if (line) ui.toast(line, 'info')
  }
  return true
}

export function stopExploration(reason: 'manual' | 'defeat' | 'complete' | 'retreat'): void {
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
  // 战绩须报胜、负两本账
  const record = sessionRecordText(s)
  const haul = `灵石 +${formatGN(s.stoneGain)} · 修为 +${formatGN(s.expGain)}${
    s.itemGain > 0 ? ` · 拾获 ${s.itemGain} 件` : ''
  }`
  if (reason === 'complete') {
    ui.toast(`${region?.name ?? ''}历练完成 · ${record} · 际遇 ${s.events} 次 · ${haul}`, 'success')
  } else if (reason === 'defeat') {
    ui.toast(`重伤 · 历练中断 · ${record} · ${haul}`, 'warn')
  } else if (reason === 'retreat') {
    ui.toast(`敌遁走 · 历练中断 · ${record} · ${haul}`, 'info')
  } else {
    ui.toast(`历练结束 · ${record} · ${haul}`, 'info')
  }
}

/**
 * 战斗危险因子:在线/离线唯一实现,禁内联复刻。
 * 历练模式倍率 × 地域差值 × 灵兽性格 × 区域事件(无事件为 1)。
 */
export function dangerFactorFor(
  modeDangerMult: number,
  regionDanger: number,
  petDangerMult: number,
  eventDanger: number
): number {
  return modeDangerMult * (1 + (regionDanger - 1) * 0.05) * petDangerMult * eventDanger
}

/** 本场敌人加成逐项摊开(出行方式 / 地界凶险 / 灵兽之性 / 区域事件);总数走 dangerFactorFor */
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

/** 选地卡片上的敌情:只含与出行方式无关的部分(层级补偿、地界凶险、区域事件) */
export function regionFoeOrigin(region: RegionDef): FoeOrigin {
  const ev = currentRegionEvent(region.id)
  const evDef = ev ? regionEventDef(ev.eventId) : undefined
  return mortalFoeOriginFromParts(region.tier, [
    { label: '地界凶险', ratio: 1 + (region.danger - 1) * 0.05 },
    { label: evDef?.name ?? '区域事件', ratio: evDef?.dangerMult ?? 1 }
  ])
}

/**
 * 历练战斗规则:道途规则 × 本世逆旅契。在线/离线唯一实现;
 * 离线只带 currentDaoRules 会漏掉逆旅契。
 */
export function explorationRules(): CombatRules | undefined {
  return mergeRules(currentDaoRules(), lifeTrialRules())
}

/**
 * 距挑战区域之主还差几胜;界面提示与 runBattle 的首领判定共用,界面不得另写门槛。
 * @returns null = 此地之主已被击败;0 = 下一战即是首领
 */
export function winsUntilRegionBoss(wins: number, cleared: boolean): number | null {
  if (cleared) return null
  return Math.max(0, EXPLORE_BOSS_AFTER_WINS - wins)
}

/**
 * 区域之主是否已靖;界面提示与 runBattle 的首领判定共用。
 * 路线内区域看本世节点(mortalCleared),路线外(老档兼容)才看旧 REGIONS cleared 链;
 * 按旧链判会让旧档首领永不出、路线永不前进。
 * 妖气复聚(core/regionRevival → adventure.markRevived)刻意不动 mortalCleared(canEnterNode 靠它判后续路段),
 * 故须先问 revived:归来的地界判未靖。
 */
export function regionBossCleared(regionId: string): boolean {
  const adventure = useAdventureStore()
  if (adventure.revived.includes(regionId)) return false
  const routeNode = adventure.mortalWorld?.chain.find(p => p.fromId === regionId)
  return routeNode ? adventure.mortalCleared.includes(routeNode.nodeId) : adventure.cleared.includes(regionId)
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

  const bossCleared = regionBossCleared(region.id)
  const bossDue = winsUntilRegionBoss(s.wins, bossCleared) === 0
  // 敌群与首领取自本世路线节点,不取 REGIONS
  const content = placeContent(region.id)
  const eDefId = bossDue ? content.boss : rng.pick([...content.enemies])
  const eDef = enemyDef(eDefId)
  if (!eDef) return

  // 宿敌残魂:已雪耻宿敌低概率以历史形态再现(纯叙事)
  let ghostLead = ''
  const ghost = rng.chance(ECHO_GHOST_CHANCE) ? ghostOf(player.nemeses, eDef.id) : null
  if (ghost) {
    ghostLead = ghostLeadIn(ghost)
    useUiStore().toast(ghostLead, 'info')
  }

  const regEv = currentRegionEvent(region.id)
  // 危险因子与来源说明一次算出,不得两处各乘一遍
  const { total: dangerFactor, origin: foeOrigin } = explorationFoeDanger({
    tier: region.tier,
    mode: s.mode,
    regionDanger: region.danger,
    petId: player.petId,
    eventId: regEv?.eventId ?? null
  })
  const pSnap = buildPlayerSnap()
  const eSnap = makeEnemySnap(eDef, region.tier, dangerFactor, foeOrigin)
  const rules = explorationRules()
  // 卡片「敌 X · 我 Y」取开打那一刻的有效快照,与 resolveCombat 同一份 applyCombatRuleSnap;
  // 只随在线战报走,离线归来卷轴另有口径
  const { pEff, eEff } = applyCombatRuleSnap(pSnap, eSnap, rules)
  const enemyPower = snapPower(eEff)
  const playerPower = snapPower(pEff)
  // 须在 noteEnemy 入账前取,否则首战也算「眼熟」
  const foeKnown = (enemyLoreView(eDef.id)?.stage ?? 0) >= 1
  const result = resolveCombat(pSnap, eSnap, rng, rules)
  // 「独行」之誓看是否祭出法宝,不看是否持有
  if (useInventoryStore().equippedArtifacts.length > 0) noteTaboo('artifact')

  maybeEncounter(s.regionId)
  // 关系事件:首胜之后「刀下」,濒死「重伤」
  if (result.win) {
    if (s.wins === 0) offerBondEvent('firstVictory')
  } else {
    offerBondEvent('nearDeath')
  }
  const view: LastBattleView = {
    enemyName: ghost ? ghostTitle(ghost) : eDef.name,
    enemyIcon: beastIcon(eDef.family),
    enemyId: eDef.id,
    isBoss: Boolean(eDef.isBoss),
    enemyPower,
    playerPower,
    foeKnown,
    result,
    at: now
  }
  adventure.recordBattle(view)
  track('battles')
  // 交过手即记认知,随转世保留
  noteEnemy(eDef.id, result.win)

  if (result.win) {
    track('kills')
    // 连胜:3/5/10 档发奖(见 earlyGameService.recordWin)
    recordStreakWin()
    const regReward = regEv ? (regionEventDef(regEv.eventId)?.rewardMult ?? 1) : 1
    const drops = afterWin(region, modeDef.rewardMult * regReward, Boolean(eDef.isBoss))
    adventure.recordBattle({ ...view, loot: drops.lines })
    // 会话账目取 afterWin 的真实入账,不得按层级另算(会漏福缘、区域事件与首领倍率)
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

    const damageTakenPct = 1 - result.playerHpPct
    const ui = useUiStore()
    player.updateRegionStats(region.id, result.win, result.rounds, damageTakenPct)
    player.recordRegionWin(region.id)
    // 镇压资格永久;首次达成自动转为收益态,此后由玩家开关(见 AdventureView)
    const suppressed = checkSuppression(player, region.id)
    if (suppressed && !player.suppressQualified.includes(region.id)) {
      player.markSuppressQualified(region.id)
      player.suppressRegion(region.id)
      ui.toast(`已镇压${region.name} · ${suppressRateLine(region.id, regionRecallFor(region.id).prosperity)}`, 'rare')
    }

    if (isNemesis(player.nemeses, eDef.id)) {
      player.setNemeses(markAvenged(player.nemeses, eDef.id, now))
      ui.toast(`【雪耻】宿敌${eDef.name}`, 'rare')
    }
  } else {
    // 回合耗尽而遁走(双方都未死)不是败亡:不重伤、不计宿敌败绩
    const ui = useUiStore()
    const timeout = result.playerHpPct > 0
    // 灵兽护主:仅身死时低概率触发
    if (!timeout && rng.chance(personalityEffects(player.petId).lossReduction)) {
      adventure.setSession({ ...s, nextBattleAt: nextBattleTime(now) })
      ui.toast('灵兽护主 · 历练继续', 'info')
      return
    }
    if (!timeout) cultivation.addBuff('injury', now)
    adventure.setSession({ ...s, losses: s.losses + 1 })

    // 非胜即清连胜(遁走也清)
    recordStreakLoss()
    // 败北达阈值标记宿敌(遁走不计)
    if (!timeout) {
      const { list, becameNemesis } = recordLoss(player.nemeses, eDef.id, eDef.name, region.id, now)
      player.setNemeses(list)
      if (becameNemesis) {
        ui.toast(`【宿敌】${eDef.name} · 败北${NEMESIS_THRESHOLD}次`, 'warn')
      }
    }
    stopExploration(timeout ? 'retreat' : 'defeat')
  }
}

/** 一次遭遇里相遇的概率 */
const MEET_CHANCE = 0.06

/** 途中相遇:候选者偏好的地貌须在本世路线上。只推进关系,不发放任何东西 */
function maybeEncounter(regionId: string): void {
  const player = usePlayerStore()
  const w = useAdventureStore().mortalWorld
  if (!w) return
  const bond = player.bond
  if (bond) {
    // 已相识:缘分与信任增长,契合另算
    if (!bond.fallen && rng.chance(MEET_CHANCE)) {
      advanceBond({ fate: 3, trust: 2, shared: true })
      sparkIntent('shared')
    }
    // 不等情境位
    speakIntent()
    return
  }
  if (!rng.chance(MEET_CHANCE)) return
  const terrains = w.chain.map(p => terrainOf(p.fromId))
  // 宿缘优先:上一世走得深的人有机会再遇,不保证
  const destined = destinedCandidate(player.reincarnation.bonds, terrains)
  const pool = destined ? [destined] : candidatesFor(terrains)
  if (pool.length === 0) return
  const here = regionDef(regionId)
  // 同地貌者优先在此照面
  const local = here ? pool.filter(d => d.terrains.length === 0 || d.terrains.includes(terrainOf(regionId))) : pool
  const pick = (local.length > 0 ? local : pool)[rng.int(0, (local.length > 0 ? local : pool).length - 1)]!
  meet(pick.id)
}

/** 标记区域首领已清并连锁解锁后续区域(在线/离线共用) */
export function clearRegionAndUnlockNext(regionId: string): void {
  const adventure = useAdventureStore()
  const ui = useUiStore()
  // 旧链记账与连锁解锁只在首次清时做;已清(如旧档全解锁)不重播
  if (adventure.markCleared(regionId)) {
    const region = regionDef(regionId)
    ui.toast(`已击败${region?.name ?? ''}之主`, 'rare')
    offerBondEvent('bossDefeated')
    if (rng.chance(0.5)) sparkIntent('omen')
    for (const r of REGIONS) {
      if (r.requireCleared === regionId && adventure.unlock(r.id)) {
        ui.toast(`新地开放:${r.name}`, 'rare')
      }
    }
  }
  // 本世路线推进不受旧链是否已清影响;放进 markCleared 分支会让旧档全清处的路线锁死
  const nextPlace = advanceRoute(regionId)
  if (nextPlace) ui.toast(`前路已开:${nextPlace}`, 'rare')
}

function nextBattleTime(now: number): number {
  const player = usePlayerStore()
  return now + exploreBattleGapSec(modOf(player.finalStats.mods, 'explorationSpeed')) * 1000
}

/** 本程实际时长:灵兽之性改时长,历练遇敌不改;出发按钮与 startExploration 共用 */
export function exploreDurationSec(mode: ExploreMode, petId: string | null): number {
  return Math.round(EXPLORE_MODES[mode].durationSec * personalityEffects(petId).exploreDurMult)
}

/** 两场遭遇的间隔(秒);explorationSpeed 只收紧这一截,不缩短整程 */
export function exploreBattleGapSec(explorationSpeed: number): number {
  const speed = 1 + Math.max(0, explorationSpeed)
  return (EXPLORE_BATTLE_INTERVAL * 1000) / speed / 1000
}

/** 取胜收益倍率:档位 × 当前区域事件 */
export function exploreRewardMult(mode: ExploreMode, eventId: RegionEventId | null): number {
  const extra = eventId ? (regionEventDef(eventId)?.rewardMult ?? 1) : 1
  return EXPLORE_MODES[mode].rewardMult * extra
}

/** 一次遭遇出际遇的概率;在线 Tick、离线结算、预览共用这一处(astronomy.spec 钉在线/离线同源) */
export function exploreEventChance(regionId: string, mods: StatMods): number {
  // 区域事件的际遇率修正须真算,不能只写在 desc 里
  const ev = currentRegionEvent(regionId)
  const eventMult = ev ? (regionEventDef(ev.eventId)?.eventMult ?? 1) : 1
  // 钳到 [0, 1]:离线按 `Math.round(encounters * p)` 折算事件数,
  // p > 1 结算出比遭遇还多的事件,p < 0 则会让 `battles = encounters - events` 反而变大。
  // 正常满配约 0.86(词条 60% 上限 × 6 槽 + 洞府 10% + 区域 1.5 倍),只有多轮回堆叠/负加成才越界。
  return capChance(EXPLORE_EVENT_CHANCE * (1 + modOf(mods, 'eventLuck') + mansionEventLuck(regionId)) * eventMult)
}

/** 每 Tick 推进历练(由引擎调用) */
export function tickExploration(now: number): void {
  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const s = adventure.session
  if (!s || player.dead) return

  // 待处理事件:阻塞战斗;超时自动按默认选项处理
  if (adventure.pendingEventId) {
    /*
     * 起钟晚于此刻 = 系统时钟被往回拨过(或坏档写了未来值;读档那道夹到此刻
     * 管不到运行期)。此时 `now - since` 恒为负,超时判据永不成立 ——
     * 事件一直挂着、战斗一直停着,玩家要等到真实时间追平才能脱身。
     * 运行期遇到就把起钟重锚到此刻,让超时窗口从这一刻重新起算。
     */
    if (adventure.pendingEventSince > now) adventure.setPendingEvent(adventure.pendingEventId, now)
    if (now - adventure.pendingEventSince > EVENT_AUTO_RESOLVE_SECONDS * 1000) {
      const region = regionDef(s.regionId)
      const res = autoResolveEvent(adventure.pendingEventId, region?.tier ?? 1)
      // 自动结算的所得须 toast,不得无声入账
      if (res && res.lines.length) useUiStore().toast(res.lines.join('、'), 'info')
      else if (res?.outcomeText) useUiStore().toast(res.outcomeText, 'info')
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
      // 事件标签取本世内容
      const ev = pickEventFor({ ...region, eventTags: [...placeContent(region.id).eventTags] })
      if (ev && useSettingsStore().dndEvents) {
        // 遇事勿扰:不弹窗,按超时同一条路(默认好愿)当场结清
        const res = autoResolveEvent(ev.id, region.tier)
        if (res && res.lines.length) useUiStore().toast(res.lines.join('、'), 'info')
        else if (res?.outcomeText) useUiStore().toast(res.outcomeText, 'info')
        const cur = adventure.session
        if (cur) adventure.setSession({ ...cur, events: cur.events + 1, nextBattleAt: nextBattleTime(now) })
        return
      }
      if (ev) {
        adventure.setPendingEvent(ev.id, now)
        // 机缘与奇缘另报档名;判据取自 core/eventTier,不在此另写
        const tier = eventTierDef(eventTierOf(ev.id))
        if (tier.id === 'jiyuan') useUiStore().toast(`机缘「${ev.title}」`, 'rare')
        else if (tier.id === 'qiyuan') useUiStore().toast(`奇缘「${ev.title}」`, 'info')
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
