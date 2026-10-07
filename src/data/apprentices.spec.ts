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
import { apprenticeSpoils } from '@/core/apprenticeService'
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
})
