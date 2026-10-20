/**
 * 灵根画像在读档口落地 —— player.linggen 与 game.createProfile 都要过闸。
 *
 * 两个渲染点都是裸写:ELEMENTS[root.element].color 与 growthMult.toFixed(2)。
 * 修形判据本身在 core/linggenShape.spec.ts;这里守的是「读档真的调了它」。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
import type { ElementId } from '@/types'

describe('灵根画像 · 读档口落地', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('玩家读档时整份灵根过闸:野元素不会活到角色页', () => {
    const player = usePlayerStore()
    player.$patch({
      linggen: {
        roots: [
          { element: 'metal', aptitude: 88 },
          { element: 'bogus', aptitude: 50 }
        ],
        gradeName: '天灵根',
        growthMult: 1.6
      }
    } as never)
    player.sanitize()
    expect(player.linggen?.roots.map(r => r.element as ElementId), '野元素被清掉,真灵根原样保留').toEqual([
      'metal'
    ])
    expect(player.linggen?.growthMult.toFixed(2), '角色页的 toFixed 不该抛').toBe('1.60')
  })

  it('建号草稿同样过闸:坏草稿作废后建号页重新开牌', () => {
    const game = useGameStore()
    game.$patch({ createProfile: { roots: [{ element: 'bogus', aptitude: 50 }], gradeName: 'x', growthMult: 1 } } as never)
    game.sanitize()
    expect(game.createProfile, '坏草稿不是「一副牌」,建号页按无草稿重掷').toBeNull()
  })
})
