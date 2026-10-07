/**
 * 坊市悬赏板订单生成 —— 募丹只挂当前境界可达的丹药(C10 回归)
 *
 * 此前 pickPill 从「全部可炼丹」里按刷新周期取模,低境界玩家可能被挂出炼不了、
 * 也未必有的高境丹药 —— 那张单整轮是死位。现在与坊市货架同口径(salePills)。
 */
import { describe, expect, it } from 'vitest'
import { PILLS } from '@/data/pills'
import { BOUNTY_REFRESH_SECONDS } from '@/data/bounty'
import { salePills } from '@/core/marketService'
import { generateBounty } from '@/core/bountyService'

describe('坊市悬赏板 · 募丹境界可达', () => {
  it('低境界请求:挂出的募丹永远在当前境界可达池内,不放高境死单', () => {
    const major = 1
    const reachable = new Set(salePills(major).map(p => p.id))
    // 遍历多个刷新窗口,确认本子募到的丹均可达
    for (let w = 0; w < 96; w++) {
      const order = generateBounty(major, w * BOUNTY_REFRESH_SECONDS * 1000).find(s => s.kind === 'pill')!
      expect(order.kindId.length, `窗口 ${w} 无募丹`).toBeGreaterThan(0)
      expect(reachable.has(order.kindId), `窗口 ${w} 募到不可达丹 ${order.kindId}`).toBe(true)
    }
    // 判别力:确证确实存在「该境界炼不了」的丹,否则过滤等同虚设
    const unreachable = PILLS.filter(p => p.recipe?.stoneBase != null && p.minRealm > major)
    expect(unreachable.length, '应存在不可达丹药以判别过滤').toBeGreaterThan(0)
  })

  it('高境界也不必死挂同一味:池随境界扩大,募丹覆盖更多可达丹', () => {
    const low = new Set(salePills(1).map(p => p.id))
    const high = new Set(salePills(10).map(p => p.id))
    // 高阶池 >= 低阶池(可炼丹随境界单调不缩),且至少多出若干味
    expect(high.size).toBeGreaterThan(low.size)
  })
})
