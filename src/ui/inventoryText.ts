/** 行囊提示(法宝位、化尘、构筑):只报结果;件数、尘石、阙件照实报。 */
import { batchDecomposeToast } from './forgeText'

/**
 * 随身/收回的回执。
 *
 * 原先只有「替下」那一支有回执:正常随身与收回都是静默生效 ——
 * 点完看不出成没成,「收回法宝」与「随身携带」是同一颗钮,
 * 没有回执时玩家只能靠卡片上那个「祭」字标记反推。
 * 称号的佩/卸、灵兽的唤来/暂别、行囊的一键换装都有回执,这里补齐同一套。
 *
 * 用「随身」不取「祭炼」:法宝面板里「祭炼」已经专指重数(`祭炼 3/9 重`、
 * 「祭炼一重,被动与神通各强」),再用它说携带,同一屏里一个词两个动作。
 */
export function artifactToggleToast(name: string, equipped: boolean): string {
  return equipped ? `已随身「${name}」` : `已收回「${name}」`
}

export function artifactSlotReplacedToast(evicted: readonly string[] = []): string {
  if (evicted.length === 0) return '已替下最早祭炼的一件'
  if (evicted.length === 1) return `已替下「${evicted[0]}」`
  return `已替下${evicted.join('、')}`
}

export function decomposeEmptyToast(): string {
  return '无可化尘'
}

/** 清理行囊的回执:与一键分解的总账同一句 */
export function smartCleanToast(count: number, yieldText: string): string {
  if (count <= 0) return decomposeEmptyToast()
  return batchDecomposeToast(count, yieldText)
}

export function loadoutFullToast(max: number): string {
  return `快照已满 · 上限 ${max} 套`
}

export function loadoutSavedToast(name: string): string {
  return `构筑「${name}」已保存`
}

/** 改名回执:文案须与「已保存」分开 */
export function loadoutRenamedToast(name: string): string {
  return `构筑「${name}」已改名`
}

/**
 * 换装回执:阙件报出哪几件,不只报个数。
 * `slotLimited` = 缺的原因里有「槽位不够」(辅修槽随藏经阁、法宝位随境界):标「槽位不足」,与「没学过 / 没收藏」的阙件分开。
 */
export function loadoutApplyToast(
  name: string,
  missing: number,
  missingNames: string[],
  slotLimited = false
): string {
  if (missing <= 0) return `已换上「${name}」`
  const head = `已换上「${name}」,阙 ${missing} 件${slotLimited ? '(槽位不足)' : ''}`
  if (missingNames.length > 0) {
    const list = [...new Set(missingNames)].slice(0, 3).join('、')
    return `${head}:${list}`
  }
  return head
}

/**
 * 装备槽卡的可访问名。
 *
 * 卡面上印着三样:槽位名(武器/衣袍…)、已经戴着的那件(**名字 + 强化数 + 自定标记**)、
 * 以及有没有可换的。可访问名原先只有「武器」或「武器,可换」——
 * 玩家从读屏里听不出这个格子现在是空的还是戴了什么。
 *
 * 空与有由正文自己表达,不靠透明度(见槽位卡的注释);名字里也照这条:
 * 空的就说「未装备」,有的就说那一件的名字。
 *
 * @param slotName 槽位名(取 data/equipment 的 EQUIP_SLOT_NAMES)
 * @param equipped 现戴着的那件的说法;空槽为 null
 * @param canSwap  有没有更优的件可换
 */
export function equipSlotLabel(slotName: string, equipped: string | null, canSwap: boolean): string {
  const parts = [slotName, equipped ?? '未装备']
  if (canSwap) parts.push('可换')
  return parts.join(' · ')
}
