/**
 * 数据模块注释里写下的规模数字,必须与真实条目数一致。
 *
 * 这些数字是给后来者看的地图:「改前先知道有多大」。条目增删而忘了同步注释,
 * 注释就从地图变成假情报 —— 而没有任何测试会因此变红。
 *
 * 本条把七处注释里的数字逐一钉住。数字直接写在这里是有意的:
 * 它要验的正是「注释说的」与「代码里是」是否一致,两边都得是字面量。
 */
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '@/data/achievements'
import { AFFIXES } from '@/data/affixes'
import { CHAINS, CHAIN_TAG } from '@/data/chains'
import { ENEMIES } from '@/data/enemies'
import { EVENTS, FORTUNE_EVENTS } from '@/data/events'
import { GATES } from '@/data/qimen'
import { TALENTS } from '@/data/talents'
import { MANSIONS } from '@/data/xiangxiu'

describe('数据规模 · 注释数字与真实条目数一致', () => {
  it('成就库 —— 62 个', () => {
    expect(ACHIEVEMENTS.length).toBe(62)
  })

  it('随机词条池 —— 119 条', () => {
    expect(AFFIXES.length).toBe(119)
  })

  it('敌人库 —— 132 个', () => {
    expect(ENEMIES.length).toBe(132)
  })

  it('敌人库 —— 含 44 名区域首领', () => {
    const bosses = ENEMIES.filter(e => e.isBoss === true)
    expect(bosses.length, '首领数量与注释的 44 不符').toBe(44)
  })

  it('转世天赋池 —— 33 个', () => {
    expect(TALENTS.length).toBe(33)
  })

  it('奇门遁甲 —— 8 个门', () => {
    expect(GATES.length, '门的数量与注释的 8 不符').toBe(8)
  })

  it('星象 —— 28 个星宿', () => {
    expect(MANSIONS.length, '星宿数量与注释的 28 不符').toBe(28)
  })

  it('随机事件库 —— 81 个随机事件 + 11 条机缘', () => {
    expect(EVENTS.length, '随机事件总数与注释的 81 不符').toBe(81)
    expect(FORTUNE_EVENTS.length, '机缘数量与注释的 11 不符').toBe(11)
  })

  it('随机事件库 —— 81 个里含 21 个奇缘阶段(与 chains 的 21 个阶段同源)', () => {
    const chained = EVENTS.filter(e => e.tags?.includes(CHAIN_TAG))
    expect(chained.length, '带 chain 标签的事件数应为 21').toBe(21)
    // 与 CHAINS 里声明的阶段总数交叉验证:两个独立数字必须指向同一批事件
    const declared = CHAINS.reduce((n, c) => n + c.stages.length, 0)
    expect(chained.length, '标签筛出的奇缘事件数与 CHAINS 声明的阶段数不等').toBe(declared)
  })
})

describe('数据规模 · 结构自洽', () => {
  it('每类数据的 id 都不重复', () => {
    const groups: { name: string; list: { id: string }[] }[] = [
      { name: '成就', list: ACHIEVEMENTS },
      { name: '词条', list: AFFIXES },
      { name: '敌人', list: ENEMIES },
      { name: '事件', list: EVENTS },
      { name: '天赋', list: TALENTS },
      { name: '门', list: GATES }
    ]
    for (const g of groups) {
      const ids = g.list.map(x => x.id)
      expect(new Set(ids).size, `${g.name}的 id 有重复`).toBe(ids.length)
    }
  })

  it('星宿没有 id 字段,按单字名判重', () => {
    // MANSIONS 的条目用 name(单字)作身份,没有 id
    const names = MANSIONS.map(m => m.name)
    expect(new Set(names).size, '星宿的单字名有重复').toBe(names.length)
    for (const m of MANSIONS) {
      expect(m.name.length, `星宿「${m.fullName}」的单字名不是 1 个字`).toBe(1)
    }
  })

  it('机缘与随机事件的 id 不重叠(否则 eventDef 会二义)', () => {
    const ev = new Set(EVENTS.map(e => e.id))
    for (const f of FORTUNE_EVENTS) {
      expect(ev.has(f.id), `机缘 ${f.id} 与随机事件撞 id`).toBe(false)
    }
  })
})
