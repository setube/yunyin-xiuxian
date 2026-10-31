/**
 * 审计基准:平衡审计(药品价值、期望产出)在一个**固定的人设**上取数。
 *
 * pillValue 用 AUDIT_MASTERY(1) / AUDIT_MATERIAL_LORE(1) / AUDIT_SKILL(60) 三条基准
 * 代入 craftability 的真实公式。这套基准此前没有测试,但它有个隐蔽风险:
 * 公式一侧(composeSuccessRate / bonusChanceOf)改了系数或钳制范围,
 * 审计结论会整体漂移,而审计本身就是用来判定平衡的 —— 漂了也没人知道。
 *
 * 本条不镜像实现,只钉「这套基准代入真实公式后的读数」与「基准本身的形态」:
 *   - 三条基准都落在合法区间内(否则钳制会让基准失效)
 *   - 基准成功率与基准出丹率的具体数值(改公式时这些数必须一起改,漂移即红)
 *   - 基准不随调用次数变化(纯函数)
 */
import { describe, expect, it } from 'vitest'
import { bonusChanceOf, composeSuccessRate, CRAFT_BASE_RATE } from './craftability'
import { PILL_SECOND_CAP } from '@/data/constants'
import { AUDIT_SKILL } from './pillValue'

/** 审计基准(与 pillValue 内部保持一致;那边未导出,此处按值复述并校验) */
const AUDIT_MASTERY = 1
const AUDIT_MATERIAL_LORE = 1

describe('审计基准 · 形态', () => {
  it('三条基准都落在公式的合法区间内', () => {
    // composeSuccessRate 里 mastery / matLore 先钳到 [0,1],skill 先除以 100 再钳
    expect(AUDIT_MASTERY).toBeGreaterThanOrEqual(0)
    expect(AUDIT_MASTERY).toBeLessThanOrEqual(1)
    expect(AUDIT_MATERIAL_LORE).toBeGreaterThanOrEqual(0)
    expect(AUDIT_MATERIAL_LORE).toBeLessThanOrEqual(1)
    expect(AUDIT_SKILL).toBeGreaterThanOrEqual(0)
    expect(AUDIT_SKILL).toBeLessThanOrEqual(100)
  })

  it('技能基准低于满级(审计的是「练到中段的人」,不是满级号)', () => {
    expect(AUDIT_SKILL, 'AUDIT_SKILL 已是满级,审计人设失去代表性').toBeLessThan(100)
    expect(AUDIT_SKILL, 'AUDIT_SKILL 过低,审计人设过于苛刻').toBeGreaterThan(30)
  })
})

describe('审计基准 · 代入真实公式的读数', () => {
  it('基准成功率(同阶)= 95% × 1 × 1 × (0.3 + 0.7×0.6) = 0.684', () => {
    const rate = composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 0)
    expect(rate).toBeCloseTo(0.684, 3)
    // 与 CRAFT_BASE_RATE 挂钩:改了基础成功率,这里的数也要一起改
    expect(rate).toBeCloseTo(CRAFT_BASE_RATE * 0.72, 3)
  })

  it('基准成功率(越阶一档)= 同阶 × 0.6 = 0.4104', () => {
    // overReachFactor 的查表:over=1 → 0.6
    const sameRank = composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 0)
    expect(composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 1)).toBeCloseTo(sameRank * 0.6, 4)
  })

  it('同阶基准成功率在 (0.6, 0.8) 之间 —— 审计人设既有希望又不稳操胜券', () => {
    const rate = composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 0)
    expect(rate).toBeGreaterThan(0.6)
    expect(rate).toBeLessThan(0.8)
  })

  it('基准出丹率 = 1×0.18 + 60/500 = 0.3', () => {
    expect(bonusChanceOf(AUDIT_MASTERY, AUDIT_SKILL)).toBeCloseTo(0.3, 6)
  })

  it('越阶重压会压低成功率,但压不到 0(over>0 时始终为正)', () => {
    const base = composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 0)
    let prev = base
    for (const over of [1, 2, 3, 5]) {
      const cur = composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, over)
      expect(cur, `over=${over} 时成功率未随越阶下降`).toBeLessThanOrEqual(prev)
      expect(cur, `over=${over} 时成功率归零,炼丹变得不可能`).toBeGreaterThan(0)
      prev = cur
    }
  })
})

describe('审计基准 · 纯函数性质', () => {
  it('同一组入参重复调用结果恒定(不影响随机源)', () => {
    const a = composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 1)
    for (let i = 0; i < 5; i += 1) {
      expect(composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, 1)).toBe(a)
    }
  })

  it('mastery/matLore 超过 1 会被钳制,不会让成功率突破基础值', () => {
    const atOne = composeSuccessRate(1, 1, AUDIT_SKILL, 0)
    expect(composeSuccessRate(5, 1, AUDIT_SKILL, 0)).toBeCloseTo(atOne, 6)
    expect(composeSuccessRate(1, 5, AUDIT_SKILL, 0)).toBeCloseTo(atOne, 6)
  })

  /**
   * 记录一处注释与实际的偏差:bonusChanceOf 的注释写「封顶 0.5」,
   * 但公式在合法区间内(mastery∈[0,1]、skill∈[0,100])的理论最大值是 0.38,
   * 封顶分支实际永远不生效。不擅自改公式(会动平衡),只把事实钉住 ——
   * 将来有人以为双丹率能到 50% 时会在这里看到真相。
   */
  it('合法区间内出丹率上限是 0.38,「封顶 0.5」在实际玩法里不生效', () => {
    expect(bonusChanceOf(1, 100), '满熟练 + 满技能才是区间内的最大值').toBeCloseTo(0.38, 6)
    // 角点即极值:公式对 mastery 与 skill 都单调不减,故区间最大值必在 (1,100)
    expect(bonusChanceOf(1, 100), '单调函数的区间最大值必在角点').toBeGreaterThanOrEqual(bonusChanceOf(0.9, 90))
    expect(bonusChanceOf(1, 100), '角点值 0.38 < 封顶 0.5 => 封顶分支在区间内是死分支').toBeLessThan(0.5)
  })

  it('封顶分支只在越界入参下才可能触发(记录该行为,不代表玩法可达)', () => {
    expect(bonusChanceOf(99, 999), '越界入参被上限挡住').toBeCloseTo(0.5, 6)
  })

describe('双丹概率 · 两层封顶的分工', () => {
  /**
   * 双丹率上有两个数,极易混淆:
   *   bonusChanceOf 内部的 Math.min(0.5, ...) —— 实际是死分支,公式最大只有 0.38
   *   craftability().bonusChanceWithYield 的 PILL_SECOND_CAP(0.8) —— 真正生效的那层
   * 因为基础值可以加上丹心/丹圣等 alchemyYield 词条再越过 0.5,所以 0.5 那层挡不住任何真实输入。
   * 本条钉住三者的数值关系,任一处被改动都会红。
   */
  it('bonusChanceOf 的合法区间最大值 0.38,低于内部封顶 0.5(故 0.5 是死分支)', () => {
    const max = bonusChanceOf(1, 100)
    expect(max).toBeCloseTo(0.38, 6)
    expect(max, '基础概率够到了 0.5,死分支的说法不再成立,请重读注释').toBeLessThan(0.5)
  })

  it('真正生效的封顶 PILL_SECOND_CAP 高于基础概率上限(留出词条空间)', () => {
    expect(PILL_SECOND_CAP).toBeGreaterThan(bonusChanceOf(1, 100))
    expect(PILL_SECOND_CAP, 'PILL_SECOND_CAP 与内部 0.5 撞了,两层封顶失去区分').not.toBe(0.5)
  })

  it('三层数值严格递增:0.38 < 0.5 < 0.8', () => {
    const base = bonusChanceOf(1, 100)
    expect(base).toBeLessThan(0.5)
    expect(0.5).toBeLessThan(PILL_SECOND_CAP)
  })

  it('要顶到 PILL_SECOND_CAP,词条需要补足约 0.42 —— 该量级在丹心/丹圣的堆叠范围内', () => {
    const need = PILL_SECOND_CAP - bonusChanceOf(1, 100)
    expect(need).toBeCloseTo(0.42, 6)
    // 丹心最高 40%、丹圣最高 20%,两件叠起来能过 0.42;说明 0.8 那层挡得住真实输入
    expect(need, '所需词条量大到玩法里凑不出来,0.8 就成了死分支').toBeLessThan(0.6)
  })
})
})
