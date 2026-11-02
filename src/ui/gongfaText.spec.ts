/**
 * 功法提示文案。
 *
 * 这个模块此前没有测试,而它的每条都会直接出现在玩家眼前 ——
 * 尤其 `gongfaUpShortToast`:缺哪样报哪样,两样都缺用「 · 」并列,
 * 是 AGENTS.md「缺资源」那条的落点。
 */
import { describe, expect, it } from 'vitest'
import {
  gongfaAllLearnedToast,
  gongfaComprehendToast,
  gongfaMainToast,
  gongfaSubToast,
  gongfaPageShortToast,
  gongfaSubFullToast,
  gongfaUpDoneToast,
  gongfaUpShortToast,
  gongfaPeakLabel
} from './gongfaText'

describe('功法提示 · 缺资源只报缺的那样', () => {
  it('残页差额:知道差额写「尚差 N 页」,拿不到才写「不足」', () => {
    expect(gongfaPageShortToast(7)).toBe('残页尚差 7 页')
    expect(gongfaPageShortToast(0), '差额为 0 也该照实写,不换成「不足」').toBe('残页尚差 0 页')
    expect(gongfaPageShortToast(undefined), '拿不到差额才退回「不足」').toBe('残页不足')
  })

  it('精进缺料:缺哪样报哪样,两样都缺用「 · 」并列', () => {
    expect(gongfaUpShortToast('wudao', { wudao: 12 })).toBe('悟道点尚差 12')
    expect(gongfaUpShortToast('page', { page: 5 })).toBe('残页尚差 5 页')
    expect(gongfaUpShortToast('both', { wudao: 12, page: 5 })).toBe('悟道点尚差 12 · 残页尚差 5 页')
    // 拿不到差额时退回状态词,不猜数字
    expect(gongfaUpShortToast('wudao')).toBe('悟道点不足')
    expect(gongfaUpShortToast('page', {})).toBe('残页不足')
  })

  it('并列顺序固定:悟道点在前,残页在后', () => {
    const s = gongfaUpShortToast('both', { wudao: 1, page: 2 })
    expect(s.indexOf('悟道点')).toBeLessThan(s.indexOf('残页'))
  })

  it('其余三条照实报结果', () => {
    expect(gongfaAllLearnedToast()).toBe('此境已收全')
    expect(gongfaComprehendToast('太玄经')).toBe('习得《太玄经》')
    expect(gongfaUpDoneToast('太玄经', 3)).toBe('《太玄经》已至第 3 层')
    expect(gongfaSubFullToast(2)).toBe('辅修已满 2 席')
  })

  it('满级状态词:与地界卡同词,主词守 8 字线', () => {
    expect(gongfaPeakLabel()).toBe('已圆满')
    expect(gongfaPeakLabel().length).toBeLessThanOrEqual(8)
  })

  it('都不带劝导与解释(文案规范)', () => {
    const all = [
      gongfaPeakLabel(),
      gongfaPageShortToast(7),
      gongfaAllLearnedToast(),
      gongfaComprehendToast('太玄经'),
      gongfaUpShortToast('both', { wudao: 1, page: 2 }),
      gongfaUpDoneToast('太玄经', 3),
      gongfaSubFullToast(2)
    ]
    for (const s of all) {
      expect(s, `「${s}」出现解释性措辞`).not.toMatch(/请|建议|可以|记得|因为|所以|即可|以便/)
    }
  })
})

describe('功法开关的回执', () => {
  it('主修与辅修各报一句,不写长句也不带解释', () => {
    expect(gongfaMainToast('太玄引气诀')).toBe('主修《太玄引气诀》')
    expect(gongfaSubToast('御风步', true)).toBe('辅修《御风步》')
    expect(gongfaSubToast('御风步', false)).toBe('撤下《御风步》')
  })

  it('回执与按钮文案同一套书名号 —— 界面里看到的是「《x》」', () => {
    for (const t of [gongfaMainToast('太玄引气诀'), gongfaSubToast('御风步', true), gongfaSubToast('御风步', false)]) {
      expect(t).toContain('《')
      expect(t).toContain('》')
      // 状态词不超过 8 个汉字(书名号内的名字不计)
      expect((t.replace(/《.*》/, '').match(/[\u4e00-\u9fa5]/g) ?? []).length).toBeLessThanOrEqual(4)
    }
  })
})
