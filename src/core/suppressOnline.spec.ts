/* eslint-disable no-console */
import { describe, expect, it, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { settleSuppressedRegions } from './suppress'

describe('玩家反馈: 镇压后在线产出(真实场景)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('真实场景: 玩家镇压多个不同层级区域, 在线产出总量', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()

    // tier1 青云、tier10 剑冢、tier20 鸿蒙
    player.suppressedRegions = ['qingyun', 'jianzhong', 'hongmeng']

    const before = { ...resources.spiritStone }
    settleSuppressedRegions(3600) // 在线 1 小时

    const gained = resources.spiritStone.m * Math.pow(10, resources.spiritStone.e) - (before.m * Math.pow(10, before.e))
    console.log(`\n镇压 3 区域(不同层级)在线 1 小时:`)
    console.log(`  灵石: +${gained.toFixed(2)}`)

    const byTier = player.suppressedRegions.map(r => [r, r === 'qingyun' ? 'T1' : r === 'jianzhong' ? 'T10' : 'T20'])
    console.log(`  区域: ${JSON.stringify(byTier)}`)

    expect(gained).toBeGreaterThan(0)
  })

  it('真实场景: 镇压后在线 10 分钟的最小产出', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.suppressedRegions = ['qingyun']

    const before = { ...resources.spiritStone }
    settleSuppressedRegions(600) // 在线 10 分钟

    const gained = resources.spiritStone.m * Math.pow(10, resources.spiritStone.e) - (before.m * Math.pow(10, before.e))
    console.log(`\n镇压 1 区域在线 10 分钟: 灵石 +${gained.toFixed(2)}`)
    expect(gained).toBeGreaterThan(0)
  })

  /**
   * 原先这条只有 console.log、没有 expect —— 名字叫「验证」却是空跑:
   * 灵脉真把产出改了或者压根没接,它都绿。
   *
   * 实测结论是**不影响**:`settleSuppressedRegions` 不读 veinPoints,
   * 灵脉只进洞府产出(`veinService`)。这里把这个事实钉住 ——
   * 哪天镇压产出接上了灵脉,这条会红,提醒去补对应的数值判据。
   */
  it('灵脉投资不影响镇压产出(它只进洞府产出,不进镇压)', () => {
    const measure = (veinGather: number): number => {
      setActivePinia(createPinia())
      const player = usePlayerStore()
      const resources = useResourcesStore()
      player.suppressedRegions = ['qingyun']
      if (veinGather > 0) {
        useDongfuStore().veinPoints = { gather: veinGather, craft: 0, alchemy: 0, insight: 0 }
      }
      const before = resources.spiritStone.m * Math.pow(10, resources.spiritStone.e)
      settleSuppressedRegions(3600)
      return resources.spiritStone.m * Math.pow(10, resources.spiritStone.e) - before
    }

    const plain = measure(0)
    const withVein = measure(30)
    expect(plain, '镇压本该有产出,否则这条判据没有意义').toBeGreaterThan(0)
    expect(withVein, '灵脉接进了镇压产出 —— 若是有意为之,请补数值判据而不是让这条红着').toBeCloseTo(plain, 6)
  })
})
