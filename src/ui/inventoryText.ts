/**
 * 行囊提示 —— 法宝位、化尘、构筑。
 *
 * 件数、尘石、阙件仍报清。写成「分解」「替换」「切换」太硬。
 */
export function artifactSlotReplacedToast(): string {
  return '法宝之位已满,替下最早祭炼的一件'
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

export function loadoutApplyToast(name: string, missing: number): string {
  return missing > 0 ? `已换上「${name}」,阙 ${missing} 件未配` : `已换上「${name}」`
}
