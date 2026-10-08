/**
 * 宿命传承的**效果落地**。
 *
 * 与 core/heritageForge(锻造生命周期)分开:那边回答「这一世能锻得哪一个」,
 * 这边回答「已锻得的传承到底改变什么 —— 它占了哪个『能力位』」。
 *
 * 全部写成**纯函数**:把「已持有的传承 id / 每世用量」作输入,算出开关或额度,
 * 不读 store、不读时间 —— 既好测(Pinia 都不必起),也逼着每个效果只能依赖
 * 「我是谁 + 本世已用了几回」这两件输入,无法偷偷摸到攻防 / 修速做文章。
 *
 * 红线(见 data/heritage):效果必须是有界、平直的能力位,不随道果 / 世数无界增长。
 * 每世只消费一次的仍归「每世用量」账(heritageUses),跨世不带。
 */
import type { HeritageId } from '@/data/heritage'

/** 每世可用的炼丹必成炉数(浴火丹心):本世三炉,0 = 未持有 */
export function craftGuaranteeCrafts(owned: readonly HeritageId[]): number {
  return owned.includes('danxin') ? 3 : 0
}

/**
 * 浴火丹心还剩下几炉必成。由 craftPill 在「真开炉」那一下读取并消费
 * (见 core/pillService)。用量跨世不带,故每世都是满额开局。
 */
export function craftGuaranteeRemaining(
  owned: readonly HeritageId[],
  uses: Readonly<Record<string, number>> | undefined
): number {
  const max = craftGuaranteeCrafts(owned)
  if (max <= 0) return 0
  const used = uses?.danxin ?? 0
  return Math.max(0, max - used)
}

/**
 * 转世出生的**起始境界下限**(major)。元婴凝实 → 筑基(1);否则炼气(0)。
 * 出生那一下由 player.rebirth 把 major 抬到这条下限 —— 玩家睁眼即筑基。
 */
export function birthMajorFloor(owned: readonly HeritageId[]): number {
  return owned.includes('yuanying') ? 1 : 0
}

/** 转世择先天之姿多一个可选项(炼虚通感):三选一 → 四选一(平直能力位) */
export function talentChoiceBonus(owned: readonly HeritageId[]): number {
  return owned.includes('tonggan') ? 1 : 0
}

/** 已习功法等级全留(大乘道统):转世交割时不折回起手 */
export function keepsAllGongfa(owned: readonly HeritageId[]): boolean {
  return owned.includes('daotong')
}

/** 突破失败豁免(渡劫跬步):持有则每世有一次豁免额度(一次性容错) */
export function hasBreakExemption(owned: readonly HeritageId[]): boolean {
  return owned.includes('dubu')
}

/** 认知按最高档全带(真仙道痕):转世睁眼即认得所有灵材,不因本世境界受限 */
export function carriesAllLore(owned: readonly HeritageId[]): boolean {
  return owned.includes('daoben')
}
