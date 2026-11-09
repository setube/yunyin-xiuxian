/** 世界遗产叙事:宿敌残魂 + 区域凭吊(纯叙事,不改奖励/属性/战斗规则) */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ghostOf, ghostTitle, ghostLeadIn, ECHO_GHOST_CHANCE, recordLoss } from './worldMemory'
import { memorialLine, MEMORIAL_CHANCE } from './suppress'
import { usePlayerStore } from '@/stores/player'
import type { NemesisRecord } from '@/types'

describe('宿敌残魂(ghost)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('只有已雪耻的宿敌才有残魂形态', () => {
    let list: NemesisRecord[] = []
    for (let i = 0; i < 3; i++) list = recordLoss(list, 'e_wolfking', '独角妖狼', 'qingyun', Date.now()).list
    expect(ghostOf(list, 'e_wolfking')).toBeNull()
  })

  it('雪耻后宿敌可化残魂,前缀与引导语完整', () => {
    let list: NemesisRecord[] = []
    for (let i = 0; i < 3; i++) list = recordLoss(list, 'e_wolfking', '独角妖狼', 'qingyun', Date.now()).list
    const avenged = list.map(n => ({ ...n, avengedAt: Date.now() }))
    const ghost = ghostOf(avenged, 'e_wolfking')
    expect(ghost).not.toBeNull()
    expect(ghostTitle(ghost!)).toBe('残魂·独角妖狼')
    expect(ghostLeadIn(ghost!)).toContain('3败于此')
  })

  it('残魂概率稀有(3%),非宿敌敌不出残魂', () => {
    expect(ECHO_GHOST_CHANCE).toBe(0.03)
    const list: NemesisRecord[] = []
    expect(ghostOf(list, 'e_wolf')).toBeNull()
  })
})

describe('区域凭吊(memorial)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('被镇压过的区域出现凭吊叙事,含"石碑/道号"意象', () => {
    const player = usePlayerStore()
    player.suppressRegion('qingyun')
    const line = memorialLine('qingyun', player)
    expect(line).not.toBeNull()
    expect(line!).toContain('石碑')
    expect(line!).toContain('道号')
  })

  it('未镇压区域无凭吊', () => {
    const player = usePlayerStore()
    expect(memorialLine('luoxia', player)).toBeNull()
  })

  /*
   * 镇压记录里有、区域本身却查不到:安静返回 null,不抛、也不印半句话。
   *
   * 这一支只有**坏档**才走得到 —— `suppressedSince` 是玩家可写的存档字段,
   * 区域表改版删掉某个 id 之后,老档里就会留下这种悬空键。
   * 少了守卫,`region.name` 会在下一行抛 TypeError,而这句叙事是历练途中按
   * MEMORIAL_CHANCE 抽的,玩家会看到历练整个中断。
   */
  it('镇压记录悬空(区域已不存在)时安静返回 null', () => {
    const player = usePlayerStore()
    // 绕过 suppressRegion 的合法性检查,直接塞一个悬空键
    player.$patch({ suppressedSince: { no_such_region: Date.now() - 7_200_000 } })
    expect(() => memorialLine('no_such_region', player), '不该抛').not.toThrow()
    expect(memorialLine('no_such_region', player), '查不到区域就返回 null').toBeNull()
  })

  it('凭吊概率低(4%)', () => {
    expect(MEMORIAL_CHANCE).toBe(0.04)
  })

  it('凭吊年数跟寿元同一把尺:现实 1 小时 = 1 岁', () => {
    const player = usePlayerStore()
    const t0 = 1_700_000_000_000
    player.suppressRegion('qingyun')
    player.suppressedSince = { qingyun: t0 - 10 * 3_600_000 }
    expect(memorialLine('qingyun', player, t0), '镇压十小时应对上寿元十岁').toContain('已逾10载')
  })

  it('刚镇压不足一小时也至少说一载', () => {
    const player = usePlayerStore()
    const t0 = 1_700_000_000_000
    player.suppressRegion('qingyun')
    player.suppressedSince = { qingyun: t0 - 60_000 }
    expect(memorialLine('qingyun', player, t0)).toContain('已逾1载')
  })
})
