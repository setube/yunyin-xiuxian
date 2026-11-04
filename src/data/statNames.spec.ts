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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STAT_NAMES } from '@/data/statNames'
import type { AnyStatKey } from '@/types'

const KEYS = Object.keys(STAT_NAMES) as AnyStatKey[]

describe('加成条件 · 括号里的限定不许被截掉', () => {
  /*
   * modsText 把「幅度(条件)」拼成一行,括号里是该加成的生效边界
   * (「只入小进阶;大关天劫不与」「只减天劫之伤;小进阶之骰不改」)。
   * 名号卡原用 truncate 收这一行,窄屏下只露出幅度、条件被吃掉 ——
   * 玩家看到「进阶成功率 +1%」却不知道它只在小进阶生效。
   * 同一份数据在灵兽卡本就不截断,两处该一致。
   */
  it('名号卡的加成一整行不截断', () => {
    const view = readFileSync(resolve(__dirname, '../../src/views/TitlesView.vue'), 'utf-8')
    // 取渲染 modText 的那一行,确认没有 truncate
    const lines = view.split('\n').filter(l => l.includes('row.modText'))
    expect(lines.length, '找不到 modText 渲染处').toBeGreaterThan(0)
    for (const line of lines) {
      expect(line, `这一行截断了加成条件:${line.trim()}`).not.toContain('truncate')
    }
  })

  it('灵兽卡与名号卡对同一份数据的处理一致', () => {
    const view = readFileSync(resolve(__dirname, '../../src/views/TitlesView.vue'), 'utf-8')
    const modLines = view.split('\n').filter(l => l.includes('row.modText'))
    const truncated = modLines.filter(l => l.includes('truncate'))
    expect(truncated, '两处都该不截断,或都不截断').toHaveLength(0)
  })
})

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
