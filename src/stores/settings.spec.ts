/**
 * 版本与更新:hasUnseenRelease 该不该亮,markReleaseSeen 点了就熄。
 * 驱动顶栏朱砂圆点与设置行「新」角标;已是当前版本时不许亮。
 */
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from './settings'
import { QUALITIES } from '@/data/qualities'
import { APP_VERSION } from '@/utils/appVersion'

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false
    })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('设置 · 版本与更新', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未看过发布说明时,当前版本有说明 → 亮起', () => {
    const s = useSettingsStore()
    // 当前版本在发布说明里有条目
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
    expect(s.decomposeRanks.every(r => valid.includes(r) && Number.isInteger(r))).toBe(true)
    expect(new Set(s.decomposeRanks).size).toBe(s.decomposeRanks.length)
    expect(s.decomposeRanks).not.toContain(99)
    expect(s.decomposeRanks).not.toContain(-4)
    expect(s.decomposeRanks).not.toContain(NaN)
    // 0 与 3 是真实存在的品质 rank
    expect(s.decomposeRanks).toContain(0)
    expect(s.decomposeRanks).toContain(3)
  })
})

describe('设置 · 布尔开关坏档清洗', () => {
  /*
   * 新 pinia = 干净的 settings 分片。
   *
   * 原先没有 beforeEach:`useSettingsStore()` 复用上一条用例的实例,
   * 而本组会把字段直接改成脏值('false' / 1 / 'true')再 sanitize ——
   * 乱序下若前面某条已经改过同一字段,sanitize 的输入就不是这条想要的,
   * 报出来是「字符串真值"false"不再永久减速」这种像是真回归的话。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('只有字面 true 存活,其余字符串/数字真值一律 ===true 归一到 false', () => {
    const s = useSettingsStore()
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

describe('设置 · 智能收纳品质线坏档清洗', () => {
  /*
   * 新 pinia = 干净的 settings 分片。
   *
   * 本组把 `smartKeep` 改坏再 sanitize,复用上一条用例的实例时输入就不是这条想要的:
   * 乱序下两条都红,报的是「只留真实存在的品质 rank」这种像真回归的话。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('认不出的品质线回落灵品:99 不再让所有掉落静默化尘', () => {
    const s = useSettingsStore()
    s.smartKeep = { ...s.smartKeep, enabled: true, minQuality: 99, keepMinTier: 0 }
    s.sanitize()
    const valid = QUALITIES.map(q => q.rank)
    expect(valid.includes(s.smartKeep.minQuality), '只留真实存在的品质 rank').toBe(true)
    expect(s.smartKeep.minQuality, '默认回落灵品').toBe(3)
  })

  it('合法品质线原样保留', () => {
    const s = useSettingsStore()
    s.smartKeep = { ...s.smartKeep, minQuality: 5 }
    s.sanitize()
    expect(s.smartKeep.minQuality).toBe(5)
  })
})

describe('设置 · reduceMotion 系统偏好播种', () => {
  it('系统开了减少动效:首次创建的应用内默认值随之打开', () => {
    stubMatchMedia(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().reduceMotion).toBe(true)
  })

  it('系统没开:维持 false,行为不变', () => {
    stubMatchMedia(false)
    setActivePinia(createPinia())
    expect(useSettingsStore().reduceMotion).toBe(false)
  })

  it('环境没有 window(node / 未来宿主):不抛,回落 false', () => {
    vi.stubGlobal('window', undefined)
    setActivePinia(createPinia())
    expect(useSettingsStore().reduceMotion).toBe(false)
  })
})
