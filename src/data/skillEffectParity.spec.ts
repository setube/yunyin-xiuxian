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

/** 从 worldGen.ts 的 shapeRisk 里抽出它认识的 effect 名 */
function handledInWorldGenRisk(): string[] {
  const src = readFileSync(new URL('../core/worldGen.ts', import.meta.url), 'utf-8')
  const start = src.indexOf('function shapeRisk(')
  expect(start, 'worldGen.ts 里找不到 shapeRisk,判据会空转').toBeGreaterThan(0)
  const body = src.slice(start, src.indexOf('\n}', start))
  const set = new Set<string>()
  for (const m of body.matchAll(/sk\.effect === '([a-z]+)'/g)) set.add(m[1]!)
  return [...set].sort()
}

/**
 * 从 expedition.ts 的 `EFFECT_WORDS` 里抽出键。
 *
 * 它是第四处的**另一份词表**:天机透视给每一击写「【破军】多段 · 常发 · 威力 2.1 倍」,
 * 用的是紧凑标签(多段 / 真伤),与路线图那句完整短语(多段连击 / 真伤穿透)分工不同 ——
 * 两处措辞不一样是对的,但**覆盖的 effect 集合必须一样**。
 * 漏一个就会印出内部 id(兜底是 `?? sk.effect`)。
 */
function handledInExpeditionWords(): string[] {
  const src = readFileSync(new URL('../core/expedition.ts', import.meta.url), 'utf-8')
  const start = src.indexOf('const EFFECT_WORDS')
  expect(start, 'expedition.ts 里找不到 EFFECT_WORDS,判据会空转').toBeGreaterThan(0)
  const body = src.slice(start, src.indexOf('\n}', start))
  const set = new Set<string>()
  for (const m of body.matchAll(/^\s+([a-z]+):\s*'/gm)) set.add(m[1]!)
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

  /**
   * 第四处:`core/worldGen.shapeRisk` 把 effect 翻成「险:…」那行字。
   *
   * 它同样是逐个 `sk.effect === '...'` 手写分支,而且**没有兜底报错** ——
   * 认不出的 effect 落到最后那句「攻守均衡」。实测 `shield` 就漏在那里:
   * 带护盾的敌人会在远征路线图上被写成「险:攻守均衡」,而它恰恰是最该预警的一类
   * (`RISK_ATLAS` 里三条 watch 档都与护盾有关)。
   *
   * 当前部署池里没有带 shield 的敌人,所以这处还没造成可见的错误;
   * 但数据表里已经有 10 个带 shield 的敌人,只要有人把其中一个放进世界/试炼池,
   * 这条路线上就会出现一句错的险情。
   *
   * 判据与上面几条同一条思路:声明表里每个 effect,这里都要有自己的说法,
   * 不许落进兜底。
   */
  it('worldGen 的险情文案覆盖声明表里每个 effect,不落进「攻守均衡」兜底', () => {
    const covered = handledInWorldGenRisk()
    // 防空转:一条都没抽到时下面的差集恒空
    expect(covered.length, '一条 effect 分支都没抽到,正则可能已失配').toBeGreaterThanOrEqual(3)
    const missing = COMBAT_SKILL_EFFECTS.filter(e => !covered.includes(e))
    expect(missing, `这些 effect 在路线图上会被写成「攻守均衡」:\n${missing.join('\n')}`).toEqual([])
  })

  /**
   * 第四处的另一半:天机透视的紧凑标签。
   *
   * 措辞与上一条不同是对的(「多段」vs「多段连击」),但覆盖的集合必须一样 ——
   * 漏一个就会把内部 id 直接印进战报(`?? sk.effect` 兜底)。
   */
  it('天机透视的 effect 标签覆盖声明表,不漏出内部 id', () => {
    const covered = handledInExpeditionWords()
    expect(covered.length, '一条 effect 都没抽到,正则可能已失配').toBeGreaterThanOrEqual(3)
    const missing = COMBAT_SKILL_EFFECTS.filter(e => !covered.includes(e))
    expect(missing, `这些 effect 在天机透视里会印出内部 id:\n${missing.join('\n')}`).toEqual([])
  })
})
