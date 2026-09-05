/* eslint-disable no-console -- 模拟器体检报告的正式输出(bun run test:report 依赖) */
/**
 * 程序化世界生成器裁判(Phase 23)
 * 生成的每一座虚界都必须过 P20/P22 的门:有解、无近必胜、不塌缩、奖励由难度定价
 */
import { describe, expect, it } from 'vitest'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { auditVoidWorld, generateApprovedWorld, noveltyScore, NOVELTY_MIN } from './worldGen'
import { budgetOfRules, WORLD_BUDGET_CAP } from './ruleBudget'

describe('虚界生成器', () => {
  it('五个种子至少四个产出过审世界,成功者审计条件全部满足', { timeout: 30000 }, () => {
    let ok = 0
    for (const seed of [11, 12, 13, 4242, 90210]) {
      const generated = generateApprovedWorld(seed)
      if (!generated) continue
      ok += 1
      const { world, audit, novelty } = generated
      // 裁判条件复验
      expect(audit.viable, `${world.name} 可行流派不足`).toBeGreaterThanOrEqual(3)
      expect(audit.best, `${world.name} 存在近必胜`).toBeLessThanOrEqual(0.97)
      expect(audit.best, `${world.name} 无人能破`).toBeGreaterThanOrEqual(0.5)
      expect(audit.second, `${world.name} 分布塌缩`).toBeGreaterThanOrEqual(audit.best * 0.5)
      // 新颖度门:不许随机换皮
      expect(novelty, `${world.name} 与既有世界过于相似`).toBeGreaterThanOrEqual(NOVELTY_MIN)
      // 奖励由实测难度定价,天然有界
      expect(world.rewardDaoSource).toBeGreaterThanOrEqual(55)
      expect(world.rewardDaoSource).toBeLessThanOrEqual(100)
      // 结构完整:≥2 条规则、双敌池、三层二择且同层赏格不等、界主
      expect(world.ruleText.length).toBeGreaterThanOrEqual(2)
      expect(world.routes.length).toBe(3)
      for (const layer of world.routes) {
        expect(layer[0].bonus).not.toBe(layer[1].bonus)
      }
      expect(world.guardian.name.endsWith('之主')).toBe(true)
      // 语义完整性(P25):有主题身份,规则预算同账
      expect(world.desc.includes('之界'), `${world.name} 缺少主题身份`).toBe(true)
      expect(budgetOfRules(world.rules), `${world.name} 规则超预算`).toBeLessThanOrEqual(WORLD_BUDGET_CAP)
      console.log(
        `  虚界「${world.name}」过审:最优 ${Math.round(audit.best * 100)}% · 可行 ${audit.viable}/6 · 新颖 ${Math.round(novelty * 100)}% · 赏 ${world.rewardDaoSource} · 淘汰 ${generated.rejected} 候选`
      )
    }
    expect(ok, '生成成功率过低').toBeGreaterThanOrEqual(4)
  })

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
})
