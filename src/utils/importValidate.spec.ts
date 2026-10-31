/**
 * 存档导入的唯一校验闸门。
 *
 * validateImportPayload 返回 null 表示「可以导入」,否则返回一句**直接展示给玩家**的中文拒因。
 * 它是导入路径上唯一的把关点,此前没有任何测试。
 *
 * 除了五个分支各自命中,本条还钉两件容易被忽略的事:
 *   1. 合法存档必须返回 null(误拒好档比放过坏档更伤玩家)
 *   2. 检查顺序固定:game → version → 版本过高 → data → 关键数据段
 *      顺序变了会让玩家拿到误导性的拒因(例如缺 version 却被告知「非本游戏存档」)
 */
import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, validateImportPayload } from '@/utils/storage'

/** 造一份合法存档,再按需破坏某个字段 */
function good(): Record<string, unknown> {
  return {
    game: 'yunyin-xiuxian',
    version: SAVE_VERSION,
    exportedAt: 1700000000000,
    data: { player: {}, game: {} }
  }
}

describe('存档导入校验 · 合法存档', () => {
  it('完整合法的存档返回 null(放行)', () => {
    expect(validateImportPayload(good())).toBeNull()
  })

  it('版本低于当前也放行(老档可升级)', () => {
    const p = good()
    p.version = 1
    expect(validateImportPayload(p), '旧版本存档必须能导入').toBeNull()
  })

  it('data 里多出未知分片不影响校验', () => {
    const p = good()
    p.data = { player: {}, game: {}, somethingNew: [] }
    expect(validateImportPayload(p)).toBeNull()
  })
})

describe('存档导入校验 · 拒因逐条', () => {
  it('不是对象', () => {
    expect(validateImportPayload(null)).toBe('存档格式无效')
    expect(validateImportPayload(undefined)).toBe('存档格式无效')
    expect(validateImportPayload('x')).toBe('存档格式无效')
    expect(validateImportPayload(42)).toBe('存档格式无效')
  })

  it('game 标识不对', () => {
    const p = good()
    p.game = 'another-game'
    expect(validateImportPayload(p)).toBe('非本游戏存档')
  })

  it('缺版本号', () => {
    const p = good()
    delete p.version
    expect(validateImportPayload(p)).toBe('存档缺少版本号')
    p.version = '2'
    expect(validateImportPayload(p), '版本号是字符串也算缺').toBe('存档缺少版本号')
  })

  it('版本高于当前:明确拒绝,不尝试向下兼容', () => {
    const p = good()
    p.version = SAVE_VERSION + 1
    expect(validateImportPayload(p)).toBe('存档版本过高')
  })

  it('缺数据段', () => {
    const p = good()
    delete p.data
    expect(validateImportPayload(p)).toBe('存档数据段缺失')
    p.data = null
    expect(validateImportPayload(p)).toBe('存档数据段缺失')
  })

  it('数据段在但缺关键分片', () => {
    const p = good()
    p.data = { player: {} }
    expect(validateImportPayload(p)).toBe('存档缺少关键数据')
    p.data = { game: {} }
    expect(validateImportPayload(p), '只有 game 没有 player 也拒').toBe('存档缺少关键数据')
  })
})

describe('存档导入校验 · 顺序', () => {
  it('game 字段缺失时报「非本游戏存档」——记录这个当前行为', () => {
    // 严格说这是误导(缺字段被说成「别的游戏的存档」),但它是现状;
    // 真要改成「存档格式无效」属产品文案决策,不在本条范围内擅自改。
    const p = good()
    delete p.game
    expect(validateImportPayload(p)).toBe('非本游戏存档')
  })

  it('game 与 version 同时不对时,先报 game(顺序即玩家看到的顺序)', () => {
    const p = good()
    p.game = 'x'
    delete p.version
    expect(validateImportPayload(p)).toBe('非本游戏存档')
  })

  it('version 与 data 同时不对时,先报 version', () => {
    const p = good()
    delete p.version
    delete p.data
    expect(validateImportPayload(p)).toBe('存档缺少版本号')
  })

  it('版本过高优先于数据段检查(高版本档不必再验结构)', () => {
    const p = good()
    p.version = SAVE_VERSION + 1
    delete p.data
    expect(validateImportPayload(p)).toBe('存档版本过高')
  })
})
