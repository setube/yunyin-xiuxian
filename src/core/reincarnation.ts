/**
 * 转世服务 —— 死亡 / 轮回 / 永久成长
 *
 * Phase 32.5 起,转世交割的重心从"再拿一次道果与天赋"移到了
 * "把这一世的所知所历带走":归档履历、结算命题、折算宿慧、补齐认知、立下新题。
 * 属性那一份仍在(道果与天赋照旧),但它已不再是玩家转世的理由。
 */
import { rng } from '@/utils/random'
import { TALENTS, talentDef } from '@/data/talents'
import { REBIRTH_GONGFA_LEVEL_DIV, TALENT_DRAW_DIV } from '@/data/constants'
import { lifeThemeDef } from '@/data/lifeThemes'
import { nextStageAfter, stageAt } from '@/data/samsara'
import { rollLinggen } from './linggenGen'
import { collect, track } from './progress'
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
import { useDongfuStore } from '@/stores/dongfu'
import { useAdventureStore } from '@/stores/adventure'
import { useEndgameStore } from '@/stores/endgame'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import type { LifeReview, ReincarnationView } from '@/stores/ui'
import type { BuildingId, GNum } from '@/types'
import { recordMilestone } from './identity'
import { gnZero } from '@/utils/gnum'

/** 至少金丹境方可主动兵解 */
export const MANUAL_REBIRTH_MIN_MAJOR = 2

export { daoFruitGain } from './formulas'
import { daoFruitGain } from './formulas'

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
  // 命题只在真正走到底时给宿慧;未竟与破题都不给,但也不扣
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
 * 准备转世界面数据。
 *
 * 此处只算不改 —— 宿慧、履历、认知一概等到 confirmReincarnation 才落账。
 * 原因很实际:玩家可能在这一步刷新页面,重开后会再点一次「兵解转世」,
 * 若在此就发放宿慧,同一世的阅历会被记两遍。
 */
export function prepareReincarnation(): ReincarnationView {
  const player = usePlayerStore()
  const owned = new Set(player.reincarnation.talents)
  const draws = 1 + Math.floor(player.major / TALENT_DRAW_DIV)
  const choices = drawTalents(3, owned)
  const extras = draws > 1 ? drawTalents(draws - 1, new Set([...owned, ...choices])) : []

  const review = reviewLastLife()
  const stageBefore = currentStage()
  const insightAfter = totalInsight() + review.insightGained
  const stageAfter = stageAt(insightAfter)
  const next = nextStageAfter(insightAfter)

  // 走到底过的题不再重复出现 —— 第五世不该还在琢磨"这一世先把丹结了"
  const done = new Set(player.reincarnation.lives.filter(l => l.themeResult === 'done').map(l => l.themeId))
  const pool = offerThemes(stageAfter, arr => rng.pick(arr))
  const fresh = pool.filter(x => !done.has(x.id))

  const view: ReincarnationView = {
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
    knownMaterials: carryLorePreview(stageAfter),
    themeChoices: (fresh.length > 0 ? fresh : pool).map(x => x.id),
    themeFree: stageAfter.themeFreeChoice
  }
  useUiStore().reincarnation = view
  return view
}

/**
 * 已习功法的折损。
 *
 * 层数折半是多周目审计后的收敛口径;到了「百世老修」这一阶,
 * 修为最深的那一门可以完整带走 —— 练过百世的东西,不至于连怎么起手都忘了。
 */
function carryGongfa(learned: Readonly<Record<string, number>>, keepOne: boolean): Record<string, number> {
  let keptId: string | null = null
  if (keepOne) {
    for (const [id, lv] of Object.entries(learned)) {
      if (keptId === null || lv > (learned[keptId] ?? 0)) keptId = id
    }
  }
  const out: Record<string, number> = {}
  for (const [id, lv] of Object.entries(learned)) {
    out[id] = id === keptId ? lv : Math.max(1, Math.floor(lv / REBIRTH_GONGFA_LEVEL_DIV))
  }
  return out
}

/**
 * 确认转世。
 *
 * @param chosenTalentId 三选一的先天之姿
 * @param chosenThemeId 这一世立下的题(null 为不立题)
 */
export function confirmReincarnation(chosenTalentId: string | null, chosenThemeId: string | null = null): void {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  const dongfu = useDongfuStore()
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

  // 这一世的账:履历归档、宿慧落袋。二者都只在此处发生一次
  const r = view.review
  player.recordLife({
    index: r.index,
    major: player.major,
    realmLabel: r.realmLabel,
    age: r.age,
    themeId: r.themeId,
    themeResult: r.themeResult,
    insight: r.insightGained,
    at: Date.now()
  })
  player.addInsight(r.insightGained)

  // 重置今生
  resources.spiritStone = gnZero() as GNum
  resources.setQi(0, 1)
  resources.wudao = 0
  resources.herb = 0
  resources.ore = 0
  resources.page = 0
  resources.dust = 0
  inventory.items = []
  inventory.equipped = {}
  inventory.pills = {}
  // 法宝随神魂转世保留;已习功法保留但层数折半(顶阶可留一门不折)
  const stage = stageAt(view.insightAfter)
  cultivation.learned = carryGongfa(cultivation.learned, stage.keepOneGongfa)
  cultivation.buffs = []
  adventure.setSession(null)
  adventure.setPendingEvent(null, 0)
  adventure.unlocked = ['qingyun']
  adventure.cleared = []
  adventure.lastBattle = null
  // 建筑折半留存
  for (const id of Object.keys(dongfu.levels) as BuildingId[]) {
    dongfu.setLevel(id, Math.floor((dongfu.levels[id] ?? 0) / 2))
  }

  // 认知不因转世清零,只按阶补齐:该认得的药,睁眼就该认得
  const recognized = carryLore(stage)
  player.rebirth(rollLinggen(rng, aptitudeFloorNow()))
  // 新的一世:上一世的建号草稿作废,「逆天改命」额度归满
  useGameStore().resetCreateDraft()
  // 道途归还天地,道源与道痕随神魂不灭
  useEndgameStore().onRebirth()
  // 立下这一世的题。快照须在重置之后取,「本世」方才从此刻算起
  beginLife(view.themeChoices.includes(chosenThemeId ?? '') ? chosenThemeId : null)
  recordMilestone('first_rebirth')
  track('reincarnations')
  ui.reincarnation = null
  ui.deathDialog = false
  ui.toast('一梦轮回,你在云隐山下再度睁开双眼', 'rare')
  if (view.stageAdvanced) ui.toast(`宿慧渐厚,你已是「${view.stageName}」`, 'rare')
  if (recognized > 0) ui.toast(`睁眼之际,${recognized} 味灵材的名字自行浮上心头`, 'info')
}

export function talentName(id: string): string {
  return talentDef(id)?.name ?? id
}
