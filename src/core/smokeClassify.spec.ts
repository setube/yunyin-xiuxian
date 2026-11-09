/** dead → 冒烟判失败(exitCode 1) */
import { describe, expect, it } from 'vitest'
import { classifySmoke, namePattern, SMOKE_ALLOWLIST } from '../../scripts/smoke-classify'

describe('冒烟死按钮分类器(纯决策)', () => {
  it('幂等选中项(白名单)归读数 —— 点当前已选中值,不判失败', () => {
    // 战报速度 ×1(已选中)
    const d = classifySmoke('/settings', 'page', '×1', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '应点明白是幂等选中项').toContain('幂等选中项')
    // 主题跟随系统(已选中)
    const t = classifySmoke('/settings', 'page', '跟随系统', null)
    expect(t.bucket).toBe('silent')
  })

  it('干净重试有变化(功能正常)归读数,抑制全流程误报', () => {
    const d = classifySmoke('/adventure', 'page', '出发', true)
    expect(d.bucket).toBe('silent')
    expect(d.line, '报成功能正常以别于死按钮').toContain('功能正常')
  })

  it('干净重试仍无变化 = 真死控件,判失败', () => {
    const d = classifySmoke('/adventure', 'page', '出发', false)
    expect(d.bucket).toBe('dead')
  })

  it('干净态无法单独复现(如弹窗按钮在干净态未开)归读数,不误伤', () => {
    const d = classifySmoke('/alchemy', 'modal', '结清', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '报成无法复现').toContain('无法单独复现')
  })

  it('空行格式:page 与 modal 的动词区分,dead 行即原样条目', () => {
    expect(classifySmoke('/a', 'page', 'X', false).line).toBe('/a 点「X」')
    expect(classifySmoke('/a', 'modal', 'X', false).line).toBe('/a 弹窗内点「X」')
  })

  it('白名单保持三条幂等选中项 —— 未来去重不得静默把工作控件翻成死按钮', () => {
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「×1」')
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「跟随系统」')
    expect(SMOKE_ALLOWLIST).toContain('/inventory 弹窗内点「不设」')
  })

  it('namePattern 定位同一按钮:在捕获到的空白处容忍空白多寡,别处不松口', () => {
    expect(namePattern('战 力▸拆解').test('战 力▸拆解')).toBe(true)
    expect(namePattern('战 力▸拆解').test('战  力▸拆解')).toBe(true)
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('别处')).toBe(false)
    expect(namePattern('战 力▸拆解').test('战 力 ▸ 拆解')).toBe(false)
  })

  /*
   * 带动态数值的按钮名。
   *
   * 「深入探寻小险 … 一胜约 219 石」里的数值是当次生成的,下一轮再点必然换数。
   * 按字面精确匹配的话 cleanRetry 永远找不到它,一律判成「干净态无法单独复现」
   * —— 那条读数是假的,该按钮其实从未被单独验证过。
   */
  it('namePattern 容忍按钮名里的动态数字,但文字骨架仍须逐字相同', () => {
    const a = '深入探寻小险 行程 1小时0分 · 收益 ×1.4 · 一胜约 219 石 · 36 修为'
    const b = '深入探寻小险 行程 1小时0分 · 收益 ×1.4 · 一胜约 7.065万 石 · 36 修为'
    expect(namePattern(a).test(b), '数值换了也该认得出是同一枚按钮').toBe(true)
    expect(namePattern(a).test(a)).toBe(true)
    // 文字变了不认
    expect(namePattern(a).test(b.replace('深入', '浅出'))).toBe(false)
    expect(namePattern(a).test(b.replace('小险', '大险'))).toBe(false)
    // 不带数字的名字不受影响
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('出发了')).toBe(false)
  })
})
