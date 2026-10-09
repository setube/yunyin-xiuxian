/**
 * 收徒 · 各尽其长决策函数(`dispatchAllToNeed` / `needTargetDoor`)。
 *
 * 这是「一键各尽其长」的纯计算核心:给定闲置道童与资源库存快照,
 * 决定把每人派到哪一扇门。此前只在 store 层(欠灵草→采药那一支)被间接覆盖,
 * 而「全并列→各自专职」「皆有余→历练兜底」「空手→零派」这几支没有直接单测 ——
 * 本文件把它们逐一钉死,守的是导演口径「040/030/030/030」与历练固定兜底分。
 */
import { describe, it, expect } from 'vitest'
import { dispatchAllToNeed, needTargetDoor, type DispatchNeedStock } from './apprenticeService'

describe('各尽其长 · needTargetDoor 取最缺之门', () => {
  it('采药最缺时,取「采药」为唯一目标', () => {
    // 灵草见底(score 40),其余三门皆够(score ≈0.97)
    const stock: DispatchNeedStock = { herb: 0, ore: 30, wudao: 30, dust: 30 }
    expect(needTargetDoor(stock)).toBe('herb')
  })

  it('皆有余(资源全满)时,历练以固定兜底分胜出', () => {
    // 三门资源 score 皆 < 0.25,历练固定分 0.25 独大
    const stock: DispatchNeedStock = { herb: 200, ore: 150, wudao: 150, dust: 150 }
    expect(needTargetDoor(stock)).toBe('adventure')
  })

  it('四门短缺分全并列时,返回 null(→各自专职)', () => {
    // 各资源 score 恰为 1.0:herb 40/40、ore 30/30、study 30/30、dust 30/30
    const stock: DispatchNeedStock = { herb: 39, ore: 29, wudao: 29, dust: 29 }
    expect(needTargetDoor(stock)).toBeNull()
  })
})

describe('各尽其长 · dispatchAllToNeed 派发', () => {
  it('无闲置道童:不派,返回空', () => {
    const stock: DispatchNeedStock = { herb: 0, ore: 30, wudao: 30, dust: 30 }
    expect(dispatchAllToNeed([], stock)).toEqual([])
  })

  it('采药最缺:全体闲置道童都去采药(各自天赋被压下)', () => {
    const stock: DispatchNeedStock = { herb: 0, ore: 30, wudao: 30, dust: 30 }
    const idle = [
      { uid: 'u1', talent: 'study' as const },
      { uid: 'u2', talent: 'ore' as const },
      { uid: 'u3', talent: 'herb' as const }
    ]
    expect(dispatchAllToNeed(idle, stock)).toEqual([
      { uid: 'u1', spec: 'herb' },
      { uid: 'u2', spec: 'herb' },
      { uid: 'u3', spec: 'herb' }
    ])
  })

  it('皆有余:全体闲置道童都去历练挣灵石', () => {
    const stock: DispatchNeedStock = { herb: 200, ore: 150, wudao: 150, dust: 150 }
    const idle = [
      { uid: 'u1', talent: 'study' as const },
      { uid: 'u2', talent: 'herb' as const }
    ]
    expect(dispatchAllToNeed(idle, stock)).toEqual([
      { uid: 'u1', spec: 'adventure' },
      { uid: 'u2', spec: 'adventure' }
    ])
  })

  it('四门短缺分全并列:全体各自专职,各回各的天赋之门', () => {
    const stock: DispatchNeedStock = { herb: 39, ore: 29, wudao: 29, dust: 29 }
    const idle = [
      { uid: 'u1', talent: 'study' as const },
      { uid: 'u2', talent: 'adventure' as const },
      { uid: 'u3', talent: 'herb' as const }
    ]
    expect(dispatchAllToNeed(idle, stock)).toEqual([
      { uid: 'u1', spec: 'study' },
      { uid: 'u2', spec: 'adventure' },
      { uid: 'u3', spec: 'herb' }
    ])
  })
})
