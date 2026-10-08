/**
 * 宿命传承的锻造生命周期。
 *
 * 防浅修的三道闸:
 *   ① 门槛:只锻造 `gateMajor <= 本世所达境界` 的传承 —— 金丹(major 2)以下
 *      浅修农场永远返回空;
 *   ② 一世至多一悟:同世到多个未锻造门槛,只锻造**最高**那一个 —— 不滚雪球;
 *   ③ 永久持有:入 `player.reincarnation.heritage`,随神魂不灭,跨世不清零,
 *      重复锻造(旧档残留/重复触发)被 addHeritage 忽略。
 *
 * 结算口径与 reincarnation.ts 一致:「只算不改」——本文件只回答「这一世能/会
 * 锻造哪个」,落账(写进 player.reincarnation.heritage)发生在 confirmReincarnation
 * (见它的 forgedHeritage 提交)。本关不写任何资源流,不参与经济结算。
 */
import { HERITAGE_DEFS, type HeritageDef, type HeritageId } from '@/data/heritage'
import { usePlayerStore } from '@/stores/player'

/** 已锻造的传承 id(跨世永久,取自神魂不灭的 reincarnation.heritage) */
export function ownedHeritage(): HeritageId[] {
  return usePlayerStore().reincarnation.heritage
}

/**
 * 候选:所有「gateMajor <= major 且尚未锻造」的传承(按门槛升序)。
 * 浅修农场(major < 2)永远返回空 —— 金丹以下锻造不出任何传承。
 */
export function forgeCandidate(major: number): HeritageDef[] {
  const owned = new Set(ownedHeritage())
  return HERITAGE_DEFS.filter(d => d.gateMajor <= major && !owned.has(d.id)).sort(
    (a, b) => a.gateMajor - b.gateMajor
  )
}

/**
 * 一世至多一悟:取本世到达的最高未锻造门槛(序末位,即最深那一道)。
 * 无候选 → null。
 */
export function lifeForge(major: number): HeritageDef | null {
  const cands = forgeCandidate(major)
  return cands.length > 0 ? cands[cands.length - 1]! : null
}
