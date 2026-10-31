/**
 * 属性键 → 中文名的唯一命名表。
 *
 * STAT_NAMES 声明为 Record<AnyStatKey, string>,所以「不漏键」由类型系统保证,
 * 本文件不重复验那件事。要验的是类型管不到的三件:
 *   1. 名字非空且不含英文键名(漏翻译时界面会露出 attackPct 这种字样)
 *   2. 两个键不同名(同名会让玩家在词条列表里分不清)
 *   3. 名字长度克制(面板一格放不下长句)
 *
 * 另钉一条元约定:键总数 —— 注释里曾写「45 个属性键」而实际是 43,
 * 这类数字每加一个词条就会过期,所以这里只断言「与 STAT_NAMES 自身长度一致」不写死。
 */
import { describe, expect, it } from 'vitest'
import { STAT_NAMES } from '@/data/statNames'
import type { AnyStatKey } from '@/types'

const KEYS = Object.keys(STAT_NAMES) as AnyStatKey[]

describe('属性名表 · 类型管不到的质量', () => {
  it('每个键都有非空中文名', () => {
    for (const k of KEYS) {
      const name = STAT_NAMES[k]
      expect(typeof name, `${k} 的名字不是字符串`).toBe('string')
      expect(name.trim().length, `${k} 的名字是空白`).toBeGreaterThan(0)
    }
  })

  it('名字里不含英文键名(漏翻译会让界面直接露出 attackPct)', () => {
    for (const k of KEYS) {
      expect(STAT_NAMES[k], `${k} 的名字里混进了英文键名`).not.toBe(k)
      expect(/[A-Za-z]/.test(STAT_NAMES[k]), `${k} 的名字「${STAT_NAMES[k]}」含英文字母`).toBe(false)
    }
  })

  it('两个键不同名(同名会让玩家在词条列表里分不清)', () => {
    const byName = new Map<string, string>()
    for (const k of KEYS) {
      const prev = byName.get(STAT_NAMES[k])
      expect(prev, `「${STAT_NAMES[k]}」同时是 ${prev} 与 ${k} 的名字`).toBeUndefined()
      byName.set(STAT_NAMES[k], k)
    }
  })

  it('名字长度克制:面板一格放不下长句', () => {
    for (const k of KEYS) {
      expect(STAT_NAMES[k].length, `${k} 的名字「${STAT_NAMES[k]}」过长`).toBeLessThanOrEqual(6)
    }
  })

  it('表非空,且键数在合理量级(防止误删整段)', () => {
    expect(KEYS.length).toBeGreaterThan(30)
    expect(KEYS.length).toBeLessThan(80)
  })
})
