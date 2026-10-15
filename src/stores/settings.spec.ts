/**
 * 设置「版本与更新」的两把闸:hasUnseenRelease 该不该亮,markReleaseSeen 点了就熄。
 *
 * 这条判据直接影响顶栏那颗朱砂圆点与设置行的「新」角标 —— 就算永远不亮,
 * 也不许在「已是当前版本」时还亮着(那会让玩家反复点、点了又不熄)。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from './settings'
import { QUALITIES } from '@/data/qualities'
import { APP_VERSION } from '@/utils/appVersion'

describe('设置 · 版本与更新', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未看过发布说明时,当前版本有说明 → 亮起', () => {
    const s = useSettingsStore()
    // 默认 lastSeenVersion = ''(从没看过),而当前版本在发布说明里有条目
    expect(s.lastSeenVersion).toBe('')
    expect(s.hasUnseenRelease).toBe(true)
  })

  it('markReleaseSeen 记下当前版本,角标随即熄灭', () => {
    const s = useSettingsStore()
    s.markReleaseSeen()
    expect(s.lastSeenVersion).toBe(APP_VERSION)
    expect(s.hasUnseenRelease).toBe(false)
  })

  it('已是当前版本(或更新)时,不再亮起', () => {
    const s = useSettingsStore()
    s.lastSeenVersion = APP_VERSION
    expect(s.hasUnseenRelease).toBe(false)
    // 看过比当前更新的版本(如对未来版本跳过)也不亮 —— 未来的发布说明不归这次提示管
    s.lastSeenVersion = '9.0.0'
    expect(s.hasUnseenRelease).toBe(false)
  })

  it('看的是旧版本、当前版本有更新 → 仍亮起', () => {
    const s = useSettingsStore()
    s.lastSeenVersion = '1.36.0'
    expect(s.hasUnseenRelease).toBe(true)
  })
})

describe('设置 · decomposeRanks 档位守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('坏档的越界/负数/重复 rank 被滤净:只留真实存在的品质且去重', () => {
    const s = useSettingsStore()
    const valid = QUALITIES.map(q => q.rank)
    s.decomposeRanks = [99, -4, 7, 7, NaN, 0, 0, 3]
    s.sanitize()
    // 全在真实品质 rank 内,且无重复
    expect(s.decomposeRanks.every(r => valid.includes(r) && Number.isInteger(r))).toBe(true)
    expect(new Set(s.decomposeRanks).size).toBe(s.decomposeRanks.length)
    expect(s.decomposeRanks).not.toContain(99)
    expect(s.decomposeRanks).not.toContain(-4)
    expect(s.decomposeRanks).not.toContain(NaN)
    // 合法值保留(0 与 3 都是真实存在的品质 rank)
    expect(s.decomposeRanks).toContain(0)
    expect(s.decomposeRanks).toContain(3)
  })
})

describe('设置 · 布尔开关坏档清洗', () => {
  it('只有字面 true 存活,其余字符串/数字真值一律 ===true 归一到 false', () => {
    const s = useSettingsStore()
    // 损坏档:四个开关混入「真值但不是 true」的东西 —— 不清洗会永久减速 / 永不静音 / 假装已同意
    ;(s as unknown as { reduceMotion: unknown }).reduceMotion = 'false'
    ;(s as unknown as { musicOn: unknown }).musicOn = 1
    ;(s as unknown as { sfxOn: unknown }).sfxOn = 'true'
    ;(s as unknown as { privacyAccepted: unknown }).privacyAccepted = 'false'
    s.sanitize()
    expect(s.reduceMotion, '字符串真值"false"不再永久减速').toBe(false)
    expect(s.musicOn, '数字 1 不再当成交(on)').toBe(false)
    expect(s.sfxOn, '字符串"true"不再当成交(on)').toBe(false)
    expect(s.privacyAccepted, '字符串"false"不再假装已同意').toBe(false)
  })
})
