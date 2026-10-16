/**
 * 离线装备掉落的「每场概率封顶」与在线同源 —— 行为层回归。
 *
 * 在线 afterWin 把每场装备掉落概率夹在 `Math.min(EQUIP_DROP_CHANCE_CAP, equipChance)`:
 * 长线云游(×2.4)×区域加丰(商队 1.25/妖潮 1.2)×掉落词条堆起来会越过 0.9,
 * 在线封顶、离线 settleOffline 的期望式却从不夹取 —— 同一本世同一地界,
 * 离线装备期望比在线高出一大截(HYP-015「在线离线各写一遍」家族的又一处)。
 *
 * 行为层怎么证:离线普通战的装备按**期望件数**计(equipCount = round(wins×每场概率×福缘)),
 * 超出行囊 6 件的部分折器灵尘,并在归来卷轴上留一句「另有 N 件寻常之物」。
 * 上一段代码里那句 N 就是 (equipCount − 6) —— 直接读出即得当场的期望件数。
 * 把模式拉到 prolonged(×2.4)+ 商队(×1.25)使裸概率 = 0.9,再挂「鸿运」天赋
 * (dropRate +0.1)把裸概率顶到 0.99:封顶生效则 equipCount 仍按 0.9 计;
 * 若哪天真把封顶从离线拿掉,note 里的 N 会按 0.99 算 —— 与本断言(0.9)差出近一成,必红。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useDongfuStore } from '@/stores/dongfu'
import { EXPLORE_BATTLE_INTERVAL } from '@/data/constants'

// rng 全响应固定:概率判定处处 0.5、pick 恒取首项、int/float 取左端 —— 全链路确定
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return {
    ...mod,
    rng: {
      next: () => 0.5,
      int: (a: number, _b: number) => a,
      float: (a: number, _b: number) => a,
      pick: <T,>(arr: readonly T[]): T => arr[0]!,
      weighted: <T,>(arr: readonly T[]): T => arr[0]!,
      chance: (): boolean => true
    }
  }
})

// 胜率固定 0.5:wins = round(battles×0.5),与模式难度解耦 —— 本测试只盯装备件数这一件事
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    sampleWinRate: () => 0.5
  }
})

const SESSION_HOURS = 8

/** 从归来卷轴里读回「另有 N 件寻常之物」的 N(= 期望件数 − 6) */
function overflowFromNotes(notes: string[]): number {
  const line = notes.find(n => n.includes('件寻常之物'))
  expect(line, `归来卷轴缺「另有 N 件寻常之物」一行,读不到期望件数:${notes.join(' | ')}`).toBeTruthy()
  return Number(/另有\s*(\d+)\s*件/.exec(line!)![1])
}

describe('离线装备掉落 · 每场概率吃在线那道封顶(行为层·确定性)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('裸概率越过 0.9 时,离线期望件数仍按 0.9 计(与在线 afterWin 同一封顶)', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    const dongfu = useDongfuStore()
    game.markStarted()
    const started = Date.now() - SESSION_HOURS * 3600 * 1000
    game.lastActiveAt = started
    game.totalPlaySec = 60 * 60 // 本日第 1 小时,避开跨天时序
    player.major = 2 // 筑基境,打得动一阶区域
    player.exp = { m: 0, e: 0 }
    player.addTalent('t_hongyun') // 鸿运:dropRate +0.1(裸概率 0.9 → 0.99,越过封顶)
    dongfu.setLevel('mansion', 8) // 离线封顶拉高,保证 simSec=cap 而非被 dt 掐短
    // 商队遇袭:区域加丰 ×1.25,与 mode ×2.4 相乘后裸概率恰为 0.9
    player.setRegionEvent({ regionId: 'qingyun', eventId: 'shangdui', endsAt: Date.now() + 24 * 3600 * 1000 })
    adventure.setSession({
      regionId: 'qingyun',
      mode: 'prolonged',
      startedAt: started,
      endsAt: started + 999 * 3600 * 1000,
      nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: { m: 0, e: 0 },
      expGain: { m: 0, e: 0 },
      itemGain: 0
    })

    const summary = settleOffline(Date.now())!
    expect(summary.wins).toBeGreaterThan(100) // 有足够场次,round 噪声无关紧要

    const overflow = overflowFromNotes(summary.notes)
    const equipped = overflow + 6 // 期望件数 = 超出行囊 6 件的部分 + 实际生成的 6 件
    // 与在线同源:每场概率封顶 0.9(鸿运的 +0.1 被夹掉),福缘未挂故 doubleMult=1
    expect(equipped, '离线期望件数未按 0.9 封顶(裸概率 0.99 直接乘了进去)').toBe(
      Math.round(summary.wins * 0.9)
    )
    // 钉死这不是「0.99 恰好与 0.9 同 round」的巧合:两者必须真的分得开
    expect(Math.round(summary.wins * 0.99)).not.toBe(Math.round(summary.wins * 0.9))
  })
})
