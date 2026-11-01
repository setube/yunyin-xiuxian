/**
 * 修士实验室:反事实换装推演。
 *
 * 它回答的是「现在这身换成它会怎样」—— **对手不该跟着换**。
 * 242 轮实测到的缺陷正在这里:`worldRate` 原先按各自快照重算敌人标定,
 * 而 `celestialJudgement` 的加厚与增伤是按玩家词条厚度算的,
 * 于是换上更厚的装备、敌人也一起变厚,读数系统性偏向「换了没变好」。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CELESTIAL_BASE_DEPTH, celestialJudgement } from './gauntlet'
import { modDepth } from './statsCalc'
import type { StatMods } from '@/types'

const LAB = readFileSync(resolve(__dirname, './lab.ts'), 'utf8')

describe('换装推演的敌人标定 · 前后必须是同一个对手', () => {
  it('玩家词条变厚时,天道判定确实会加厚敌人 —— 这就是缺陷的成因', () => {
    // 终局档的两个厚度:换装前 2.80、换装后 3.20(实测值)
    const before = {
      damageBonus: 0.5, damageReduction: 0.4, lifesteal: 0.3,
      critRate: 0.3, critDamage: 0.6, armorPen: 0.3, counterRate: 0.4
    } as StatMods
    const after = { ...before, damageBonus: 0.7, armorPen: 0.5 } as StatMods
    expect(modDepth(before)).toBeLessThan(modDepth(after))
    expect(modDepth(before)).toBeGreaterThan(CELESTIAL_BASE_DEPTH)

    const jb = celestialJudgement(before, 18, 20)
    const ja = celestialJudgement(after, 18, 20)
    expect(ja.thicken, '更厚的构筑会招来更厚的守关者').toBeGreaterThan(jb.thicken)
    expect(ja.damageBonus).toBeGreaterThan(jb.damageBonus)
  })

  it('worldRate 不再自己算 judgement,而是由调用方传入', () => {
    const start = LAB.indexOf('function worldRate(')
    expect(start, 'lab.ts 里找不到 worldRate').toBeGreaterThan(-1)
    const open = LAB.indexOf('{', LAB.indexOf('): number {', start))
    let depth = 0
    let end = -1
    for (let i = open; i < LAB.length; i += 1) {
      if (LAB[i] === '{') depth += 1
      else if (LAB[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const body = LAB.slice(start, end)
    expect(body, 'worldRate 仍按自己的快照重算 judgement').not.toContain('celestialFoeCaliber')
    expect(body, 'worldRate 应接收 judgement 参数').toContain('judgement: CelestialJudgement')
    // 参照属性只依赖 anchorTier,可以直接由 worldRate 取
    expect(body, '参照属性按 anchorTier 取,与玩家词条无关').toContain('celestialAnchor(world.anchorTier)')
  })

  it('两次对比共用同一个 judgement', () => {
    expect(LAB, '一次推演只算一套 judgement').toContain('const j = judgementOf(w)')
    expect(LAB, 'before 与 after 传同一个 j').toContain('worldRate(w, before, j, 660000 + i * 97)')
    expect(LAB, 'after 也传同一个 j').toContain('worldRate(w, after, j, 660000 + i * 97)')
    // 标定取 before.mods:玩家问的是「现在这身」换成它会怎样
    expect(LAB, 'judgement 以换装前的状态标定').toContain('before.mods, w.anchorTier')
  })
})
