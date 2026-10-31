/**
 * 前期机制随境界的衰减系数。
 *
 * 四种机制(悟道顿悟 / 短闭关 / 洞府巡游 / 连击加成)在炼气最盛,随大境界递减。
 * earlyEventDecay 是这些机制生效强度的唯一入口,此前没有测试。
 *
 * 要钉的：
 *   1. 分段边界(0/1/2/3/4+)各取对表
 *   2. 每张表内部单调不增 —— 境界越高,前期机制不该越强
 *   3. 炼气一定是满额 1.0(前期玩法的基准),后期不会反弹
 *   4. 越界境界(负数 / 超大)不抛错,落到首尾两档
 */
import { describe, expect, it } from 'vitest'
import { EARLY_EVENT_DECAY, earlyEventDecay } from '@/data/earlyGame'

const MECHS = Object.keys(EARLY_EVENT_DECAY) as (keyof typeof EARLY_EVENT_DECAY)[]

describe('前期机制衰减 · 分段取值', () => {
  it('四种机制都在(缺一种会让该机制失去衰减)', () => {
    expect([...MECHS].sort()).toEqual(['cavePatrol', 'enlightenment', 'shortRetreat', 'streakBonus'])
  })

  it('major 0/1/2/3 各取对应阶段,4 及以上一律取 later', () => {
    for (const m of MECHS) {
      const t = EARLY_EVENT_DECAY[m]
      expect(earlyEventDecay(m, 0)).toBe(t.lianqi)
      expect(earlyEventDecay(m, 1)).toBe(t.zhuji)
      expect(earlyEventDecay(m, 2)).toBe(t.jindan)
      expect(earlyEventDecay(m, 3)).toBe(t.yuanying)
      for (const later of [4, 5, 9, 20]) {
        expect(earlyEventDecay(m, later), `${m}:major ${later} 应取 later 档`).toBe(t.later)
      }
    }
  })

  it('负数境界落到炼气档(不抛错、不返回 undefined)', () => {
    for (const m of MECHS) {
      expect(earlyEventDecay(m, -1)).toBe(EARLY_EVENT_DECAY[m].lianqi)
      expect(earlyEventDecay(m, -100)).toBe(EARLY_EVENT_DECAY[m].lianqi)
    }
  })
})

describe('前期机制衰减 · 形态', () => {
  it('每张表内部单调不增(境界越高,前期机制不该越强)', () => {
    for (const m of MECHS) {
      const t = EARLY_EVENT_DECAY[m]
      const seq = [t.lianqi, t.zhuji, t.jindan, t.yuanying, t.later]
      for (let i = 1; i < seq.length; i += 1) {
        expect(seq[i]!, `${m} 的第 ${i} 档比前一档更高`).toBeLessThanOrEqual(seq[i - 1]!)
      }
    }
  })

  it('炼气满额 1.0 —— 前期玩法以它为基准', () => {
    for (const m of MECHS) {
      expect(EARLY_EVENT_DECAY[m].lianqi, `${m} 的炼气档不是 1.0`).toBe(1)
    }
  })

  it('所有系数都在 [0, 1] 内(负系数会反转语义,>1 等于越到后期越强)', () => {
    for (const m of MECHS) {
      for (const [k, v] of Object.entries(EARLY_EVENT_DECAY[m])) {
        expect(v, `${m}.${k}=${v} 越界`).toBeGreaterThanOrEqual(0)
        expect(v, `${m}.${k}=${v} 越界`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('每张表五档齐全(少一档会让 earlyEventDecay 取到 undefined)', () => {
    for (const m of MECHS) {
      const keys = Object.keys(EARLY_EVENT_DECAY[m]).sort()
      expect(keys).toEqual(['jindan', 'later', 'lianqi', 'yuanying', 'zhuji'])
    }
  })

  it('返回值恒为有限数(供乘算直接使用)', () => {
    for (const m of MECHS) {
      for (const major of [-1, 0, 1, 2, 3, 4, 99]) {
        expect(Number.isFinite(earlyEventDecay(m, major))).toBe(true)
      }
    }
  })
})
