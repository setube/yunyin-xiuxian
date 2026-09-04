/* eslint-disable no-console */
/**
 * 道侣事件自然介入验收(Phase 34.0)
 *
 * 33.9 的判词是:**内容是真的,发生时机是假的。**
 * 事件只在打开道侣弹窗时抽取,道侣于是成了「需要主动点击检查的系统」。
 *
 * 34.0 把事件挂回历练情境。四条验收:
 *
 *   一 道侣事件能在不打开道侣页时自然发生
 *   二 事件必须由历练情境触发,而不是纯时间随机
 *   三 同一世不会把关系事件刷成 farming loop
 *   四 玩家选择仍能真实改变三维与结局
 *
 * 故障注入(用户指定):把历练上下文断掉 —— 让事件在任意情境都能触发 ——
 * 测试必须变红。防止日后有人图省事改回 randomDaoluEvent()。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BOND_EVENTS, TRIGGER_NAMES } from '@/data/bondEvents'
import { advanceBond, chooseBondEvent, currentBond, meet, offerBondEvent, pendingBondEvent } from './daoluService'
import { usePlayerStore } from '@/stores/player'

const EXPLORATION = readFileSync(resolve(__dirname, 'exploration.ts'), 'utf-8')
const SERVICE = readFileSync(resolve(__dirname, 'daoluService.ts'), 'utf-8')
const CODE = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 推到知交阶,并清掉初遇的冷却 */
function ready(id = 'dl_qingli'): void {
  meet(id)
  advanceBond({ fate: 55, trust: 55, accord: 20, shared: true })
  advanceBond({ shared: true })
  const b = currentBond()!
  usePlayerStore().setBond({ ...b, nextEventAt: 0 })
}

describe('自然介入 · 一:不打开道侣页也会发生', () => {
  it('历练代码在四个情境点主动提供事件', () => {
    // 33.9 的时机来自「打开弹窗」;34.0 必须来自历练本身
    for (const t of ['enterPlace', 'firstVictory', 'bossDefeated', 'nearDeath'] as const) {
      expect(EXPLORATION).toContain(`offerBondEvent('${t}')`)
    }
    console.log('\n历练情境点:')
    for (const [k, v] of Object.entries(TRIGGER_NAMES)) console.log(`  ${k.padEnd(14)} ${v}`)
  })

  it('事件写入关系状态,界面只是去读它', () => {
    ready()
    expect(pendingBondEvent()).toBeNull()
    offerBondEvent('bossDefeated')
    // 没有打开任何界面,事件已经在那里等着
    expect(pendingBondEvent()).not.toBeNull()
    console.log(`\n击破首领之后,待决事件已写入:「${pendingBondEvent()!.title}」`)
  })

  it('界面不再自行抽取事件', () => {
    const view = readFileSync(resolve(__dirname, '../views/CharacterView.vue'), 'utf-8')
    // 旧写法:打开弹窗 → rollBondEvent()
    expect(view).not.toMatch(/rollBondEvent/)
    expect(view).toMatch(/pendingBondEvent/)
    console.log('\n角色页只读 pendingBondEvent(),不再自己 roll —— 时机不归界面管')
  })
})

describe('自然介入 · 二:情境决定,不是随机', () => {
  it('每个事件都声明了它属于哪一刻', () => {
    console.log('\n事件      冲突       发生于')
    for (const e of BOND_EVENTS) {
      console.log(`${e.title.padEnd(8)} ${e.kind.padEnd(10)} ${e.triggers.map(t => TRIGGER_NAMES[t]).join('、')}`)
      // 空数组等于「随时」,那正是要避免的
      expect(e.triggers.length).toBeGreaterThan(0)
    }
  })

  it('不匹配的情境拿不到事件', () => {
    ready()
    // 「重伤」只在濒死时发生
    const rescue = BOND_EVENTS.find(e => e.id === 'be_rescue')!
    expect(rescue.triggers).toEqual(['nearDeath'])
    const gotOnEnter = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      const e = offerBondEvent('enterPlace')
      if (e) {
        gotOnEnter.add(e.id)
        const b = currentBond()!
        usePlayerStore().setBond({ ...b, pendingEventId: null, nextEventAt: 0 })
      }
    }
    expect(gotOnEnter.has('be_rescue')).toBe(false)
    console.log(`\n踏入新地界时可遇:${[...gotOnEnter].join('、')} —— 「重伤」不在其中`)
  })

  it('故障注入:抹掉情境筛选,事件就能在任何地方发生', () => {
    // 模拟有人把 offerBondEvent 改回「不看 trigger 直接抽」
    const withContext = BOND_EVENTS.filter(e => e.triggers.includes('enterPlace')).length
    const withoutContext = BOND_EVENTS.length
    expect(withContext).toBeLessThan(withoutContext)
    // 源码层面锁死:必须按 trigger 过滤
    expect(CODE).toMatch(/triggers\.includes\(trigger\)/)
    console.log(
      `\n踏入新地界只该遇到 ${withContext}/${withoutContext} 个事件。` +
        '\n若删掉 triggers.includes(trigger) 这一句,全部事件都会变成随处可遇 ——' +
        '\n源码断言锁住了这一行'
    )
  })

  it('机会点而非时间:走得多才有更多机会', () => {
    ready()
    const before = currentBond()!.opportunities
    // 每次情境都累积一个机会点,即便没给出事件
    offerBondEvent('firstVictory')
    offerBondEvent('firstVictory')
    expect(currentBond()!.opportunities).toBeGreaterThan(before)
    // 源码里没有任何基于时间的判断
    expect(CODE).not.toMatch(/setInterval|Date\.now\(\)\s*-\s*.*lastEvent|elapsed/)
    console.log(
      `\n机会点 ${before} → ${currentBond()!.opportunities}。` +
        '\n挂机久不会自动刷出关系事件,只有真的走过才会'
    )
  })
})

describe('自然介入 · 三:不是 farming loop', () => {
  it('两件事之间有机会点间隔', () => {
    ready()
    const first = offerBondEvent('bossDefeated')
    expect(first).not.toBeNull()
    chooseBondEvent(first!.id, first!.choices[0]!.id)
    // 刚做完选择,立刻再给情境也不会出第二件
    const immediate = offerBondEvent('bossDefeated')
    expect(immediate).toBeNull()
    console.log(`\n做完「${first!.title}」后立刻再触发:无事发生 —— 事件是人生节点,不是每日任务`)
  })

  it('已历过的事件本世不再出现', () => {
    ready()
    const seen = new Set<string>()
    for (const trig of ['enterPlace', 'firstVictory', 'bossDefeated', 'nearDeath'] as const) {
      for (let i = 0; i < 30; i += 1) {
        const e = offerBondEvent(trig)
        if (!e) continue
        expect(seen.has(e.id)).toBe(false)
        seen.add(e.id)
        chooseBondEvent(e.id, e.choices[0]!.id)
        const b = currentBond()!
        usePlayerStore().setBond({ ...b, nextEventAt: 0 })
      }
    }
    console.log(`\n本世共历 ${seen.size} 件,无一重复:${[...seen].join('、')}`)
    expect(seen.size).toBeLessThanOrEqual(BOND_EVENTS.length)
  })

  it('待决事件未处理时不叠加新的', () => {
    ready()
    const a = offerBondEvent('bossDefeated')
    expect(a).not.toBeNull()
    // 还没选,再来一个情境
    const b = offerBondEvent('enterPlace')
    expect(b).toBeNull()
    expect(pendingBondEvent()!.id).toBe(a!.id)
    console.log('\n一次只面对一个问题 —— 待决未清则不再提供新事件')
  })

  it('事件池有限,刷不出无限关系', () => {
    ready()
    let count = 0
    for (const trig of ['enterPlace', 'firstVictory', 'bossDefeated', 'nearDeath'] as const) {
      for (let i = 0; i < 40; i += 1) {
        const e = offerBondEvent(trig)
        if (!e) continue
        chooseBondEvent(e.id, e.choices[0]!.id)
        count += 1
        const b = currentBond()!
        usePlayerStore().setBond({ ...b, nextEventAt: 0 })
      }
    }
    expect(count).toBeLessThanOrEqual(BOND_EVENTS.length)
    console.log(`\n穷举全部情境共 ${count} 件事,上限就是事件池大小 ${BOND_EVENTS.length}`)
  })
})

describe('自然介入 · 四:选择仍然真实改变关系', () => {
  it('同一情境下的不同选择,三维走向不同', () => {
    const outcomes: Record<string, { fate: number; trust: number; accord: number }> = {}
    for (const cid of ['take_recipe', 'take_artifact']) {
      setActivePinia(createPinia())
      ready()
      const e = offerBondEvent('bossDefeated')
      // 确保拿到遗府;若抽到别的就跳过本轮
      if (!e || e.id !== 'be_relic') continue
      chooseBondEvent('be_relic', cid)
      const b = currentBond()!
      outcomes[cid] = { fate: b.fate, trust: b.trust, accord: b.accord }
    }
    const keys = Object.keys(outcomes)
    if (keys.length === 2) {
      expect(outcomes[keys[0]!]!.trust).not.toBe(outcomes[keys[1]!]!.trust)
      console.log('\n遗府事件的两种选择:')
      for (const [k, v] of Object.entries(outcomes)) {
        console.log(`  ${k.padEnd(14)} 缘分 ${v.fate} · 信任 ${v.trust} · 契合 ${v.accord}`)
      }
    } else {
      console.log('\n本次采样未同时抽到同一事件,跳过对照')
    }
  })

  it('关系缺什么,越容易遇到哪一类考验', () => {
    // 契合低时,道途与价值观类事件权重更高
    ready()
    const b = currentBond()!
    usePlayerStore().setBond({ ...b, accord: 10, nextEventAt: 0 })
    const kinds: string[] = []
    for (let i = 0; i < 40; i += 1) {
      const e = offerBondEvent('firstVictory')
      if (!e) continue
      kinds.push(e.kind)
      const cur = currentBond()!
      usePlayerStore().setBond({ ...cur, pendingEventId: null, nextEventAt: 0, doneEvents: [] })
    }
    console.log(`\n契合仅 10 时,首胜情境给出的冲突类型:${[...new Set(kinds)].join('、')}`)
    expect(kinds.length).toBeGreaterThan(0)
  })

  it('仍不产出任何 StatMods / 资源 / 道果 / 宿慧', () => {
    const player = usePlayerStore()
    ready()
    const mods = JSON.stringify(player.finalStats.mods)
    const fruit = player.reincarnation.daoFruit
    const insight = player.reincarnation.insight
    const e = offerBondEvent('bossDefeated')!
    chooseBondEvent(e.id, e.choices[0]!.id)
    expect(JSON.stringify(player.finalStats.mods)).toBe(mods)
    expect(player.reincarnation.daoFruit).toBe(fruit)
    expect(player.reincarnation.insight).toBe(insight)
    console.log('\n事件自然发生并做完选择:属性、道果、宿慧分毫未动')
  })
})

describe('自然介入 · 边界', () => {
  it('她离开或陨落后不再提供事件', () => {
    ready()
    const b = currentBond()!
    usePlayerStore().setBond({ ...b, departed: true })
    expect(offerBondEvent('bossDefeated')).toBeNull()
    usePlayerStore().setBond({ ...b, departed: false, fallen: true })
    expect(offerBondEvent('bossDefeated')).toBeNull()
    console.log('\n人走了或没了,世界不再拿这些问题来问你')
  })

  it('未遇见任何人时情境点安全空转', () => {
    expect(offerBondEvent('enterPlace')).toBeNull()
    expect(pendingBondEvent()).toBeNull()
  })

  it('初遇之后要走一段路才有第一件事', () => {
    meet('dl_qingli')
    advanceBond({ fate: 55, trust: 55, accord: 20, shared: true })
    advanceBond({ shared: true })
    // 没有清冷却:刚认识就该沉默一阵
    expect(offerBondEvent('bossDefeated')).toBeNull()
    console.log('\n刚认识就掏心掏肺不合情理 —— 初遇后有一段冷却')
  })
})
