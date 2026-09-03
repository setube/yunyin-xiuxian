/* eslint-disable no-console */
/**
 * 本世内容接管审计
 *
 * `MortalPlace.enemies / boss / eventTags` 此前是「已生成但不产生游戏效果」
 * 的悬空数据 —— 战斗仍走 REGIONS[fromId]。本轮把三处消费点
 * (在线战斗、在线事件、离线战斗)接到节点上。
 *
 * 核心约束:**REGIONS 降为静态素材库,不是第二个事实来源。**
 *
 * 四条硬验收:
 *   1 同 fromId、不同 world seed → 允许产生不同 enemy/boss/event
 *   2 同一节点重复读取 → 必须稳定,不因随机再次漂移
 *   3 非本世路线节点 → 不得越权从 REGIONS 取战斗内容
 *   4 老存档无 mortalWorld → 继续走旧 REGIONS 兼容路径
 *
 * 最要紧的一条:**不能只测「字段被读取了」,要测行为真的变了。**
 * 故末尾用故障注入 —— 把某节点的 enemies 换成显著不同的集合,
 * 若实际取到的仍是 REGIONS 的敌群,测试必须变红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { placeContent } from './mortalWorldService'
import { generateMortalWorld } from './mortalWorldGen'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { startExploration, tickExploration } from './exploration'
import { REGIONS } from '@/data/regions'

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 找一处在两个世界里都出现的地界 */
function sharedPlace(a: ReturnType<typeof generateMortalWorld>, b: ReturnType<typeof generateMortalWorld>): string | null {
  const hit = a.chain.find(p => b.chain.some(q => q.fromId === p.fromId))
  return hit?.fromId ?? null
}

describe('内容接管 · 一:同一地界在不同世界里内容不同', () => {
  it('逐世对照同一处地界', () => {
    const adventure = useAdventureStore()
    // 扫种子直到找到一处在两世里内容确实不同的地界
    let found: { id: string; a: ReturnType<typeof placeContent>; b: ReturnType<typeof placeContent> } | null = null
    for (let seed = 1; seed < 300 && !found; seed += 1) {
      const wa = generateMortalWorld(seed * 7919)
      const wb = generateMortalWorld(seed * 104729 + 13)
      const id = sharedPlace(wa, wb)
      if (!id) continue
      adventure.setMortalWorld(wa)
      const a = placeContent(id)
      adventure.setMortalWorld(wb)
      const b = placeContent(id)
      if (a.boss !== b.boss || a.enemies.join() !== b.enemies.join()) found = { id, a, b }
    }
    expect(found).not.toBeNull()
    const name = REGIONS.find(r => r.id === found!.id)?.name ?? found!.id
    console.log(`\n同一处「${name}」在两个世界里:`)
    console.log(`  世界甲  首领 ${found!.a.boss}  敌群 ${found!.a.enemies.join('、')}`)
    console.log(`  世界乙  首领 ${found!.b.boss}  敌群 ${found!.b.enemies.join('、')}`)
    console.log('\n这正是「这个世界里的落霞谷」与「地图上的落霞谷」的区别')
  })

  it('内容确实脱离了 REGIONS 的静态定义', () => {
    const adventure = useAdventureStore()
    let differs = 0
    let total = 0
    for (let seed = 1; seed < 60; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      adventure.setMortalWorld(w)
      for (const p of w.chain) {
        const r = REGIONS.find(x => x.id === p.fromId)!
        const c = placeContent(p.fromId)
        total += 1
        if (c.boss !== r.boss || c.enemies.join() !== r.enemies.join()) differs += 1
      }
    }
    const rate = differs / total
    console.log(`\n${total} 个节点里 ${differs} 个的内容与 REGIONS 静态定义不同(${(rate * 100).toFixed(0)}%)`)
    // 若接管失败,这个比例会是 0
    expect(rate).toBeGreaterThan(0.5)
  })
})

describe('内容接管 · 二:同一节点重复读取必须稳定', () => {
  it('连读十次结果一致,不因随机漂移', () => {
    const adventure = useAdventureStore()
    const w = generateMortalWorld(20260904)
    adventure.setMortalWorld(w)
    const id = w.chain[0]!.fromId
    const first = placeContent(id)
    for (let i = 0; i < 10; i += 1) {
      const again = placeContent(id)
      expect(again.boss).toBe(first.boss)
      expect(again.enemies.join()).toBe(first.enemies.join())
      expect(again.eventTags.join()).toBe(first.eventTags.join())
    }
    console.log(`\n连读十次:首领恒为 ${first.boss},敌群恒为 ${first.enemies.join('、')}`)
  })

  it('同一 seed 生成的世界内容可复现', () => {
    const a = generateMortalWorld(12345)
    const b = generateMortalWorld(12345)
    expect(a.chain.map(p => p.boss).join()).toBe(b.chain.map(p => p.boss).join())
    expect(a.chain.map(p => p.enemies.join('|')).join()).toBe(b.chain.map(p => p.enemies.join('|')).join())
    console.log('\n同 seed 世界完全可复现 —— 存档读回后内容不会变')
  })
})

describe('内容接管 · 三:路线之外不得越权取内容', () => {
  it('不在本世路线里的区域走兼容路径,并被标记', () => {
    const adventure = useAdventureStore()
    const w = generateMortalWorld(20260904)
    adventure.setMortalWorld(w)
    const offRoute = REGIONS.find(r => !w.chain.some(p => p.fromId === r.id))!
    const c = placeContent(offRoute.id)
    // fromLegacy 标出它不是本世内容 —— 调用方据此可拒绝
    expect(c.fromLegacy).toBe(true)
    const inRoute = placeContent(w.chain[0]!.fromId)
    expect(inRoute.fromLegacy).toBe(false)
    console.log(
      `\n路线内「${w.chain[0]!.name}」fromLegacy=false;` +
        `路线外「${offRoute.name}」fromLegacy=true` +
        '\n准入本身由 canEnterNode 把守(见 mortalRouteAccess.spec),此处只标来源'
    )
  })
})

describe('内容接管 · 四:老存档兼容', () => {
  it('无 mortalWorld 时退回 REGIONS,内容与静态定义一致', () => {
    const adventure = useAdventureStore()
    adventure.setMortalWorld(null)
    const r = REGIONS[0]!
    const c = placeContent(r.id)
    expect(c.fromLegacy).toBe(true)
    expect(c.boss).toBe(r.boss)
    expect(c.enemies.join()).toBe(r.enemies.join())
    expect(c.eventTags.join()).toBe(r.eventTags.join())
    console.log(`\n无本世之界时「${r.name}」内容 = REGIONS 静态定义,老存档照常历练`)
  })

  it('未知区域 id 不抛错,返回空内容', () => {
    const adventure = useAdventureStore()
    adventure.setMortalWorld(null)
    const c = placeContent('no_such_region')
    expect(c.enemies).toHaveLength(0)
    expect(c.boss).toBe('')
    expect(c.fromLegacy).toBe(true)
  })
})

describe('内容接管 · 故障注入:行为必须真的变了', () => {
  it('改掉节点 enemies,取到的敌群必须跟着变', () => {
    const adventure = useAdventureStore()
    const w = generateMortalWorld(20260904)
    const id = w.chain[0]!.fromId
    const original = REGIONS.find(r => r.id === id)!

    // 注入一个显著不同的敌群
    const injected = ['e_INJECTED_A', 'e_INJECTED_B']
    const tampered = {
      ...w,
      chain: w.chain.map((p, i) => (i === 0 ? { ...p, enemies: injected, boss: 'e_INJECTED_BOSS' } : p))
    }
    adventure.setMortalWorld(tampered)
    const c = placeContent(id)

    // 若消费点仍读 REGIONS,这两条会失败
    expect(c.enemies.join()).toBe(injected.join())
    expect(c.boss).toBe('e_INJECTED_BOSS')
    expect(c.enemies.join()).not.toBe(original.enemies.join())
    expect(c.boss).not.toBe(original.boss)
    console.log(
      `\n注入敌群 ${injected.join('、')} 后取到的正是它,而非 REGIONS 的 ${original.enemies.join('、')}` +
        '\n—— 证明读的是节点,不是静态定义'
    )
  })

  it('改掉节点 eventTags,事件标签必须跟着变', () => {
    const adventure = useAdventureStore()
    const w = generateMortalWorld(20260904)
    const id = w.chain[0]!.fromId
    const original = REGIONS.find(r => r.id === id)!
    const tampered = {
      ...w,
      chain: w.chain.map((p, i) => (i === 0 ? { ...p, eventTags: ['INJECTED_TAG'] } : p))
    }
    adventure.setMortalWorld(tampered)
    const c = placeContent(id)
    expect(c.eventTags.join()).toBe('INJECTED_TAG')
    expect(c.eventTags.join()).not.toBe(original.eventTags.join())
    console.log(`\n注入标签后取到 INJECTED_TAG,而非 REGIONS 的 ${original.eventTags.join('、')}`)
  })

  it('端到端:实际跑一次探索,遭遇的敌人必须来自节点', () => {
    // 前面几条测的是 placeContent 自己。这一条真的跑 startExploration
    // + tickExploration,从战报里读实际遭遇的敌人 id ——
    // 若 runBattle 仍读 region.enemies,这里会立刻变红
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    player.linggen = { roots: [{ element: 'fire', aptitude: 80 }], gradeName: '单灵根', growthMult: 1.6 }

    const w = generateMortalWorld(20260904)
    // 用一头真实存在、但与该地界原敌群无关的妖物填满整条路线。
    // 必须是真 id —— enemyDef 查不到时 runBattle 会直接 return,战斗根本不发生
    const marker = REGIONS.flatMap(r => r.enemies).find(e => !REGIONS.find(x => x.id === w.chain[0]!.fromId)!.enemies.includes(e))!
    adventure.setMortalWorld({ ...w, chain: w.chain.map(p => ({ ...p, enemies: [marker] })) })

    const first = w.chain[0]!
    const original = REGIONS.find(r => r.id === first.fromId)!
    expect(original.enemies).not.toContain(marker)

    expect(startExploration(first.fromId, 'normal')).toBe(true)
    // 推进到出现第一场战斗 —— 单次 tick 可能落在事件分支上,
    // 故循环推进并在每步清掉待处理事件
    for (let i = 0; i < 40 && !adventure.lastBattle; i += 1) {
      const s = adventure.session
      if (!s) break
      adventure.setPendingEvent(null, 0)
      tickExploration(s.nextBattleAt + 1)
    }

    const battle = adventure.lastBattle
    expect(battle).not.toBeNull()
    expect(battle!.enemyId).toBe(marker)
    console.log(
      `\n实跑一场:遭遇 ${battle!.enemyName}(${battle!.enemyId})` +
        `\n该地界 REGIONS 原敌群为 ${original.enemies.join('、')},其中并无此物` +
        '\n—— 战斗引擎确实吃到了节点数据,不是只在 placeContent 里改了个返回值'
    )
  })

  it('这组注入用例是接管是否真实生效的唯一保证', () => {
    // 若将来有人把消费点改回 region.enemies,上面两条会立刻变红。
    // 只断言「字段存在」或「函数被调用」都挡不住这种回退
    const adventure = useAdventureStore()
    const w = generateMortalWorld(777)
    adventure.setMortalWorld({ ...w, chain: w.chain.map(p => ({ ...p, enemies: ['e_ONLY_NODE'] })) })
    for (const p of w.chain) {
      expect(placeContent(p.fromId).enemies.join()).toBe('e_ONLY_NODE')
    }
    console.log('\n全节点注入同一敌群,逐节点读回一致 —— 没有任何一处偷偷回落到 REGIONS')
  })
})
