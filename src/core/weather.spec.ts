/**
 * Phase 31.0 A1:天时 —— 每日确定性环境
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { todayWeather, weatherDef, WEATHERS } from './weather'
import { useGameStore } from '@/stores/game'

describe('天时(weather)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('五种天时完整:灵雨/赤阳/月蚀/雷鸣/清和', () => {
    expect(WEATHERS.map(w => w.id)).toEqual(['lingyu', 'chiyang', 'yueshi', 'leiming', 'qinghe'])
    for (const w of WEATHERS) {
      expect(w.desc).toBeTruthy()
    }
  })

  it('确定性:同一游戏日多次计算得出同一结果', () => {
    const game = useGameStore()
    game.$patch({ totalPlaySec: 86400 * 3 + 1000 })
    const a = todayWeather()
    const b = todayWeather()
    expect(a.id).toBe(b.id)
  })

  it('不同游戏日结果存在分布(100 天抽到过多种)', () => {
    const game = useGameStore()
    const seen = new Set<string>()
    for (let d = 1; d <= 100; d++) {
      game.$patch({ totalPlaySec: d * 86400 })
      seen.add(todayWeather().id)
    }
    // 至少出现 3 种(5 种并非全均衡,但 100 天应见多种)
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })

  it('雷鸣:渡劫更险(倍率>1)', () => {
    const lm = weatherDef('leiming')
    expect(lm?.tribulationMult).toBeGreaterThan(1)
  })

  it('灵雨:修炼/灵气加成', () => {
    const ly = weatherDef('lingyu')
    expect((ly?.mods.cultivationSpeed ?? 0)).toBeGreaterThan(0)
    expect((ly?.mods.qiRegen ?? 0)).toBeGreaterThan(0)
  })
})
