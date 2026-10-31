/**
 * 构筑对照:档位文案的阈值链、过程差异的过滤门槛、今昔之比的配对规则。
 * 这些边界改一个等号就会让「胜负各半」变「略占上风」,而单测之外的台阶没人守。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DaoMark } from '@/types'
import { gn } from '@/utils/gnum'
import { rateText, legacyComparisons } from './compare'

// measureOnWorld 会经 currentDaoRules 读 endgame store,须有 Pinia
beforeEach(() => {
  setActivePinia(createPinia())
})

describe('档位文案 · 阈值边界', () => {
  it('五档各自的下界都含等号', () => {
    expect(rateText(1)).toBe('稳操胜券')
    expect(rateText(0.85), '0.85 恰好是「稳操胜券」的下界').toBe('稳操胜券')
    expect(rateText(0.849), '差一点就掉档').toBe('略占上风')
    expect(rateText(0.6)).toBe('略占上风')
    expect(rateText(0.599)).toBe('胜负各半')
    expect(rateText(0.4)).toBe('胜负各半')
    expect(rateText(0.399)).toBe('凶险')
    expect(rateText(0.15)).toBe('凶险')
    expect(rateText(0.149)).toBe('九死一生')
    expect(rateText(0)).toBe('九死一生')
  })

  it('越界输入不炸:负数仍是最低档,超过 1 仍是最高档', () => {
    expect(rateText(-1)).toBe('九死一生')
    expect(rateText(2)).toBe('稳操胜券')
  })
})

describe('今昔之比 · 配对规则', () => {
  /** 造一条有忆战快照的道痕;replay 必须是 MarkReplay 的完整形状,snapFromReplay 会逐个字段读 */
  const replay = (): NonNullable<DaoMark['replay']> => ({
    mods: {},
    attack: gn(100),
    defense: gn(50),
    maxHp: gn(1000),
    speed: 1,
    skills: [],
    artifacts: [],
    pactId: null
  })
  const mark = (over: Partial<DaoMark>): DaoMark =>
    ({
      targetId: 'chiyan',
      targetName: '赤炎界',
      life: 1,
      at: 1000,
      buildName: '剑修',
      replay: replay(),
      ...over
    }) as DaoMark

  it('只有一条道痕时不配对', () => {
    expect(legacyComparisons([mark({})])).toEqual([])
  })

  it('同一世的两条道痕不配对(只跨世比)', () => {
    const same = [mark({ life: 3, at: 1000 }), mark({ life: 3, at: 2000 })]
    expect(legacyComparisons(same), '同世不算今昔').toEqual([])
  })

  it('跨世配对:取最早与最晚,且报两世世号', () => {
    const rows = legacyComparisons([
      mark({ life: 1, at: 1000 }),
      mark({ life: 5, at: 5000 }),
      mark({ life: 3, at: 3000 })
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.earlyLife, '最早那条').toBe(1)
    expect(rows[0]!.lateLife, '最晚那条').toBe(5)
  })

  it('没有忆战快照的道痕不参与', () => {
    const noReplay = [mark({ life: 1, replay: undefined as unknown as DaoMark['replay'] }), mark({ life: 2 })]
    expect(legacyComparisons(noReplay), '缺快照就没法重打').toEqual([])
  })

  it('认不得的目标不参与', () => {
    const unknown = [mark({ targetId: 'nope', life: 1 }), mark({ targetId: 'nope', life: 2 })]
    expect(legacyComparisons(unknown)).toEqual([])
  })

  it('limit 生效:超过上限只返回前几组', () => {
    const two = [
      mark({ targetId: 'chiyan', life: 1, at: 1000 }),
      mark({ targetId: 'chiyan', life: 2, at: 2000 }),
      mark({ targetId: 'wanren', targetName: '万仞天', life: 1, at: 1000 }),
      mark({ targetId: 'wanren', targetName: '万仞天', life: 2, at: 2000 })
    ]
    expect(legacyComparisons(two, 1)).toHaveLength(1)
    expect(legacyComparisons(two, 2)).toHaveLength(2)
  })
})
