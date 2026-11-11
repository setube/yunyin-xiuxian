/**
 * 「练到头了」这一句的唯一实现。
 *
 * 同一种状态在四处各写一遍:建筑满级(buildingText.buildingPeakToast)、
 * 功法满级(gongfaText.gongfaPeakLabel)、功法行上的橙色标签(gongfaMark.peakLabel)、
 * 以及建筑卡正文里那句内联三元。AGENTS.md 的「一个状态只说一个事实」要求
 * 同一个事实在任何界面上是同一个词 —— 抄四份时改一处就漏三处。
 *
 * 为什么是「已圆满」而不是「已满级」:功法按「层」算、建筑按「级」算、修为按「分」算,
 * 「满级」只在建筑与装备上说得通;「圆满」是三者共用的那个说法,且古风一致。
 */
export const PEAK_LABEL = '已圆满'

/** 取一句「已圆满」;写成函数是为了让调用点读起来仍像在要一句话,而不像一个常量引用 */
export function peakLabel(): string {
  return PEAK_LABEL
}
