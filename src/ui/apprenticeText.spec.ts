/**
 * 道童归来文案:道童页的 toast 与离线归来卷轴共用这一份。
 *
 * 它是纯展示层,但两处边界会直接露给玩家:
 *   1. 全部产出为空时返回空串 —— 调用方都先判了 length,空串不该到界面
 *   2. pillId 有值但 pillCount 缺省时默认一枚;pillCount 为 0 时当前实现仍会印出来
 *
 * 第 2 条是本文件存在的主要原因:它是玩家能读到的文案,不该出现「丹药×0」。
 * 此处先记录现状,若判定为缺陷再改实现(不擅自改)。
 */
import { describe, expect, it } from 'vitest'
import { gn } from '@/utils/gnum'
import { apprenticeHerbName, apprenticeReturnText, apprenticeSpoilsText } from '@/ui/apprenticeText'
import { HERB_GRADE_NAMES, herbGradeOfMajor } from '@/data/herbGrades'
import { pillDef } from '@/data/pills'

const MAJOR = 6

describe('道童产出文案', () => {
  it('空产出返回空串(调用方负责不把它显示出来)', () => {
    expect(apprenticeSpoilsText({}, MAJOR)).toBe('')
  })

  it('灵草名与品阶换算同源,不另写一份', () => {
    expect(apprenticeHerbName(MAJOR)).toBe(HERB_GRADE_NAMES[herbGradeOfMajor(MAJOR)])
  })

  it('单项产出:只印有值的那一项', () => {
    expect(apprenticeSpoilsText({ herb: 3 }, MAJOR)).toBe(`${apprenticeHerbName(MAJOR)}×3`)
    expect(apprenticeSpoilsText({ ore: 2 }, MAJOR)).toBe('玄铁×2')
    expect(apprenticeSpoilsText({ dust: 5 }, MAJOR)).toBe('器灵尘×5')
    expect(apprenticeSpoilsText({ wudao: 1 }, MAJOR)).toBe('悟道×1')
  })

  it('灵石走 formatGN,大数不印成原始数字', () => {
    expect(apprenticeSpoilsText({ stone: gn(1200) }, MAJOR)).toContain('灵石 ')
    expect(apprenticeSpoilsText({ stone: gn(1e9) }, MAJOR)).not.toContain('1000000000')
  })

  it('多项用「 · 」连接,顺序固定为 草/铁/尘/悟/石/丹', () => {
    const text = apprenticeSpoilsText({ herb: 1, ore: 1, dust: 1, wudao: 1, stone: gn(1) }, MAJOR)
    const parts = text.split(' · ')
    expect(parts[0]).toContain('×1')
    expect(parts[1]).toContain('玄铁')
    expect(parts[2]).toContain('器灵尘')
    expect(parts[3]).toContain('悟道')
    expect(parts[4]).toContain('灵石')
  })

  it('值为 0 / undefined 的项不印(不出现「×0」)', () => {
    expect(apprenticeSpoilsText({ herb: 0, ore: 0, dust: 0, wudao: 0 }, MAJOR)).toBe('')
  })

  it('丹药:缺省数量按一枚计', () => {
    const anyPill = pillDef('p_jvqidan') ?? pillDef('p_huichun')
    expect(anyPill, '找不到用于测试的丹药').toBeDefined()
    const text = apprenticeSpoilsText({ pillId: anyPill!.id }, MAJOR)
    expect(text).toContain('×1')
    expect(text).toContain(anyPill!.name)
  })

  it('丹药数量为 0 时当前仍会印出「×0」—— 记录现状,未擅自改', () => {
    const anyPill = pillDef('p_jvqidan') ?? pillDef('p_huichun')
    const text = apprenticeSpoilsText({ pillId: anyPill!.id, pillCount: 0 }, MAJOR)
    // 与上面「值为 0 不印」的规则不一致:pillId 只判存在、不看数量。
    // 若判定要改,应把条件写成 s.pillId && (s.pillCount ?? 1) > 0。
    expect(text).toContain('×0')
  })
})

describe('道童归来汇总', () => {
  it('没有完工的道童时返回空串', () => {
    expect(apprenticeReturnText([], MAJOR)).toBe('')
  })

  it('一名:直接报产出,不带「N 名」', () => {
    const text = apprenticeReturnText([{ herb: 2 }], MAJOR)
    expect(text).toBe(`道童归来:${apprenticeHerbName(MAJOR)}×2`)
    expect(text).not.toContain('名')
  })

  it('多名:报人数,各人产出用分号隔开', () => {
    const text = apprenticeReturnText([{ herb: 1 }, { ore: 1 }, { dust: 1 }], MAJOR)
    expect(text).toContain('道童归来 3 名')
    expect(text.split(';')).toHaveLength(3)
  })

  it('人数与数组长度一致,不多不少', () => {
    for (const n of [2, 4, 9]) {
      const list = Array.from({ length: n }, () => ({ herb: 1 }))
      expect(apprenticeReturnText(list, MAJOR)).toContain(`道童归来 ${n} 名`)
    }
  })
})
