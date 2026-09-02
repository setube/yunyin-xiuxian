/**
 * 转世服务 —— 死亡 / 轮回 / 永久成长
 */
import { rng } from '@/utils/random'
import { TALENTS, talentDef } from '@/data/talents'
import { REBIRTH_GONGFA_LEVEL_DIV, REINCARNATE_APTITUDE_FLOOR, TALENT_DRAW_DIV } from '@/data/constants'
import { rollLinggen } from './linggenGen'
import { collect, track } from './progress'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { useAdventureStore } from '@/stores/adventure'
import { useEndgameStore } from '@/stores/endgame'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import type { ReincarnationView } from '@/stores/ui'
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

/** 准备转世界面数据(展示三选一 + 自动附赠) */
export function prepareReincarnation(): ReincarnationView {
  const player = usePlayerStore()
  const owned = new Set(player.reincarnation.talents)
  const draws = 1 + Math.floor(player.major / TALENT_DRAW_DIV)
  const choices = drawTalents(3, owned)
  const extras = draws > 1 ? drawTalents(draws - 1, new Set([...owned, ...choices])) : []
  const view: ReincarnationView = {
    daoFruitGained: daoFruitGain(player.major, player.sub),
    talentChoices: choices,
    extraTalents: extras,
    prevRealmLabel: player.realmName
  }
  useUiStore().reincarnation = view
  return view
}

/** 确认转世 */
export function confirmReincarnation(chosenTalentId: string | null): void {
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
  // 法宝随神魂转世保留;已习功法保留但层数折半(多周目审计后收敛)
  const halved: Record<string, number> = {}
  for (const [id, lv] of Object.entries(cultivation.learned)) {
    halved[id] = Math.max(1, Math.floor(lv / REBIRTH_GONGFA_LEVEL_DIV))
  }
  cultivation.learned = halved
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

  const floor = REINCARNATE_APTITUDE_FLOOR * (player.reincarnation.count + 1)
  player.rebirth(rollLinggen(rng, floor))
  // 新的一世:上一世的建号草稿作废,「逆天改命」额度归满
  useGameStore().resetCreateDraft()
  // 道途归还天地,道源与道痕随神魂不灭
  useEndgameStore().onRebirth()
  recordMilestone('first_rebirth')
  track('reincarnations')
  ui.reincarnation = null
  ui.deathDialog = false
  ui.toast('一梦轮回,你在云隐山下再度睁开双眼', 'rare')
}

export function talentName(id: string): string {
  return talentDef(id)?.name ?? id
}
