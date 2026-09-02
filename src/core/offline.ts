/**
 * 离线结算 —— 「归来」系统
 * 与在线 Tick 共用同一套公式,按封顶时长折算收益
 */
import type { OfflineSummary } from '@/types'
import { gn, isZero, mulN, sub } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { rng } from '@/utils/random'
import { regionDef } from '@/data/regions'
import { enemyDef } from '@/data/enemies'
import {
  AGE_YEARS_PER_HOUR,
  BATTLE_EXP_REQ_PCT,
  EQUIP_DROP_CHANCE,
  EXPLORE_BATTLE_INTERVAL,
  EXPLORE_EVENT_CHANCE,
  EXPLORE_MODES,
  OFFLINE_BOSS_REWARD_MULT,
  OFFLINE_EFFICIENCY,
  OFFLINE_MODAL_MIN_SECONDS
} from '@/data/constants'
import { makeEnemySnap, resolveCombat, sampleWinRate } from './combat'
import { buildPlayerSnap } from './playerSnap'
import { currentDaoRules } from './endgameService'
import { generateEquipment } from './equipGen'
import { acquireEquipment, afterWin } from './loot'
import { autoResolveEvent } from './eventEngine'
import { clearRegionAndUnlockNext } from './exploration'
import { stoneByTier } from './formulas'
import { settleSuppressedRegions } from './suppress'
import { harvestMaterials, studyTick } from './loreService'
import { modOf } from './statsCalc'
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
  const ui = useUiStore()

  if (!game.started || player.dead) return null
  const dtSec = Math.max(0, (nowMs - game.lastActiveAt) / 1000)
  if (dtSec < 1) return null

  const capSec = Math.min(dtSec, dongfu.offlineCapHours * 3600)
  const effSec = capSec * OFFLINE_EFFICIENCY
  const notes: string[] = []
  const equipmentGained: OfflineSummary['equipment'] = []

  // ---- 修炼 ----
  const expBefore = { ...player.exp }
  player.gainExp(mulN(gn(player.cultPerSec), effSec))

  // ---- 灵气 ----
  resources.setQi(resources.qi + player.qiRegenPerSec * effSec, player.qiCapValue)

  // ---- 建筑产出 ----
  const herbBefore = resources.herb
  const oreBefore = resources.ore
  const wudaoBefore = resources.wudao
  dongfu.produce(effSec)

  // ---- 藏经阁被动钻研(与在线同源,只是 dt 不同) ----
  studyTick(effSec)

  // ---- 镇压区域被动收益(不受离线效率折扣,是统治该区域的补偿) ----
  const suppressYield = settleSuppressedRegions(dtSec)
  if (suppressYield && !isZero(suppressYield.stone)) {
    notes.push(`镇压诸域仍有余韵:灵石 +${formatGN(suppressYield.stone)}`)
    if (suppressYield.equipment.length > 0) {
      for (const eq of suppressYield.equipment) {
        equipmentGained.push(eq)
      }
    }
  }

  // ---- 历练挂机 ----
  let battles = 0
  let wins = 0
  let events = 0
  const stoneBefore = { ...resources.spiritStone }
  const session = adventure.session
  if (session) {
    const region = regionDef(session.regionId)
    if (region) {
      const modeDef = EXPLORE_MODES[session.mode]
      const remainSec = Math.max(0, (session.endsAt - (nowMs - dtSec * 1000)) / 1000)
      const simSec = Math.min(capSec, remainSec)
      const mods = player.finalStats.mods
      const speed = 1 + modOf(mods, 'explorationSpeed')
      const encounters = Math.floor((simSec / EXPLORE_BATTLE_INTERVAL) * speed)
      events = Math.round(encounters * EXPLORE_EVENT_CHANCE * (1 + modOf(mods, 'eventLuck')))
      battles = Math.max(0, encounters - events)

      if (battles > 0) {
        const mobId = rng.pick(region.enemies)
        const mobDef = enemyDef(mobId)
        const dangerFactor = modeDef.dangerMult * (1 + (region.danger - 1) * 0.05)
        const winRate = mobDef
          ? sampleWinRate(buildPlayerSnap(), makeEnemySnap(mobDef, region.tier, dangerFactor), rng, 3, currentDaoRules())
          : 0.3
        wins = Math.round(battles * winRate)

        // 灵石与修为
        const stoneGain = stoneByTier(region.tier, 10 * wins * modeDef.rewardMult * (1 + modOf(mods, 'spiritStoneGain')))
        resources.addStone(stoneGain)
        player.gainExp(mulN(player.expReq, BATTLE_EXP_REQ_PCT * wins * modeDef.rewardMult * (1 + modOf(mods, 'expGain'))))
        // 材料 —— 离线也会撞见新灵材,只是次数封顶,免得回来一屏 toast
        const herbGain = Math.round(wins * 1.0)
        const oreGain = Math.round(wins * 0.5)
        resources.addSmall('herb', herbGain)
        resources.addSmall('ore', oreGain)
        harvestMaterials(region.tier, 'herb', herbGain)
        harvestMaterials(region.tier, 'ore', oreGain)
        resources.addSmall('page', Math.round(wins * 0.15))
        resources.addSmall('dust', Math.round(wins * 0.3))
        // 装备:最多实际生成 6 件,其余折算为器灵尘
        const equipCount = Math.round(wins * EQUIP_DROP_CHANCE * (1 + modOf(mods, 'dropRate')))
        const realCount = Math.min(6, equipCount)
        for (let i = 0; i < realCount; i += 1) {
          const inst = generateEquipment(region.tier, rng, { luck: modOf(mods, 'luck') })
          acquireEquipment(inst, true)
          equipmentGained.push({ name: equipmentTemplate(inst.templateId)?.name ?? '未知', quality: inst.quality })
        }
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
      for (let i = 0; i < evCap; i += 1) {
        if (adventure.pendingEventId) {
          autoResolveEvent(adventure.pendingEventId, region.tier)
          adventure.setPendingEvent(null, nowMs)
        } else {
          const pool = ['ev_spring', 'ev_herb_garden', 'ev_night_talk', 'ev_falling_star', 'ev_old_man']
          autoResolveEvent(rng.pick(pool), region.tier)
        }
      }
      // 离线自动挑战区域首领(收益折损,胜则连锁解锁)
      if (!adventure.cleared.includes(region.id) && wins >= 5) {
        const bossDef = enemyDef(region.boss)
        if (bossDef) {
          const dangerFactor = modeDef.dangerMult * (1 + (region.danger - 1) * 0.05)
          const bossResult = resolveCombat(buildPlayerSnap(), makeEnemySnap(bossDef, region.tier, dangerFactor), rng, currentDaoRules())
          if (bossResult.win) {
            afterWin(region, modeDef.rewardMult * OFFLINE_BOSS_REWARD_MULT, true)
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
          nextBattleAt: nowMs + EXPLORE_BATTLE_INTERVAL * 1000
        })
      }
    }
  }

  // ---- 寿元流逝(不受离线上限约束) ----
  player.addAge((dtSec / 3600) * AGE_YEARS_PER_HOUR)

  // ---- Buff 过期 ----
  cultivation.pruneBuffs(nowMs)

  const summary: OfflineSummary = {
    seconds: dtSec,
    cappedSeconds: capSec,
    capped: dtSec > capSec + 1,
    exp: sub(player.exp, expBefore),
    stone: sub(resources.spiritStone, stoneBefore),
    herb: resources.herb - herbBefore,
    ore: resources.ore - oreBefore,
    wudao: resources.wudao - wudaoBefore,
    battles,
    wins,
    events,
    equipment: equipmentGained,
    notes
  }
  if (player.expFull) notes.push('修为已至圆满,可尝试突破')

  if (dtSec >= OFFLINE_MODAL_MIN_SECONDS) {
    track('offlineClaims')
    ui.offlineSummary = summary
  }
  return summary
}

/** 保证 GNum 字段在结算前有效(损坏兜底) */
export function sanitizeOfflineInputs(): void {
  usePlayerStore().sanitize()
  useResourcesStore().sanitize()
  useLoreStore().sanitize()
}
