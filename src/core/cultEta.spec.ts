import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { gn, mulN, sub, toNum } from '@/utils/gnum'
import { usePlayerStore } from '@/stores/player'
import { expEtaSec } from './progress'

/**
 * 修为圆满的估算时长 —— 判据是「缺口 ÷ 现速」这道同源除法:
 * 与修炼页那条进度条读的是同一份 exp / expReq / cultPerSec,
 * 界面上那句「按现速,修为圆满约……」就是在报这个值。
 */
describe('expEtaSec 修为圆满估算(与面板同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未圆满:值 = 缺口 ÷ 现速,不另造口径', () => {
    const player = usePlayerStore()
    const rate = player.cultPerSec // 本就是普通数,不套 toNum
    const gap = toNum(sub(player.expReq, player.exp))
    expect(expEtaSec()).toBeCloseTo(gap / rate, 4)
  })

  it('半程比全程少一半:估算随缺口线性走', () => {
    const player = usePlayerStore()
    const full = expEtaSec()
    player.exp = mulN(player.expReq, 0.5)
    const half = expEtaSec()
    expect(half).toBeCloseTo(full / 2, 4)
  })

  it('修为已圆满 → 0(不再报「还需几时」)', () => {
    const player = usePlayerStore()
    player.exp = mulN(player.expReq, 1.5)
    expect(expEtaSec()).toBe(0)
  })

  it('零缺口边界:exp 恰好压在需求上 → 0', () => {
    const player = usePlayerStore()
    player.exp = player.expReq
    expect(expEtaSec()).toBe(0)
  })

  it('速率是除数而不是被除数:加速只会缩短,不会拉长', () => {
    const player = usePlayerStore()
    player.exp = gn(0)
    const before = expEtaSec()
    // 等价地:现速翻倍后,同一缺口的时间应折半 —— 若有人把式子写成 gap×rate 就废了
    const rate = player.cultPerSec
    const atDouble = toNum(player.expReq) / (rate * 2)
    expect(before).toBeGreaterThan(0)
    expect(atDouble).toBeCloseTo(before / 2, 4)
  })
})
