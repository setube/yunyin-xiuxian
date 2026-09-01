/* eslint-disable no-console */
/**
 * Phase 31.0 S5:铁壁共鸣进战斗 —— 首次致命伤保留 1 血
 */
import { describe, it, expect } from 'vitest'
import { gn } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { resolveCombat, makeEnemySnap } from './combat'
import { buildPlayerSnap } from './playerSnap'
import { enemyDef } from '@/data/enemies'

function baseSnap(over: Partial<ReturnType<typeof buildPlayerSnap>> = {}): ReturnType<typeof buildPlayerSnap> {
  return {
    name: '测试者',
    icon: 'user',
    isPlayer: true,
    attack: gn(100),
    defense: gn(55),
    maxHp: gn(1400),
    speed: 1,
    mods: {},
    skills: [],
    ...over
  }
}

describe('铁壁共鸣(ironwall)', () => {
  it('敌人随玩家属性缩放,玩家无铁壁被击杀时正常败', () => {
    // 构造一个必败局:对方极强
    const snap = baseSnap({ maxHp: gn(10), ironwallBrace: false })
    // 用真实 enemySnap 但拉高其攻击 — 直接调 resolveCombat 用最强敌人
    const enemy = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 5)
    const res = resolveCombat(snap, enemy, new RandomService(mulberry32(1)))
    expect(res.win).toBe(false) // 弱玩家必败
  })

  it('带铁壁时致命伤保留 1 血(至少不立即败)', () => {
    const snap = baseSnap({ maxHp: gn(10), ironwallBrace: true })
    const enemy = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 5)
    const res = resolveCombat(snap, enemy, new RandomService(mulberry32(2)))
    // 铁壁只能保一次命;最终仍可能输,但日志应有保命记录
    const logText = res.log.map(l => l.text).join('\n')
    console.log(logText)
    expect(logText.includes('铁壁共鸣')).toBe(true)
  })

  it('铁壁一次性:保命后标记耗尽,不再触发', () => {
    const snap = baseSnap({ maxHp: gn(10), ironwallBrace: true })
    const enemy = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 5)
    const res = resolveCombat(snap, enemy, new RandomService(mulberry32(3)))
    // 保命触发后,剩余战斗若再被击就是正常败亡——日志中"铁壁共鸣"至多一条
    const count = res.log.filter(l => l.text.includes('铁壁共鸣')).length
    expect(count).toBeLessThanOrEqual(1)
  })
})
