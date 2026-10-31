/** 离线结算:与在线 Tick 共用同一套公式,按封顶时长折算收益 */
import type { EventDef, NemesisRecord, OfflineSummary } from '@/types'
import { add, gn, gnZero, isZero, mulN, sub } from '@/utils/gnum'
import { formatDuration, formatGN } from '@/utils/format'
import { offlineAgeNote, offlineArtifactNote, offlineBossNoteText } from '@/ui/offlineText'
import { breakthroughReadyNote } from '@/ui/cultivationText'
import { rng } from '@/utils/random'
import { regionDef } from '@/data/regions'
import { HERB_GRADES, herbGradeOfMajor } from '@/data/herbGrades'
import { enemyDef } from '@/data/enemies'
import { buffDef } from '@/data/buffs'
import {
  AGE_YEARS_PER_HOUR,
  BATTLE_EXP_SECS,
  EQUIP_DROP_CHANCE,
  EQUIP_DROP_CHANCE_CAP,
  HERB_DROP_CHANCE,
  ORE_DROP_CHANCE,
  ARTIFACT_DROP_CHANCE,
  PAGE_DROP_CHANCE,
  PILL_DROP_CHANCE,
  EXPLORE_MODES,
  INSTANT_EXP_LAYER_CAP,
  OFFLINE_BOSS_REWARD_MULT,
  OFFLINE_EFFICIENCY,
  OFFLINE_FLAT_DUST_PER_WIN,
  OFFLINE_MODAL_MIN_SECONDS
} from '@/data/constants'
import { makeEnemySnap, resolveCombat, sampleWinRate } from './combat'
import { buildPlayerSnap } from './playerSnap'
import { generateEquipment } from './equipGen'
import { onAcquire, acquireArtifactGain, acquireEquipment, afterWin, randomDropArtifact, randomDropPill } from './loot'
import { STONE_AMT_PER_BATTLE } from './pillValue'
import { avgDustPerDrop } from './economySim'
import { autoResolveEvent, regionEventPoolFor } from './eventEngine'
import {
  clearRegionAndUnlockNext,
  exploreEventChance,
  exploreBattleGapSec,
  regionBossCleared,
  dangerFactorFor,
  explorationRules,
  winsUntilRegionBoss
} from './exploration'
import { currentRegionEvent, regionEventDef } from './regionEvent'
import { placeContent } from './mortalWorldService'
import { expFromSecs, stoneByTier } from './formulas'
import { breakthroughInfo } from './breakthrough'
import { checkSuppression, settleSuppressedRegions, suppressRateLine } from './suppress'
import { gainBondOpportunities } from './daoluService'
import { harvestMaterials, noteEnemy, noteEnemyMany, studyTick } from './loreService'
import { recordLossBatch, isNemesis, markAvenged, regionRecallFor, NEMESIS_THRESHOLD } from './worldMemory'
import { noteTaboo, vowResult } from './samsaraService'
import { modOf, capChance } from './statsCalc'
import { personalityEffects } from './petPersonality'
import { recordWinStreakBatch } from './earlyGameService'
import { streakRewardText } from '@/ui/streakText'
import { collect, track } from './progress'
import { equipmentTemplate } from '@/data/equipment'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useDongfuStore } from '@/stores/dongfu'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { useEndgameStore } from '@/stores/endgame'
import { useApprenticeStore } from '@/stores/apprentice'
import { sanitizeAllStores } from '@/stores/sanitizeAll'
import { apprenticeReturnText } from '@/ui/apprenticeText'

/** 离线事件兜底池(世界标签不命中时用):只放无代价、可幂等自动结算的 general 事件 */
const DEFAULT_OFFLINE_EVENT_IDS = ['ev_spring', 'ev_herb_garden', 'ev_night_talk', 'ev_falling_star', 'ev_old_man']

/** 离线自动结算放行的事件效果;身份/永久构筑类(pet、gongfa、artifact、lifespan)不替玩家拍板 */
const OFFLINE_SAFE_EFFECTS = new Set(['stone', 'exp', 'material', 'equipment', 'pill', 'buff', 'nothing'])
function isOfflineSafeEvent(ev: EventDef): boolean {
  return ev.choices.every(c => c.outcomes.every(o => o.effects.every(e => OFFLINE_SAFE_EFFECTS.has(e.type))))
}

/**
 * 离线单胜材料期望,与在线 afterWin 同源(单源取 drop 常量):herb ×E[1..3]=2,ore ×E[1..2]=1.5,page ×1.5×倍率。
 * dust 为离线独有,在线无此入口。
 */
export function offlineMaterialGain(
  wins: number,
  doubleMult: number,
  rewardMult: number
): { herb: number; ore: number; page: number; dust: number } {
  return {
    herb: Math.round(wins * HERB_DROP_CHANCE * 2 * doubleMult),
    ore: Math.round(wins * ORE_DROP_CHANCE * 1.5 * doubleMult),
    page: Math.round(wins * PAGE_DROP_CHANCE * 1.5 * rewardMult * doubleMult),
    dust: Math.round(wins * OFFLINE_FLAT_DUST_PER_WIN * doubleMult)
  }
}

/** 成宿敌的卷轴行:次数取入账后的实际败绩,离线一整批可一次越过门槛 */
function nemesisNote(list: readonly NemesisRecord[], foe: { id: string; name: string }): string {
  const lossCount = list.find(n => n.enemyId === foe.id)?.lossCount ?? NEMESIS_THRESHOLD
  return `【宿敌】${foe.name} · 败北${lossCount}次`
}

/** 结算离线收益 */
export function settleOffline(nowMs: number): OfflineSummary | null {
  const game = useGameStore()
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const dongfu = useDongfuStore()
  const cultivation = useCultivationStore()
  const adventure = useAdventureStore()
  const endgameStore = useEndgameStore()
  const ui = useUiStore()

  if (!game.started || player.dead) return null
  // 时间戳在未来:系统时钟曾被调快,盖下的戳远在当下之后。
  // 不重锚的话 dtSec 会被下面夹成 0,离线收益从此恒为 0,直到玩家把时钟调回去。
  if (game.lastActiveAt > nowMs) game.lastActiveAt = nowMs
  const dtSec = Math.max(0, (nowMs - game.lastActiveAt) / 1000)
  if (dtSec < 1) return null

  const capSec = Math.min(dtSec, dongfu.offlineCapHours * 3600)
  const effSec = capSec * OFFLINE_EFFICIENCY
  const notes: string[] = []
  const equipmentGained: OfflineSummary['equipment'] = []
  /** 离线化尘所得(自动回收、满包化尘、腾位旧件) */
  let recycledDust = 0
  let evicted = 0
  /*
   * 离线期间每次装备入账(历练掉落、镇压产出、际遇奖励)都记这本账;入包件带 uid,化尘的不带。
   * 腾位不能只看 bagged:被挤掉的旧件化出的尘与件数也要记。
   */
  const stopLedger = onAcquire((inst, res) => {
    equipmentGained.push({
      name: equipmentTemplate(inst.templateId)?.name ?? '未知',
      quality: inst.quality,
      recycled: !res.bagged,
      uid: res.bagged ? inst.uid : undefined
    })
    recycledDust += res.dust
    if (res.evicted) evicted += 1
  })

  // 须在一切产出之前剪掉已过期 buff,否则过期加成对整段离线生效;途中才过期的按整段生效(留档)
  const goneBuffNames = cultivation.buffs
    .filter(b => b.endsAt <= nowMs)
    .map(b => buffDef(b.defId)?.name)
    .filter((n): n is string => n !== undefined)
  cultivation.pruneBuffs(nowMs)
  if (goneBuffNames.length > 0) notes.push(`「${goneBuffNames.join('、')}」已到期`)

  // 收割离线完工的道童(与道童页同走 collectFinished);漏收则归来先转世时 resetForRebirth() 连资材清空
  const reapedApprentices = useApprenticeStore().collectFinished(nowMs, player.major)
  if (reapedApprentices.length > 0) notes.push(apprenticeReturnText(reapedApprentices, player.major))

  const expBefore = { ...player.exp }
  player.gainExp(mulN(gn(player.cultPerSec), effSec))

  const qiBefore = resources.qi
  resources.setQi(resources.qi + player.qiRegenPerSec * effSec, player.qiCapValue)

  const herbBefore = resources.herb
  const herbBeforeByGrade = { ...resources.herbByGrade }
  const oreBefore = resources.ore
  const wudaoBefore = resources.wudao
  dongfu.produce(effSec)

  // 藏经阁被动钻研:与在线同源
  studyTick(effSec)

  // 镇压收益按 capSec 结:豁免 0.9 离线效率,不豁免洞府离线上限
  // 妖气复聚按真实此刻判(两个时刻分开传);收益先结清再复聚,否则复聚在开头就松开、整段收益归零
  const suppressYield = settleSuppressedRegions(capSec, rng, nowMs)
  if (suppressYield && suppressYield.revived.length > 0) {
    // 妖气复聚须写进归来卷轴,不能只靠提示条
    const names = suppressYield.revived.map(id => regionDef(id)?.name ?? id)
    const head = names.slice(0, 3).join('、')
    const tail = names.length > 3 ? ` 等 ${names.length} 处` : ''
    notes.push(`妖气复聚:${head}${tail}旧主归来`)
  }
  // 镇压松开(只镇压、未靖平的地界复聚)同样写进卷轴
  if (suppressYield && suppressYield.loosened.length > 0) {
    const names = suppressYield.loosened.map(id => regionDef(id)?.name ?? id)
    const head = names.slice(0, 3).join('、')
    const tail = names.length > 3 ? ` 等 ${names.length} 处` : ''
    notes.push(`妖气复聚:${head}${tail}镇压松开 · 资格仍在`)
  }
  if (suppressYield && !isZero(suppressYield.stone)) {
    const extra = suppressYield.resources.map(r => `${r.name} +${r.amount}`).join(' · ')
    const dao = isZero(suppressYield.expGain) ? '' : ` · 道韵修为 +${formatGN(suppressYield.expGain)}`
    notes.push(`镇压收益:灵石 +${formatGN(suppressYield.stone)}${extra ? ` · ${extra}` : ''}${dao}`)
  }

  let battles = 0
  let wins = 0
  let events = 0
  // 计入会话的胜负,与在线 runBattle 同一本账(含首领战)
  // 败场也须记:提前收手的 3 战门槛按胜+负判
  let sessionWins = 0
  let sessionLosses = 0
  const stoneBefore = { ...resources.spiritStone }
  const session = adventure.session
  // 本段历练所得,折进会话总账(与实发同一份数,不另算)
  const trip = { stone: gnZero(), exp: gnZero(), items: 0 }
  if (session) {
    const region = regionDef(session.regionId)
    if (region) {
      const modeDef = EXPLORE_MODES[session.mode]
      // 与在线同源:灵兽性格修正危险,普通战与首领战共用
      const petDangerMult = personalityEffects(player.petId).dangerMult
      // 与在线同源:区域事件同时改危险(dangerMult)与加丰(rewardMult),两侧都须接
      const regEvent = currentRegionEvent(region.id)
      const regionEventDanger = regEvent ? (regionEventDef(regEvent.eventId)?.dangerMult ?? 1) : 1
      const regionEventReward = regEvent ? (regionEventDef(regEvent.eventId)?.rewardMult ?? 1) : 1
      const remainSec = Math.max(0, (session.endsAt - (nowMs - dtSec * 1000)) / 1000)
      const simSec = Math.min(capSec, remainSec)
      const mods = player.finalStats.mods
      // 遇敌间隔与在线同源(exploreBattleGapSec),不内联间隔公式
      const battleGapSec = exploreBattleGapSec(modOf(mods, 'explorationSpeed'))
      const encounters = Math.floor(simSec / battleGapSec)
      // 与在线同源:exploreEventChance(含星象之利)
      events = Math.round(encounters * exploreEventChance(region.id, mods))
      battles = Math.max(0, encounters - events)

      if (battles > 0) {
        // 破题与在线同源:祭着法宝(非仅持有)交手即 noteTaboo('artifact');幂等,整段记一次等价逐场记
        if (inventory.equippedArtifacts.length > 0) {
          const vowBefore = vowResult()
          noteTaboo('artifact')
          // 破题也写进卷轴,不只靠 toast
          if (vowBefore !== 'broken' && vowResult() === 'broken') {
            notes.push('【破题】「独行」')
          }
        }
        // 与在线同源:敌群取自本世路线节点
        const mobId = rng.pick([...placeContent(region.id).enemies])
        const mobDef = enemyDef(mobId)
        const dangerFactor = dangerFactorFor(modeDef.dangerMult, region.danger, petDangerMult, regionEventDanger)
        // 与在线同源:explorationRules(道途规则 × 本世逆旅契)
        const winRate = mobDef
          ? sampleWinRate(buildPlayerSnap(), makeEnemySnap(mobDef, region.tier, dangerFactor), rng, 3, explorationRules())
          : 0.3
        wins = Math.round(battles * winRate)
        sessionWins += wins
        sessionLosses += battles - wins

        // 与在线 afterWin 同源:乘区域加丰;福缘在线每战掷翻倍,离线按期望 ×(1+p) 计入。
        // 每战灵石基准取 loot 同用的 STONE_AMT_PER_BATTLE,不写死数字 —— 改基准时离线会跟着走。
        const doubleMult = 1 + capChance(modOf(mods, 'doubleDropRate'))
        const stoneGain = stoneByTier(
          region.tier,
          STONE_AMT_PER_BATTLE * wins * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'spiritStoneGain')) * doubleMult
        )
        resources.addStone(stoneGain)
        // 修为与在线 afterWin 同走 expFromSecs:秒数与层上限都随场数线性放大,N 场 = N 次单场
        const expGain = expFromSecs(
          player.expReq,
          BATTLE_EXP_SECS * wins * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'expGain')) * doubleMult,
          player.cultPerSec,
          INSTANT_EXP_LAYER_CAP * wins
        )
        player.gainExp(expGain)
        trip.stone = add(trip.stone, stoneGain)
        trip.exp = add(trip.exp, expGain)
        const { herb: herbGain, ore: oreGain, page: pageGain, dust: dustGain } = offlineMaterialGain(
          wins,
          doubleMult,
          modeDef.rewardMult * regionEventReward
        )
        resources.addHerb(herbGradeOfMajor(region.minRealm), herbGain)
        resources.addSmall('ore', oreGain)
        harvestMaterials(region.tier, 'herb', herbGain)
        harvestMaterials(region.tier, 'ore', oreGain)
        resources.addSmall('page', pageGain)
        resources.addSmall('dust', dustGain)
        // 装备:最多生成 6 件,其余折尘;掉落数与在线 afterWin 同源(模式 × 加丰 × 福缘),每场概率同吃 EQUIP_DROP_CHANCE_CAP
        const equipChance = Math.min(
          EQUIP_DROP_CHANCE_CAP,
          EQUIP_DROP_CHANCE * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'dropRate'))
        )
        const equipCount = Math.round(wins * equipChance * doubleMult)
        const realCount = Math.min(6, equipCount)
        for (let i = 0; i < realCount; i += 1) {
          // 灵兽性格同样管掉落,与在线 afterWin 同源
          const inst = generateEquipment(region.tier, rng, { luck: modOf(mods, 'luck') + personalityEffects(player.petId).dropLuck })
          // 入账、化尘、腾位由开头 onAcquire 那本账统一记
          acquireEquipment(inst, { quiet: true })
        }
        trip.items += realCount
        if (equipCount > realCount) {
          // 溢出件折尘对齐在线化尘(salvageOf):按同层均值 avgDustPerDrop(tier),不用固定 4 尘
          const overflowDust = Math.round((equipCount - realCount) * avgDustPerDrop(region.tier))
          resources.addSmall('dust', overflowDust)
          notes.push(`另有 ${equipCount - realCount} 件折作器灵尘`)
        }
        // 丹药与在线 afterWin 同源:概率 × 模式 × 加丰,夹封顶,按期望计;福缘翻倍不作用于丹药
        const pillChance = capChance(PILL_DROP_CHANCE * modeDef.rewardMult * regionEventReward)
        const pillCount = Math.round(wins * pillChance)
        for (let i = 0; i < pillCount; i += 1) {
          const pillId = randomDropPill(player.major)
          if (!pillId) break
          inventory.addPill(pillId, 1)
          collect('pill', pillId)
          trip.items += 1
        }
        if (pillCount > 0) {
          notes.push(`拾得丹药 ${pillCount} 枚`)
        }
        // 法宝与在线 afterWin 同源:ARTIFACT_DROP_CHANCE ×(1+luck),夹封顶,按期望计,福缘翻倍不作用
        // 只入囊、不自动祭上:祭炼由玩家决定
        const artifactChance = capChance(ARTIFACT_DROP_CHANCE * (1 + modOf(mods, 'luck') + personalityEffects(player.petId).dropLuck))
        const artifactCount = Math.round(wins * artifactChance)
        /** 按 defId 聚合:同件只报一行,重复件折悟道点并入(见 offlineArtifactNote) */
        const artifactTally = new Map<string, { name: string; count: number; wudao: number }>()
        for (let i = 0; i < artifactCount; i += 1) {
          const artId = randomDropArtifact(region.tier)
          if (!artId) break
          const gain = acquireArtifactGain(artId, true, false)
          if (!gain) break
          const tallied = artifactTally.get(gain.defId)
          if (tallied) {
            tallied.count += 1
            tallied.wudao += gain.wudao
          } else {
            artifactTally.set(gain.defId, { name: gain.name, count: 1, wudao: gain.wudao })
          }
          trip.items += 1
        }
        if (artifactTally.size > 0) notes.push(offlineArtifactNote([...artifactTally.values()]))
        // 连胜与在线同源(逐场 recordWin/recordLoss):整批按「胜场接上、败场收尾」结算
        for (const reward of recordWinStreakBatch(wins, battles - wins)) {
          notes.push(streakRewardText(reward.streak, reward.stone, reward.wudao))
        }
        // 道侣机会点与在线 offerBondEvent 同源:只记账,不抽事件、不碰缘分/信任/契合
        // 次数按情境封顶(首胜一次 + 败北一次),不随胜场放大
        gainBondOpportunities((wins > 0 ? 1 : 0) + (battles > wins ? 1 : 0))
        track('kills', wins)
        track('battles', battles)
        // 图鉴与区域战绩与在线同口径整段入账:净胜批量入账(见 applyRegionWinBatch),照面胜 +1 / 负 ×ENEMY_LORE_LOSS_WEIGHT
        if (mobId) noteEnemyMany(mobId, wins, battles - wins)
        // 宿敌账与在线 recordLoss 同源,败场整批入账
        if (mobId && mobDef && battles > wins) {
          const { list, becameNemesis } = recordLossBatch(
            player.nemeses,
            mobDef.id,
            mobDef.name,
            region.id,
            nowMs,
            battles - wins
          )
          player.setNemeses(list)
          if (becameNemesis) {
            notes.push(nemesisNote(list, mobDef))
          }
        }
        // 雪耻与在线同源:本段有胜场即算赢过宿敌
        if (mobDef && wins > 0 && isNemesis(player.nemeses, mobDef.id)) {
          player.setNemeses(markAvenged(player.nemeses, mobDef.id, nowMs))
          notes.push(`【雪耻】宿敌${mobDef.name}`)
        }
        if (wins > 0 && mobDef) {
          // 抽一场代表战取回合数/受伤比(与在线 checkSuppression 同一份数据)
          const sampleFight = resolveCombat(
            buildPlayerSnap(),
            makeEnemySnap(mobDef, region.tier, dangerFactor),
            rng,
            explorationRules()
          )
          player.applyRegionWinBatch(
            region.id,
            wins,
            sampleFight.rounds,
            Math.max(0, 1 - sampleFight.playerHpPct)
          )
          if (checkSuppression(player, region.id) && !player.suppressQualified.includes(region.id)) {
            player.markSuppressQualified(region.id)
            player.suppressRegion(region.id)
            // 回执与在线同走 suppressRateLine,普通战/首领战两处同口径
            notes.push(`已镇压${region.name} · ${suppressRateLine(region.id, regionRecallFor(region.id).prosperity)}`)
          }
        }
      }
      // 事件按默认选项自动结算
      const evCap = Math.min(events, 40)
      // 与在线同源:事件取自本世路线节点(regionEventPoolFor);不走 pickEventFor 的机缘/奇缘分支,离线不替玩家拍板
      const worldEventTags = [...placeContent(region.id).eventTags]
      let offlineEventPool = regionEventPoolFor({ ...region, eventTags: worldEventTags })
        .filter(isOfflineSafeEvent)
        .map(ev => ev.id)
      if (offlineEventPool.length === 0) offlineEventPool = DEFAULT_OFFLINE_EVENT_IDS
      for (let i = 0; i < evCap; i += 1) {
        if (adventure.pendingEventId) {
          autoResolveEvent(adventure.pendingEventId, region.tier)
          adventure.setPendingEvent(null, nowMs)
        } else {
          autoResolveEvent(rng.pick(offlineEventPool), region.tier)
        }
      }
      // summary 与 session 只报实际结算的事件数
      events = evCap
      // 离线自动挑战区域首领(收益折损,胜则连锁解锁)
      // 已清按本世路线判(regionBossCleared,与在线同源);门槛数整趟会话胜场(含本段);本段须真交过手
      const bossDue = winsUntilRegionBoss(session.wins + wins, regionBossCleared(region.id)) === 0
      if (bossDue && battles > 0) {
        const bossDef = enemyDef(placeContent(region.id).boss)
        if (bossDef) {
          const bossDanger = dangerFactorFor(modeDef.dangerMult, region.danger, petDangerMult, regionEventDanger)
          const bossResult = resolveCombat(buildPlayerSnap(), makeEnemySnap(bossDef, region.tier, bossDanger), rng, explorationRules(), false)
          noteEnemy(bossDef.id, bossResult.win)
          // 首领战计一场(与在线 runBattle 同一本账,不论胜败);须在奖励结算之后,不重复放大奖励
          track('battles')
          battles += 1
          if (bossResult.win) {
            // 与在线首领同乘 mode×regReward,另叠收益折损
            // 第四参 false:玩家不在场,不自动祭上掉落的法宝(同 autoResolveEvent)
            const drops = afterWin(region, modeDef.rewardMult * OFFLINE_BOSS_REWARD_MULT * regionEventReward, true, false)
            trip.stone = add(trip.stone, drops.stone)
            trip.exp = add(trip.exp, drops.exp)
            trip.items += drops.items
            track('kills')
            track('bossKills')
            wins += 1
            sessionWins += 1
            // 首领胜计入连胜(与在线 runBattle 同一本账)
            for (const reward of recordWinStreakBatch(1, 0)) {
              notes.push(streakRewardText(reward.streak, reward.stone, reward.wudao))
            }
            player.updateRegionStats(region.id, true, bossResult.rounds, Math.max(0, 1 - bossResult.playerHpPct))
            player.recordRegionWin(region.id)
            if (checkSuppression(player, region.id) && !player.suppressQualified.includes(region.id)) {
              player.markSuppressQualified(region.id)
              player.suppressRegion(region.id)
              notes.push(`已镇压${region.name} · ${suppressRateLine(region.id, regionRecallFor(region.id).prosperity)}`)
            }
            clearRegionAndUnlockNext(region.id)
            notes.push(offlineBossNoteText(bossDef.name))
            // 首领胜同样雪耻(与在线 runBattle 取胜分支同源)
            if (isNemesis(player.nemeses, bossDef.id)) {
              player.setNemeses(markAvenged(player.nemeses, bossDef.id, nowMs))
              notes.push(`【雪耻】宿敌${bossDef.name}`)
            }
          } else {
            sessionLosses += 1
            // 首领败连胜归零(与在线同源)
            recordWinStreakBatch(0, 1)
            // 首领败北记宿敌账(与在线同源)
            const { list, becameNemesis } = recordLossBatch(
              player.nemeses,
              bossDef.id,
              bossDef.name,
              region.id,
              nowMs,
              1
            )
            player.setNemeses(list)
            if (becameNemesis) {
              notes.push(nemesisNote(list, bossDef))
            }
            notes.push(`败于【${bossDef.name}】`)
          }
        }
      }
      if (simSec >= remainSec) {
        adventure.setSession(null)
        track('explores')
        notes.push(`${region.name}历练完成`)
      } else {
        adventure.setSession({
          ...session,
          wins: session.wins + sessionWins,
          losses: session.losses + sessionLosses,
          events: session.events + events,
          stoneGain: add(session.stoneGain, trip.stone),
          expGain: add(session.expGain, trip.exp),
          itemGain: session.itemGain + trip.items,
          // 与在线 nextBattleTime 同源
          nextBattleAt: nowMs + battleGapSec * 1000
        })
      }
    }
  }

  // 寿元流逝不受离线上限约束
  const ageBefore = player.age
  player.addAge((dtSec / 3600) * AGE_YEARS_PER_HOUR)

  cultivation.pruneBuffs(nowMs)

  stopLedger()
  const summary: OfflineSummary = {
    seconds: dtSec,
    cappedSeconds: capSec,
    capped: dtSec > capSec + 1,
    exp: sub(player.exp, expBefore),
    stone: sub(resources.spiritStone, stoneBefore),
    qi: Math.round(resources.qi - qiBefore),
    herb: resources.herb - herbBefore,
    // 逐品净增(仅列 >0):灵田可产高一档,不能按单品报
    herbByGrade: HERB_GRADES.map(g => ({
      grade: g,
      amount: resources.herbOf(g) - (herbBeforeByGrade[g] ?? 0)
    })).filter(e => e.amount > 0),
    ore: resources.ore - oreBefore,
    wudao: resources.wudao - wudaoBefore,
    ageYears: Math.floor(player.age - ageBefore),
    battles,
    wins,
    events,
    equipment: equipmentGained,
    recycledDust,
    evicted,
    notes
  }
  if (player.expFull && !player.atMaxRealm) notes.push(breakthroughReadyNote(breakthroughInfo().needTribulation))
  if (summary.ageYears > 0) notes.push(offlineAgeNote(summary.ageYears))

  // 秘境与远征离线原样冻结(见 offlineScope.spec),在途时卷轴写明
  if (player.secretRealm) notes.push('身在秘境 · 原样保留')
  if (endgameStore.worldRun) notes.push('远征在途 · 原样保留')
  // 历练会话仍在途时报剩余时长
  // 判据看会话自身剩余,不用 dtSec > capSec 代理:离线时长恰等于上限时它判假
  if (adventure.session) {
    const left = Math.max(0, (adventure.session.endsAt - nowMs) / 1000)
    if (left > 0) {
      notes.push(`历练在途 · 尚余 ${formatDuration(left)}`)
    }
  }

  if (dtSec >= OFFLINE_MODAL_MIN_SECONDS) {
    track('offlineClaims')
    ui.offlineSummary = summary
  }
  return summary
}

/** 读档兜底:修平全部持久化分片(PERSISTED_STORES,见 utils/storage.ts)的形状;spec 钉:storeResilience.spec */
export function sanitizeOfflineInputs(): void {
  sanitizeAllStores()
}
