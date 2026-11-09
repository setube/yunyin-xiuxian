/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
/** 虚界生成器裁判:每座虚界须过门 —— 有解、无近必胜、不塌缩、奖励由难度定价 */
import { describe, expect, it } from 'vitest'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { auditVoidWorld, generateApprovedWorldAsync, noveltyScore, NOVELTY_MIN } from './worldGen'
import { budgetOfRules, WORLD_BUDGET_CAP } from './ruleBudget'

describe('虚界生成器', () => {
  it('五个种子至少四个产出过审世界,成功者审计条件全部满足', { timeout: 60000 }, async () => {
    let ok = 0
    for (const seed of [11, 12, 13, 4242, 90210]) {
      const generated = await generateApprovedWorldAsync(seed)
      if (!generated) continue
      ok += 1
      const { world, audit, novelty } = generated
      expect(audit.viable, `${world.name} 可行流派不足`).toBeGreaterThanOrEqual(3)
      expect(audit.best, `${world.name} 存在近必胜`).toBeLessThanOrEqual(0.97)
      expect(audit.best, `${world.name} 无人能破`).toBeGreaterThanOrEqual(0.5)
      expect(audit.second, `${world.name} 分布塌缩`).toBeGreaterThanOrEqual(audit.best * 0.5)
      expect(novelty, `${world.name} 与既有世界过于相似`).toBeGreaterThanOrEqual(NOVELTY_MIN)
      // 奖励由实测难度定价,有界
      expect(world.rewardDaoSource).toBeGreaterThanOrEqual(55)
      expect(world.rewardDaoSource).toBeLessThanOrEqual(100)
      // 结构完整:≥2 条规则、三层二择且同层赏格不等、界主
      expect(world.ruleText.length).toBeGreaterThanOrEqual(2)
      expect(world.routes.length).toBe(3)
      for (const layer of world.routes) {
        expect(layer[0].bonus).not.toBe(layer[1].bonus)
      }
      expect(world.guardian.name.endsWith('之主')).toBe(true)
      expect(world.desc.includes('之界'), `${world.name} 缺少主题身份`).toBe(true)
      expect(budgetOfRules(world.rules), `${world.name} 规则超预算`).toBeLessThanOrEqual(WORLD_BUDGET_CAP)
      console.log(
        `  虚界「${world.name}」过审:最优 ${Math.round(audit.best * 100)}% · 可行 ${audit.viable}/6 · 新颖 ${Math.round(novelty * 100)}% · 赏 ${world.rewardDaoSource} · 淘汰 ${generated.rejected} 候选`
      )
    }
    expect(ok, '生成成功率过低').toBeGreaterThanOrEqual(4)
  })

  /**
   * 手工世界也要过同一把尺子。
   *
   * 门槛回到 3。上一轮曾降到 2,那是被 `runs=10` 的采样噪声带偏了:
   * 同样配置在 runs=200 下量出 3 个流派达标(沐泽 52% / 罡盾 51% / 连击 49%),
   * 而 10 次采样只给 2 个。`auditVoidWorld` 的默认已改为 200。
   *
   * **反震流的数值补偿仍未做** —— 它现在 30%,低于修复前的 60%。
   * 若要回调应在 `buildSim.ts` 调 `atkMult`,不要放宽这条门槛。
   */
  it('审计函数对已上线的手工世界同样给出合格判定(裁判无双标)', () => {
    const audit = auditVoidWorld(CELESTIAL_WORLDS[0]!)
    expect(audit.viable).toBeGreaterThanOrEqual(3)
    expect(audit.best).toBeGreaterThanOrEqual(0.5)
  })

  it('新颖度门:世界与自身的差异为零,克隆世界必被否决', () => {
    const chiyan = CELESTIAL_WORLDS[0]!
    const audit = auditVoidWorld(chiyan)
    const topStyles = audit.rates.slice(0, 2).map(r => r.name)
    const selfNovelty = noveltyScore(chiyan, audit, [{ world: chiyan, topStyles }])
    expect(selfNovelty).toBeLessThan(NOVELTY_MIN)
  })

/**
 * 奖励定价的可达值域。
 *
 * generateApprovedWorldAsync 里 `Math.min(100, Math.max(55, 60*(1.85-best)))` 的两层钳制
 * 在实际值域内都不生效:过审要求 best∈[0.5,0.97],而 best 是 clears/runs 的离散值
 * (runs=7 时只能取 0.571/0.714/0.857),于是 raw 落在 [57, 81]。
 *
 * 不删这两层钳制 —— 它们是防御性的,一旦 passes 的阈值放宽就会真正生效。
 * 本条把值域钉住,免得有人把阈值改宽后发现奖励悄悄被压平却无从察觉。
 */
describe('虚界奖励定价', () => {
  /** 与 generateApprovedWorldAsync 内的算式同形;这里复述是为了单独验值域 */
  function rewardOf(best: number): number {
    return Math.round(Math.min(100, Math.max(55, 60 * (1.85 - best))))
  }

  it('过审区间端点的奖励:best=0.5 → 81,best=0.97 → 55', () => {
    expect(rewardOf(0.5)).toBe(81)
    // 0.97 是 passes 的上界,此处 raw=52.8 会被 Math.max(55) 托住 —— 钳制在此确实生效
    expect(rewardOf(0.97)).toBe(55)
  })

  it('runs=7 的三个可能取值对应 77 / 68 / 60(两层钳制都不触发)', () => {
    expect(rewardOf(4 / 7)).toBe(77)
    expect(rewardOf(5 / 7)).toBe(68)
    expect(rewardOf(6 / 7)).toBe(60)
  })

  it('难度越高奖励越高(单调不增还原为 best 越小 reward 越大)', () => {
    let prev = rewardOf(0.5)
    for (const best of [0.571, 0.714, 0.857, 0.9, 0.97]) {
      const cur = rewardOf(best)
      expect(cur, `best=${best} 时奖励未随难度上升`).toBeLessThanOrEqual(prev)
      prev = cur
    }
  })

  it('奖励恒在 [55, 100] 内 —— 不会给出负道源,也不会超出上限', () => {
    for (const best of [0, 0.3, 0.5, 0.714, 0.97, 1, 2]) {
      const r = rewardOf(best)
      expect(r).toBeGreaterThanOrEqual(55)
      expect(r).toBeLessThanOrEqual(100)
    }
  })

  it('生成器产出的世界:奖励落在 55~81 且与自身 best 对得上', { timeout: 60000 }, async () => {
    const generated = await generateApprovedWorldAsync(11)
    expect(generated, '种子 11 未产出过审世界,无法验证定价').not.toBeNull()
    const { world, audit } = generated!
    expect(world.rewardDaoSource).toBe(rewardOf(audit.best))
    expect(world.rewardDaoSource).toBeGreaterThanOrEqual(55)
    expect(world.rewardDaoSource, '合法区间内的奖励不会触到 100 上限').toBeLessThanOrEqual(81)
  })
})
})
