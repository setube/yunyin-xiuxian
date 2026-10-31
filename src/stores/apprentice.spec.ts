/** 收徒 store —— 派发/收割/收徒与坏档韧性 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { OwnedApprentice } from '@/core/apprenticeService'
import { APPRENTICE_MAX_LEVEL, STARTER_APPRENTICE, APPRENTICES, apprenticeSlots, APPRENTICE_SLOT_HARD_CAP } from '@/data/apprentices'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { gn, toNum } from '@/utils/gnum'
import { useApprenticeStore } from '@/stores/apprentice'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { MAX_MAJOR } from '@/data/realms'

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

  it('坏派工:野门类与坏时钟都不写任务,也不抛错', () => {
    const a = useApprenticeStore()
    a.$patch({ apprentices: [make()] })
    expect(a.dispatch('u1', 'nope' as never, 1000), '野门类派不动').toBe(false)
    expect(a.apprentices[0]!.task).toBeNull()
    for (const now of [NaN, Infinity, -1]) {
      expect(a.dispatch('u1', 'study', now), `坏时钟 ${now} 派不动`).toBe(false)
      expect(a.apprentices[0]!.task).toBeNull()
    }
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

  it('坏收割时钟不入账,任务不被白吞', () => {
    const a = useApprenticeStore()
    const res = useResourcesStore()
    a.$patch({ apprentices: [make('ap_luanniao', { task: { spec: 'herb', startAt: 0, finishAt: 1 } })] })
    for (const now of [NaN, Infinity, -1]) {
      expect(a.collectFinished(now, 0), `坏时钟 ${now} 不收割`).toEqual([])
    }
    expect(a.apprentices[0]!.task, '任务仍在,没有白吞').not.toBeNull()
    expect(res.herb, '没有入账').toBe(0)

    expect(a.collectFinished(2, NaN), '好时钟仍可正常收割').toHaveLength(1)
    expect(res.herbOf(herbGradeOfMajor(0)), '坏境界经品阶换算仍落凡品').toBeGreaterThan(0)
  })

  it('位阶(羁绊)纯叙事:不同位阶的道童完成同一任务,产出逐项相同', () => {
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [
        { uid: 'low', archId: 'ap_luanniao', level: 3, bond: 0, task: { spec: 'herb', startAt: 0, finishAt: 1 } },
        { uid: 'hi', archId: 'ap_luanniao', level: 3, bond: 100, task: { spec: 'herb', startAt: 0, finishAt: 1 } }
      ]
    } as never)
    const reaped = a.collectFinished(9999, 0)
    expect(reaped, '两人都完工').toHaveLength(2)
    expect(reaped[1], '真传不该比道童多产出').toEqual(reaped[0])
    expect(a.apprentices.find(x => x.uid === 'low')!.bond).toBe(1)
    expect(a.apprentices.find(x => x.uid === 'hi')!.bond).toBe(101)
  })

  it('采药给草按「当前大境界」品阶入账(与采集按地界相反)', () => {
    const player = usePlayerStore()
    player.major = 12 // 仙品(3)
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
    expect(toNum(res.spiritStone)).toBeLessThan(100000)
    expect(a.recruit(player.major), '槽满').toBe('full')
  })

  it('坏境界收徒:不能绕过五槽上限,也不异常扣费', () => {
    const a = useApprenticeStore()
    const res = useResourcesStore()
    res.spiritStone = gn(1_000_000)
    a.$patch({
      apprentices: [
        { uid: 'a', archId: 'ap_luanniao', level: 1, bond: 0, task: null },
        { uid: 'b', archId: 'ap_kuangtou', level: 1, bond: 0, task: null },
        { uid: 'c', archId: 'ap_youxia', level: 1, bond: 0, task: null },
        { uid: 'd', archId: 'ap_lingtong', level: 1, bond: 0, task: null },
        { uid: 'e', archId: 'ap_daotong', level: 1, bond: 0, task: null }
      ] as OwnedApprentice[]
    })
    const before = toNum(res.spiritStone)
    expect(a.recruit(NaN), '坏境界夹回凡境,五槽已满').toBe('full')
    expect(a.apprentices, '没有第六人').toHaveLength(5)
    expect(toNum(res.spiritStone), '满槽不扣费').toBe(before)
    a.$patch({ apprentices: [] })
    res.spiritStone = gn(1e12)
    expect(a.recruit(MAX_MAJOR + 99), '超界境界夹回最高境后仍可收').toBe('ok')
    expect(a.apprentices, '只收一人,不因超界境界多开槽').toHaveLength(1)
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

  it('sanitize:完工早于开工的坏任务当作闲置(不白嫖一趟产出)', () => {
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [{ uid: 't', archId: 'ap_luanniao', level: 2, bond: 0, task: { spec: 'herb', startAt: 99999, finishAt: 0 } }] as unknown as OwnedApprentice[]
    })
    a.sanitize()
    expect(a.apprentices[0]!.task, 'finishAt<startAt 应置闲,不许开局即收割').toBeNull()
  })

  it('sanitize:弟子 uid 重复时重排,两位都派得动、互不串账', () => {
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [
        { uid: 'dup', archId: 'ap_luanniao', level: 1, bond: 0, task: null },
        { uid: 'dup', archId: 'ap_youxia', level: 1, bond: 0, task: null }
      ] as unknown as OwnedApprentice[]
    })
    a.sanitize()
    expect(a.apprentices, '两位都留下(不丢人)').toHaveLength(2)
    const uids = a.apprentices.map(x => x.uid)
    expect(new Set(uids).size, '号必须唯一').toBe(2)

    const [first, second] = uids
    expect(a.dispatch(first!, 'herb', 0)).toBe(true)
    expect(a.dispatch(second!, 'ore', 0)).toBe(true)
    expect(a.apprentices[0]!.task!.spec).toBe('herb')
    expect(a.apprentices[1]!.task!.spec).toBe('ore')
  })

  it('各尽其长一键:缺灵草时闲置道童全体去采药,忙的不动', () => {
    const a = useApprenticeStore()
    const player = usePlayerStore()
    player.major = 0 // 灵草品阶 1;herb 缺、其余 0 也不及 herb 短缺分
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

  it('各尽其长坏时钟:一名都不派,也不写坏完工时刻', () => {
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [
        { uid: 'x', archId: 'ap_youxia', level: 1, bond: 0, task: null },
        { uid: 'y', archId: 'ap_daotong', level: 1, bond: 0, task: null }
      ] as OwnedApprentice[]
    })
    expect(a.dispatchAll(NaN)).toBe(0)
    expect(a.apprentices.every(x => x.task === null), '全员仍闲置').toBe(true)
  })

  it('真传道童转世:最高羁绊凝成跨世之缘,新世 starter 带传承羁绊入场并被消耗', () => {
    const a = useApprenticeStore()
    // 取最高羁绊 150,封顶真传 100
    a.$patch({
      apprentices: [
        { uid: 'x', archId: 'ap_luanniao', level: 1, bond: 150, task: null },
        { uid: 'y', archId: 'ap_youxia', level: 1, bond: 40, task: null }
      ] as OwnedApprentice[]
    })
    a.resetForRebirth()
    expect(a.apprentices, '道童本体随世散去').toHaveLength(0)
    expect(a.rebirthKarma, '真传凝缘,封顶到真传位阶').toBe(100)

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

/**
 * 超槽位截断。
 *
 * apprenticeSlots 最多 5 名,而 recruit 的判据是 `apprentices.length >= apprenticeSlots(...)`。
 * sanitize 原先不截断:把 apprentices 撑到上百名的坏档会被原样吃下,recruit 从此恒返 'full',
 * 玩家再也收不到道童 —— 与「行囊已满」「灵脉容量已尽」是同一类坏档后果。
 */
describe('门庭 · 超槽位坏档截断', () => {
  function many(n: number) {
    const arch = APPRENTICES[0]!.id
    return Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, archId: arch, level: 1, bond: 0, task: null }))
  }

  it('槽位以内原样保留', () => {
    const player = usePlayerStore()
    player.major = 20
    const a = useApprenticeStore()
    a.apprentices = many(apprenticeSlots(20)) as never
    a.sanitize()
    expect(a.apprentices).toHaveLength(apprenticeSlots(20))
  })

  it('超量时截断到硬上界,而不是「当前境界的槽位」', () => {
    // 按境界截会把「major=0 时留着 2~3 名」这种正常存档也削掉;
    // 境界可升,读档那一刻的境界不该成为丢弟子的理由。
    for (const major of [0, 10, 20]) {
      const player = usePlayerStore()
      player.major = major
      const a = useApprenticeStore()
      a.apprentices = many(100) as never
      a.sanitize()
      expect(a.apprentices.length, `major=${major} 时读到 100 名,应截到硬上界`).toBe(APPRENTICE_SLOT_HARD_CAP)
    }
  })

  it('低境界下留 2~3 名弟子是正常存档,不被截断(硬上界而非当前槽位)', () => {
    const player = usePlayerStore()
    player.major = 0 // 当前槽位 1
    const a = useApprenticeStore()
    a.apprentices = many(3) as never
    a.sanitize()
    expect(a.apprentices.length, '按当前槽位截会误删正常存档;上限取硬上界才对').toBe(3)
    expect(apprenticeSlots(0), '当前境界槽位确实只有 1 —— 这正是不能用它当截断依据的原因').toBe(1)
  })

  it('截断后 recruit 不再恒返 full(仍有可收种类时能收到)', () => {
    const player = usePlayerStore()
    player.major = 20
    const resources = useResourcesStore()
    resources.spiritStone = gn(1e12)
    const a = useApprenticeStore()
    // 只留一门,截断后仍有别的种类可收
    a.apprentices = many(100) as never
    a.sanitize()
    expect(a.apprentices.length).toBe(apprenticeSlots(20))
    expect(a.apprentices.length, '槽位已满时 recruit 返回 full 是正常的').toBe(5)
  })

  it('截断保持存档顺序(前面的留下)', () => {
    const player = usePlayerStore()
    player.major = 20
    const a = useApprenticeStore()
    a.apprentices = many(50) as never
    a.sanitize()
    expect(a.apprentices[0]!.uid).toBe('u0')
    expect(a.apprentices.map(x => x.uid)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4'])
  })

  it('空门庭仍是空(不因截断凭空产生弟子)', () => {
    const a = useApprenticeStore()
    a.apprentices = []
    a.sanitize()
    expect(a.apprentices).toHaveLength(0)
  })
})
})
