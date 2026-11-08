/** 存档价格 / 非负整数守卫,坊市与悬赏共用 */
import { describe, expect, it } from 'vitest'
import { SKILL_MULT_CAP } from '@/data/constants'
import type { CombatSkill } from '@/types'
import {
  asBoundedGNum,
  asCombatSkills,
  asNonNegInt,
  asPerRounds,
  RULE_MULT_MAX,
  asPrice,
  SAVE_GNUM_MAX_EXP,
  truncateCodePoints
} from './saveShape'
import { formatGN } from '@/utils/format'

describe('saveShape · asPrice', () => {
  it('形状正确的 GNum 原样读回', () => {
    expect(asPrice({ m: 1.5, e: 3 })).toEqual({ m: 1.5, e: 3 })
  })

  it('缺字段 / 非对象 / NaN 一律归零(不让坏价进算价链路)', () => {
    for (const bad of [undefined, null, 42, '12', {}, { m: 1 }, { m: NaN, e: 2 }, { m: 1, e: Infinity }]) {
      expect(asPrice(bad), `坏样本 ${JSON.stringify(bad)} 应归零`).toEqual({ m: 0, e: 0 })
    }
  })

  /**
   * 指数须有界:gn 只规范化 m、不限制 e,而 formatGN 会把 e 原样印出来。
   * 坏档写 { m: 1, e: 1e9 } 会让界面出现「1.00e1000000000」,
   * { m: 1e308, e: 1e308 } 更会印成「1.00e1e+308」这种非法数字。
   */
  it('指数越界一律归零(否则界面会印出 1.00e1000000000 这种非法数字)', () => {
    for (const bad of [
      { m: 1, e: 1e9 },
      { m: 1, e: -1e9 },
      { m: 1e308, e: 1e308 },
      { m: 1, e: SAVE_GNUM_MAX_EXP + 1 },
      { m: 1, e: -(SAVE_GNUM_MAX_EXP + 1) }
    ]) {
      expect(asPrice(bad), `e=${bad.e} 应归零`).toEqual({ m: 0, e: 0 })
    }
  })

  it('上界之内的正常价格原样读回(修形非空转)', () => {
    // 满级玩家四维实测最大 e=15,999 宽到不可能误伤
    expect(asPrice({ m: 12, e: 15 })).toEqual({ m: 1.2, e: 16 })
    expect(asPrice({ m: 1, e: SAVE_GNUM_MAX_EXP })).toEqual({ m: 1, e: SAVE_GNUM_MAX_EXP })
    expect(asPrice({ m: -5, e: 3 })).toEqual({ m: -5, e: 3 })
  })

  it('格式化的输出始终是合法数字(不再出现 e 套 e)', () => {
    // formatGN 对归零后的价格给「0」,对合法价给常规缩写
    expect(formatGN(asPrice({ m: 1e308, e: 1e308 }))).toBe('0')
    expect(formatGN(asPrice({ m: 1, e: 1e9 }))).toBe('0')
  })
})

describe('saveShape · asNonNegInt', () => {
  it('有限数字向下取整;负数夹回 0', () => {
    expect(asNonNegInt(3.9, 0)).toBe(3)
    expect(asNonNegInt(-4, 7)).toBe(0)
    expect(asNonNegInt(0, 7)).toBe(0)
  })

  it('非数字(NaN / 字符串 / null)用兜底', () => {
    for (const bad of [NaN, '3', null, undefined, Infinity]) {
      expect(asNonNegInt(bad, 7), `坏样本 ${String(bad)} 应回落 7`).toBe(7)
    }
  })
})

/**
 * 单条技能的钳制语义：走公开入口 asCombatSkills(单元素) 观察。
 *
 * 早先这些用例直接调 asCombatSkill —— 它虽是 export，但生产代码只用 asCombatSkills，
 * 于是这个导出成了「只为测试而导出」。改用单元素数组后语义完全等价：
 * 合法则得到一条，非法则被 filter 掉成空表。
 */
const oneSkill = (v: unknown): CombatSkill | null => asCombatSkills([v])[0] ?? null

describe('saveShape · 单条技能的修形', () => {
  it('合法技能原样保留(含已知附加效果)', () => {
    expect(oneSkill({ name: '斩', mult: 2, rate: 0.25, effect: 'pierce' })).toEqual({
      name: '斩',
      mult: 2,
      rate: 0.25,
      effect: 'pierce'
    })
  })

  it('rate 夹到 [0,1]:超过一成必触发、负数永不触发的坏档都回到概率语义', () => {
    expect(oneSkill({ name: '必中', mult: 1.2, rate: 999 })!.rate).toBe(1)
    expect(oneSkill({ name: '封印', mult: 1.2, rate: -3 })!.rate).toBe(0)
  })

  it('mult 非负且有具名上限:负倍率夹回 0,极大有限数不再一击碾平整场', () => {
    expect(oneSkill({ name: '倒吸', mult: -5, rate: 0.5 })!.mult).toBe(0)
    expect(oneSkill({ name: '灭世', mult: 1e300, rate: 0.5 })!.mult).toBe(SKILL_MULT_CAP)
  })

  it('缺名字 / 非有限倍率或概率 / 非对象一律剔除', () => {
    for (const bad of [
      null,
      '斩',
      {},
      { name: '', mult: 1, rate: 0.2 },
      { name: '   ', mult: 1, rate: 0.2 },
      { name: '坏', mult: Number.NaN, rate: 0.2 },
      { name: '坏', mult: 1, rate: Infinity }
    ]) {
      expect(oneSkill(bad), `坏样本 ${JSON.stringify(bad)} 应剔除`).toBeNull()
    }
  })

  it('认不出的 effect 只去掉附加效果,不影响这一击', () => {
    expect(oneSkill({ name: '斩', mult: 2, rate: 0.25, effect: 'ghost_effect' })).toEqual({
      name: '斩',
      mult: 2,
      rate: 0.25
    })
  })

  it('技能表逐条修形,非数组回落空表', () => {
    expect(asCombatSkills(undefined)).toEqual([])
    expect(
      asCombatSkills([
        { name: '斩', mult: 2, rate: 2 },
        { name: '坏', mult: Number.NaN, rate: 0.1 },
        { name: '刺', mult: -1, rate: -1, effect: 'pierce' }
      ])
    ).toEqual([
      { name: '斩', mult: 2, rate: 1 },
      { name: '刺', mult: 0, rate: 0, effect: 'pierce' }
    ])
  })

/**
 * asBoundedGNum:读档 GNum 的统一入口。
 *
 * gn() 只规范化 m、不限制 e,而 formatGN 会把 e 原样印出来。
 * 凡是读档处直接 gn(raw) 的地方,坏档都能让界面出现「1.00e1000000000」。
 * 本条钉住它与 asPrice 同一条界 —— 两者若分叉,就又会出现「一个入口拦、另一个不拦」。
 */
describe('saveShape · asBoundedGNum', () => {
  it('合法 GNum 原样读回(含规范化)', () => {
    expect(asBoundedGNum({ m: 1.5, e: 3 })).toEqual({ m: 1.5, e: 3 })
    expect(asBoundedGNum({ m: 12, e: 15 })).toEqual({ m: 1.2, e: 16 })
    expect(asBoundedGNum({ m: -5, e: 3 })).toEqual({ m: -5, e: 3 })
  })

  it('裸数字按 gn() 归一(旧档常把 GNum 写成 123),字符串与 null 仍归零', () => {
    expect(asBoundedGNum(123)).toEqual({ m: 1.23, e: 2 })
    expect(asBoundedGNum(0)).toEqual({ m: 0, e: 0 })
    for (const bad of ['12', null, undefined]) {
      expect(asBoundedGNum(bad), `坏样本 ${JSON.stringify(bad)} 应归零`).toEqual({ m: 0, e: 0 })
    }
  })

  it('形状坏或指数越界一律归零', () => {
    for (const bad of [
      undefined,
      null,
      '12',
      {},
      { m: 1 },
      { m: NaN, e: 2 },
      { m: 1, e: Infinity },
      { m: 1, e: SAVE_GNUM_MAX_EXP + 1 },
      { m: 1, e: 1e9 }
    ]) {
      expect(asBoundedGNum(bad), `坏样本 ${JSON.stringify(bad)} 应归零`).toEqual({ m: 0, e: 0 })
    }
  })

  it('与 asPrice 完全同界(两个读档入口不许分叉)', () => {
    const samples: unknown[] = [
      { m: 1.5, e: 3 },
      { m: 1, e: SAVE_GNUM_MAX_EXP },
      { m: 1, e: SAVE_GNUM_MAX_EXP + 1 },
      { m: 1, e: 1e9 },
      { m: 1e308, e: 1e308 },
      { m: -5, e: 3 },
      { m: 0, e: 0 }
    ]
    for (const s of samples) {
      expect(asBoundedGNum(s), `样本 ${JSON.stringify(s)} 两个入口给出了不同结果`).toEqual(asPrice(s))
    }
  })

  it('格式化输出始终合法:越界归零后印成「0」', () => {
    expect(formatGN(asBoundedGNum({ m: 1, e: 1e9 }))).toBe('0')
    expect(formatGN(asBoundedGNum({ m: 1, e: SAVE_GNUM_MAX_EXP }))).not.toContain('e+')
  })
})
  /**
   * 截断按字素簇,不按码点。
   *
   * ZWJ 序列(家庭 emoji、带肤色的职业)是「一个字」而不是一串码点:
   * 家庭 emoji 的 `Array.from(...).length` 是 7,而它只是 1 个字。
   * 按码点截会把它劈成两个分开的人 —— 代理对仍是完整的(`isWellFormed()` 为 true,
   * 旧写法因此看不出问题),但字面已经变了。
   */
  it('按字素簇截断,ZWJ 序列不被劈开', () => {
    /*
     * 用 fromCodePoint 拼,不写裸 emoji 字面量:
     * kaiFontCoverage.spec 会扫源码里出现的每一个字符,要求字体覆盖或登记为「交给系统字体」。
     * 测试数据用不到楷体,没必要为它去动字体子集与白名单。
     */
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466)
    // 前缀 5 个汉字 + 1 个家庭 emoji = 6 个字素,限 8 时原样返回
    expect(truncateCodePoints('一二三四五' + family, 8)).toBe('一二三四五' + family)
    // 超长时整簇截:3 个家庭 emoji 限 2,得 2 个完整家庭而不是 14 个码点里的前 2 个
    expect(truncateCodePoints(family.repeat(3), 2)).toBe(family.repeat(2))
    // 普通中文与代理对的基本行为不变
    expect(truncateCodePoints('一二三四五六七八九十', 4)).toBe('一二三四')
    expect(truncateCodePoints(String.fromCodePoint(0x1f600) + 'ab', 1)).toBe(String.fromCodePoint(0x1f600))
  })

})

describe('saveShape · asPerRounds', () => {
  /**
   * 这三道钳制是「坏档不进战斗」的关键:
   * 比例类失控会让玩家一进战斗满血变空血、开局即死;倍率类无上界则一击必杀;
   * interval 写 0 会让 `round % 0` 恒为 NaN,整条规则静默失效。
   */
  it('比例类越界一律夹回 [0,1] —— 负数与大于 1 都不许穿过去', () => {
    expect(asPerRounds({ playerHealPct: -0.5 })!.playerHealPct).toBe(0)
    expect(asPerRounds({ playerHealPct: 3 })!.playerHealPct).toBe(1)
    expect(asPerRounds({ playerShieldPct: -2 })!.playerShieldPct).toBe(0)
    expect(asPerRounds({ playerShieldPct: 99 })!.playerShieldPct).toBe(1)
    // 合法值原样保留
    expect(asPerRounds({ playerHealPct: 0.35 })!.playerHealPct).toBe(0.35)
  })

  it('倍率类有上界 RULE_MULT_MAX —— 负值归零,超界夹到上限', () => {
    expect(asPerRounds({ enemyAtkGrowth: -1 })!.enemyAtkGrowth).toBe(0)
    expect(asPerRounds({ enemyAtkGrowth: 1e9 })!.enemyAtkGrowth).toBe(RULE_MULT_MAX)
    expect(asPerRounds({ enemyAtkGrowth: 1.2 })!.enemyAtkGrowth).toBe(1.2)
  })

  it('interval 至少为 1 —— 写 0 会让 round % 0 恒为 NaN', () => {
    expect(asPerRounds({ interval: 0 })!.interval).toBe(1)
    expect(asPerRounds({ interval: -7 })!.interval).toBe(1)
  })
})
