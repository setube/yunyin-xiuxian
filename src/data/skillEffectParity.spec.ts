/**
 * 技能附加效果的「声明表」与「实际处理」必须严格相等。
 *
 * 两处独立维护:
 *   - data/constants.ts 的 COMBAT_SKILL_EFFECTS —— 读档时用它过滤
 *     (`saveShape.asCombatSkill` 里 `includes(s.effect) ? s.effect : undefined`)
 *   - core/combat.ts 的 `effect === '...'` 分支 —— 真正让它生效的地方
 *
 * 不同步的两种后果都是静默的:
 *   - 处理有、声明没有 ⇒ 读档时被当野值丢掉,这个效果**永远打不出来**
 *   - 声明有、处理没有 ⇒ 通过了读档校验却什么也不做,玩家看到「有特效」而无实感
 *
 * 两处都用字符串字面量,类型系统连不上,只能靠这条数量/集合关系兜。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { COMBAT_SKILL_EFFECTS } from '@/data/constants'
import { asCombatSkills } from '@/utils/saveShape'

/** 从 combat.ts 源码里抽出所有被比较的 effect 名 */
function handledInCombat(): string[] {
  const src = readFileSync(new URL('../core/combat.ts', import.meta.url), 'utf-8')
  const set = new Set<string>()
  for (const m of src.matchAll(new RegExp(`effect === '([a-z]+)'`, 'g'))) set.add(m[1]!)
  return [...set].sort()
}

describe('技能附加效果 · 声明与处理一致', () => {
  it('combat.ts 里抽得到 effect 分支(防止正则失效后空转)', () => {
    expect(handledInCombat().length, '一条 effect 分支都没抽到,正则可能已失配').toBeGreaterThanOrEqual(3)
  })

  it('声明表非空且无重复', () => {
    expect(COMBAT_SKILL_EFFECTS.length).toBeGreaterThan(0)
    expect(new Set(COMBAT_SKILL_EFFECTS).size).toBe(COMBAT_SKILL_EFFECTS.length)
  })

  it('combat.ts 处理的每个 effect 都在声明表里(否则读档会被当野值丢掉,永远打不出来)', () => {
    const declared = new Set<string>(COMBAT_SKILL_EFFECTS)
    const missing = handledInCombat().filter(e => !declared.has(e))
    expect(missing, '这些效果引擎会处理,但读档时会被当野值剔除').toEqual([])
  })

  it('声明表里每个 effect 都有对应分支(否则可能通过校验却什么也不做)', () => {
    const handled = new Set(handledInCombat())
    const orphan = COMBAT_SKILL_EFFECTS.filter(e => !handled.has(e))
    expect(orphan, '这些效果声明了但引擎里找不到处理分支').toEqual([])
  })

  it('每个声明过的 effect 都能通过读档校验(逐个走公开路径验一遍)', () => {
    for (const effect of COMBAT_SKILL_EFFECTS) {
      const kept = asCombatSkills([{ name: '试', mult: 1, rate: 0.1, effect }])
      expect(kept, `effect=${effect} 被读档过滤掉了`).toHaveLength(1)
      expect(kept[0]!.effect, `effect=${effect} 没能带出来`).toBe(effect)
    }
  })

  it('野 effect 仍被剔除(上面那条不是靠放宽校验通过的)', () => {
    const kept = asCombatSkills([{ name: '试', mult: 1, rate: 0.1, effect: 'ghost_effect' }])
    expect(kept).toHaveLength(1)
    expect(kept[0]!.effect, '认不出的 effect 应只去掉效果、保留这一击').toBeUndefined()
  })
})
