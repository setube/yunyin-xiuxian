/** 构建玩家战斗快照 */
import type { ArtifactDef, CombatantSnap } from '@/types'
import { artifactDef } from '@/data/artifacts'
import { COMBO_SECONDARY_MIN, matchComboArt } from '@/data/comboArts'
import { usePlayerStore } from '@/stores/player'
import { useCultivationStore } from '@/stores/cultivation'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { modOf } from './statsCalc'
import { detectBuild } from './buildDetect'
import { stackedMods, swordPurity, SWORD_LAYER_MODS } from './daoDepth'
import { hasActiveSet } from './equipSet'

export function buildPlayerSnap(): CombatantSnap {
  const player = usePlayerStore()
  const cultivation = useCultivationStore()
  const inventory = useInventoryStore()
  const endgame = useEndgameStore()
  const stats = player.finalStats
  const artifacts = inventory.currentArtifacts
    .map(a => ({ def: artifactDef(a.defId), level: a.level }))
    .filter((x): x is { def: ArtifactDef; level: number } => x.def !== undefined)

  const build = detectBuild(stats.mods)
  // 流派组合技:主副体系凑对且副体系足够成形
  const comboArt =
    build?.secondary && build.secondary.affinity >= COMBO_SECONDARY_MIN
      ? (matchComboArt(build.style.id, build.secondary.style.id)?.id ?? undefined)
      : undefined
  // 剑道·剑意:道途越纯,剑意越盛(全局生效)
  let mods = stats.mods
  if (endgame.daoPath === 'sword') {
    const purity = swordPurity(stats.mods, artifacts.length, build)
    mods = stackedMods(stats.mods, SWORD_LAYER_MODS, purity.layers)
  }

  return {
    name: player.name,
    icon: 'user',
    isPlayer: true,
    attack: stats.attack,
    defense: stats.defense,
    maxHp: stats.maxHp,
    speed: 1 + modOf(stats.mods, 'speed'),
    mods,
    skills: cultivation.mainSkill ? [cultivation.mainSkill] : [],
    artifacts,
    comboArt,
    // Phase 31 S5:铁壁共鸣(同套 2 件 → 首次致命伤保命)
    ironwallBrace: hasActiveSet(inventory.equippedItems, 'ironwall')
  }
}
