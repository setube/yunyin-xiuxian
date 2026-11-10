/** 事件引擎:挑选事件 / 结算选项 / 应用效果 */
import type { EventChoice, EventDef, EventEffect, RegionDef, AdventureSession, GNum } from '@/types'
import { RandomService, rng } from '@/utils/random'
import { formatGN } from '@/utils/format'
import { EVENTS, FORTUNE_EVENTS, eventDef } from '@/data/events'
import { CHAINS, chainOfEvent } from '@/data/chains'
// 三档触发概率同源 data/constants(际遇在 exploration 掷,奇缘与机缘在此掷);本文件不另写数字,core/eventTier 同读
import { CHAIN_STAGE_CHANCE, FORTUNE_CHANCE, INSTANT_EXP_LAYER_CAP } from '@/data/constants'
import { pillDef, PILLS, pillRank } from '@/data/pills'
import { HERB_GRADE_SHORT, herbGradeOfMajor } from '@/data/herbGrades'
import { buffDef } from '@/data/buffs'
import { GONGFA } from '@/data/gongfa'
import { petDef, genericPetPool } from '@/data/pets'
import { personalityEffects } from './petPersonality'
import { expFromSecs, stoneByTier } from './formulas'
import { generateEquipment } from './equipGen'
import { acquireArtifact, acquireEquipment, celebrateTreasure, randomDropArtifact } from './loot'
import { harvestMaterials } from './loreService'
import { gameNow } from './enginePause'
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
import { add } from '@/utils/gnum'
import { useQuestsStore } from '@/stores/quests'

const MATERIAL_NAMES = { herb: '灵草', ore: '玄铁', page: '功法残页', dust: '器灵尘', wudao: '悟道点' } as const

/** 此刻该走的那几程(链条未结、境界够、尚未抽到过) */
export function pendingChainStages(major: number): { chainId: string; stage: number; event: EventDef }[] {
  const player = usePlayerStore()
  const out: { chainId: string; stage: number; event: EventDef }[] = []
  for (const chain of CHAINS) {
    const done = player.eventChains[chain.id] ?? 0
    const eventId = chain.stages[done]
    if (!eventId) continue
    const def = eventDef(eventId)
    if (!def) continue
    if (def.minRealm !== undefined && major < def.minRealm) continue
    out.push({ chainId: chain.id, stage: done, event: def })
  }
  return out
}

/** 从当前该走的几程里掷一程;几条链可并行 */
export function pickChainStageEvent(major: number, rand: RandomService = rng): EventDef | null {
  const pending = pendingChainStages(major)
  if (pending.length === 0) return null
  return rand.pick(pending).event
}

/** 奇缘录:只列已起了头的缘 */
export interface ChainProgress {
  id: string
  name: string
  hint: string
  stage: number
  total: number
  finished: boolean
}

export function chainProgressRows(): ChainProgress[] {
  const player = usePlayerStore()
  return CHAINS.map(chain => {
    const stage = player.eventChains[chain.id] ?? 0
    return { id: chain.id, name: chain.name, hint: chain.hint, stage, total: chain.stages.length, finished: stage >= chain.stages.length }
  }).filter(c => c.stage > 0)
}

/** 区域事件池,不含奇缘阶段(奇缘按链条推进,不按区域标签出现) */
export function regionEventPoolFor(region: RegionDef): EventDef[] {
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  return EVENTS.filter(ev => {
    if (chainOfEvent(ev.id)) return false
    if (ev.minRealm !== undefined && player.major < ev.minRealm) return false
    if (ev.once && adventure.seenOnceEvents.includes(ev.id)) return false
    return ev.tags.some(t => region.eventTags.includes(t))
  })
}

/** 为区域挑选一个事件(rand 可注入) */
export function pickEventFor(region: RegionDef, rand: RandomService = rng): EventDef | null {
  const player = usePlayerStore()
  if (rand.chance(CHAIN_STAGE_CHANCE)) {
    const chainEvent = pickChainStageEvent(player.major, rand)
    if (chainEvent) return chainEvent
  }
  if (rand.chance(FORTUNE_CHANCE)) {
    const fortune = FORTUNE_EVENTS.filter(ev => ev.tags.some(t => region.eventTags.includes(t)))
    // 同源灵根的机缘加权;非同源仍是 ev.weight,不关掉任何一条
    if (fortune.length > 0) {
      const elements = rootElements(player.linggen?.roots)
      return rand.weighted(fortune, ev => ev.weight * fortuneAffinity(ev.element, elements))
    }
  }
  const pool = regionEventPoolFor(region)
  if (pool.length === 0) return null
  return rand.weighted(pool, ev => ev.weight)
}

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

/** 事件所得并入历练会话账目(与 runBattle 入账对称);无 session 时跳过,只并所得不并花费 */
function foldSession(stone?: GNum, exp?: GNum, items = 0): void {
  const adventure = useAdventureStore()
  const s = adventure.session
  if (!s) return
  const next: AdventureSession = {
    ...s,
    stoneGain: stone ? add(s.stoneGain, stone) : s.stoneGain,
    expGain: exp ? add(s.expGain, exp) : s.expGain,
    itemGain: s.itemGain + items
  }
  adventure.setSession(next)
}

export interface EventApplyOpts {
  /** 空祭炼位时自动祭上法宝;默认 true,玩家不在场的自动结算(离线 / 遇事勿扰 / 超时)传 false,同 offline.ts 的 autoEquip=false */
  autoEquipArtifact?: boolean
  /**
   * 玩家不在场:不翻开得宝仪典。
   * 与 autoEquipArtifact 同一批调用点 —— 那几处玩家没看着屏幕,
   * 归来卷轴与 toast 已经交代了所得,再演一遍「那一刻」是假的。
   */
  silent?: boolean
}

function applyEffect(effect: EventEffect, tier: number, opts: EventApplyOpts = {}): string | null {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  switch (effect.type) {
    case 'stone': {
      const v = stoneByTier(tier, Math.abs(effect.tierAmount))
      if (effect.tierAmount >= 0) {
        resources.addStone(v)
        foldSession(v)
        return `灵石 +${formatGN(v)}`
      }
      // 余额不足即拒绝;传余额拷贝会让 gte 恒真、余额清零
      if (!resources.spendStone(v)) return null
      return `灵石 -${formatGN(v)}`
    }
    case 'exp': {
      // 与丹药、遭遇同口径:等效闭关时长,封顶不满一层(formulas.expFromSecs)
      const v = expFromSecs(player.expReq, effect.secs, player.cultPerSec, INSTANT_EXP_LAYER_CAP)
      player.gainExp(v)
      foldSession(undefined, v)
      return `修为 +${formatGN(v)}`
    }
    case 'material':
      resources.addSmall(effect.id, effect.amount)
      // 每笔只抽 1 味:离线每段事件可达 40 件,按数量抽会盖过离线普通战每段至多 6 抽的封顶
      if ((effect.id === 'herb' || effect.id === 'ore') && effect.amount >= 1) harvestMaterials(tier, effect.id, 1)
      // addSmall 落当前品;events 数据只写数量不写品,文案报品
      if (effect.id === 'herb') return `${HERB_GRADE_SHORT[herbGradeOfMajor(player.major)]}灵草 +${effect.amount}`
      return `${MATERIAL_NAMES[effect.id]} +${effect.amount}`
    case 'equipment': {
      const inst = generateEquipment(Math.max(tier, 1), rng, {
        // luck 与战斗/离线掉落同源,含灵兽性格的掉落倾向
        luck: modOf(player.finalStats.mods, 'luck') + personalityEffects(player.petId).dropLuck,
        minQualityRank: effect.minQualityRank
      })
      // 静默结算(离线)时入账照旧,只是不弹 toast、不翻开仪典
      const line = `获得 ${acquireEquipment(inst, { quiet: opts.silent === true }).line}`
      foldSession(undefined, undefined, 1)
      return line
    }
    case 'pill': {
      const id = effect.id ?? randomEventPill(player.major)
      if (!id) return null
      const def = pillDef(id)
      if (!def) return null
      inventory.addPill(id, effect.count)
      collect('pill', id)
      foldSession(undefined, undefined, effect.count)
      // 际遇赠顶档丹药:与掉落/自炼同一份仪典
      if (!opts.silent) celebrateTreasure({ kind: 'pill', pill: def })
      return `丹药「${def.name}」×${effect.count}`
    }
    case 'gongfa': {
      const learnt = learnRandomGongfa(effect.id)
      if (learnt) {
        const def = GONGFA.find(g => g.name === learnt)
        if (def && !opts.silent) celebrateTreasure({ kind: 'gongfa', gongfa: def })
        return `习得功法《${learnt}》`
      }
      resources.addSmall('page', 10)
      return '功法残页 +10'
    }
    case 'artifact': {
      const id = effect.id ?? randomDropArtifact(tier)
      if (!id) return null
      const line = `获得 ${acquireArtifact(id, false, opts.autoEquipArtifact ?? true)}`
      foldSession(undefined, undefined, 1)
      return line
    }
    case 'buff': {
      const def = buffDef(effect.id)
      if (!def) return null
      // 可冻结的到期判定读 gameNow()(enginePause 纪律)
      cultivation.addBuff(effect.id, gameNow())
      return def.kind === 'injury' ? `陷入「${def.name}」` : `获得「${def.name}」加持`
    }
    case 'lifespan':
      player.addLifespan(effect.years)
      return `寿元 +${effect.years} 载`
    case 'pet': {
      const quests = useQuestsStore()
      const owned = new Set(quests.collections.pet)
      // 泛型事件只发入门圣兽(凡/精/灵/玄/天);仙品/神品神兽仅由指名 id 的高界事件发放
      const pool = genericPetPool(owned)
      const id = effect.id ?? (pool.length ? rng.pick(pool).id : null)
      if (!id || owned.has(id)) {
        resources.addSmall('herb', 10)
        harvestMaterials(tier, 'herb', 1)
        return `${HERB_GRADE_SHORT[herbGradeOfMajor(player.major)]}灵草 +10`
      }
      collect('pet', id)
      if (!player.petId) player.setPet(id)
      const def = petDef(id)
      // 仙品/神品神兽只由指名事件发放 —— 正是最该有一瞬的那条路
      if (def && !opts.silent) celebrateTreasure({ kind: 'pet', pet: def })
      return `获得灵兽「${def?.name ?? ''}」`
    }
    case 'nothing':
      return null
  }
}

function randomEventPill(major: number): string | null {
  const pool = PILLS.filter(p => p.minRealm <= major)
  if (pool.length === 0) return null
  return rng.weighted(pool, p => 100 / (1 + pillRank(p) * 2)).id
}

export interface EventResolution {
  outcomeText: string
  lines: string[]
}

export function resolveEventChoice(def: EventDef, choiceIdx: number, tier: number, opts: EventApplyOpts = {}): EventResolution {
  const adventure = useAdventureStore()
  const choice = def.choices[choiceIdx] ?? def.choices[0]!
  const outcome = rng.weighted(choice.outcomes, o => o.weight)
  const lines: string[] = []
  for (const effect of outcome.effects) {
    const line = applyEffect(effect, tier, opts)
    if (line) lines.push(line)
  }
  if (def.once) adventure.markEventSeen(def.id)
  collect('event', def.id)
  track('events')

  // 奇缘推进一程;断了缘直接记到尽头
  const chain = chainOfEvent(def.id)
  if (chain) {
    const ended = def.choices[choiceIdx]?.endsChain ?? false
    usePlayerStore().setEventChain(chain.chain.id, ended ? chain.chain.stages.length : chain.stage + 1)
  }

  // 事件记忆(再遇时可发余波文本);lastAt 读 gameNow()
  adventure.eventMemories = recordEvent(adventure.eventMemories, def.id, choiceIdx, gameNow())
  // 机缘选择(取/弃)记入世界记忆
  if (def.id.startsWith('ft_')) {
    const isDefault = def.choices[choiceIdx]?.isDefault ?? false
    recordFortuneChoice(def.id, isDefault ? 'leave' : 'take')
  }
  return { outcomeText: outcome.text, lines }
}

/**
 * 按默认选项自动结算(离线 / 遇事勿扰 / 超时)。
 * 玩家不在场时传 silent(offline 是真不在场;勿扰与超时那一刻玩家可能正看着,由调用点决定)。
 * 三者共用这一个出口,且都不自动祭法宝 —— 玩家不在场,替他把法宝用掉就是替他做决定。
 */
export function autoResolveEvent(eventId: string, tier: number, silent = false): EventResolution | null {
  const def = eventDef(eventId)
  if (!def) return null
  let idx = def.choices.findIndex(c => c.isDefault && choiceAvailable(c, tier))
  if (idx < 0) idx = def.choices.findIndex(c => choiceAvailable(c, tier))
  if (idx < 0) idx = 0
  return resolveEventChoice(def, idx, tier, silent ? { autoEquipArtifact: false, silent: true } : { autoEquipArtifact: false })
}
