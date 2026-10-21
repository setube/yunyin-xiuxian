/**
 * 修行页提示 —— 疗伤、备药、突破门槛。
 *
 * 卡片与 toast 同源。写成「不足」太硬,缕数与药资仍得报清。
 */
export function repairIdleToast(): string {
  return '周身无恙,无须静养'
}

export function repairShortToast(shortText: string, qiText: string): string {
  return `灵气尚差 ${shortText} 缕,静养需 ${qiText} 缕`
}

export function repairDoneToast(qiText: string): string {
  return `你引灵气静养,伤势尽复(耗灵气 ${qiText})`
}

export function repairActLabel(affordable: boolean, qiText: string, shortText: string): string {
  return affordable ? `引气疗伤 · 耗灵气 ${qiText}` : repairShortToast(shortText, qiText)
}

export function prepPillShortToast(shortText: string): string {
  return `灵石尚差 ${shortText},无以备药`
}

/** 服聚气丹按钮欠资时的禁用说明 —— 与备药 toast 同读一份实际石差 */
export function prepPillDisabledLabel(shortText: string): string {
  return `灵石尚差 ${shortText}`
}

export function breakthroughPeakReason(): string {
  return '已至大道尽头'
}

export function breakthroughExpReason(): string {
  return '修为未至圆满'
}

export function breakthroughQiReason(qiText: string): string {
  return `灵气未足,此关需 ${qiText} 缕`
}

export function breakthroughActLabel(needTribulation: boolean): string {
  return needTribulation ? '引劫突破' : '尝试突破'
}

export function breakthroughGoalText(near: boolean, needTribulation: boolean, targetLabel: string): string {
  if (!near) return `向「${targetLabel}」迈进`
  return `${breakthroughActLabel(needTribulation)}「${targetLabel}」`
}

export function breakthroughReadyNote(needTribulation: boolean): string {
  return `修为已至圆满,可${breakthroughActLabel(needTribulation)}`
}

// ---- 悟道兑换(Phase C-1):灵石 → 悟道点,tost 文案一处出,不在视图里硬写 ----
export function exchangeOkToast(reward: number): string {
  return `悟道点 +${reward}`
}
export function exchangeFailText(lockedByRealm: boolean, dailyFull: boolean, stoneShortText: string): string {
  if (lockedByRealm) return '境界未到,兑换未开'
  if (dailyFull) return '今日已兑满,明日再来'
  return `灵石尚差 ${stoneShortText},难兑悟道`
}
