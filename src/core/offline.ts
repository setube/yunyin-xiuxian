/**
 * 离线结算 —— 「归来」系统
 * 与在线 Tick 共用同一套公式,按封顶时长折算收益
 */
import type { EventDef, OfflineSummary } from '@/types'
import { add, gn, gnZero, isZero, mulN, sub } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { offlineAgeNote, offlineBossNoteText } from '@/ui/offlineText'
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
  EXPLORE_BATTLE_INTERVAL,
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
import { onAcquire, acquireEquipment, acquireArtifact, afterWin, randomDropArtifact, randomDropPill } from './loot'
import { avgDustPerDrop } from './economySim'
import { autoResolveEvent, regionEventPoolFor } from './eventEngine'
import {
  clearRegionAndUnlockNext,
  exploreEventChance,
  regionBossCleared,
  dangerFactorFor,
  explorationRules,
  winsUntilRegionBoss
} from './exploration'
import { currentRegionEvent, regionEventDef } from './regionEvent'
import { placeContent } from './mortalWorldService'
import { expFromSecs, stoneByTier } from './formulas'
import { breakthroughInfo } from './breakthrough'
import { checkSuppression, settleSuppressedRegions } from './suppress'
import { harvestMaterials, noteEnemy, noteEnemyMany, studyTick } from './loreService'
import { recordLossBatch, isNemesis, markAvenged, NEMESIS_THRESHOLD } from './worldMemory'
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
import { sanitizeAllStores } from '@/stores/sanitizeAll'

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
 * 离线单胜材料均值 —— 与在线 afterWin 同一套期望(单源取 drop 常量,防两处漂移)。
 * herb 在线 = HERB_DROP_CHANCE(0.5)×E[1..3](2);ore = ORE_DROP_CHANCE(0.35)×E[1..2](1.5);
 * page = PAGE_DROP_CHANCE×1.5×倍率。flat dust 是离线独有的便捷值,在线并无此入口(见 dust 注释)。
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

/**
 * 结算离线收益
 * @param nowMs 当前时间戳
 */
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

  // 结算前先清算已过期 buff:离线期 finalStats.mods 会被本段全部产出引用,
  // 若 buff 已过期末清算,已过期的修炼/掉落加成会对整段离线全程生效(在线每 tick 即时清算,
  // 离线单次结算必须在这里先剪枝)。已在当下过期即不再计;恰在途中过期的按整段生效(远轻于全程漏删,留档)。
  // 离开时还挂着的增益若在离线期间已过时效,归来只会看到效果没了、不知缘由(在线已提示,这里同样口径补一句)
  const goneBuffNames = cultivation.buffs
    .filter(b => b.endsAt <= nowMs)
    .map(b => buffDef(b.defId)?.name)
    .filter((n): n is string => n !== undefined)
  cultivation.pruneBuffs(nowMs)
  if (goneBuffNames.length > 0) notes.push(`「${goneBuffNames.join('、')}」已到期`)

  // ---- 修炼 ----
  const expBefore = { ...player.exp }
  player.gainExp(mulN(gn(player.cultPerSec), effSec))

  // ---- 灵气 ----
  const qiBefore = resources.qi
  resources.setQi(resources.qi + player.qiRegenPerSec * effSec, player.qiCapValue)

  // ---- 建筑产出 ----
  const herbBefore = resources.herb
  const herbBeforeByGrade = { ...resources.herbByGrade }
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
  /**
   * 这趟历练记进会话的账(与在线 runBattle 同一本):
   * 普通战按估算的胜负场,首领战胜则再算一场 —— 在线首领战同样计入会话 wins。
   * 从前只写 wins 不写 losses,挂一夜回来「此行胜 2 场」却判不出打过 5 场,
   * 提前收手时连「这趟算不算历练过」的 3 战门槛都过不去。
   */
  let sessionWins = 0
  let sessionLosses = 0
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
      const speed = 1 + Math.max(0, modOf(mods, 'explorationSpeed'))
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
        sessionWins += wins
        sessionLosses += battles - wins

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
        // 材料 —— 离线也会撞见新灵材,只是次数封顶,免得回来一屏 toast。
        // 用与在线同一套期望(offlineMaterialGain,单源取 drop 常量):herb 0.5×2、ore 0.35×1.5、page 0.12×1.5
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
        // 装备:最多实际生成 6 件,其余折算为器灵尘(掉落数与在线同源 ——
        // 在线 afterWin 把 mode×regReward 折进 rewardMult,离线同乘模式倍率 × 事件加丰 × 福缘)。
        // 每场概率同样吃在线那道封顶(EQUIP_DROP_CHANCE_CAP):此前离线期望式不夹取,
        // 长线云游×区域加丰×掉落词条叠过 0.9 时,离线按超顶值计、在线每场封顶,期望分叉。
        const equipChance = Math.min(
          EQUIP_DROP_CHANCE_CAP,
          EQUIP_DROP_CHANCE * modeDef.rewardMult * regionEventReward * (1 + modOf(mods, 'dropRate'))
        )
        const equipCount = Math.round(wins * equipChance * doubleMult)
        const realCount = Math.min(6, equipCount)
        for (let i = 0; i < realCount; i += 1) {
          // 灵兽性格同样管离线掉落:贪宝更易稀出,谨慎稍稍寻常(与在线 afterWin 同源)
          const inst = generateEquipment(region.tier, rng, { luck: modOf(mods, 'luck') + personalityEffects(player.petId).dropLuck })
          // 入账清单、化尘与腾位由开头订阅的那本账统一记(onAcquire)
          acquireEquipment(inst, { quiet: true })
        }
        trip.items += realCount
        if (equipCount > realCount) {
          // 溢出件数本应是「这批新掉落被分解」的尘 —— 与在线 afterWin 同一把尺:
          // 在线每件掉落经 acquireInto→salvageOf 化尘(底材,按品质阶),离线按同层级的
          // 平均分解尘 avgDustPerDrop(tier) 折算(单源取 economySim 的采样口径)。
          // 旧固定 4 尘只在中阶(约 tier 12)碰巧对得上,低阶多发、高阶却少给近一个数量级,
          // 与「离线≈在线 N 场」不变量相背。
          const overflowDust = Math.round((equipCount - realCount) * avgDustPerDrop(region.tier))
          resources.addSmall('dust', overflowDust)
          notes.push(`另有 ${equipCount - realCount} 件寻常之物,已折作器灵尘`)
        }
        // 丹药 —— 补上离线普通战漏掉的掉落通道,与在线 afterWin 同源:
        // 在线每战按 PILL_DROP_CHANCE × 模式 × 区域事件加丰掷一枚(福缘翻倍不作用于丹药,
        // 在线也是掷在 doubled 循环之外);离线首领战后文直接复用 afterWin 因而会掉,
        // 普通战此前却只算石头/修为/材料/装备、独漏丹药,与「离线≈在线 N 场」守恒不符。
        // 单场概率夹在线那道封顶,离线按期望值结算:胜场 × 单场概率即丹药枚数。
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
          notes.push(`途中拾得丹药 ${pillCount} 枚`)
        }
        /**
         * 法宝 —— 与在线 afterWin 同源的最后一条掉落通道。
         *
         * 在线每胜一场按 `ARTIFACT_DROP_CHANCE ×(1+luck)` 掷一次(概率先归到 [0,1]);
         * 离线此前只补了丹药与装备,法宝这一条整段缺席 —— 挂一夜的期望法宝数恒为 0,
         * 而同样时长在线打下来是 `wins × 1.5% × (1+luck)`。
         *
         * 按期望折算成「这一趟出几件」:与丹药同一纪律,福缘翻倍不作用于法宝
         * (在线也掷在 doubled 循环之外);概率同样先夹在线那道封顶。
         * 只入囊、不自动祭上 —— 祭炼由玩家亲手决定(见本世逆命契的同一原则)。
         */
        const artifactChance = capChance(ARTIFACT_DROP_CHANCE * (1 + modOf(mods, 'luck') + personalityEffects(player.petId).dropLuck))
        const artifactCount = Math.round(wins * artifactChance)
        for (let i = 0; i < artifactCount; i += 1) {
          const artId = randomDropArtifact(region.tier)
          if (!artId) break
          const line = acquireArtifact(artId, true, false)
          if (!line) break
          trip.items += 1
          notes.push(`途中拾得${line}`)
        }
        if (wins < battles) {
          notes.push(`有 ${battles - wins} 战失利,幸而全身而退`)
        }
        /**
         * 连胜与在线同源:在线逐场 recordWin/recordLoss,跨过 3/5/10 档即发赏格、
         * 败一场归零。离线整段结算从前完全不碰 `winStreak` —— 挂一夜连胜数字纹丝不动,
         * 赏格也从不发放,战斗页那句「再连胜 N 场可得…」在离线时成了空话。
         * 这里按「胜场接上、败场收尾」的同一顺序整批结算。
         */
        for (const reward of recordWinStreakBatch(wins, battles - wins)) {
          notes.push(`途中${streakRewardText(reward.streak, reward.stone, reward.wudao)}`)
        }
        track('kills', wins)
        track('battles', battles)
        /**
         * 图鉴与区域战绩从前是**在线专属**:离线砍了一夜,归来后敌人认知、
         * 区域统计与镇压进度纹丝不动,历练页和界域志悄悄与账本分叉。
         * 这里按同一套口径整段补写:N 场净胜一次入账(见 applyRegionWinBatch),
         * 照面按胜 +1 / 负 ×ENEMY_LORE_LOSS_WEIGHT 折算。
         */
        if (mobId) noteEnemyMany(mobId, wins, battles - wins)
        /**
         * 宿敌账与在线同源:在线每败一场走一次 `recordLoss`,达到三次即标记宿敌;
         * 离线整段结算没有「哪一场」,但败了几场是确定的,按整批入账。
         * 从前这里整段漏记 —— 挂机被打死几回不算宿敌,征战录永远空白,
         * 而图鉴与区域账都已经记了这些败场。
         */
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
            notes.push(`【宿敌】你已在${mobDef.name}手下败北${NEMESIS_THRESHOLD}次——此敌已成你的宿敌!`)
          }
        }
        /**
         * 雪耻与在线同源:在线打赢一位仍在账上的宿敌,当场清账并播报。
         * 离线整段结算里这一段净胜为正,就等于在它手下赢过。
         * 从前只补败北不补雪耻,挂机把它打回去几十次,征战录仍写着「尚为宿敌」。
         */
        if (mobDef && wins > 0 && isNemesis(player.nemeses, mobDef.id)) {
          player.setNemeses(markAvenged(player.nemeses, mobDef.id, nowMs))
          notes.push(`【雪耻】宿敌${mobDef.name}已被斩于剑下!`)
        }
        if (wins > 0 && mobDef) {
          // 抽一场代表战取回合数/受伤比(与在线 checkSuppression 吃同一份数据)
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
            notes.push(`你已彻底镇压${region.name},此地将自动产出资源`)
          }
        }
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
      /**
       * 离线自动挑战区域首领(收益折损,胜则连锁解锁)。
       *
       * 「首领是否已清」按**本世路线**判(与在线 exploration.regionBossCleared 同源):
       * 旧 REGIONS cleared 链在本世路线下会留空,若离线仍按它判,已清的 boss 会被离线再砍一遍、
       * 还能顺手解锁下一区 —— 与在线判定分叉。
       *
       * 门槛数的是**整趟会话**的胜场,不是这一段挂机窗口的胜场:在线只看 `s.wins`
       * (这趟历练从出发起累计的胜场),离线从前却拿本次结算的 `wins` 去比 ——
       * 先在线赢 9 场再挂机赢 1 场,整趟已够 10 胜,离线却因「本段只赢 1 场」不出首领,
       * 同一趟历练在线离线两套判据。这里把本段胜场并回会话再问同一个函数。
       */
      // 仍要求本段真的交过手:在线是「这一战恰好轮到首领」,不是凭空开一场
      const bossDue = winsUntilRegionBoss(session.wins + wins, regionBossCleared(region.id)) === 0
      if (bossDue && battles > 0) {
        const bossDef = enemyDef(placeContent(region.id).boss)
        if (bossDef) {
          const bossDanger = dangerFactorFor(modeDef.dangerMult, region.danger, petDangerMult, regionEventDanger)
          const bossResult = resolveCombat(buildPlayerSnap(), makeEnemySnap(bossDef, region.tier, bossDanger), rng, explorationRules(), false)
          noteEnemy(bossDef.id, bossResult.win)
          /**
           * 首领战本身就是一场战斗 —— 与在线 runBattle 同一本账:
           * 在线不论胜败都先 `track('battles')` 并记一场,再按结果记 wins/losses。
           * 从前离线只在这里 `track('bossKills')` 与 `sessionWins += 1`:
           * 归来卷轴写「胜 12 / 战 12」,可这一趟其实打了 13 场;
           * 首领落败更是连会话 losses 都不记,整趟像没交过手。
           *
           * 这一场加在奖励计算**之后**:`wins` 是普通战按胜率折出的期望值,
           * 掉落/修为/材料都已按它结算完毕,事后补一场不会把奖励再乘一遍。
           */
          track('battles')
          battles += 1
          if (bossResult.win) {
            // 首领战奖励同样并入事件加丰倍率(在线 boss 也是 mode×regReward,离线再叠收益折损)
            const drops = afterWin(region, modeDef.rewardMult * OFFLINE_BOSS_REWARD_MULT * regionEventReward, true)
            trip.stone = add(trip.stone, drops.stone)
            trip.exp = add(trip.exp, drops.exp)
            trip.items += drops.items
            track('kills')
            track('bossKills')
            wins += 1
            sessionWins += 1
            // 首领胜也是一场胜:连胜照推,跨过赏格档照发(与在线 runBattle 同一本账)
            for (const reward of recordWinStreakBatch(1, 0)) {
              notes.push(`斩将之后${streakRewardText(reward.streak, reward.stone, reward.wudao)}`)
            }
            player.updateRegionStats(region.id, true, bossResult.rounds, Math.max(0, 1 - bossResult.playerHpPct))
            player.recordRegionWin(region.id)
            if (checkSuppression(player, region.id) && !player.suppressQualified.includes(region.id)) {
              player.markSuppressQualified(region.id)
              player.suppressRegion(region.id)
              notes.push(`你已彻底镇压${region.name},此地将自动产出资源`)
            }
            clearRegionAndUnlockNext(region.id)
            notes.push(offlineBossNoteText(bossDef.name))
          } else {
            sessionLosses += 1
            // 首领败也是败:连胜归零,与在线「非胜即清」同一条
            recordWinStreakBatch(0, 1)
            // 首领败北也是一次败北:在线败在谁手里就记谁的宿敌账,离线同一本
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
              notes.push(`【宿敌】你已在${bossDef.name}手下败北${NEMESIS_THRESHOLD}次——此敌已成你的宿敌!`)
            }
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
          wins: session.wins + sessionWins,
          losses: session.losses + sessionLosses,
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
    // 逐品净增(仅列>0)—— 灵田可前瞻产当前/高一档,单品名会误报,故逐品记
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
  sanitizeAllStores()
}
