/**
 * 远征路线树数据完整性:CELESTIAL_WORLDS 每界择路梯须完整二叉、战敌比率有限为正、每层两择 bonus 不同、节点 id 不重复。
 * chooseRouteNode(expedition.ts)按 world.routes[layer][choice] 出敌;写坏时择路静默失效、界面危险度退化。
 * TRIALS 是独立数组,不在本守卫范围
 */
import { describe, expect, it } from 'vitest'
import { CELESTIAL_WORLDS, EXPEDITION_ROUTE_LAYERS, TRIAL_FOES } from './endgame'
import type { WorldRouteNode } from '@/types'

function routeNodes(world: (typeof CELESTIAL_WORLDS)[number]): WorldRouteNode[] {
  return world.routes.flat()
}

describe('远征路线树 · CELESTIAL_WORLDS 择路梯数据完整性', () => {
  it('每一界都有完整的择路梯:3 层,每层恰 2 择(choice 0|1)', () => {
    for (const world of CELESTIAL_WORLDS) {
      expect(world.routes.length, `${world.id} 层数`).toBe(EXPEDITION_ROUTE_LAYERS)
      for (let layer = 0; layer < world.routes.length; layer += 1) {
        expect(world.routes[layer]!.length, `${world.id} 第 ${layer} 层择数`).toBe(2)
      }
    }
  })

  /*
   * 每个敌人都至少带一个技艺。
   *
   * core/worldGen 的 shapeRisk 用 `const sk = s.skills[0]; if (!sk) return '寻常之敌'` 兜底 ——
   * 而它读的正是 SHAPE_POOL(= CELESTIAL_WORLDS 各界的 foes + TRIAL_FOES)。这条兜底当前不可达
   * (实测 10 个敌人里 0 个 skills 为空);变异扫描把它改坏也不会红,因为没有判据盯着这个数据前提。
   *
   * 把它钉住:将来有人加一个无技能敌人,注释里写的「不可达」就当场失效,而不是让危险度
   * 静默退化成「寻常之敌」—— 那是一条看得见但看不出错的读数。
   */
  it('每个敌人都至少带一个技艺(shapeRisk 的 `!sk` 兜底靠这条前提)', () => {
    const all = [...CELESTIAL_WORLDS.flatMap(w => w.foes), ...TRIAL_FOES]
    expect(all.length, '一个敌人都没扫到 —— 判据空转').toBeGreaterThan(0)
    const empty = all.filter(f => !Array.isArray(f.skills) || f.skills.length === 0).map(f => f.name)
    expect(empty, '这些敌人没有技艺,shapeRisk 会退化成「寻常之敌」').toEqual([])
  })

  it('每一路线战敌的比率字段有限为正(无归零/NaN 的退化战斗)', () => {
    for (const world of CELESTIAL_WORLDS) {
      for (const route of routeNodes(world)) {
        const f = route.foe
        expect(Number.isFinite(f.atkR) && f.atkR > 0, `${world.id}/${route.id} atkR`).toBe(true)
        expect(Number.isFinite(f.defR) && f.defR > 0, `${world.id}/${route.id} defR`).toBe(true)
        expect(Number.isFinite(f.hpR) && f.hpR > 0, `${world.id}/${route.id} hpR`).toBe(true)
        expect(Number.isFinite(f.speed) && f.speed > 0, `${world.id}/${route.id} speed`).toBe(true)
        for (const s of f.skills) {
          expect(Number.isFinite(s.mult) && s.mult > 0, `${world.id}/${route.id} ${s.name} mult`).toBe(true)
          expect(Number.isFinite(s.rate) && s.rate > 0, `${world.id}/${route.id} ${s.name} rate`).toBe(true)
        }
      }
    }
  })

  it('每层两择的奖励必须不同且非负(选路确实有差别,不白选)', () => {
    for (const world of CELESTIAL_WORLDS) {
      for (const layer of world.routes) {
        const [a, b] = layer
        expect(a!.bonus, `${world.id}/${a!.id} bonus`).toBeGreaterThanOrEqual(0)
        expect(b!.bonus, `${world.id}/${b!.id} bonus`).toBeGreaterThanOrEqual(0)
        expect(a!.bonus, `${world.id} 第层两择 bonus 重复`).not.toBe(b!.bonus)
      }
    }
  })

  it('界内路线节点 id 唯一(不重复、不撞名字)', () => {
    for (const world of CELESTIAL_WORLDS) {
      const ids = routeNodes(world).map(n => n.id)
      expect(new Set(ids).size, `${world.id} 路线节点 id 去重数`).toBe(ids.length)
    }
  })
})
