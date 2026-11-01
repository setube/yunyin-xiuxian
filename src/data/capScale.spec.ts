/**
 * 洞府主殿等级与离线上限档位的对应关系。
 *
 * `OFFLINE_CAP_HOURS = [8, 12, 24, 48, 72]` 的索引即主殿等级,dongfu 里读的是
 * `OFFLINE_CAP_HOURS[Math.min(mansion, length - 1)]`。这条对应关系**此前没有任何测试**:
 * 现有用例只验了「offlineCapHours > 0」。
 *
 * 要钉的是两端对齐:数组长度 - 1 必须等于主殿满级。
 * 主殿若升到 5 级而数组不变,上限会卡在 72 小时再也不涨(而且没人会发现);
 * 数组若多一档,那一档永远用不上。
 */
import { describe, expect, it } from 'vitest'
import { OFFLINE_CAP_HOURS } from '@/data/constants'
import { BUILDINGS } from '@/data/buildings'

const MANSION = BUILDINGS.find(b => b.id === 'mansion')

describe('离线上限档位 · 与主殿满级对齐', () => {
  it('主殿存在且带等级上限', () => {
    expect(MANSION, '找不到主殿(mansion)建筑').toBeDefined()
    expect(MANSION!.maxLevel, '主殿没有 maxLevel').toBeGreaterThan(0)
  })

  it('档位数量 = 主殿满级 + 1(索引 0 是未升级)', () => {
    expect(
      OFFLINE_CAP_HOURS.length - 1,
      `主殿满级 ${MANSION!.maxLevel},而 OFFLINE_CAP_HOURS 有 ${OFFLINE_CAP_HOURS.length} 档 —— 两者必须对齐,否则上限会卡住或有一档永远用不上`
    ).toBe(MANSION!.maxLevel)
  })

  it('档位严格递增(每升一级都真的多给时长)', () => {
    for (let i = 1; i < OFFLINE_CAP_HOURS.length; i += 1) {
      expect(OFFLINE_CAP_HOURS[i]!, `第 ${i} 档不比第 ${i - 1} 档多`).toBeGreaterThan(OFFLINE_CAP_HOURS[i - 1]!)
    }
  })

  it('首档有底(离线一开就能结出收益),末档有界(不至于无限离线)', () => {
    expect(OFFLINE_CAP_HOURS[0]!, '未升主殿时上限不应为 0').toBeGreaterThan(0)
    expect(OFFLINE_CAP_HOURS[OFFLINE_CAP_HOURS.length - 1]!, '满级上限过大,离线会压过在线').toBeLessThanOrEqual(168)
  })

  it('主殿每升一级都在上限里体现(满级档确实是最长的一档)', () => {
    const maxLevel = MANSION!.maxLevel
    const atMax = OFFLINE_CAP_HOURS[Math.min(maxLevel, OFFLINE_CAP_HOURS.length - 1)]!
    expect(atMax).toBe(OFFLINE_CAP_HOURS[OFFLINE_CAP_HOURS.length - 1])
  })
})
