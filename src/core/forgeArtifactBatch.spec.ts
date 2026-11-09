/** 祭炼连升 · 批量账:计划只算不扣;连炼扣费/等级与计划一致;0 重计划不扣 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { GNum } from '@/types'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { add, gn, sub } from '@/utils/gnum'
import { ARTIFACT_MAX_LEVEL, artifactDef } from '@/data/artifacts'
import { artifactBatchPlan, artifactShortfall, artifactUpCostAt, upgradeArtifact, upgradeArtifactBatch } from './forge'

/** 夹具:凡品 af_muyu(fromTier 1),悟道公式品阶系数恒 ×1 */
const DEF_ID = 'af_muyu'
const WUDAO_BUDGET = 1_000_000_000
const STONE_BUDGET = () => gn(1e30)

function seat(level: number): void {
  useInventoryStore().artifacts = [{ defId: DEF_ID, level }]
}

function rich(): void {
  const r = useResourcesStore()
  r.wudao = WUDAO_BUDGET
  r.spiritStone = STONE_BUDGET()
}

/** 第 lv 重的单次代价;直接用 forge.artifactUpCostAt,不另抄公式 */
function costOf(lv: number): { wudao: number; stone: GNum } {
  return artifactUpCostAt(artifactDef(DEF_ID)!, lv)!
}

/** 从第 from 重起共 n 重的成本累计 */
function sumUpTo(from: number, n: number): { wudao: number; stone: GNum } {
  let wudao = 0
  let stone = gn(0)
  for (let i = from; i < from + n; i += 1) {
    wudao += costOf(i).wudao
    stone = add(stone, costOf(i).stone)
  }
  return { wudao, stone }
}

describe('祭炼连升 · 批量账', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('计划只算不动手:到满重时重数=上限、花费=各重成本之和、资源分文未动', () => {
    seat(0)
    rich()
    const beforeWudao = useResourcesStore().wudao
    const beforeStone = useResourcesStore().spiritStone
    const plan = artifactBatchPlan(DEF_ID)
    expect(plan.levels).toBe(ARTIFACT_MAX_LEVEL)
    expect(plan.wudao).toBe(sumUpTo(0, ARTIFACT_MAX_LEVEL).wudao)
    expect(plan.stone).toEqual(sumUpTo(0, ARTIFACT_MAX_LEVEL).stone)
    expect(plan.atCap).toBe(true)
    expect(useResourcesStore().wudao).toBe(beforeWudao)
    expect(useResourcesStore().spiritStone).toEqual(beforeStone)
  })

  /** 故障注入:把 artifactBatchPlan 的 from 改成直接用 owned.level,本条红 */
  it('起手重数不是有限整数时,计划仍给得出一个数的重数', () => {
    rich()
    for (const bad of [Number.NaN, -5, 2.7]) {
      seat(bad)
      const plan = artifactBatchPlan(DEF_ID)
      expect(Number.isFinite(plan.levels), `起手 ${bad} 时 levels 不是有限数:${plan.levels}`).toBe(true)
      expect(Number.isInteger(plan.levels), `起手 ${bad} 时 levels 不是整数:${plan.levels}`).toBe(true)
      expect(plan.levels, `起手 ${bad} 时重数越界`).toBeGreaterThanOrEqual(0)
      expect(plan.levels).toBeLessThanOrEqual(ARTIFACT_MAX_LEVEL)
      const expectFrom = Number.isFinite(bad) ? Math.max(0, Math.floor(bad)) : 0
      expect(plan.levels).toBe(ARTIFACT_MAX_LEVEL - expectFrom)
      expect(plan.wudao).toBe(sumUpTo(expectFrom, plan.levels).wudao)
    }
  })

  it('从非零重起算:中途起炼,计划只覆盖剩下那几重', () => {
    seat(3)
    rich()
    const plan = artifactBatchPlan(DEF_ID)
    expect(plan.levels).toBe(ARTIFACT_MAX_LEVEL - 3)
    expect(plan.wudao).toBe(sumUpTo(3, ARTIFACT_MAX_LEVEL - 3).wudao)
  })

  it('悟道封顶:只够三重的悟道就只炼三重,差一点则只炼两重(余额限制,不到满重)', () => {
    seat(0)
    const r = useResourcesStore()
    r.spiritStone = STONE_BUDGET()
    const t3 = sumUpTo(0, 3)
    r.wudao = t3.wudao // 恰够三重
    expect(artifactBatchPlan(DEF_ID)).toMatchObject({ levels: 3, atCap: false })
    r.wudao = t3.wudao - 1 // 差一点
    expect(artifactBatchPlan(DEF_ID).levels).toBe(2)
  })

  it('灵石封顶:悟道管够、灵石只够两重时,计划只炼两重', () => {
    seat(0)
    const r = useResourcesStore()
    r.wudao = WUDAO_BUDGET
    r.spiritStone = sumUpTo(0, 2).stone
    const plan = artifactBatchPlan(DEF_ID)
    expect(plan.levels).toBe(2)
    expect(plan.atCap).toBe(false)
  })

  it('已至满重:计划为 0 重、atCap,不下手', () => {
    seat(ARTIFACT_MAX_LEVEL)
    rich()
    const plan = artifactBatchPlan(DEF_ID)
    expect(plan.levels).toBe(0)
    expect(plan.wudao).toBe(0)
    expect(plan.stone).toEqual(gn(0))
    expect(plan.atCap).toBe(true)
  })

  it('连炼按计划一次到位:等级升到计划数、扣费与计划一致、报实际重数', () => {
    seat(0)
    rich()
    const plan = artifactBatchPlan(DEF_ID)
    const n = upgradeArtifactBatch(DEF_ID)
    expect(n).toBe(plan.levels)
    expect(useInventoryStore().artifacts[0]!.level).toBe(plan.levels)
    expect(useResourcesStore().wudao).toBe(WUDAO_BUDGET - plan.wudao)
    expect(useResourcesStore().spiritStone).toEqual(sub(STONE_BUDGET(), plan.stone))
  })

  it('炼不动(满重)时:返回 0,分文不扣、等级不动', () => {
    seat(ARTIFACT_MAX_LEVEL)
    rich()
    const n = upgradeArtifactBatch(DEF_ID)
    expect(n).toBe(0)
    expect(useInventoryStore().artifacts[0]!.level).toBe(ARTIFACT_MAX_LEVEL)
    expect(useResourcesStore().wudao).toBe(WUDAO_BUDGET)
    expect(useResourcesStore().spiritStone).toEqual(STONE_BUDGET())
  })

  /** 故障注入:把 upgradeArtifact 的缺料检查改成一句「或」,本条红 */
  it('缺料判据分得清悟道点与灵石,并算出各自缺口', () => {
    seat(0)
    const cost = costOf(0)
    const r = useResourcesStore()
    r.spiritStone = STONE_BUDGET()
    r.wudao = cost.wudao - 2
    const wudaoOnly = artifactShortfall(cost)
    expect(wudaoOnly.short).toBe('wudao')
    expect(wudaoOnly.wudao).toBe(2)
    expect(wudaoOnly.stone.m).toBe(0)

    r.wudao = WUDAO_BUDGET
    r.spiritStone = sub(cost.stone, gn(1))
    const stoneOnly = artifactShortfall(cost)
    expect(stoneOnly.short).toBe('stone')
    expect(stoneOnly.wudao).toBe(0)
    expect(stoneOnly.stone.m).toBeGreaterThan(0)
  })

  /*
   * 两样都够时,缺口必须是 0/0、short 为 null。
   *
   * 变异扫描把  报成「改坏了不会红」——
   * 实际是等价变异:资源够时  那一支已经短路成 0,减法根本不执行。
   * 但这条**结果契约**要锁住,它是界面置灰与价签的共同依据。
   */
  /*
   * hasSmall 与 Math.max 两层的分工。
   *
   * 单独去掉任一层,资源充足时结果都一样(实测两处都试过)——
   * 但两层合起来才守得住「刚好够」这个边界:少一点就是 1,不多不少。
   */
  it('刚好够:缺口 0;少 1 点:缺口正好 1', () => {
    seat(0)
    const cost = costOf(0)
    const r = useResourcesStore()
    r.spiritStone = cost.stone
    r.wudao = cost.wudao
    expect(artifactShortfall(cost).wudao, '刚好够就是 0').toBe(0)
    r.wudao = cost.wudao - 1
    expect(artifactShortfall(cost).wudao, '少 1 点就是 1,不能多也不能少').toBe(1)
    expect(artifactShortfall(cost).short).toBe('wudao')
  })

  it('两样都够时:缺口为 0,short 为 null', () => {
    seat(0)
    const cost = costOf(0)
    const r = useResourcesStore()
    r.wudao = cost.wudao
    r.spiritStone = cost.stone
    const none = artifactShortfall(cost)
    expect(none.short, '都不缺就该是 null').toBeNull()
    expect(none.wudao, '额度刚好够也算够').toBe(0)
    expect(none.stone.m, '灵石缺口同理').toBe(0)
  })

  it('缺悟道点时提示只报悟道点,不再说灵石也不足', () => {
    seat(0)
    const r = useResourcesStore()
    r.wudao = 0
    r.spiritStone = STONE_BUDGET()
    expect(upgradeArtifact(DEF_ID)).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain('悟道点')
    expect(text).not.toContain('灵石')
  })

  /** 故障注入:删掉 upgradeArtifact 里 artifactShortToast 的第二参,本条红 */
  it('单炼缺料回执写出实际差额,不只说不足', () => {
    seat(0)
    const cost = costOf(0)
    const r = useResourcesStore()
    r.spiritStone = STONE_BUDGET()
    r.wudao = cost.wudao - 2
    expect(upgradeArtifact(DEF_ID)).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain(`悟道点尚差 ${cost.wudao - r.wudao}`)
    expect(text).not.toContain('悟道点不足')
  })

  it('连炼零重回执与单炼同源,写出实际差额', () => {
    seat(0)
    const cost = costOf(0)
    const r = useResourcesStore()
    r.wudao = WUDAO_BUDGET
    r.spiritStone = sub(cost.stone, gn(3))
    expect(upgradeArtifactBatch(DEF_ID)).toBe(0)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain('灵石尚差 3')
    expect(text).not.toContain('灵石不足')
  })

})
