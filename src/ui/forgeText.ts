/**
 * 炼器提示 —— 文言说事,数字与材料不省。
 *
 * 强化、分解、祭炼都是高频操作。写成「不足」「已达上限」太像账房,
 * 但若只剩气氛、不报尘与石,玩家又不知差在哪。
 */
export function upgradeCapToast(): string {
  return '此器已至锤炼之极,再锻无益'
}

/**
 * 强化缺料 —— 同重铸:灵石与器灵尘来路相反,不能一句「或」糊过去。
 * 只缺尘时玩家该去分解闲置装备,只缺石时该去历练/悬赏,指错方向只会在另一处再缺一次。
 */
export function upgradeShortToast(short: 'stone' | 'dust', gap?: { stone: string; dust: number }): string {
  const amount = short === 'stone' ? gap?.stone : gap?.dust
  const missing = amount ? `尚差 ${amount}` : '未足'
  return short === 'stone'
    ? `灵石${missing},炉火难续(灵石自历练与悬赏来)`
    : `器灵尘${missing},炉火难续(分解闲置装备可得)`
}

export function upgradeDoneToast(name: string, level: number): string {
  return `「${name}」再经一锤,已至 +${level}`
}

/** 连升的总结账:一锤一锤报太吵,连升只报一次总况(stoneText 由调用方 formatGN 好) */
export function upgradeBatchDoneToast(levels: number, newLevel: number, dust: number, stoneText: string): string {
  return `连升 ${levels} 级,如今 +${newLevel},共耗器灵尘×${dust} · 灵石 ${stoneText}`
}

export function salvageYieldText(dust: number, stoneText?: string): string {
  return stoneText ? `器灵尘×${dust} · 灵石退还 ${stoneText}` : `器灵尘×${dust}`
}

export function decomposeToast(dust: number, stoneText?: string, refund?: string): string {
  const yieldText = salvageYieldText(dust, stoneText)
  const base = `此器化尘,得${yieldText}`
  return stoneText && refund ? `${base}(${refund})` : base
}

export function batchDecomposeToast(count: number, yieldText: string): string {
  return `炉中化去 ${count} 件,得${yieldText}`
}

export function artifactCapToast(): string {
  return '此宝已臻圆满,再祭无益'
}

export function artifactShortToast(short: 'wudao' | 'stone'): string {
  return short === 'wudao'
    ? '悟道点未足,祭炼难继(藏经阁与顿悟可得)'
    : '灵石未足,祭炼难继(灵石自历练与悬赏来)'
}

export function artifactDoneToast(name: string): string {
  return `「${name}」祭炼又进一重`
}

/** 祭炼连升的总结账:一重一重报太吵,连炼只报一次总况(stoneText 由调用方 formatGN 好) */
export function artifactBatchDoneToast(levels: number, newLevel: number, wudao: number, stoneText: string): string {
  return `连炼 ${levels} 重,已至第 ${newLevel} 重,共耗悟道×${wudao} · 灵石 ${stoneText}`
}
