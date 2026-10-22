/**
 * 玩家行为生态裁判(Phase 27)
 * 今日天道:同日必同题、定价有界;构筑对照:同构筑对照自身差异必为零(测量无系统偏差)
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { gn } from '@/utils/gnum'
import type { DaoMark } from '@/types'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { compareSnaps } from './compare'
import { legacyComparisons } from './compare'
import { todayChallenge } from './dailyChallenge'

describe('今日天道', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('同一日两次生成完全相同(刷新不换题),且定价有界', () => {
    const a = todayChallenge()
    const b = todayChallenge()
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.draft).toEqual(b!.draft)
    expect(a!.verdict.reward).toBe(b!.verdict.reward)
    expect(a!.verdict.reward).toBeGreaterThanOrEqual(30)
    expect(a!.verdict.reward).toBeLessThanOrEqual(90)
    expect(a!.verdict.ok).toBe(true)
  })
})

describe('构筑对照', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('同一构筑对照自身:四天档位全平、无过程差异(测量器无系统偏差)', () => {
    const snap = buildSnap(BUILD_PROFILES[1]!)
    const report = compareSnaps(snap, snap)
    for (const row of report.rows) {
      expect(row.trend, `${row.worldName} 自反对照不平`).toBe('flat')
      expect(row.aText).toBe(row.bText)
    }
    expect(report.diffLines.length, '自反对照出现过程差异').toBe(0)
  })

  it('不同构筑的对照给出至少一处环境差异或过程差异(对照有分辨力)', () => {
    const report = compareSnaps(
      buildSnap(BUILD_PROFILES.find(p => p.id === 'gangdun')!),
      buildSnap(BUILD_PROFILES.find(p => p.id === 'fengmang')!)
    )
    const hasDiff = report.rows.some(r => r.trend !== 'flat') || report.diffLines.length > 0
    expect(hasDiff).toBe(true)
  })
})

describe('道痕今昔之比', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** 一条能进配对的道痕(有忆战快照、目标是真实天界) */
  function mark(at: number, life: number, build: string): DaoMark {
    return {
      life,
      daoPathId: null,
      targetId: 'chiyan',
      targetName: '赤炎天',
      cleared: true,
      rounds: 10,
      buildName: build,
      powerText: '1',
      at,
      replay: {
        mods: {},
        attack: gn(1000),
        defense: gn(500),
        maxHp: gn(9000),
        speed: 12,
        skills: [],
        artifacts: [],
        pactId: null
      }
    }
  }

  it('同一世的两道痕不配对:这一栏比的是今世与往世,不是一世之内的两次出手', () => {
    // 从前守卫是「life 与 at 都相同才跳过」,于是同世两个不同 at 的痕照样产出一组,
    // 界面上印出「第 3 世(剑)X → 第 3 世(刀)Y」—— 标题写的可是「今昔之比」
    const sameLife = legacyComparisons([mark(100, 3, '剑'), mark(200, 3, '刀')])
    expect(sameLife, '同世两痕被说成「过去的自己」').toHaveLength(0)
  })

  it('同世同刻的两道痕也不配对(at 相同是 life 相同的一条子集)', () => {
    const sameMoment = legacyComparisons([mark(100, 3, '剑'), mark(100, 3, '剑')])
    expect(sameMoment, '同世同刻两痕仍被配对').toHaveLength(0)
  })

  it('跨世的两道痕照旧配对,早者往世、晚者今世', () => {
    const cross = legacyComparisons([mark(100, 2, '剑'), mark(200, 3, '刀')])
    expect(cross).toHaveLength(1)
    expect(cross[0]!.earlyLife).toBe(2)
    expect(cross[0]!.lateLife).toBe(3)
    expect(cross[0]!.earlyBuild).toBe('剑')
    expect(cross[0]!.lateBuild).toBe('刀')
  })

  it('只有一条痕,或痕都缺快照时不出比较', () => {
    expect(legacyComparisons([mark(100, 2, '剑')])).toHaveLength(0)
    const noReplay = mark(200, 3, '刀')
    delete noReplay.replay
    expect(legacyComparisons([mark(100, 2, '剑'), noReplay])).toHaveLength(0)
  })
})
