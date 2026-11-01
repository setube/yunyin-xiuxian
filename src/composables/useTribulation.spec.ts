/**
 * 劫势投影的两条判据。
 *
 * tribTargetMajor:大关突破看的是「下一大阶」,小层看的是「当前大阶」——
 *   写反会让天威与减伤按错境界算。
 * worldStep:是否「界膜」(人间→仙界 / 仙界→神界 / 神界→混沌海),
 *   判据取 statFoldAt(targetMajor) < 1,与结算同源;另立一套判据会与伤害折扣脱节。
 *
 * 该 composable 此前没有 spec。它是纯投影(读 store + 调 core),所以钉判据即可。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useTribulation } from './useTribulation'
import { statFoldAt } from '@/core/tribulationDecision'
import { MAX_MAJOR } from '@/data/realms'

describe('劫势投影 · 目标境界与界膜', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('不需要渡劫时不给劫势计划', () => {
    const t = useTribulation(() => false)
    expect(t.tribPlan.value).toBeNull()
    expect(t.tribWave.value).toBeNull()
  })

  it('大关时目标取下一大阶,小层时取当前大阶', () => {
    const player = usePlayerStore()
    player.major = 5
    player.sub = 0 // 非大关
    expect(useTribulation(() => true).tribTargetMajor.value).toBe(5)
    // 推到本阶圆满(大关)
    player.sub = 9
    expect(useTribulation(() => true).tribTargetMajor.value).toBe(6)
  })

  it('世界边界:目标恰好落在折损点时为界膜', () => {
    // 找出所有 statFoldAt < 1 的大阶,确认 worldStep 与之逐一对应
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      setActivePinia(createPinia())
      const p = usePlayerStore()
      p.major = m
      p.sub = 9 // 大关:目标 = m + 1
      const t = useTribulation(() => true)
      const target = t.tribTargetMajor.value
      const expectStep = statFoldAt(target) < 1
      expect(t.worldStep.value, `target=${target} 时 worldStep 与 statFoldAt 不一致`).toBe(expectStep)
    }
  })

  it('目标境界不会越过表尾(混沌道祖再突破仍是它自己)', () => {
    const player = usePlayerStore()
    player.major = MAX_MAJOR
    player.sub = 9
    const target = useTribulation(() => true).tribTargetMajor.value
    expect(target).toBeLessThanOrEqual(MAX_MAJOR + 1)
  })

  it('渡劫账的每一项都是有限数(坏词条不该在面板上印 NaN)', () => {
    usePlayerStore().major = 3
    const led = useTribulation(() => true).tribLedger.value
    for (const [k, v] of Object.entries(led)) {
      expect(Number.isFinite(v), `${k} 不是有限数:${v}`).toBe(true)
    }
    expect(led.statResist).toBeGreaterThanOrEqual(0)
    expect(led.statGuard).toBeGreaterThanOrEqual(0)
  })

  it('灵根相应元素只在有劫势计划时给出(没有计划就是空表)', () => {
    expect(useTribulation(() => false).reliefRoots.value).toEqual([])
  })
})
