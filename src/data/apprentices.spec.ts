/**
 * 收徒数据 —— 槽位曲线 / 任务表 / 产出不变量
 */
import { describe, expect, it } from 'vitest'
import {
  APPRENTICE_TASKS,
  APPRENTICES,
  STARTER_APPRENTICE,
  apprenticeDef,
  apprenticeSlots
} from '@/data/apprentices'
import { apprenticeSpoils, dispatchAllToNeed, needTargetDoor } from '@/core/apprenticeService'
import {
  BOND_TITLES,
  bondTitle,
  DISPATCH_ADVENTURE_FIXED_SCORE,
  DISPATCH_NEED_TARGET
} from '@/data/apprentices'
import { toNum } from '@/utils/gnum'

describe('收徒 · 数据不变量', () => {
  it('任务表五种门类齐备,且都派得出工序时', () => {
    expect(APPRENTICE_TASKS.map(t => t.spec)).toEqual(['herb', 'ore', 'adventure', 'seek', 'study'])
    for (const t of APPRENTICE_TASKS) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.seconds).toBeGreaterThan(0)
      expect(t.desc.length).toBeGreaterThan(4)
    }
  })

  it('弟子原型名号唯一、天赋予某门类、开局弟子真实存在', () => {
    expect(new Set(APPRENTICES.map(a => a.id)).size).toBe(APPRENTICES.length)
    for (const a of APPRENTICES) {
      expect(APPRENTICE_TASKS.some(t => t.spec === a.talent), `${a.name} 天赋指向不存在的门类`).toBe(true)
    }
    expect(apprenticeDef(STARTER_APPRENTICE), '开局白送弟子必须真实存在').toBeDefined()
  })

  it('槽位随境界增长:零境一徒,四境二徒,封顶五徒', () => {
    expect(apprenticeSlots(0)).toBe(1)
    expect(apprenticeSlots(3)).toBe(1)
    expect(apprenticeSlots(4)).toBe(2)
    expect(apprenticeSlots(8)).toBe(3)
    expect(apprenticeSlots(99)).toBe(5)
  })

  it('产出:天赋门类更丰,且修为越高带得越多', () => {
    const talentBonus = apprenticeSpoils('ap_luanniao', 'herb', 0, 1).herb! // 有天赋
    const noBonus = apprenticeSpoils('ap_luanniao', 'ore', 0, 1).ore! // 无天赋
    expect(talentBonus).toBeGreaterThan(noBonus)
    expect(apprenticeSpoils('ap_luanniao', 'herb', 0, 5).herb!).toBeGreaterThan(talentBonus)
  })

  it('寻宝确定取一枚可炼丹,每次不空手', () => {
    const s = apprenticeSpoils('ap_lingtong', 'seek', 0, 2)
    expect(s.pillId).toBeTruthy()
    expect(s.pillCount).toBe(1)
    // 无人能凭空拿丹 —— 是实打实一枚
    expect(s.herb).toBeUndefined()
  })

  it('一份产出绝不为负、不大得过离谱', () => {
    for (const arch of APPRENTICES) {
      for (const t of APPRENTICE_TASKS) {
        const s = apprenticeSpoils(arch.id, t.spec, 0, 20)
        for (const k of ['herb', 'ore', 'dust', 'wudao'] as const) {
          const v = s[k]
          if (typeof v === 'number') expect(v).toBeGreaterThanOrEqual(0)
        }
        if (s.pillId) expect(s.pillCount).toBeGreaterThan(0)
        if (s.stone) expect(toNum(s.stone)).toBeGreaterThan(0)
      }
    }
  })

  it('各尽其长:缺哪个就全体派去哪个门(缺者分高,确定性)', () => {
    // herb 为 0 → score = 40/1 = 40,远高于其余 → 全体采药
    const idle = [
      { uid: 'a', talent: 'ore' as const },
      { uid: 'b', talent: 'study' as const }
    ]
    expect(dispatchAllToNeed(idle, { herb: 0, ore: 500, wudao: 500, dust: 500 })).toEqual([
      { uid: 'a', spec: 'herb' },
      { uid: 'b', spec: 'herb' }
    ])
  })

  it('各尽其长:皆有余时去历练挣灵石(adventure 固定兜底分)', () => {
    // 各资源 score < 0.25(历练兜底),故全体去历练
    const idle = [{ uid: 'a', talent: 'herb' as const }]
    expect(dispatchAllToNeed(idle, { herb: 200, ore: 200, wudao: 200, dust: 200 })).toEqual([
      { uid: 'a', spec: 'adventure' }
    ])
  })

  it('各尽其长:目标分无差别 → 各自专职;无闲置则空手', () => {
    // herb score = 40/4 = 10 与 ore score = 30/3 = 10 并列最高 → null → 各自专职
    expect(needTargetDoor({ herb: 3, ore: 2, wudao: 100, dust: 100 })).toBeNull()
    const idle = [
      { uid: 'a', talent: 'herb' as const },
      { uid: 'b', talent: 'ore' as const }
    ]
    expect(dispatchAllToNeed(idle, { herb: 3, ore: 2, wudao: 100, dust: 100 })).toEqual([
      { uid: 'a', spec: 'herb' },
      { uid: 'b', spec: 'ore' }
    ])
    expect(dispatchAllToNeed([], { herb: 0, ore: 0, wudao: 0, dust: 0 })).toEqual([])
  })

  it('羁绊位阶:按累计完工趟数阈值换上称谓(阈值递减验证)', () => {
    expect(BOND_TITLES[0]!.min).toBe(0)
    const cases: Array<[number, string]> = [
      [0, '道童'],
      [9, '道童'],
      [10, '道仆'],
      [29, '道仆'],
      [30, '道徒'],
      [59, '道徒'],
      [60, '记名弟子'],
      [99, '记名弟子'],
      [100, '真传'],
      [500, '真传']
    ]
    for (const [bond, name] of cases) {
      expect(bondTitle(bond), `bond=${bond} 应为 ${name}`).toBe(name)
    }
    expect(BOND_TITLES.length).toBe(5)
  })

  it('各尽其长目标水位与历练兜底分是确定常数', () => {
    expect(DISPATCH_NEED_TARGET).toEqual({ herb: 40, ore: 30, wudao: 30, dust: 30 })
    expect(DISPATCH_ADVENTURE_FIXED_SCORE).toBe(0.25)
  })
})
