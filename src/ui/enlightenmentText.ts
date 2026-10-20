/**
 * 悟道顿悟选项文案 —— 数字与时长只从 buff 本体现算。
 *
 * 选项上的 desc 曾经手写「下次进阶成功率 +8%」。实际挂上的是一枚限时增益,
 * 窗口内每次小进阶都吃,大关天劫不吃,而且弹窗根本不告诉你它持续多久。
 * 三选一比的是「加成 × 时长」,缺了时长就没法比。
 */
import type { EnlightenmentOption } from '@/types'
import { buffDef } from '@/data/buffs'
import { formatChoiceSpan } from '@/utils/format'
import { modsText } from '@/data/statNames'

export function enlightenmentOptionText(opt: EnlightenmentOption): string {
  if (opt.reward?.type === 'wudao') return `立即获得 ${opt.reward.value} 悟道点`
  if (opt.buffId) {
    const buff = buffDef(opt.buffId)
    if (buff) {
      const parts = [modsText(buff.mods), `持续 ${formatChoiceSpan(buff.durationSec)}`]
      return parts.join(',')
    }
  }
  return opt.desc
}
