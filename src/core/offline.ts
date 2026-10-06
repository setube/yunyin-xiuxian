/**
 * 离线结算 —— 「归来」系统
 * 与在线 Tick 共用同一套公式,按封顶时长折算收益
 */
import type { EventDef, OfflineSummary } from '@/types'
import { add, gn, gnZero, isZero, mulN, sub } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { offlineAgeNote } from '@/ui/offlineText'
import { breakthroughReadyNote } from '@/ui/cultivationText'
import { rng } from '@/utils/random'
import { regionDef } from '@/data/regions'
import { enemyDef } from '@/data/enemies'
import {
  AGE_YEARS_PER_HOUR,
  BATTLE_EXP_SECS,
  EQUIP_DROP_CHANCE,
  EXPLORE_BATTLE_INTERVAL,
  PAGE_DROP_CHANCE,
  EXPLORE_BOSS_AFTER_WINS,
  EXPLORE_MODES,
  INSTANT_EXP_LAYER_CAP,
  OFFLINE_BOSS_REWARD_MULT,
  OFFLINE_EFFICIENCY,
  OFFLINE_MODAL_MIN_SECONDS
} from '@/data/constants'
import { makeEnemySnap, resolveCombat, sampleWinRate } from './combat'
import { buildPlayerSnap } from './playerSnap'
import { generateEquipment } from './equipGen'
import { onAcquire, acquireEquipment, afterWin } from './loot'
import { autoResolveEvent, regionEventPoolFor } from './eventEngine'
import { clearRegionAndUnlockNext, exploreEventChance, dangerFactorFor, explorationRules } from './exploration'
import { currentRegionEvent, regionEventDef } from './regionEvent'
import { placeContent } from './mortalWorldService'
import { expFromSecs, stoneByTier } from './formulas'
import { breakthroughInfo } from './breakthrough'
import { settleSuppressedRegions } from './suppress'
import { harvestMaterials, studyTick } from './loreService'
import { modOf } from './statsCalc'
import { personalityEffects } from './petPersonality'
import { track } from './progress'
import { equipmentTemplate } from '@/data/equipment'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useGameStore } from '@/stores/game'
import { useLoreStore } from '@/stores/lore'
import { useUiStore } from '@/stores/ui'
import { useInventoryStore } from '@/stores/inventory'
import { useQuestsStore } from '@/stores/quests'
import { useEndgameStore } from '@/stores/endgame'
import { useLoadoutsStore } from '@/stores/loadouts'
import { useSettingsStore } from '@/stores/settings'
import { useDiagStore } from '@/stores/diag'
import { usePacingTelemetry } from '@/stores/pacingTelemetry'

/**
 * 离线事件兜底池:世界标签不命中公共事件池时的默认通用际遇。
 * 一律取无代价、可幂等自动结算的 general 事件(在线在绝大多数字段地界也能遇到)。
 */
const DEFAULT_OFFLINE_EVENT_IDS = ['ev_spring', 'ev_herb_garden', 'ev_night_talk', 'ev_falling_star', 'ev_old_man']

/**
 * 在线有取舍的事件效果类(身份/永久构筑):离线的自动结算**不得替玩家拍板**。
 * 灵兽认主(pet)、习得功法(gongfa)、收下法宝(artifact)、加寿元(lifespan)
 * 在线都默许玩家亲手取舍 —— 缺席几小时回来发现灵兽/功法/古宝变了,比少拿点收益难受得多。
 * 放行的是与默认通用池同族的:资源/修为/材料/丹药/装备/时效 buff(offlineScope 红线段言里
 * 唯一受保护的是玩家分片,这里按「无拍板后果」一刀切,连法宝这类收进囊中的也不替做)。
 */
const OFFLINE_SAFE_EFFECTS = new Set(['stone', 'exp', 'material', 'equipment', 'pill', 'buff', 'nothing'])
function isOfflineSafeEvent(ev: EventDef): boolean {
  return ev.choices.every(c => c.outcomes.every(o => o.effects.every(e => OFFLINE_SAFE_EFFECTS.has(e.type))))
}

/**
 * 结算离线收益
 * @param nowMs 当前时间戳
 */
export function settleOffline(nowMs: number): OfflineSummary | null {
  const game = useGameStore()
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const dongfu = useDongfuStore()
  const cultivation = useCultivationStore()
  const adventure = useAdventureStore()
  const endgameStore = useEndgameStore()
  const ui = useUiStore()

  if (!game.started || player.dead) return null
  const dtSec = Math.max(0, (nowMs - game.lastActiveAt) / 1000)
  if (dtSec < 1) return null

  const capSec = Math.min(dtSec, dongfu.offlineCapHours * 3600)
  const effSec = capSec * OFFLINE_EFFICIENCY
  const notes: string[] = []
  const equipmentGained: OfflineSummary['equipment'] = []
  /** 离线期间化尘所得的器灵尘(自动回收/满包化尘/腾位化掉的旧件) */
  let recycledDust = 0
  let evicted = 0
  /*
   * 离线期间的每一次装备入账(历练掉落、镇压产出、际遇奖励)都记进这一本账。
   * 从前各条路各记一笔:际遇奖励的装备从没进过归来卷轴;腾位时只看 bagged,
   * 被挤掉的旧件化出的尘与件数都漏报。入包的件带 uid(归来卷轴点开看详情),化尘的不带。
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

  // ---- 修炼 ----
  const expBefore = { ...player.exp }
  player.gainExp(mulN(gn(player.cultPerSec), effSec))

  // ---- 灵气 ----
  const qiBefore = resources.qi
  resources.setQi(resources.qi + player.qiRegenPerSec * effSec, player.qiCapValue)

  // ---- 建筑产出 ----
  const herbBefore = resources.herb
  const oreBefore = resources.ore
  const wudaoBefore = resources.wudao
  dongfu.produce(effSec)

  // ---- 藏经阁被动钻研(与在线同源,只是 dt 不同) ----
  studyTick(effSec)

  // ---- 镇压区域被动收益(豁免离线效率折扣,是统治该区域的补偿;但仍受洞府离线上限约束) ----
  // 之前误传完整 dtSec:镇压收益绕过 mansion 离线封顶,洞府离线等级对"镇压力"玩家几乎失效。
  // 折扣豁免只豁免 0.9 效率,不平白豁免洞府离线上限本身
  const suppressYield = settleSuppressedRegions(capSec)
  if (suppressYield && !isZero(suppressYield.stone)) {
    const extra = suppressYield.resources.map(r => `${r.name} +${r.amount}`).join(' · ')
    notes.push(`镇压诸域仍有余韵:灵石 +${formatGN(suppressYield.stone)}${extra ? ` · ${extra}` : ''}`)
  }

  // ---- 历练挂机 ----
  let battles = 0
  let wins = 0
  let events = 0
  const stoneBefore = { ...resources.spiritStone }
  const session = adventure.session
  /**
   * 挂机期间这趟历练的所得(灵石/修为/实物)。
   *
   * 折进会话总账 —— 玩家挂了一夜再回来接着打时,战斗页上的「本次所得」不该把离线段漏掉。
   * 离线本来就按期望值整段结算,这里记的也是同一份数(不是另算一套)。
   */
  const trip = { stone: gnZero(), exp: gnZero(), items: 0 }
  if (session) {
    const region = regionDef(session.regionId)
    if (region) {
      const modeDef = EXPLORE_MODES[session.mode]
      // 与在线同源:灵兽性格 × 区域事件(妖潮)修正危险,普通战与首领战共用——
      // 从前离线两处都漏,「好战更易走险路 / 谨慎避祸」离线毫无作用
      const petDangerMult = personalityEffects(player.petId).dangerMult
      // 与在线同源:区域事件(妖潮/古墓/商队)同时改两件事 —— 危险(dangerMult)与加丰(rewardMult)。
      // 危险侧此前已接进离线;奖励侧漏了的话,事件就只剩「更难」没有「更丰」——
      // 在线 afterWin 每次取胜都乘 rewardMult,离线这里读同一份 regionEventDef,一次读两用
      const regEvent = currentRegionEvent(region.id)
      const regionEventDanger = regEvent ? (regionEventDef(regEvent.eventId)?.dangerMult ?? 1) : 1
      const regionEventReward = regEvent ? (regionEventDef(regEvent.eventId)?.rewardMult ?? 1) : 1
      const remainSec = Math.max(0, (session.endsAt - (nowMs - dtSec * 1000)) / 1000)
      const simSec = Math.min(capSec, remainSec)
      const mods = player.finalStats.mods
      const speed = 1 + modOf(mods, 'explorationSpeed')
      const encounters = Math.floor((simSec / EXPLORE_BATTLE_INTERVAL) * speed)
      // 与在线同源:同一个 exploreEventChance(含今日星象之利)——
      // 从前离线漏了星象,同一天同一地会比在线少算一成际遇
      events = Math.round(encounters * exploreEventChance(region.id, mods))
      battles = Math.max(0, encounters - events)

      if (battles > 0) {
        // 与在线同源:敌群取自本世路线节点
        const mobId = rng.pick([...placeContent(region.id).enemies])
        const mobDef = enemyDef(mobId)
        const dangerFactor = dangerFactorFor(modeDef.dangerMult, region.danger, petDangerMult, regionEventDanger)
        // 与在线同源:道途规则 × 本世逆旅契(explorationRules)一并生效——
        // 从前离线只带 currentDaoRules,四张逆旅契的加难在本世最大时段里落空
        const winRate = mobDef
          ? sampleWinRate(buildPlayerSnap(), makeEnemySnap(mobDef, region.tier, dangerFactor), rng, 3, explorationRules())
          : 0.3
        wins = Math.round(battles * winRate)

        // 灵石与修为 —— 与在线 afterWin 同源:取胜奖励乘区域事件加丰倍率(rewardMult)
        // 福缘(doubleDropRate)也同源:在线每战掷一次翻倍、期望 ×(1+p);
        // 离线按期望值计入(doubleMult),与 winRate 的期望结算一致,词条不再对离线失效
        const doubleMult = 1 + Math.min(1, Math.max(0, modOf(mods, 'doubleDropRate')))
        const stoneGain = stoneByTier(
          region.tier,
          10 * wins * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'spiritStoneGain')) * doubleMult
        )
        resources.addStone(stoneGain)
        /**
         * 修为与在线 afterWin 同源(同一把尺子、同一个结算函数):
         * 秒数与层上限一并随场数线性放大,故「N 场」恒等于「N 次单场」——
         * 离线不会偷跑,也不会因为整段结算而被封顶吃掉(见 formulas.expFromSecs)。
         */
        const expGain = expFromSecs(
          player.expReq,
          BATTLE_EXP_SECS * wins * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'expGain')) * doubleMult,
          player.cultPerSec,
          INSTANT_EXP_LAYER_CAP * wins
        )
        player.gainExp(expGain)
        trip.stone = add(trip.stone, stoneGain)
        trip.exp = add(trip.exp, expGain)
        // 材料 —— 离线也会撞见新灵材,只是次数封顶,免得回来一屏 toast
        const herbGain = Math.round(wins * 1.0 * doubleMult)
        const oreGain = Math.round(wins * 0.5 * doubleMult)
        resources.addSmall('herb', herbGain)
        resources.addSmall('ore', oreGain)
        harvestMaterials(region.tier, 'herb', herbGain)
        harvestMaterials(region.tier, 'ore', oreGain)
        // 残页与在线同源:在线判 rng.chance(PAGE_DROP_CHANCE * rewardMult),出 n=1..2(均值1.5),
        // rewardMult 参数 = mode×reg —— 离线按其期望整段结算,0.15 是写死的旧值(漏了模式倍率)
        resources.addSmall('page', Math.round(wins * PAGE_DROP_CHANCE * 1.5 * modeDef.rewardMult * regionEventReward * doubleMult))
        resources.addSmall('dust', Math.round(wins * 0.3 * doubleMult))
        // 装备:最多实际生成 6 件,其余折算为器灵尘(掉落数与在线同源,乘模式倍率 × 事件加丰 × 福缘 ——
        // 在线 afterWin 把 mode×regReward 全折进 rewardMult 参数,这里缺了 modeDef.rewardMult,
        // 「进取 / 疾驰」的 +40% / +90% 就对离线装备掉落完全落空,与灵石/修为两行不同源
        const equipCount = Math.round(wins * EQUIP_DROP_CHANCE * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'dropRate')) * doubleMult)
        const realCount = Math.min(6, equipCount)
        for (let i = 0; i < realCount; i += 1) {
          // 灵兽性格同样管离线掉落:贪宝更易稀出,谨慎稍稍寻常(与在线 afterWin 同源)
          const inst = generateEquipment(region.tier, rng, { luck: modOf(mods, 'luck') + personalityEffects(player.petId).dropLuck })
          // 入账清单、化尘与腾位由开头订阅的那本账统一记(onAcquire)
          acquireEquipment(inst, { quiet: true })
        }
        trip.items += realCount
        if (equipCount > realCount) {
          resources.addSmall('dust', (equipCount - realCount) * 4)
          notes.push(`另有 ${equipCount - realCount} 件寻常之物,已折作器灵尘`)
        }
        if (wins < battles) {
          notes.push(`有 ${battles - wins} 战失利,幸而全身而退`)
        }
        track('kills', wins)
        track('battles', battles)
      }
      // 事件按默认选项自动结算
      const evCap = Math.min(events, 40)
      // 与在线同源:事件也取自本世路线节点(regionEventPoolFor 尊重世界标签/境界门槛/once),
      // 敌群早就走 placeContent 了,事件不能再用硬编码通用池另算一套。
      // 机缘/奇缘那类带代价选择的不做离线替选(在线可拒,离线不能替玩家拍板),
      // 故不用 pickEventFor 的完整分支;空池时兜底默认通用际遇
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
      // 事件只实际结算了 evCap 个;events 此前按全程估算,超额部分只是"路上料到"、
      // 并非真实经历。总结与旅途记录若按全量上报,玩家会看到「际会 3456 次」
      // 而实际只结算了 40 次——把 count 收敛为真实经历再写进 summary 与 session
      events = evCap
      // 离线自动挑战区域首领(收益折损,胜则连锁解锁;门槛与在线一致,避免离线早一步解锁下一区)
      // 门槛与在线同源(EXPLORE_BOSS_AFTER_WINS):两处各写一个 10,改一处就抢跑解锁
      if (!adventure.cleared.includes(region.id) && wins >= EXPLORE_BOSS_AFTER_WINS) {
        const bossDef = enemyDef(placeContent(region.id).boss)
        if (bossDef) {
          const bossDanger = dangerFactorFor(modeDef.dangerMult, region.danger, petDangerMult, regionEventDanger)
          const bossResult = resolveCombat(buildPlayerSnap(), makeEnemySnap(bossDef, region.tier, bossDanger), rng, explorationRules())
          if (bossResult.win) {
            // 首领战奖励同样并入事件加丰倍率(在线 boss 也是 mode×regReward,离线再叠收益折损)
            const drops = afterWin(region, modeDef.rewardMult * OFFLINE_BOSS_REWARD_MULT * regionEventReward, true)
            trip.stone = add(trip.stone, drops.stone)
            trip.exp = add(trip.exp, drops.exp)
            trip.items += drops.items
            track('kills')
            track('bossKills')
            clearRegionAndUnlockNext(region.id)
            notes.push(`挂单之间,你已将【${bossDef.name}】斩于剑下(离线战果,收益折损)`)
          } else {
            notes.push(`曾遭遇区域之主【${bossDef.name}】,惜败而退,需再蓄力`)
          }
        }
      }
      // 会话推进
      if (simSec >= remainSec) {
        adventure.setSession(null)
        track('explores')
        notes.push(`${region.name}之行圆满结束`)
      } else {
        adventure.setSession({
          ...session,
          wins: session.wins + wins,
          events: session.events + events,
          // 挂机所得计入这趟总账(与在线同一份会话字段,回来接着打的数才是整趟的数)
          stoneGain: add(session.stoneGain, trip.stone),
          expGain: add(session.expGain, trip.exp),
          itemGain: session.itemGain + trip.items,
          // 与在线 nextBattleTime 同源:速度加成要除以 speed,否则恢复后首战被拖慢一拍
          nextBattleAt: nowMs + (EXPLORE_BATTLE_INTERVAL * 1000) / speed
        })
      }
    }
  }

  // ---- 寿元流逝(不受离线上限约束) ----
  const ageBefore = player.age
  player.addAge((dtSec / 3600) * AGE_YEARS_PER_HOUR)

  // ---- Buff 过期 ----
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
    ore: resources.ore - oreBefore,
    wudao: resources.wudao - wudaoBefore,
    ageYears: Math.round(player.age - ageBefore),
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

  /**
   * 在途的一次性内容**原样冻结** —— 这一点玩家看不见,得说一句。
   *
   * 秘境与远征都不会在缺席期间偷偷推进(见 offlineScope.spec:离线只动 exp/age/bond),
   * 但玩家回来只看到一屏资源,很容易以为「我不在的时候那趟远征是不是黄了」。
   * 故凡有在途内容,归来卷轴上就明说一句:它还等着你。
   */
  const inFlight = player as unknown as { secretRealm?: unknown }
  if (inFlight.secretRealm) notes.push('秘境之行原样留着 —— 层数、气血与规则都未变,回来接着走')
  if (endgameStore.worldRun) notes.push('那趟远征仍在途 —— 层数与战绩原样留着,回来接着走')

  if (dtSec >= OFFLINE_MODAL_MIN_SECONDS) {
    track('offlineClaims')
    ui.offlineSummary = summary
  }
  return summary
}

/**
 * 读档兜底:把各 store 的形状修回可用值。
 *
 * 从前只有 player/resources/lore/dongfu 四处 —— 其余八个分片若被写坏,
 * 会在**渲染期**抛出(如 cultivation.gongfaBranch 为 null 时的 Object.entries),
 * 玩家看到的是白屏。见 storeResilience.spec:逐个字段灌 undefined 的红线。
 *
 * 清单覆盖**所有**持久化分片(PERSISTED_STORES,见 utils/storage.ts)——
 * 曾漏了 pacing:它的 sanitize 定义了但没人调,record() 里 events.slice(-119)
 * 在 events 被写坏(null / 非数组)时照样抛错。这里与其余分片一视同仁地修平。
 */
export function sanitizeOfflineInputs(): void {
  usePlayerStore().sanitize()
  useResourcesStore().sanitize()
  useLoreStore().sanitize()
  useDongfuStore().sanitize() // 洞府等级非法会把离线封顶小时算成 NaN,收益全线 NaN
  useCultivationStore().sanitize()
  useInventoryStore().sanitize()
  useQuestsStore().sanitize()
  useAdventureStore().sanitize()
  useEndgameStore().sanitize()
  useLoadoutsStore().sanitize()
  useSettingsStore().sanitize()
  useGameStore().sanitize()
  useDiagStore().sanitize()
  usePacingTelemetry().sanitize() // 遥测分片也落盘,坏档一样要修平(见 pacingTelemetry.sanitize)
}
