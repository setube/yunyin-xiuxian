/**
 * 宿命传承 —— 能力位生效(纯函数)回归。
 *
 * 每个效果都必须是**有界、平直**的开关/额度:给定「已持传承 id + 每世用量」,
 * 输出是定值或一条不随时间/世数漂移的账。跨世不带的部分(每世三炉)由用量钳制,
 * 永久生效的部分(出生境界 / 多一选 / 全留功法 / 全带认知)都是布尔级开关。
 *
 * 这里不依赖 Pinia —— 全部效果都是 heritageEffects 的纯函数,输入即输出。
 */
import { describe, expect, it } from 'vitest'
import {
  birthMajorFloor,
  carriesAllLore,
  craftGuaranteeCrafts,
  craftGuaranteeRemaining,
  hasBreakExemption,
  keepsAllGongfa,
  talentChoiceBonus
} from './heritageEffects'

describe('宿命传承 · 能力位生效', () => {
  it('浴火丹心:本世三炉必成,用量逐炉递减,钳在 0 不越界、也不会负数', () => {
    expect(craftGuaranteeCrafts([])).toBe(0) // 未持有:一炉都没有
    expect(craftGuaranteeCrafts(['danxin'])).toBe(3)
    // 本世额度有界:从 3 出发,逐炉递减,到 0 停
    expect(craftGuaranteeRemaining(['danxin'], undefined)).toBe(3)
    expect(craftGuaranteeRemaining(['danxin'], { danxin: 0 })).toBe(3)
    expect(craftGuaranteeRemaining(['danxin'], { danxin: 2 })).toBe(1)
    expect(craftGuaranteeRemaining(['danxin'], { danxin: 3 })).toBe(0)
    expect(craftGuaranteeRemaining(['danxin'], { danxin: 99 })).toBe(0)
  })

  it('元婴凝实:出生起始境界下限抬到筑基(major 1);未持有则炼气(0)', () => {
    expect(birthMajorFloor([])).toBe(0)
    expect(birthMajorFloor(['danxin'])).toBe(0)
    expect(birthMajorFloor(['yuanying'])).toBe(1)
  })

  it('炼虚通感:转世择先天之姿多一个可选项;未持有多一选的额度为零', () => {
    expect(talentChoiceBonus([])).toBe(0)
    expect(talentChoiceBonus(['tonggan'])).toBe(1)
    // 只多一档,不会随世数增长
    expect(talentChoiceBonus(['tonggan', 'tonggan'])).toBe(1)
  })

  it('大乘道统 / 渡劫跬步 / 真仙道痕:开关只在持有时为真', () => {
    expect(keepsAllGongfa([])).toBe(false)
    expect(keepsAllGongfa(['daotong'])).toBe(true)
    expect(hasBreakExemption([])).toBe(false)
    expect(hasBreakExemption(['dubu'])).toBe(true)
    expect(carriesAllLore([])).toBe(false)
    expect(carriesAllLore(['daoben'])).toBe(true)
  })
})
