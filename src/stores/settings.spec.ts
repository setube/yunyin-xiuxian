/**
 * 设置「版本与更新」的两把闸:hasUnseenRelease 该不该亮,markReleaseSeen 点了就熄。
 *
 * 这条判据直接影响顶栏那颗朱砂圆点与设置行的「新」角标 —— 就算永远不亮,
 * 也不许在「已是当前版本」时还亮着(那会让玩家反复点、点了又不熄)。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from './settings'
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
