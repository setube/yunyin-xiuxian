/**
 * 远征路线树数据完整性守卫 —— CELESTIAL_WORLDS 每界的择路梯。
 *
 * chooseRouteNode(expedition.ts:265-267) 按 world.routes[layer][choice] 出敌,
 * 路线战敌是手写的内联 shape()。一处写坏(缺层/缺择、战敌比率归零或 NaN、
 * 两层路线奖励相同让「择路」失去意义、节点 id 重复)会静默把择路打坏,
 * 或让界面报出退化的危险度。此前 0 个测试遍历 world.routes(dataHeaderAudit
 * 只数表头与 README)。这里把每界的择路梯钉成完整二叉、战敌有限为正、择路可辨。
 *
 * 校准(真实数据,防误伤):4 界 × 3 层 × 2 择 = 24 路线节点;战敌 atkR≥0.74/
 * defR≥0.38/hpR≥0.85/speed≥0.9;技能 mult≥0.9/rate≥0.2;bonus 8..16;id 无重复。
 * 注意 TRIALS(天道试炼 qisha/yixian/wuhui 等)是独立数组,不在本守卫范围。
 */
import { describe, expect, it } from 'vitest'
import { CELESTIAL_WORLDS, EXPEDITION_ROUTE_LAYERS } from './endgame'
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
