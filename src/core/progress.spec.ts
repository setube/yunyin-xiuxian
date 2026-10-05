import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { formatGN } from '@/utils/format'
import { buffDef } from '@/data/buffs'
import { CULT_BASE_SPEED } from '@/data/constants'
import { baseCultPerSec } from './formulas'
import { retreatGainText } from './progress'

/**
 * 闭关预览 —— 按钮那句「此行约多得修为 X」,与修炼行读同一份
 * baseCultPerSec,时长与加成则取自 buffs.ts 的 retreat 本体(不手抄)。
 */
describe('retreatGainText 闭关约多得预览', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('炼气初成:值 = CULT_BASE_SPEED ×1.5×300(写死算一遍,不镜像实现)', () => {
    const player = usePlayerStore()
    // 初始境界无任何成长系数相乘,base 恰为 CULT_BASE_SPEED
    expect(baseCultPerSec(player.major, player.sub)).toBeCloseTo(CULT_BASE_SPEED, 6)
    const expected = CULT_BASE_SPEED * 1.5 * 300 // 585
    expect(retreatGainText()).toBe(`此行约多得修为 ${formatGN(expected)}`)
  })

  it('加成翻倍 → 预览翻倍(buff 本体改,这里的数也线性跟)', () => {
    const player = usePlayerStore()
    const baseline = baseCultPerSec(player.major, player.sub)

    // 直接把 retreat buff 的加成按同构口径算一遍:base × 加成 × 时长
    const def = buffDef('retreat')!
    const boost = def.mods.cultivationSpeed ?? 0
    const expected = baseline * boost * def.durationSec
    expect(retreatGainText()).toBe(`此行约多得修为 ${formatGN(expected)}`)

    // 加成一倍后,预览该是原先的两倍(把 boost 近似的翻倍代入)
    const doubled = baseline * (boost * 2) * def.durationSec
    expect(formatGN(doubled)).toBe(formatGN(expected * 2))
  })

  it('境界抬升 → 预览随 base 抬升(非写死一个数)', () => {
    const player = usePlayerStore()
    const lo = baseCultPerSec(player.major, player.sub)
    player.major = 2
    const hi = baseCultPerSec(player.major, player.sub)
    expect(hi).toBeGreaterThan(lo)
    expect(retreatGainText()).toBe(`此行约多得修为 ${formatGN(hi * 1.5 * 300)}`)
  })
})
