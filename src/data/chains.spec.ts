/**
 * 奇缘的结构与隔离约定。
 *
 * chains.ts 的模块注释给出两个可验证的事实:「8 条缘 · 21 个阶段事件」,
 * 以及「链条身份只此一处:一律问 chainOfEvent,不在别处再写一份 id 前缀清单」。
 * 前者是具体数量,写错了注释就成了假文档;后者是被 eventEngine / eventTier /
 * contentGateAudit 三处依赖的约定,破了会让奇缘漏进随机池或从池里消失。
 *
 * CHAIN_TAG 的注释还写着「任何区域不得引用,否则奇缘漏进随机池」——
 * 这条由 regionEventPoolFor 保证,本条只钉数据侧:阶段事件都带 chain 标签。
 */
import { describe, expect, it } from 'vitest'
import { CHAINS, CHAIN_TAG, chainOfEvent } from '@/data/chains'
import { EVENTS, eventDef } from '@/data/events'

describe('奇缘 · 规模与注释一致', () => {
  it('8 条缘、21 个阶段事件 —— 模块注释写的就是真实数量', () => {
    expect(CHAINS.length, '缘的条数与注释「8 条缘」不符').toBe(8)
    const stages = CHAINS.reduce((n, c) => n + c.stages.length, 0)
    expect(stages, '阶段事件总数与注释「21 个阶段事件」不符').toBe(21)
  })
})

describe('奇缘 · 阶段事件都是真实存在的条目', () => {
  it('每个 stage id 都能在 EVENTS 里找到', () => {
    for (const chain of CHAINS) {
      for (const id of chain.stages) {
        expect(eventDef(id), `「${chain.name}」引用了不存在的事件 ${id}`).toBeDefined()
      }
    }
  })

  it('阶段事件都带 chain 标签(否则会漏进区域随机池)', () => {
    for (const chain of CHAINS) {
      for (const id of chain.stages) {
        const ev = eventDef(id)
        expect(ev?.tags, `${id} 没有 tags`).toContain(CHAIN_TAG)
      }
    }
  })

  it('同一事件不被两条缘共用(共用会让 chainOfEvent 只认先命中的那条)', () => {
    const seen = new Map<string, string>()
    for (const chain of CHAINS) {
      for (const id of chain.stages) {
        const prev = seen.get(id)
        expect(prev, `${id} 同时属于「${prev}」与「${chain.name}」`).toBeUndefined()
        seen.set(id, chain.name)
      }
    }
  })

  it('单条缘内阶段不重复(重复会让阶段推进卡住)', () => {
    for (const chain of CHAINS) {
      expect(new Set(chain.stages).size, `「${chain.name}」的阶段有重复`).toBe(chain.stages.length)
    }
  })
})

describe('奇缘 · chainOfEvent 与数据自洽', () => {
  it('每条缘的每个阶段都能被认回自己,且序号正确', () => {
    for (const chain of CHAINS) {
      chain.stages.forEach((id, idx) => {
        const hit = chainOfEvent(id)
        expect(hit, `${id} 认不回来`).not.toBeNull()
        expect(hit!.chain.id, `${id} 认成了别的缘`).toBe(chain.id)
        expect(hit!.stage, `${id} 的序号应为 ${idx}`).toBe(idx)
      })
    }
  })

  it('非奇缘事件一律认回 null(不在别处另写前缀清单的前提)', () => {
    const chainIds = new Set(CHAINS.flatMap(c => c.stages))
    let checked = 0
    for (const ev of EVENTS) {
      if (chainIds.has(ev.id)) continue
      expect(chainOfEvent(ev.id), `普通事件 ${ev.id} 被误认成奇缘阶段`).toBeNull()
      checked += 1
    }
    expect(checked, '没有被排除的普通事件,用例空转').toBeGreaterThan(0)
  })

  it('不存在的 id 返回 null,不抛错', () => {
    expect(chainOfEvent('__nope__')).toBeNull()
    expect(chainOfEvent('')).toBeNull()
  })
})

describe('奇缘 · 结构不变式', () => {
  it('id 与 name 都不重复', () => {
    const ids = CHAINS.map(c => c.id)
    const names = CHAINS.map(c => c.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每条缘都有名字、提示与至少一个阶段', () => {
    for (const c of CHAINS) {
      expect(c.name.length, `${c.id} 没名字`).toBeGreaterThan(0)
      expect(c.hint.length, `${c.id} 没写「为何未了」`).toBeGreaterThan(0)
      expect(c.stages.length, `${c.id} 没有阶段`).toBeGreaterThan(0)
    }
  })
})
