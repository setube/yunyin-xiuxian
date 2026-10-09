/**
 * 收徒 store —— 派发/收割/收徒与坏档韧性
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { OwnedApprentice } from '@/core/apprenticeService'
import { APPRENTICE_MAX_LEVEL, STARTER_APPRENTICE } from '@/data/apprentices'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { gn, toNum } from '@/utils/gnum'
import { useApprenticeStore } from '@/stores/apprentice'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'

function make(archId = 'ap_luanniao', over: Partial<OwnedApprentice> = {}): OwnedApprentice {
  return { uid: 'u1', archId, level: 3, bond: 0, task: null, ...over }
}

describe('收徒 · 派发与收割', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('空门庭开场白送一名入门弟子', () => {
    const a = useApprenticeStore()
    a.sync()
    expect(a.apprentices).toHaveLength(1)
    expect(a.apprentices[0]!.archId).toBe(STARTER_APPRENTICE)
    expect(a.apprentices[0]!.task).toBeNull()
  })

  it('派活:闲置弟子被派,忙着的派不动', () => {
    const a = useApprenticeStore()
    a.$patch({ apprentices: [make()] })
    expect(a.dispatch('u1', 'study', 1000)).toBe(true)
    expect(a.apprentices[0]!.task!.spec).toBe('study')
    expect(a.apprentices[0]!.task!.finishAt).toBeGreaterThan(1000)
    expect(a.dispatch('u1', 'herb', 2000), '忙中不可再派').toBe(false)
  })

  it('完工:入账资材、弟子进阶一层、清空任务、返回尾账', () => {
    const a = useApprenticeStore()
    const res = useResourcesStore()
    // ap_luanniao 天赋 herb: 采药 = (4 + 3*2) * 1.25 = 12.5 → 12
    a.$patch({ apprentices: [make('ap_luanniao', { task: { spec: 'herb', startAt: 0, finishAt: 1 } })] })
    const reaped = a.collectFinished(9999, 0)
    expect(reaped).toHaveLength(1)
    expect(res.herbOf(herbGradeOfMajor(0)), '天赋加成采一摞灵草').toBe(12)
    expect(a.apprentices[0]!.level).toBe(4)
    expect(a.apprentices[0]!.bond, '完工一趟羁绊 +1').toBe(1)
    expect(a.apprentices[0]!.task).toBeNull()
  })

  it('没完工:不收割、不进阶、不报尾账', () => {
    const a = useApprenticeStore()
    const res = useResourcesStore()
    a.$patch({ apprentices: [make('ap_luanniao', { task: { spec: 'herb', startAt: 0, finishAt: 99999 } })] })
    expect(a.collectFinished(100, 0)).toEqual([])
    expect(res.herbOf(herbGradeOfMajor(0))).toBe(0)
    expect(a.apprentices[0]!.level).toBe(3)
  })

  it('位阶(羁绊)纯叙事:不同位阶的道童完成同一任务,产出逐项相同', () => {
    const a = useApprenticeStore()
    // 两名 ap_luanniao(天赋 herb),同等级同任务,只差 bond:0(道童)vs 100(真传)
    a.$patch({
      apprentices: [
        { uid: 'low', archId: 'ap_luanniao', level: 3, bond: 0, task: { spec: 'herb', startAt: 0, finishAt: 1 } },
        { uid: 'hi', archId: 'ap_luanniao', level: 3, bond: 100, task: { spec: 'herb', startAt: 0, finishAt: 1 } }
      ]
    } as never)
    const reaped = a.collectFinished(9999, 0)
    expect(reaped, '两人都完工').toHaveLength(2)
    // 产出与时长必须逐项一致 —— 位阶是纯叙事,不可误当产出加成(描述即承诺)
    expect(reaped[1], '真传不该比道童多产出').toEqual(reaped[0])
    // 位阶只影响称谓,不改产出;完工仍各自 +1(互不串扰)
    expect(a.apprentices.find(x => x.uid === 'low')!.bond).toBe(1)
    expect(a.apprentices.find(x => x.uid === 'hi')!.bond).toBe(101)
  })

  it('采药给草按「当前大境界」品阶入账(与采集按地界相反)', () => {
    const player = usePlayerStore()
    player.major = 12 // 当前大境界已是仙品(3)
    const a = useApprenticeStore()
    const res = useResourcesStore()
    for (const g of [1, 2, 3, 4, 5] as const) res.herbByGrade[g] = 0
    a.$patch({ apprentices: [make('ap_luanniao', { task: { spec: 'herb', startAt: 0, finishAt: 1 } })] })
    a.collectFinished(9999, 12)
    expect(res.herbByGrade[3], '采药该按当前大境界(仙品3)入账').toBeGreaterThan(0)
    expect(res.herbByGrade[1], '采药不该按凡品/地界入账').toBe(0)
  })

  it('历练回的是灵石(走 stoneByTier 那条经济)', () => {
    const a = useApprenticeStore()
    a.$patch({ apprentices: [make('ap_youxia', { level: 1 })] }) // 天赋 adventure
    a.dispatch('u1', 'adventure', 0)
    // 完工一次
    a.apprentices[0]!.task!.finishAt = 1
    const reaped = a.collectFinished(2, 5)
    expect(reaped[0]!.stone, '历练该给灵石').toBeDefined()
    expect(toNum(reaped[0]!.stone!)).toBeGreaterThan(0)
  })

  it('收徒:槽未满且灵石够则成,满了不成;既满又不足当返回满', () => {
    const a = useApprenticeStore()
    const res = useResourcesStore()
    const player = usePlayerStore()
    player.major = 0 // 1 个槽
    res.spiritStone = gn(100000)
    expect(a.recruit(player.major)).toBe('ok')
    expect(a.apprentices).toHaveLength(1)
    expect(a.apprentices[0]!.level).toBe(1)
    expect(toNum(res.spiritStone)).toBeLessThan(100000) // 扣了灵石
    expect(a.recruit(player.major), '槽满').toBe('full')
  })

  it('sanitize:坏弟子整位丢弃、坏任务当作闲置、坏等级/羁绊夹回', () => {
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [
        null,
        { uid: 42 },
        make('ap_nope'),
        { uid: 'ok', archId: 'ap_youxia', level: 99, bond: 1500, task: { spec: 'nope', startAt: 0, finishAt: 1 } },
        { uid: 'ok2', archId: 'ap_daotong', level: -3, bond: -7, task: { spec: 'study', startAt: 0, finishAt: 0 } },
        { uid: 'ok3', archId: 'ap_lingtong', level: 2 }
      ] as unknown as OwnedApprentice[]
    })
    a.sanitize()
    expect(a.apprentices).toHaveLength(3)
    const ok = a.apprentices.find(x => x.archId === 'ap_youxia')!
    expect(ok.level, '超出上限夹回').toBe(APPRENTICE_MAX_LEVEL)
    expect(ok.bond, '合理羁绊保留').toBe(1500)
    expect(ok.task, '坏任务当作闲置').toBeNull()
    const ok2 = a.apprentices.find(x => x.archId === 'ap_daotong')!
    expect(ok2.level, '负等级夹回 1').toBe(1)
    expect(ok2.bond, '负羁绊夹回 0').toBe(0)
    const ok3 = a.apprentices.find(x => x.archId === 'ap_lingtong')!
    expect(ok3.bond, '老档缺 bond 补 0').toBe(0)
  })

  it('各尽其长一键:缺灵草时闲置道童全体去采药,忙的不动', () => {
    const a = useApprenticeStore()
    const player = usePlayerStore()
    player.major = 0 // 灵草品阶 1(凡品);herb 缺、其余 0 也不及 herb 短缺分
    a.$patch({
      apprentices: [
        { uid: 'x', archId: 'ap_youxia', level: 1, bond: 0, task: null },
        { uid: 'y', archId: 'ap_daotong', level: 1, bond: 0, task: null },
        { uid: 'z', archId: 'ap_luanniao', level: 1, bond: 0, task: { spec: 'ore', startAt: 0, finishAt: 99999 } }
      ] as OwnedApprentice[]
    })
    expect(a.dispatchAll(Date.now())).toBe(2)
    expect(a.apprentices.find(x => x.uid === 'x')!.task!.spec).toBe('herb')
    expect(a.apprentices.find(x => x.uid === 'y')!.task!.spec).toBe('herb')
    expect(a.apprentices.find(x => x.uid === 'z')!.task!.spec, '忙的道童不动').toBe('ore')
  })

  it('真传道童转世:最高羁绊凝成跨世之缘,新世 starter 带传承羁绊入场并被消耗', () => {
    const a = useApprenticeStore()
    // 多名道童:只取最高那名(150),且封顶到真传位阶(100)
    a.$patch({
      apprentices: [
        { uid: 'x', archId: 'ap_luanniao', level: 1, bond: 150, task: null },
        { uid: 'y', archId: 'ap_youxia', level: 1, bond: 40, task: null }
      ] as OwnedApprentice[]
    })
    a.resetForRebirth()
    expect(a.apprentices, '道童本体随世散去').toHaveLength(0)
    expect(a.rebirthKarma, '真传凝缘,封顶到真传位阶').toBe(100)

    // 新世 sync():starter 带着传承羁绊入场,随后清零(一次性,不每世重演)
    a.sync()
    expect(a.apprentices).toHaveLength(1)
    expect(a.apprentices[0]!.archId).toBe(STARTER_APPRENTICE)
    expect(a.apprentices[0]!.bond).toBe(100)
    expect(a.rebirthKarma).toBe(0)
  })

  it('无真传时转世:starter 羁绊仍为 0,现状不变', () => {
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [{ uid: 'x', archId: 'ap_daotong', level: 1, bond: 40, task: null }] as OwnedApprentice[]
    })
    a.resetForRebirth()
    expect(a.rebirthKarma, '未达真传不凝缘').toBe(0)
    a.sync()
    expect(a.apprentices[0]!.bond).toBe(0)
    expect(a.rebirthKarma).toBe(0)
  })

  it('sanitize:跨世之缘夹回 0~真传阈值(不越界)', () => {
    const a = useApprenticeStore()
    a.$patch({ rebirthKarma: -5 } as never)
    a.sanitize()
    expect(a.rebirthKarma).toBe(0)
    a.$patch({ rebirthKarma: 500 } as never)
    a.sanitize()
    expect(a.rebirthKarma, '封顶到真传位阶').toBe(100)
    a.$patch({ rebirthKarma: NaN } as never)
    a.sanitize()
    expect(a.rebirthKarma).toBe(0)
  })
})
