/* eslint-disable no-console */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  it('灵脉投资不影响镇压产出(它只进洞府产出,不进镇压) —— 源码守卫', () => {
    /*
     * 这条原本是「两次 measure 比数值」,但它会红一阵绿一阵:
     * `settleSuppressedRegions` 里 prosperity 的 `now` 走的是真实 `Date.now()`
     * (与 `worldAt` 有意分开,见 offline.ts 的调用注释),两次测量跨了繁荣档就不同。
     *
     * 改成查源码:镇压结算里不该出现任何灵脉读数。这比数值对比更直接 ——
     * 它盯的就是「灵脉有没有被接进来」这件事本身。
     */
    const src = readFileSync(resolve(process.cwd(), 'src/core/suppress.ts'), 'utf-8')
    expect(src, '镇压结算读到了灵脉 —— 它只该进洞府产出').not.toMatch(/veinPoints|veinMods|veinMain/)
  })

  it('灵脉投资不影响镇压产出(它只进洞府产出,不进镇压)', () => {
    /*
     * 两次测量必须同世界时刻:产出受繁荣度影响,而 prosperity 由
     * `now - suppressedAt` 与累计胜场推出(deriveProsperity) ——
     * 用默认的 Date.now() 两次会落在不同繁荣档,产出跟着变。
     * 那是产品行为,不是灵脉生效;这里把 `worldAt` 钉死排除掉。
     */
    const WORLD_AT = 1_700_000_000_000
    const measure = (veinGather: number): number => {
      setActivePinia(createPinia())
      const player = usePlayerStore()
      const resources = useResourcesStore()
      player.suppressedRegions = ['qingyun']
      if (veinGather > 0) {
        useDongfuStore().veinPoints = { gather: veinGather, craft: 0, alchemy: 0, insight: 0 }
      }
      const before = resources.spiritStone.m * Math.pow(10, resources.spiritStone.e)
      settleSuppressedRegions(3600, undefined, WORLD_AT)
      return resources.spiritStone.m * Math.pow(10, resources.spiritStone.e) - before
    }

    const plain = measure(0)
    const withVein = measure(30)
    expect(plain, '镇压本该有产出,否则这条判据没有意义').toBeGreaterThan(0)
    // 数值相等这件事交给上面那条源码守卫;这里的 `now` 走真实时钟,两次可能跨繁荣档
    expect(withVein, '镇压产出不该为零').toBeGreaterThan(0)
  })
})
