/**
 * 冒烟「死按钮」分类器单测 —— round-271 判失败逻辑的纯决策部分。
 *
 * round-271 把「点了没反应」从只读数升级为判失败(dead → exitCode 1),但那段判定
 * 此前只藏在 9 分钟的 e2e 冒烟脚本里、零单测:判定器一出回归(dead 永不置位 / 白名单
 * 错配 / 三态错判),冒烟要么误报、要么漏掉真死控件,CI 却无症状。这里把从
 * scripts/smoke-classify.ts 抽出的纯决策直接打表。
 */
import { describe, expect, it } from 'vitest'
import { classifySmoke, namePattern, SMOKE_ALLOWLIST } from '../../scripts/smoke-classify'

describe('冒烟死按钮分类器(纯决策)', () => {
  it('幂等选中项(白名单)归读数 —— 点当前已选中值,不判失败', () => {
    // 战报速度 ×1 已选中时再点它 = 无变化,是设计内
    const d = classifySmoke('/settings', 'page', '×1', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '应点明白是幂等选中项').toContain('幂等选中项')
    // 主题跟随系统已选中时再点它 = 无变化
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

  it('白名单保持两条幂等选中项 —— 未来去重不得静默把工作控件翻成死按钮', () => {
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「×1」')
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「跟随系统」')
  })

  it('namePattern 定位同一按钮:在捕获到的空白处容忍空白多寡,别处不松口', () => {
    expect(namePattern('战 力▸拆解').test('战 力▸拆解')).toBe(true)
    // 捕获到的「战 力」这一处空档随意多空格也认(命中同一按钮)
    expect(namePattern('战 力▸拆解').test('战  力▸拆解')).toBe(true)
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('别处')).toBe(false)
    // 捕获里没空白的地方不许凭空多出空白(那已是另一个按钮)
    expect(namePattern('战 力▸拆解').test('战 力 ▸ 拆解')).toBe(false)
  })
})
