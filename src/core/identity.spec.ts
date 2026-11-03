/** 玩家身份裁判:画像只来自真实道痕;节点只记首次;纪录方向正确;叙事不给赏罚 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DaoMark } from '@/types'
import { gn } from '@/utils/gnum'
import { cultivatorProfile, daoNarrative, MILESTONE_DEFS, trackClearRecords } from './identity'
import { recordDef } from '@/data/identity'
import { useEndgameStore } from '@/stores/endgame'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function mark(partial: Partial<DaoMark>): DaoMark {
  return {
    life: 1,
    daoPathId: 'slaughter',
    targetId: 'chiyan',
    targetName: '赤炎天',
    cleared: true,
    rounds: 40,
    buildName: '背水·反震',
    powerText: '1',
    at: Date.now(),
    replay: {
      mods: {},
      attack: gn(100),
      defense: gn(55),
      maxHp: gn(1400),
      speed: 1,
      skills: [],
      artifacts: [],
      pactId: 'ni'
    },
    ...partial
  }
}

describe('修行画像', () => {
  it('样本不足不成像;足量后统计与评价可复现', () => {
    expect(cultivatorProfile([mark({}), mark({})])).toBeNull()
    const marks = [
      mark({ at: 1 }),
      mark({ at: 2 }),
      mark({ at: 3, cleared: false }),
      mark({ at: 4, targetId: 'wanren', targetName: '万刃天' }),
      mark({ at: 5, targetId: 'wanren', targetName: '万刃天' }),
      mark({ at: 6, targetId: 'wanren', targetName: '万刃天' })
    ]
    const p = cultivatorProfile(marks)!
    expect(p).not.toBeNull()
    expect(p.daoShares[0]!.name).toBe('杀伐道')
    expect(p.riskText).toBe('高')
    expect(p.favoriteBuild).toBe('背水·反震')
    expect(p.verdict.length).toBeGreaterThan(0)
    // 万刃 3 胜 0 负
    expect(p.bestWorld).toBe('万刃天')
  })
})

describe('修行节点与纪录', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('节点只记首次;纪录按方向刷新', () => {
    const endgame = useEndgameStore()
    expect(endgame.addMilestone('first_world', 3)).toBe(true)
    expect(endgame.addMilestone('first_world', 9)).toBe(false)
    expect(endgame.milestones[0]!.life).toBe(3)

    expect(endgame.updateRecord('fastest_world', 60, 3, '赤炎天', 'min')).toBe(true)
    expect(endgame.updateRecord('fastest_world', 80, 4, '万刃天', 'min')).toBe(false)
    expect(endgame.updateRecord('fastest_world', 41, 5, '无生天', 'min')).toBe(true)
    expect(endgame.records['fastest_world']!.value).toBe(41)
  })

  it('全部节点定义有名有述', () => {
    for (const def of MILESTONE_DEFS) {
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.desc.length).toBeGreaterThan(0)
    }
  })
})

describe('道途行为叙事', () => {
  it('叙事只是文字,且随行为不同而不同', () => {
    const pure = [mark({ life: 7, buildName: '罡盾流' }), mark({ life: 7, buildName: '罡盾流' })]
    const messy = [
      mark({ life: 7, buildName: '罡盾流' }),
      mark({ life: 7, buildName: '背水·反震' }),
      mark({ life: 7, buildName: '锋芒·连击' })
    ]
    const a = daoNarrative('sword', pure, 7)
    const b = daoNarrative('sword', messy, 7)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).not.toBe(b)
    // 样本不足不语
    expect(daoNarrative('sword', [mark({ life: 7 })], 7)).toBeNull()
  })
})

/**
 * 破界纪录:三个 `updateRecord` 的取值方向必须与数据定义同向。
 *
 * `updateRecord` 里 `if (!def || def.better !== better) return false` ——
 * 传错方向**不报错、不抛异常,只是永远记不上**。而这三条纪录正是玩家档案里
 * 最有存在感的三行,静默失效很长时间都不会被发现。
 */
describe('破界纪录 · 三条的取值方向', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('最快破界记短的(更少回合才刷新)', () => {
    const endgame = useEndgameStore()
    trackClearRecords('赤炎天', 120, null, 0)
    expect(endgame.records.fastest_world?.value, '第一次应当记上').toBe(120)
    trackClearRecords('赤炎天', 90, null, 0)
    expect(endgame.records.fastest_world?.value, '更少的回合应当刷新').toBe(90)
    trackClearRecords('赤炎天', 200, null, 0)
    expect(endgame.records.fastest_world?.value, '更多回合不该覆盖最快').toBe(90)
  })

  it('最高风险破界记大的', () => {
    const endgame = useEndgameStore()
    // 无契时不写这条
    trackClearRecords('赤炎天', 100, null, 0)
    expect(endgame.records.highest_pact, '没有逆旅契就不该写这条').toBeUndefined()
  })

  it('赏金记大的,且为零时不写', () => {
    const endgame = useEndgameStore()
    trackClearRecords('赤炎天', 100, null, 0)
    expect(endgame.records.biggest_reward, '零赏不该占一条纪录').toBeUndefined()
    trackClearRecords('赤炎天', 100, null, 500)
    expect(endgame.records.biggest_reward?.value, '有赏就该记上').toBe(500)
    trackClearRecords('赤炎天', 100, null, 300)
    expect(endgame.records.biggest_reward?.value, '更小的赏不该覆盖').toBe(500)
  })

  it('三条纪录的 better 方向与实现同向(传反就会静默永不更新)', () => {
    const rows = ['fastest_world', 'highest_pact', 'biggest_reward'] as const
    for (const id of rows) {
      const def = recordDef(id)
      expect(def, `${id} 在数据里不存在`).toBeTruthy()
    }
    expect(recordDef('fastest_world')!.better, '最快应当是 min').toBe('min')
    expect(recordDef('highest_pact')!.better, '最高应当是 max').toBe('max')
    expect(recordDef('biggest_reward')!.better, '最厚应当是 max').toBe('max')
  })
})

/**
 * 全仓守卫:`updateRecord` 的取值方向必须与 `RECORD_DEFS` 同向。
 *
 * `updateRecord` 里 `if (!def || def.better !== better) return false` ——
 * 方向传反**不报错、不抛异常,只是永远记不上**。这类静默失效是本仓库最隐蔽的一类:
 * 运行时一切正常,只是玩家档案里那一行永远空着。
 *
 * 逐条补判据管不住新增的调用点;这里直接扫源码,新增一处传反就红。
 */
describe('破界纪录 · 全仓方向守卫', () => {
  it('每处 updateRecord 调用的方向都与数据定义一致', () => {
    const calls: { file: string; line: number; id: string; better: string }[] = []
    for (const file of ['src/core/identity.ts', 'src/core/challenge.ts']) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf-8')
      src.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/updateRecord\('([a-z_]+)'[^)]*'(min|max)'\)/g)) {
          calls.push({ file, line: i + 1, id: m[1]!, better: m[2]! })
        }
      })
    }
    expect(calls.length, '一处调用都没扫到,守卫没在起作用').toBeGreaterThan(0)

    for (const c of calls) {
      const def = recordDef(c.id)
      expect(def, `${c.file}:${c.line} 写了一条数据里不存在的纪录 ${c.id}`).toBeTruthy()
      expect(
        c.better,
        `${c.file}:${c.line} 的 ${c.id} 方向是 '${c.better}',而数据定义是 '${def!.better}' —— 传反会静默永不更新`
      ).toBe(def!.better)
    }
  })

  it('扫到的调用点覆盖了所有会写纪录的地方(防止新增文件绕过)', () => {
    const known = new Set(['best_custom', 'fastest_world', 'highest_pact', 'biggest_reward'])
    const src = readFileSync(resolve(process.cwd(), 'src/core/identity.ts'), 'utf-8')
      + readFileSync(resolve(process.cwd(), 'src/core/challenge.ts'), 'utf-8')
    const ids = new Set([...src.matchAll(/updateRecord\('([a-z_]+)'/g)].map(m => m[1]!))
    for (const id of ids) {
      expect(known.has(id), `发现未纳入守卫的纪录 ${id}`).toBe(true)
    }
  })
})
