/**
 * 历练服务 —— 探索会话 / 遭遇循环 / 战斗与事件调度
 */
import type { AdventureSession, ExploreMode } from '@/types'
import { rng } from '@/utils/random'
import { add, gnZero } from '@/utils/gnum'
import { enemyDef } from '@/data/enemies'
import { regionDef, REGIONS } from '@/data/regions'
import { EVENT_AUTO_RESOLVE_SECONDS, EXPLORE_BATTLE_INTERVAL, EXPLORE_EVENT_CHANCE, EXPLORE_MODES } from '@/data/constants'
import { makeEnemySnap, resolveCombat } from './combat'
import { mergeRules } from './gauntlet'
import { lifeTrialRules } from './lifeTrialService'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules } from './endgameService'
import { afterWin } from './loot'
import { autoResolveEvent, pickEventFor } from './eventEngine'
import { modOf } from './statsCalc'
import { track } from './progress'
import { stoneByTier } from './formulas'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useCultivationStore } from '@/stores/cultivation'
import { useUiStore } from '@/stores/ui'
import { checkSuppression, memorialLine, MEMORIAL_CHANCE } from './suppress'
import { recordLoss, isNemesis, markAvenged, ghostOf, ghostTitle, ghostLeadIn, ECHO_GHOST_CHANCE } from './worldMemory'
import { personalityEffects } from './petPersonality'
import { currentRegionEvent, regionEventDef, rollRegionEvent } from './regionEvent'
import { noteEnemy } from './loreService'
import { noteTaboo } from './samsaraService'
import { useInventoryStore } from '@/stores/inventory'
import { advanceRoute, canEnterNode, placeContent } from './mortalWorldService'

/**
 * 该区域这一世能否进入。
 *
 * 有本世之界时**只认路线** —— 必要性审计证明:全解锁的老存档
 * 可以用诸界总览逐个绕开路线上锁着的段,把「本世路线决定本世可达性」
 * 整条绕掉。堵在守卫层而非只藏按钮,绕过路径才真正关闭。
 *
 * 无本世之界(生成失败或极老存档)时退回旧链,保证仍可历练
 */
function routeAllows(regionId: string): boolean {
  const adventure = useAdventureStore()
  const w = adventure.mortalWorld
  const node = w?.chain.find(p => p.fromId === regionId)
  // 在本世路线内:由路线顺序决定
  if (node) return canEnterNode(node.nodeId)
  // 不在路线内:仍走旧解锁链。
  //
  // 曾经这里直接 return false,于是本世之界一旦生成,诸界总览里的
  // 十四处地界全部点不动 —— 玩家反馈「历练没法打了」正是这个。
  // 本世路线是**主线**,不是**唯一入口**:旧地图仍要能走
  return adventure.unlocked.includes(regionId)
}

export function startExploration(regionId: string, mode: ExploreMode): boolean {
  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const region = regionDef(regionId)
  if (!region || player.dead || adventure.session) return false
  // 本世路线决定本世可达性
  if (!routeAllows(regionId)) return false
  const now = Date.now()
  const modeDef = EXPLORE_MODES[mode]
  const speed = 1 + modOf(player.finalStats.mods, 'explorationSpeed')
  // Phase 31 S4:灵兽性格影响探索时长(慢稳更久)
  const petEff = personalityEffects(player.petId)
  const durationSec = Math.round(modeDef.durationSec * petEff.exploreDurMult)
  const session: AdventureSession = {
    regionId,
    mode,
    startedAt: now,
    endsAt: now + durationSec * 1000,
    nextBattleAt: now + (EXPLORE_BATTLE_INTERVAL * 1000) / speed,
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
  if (reason === 'complete') {
    ui.toast(`此行${region?.name ?? ''}历练圆满,胜 ${s.wins} 场,际遇 ${s.events} 次`, 'success')
  } else if (reason === 'defeat') {
    ui.toast('你身负重伤,不得不中断历练归来疗伤', 'warn')
  } else {
    ui.toast('你收拾行囊,提前结束了这次历练', 'info')
  }
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
  // 每积累 10 胜,方有资格挑战区域之主(避免开局撞见首领)
  const bossDue = notCleared && s.wins >= 10
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
  const petEff = personalityEffects(player.petId)
  // Phase 31 A2:区域事件修正危险(妖潮更险)
  const regEv = currentRegionEvent(region.id)
  const regEventDanger = regEv ? (regionEventDef(regEv.eventId)?.dangerMult ?? 1) : 1
  const dangerFactor = modeDef.dangerMult * (1 + (region.danger - 1) * 0.05) * petEff.dangerMult * regEventDanger
  const pSnap = buildPlayerSnap()
  const eSnap = makeEnemySnap(eDef, region.tier, dangerFactor)
  // 道途在世,一切战斗皆循此规则
  // 逆旅契:本世签下的契对每一场历练战斗生效(道果的非效率出口)
  const result = resolveCombat(pSnap, eSnap, rng, mergeRules(currentDaoRules(), lifeTrialRules()))
  // Phase 32.5:「独行」之誓看的是有没有真的祭出法宝,不是有没有法宝在身
  if (useInventoryStore().equippedArtifacts.length > 0) noteTaboo('artifact')

  adventure.recordBattle({
    enemyName: ghost ? ghostTitle(ghost) : eDef.name,
    enemyIcon: eDef.icon,
    enemyId: eDef.id,
    isBoss: Boolean(eDef.isBoss),
    result,
    at: now
  })
  track('battles')
  // Phase 32.5:交过手才谈得上认识它 —— 这份认知随神魂转世不灭
  noteEnemy(eDef.id, result.win)

  if (result.win) {
    track('kills')
    // Phase 31 A2:区域事件掉落修正(妖潮/古墓/商队更丰)
    const regReward = regEv ? (regionEventDef(regEv.eventId)?.rewardMult ?? 1) : 1
    const drops = afterWin(region, modeDef.rewardMult * regReward, Boolean(eDef.isBoss))
    adventure.setSession({
      ...s,
      wins: s.wins + 1,
      stoneGain: add(s.stoneGain, stoneByTier(region.tier, 10 * modeDef.rewardMult)),
      itemGain: s.itemGain + drops.lines.length,
      nextBattleAt: nextBattleTime(now)
    })
    if (eDef.isBoss) {
      track('bossKills')
      clearRegionAndUnlockNext(region.id)
    }

    // Phase 30: 更新区域统计并判定镇压
    const damageTakenPct = result.win ? 1 - result.playerHpPct : 1.0
    const player = usePlayerStore()
    const ui = useUiStore()
    player.updateRegionStats(region.id, result.win, result.rounds, damageTakenPct)
    player.recordRegionWin(region.id)
    const suppressed = checkSuppression(player, region.id)
    if (suppressed) {
      player.suppressRegion(region.id)
      ui.toast(`你已彻底镇压${region.name},此地将自动产出资源`, 'rare')
    }

    // Phase 30.9 S2: 击中宿敌 → 雪耻
    if (isNemesis(player.nemeses, eDef.id)) {
      player.setNemeses(markAvenged(player.nemeses, eDef.id, now))
      ui.toast(`【雪耻】宿敌${eDef.name}已被斩于剑下!`, 'rare')
    }
  } else {
    cultivation.addBuff('injury', now)
    adventure.setSession({ ...s, losses: s.losses + 1 })

    // Phase 30.9 S2: 记录败北,达到阈值标记宿敌
    const player = usePlayerStore()
    const ui = useUiStore()
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

/** 标记区域首领已清并连锁解锁后续区域(在线/离线共用) */
export function clearRegionAndUnlockNext(regionId: string): void {
  const adventure = useAdventureStore()
  const ui = useUiStore()
  if (!adventure.markCleared(regionId)) return
  const region = regionDef(regionId)
  ui.toast(`你击败了${region?.name ?? ''}之主!`, 'rare')
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
  const speed = 1 + modOf(player.finalStats.mods, 'explorationSpeed')
  return now + (EXPLORE_BATTLE_INTERVAL * 1000) / speed
}

/** 每 Tick 推进探索(由引擎调用) */
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
    const eventLuck = modOf(player.finalStats.mods, 'eventLuck')
    if (rng.chance(EXPLORE_EVENT_CHANCE * (1 + eventLuck))) {
      // 事件标签同样走本世内容
      const ev = pickEventFor({ ...region, eventTags: [...placeContent(region.id).eventTags] })
      if (ev) {
        adventure.setPendingEvent(ev.id, now)
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
