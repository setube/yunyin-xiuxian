/** 转世服务:道果与天赋、归档履历、结算命题、折算宿慧、补齐认知、立下新题 */
import { rng } from '@/utils/random'
import { TALENTS } from '@/data/talents'
import { TALENT_DRAW_DIV } from '@/data/constants'
import { lifeThemeDef } from '@/data/lifeThemes'
import { nextStageAfter, stageAt } from '@/data/samsara'
import { rollLinggen } from './linggenGen'
import { collect, track } from './progress'
import { lifeForge } from './heritageForge'
import { carriesAllLore, keepsAllGongfa, talentChoiceBonus } from './heritageEffects'
import {
  aptitudeFloorNow,
  beginLife,
  carryLore,
  carryLorePreview,
  currentStage,
  lifeInsight,
  offerThemes,
  totalInsight,
  vowProgress,
  vowResult
} from './samsaraService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useEndgameStore } from '@/stores/endgame'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import type { LifeReview, ReincarnationView } from '@/stores/ui'
import type { GNum } from '@/types'
import { recordMilestone } from './identity'
import { gnZero } from '@/utils/gnum'

/** 至少金丹境方可主动兵解 */
export const MANUAL_REBIRTH_MIN_MAJOR = 2

import { daoFruitGain } from './formulas'
import { archiveLifeTrial } from './lifeTrialService'
import { rerollMortalWorld } from './mortalWorldService'
import { archiveBond } from './daoluService'

function drawTalents(count: number, exclude: Set<string>): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i += 1) {
    const pool = TALENTS.filter(t => !exclude.has(t.id) && !out.includes(t.id))
    if (pool.length === 0) break
    out.push(rng.weighted(pool, t => t.weight).id)
  }
  return out
}

/** 结算刚过完的这一世:命题结局与本世所得宿慧 */
function reviewLastLife(): LifeReview {
  const player = usePlayerStore()
  const vow = player.reincarnation.vow
  const result = vowResult()
  const def = vow ? lifeThemeDef(vow.themeId) : undefined
  const prog = vowProgress()
  const themeInsight = result === 'done' && def ? def.insight : 0
  return {
    index: player.reincarnation.count + 1,
    realmLabel: player.realmName,
    age: Math.floor(player.age),
    themeId: vow?.themeId ?? null,
    themeResult: result,
    themeCur: prog?.cur ?? 0,
    themeNeed: prog?.need ?? 0,
    insightGained: lifeInsight(player.major) + themeInsight
  }
}

/**
 * 准备转世界面数据。只算不改:宿慧、履历、认知等到 confirmReincarnation 才落账
 * (玩家可能在这一步刷新后再点一次,在此发放会记两遍)。
 */
export function prepareReincarnation(): ReincarnationView {
  const player = usePlayerStore()
  const owned = new Set(player.reincarnation.talents)
  const draws = 1 + Math.floor(player.major / TALENT_DRAW_DIV)
  // 炼虚通感:持传承者三选一 → 四选一
  const choices = drawTalents(3 + talentChoiceBonus(player.reincarnation.heritage), owned)
  const extras = draws > 1 ? drawTalents(draws - 1, new Set([...owned, ...choices])) : []

  const review = reviewLastLife()
  const stageBefore = currentStage()
  const insightAfter = totalInsight() + review.insightGained
  const stageAfter = stageAt(insightAfter)
  const next = nextStageAfter(insightAfter)

  // 与确认时同口径:计入本次宿慧、新铸传承与补齐认知,不写存档
  const forged = lifeForge(player.major)
  const heritageAfter = forged ? [...player.reincarnation.heritage, forged.id] : player.reincarnation.heritage
  const knownMaterials = carryLorePreview(stageAfter, carriesAllLore(heritageAfter))
  const linggenAptitudeFloor = aptitudeFloorNow(insightAfter, knownMaterials)

  // 走到底过的题不再重复出现
  const done = new Set(player.reincarnation.lives.filter(l => l.themeResult === 'done').map(l => l.themeId))
  const pool = offerThemes(stageAfter, arr => rng.pick(arr))
  const fresh = pool.filter(x => !done.has(x.id))

  const view: ReincarnationView = {
    nextLinggen: rollLinggen(rng, linggenAptitudeFloor),
    linggenAptitudeFloor,
    daoFruitGained: daoFruitGain(player.major, player.sub),
    talentChoices: choices,
    extraTalents: extras,
    prevRealmLabel: player.realmName,
    review,
    insightAfter,
    stageId: stageAfter.id,
    stageName: stageAfter.name,
    stageDesc: stageAfter.desc,
    stageAdvanced: stageAfter.index > stageBefore.index,
    toNextStage: next ? next.insight - insightAfter : null,
    knownMaterials,
    themeChoices: (fresh.length > 0 ? fresh : pool).map(x => x.id),
    themeFree: stageAfter.themeFreeChoice
  }
  useUiStore().reincarnation = view
  return view
}

/** 与首次建角一样不限次改命,不重抽天赋、不提前发放转生所得。 */
export function rerollReincarnationLinggen(): void {
  const view = useUiStore().reincarnation
  if (!view) return
  view.nextLinggen = rollLinggen(rng, view.linggenAptitudeFloor)
}

/**
 * 已习功法的折损:门类留下,层数回一层。
 * 「百世老修」阶修为最深的一门按原等级带走;持「大乘道统」传承者全部按原等级带走。
 */
export function carryGongfa(
  learned: Readonly<Record<string, number>>,
  keepOne: boolean,
  keepAll = false
): Record<string, number> {
  if (keepAll) return { ...learned }
  let keptId: string | null = null
  if (keepOne) {
    for (const [id, lv] of Object.entries(learned)) {
      if (keptId === null || lv > (learned[keptId] ?? 0)) keptId = id
    }
  }
  const out: Record<string, number> = {}
  for (const [id, lv] of Object.entries(learned)) {
    out[id] = id === keptId ? lv : 1
  }
  return out
}

/**
 * 确认转世。
 * @param chosenTalentId 三选一的先天之姿
 * @param chosenThemeId 这一世立下的题(null 为不立题)
 */
export function confirmReincarnation(chosenTalentId: string | null, chosenThemeId: string | null = null): void {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  const adventure = useAdventureStore()
  const ui = useUiStore()
  const view = ui.reincarnation
  if (!view) return

  // 永久收获
  player.addDaoFruit(view.daoFruitGained)
  const gained = [...view.extraTalents]
  if (chosenTalentId && view.talentChoices.includes(chosenTalentId)) gained.push(chosenTalentId)
  for (const id of gained) {
    player.addTalent(id)
    collect('talent', id)
  }

  // 宿命传承:本世最深未锻造门槛只在此处落账一次(入 reincarnation.heritage,跨世永久持有)
  const forged = lifeForge(player.major)
  if (forged) {
    player.addHeritage(forged.id)
    ui.toast(`获得传承「${forged.name}」`, 'rare')
  }

  // 履历归档、宿慧落袋:只在此处发生一次
  const r = view.review
  player.recordLife({
    index: r.index,
    major: player.major,
    realmLabel: r.realmLabel,
    age: r.age,
    themeId: r.themeId,
    themeResult: r.themeResult,
    insight: r.insightGained,
    // 逆旅契唯一的回报:入履历,不进任何计算
    trialId: archiveLifeTrial(),
    at: Date.now()
  })
  player.addInsight(r.insightGained)
  player.setLifeTrial(null)

  // 重置今生
  resources.spiritStone = gnZero() as GNum
  resources.setQi(0, 1)
  resources.wudao = 0
  resources.resetHerbs()
  resources.ore = 0
  resources.page = 0
  resources.dust = 0
  inventory.items = []
  inventory.equipped = {}
  inventory.pills = {}
  inventory.artifacts = []
  inventory.equippedArtifacts = []
  const stage = stageAt(view.insightAfter)
  const heritages = player.reincarnation.heritage
  cultivation.learned = carryGongfa(cultivation.learned, stage.keepOneGongfa, keepsAllGongfa(heritages))
  cultivation.buffs = []
  adventure.setSession(null)
  adventure.setPendingEvent(null, 0)
  adventure.unlocked = ['qingyun']
  rerollMortalWorld()
  // 关系归档:只写一条记录,不产出任何资源
  const bondRec = archiveBond()
  if (bondRec) player.recordBond(bondRec)
  adventure.cleared = []
  adventure.clearedAt = {}
  adventure.revived = []
  adventure.lastBattle = null
  // 洞府/灵脉/灵兽的归零在 player.rebirth()

  const recognized = carryLore(stage, carriesAllLore(heritages))
  // 须在 rebirth() 之前记下:它会把镇压权益散去
  const releasedSuppressed = player.suppressedRegions.length
  player.rebirth(view.nextLinggen)
  if (releasedSuppressed > 0) {
    ui.toast(`${releasedSuppressed} 处镇压已解除`, 'info')
  }
  // 建号草稿作废,「逆天改命」额度归满
  useGameStore().resetCreateDraft()
  // 道途归还,道源与道痕保留
  useEndgameStore().onRebirth()
  // 命题快照须在重置之后取
  beginLife(view.themeChoices.includes(chosenThemeId ?? '') ? chosenThemeId : null)
  recordMilestone('first_rebirth')
  track('reincarnations')
  ui.reincarnation = null
  ui.deathDialog = false
  ui.toast(`已转世 · 道号「${player.name}」`, 'rare')
  if (view.stageAdvanced) ui.toast(`境地已迁「${view.stageName}」`, 'rare')
  if (recognized > 0) ui.toast(`新认得 ${recognized} 味灵材`, 'info')
}
