/* eslint-disable no-console -- 奇缘推进是过程性验收,打印推进轨迹 */
/**
 * 奇遇连锁验收(Phase 34.2)
 *
 * 这五条缘在本轮之前是**宣而不实**的:earlyGame.ts 里列着五个 id、
 * player.eventChains 只写不读、转世还把它当"世界记得你的选择"继承下来 ——
 * 而 events 数据里根本没有这五个事件,玩家一次也遇不到。
 *
 * 本轮把它做实,故这里钉三件事:
 *
 *   一 数据的自洽:每一程都真实存在,链条只此一份口径(chainOfEvent);
 *   二 契约的边界:奇缘**不属于任何地界** —— 不得带区域引用的标签,
 *      也不得从区域随机池里漏出来;
 *   三 推进的因果:结一程才轮到下一程,断了缘就没有后文。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { RandomService, mulberry32 } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'
import { CHAINS, CHAIN_EVENTS, CHAIN_TAG, chainOfEvent } from '@/data/chains'
import { EVENTS, FORTUNE_EVENTS, eventDef } from '@/data/events'
import { REGIONS } from '@/data/regions'
import { MAX_MAJOR, WORLDS, WORLD_BREAK_MAJOR, worldOf } from '@/data/realms'
import {
  chainProgressRows,
  pendingChainStages,
  pickEventFor,
  regionEventPoolFor,
  resolveEventChoice
} from './eventEngine'

const REGION_TAGS = new Set(REGIONS.flatMap(r => r.eventTags))
const byId = new Map(EVENTS.map(e => [e.id, e]))

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('奇缘 · 数据自洽', () => {
  it('每条缘至少两程 —— 一程不叫连锁', () => {
    for (const c of CHAINS) expect(c.stages.length, `${c.name} 只有 ${c.stages.length} 程`).toBeGreaterThanOrEqual(2)
  })

  it('每一程都真实存在于事件库,且 id 前缀就是链 id', () => {
    for (const c of CHAINS) {
      for (const id of c.stages) {
        expect(byId.get(id), `${c.name} 的第 ${c.stages.indexOf(id) + 1} 程 ${id} 不在事件库里`).toBeDefined()
        expect(id.startsWith(`${c.id}_`), `${id} 的 id 不符合 <链 id>_<第几程> 约定`).toBe(true)
      }
    }
  })

  it('链条身份只此一份口径:chainOfEvent 能反查每一程', () => {
    for (const c of CHAINS) {
      c.stages.forEach((id, i) => {
        const got = chainOfEvent(id)
        expect(got?.chain.id).toBe(c.id)
        expect(got?.stage).toBe(i)
      })
    }
    expect(chainOfEvent('ev_jade_slip')).toBeNull()
  })

  it('奇缘不属于任何地界:阶段事件不得带区域引用的标签', () => {
    for (const ev of CHAIN_EVENTS) {
      expect(ev.tags).toEqual([CHAIN_TAG])
      const leaked = ev.tags.filter(t => REGION_TAGS.has(t))
      expect(leaked, `${ev.id} 带了区域标签 ${leaked.join('/')},奇缘会漏进随机池`).toEqual([])
    }
  })

  it('同一链条内境界门槛不回退(后一程不能比前一程更低)', () => {
    for (const c of CHAINS) {
      const realms = c.stages.map(id => byId.get(id)!.minRealm ?? 0)
      for (let i = 1; i < realms.length; i += 1) {
        expect(realms[i]!, `${c.name} 第 ${i + 1} 程的境界门槛低于前一程`).toBeGreaterThanOrEqual(realms[i - 1]!)
      }
    }
  })

  it('每一程都有默认选项 —— 离线/超时自动结算不会卡在半路', () => {
    for (const ev of CHAIN_EVENTS) {
      expect(ev.choices.some(ch => ch.isDefault), `${ev.id} 没有默认选项`).toBe(true)
    }
  })
})

describe('奇缘 · 结一程才轮到下一程', () => {
  it('未起之缘都在第一程上等着 —— 门槛已到的那些', () => {
    // 奇缘不再全起于人间:云海故碑第一程在真仙。故这里按「门槛是否已到」筛,
    // 而不是一律等于链数 —— 判据仍是「未起的缘停在第一程」,不是「全部同时可选」。
    for (const major of [0, 9, 12, 15]) {
      const pending = pendingChainStages(major)
      const ready = CHAINS.filter(c => {
        const first = eventDef(c.stages[0]!)!
        return (first.minRealm ?? 0) <= major
      })
      expect(pending.length, `境界 ${major} 该等着的缘数与门槛不符`).toBe(ready.length)
      for (const p of pending) expect(p.stage).toBe(0)
      expect(pending.every(p => (eventDef(CHAINS.find(c => c.id === p.chainId)!.stages[0]!)!.minRealm ?? 0) <= major)).toBe(true)
    }
  })

  it('每条缘都起得了头:门槛不超过最高境界,且到门槛时确实待走', () => {
    for (const c of CHAINS) {
      const first = eventDef(c.stages[0]!)!
      expect(first.minRealm ?? 0, `${c.name} 的起点门槛高过全境之极`).toBeLessThanOrEqual(MAX_MAJOR)
      const pending = pendingChainStages(first.minRealm ?? 0)
      expect(
        pending.some(p => p.chainId === c.id),
        `${c.name} 到了自己的起点门槛却还没待走 —— 这条缘永远起不了头`
      ).toBe(true)
    }
  })

  it('四个界域各有其缘 —— 高界不该只能走凡间的旧账', () => {
    // 最初五条缘的起点全在人间:真仙之上能走的只有凡间的旧账。此后陆续补了
    // 仙界(云海故碑)/神界(代天一行)/混沌海(本源一滴)。这条按界域核,
    // 而不是只看「最大值够高」—— 只补一条仙界缘也会满足后者。
    const worldsWithStart = new Set(CHAINS.map(c => worldOf(eventDef(c.stages[0]!)!.minRealm ?? 0).id))
    for (const w of WORLDS) {
      expect(worldsWithStart.has(w.id), `${w.name} 没有一条属于自己的缘`).toBe(true)
    }
    expect(Math.max(...CHAINS.map(c => eventDef(c.stages[0]!)!.minRealm ?? 0))).toBeGreaterThanOrEqual(WORLD_BREAK_MAJOR)
  })

  it('解了哪一程,那条缘才往前一程', () => {
    const first = chainOfEvent('old_man_stone_1')!
    resolveEventChoice(eventDef(first.chain.stages[0]!)!, 0, 1)
    expect(chainProgressRows().find(c => c.id === 'old_man_stone')?.stage).toBe(1)
    const pending = pendingChainStages(1)
    const mine = pending.find(p => p.chainId === 'old_man_stone')!
    expect(mine.stage).toBe(1)
    expect(mine.event.id).toBe('old_man_stone_2')
    // 别的缘不受影响,仍在第一程
    expect(pending.filter(p => p.chainId !== 'old_man_stone').every(p => p.stage === 0)).toBe(true)
  })

  it('走到尽头:不再有待走的程,录上标为已了', () => {
    const chain = CHAINS.find(c => c.id === 'sword_in_lake')!
    chain.stages.forEach(id => resolveEventChoice(eventDef(id)!, 0, 1))
    expect(chainProgressRows().find(r => r.id === 'sword_in_lake')?.stage).toBe(chain.stages.length)
    expect(pendingChainStages(9).some(p => p.chainId === 'sword_in_lake')).toBe(false)
    const row = chainProgressRows().find(r => r.id === 'sword_in_lake')!
    expect(row.finished).toBe(true)
  })

  it('断了缘就没有后文:取皮毛那一刻,灵狐这条线就尽了', () => {
    const ev = eventDef('wounded_fox_1')!
    const idx = ev.choices.findIndex(ch => ch.endsChain)
    expect(idx, '灵狐第一程应有「断缘」选项').toBeGreaterThanOrEqual(0)
    resolveEventChoice(ev, idx, 1)
    expect(chainProgressRows().find(r => r.id === 'wounded_fox')?.stage).toBe(3)
    expect(pendingChainStages(9).some(p => p.chainId === 'wounded_fox')).toBe(false)
  })
})

describe('奇缘 · 不进区域随机池,但真的会出现', () => {
  it('见闻志里奇缘与际遇各归各的名(阶段事件与普通事件同表)', () => {
    // 事件同表是引擎的需要;展示层若一律写「历练际遇」,玩家会以为那条缘
    // 也能在随便哪个地界撞见 —— 与「奇缘不属于任何地界」这条契约正好相反。
    const view = readFileSync(resolve(__dirname, '../views/CollectionView.vue'), 'utf8')
    expect(view, '见闻志应按 chainOfEvent 分出奇缘').toContain("chainOfEvent(e.id) ? '奇缘' : '历练际遇'")
  })

  it('区域事件池一个奇缘阶段都没有', () => {
    const pool = regionEventPoolFor(REGIONS[0]!)
    expect(pool.length).toBeGreaterThan(0)
    for (const ev of pool) expect(chainOfEvent(ev.id), `${ev.id} 是奇缘,不该在区域池里`).toBeNull()
  })

  it('事件判定只可能落到:区域池 / 机缘 / 奇缘三者之一', () => {
    const region = REGIONS[0]!
    const poolIds = new Set([...regionEventPoolFor(region).map(e => e.id), ...FORTUNE_EVENTS.map(e => e.id)])
    const rand = new RandomService(mulberry32(20260912))
    let chainHits = 0
    for (let i = 0; i < 200; i += 1) {
      const ev = pickEventFor(region, rand)
      if (!ev) continue
      if (chainOfEvent(ev.id)) {
        chainHits += 1
        continue
      }
      expect(poolIds.has(ev.id), `${ev.id} 既不在区域池,也不是奇缘 —— 它是从哪冒出来的?`).toBe(true)
    }
    // 接线证明:奇缘阶段确实会被掷出来(拔掉 pickChainStageEvent 的调用这里会归零)
    expect(chainHits, '200 次判定里一次奇缘都没出现,说明奇缘没接上').toBeGreaterThan(0)
    console.log(`\n200 次事件判定:奇缘阶段 ${chainHits} 次`)
  })
})

describe('奇缘连锁 · 读档修形(越界夹回/残链清掉)', () => {
  it('越界 stage 被夹回链长:sword_in_lake(2 程)的 99 → 2', () => {
    const player = usePlayerStore()
    player.eventChains = { sword_in_lake: 99 }
    player.sanitize()
    expect(player.eventChains['sword_in_lake']).toBe(2)
  })

  it('认不出的链整条清掉:未知 chainId 不入档,已知的保留', () => {
    const player = usePlayerStore()
    player.eventChains = { ghost_chain: 3, old_man_stone: 1 }
    player.sanitize()
    expect(player.eventChains).toEqual({ old_man_stone: 1 })
  })

  it('合法的中程 stage 原样保留(修形非空转)', () => {
    const player = usePlayerStore()
    player.eventChains = { old_man_stone: 1, yunzhong: 3 }
    player.sanitize()
    expect(player.eventChains).toEqual({ old_man_stone: 1, yunzhong: 3 })
  })

  it('非对象残档清零为 {}', () => {
    const player = usePlayerStore()
    player.eventChains = 'junk' as never
    player.sanitize()
    expect(player.eventChains).toEqual({})
  })

  it('越界 stage 的链在 pending 里被视为已了(不崩、不悬),修形后夹回链长', () => {
    const player = usePlayerStore()
    player.major = 1
    // 无劫时 old_man_stone(3 程)确实待走 —— 证明下案非空转
    player.eventChains = {}
    expect(pendingChainStages(1).some(p => p.chainId === 'old_man_stone')).toBe(true)
    // 劫成 99:未修形前该缘被当「已了」不再待走;修形后夹回链长(3),仍是已了
    player.eventChains = { old_man_stone: 99 }
    expect(pendingChainStages(1).some(p => p.chainId === 'old_man_stone')).toBe(false)
    player.sanitize()
    expect(player.eventChains['old_man_stone']).toBe(3)
  })
})
