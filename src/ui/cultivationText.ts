/**
 * 修行页提示 —— 疗伤、备药、突破门槛。
 *
 * 卡片与 toast 同源。写成「不足」太硬,缕数与药资仍得报清。
 */
export function repairIdleToast(): string {
  return '周身无恙,无须静养'
}

export function repairShortToast(qiText: string): string {
  return `灵气未足,静养需 ${qiText} 缕`
}

export function repairDoneToast(qiText: string): string {
  return `你引灵气静养,伤势尽复(耗灵气 ${qiText})`
}

export function repairActLabel(affordable: boolean, qiText: string): string {
  return affordable ? `引气疗伤 · 耗灵气 ${qiText}` : repairShortToast(qiText)
}

export function prepPillShortToast(): string {
  return '灵石未足,无以备药'
}

/** 服聚气丹按钮欠资时的禁用说明 —— 与备药 toast 同一句「灵石未足」,不在模板里手打 */
export function prepPillDisabledLabel(): string {
  return '灵石未足'
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
