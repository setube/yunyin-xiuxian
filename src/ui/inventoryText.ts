/**
 * 行囊提示 —— 法宝位、化尘、构筑。
 *
 * 件数、尘石、阙件仍报清。写成「分解」「替换」「切换」太硬。
 */
export function artifactSlotReplacedToast(evicted: readonly string[] = []): string {
  if (evicted.length === 0) return '法宝之位已满,替下最早祭炼的一件'
  if (evicted.length === 1) return `法宝之位已满,替下「${evicted[0]}」`
  return `法宝之位已满,替下${evicted.join('、')}`
}

export function decomposeEmptyToast(): string {
  return '行囊中无可化尘之物'
}

export function smartCleanToast(count: number, yieldText: string): string {
  if (count <= 0) return '行囊中皆是有缘之物'
  return `收纳既毕,${count} 件无缘之物化尘,${yieldText}`
}

export function loadoutFullToast(max: number): string {
  return `构筑至多 ${max} 套,先卸去一套再存`
}

export function loadoutSavedToast(name: string): string {
  return `构筑「${name}」已存入行囊`
}

/** 改名与保存是两回事:只动名号,不装包 —— 文案得分得开,免得「已存入行囊」撒谎 */
export function loadoutRenamedToast(name: string): string {
  return `构筑「${name}」已改名`
}

/**
 * 换装结果的汇报 —— 阙的不止一个数:「哪几件没了」才是玩家下一步要去补的,
 * 只报个数等于让人回到行囊里重新核对一遍
 *
 * `slotLimited` = 缺的原因里有「槽位不够」(辅修槽随藏经阁、法宝位随境界):
 * 那种缺不是去历练/坊市能补的,说清该升级哪一处,否则玩家照着名单白找一圈。
 */
export function loadoutApplyToast(
  name: string,
  missing: number,
  missingNames: string[],
  slotLimited = false
): string {
  if (missing <= 0) return `已换上「${name}」`
  if (missingNames.length > 0) {
    const list = [...new Set(missingNames)].slice(0, 3).join('、')
    return slotLimited
      ? `已换上「${name}」,阙 ${missing} 件(槽位不足,升级藏经阁/提高境界):${list}`
      : `已换上「${name}」,阙 ${missing} 件:${list}`
  }
  return slotLimited
    ? `已换上「${name}」,阙 ${missing} 件(槽位不足,升级藏经阁/提高境界)`
    : `已换上「${name}」,阙 ${missing} 件`
}
