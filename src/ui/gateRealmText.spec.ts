import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WORLD_BREAK_MAJOR, REALMS } from '@/data/realms'
import { endgameGateRealmName } from '@/core/endgameService'

/**
 * 门槛境界名不许在模板里硬编码。
 *
 * 天界页与器魂页原先各写一句「需<span>真仙境</span>」,而解锁逻辑读的是
 * WORLD_BREAK_MAJOR —— 两处文案与一处常量靠人记着同步。
 * 将来若把门槛挪到别的境界,逻辑自动变、文案不会,玩家就会看到
 * 「需真仙境」却进不去(或反之)。
 */
describe('天界/器魂门槛文案 · 与常量同源', () => {
  it('辅助函数返回的正是 WORLD_BREAK_MAJOR 对应的境界名', () => {
    expect(endgameGateRealmName()).toBe(REALMS[WORLD_BREAK_MAJOR]?.name)
    expect(endgameGateRealmName()).not.toBe('')
  })

  it('两个视图都走辅助函数,不再硬编码境界名', () => {
    for (const rel of ['views/CelestialView.vue', 'views/SoulsView.vue']) {
      const src = readFileSync(resolve(__dirname, '../..', 'src', rel), 'utf-8')
      expect(src, `${rel} 没走 endgameGateRealmName`).toContain('endgameGateRealmName')
      expect(src, `${rel} 里还硬编码着「真仙境」`).not.toMatch(/text-cinnabar">真仙境</)
    }
  })
})
