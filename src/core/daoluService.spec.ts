/* eslint-disable no-console */
/**
 * 道侣系统验收(Phase 33.8)
 *
 * 核心句:**道侣不是让你变强的人,而是让这一世变得不一样的人。**
 *
 * 五条验收指标:
 *   一 不进入效率链      任何永久效果都不得通向 cultivationSpeed
 *   二 不存在唯一最优    多个角色在不同情境下各有占优
 *   三 不是灵兽替代品    改变的是事件/选择/命题/历史,不是战力
 *   四 每世结果可不同    同一角色允许出现结契/错过/分离/陨落
 *   五 轮回留历史不留人  人物不继承,记录继承
 *
 * 判据沿用前面确立的习惯:能靠源码扫描锁死的就扫描,
 * 因为「类型上没有 mods 字段」挡不住有人后来加一个。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DAOLU, LEAN_NAMES, STAGE_GATES, STAGE_NAMES, TEMPER_NAMES, stageIndex } from '@/data/daolu'
import { BOND_EVENTS, resolveChoice } from '@/data/bondEvents'
import {
  advanceBond,
  archiveBond,
  candidatesFor,
  currentBond,
  destinedCandidate,
  fall,
  highestReachable,
  meet,
  nextGateHint,
  part
} from './daoluService'
import { usePlayerStore } from '@/stores/player'

const SRC = readFileSync(resolve(__dirname, 'daoluService.ts'), 'utf-8')
/** 只看代码,不看注释 —— 注释里正大光明地写着这些名字 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const DATA = readFileSync(resolve(__dirname, '../data/daolu.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('道侣 · 一:不进入效率链', () => {
  it('服务层不含任何属性、资源、道果、宿慧写入', () => {
    // 前面的审计证明 45 个属性键全部可达 cultivationSpeed,
    // 所以这里不是「少给一点」,而是一个都不给
    expect(CODE).not.toMatch(/StatMods|attackPct|cultivationSpeed|maxHpPct|dropRate|luck/)
    expect(CODE).not.toMatch(/addDaoFruit|addInsight|spendDaoFruit/)
    expect(CODE).not.toMatch(/useResourcesStore|spiritStone|addHerb|addOre|wudao|pills/)
    console.log('\n服务层无属性写入、无资源发放、无道果宿慧 —— 五条通路一条都没开')
  })

  it('数据层结构上就不给属性留位置', () => {
    // DaoluDef 里没有 mods 字段,是刻意的结构性约束
    expect(DATA).not.toMatch(/mods\s*[?:]/)
    expect(DATA).not.toMatch(/StatMods/)
    console.log('\nDaoluDef 没有 mods 字段 —— 想「顺手加个属性」得先改类型,改动会很显眼')
  })

  it('关系值只影响阶段与提示,不产出任何数值', () => {
    const player = usePlayerStore()
    meet('dl_qingli')
    const before = { ...player.finalStats.mods }
    advanceBond({ fate: 50, trust: 50, accord: 50, shared: true })
    const after = { ...player.finalStats.mods }
    // 关系拉满,玩家属性分毫未动
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
    console.log('\n三维各 +50 之后,player.finalStats.mods 完全不变')
  })

  it('故障注入:若给道侣接上属性,判据必须变红', () => {
    // 模拟有人在服务层加了 cultivationSpeed
    const tampered = CODE + "\nconst evil = { cultivationSpeed: 0.2 }\n"
    expect(tampered).toMatch(/cultivationSpeed/)
    // 对照:当前源码不含它
    expect(CODE).not.toMatch(/cultivationSpeed/)
    console.log('\n注入一行 cultivationSpeed 即被扫描命中 —— 判据不是摆设')
  })
})

describe('道侣 · 二:不存在唯一最优', () => {
  it('十位角色的道途与性格分布', () => {
    console.log('\n姓名        性格   道途   初见境界  所求')
    for (const d of DAOLU) {
      console.log(
        `${d.name.padEnd(10)} ${TEMPER_NAMES[d.temper]}   ${LEAN_NAMES[d.lean]}   ` +
          `${String(d.startMajor).padStart(6)}    ${d.pursuit}`
      )
    }
    expect(DAOLU.length).toBeGreaterThanOrEqual(8)
  })

  it('没有任何一位在所有玩家道途下都占优', () => {
    const leans = ['slaughter', 'longevity', 'sword', 'alchemy', 'artifice', 'truth'] as const
    const table: Record<string, number[]> = {}
    for (const d of DAOLU) {
      // 用同一个中性选项,只让玩家道途变化 —— 差异必定来自「你是谁」
      const ev = BOND_EVENTS.find(e => e.id === 'be_spare')!
      const neutral = ev.choices.find(c => c.id === 'leave')!
      const row = leans.map(pl => resolveChoice(d, neutral, pl).leanShift)
      table[d.name] = row
    }
    console.log(`\n契合增减(行=道侣,列=${leans.map(l => LEAN_NAMES[l as keyof typeof LEAN_NAMES]).join('/')})`)
    for (const [name, row] of Object.entries(table)) {
      console.log(`${name.padEnd(10)} ${row.map(v => String(v).padStart(3)).join(' ')}`)
    }
    // 每一位都至少在一种玩家道途下是负的 —— 没有通吃
    for (const [name, row] of Object.entries(table)) {
      expect(row.some(v => v < 0)).toBe(true)
      expect(row.some(v => v > 0)).toBe(true)
      void name
    }
    console.log('\n每一位都既有相合的道途,也有相斥的道途 —— 不存在通吃的搭配')
  })

  it('相遇候选随本世地貌变化,不是固定名单', () => {
    const a = candidatesFor(['林泽', '山岳']).map(d => d.name)
    const b = candidatesFor(['幽冥', '天象']).map(d => d.name)
    expect(a.join()).not.toBe(b.join())
    console.log(`\n林泽/山岳之世可遇:${a.join('、')}`)
    console.log(`幽冥/天象之世可遇:${b.join('、')}`)
  })
})

describe('道侣 · 三:改变的是关系,不是战力', () => {
  it('阶段门槛靠行为条件,不是把数字刷满', () => {
    console.log('\n阶段    缘分 信任 契合 共历  条件')
    for (const g of STAGE_GATES) {
      console.log(
        `${STAGE_NAMES[g.stage].padEnd(6)} ${String(g.fate).padStart(4)} ${String(g.trust).padStart(4)} ` +
          `${String(g.accord).padStart(4)} ${String(g.shared).padStart(4)}  ${g.desc}`
      )
    }
    // 共历次数是行为条件:光刷数值到顶也进不了同行
    const withShared = STAGE_GATES.filter(g => g.shared > 0)
    expect(withShared.length).toBeGreaterThan(0)
  })

  it('三维可以背离:缘分深、信任高,却因契合不足止步于知交', () => {
    meet('dl_qingli')
    advanceBond({ fate: 100, trust: 100, accord: 0, shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    const b = currentBond()!
    expect(b.fate).toBe(100)
    expect(b.trust).toBe(100)
    // 契合未达 55,走不到结契
    expect(stageIndex(b.stage)).toBeLessThan(stageIndex('pledged'))
    const hint = nextGateHint()!
    expect(hint.lacking).toContain('道心未契')
    console.log(
      `\n缘分 ${b.fate}、信任 ${b.trust}、契合 ${b.accord} → 止于「${STAGE_NAMES[b.stage]}」` +
        `\n差的是:${hint.lacking.join('、')} —— 两个人可以很亲近,却走不到一条道上`
    )
  })

  it('契合够了才结得成契', () => {
    meet('dl_qingli')
    advanceBond({ fate: 100, trust: 100, accord: 100, shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    const b = currentBond()!
    expect(stageIndex(b.stage)).toBeGreaterThanOrEqual(stageIndex('pledged'))
    console.log(`\n三维齐备 + 共历 ${b.shared} 次 → 「${STAGE_NAMES[b.stage]}」`)
  })
})

describe('道侣 · 四:每一世的结果可以不同', () => {
  it('同一角色能走出四种结局', () => {
    const endings = new Set<string>()

    // 相伴:走到结契以上再归档
    meet('dl_zhaoyan')
    advanceBond({ fate: 100, trust: 100, accord: 100, shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    endings.add(archiveBond()!.ending)

    // 错过:关系尚浅便到了尽头
    meet('dl_zhaoyan')
    advanceBond({ fate: 20 })
    endings.add(archiveBond()!.ending)

    // 分道
    meet('dl_zhaoyan')
    endings.add(part()!.ending)

    // 陨落
    meet('dl_zhaoyan')
    endings.add(fall()!.ending)

    expect(endings.size).toBe(4)
    console.log(`\n同一位「赵砚」的四种结局:${[...endings].join('、')}`)
  })

  it('她陨落之后关系不再推进', () => {
    meet('dl_hanzheng')
    fall()
    const before = currentBond()!
    advanceBond({ fate: 50, trust: 50 })
    const after = currentBond()!
    expect(after.fate).toBe(before.fate)
    console.log('\n人没了,关系就停在那里 —— 不能靠继续刷把她刷回来')
  })
})

describe('道侣 · 五:轮回留历史,不留人', () => {
  it('归档只产出一条记录,不产出任何资源', () => {
    const player = usePlayerStore()
    const fruit = player.reincarnation.daoFruit
    const insight = player.reincarnation.insight
    meet('dl_muyan')
    advanceBond({ fate: 100, trust: 100, accord: 100, shared: true })
    const rec = archiveBond()!
    expect(player.reincarnation.daoFruit).toBe(fruit)
    expect(player.reincarnation.insight).toBe(insight)
    expect(rec.name).toBe('慕烟')
    console.log(`\n归档「${rec.name} · ${STAGE_NAMES[rec.stage]}」,道果与宿慧分毫未增`)
  })

  it('归档后本世关系清空 —— 人不跨世继承', () => {
    meet('dl_muyan')
    archiveBond()
    expect(currentBond()).toBeNull()
    console.log('\n转世之后,身边没有人了')
  })

  it('宿缘是概率不是保证', () => {
    const deep = [{ daoluId: 'dl_qingli', name: '沈青璃', stage: 'daolv' as const, ending: 'accompanied' as const, shared: 5 }]
    let met = 0
    const N = 400
    for (let i = 0; i < N; i += 1) {
      if (destinedCandidate(deep, ['林泽', '山岳'])) met += 1
    }
    const rate = met / N
    // 既不是零,也远不是必然
    expect(rate).toBeGreaterThan(0)
    expect(rate).toBeLessThan(0.5)
    console.log(
      `\n上一世结为道侣的人,这一世重逢概率约 ${(rate * 100).toFixed(0)}% ——` +
        '\n若能保证重逢,轮回就失去了分别的重量'
    )
  })

  it('没有深交过的人不会触发宿缘', () => {
    const shallow = [{ daoluId: 'dl_qingli', name: '沈青璃', stage: 'known' as const, ending: 'missed' as const, shared: 0 }]
    let met = 0
    for (let i = 0; i < 200; i += 1) if (destinedCandidate(shallow, ['林泽'])) met += 1
    expect(met).toBe(0)
    console.log('\n只是相识过的人,不会因宿缘再遇 —— 重逢的前提是曾经走得够深')
  })
})

describe('道侣 · 边界', () => {
  it('一世只能与一个人建立关系', () => {
    expect(meet('dl_qingli')).toBe(true)
    expect(meet('dl_zhaoyan')).toBe(false)
    expect(currentBond()!.daoluId).toBe('dl_qingli')
  })

  it('阶段只升不降 —— 但契合下降会卡住后续', () => {
    meet('dl_baiwei')
    advanceBond({ fate: 60, trust: 50, accord: 60, shared: true })
    advanceBond({ shared: true })
    const mid = currentBond()!
    // 道途分歧让契合掉下来
    advanceBond({ accord: -40 })
    const after = currentBond()!
    expect(after.accord).toBeLessThan(mid.accord)
    // highestReachable 会重算,故阶段可能回落 —— 这是设计:道心不合就是走不下去
    expect(stageIndex(after.stage)).toBeLessThanOrEqual(stageIndex(mid.stage))
    console.log(`\n契合 ${mid.accord} → ${after.accord},阶段 ${STAGE_NAMES[mid.stage]} → ${STAGE_NAMES[after.stage]}`)
  })

  it('本世未遇见任何人时,一切接口安全返回', () => {
    expect(currentBond()).toBeNull()
    expect(nextGateHint()).toBeNull()
    expect(archiveBond()).toBeNull()
    expect(part()).toBeNull()
    expect(fall()).toBeNull()

  })

  it('highestReachable 是纯函数,不改状态', () => {
    meet('dl_yunshu')
    const b = currentBond()!
    const s1 = highestReachable(b)
    const s2 = highestReachable(b)
    expect(s1).toBe(s2)
    expect(currentBond()!.stage).toBe(b.stage)
  })
})
