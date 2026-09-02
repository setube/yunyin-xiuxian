/**
 * 事件引擎 —— 挑选事件 / 结算选项 / 应用效果
 */
import type { EventChoice, EventDef, EventEffect, RegionDef } from '@/types'
import { rng } from '@/utils/random'
import { mulN, gte } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { EVENTS, FORTUNE_EVENTS, eventDef } from '@/data/events'
import { pillDef, PILLS } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import { PETS, petDef } from '@/data/pets'
import { qualityDef } from '@/data/qualities'
import { stoneByTier } from './formulas'
import { generateEquipment } from './equipGen'
import { acquireArtifact, acquireEquipment, randomDropArtifact } from './loot'
import { learnRandomGongfa } from './gongfaService'
import { fortuneAffinity, rootElements } from './linggenAffinity'
import { collect, track } from './progress'
import { recordEvent } from './worldMemory'
import { recordFortuneChoice } from './fortuneChain'
import { modOf } from './statsCalc'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useQuestsStore } from '@/stores/quests'

const MATERIAL_NAMES = { herb: '灵草', ore: '玄铁', page: '功法残页', dust: '器灵尘', wudao: '悟道点' } as const

/** 机缘事件触发概率(每次事件判定,极低) */
const FORTUNE_CHANCE = 0.02

/** 为区域挑选一个事件 */
export function pickEventFor(region: RegionDef): EventDef | null {
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  // Phase 31 S2:极小概率先判机缘事件(带代价选择)
  if (rng.chance(FORTUNE_CHANCE)) {
    const fortune = FORTUNE_EVENTS.filter(ev => ev.tags.some(t => region.eventTags.includes(t)))
    // Phase 32.2:同源机缘更容易撞见——灵根在此接入"机缘 → 师承 → 流派"的因果链起点。
    // 非同源机缘权重不变(仍是 ev.weight),没有一条路被灵根关掉。
    if (fortune.length > 0) {
      const elements = rootElements(player.linggen?.roots)
      return rng.weighted(fortune, ev => ev.weight * fortuneAffinity(ev.element, elements))
    }
  }
  const pool = EVENTS.filter(ev => {
    if (ev.minRealm !== undefined && player.major < ev.minRealm) return false
    if (ev.once && adventure.seenOnceEvents.includes(ev.id)) return false
    return ev.tags.some(t => region.eventTags.includes(t))
  })
  if (pool.length === 0) return null
  return rng.weighted(pool, ev => ev.weight)
}

/** 选项条件校验 */
export function choiceAvailable(choice: EventChoice, tier: number): boolean {
  const cond = choice.cond
  if (!cond) return true
  const player = usePlayerStore()
  const resources = useResourcesStore()
  switch (cond.type) {
    case 'realm':
      return player.major >= cond.min
    case 'stone':
      return resources.hasStone(stoneByTier(tier, cond.tierAmount))
    case 'element':
      return player.linggen?.roots.some(r => r.element === cond.el) ?? false
  }
}

function applyEffect(effect: EventEffect, tier: number): string | null {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  switch (effect.type) {
    case 'stone': {
      const v = stoneByTier(tier, Math.abs(effect.tierAmount))
      if (effect.tierAmount >= 0) {
        resources.addStone(v)
        return `灵石 +${formatGN(v)}`
      }
      resources.spendStone(gte(resources.spiritStone, v) ? v : { ...resources.spiritStone })
      return `灵石 -${formatGN(v)}`
    }
    case 'exp': {
      const v = mulN(player.expReq, effect.reqPct)
      player.gainExp(v)
      return `修为 +${formatGN(v)}`
    }
    case 'material':
      resources.addSmall(effect.id, effect.amount)
      return `${MATERIAL_NAMES[effect.id]} +${effect.amount}`
    case 'equipment': {
      const inst = generateEquipment(Math.max(tier, 1), rng, {
        luck: modOf(player.finalStats.mods, 'luck'),
        minQualityRank: effect.minQualityRank
      })
      return `获得 ${acquireEquipment(inst)}`
    }
    case 'pill': {
      const id = effect.id ?? randomEventPill(player.major)
      if (!id) return null
      const def = pillDef(id)
      if (!def) return null
      inventory.addPill(id, effect.count)
      collect('pill', id)
      return `丹药「${def.name}」×${effect.count}`
    }
    case 'gongfa': {
      const learnt = learnRandomGongfa(effect.id)
      if (learnt) return `习得功法《${learnt}》`
      resources.addSmall('page', 10)
      return '功法残页 +10(已尽览此道)'
    }
    case 'artifact': {
      const id = effect.id ?? randomDropArtifact(tier)
      if (!id) return null
      return `获得 ${acquireArtifact(id)}`
    }
    case 'buff': {
      const def = buffDef(effect.id)
      if (!def) return null
      cultivation.addBuff(effect.id, Date.now())
      return def.kind === 'injury' ? `陷入「${def.name}」状态` : `获得「${def.name}」加持`
    }
    case 'lifespan':
      player.addLifespan(effect.years)
      return `寿元 +${effect.years} 载`
    case 'pet': {
      const quests = useQuestsStore()
      const owned = new Set(quests.collections.pet)
      const pool = PETS.filter(p => !owned.has(p.id))
      const id = effect.id ?? (pool.length ? rng.pick(pool).id : null)
      if (!id || owned.has(id)) {
        resources.addSmall('herb', 10)
        return '灵草 +10'
      }
      collect('pet', id)
      if (!player.petId) player.setPet(id)
      const def = petDef(id)
      return `灵兽「${def?.name ?? ''}」愿意追随于你`
    }
    case 'nothing':
      return null
  }
}

function randomEventPill(major: number): string | null {
  const pool = PILLS.filter(p => p.minRealm <= major)
  if (pool.length === 0) return null
  return rng.weighted(pool, p => 100 / (1 + qualityDef(p.quality).rank * 2)).id
}

export interface EventResolution {
  outcomeText: string
  lines: string[]
}

/** 结算某个选项 */
export function resolveEventChoice(def: EventDef, choiceIdx: number, tier: number): EventResolution {
  const adventure = useAdventureStore()
  const choice = def.choices[choiceIdx] ?? def.choices[0]!
  const outcome = rng.weighted(choice.outcomes, o => o.weight)
  const lines: string[] = []
  for (const effect of outcome.effects) {
    const line = applyEffect(effect, tier)
    if (line) lines.push(line)
  }
  if (def.once) adventure.markEventSeen(def.id)
  collect('event', def.id)
  track('events')

  // Phase 30.9 S3:记录事件记忆(完成的余波后,未来再遇时有机会触发余波文本)
  adventure.eventMemories = recordEvent(adventure.eventMemories, def.id, choiceIdx, Date.now())
  // Phase 31.1 机缘链:机缘选择记入世界记忆(取/弃,影响未来)
  if (def.id.startsWith('ft_')) {
    const isDefault = def.choices[choiceIdx]?.isDefault ?? false
    recordFortuneChoice(def.id, isDefault ? 'leave' : 'take')
  }
  return { outcomeText: outcome.text, lines }
}

/** 离线/超时自动按默认选项结算 */
export function autoResolveEvent(eventId: string, tier: number): EventResolution | null {
  const def = eventDef(eventId)
  if (!def) return null
  let idx = def.choices.findIndex(c => c.isDefault && choiceAvailable(c, tier))
  if (idx < 0) idx = def.choices.findIndex(c => choiceAvailable(c, tier))
  if (idx < 0) idx = 0
  return resolveEventChoice(def, idx, tier)
}
