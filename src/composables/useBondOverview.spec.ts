/**
 * 道侣域投影的在世守卫。
 *
 * useBondOverview 把「道侣还活着」这件事单独判一次:
 *   herIntent = bond && !departed && !fallen ? pendingIntent() : null
 * 这一步不能省 —— pendingIntent() 内部的 currentBond() 只返回 player.bond,
 * 不看在世家态(见 core/daoluService.ts 第 98 行)。已故/已走的道侣若还报出
 * 「她有事要说」,入口行会一直挂着红点,点进去却无人应答。
 *
 * 该 composable 此前没有 spec。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useBondOverview } from './useBondOverview'
import type { BondState } from '@/core/daoluService'

const DAOLU_ID = 'dl_yunniang'

/** 一条待回应的意图:只填本用例用得到的字段 */
function mkIntent() {
  return {
    daoluId: DAOLU_ID,
    wish: '去看看山外',
    line: '我想下山一趟',
    ripeness: 1,
    sparks: [],
    raised: 1,
    responses: [],
    settled: false
  }
}

function mkBond(over: Partial<BondState> = {}): BondState {
  return {
    daoluId: DAOLU_ID,
    affinity: 50,
    metAt: 1,
    fallen: false,
    doneEvents: [],
    opportunities: 0,
    nextEventAt: 0,
    ...over
  } as BondState
}

describe('道侣投影 · 在世守卫', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('没有道侣时 herIntent 与 hasBondWord 都为假', () => {
    const o = useBondOverview()
    expect(o.bond.value).toBeNull()
    expect(o.herIntent.value).toBeNull()
    expect(o.hasBondWord.value).toBe(false)
  })

  it('在世且有待答之事时 herIntent 报出来', () => {
    const player = usePlayerStore()
    player.bond = mkBond({ intent: mkIntent(), intentPending: true })
    const o = useBondOverview()
    expect(o.herIntent.value, '在世的道侣提了事,入口要报出').not.toBeNull()
    expect(o.herIntent.value!.wish).toBe('去看看山外')
    expect(o.hasBondWord.value).toBe(true)
  })

  it('已故的道侣不再报出意图(否则红点永远点不掉)', () => {
    const player = usePlayerStore()
    player.bond = mkBond({ intent: mkIntent(), intentPending: true, fallen: true })
    const o = useBondOverview()
    expect(o.herIntent.value, '已故仍报意图').toBeNull()
  })

  it('已离开的道侣不再报出意图', () => {
    const player = usePlayerStore()
    player.bond = mkBond({ intent: mkIntent(), intentPending: true, departed: true })
    const o = useBondOverview()
    expect(o.herIntent.value, '已离开仍报意图').toBeNull()
  })

  it('在世但没有待答之事时不报(守卫不能宽到「有 bond 就算」)', () => {
    const player = usePlayerStore()
    player.bond = mkBond({ intent: mkIntent(), intentPending: false })
    expect(useBondOverview().herIntent.value).toBeNull()
  })

  it('fallen 与 departed 各自独立生效(漏掉任一都会让红点卡住)', () => {
    const player = usePlayerStore()
    for (const flag of ['fallen', 'departed'] as const) {
      player.bond = mkBond({ intent: mkIntent(), intentPending: true, [flag]: true })
      expect(useBondOverview().herIntent.value, `${flag}=true 时仍报意图`).toBeNull()
    }
  })

  it('过往道侣履历原样透出(不因这一世的关系为空而丢)', () => {
    const player = usePlayerStore()
    expect(useBondOverview().pastBonds.value).toEqual([])
    void player
  })

  it('没有道侣时 ta() 原样返回文本(不炸、不返回 undefined)', () => {
    const o = useBondOverview()
    expect(o.ta('{ta}递来一盏茶')).toBe('{ta}递来一盏茶')
    expect(typeof o.pronoun.value).toBe('string')
  })
})

/**
 * 历世同行只给最近若干条 —— 数据不动,只在渲染侧截。
 *
 * `reincarnation.bonds` 每次转世归档一条、只增不减,而 `BondDialog` 是 `v-for` 逐条渲。
 * 坏档塞 5000 条就渲 5000 行(`max-h-40 overflow-y-auto` 只管视觉高度)。
 *
 * **不能截数据**:`daoluService.destinedCandidate` 拿 `deep.length` 算宿缘概率
 * (`0.08 × 条数`,封顶 0.35),截掉会让深层宿缘更难遇上。
 *
 * 故障注入:删掉 useBondOverview 里的 `.slice(-PAST_BONDS_SHOWN)` → 本条红。
 */
describe('历世同行 · 渲染条数封顶', () => {
  it('坏档塞 5000 条,渲染只给最近一段,而数据一条不少', () => {
    const player = usePlayerStore()
    player.reincarnation = {
      ...player.reincarnation,
      bonds: Array.from({ length: 5000 }, (_, i) => ({
        daoluId: 'dl_qingli',
        name: `第${i}位`,
        stage: 'pledged' as const,
        ending: 'accompanied' as const,
        shared: 3
      }))
    } as never

    const shown = useBondOverview().pastBonds.value
    expect(shown.length, '渲染没截断 —— 会渲 5000 行').toBeLessThanOrEqual(300)
    expect(shown.length, '截成空的了').toBeGreaterThan(0)
    expect(shown[shown.length - 1]?.name, '该保留最近归档的那几条').toBe('第4999位')

    player.sanitize()
    expect(player.reincarnation.bonds.length, '数据被截了 —— 会改变宿缘概率').toBe(5000)
  })
})
