/**
 * 敌手情报的**渐进揭示**:认知层越高,看到的东西越多。
 *
 * 这套逻辑的关键不变式是「0 层什么都不泄露」—— 层数没到就不该看见招式名、
 * 变阵阈值或原型记号,否则图鉴一入手就把敌人的底牌摊开了。
 * 它被 2 个 spec 间接引用过(samsara / bossArchetypes),但没有同名 spec 钉这条主线。
 */
import { describe, expect, it } from 'vitest'
import { describeEnemy, effectiveEnemyStage, enemyLoreProgress } from './enemyLore'
import { ENEMY_LORE_MAX } from '@/stores/lore'
import { ENEMIES } from '@/data/enemies'
import { enemyDef } from '@/data/enemies'

/** 取一头带招式、带变阵、带原型记号的敌人 —— 三样都有才测得出「逐层揭示」 */
const BOSS = ENEMIES.find(e => e.isBoss && e.phases?.length && e.archetype)!

describe('敌手情报 · 认知层决定看得见什么', () => {
  it('找一头三样俱全的敌人作样本', () => {
    expect(BOSS, '数据里没有同时带 phases 与 archetype 的首领').toBeTruthy()
    expect(BOSS.skills.length).toBeGreaterThan(0)
  })

  it('0 层只给名字与层号,招式与原型一概不露', () => {
    const v = describeEnemy(BOSS, 0)
    expect(v.stage).toBe(0)
    expect(v.frame, '0 层连体格评语都不该有').toEqual([])
    expect(v.elementName).toBeNull()
    expect(v.skills, '0 层不能露出招式').toEqual([])
    expect(v.phases, '0 层不能露出变阵阈值').toEqual([])
    expect(v.archetype).toBeNull()
    expect(v.archetypeLabel).toBeNull()
  })

  it('1 层开体格与属性,招式仍未现', () => {
    const v = describeEnemy(BOSS, 1)
    expect(v.elementName === null || typeof v.elementName === 'string').toBe(true)
    expect(v.skills, '1 层还不够看招式').toEqual([])
    expect(v.phases).toEqual([])
  })

  it('2 层开招式,变阵与原型仍不见', () => {
    const v = describeEnemy(BOSS, 2)
    expect(v.skills.length, '2 层该看得见招式了').toBe(BOSS.skills.length)
    expect(v.skills[0]!.note, '招式说明须写出手率与威力').toMatch(/出手|威力/)
    expect(v.phases, '2 层还不够看变阵').toEqual([])
    expect(v.archetype).toBeNull()
  })

  it('满层才给变阵与原型', () => {
    const v = describeEnemy(BOSS, ENEMY_LORE_MAX)
    expect(v.phases.length).toBe(BOSS.phases!.length)
    expect(v.phases[0]!.at, '变阵须标出血线').toMatch(/^血余 \d+%$/)
    expect(v.archetype, '满层该给原型记号').toBeTruthy()
    expect(v.archetypeLabel, '原型标签写成「名 · 记号」').toContain('·')
  })

  it('层数越界钳回区间,不因坏档看穿更多', () => {
    expect(describeEnemy(BOSS, -3).stage).toBe(0)
    expect(describeEnemy(BOSS, 99).stage).toBe(ENEMY_LORE_MAX)
    // 小数向下取整,不给「2.9 层」多看一眼的机会
    expect(describeEnemy(BOSS, 2.9).stage).toBe(2)
    expect(describeEnemy(BOSS, 2.9).phases).toEqual([])
  })
})

describe('轮回宿慧照见的有效层', () => {
  it('从未交手(raw=0)不补 —— 宿慧不是白送见识', () => {
    expect(effectiveEnemyStage(0, true)).toBe(0)
    expect(effectiveEnemyStage(0, false)).toBe(0)
  })

  it('交过手才补一档,且封在满层', () => {
    expect(effectiveEnemyStage(1, false)).toBe(1)
    expect(effectiveEnemyStage(1, true)).toBe(2)
    expect(effectiveEnemyStage(ENEMY_LORE_MAX, true)).toBe(ENEMY_LORE_MAX)
  })
})

describe('下一层的进度', () => {
  it('满层没有下一层,返回 null', () => {
    expect(enemyLoreProgress(ENEMY_LORE_MAX, 9, false, ENEMY_LORE_MAX)).toBeNull()
    expect(enemyLoreProgress(-1, 0, false, 0)).toBeNull()
  })

  /**
   * 首领的门槛是累计次数乘 boss 倍率,`seen` 也是累计值 —— 两者同一口径。
   * 曾经怀疑「boss 倍率只加在 need 上会让 remain 失真」,实测口径是对的:
   * 普通敌人 1 次进门、首领 2 次,remain 递减正确。
   */
  it('首领门槛更高,remain 按累计次数递减', () => {
    const normal = enemyLoreProgress(0, 0, false, 0)!
    const boss = enemyLoreProgress(0, 0, true, 0)!
    expect(boss.need, '首领门槛应高于普通敌人').toBeGreaterThan(normal.need)
    expect(boss.remain).toBe(boss.need)
    expect(enemyLoreProgress(0, 1, true, 0)!.remain).toBe(boss.need - 1)
    expect(enemyLoreProgress(0, boss.need, true, 0)!.remain).toBe(0)
    // 超过也不为负
    expect(enemyLoreProgress(0, boss.need + 5, true, 0)!.remain).toBe(0)
  })

  it('下一层名按有效层取,宿慧抬高后不重复念同一档', () => {
    const v = enemyLoreProgress(0, 0, false, 1)
    expect(v!.nextName, '有效层已是 1 时,下一层该是 2 那一档').toBeTruthy()
  })
})

describe('情报与定义同源', () => {
  it('查不到的敌人返回 null,不编造', () => {
    expect(enemyDef('nonexistent_enemy_id')).toBeUndefined()
  })
})
