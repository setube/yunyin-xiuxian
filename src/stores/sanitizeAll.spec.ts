/**
 * sanitizeAllStores —— 逐仓字段级自愈的唯一入口。
 *
 * 启动(首次渲染前)、引擎 start、离线结算前三处都走这一份清单;这里钉住两件事:
 * ①坏字段(NaN/负值)确实被修平;②健康存档幂等(修了等于没修,不产生意外改动)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sanitizeAllStores } from '@/stores/sanitizeAll'
import { useResourcesStore } from '@/stores/resources'

describe('sanitizeAllStores 逐仓自愈', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('坏字段被修平:资源 NaN / 负值夹回 0', () => {
    const r = useResourcesStore()
    r.$patch({ wudao: Number.NaN, ore: -5 })
    sanitizeAllStores()
    expect(r.wudao).toBe(0) // NaN → 0
    expect(r.ore).toBe(0) // -5 → max(0,·) = 0
  })

  it('健康存档幂等:逐仓自愈后原样不变', () => {
    const r = useResourcesStore()
    r.$patch({ wudao: 3, ore: 4 })
    sanitizeAllStores()
    expect(r.wudao).toBe(3)
    expect(r.ore).toBe(4)
  })
})
