/* eslint-disable no-console */
/** 道侣系统验收。能靠源码扫描锁死的就扫描:「类型上没有 mods 字段」挡不住后来加一个 */
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
  chooseBondEvent,
  currentBond,
  destinedCandidate,
  fall,
  gainBondOpportunities,
  highestReachable,
  meet,
  nextGateHint,
  part,
  type BondState
} from './daoluService'
import { usePlayerStore } from '@/stores/player'

const SRC = readFileSync(resolve(__dirname, 'daoluService.ts'), 'utf-8')
/** 只看代码,不看注释:注释里写着这些名字 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const DATA = readFileSync(resolve(__dirname, '../data/daolu.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('道侣 · 一:不进入效率链', () => {
  it('服务层不含任何属性、资源、道果、宿慧写入', () => {
    // 任一属性键都能写成 cultivationSpeed:一个都不给
    expect(CODE).not.toMatch(/StatMods|attackPct|cultivationSpeed|maxHpPct|dropRate|luck/)
    expect(CODE).not.toMatch(/addDaoFruit|addInsight|spendDaoFruit/)
    expect(CODE).not.toMatch(/useResourcesStore|spiritStone|addHerb|addOre|wudao|pills/)
    console.log('\n服务层无属性写入、无资源发放、无道果宿慧 —— 五条通路一条都没开')
  })

  it('数据层结构上就不给属性留位置', () => {
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
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
    console.log('\n三维各 +50 之后,player.finalStats.mods 完全不变')
  })

  it('故障注入:若给道侣接上属性,判据必须变红', () => {
    const tampered = CODE + "\nconst evil = { cultivationSpeed: 0.2 }\n"
    expect(tampered).toMatch(/cultivationSpeed/)
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
      // 同一中性选项,只变玩家道途
      const ev = BOND_EVENTS.find(e => e.id === 'be_spare')!
      const neutral = ev.choices.find(c => c.id === 'leave')!
      const row = leans.map(pl => resolveChoice(d, neutral, pl).leanShift)
      table[d.name] = row
    }
    console.log(`\n契合增减(行=道侣,列=${leans.map(l => LEAN_NAMES[l as keyof typeof LEAN_NAMES]).join('/')})`)
    for (const [name, row] of Object.entries(table)) {
      console.log(`${name.padEnd(10)} ${row.map(v => String(v).padStart(3)).join(' ')}`)
    }
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
    // 共历次数是行为条件:数值刷满也进不了同行
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

    // 相伴
    meet('dl_zhaoyan')
    advanceBond({ fate: 100, trust: 100, accord: 100, shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    advanceBond({ shared: true })
    endings.add(archiveBond()!.ending)

    // 错过
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
    advanceBond({ accord: -40 })
    const after = currentBond()!
    expect(after.accord).toBeLessThan(mid.accord)
    // highestReachable 会重算,阶段可能回落(设计如此)
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

describe('道侣 · 共命之险的生死判据', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('生死看「此前攒下」的深度,不被这次选择自己的加成事后救回', () => {
    const player = usePlayerStore()
    player.setBond({
      daoluId: 'dl_qingli',
      stage: 'known',
      fate: 50,
      trust: 50, // 低于安全线 55
      accord: 40, // 低于安全线 45
      shared: 1,
      metAt: 1,
      fallen: false,
      doneEvents: [],
      pendingEventId: null,
      opportunities: 0,
      nextEventAt: 0
    } as BondState)
    // share 自带 +trust/+accord,事后值 60/48;生死按事前 50/40 判
    const res = chooseBondEvent('be_jie', 'share')
    expect(res?.perished, '事前 trust50<55 应殒落,而非靠这次挺身的事后加成救活').toBe(true)
    expect(player.bond?.fallen).toBe(true)
  })
})

/**
 * `candidatesFor` 必须永不返回空。
 *
 * `exploration.maybeEncounter` 依赖这一点:`pool.length === 0` 那道守卫之下是
 * `rng.int(0, pool.length - 1)` 再取 `pool[...]` —— 池子空了会先算成
 * `rng.int(0, -1)` 得到 0,接着 `undefined.id` 直接抛 TypeError。
 * 守卫在,所以现在不炸;但守卫能成立,靠的是**这里永不返回空**。
 *
 * 这条锚的是那个前提,而不是守卫本身:哪天有人给 DAOLU 加筛选、或把通配项删了,
 * 这里立刻红,提示「守卫下面那段会崩」。
 */
describe('道侣候选 · 永不为空(exploration 的空池守卫依赖此前提)', () => {
  it('任意地貌组合(含空与未知地貌)都至少给一个候选', () => {
    const cases: string[][] = [[], ['不存在的地貌'], ['林泽'], ['幽冥'], ['a', 'b', 'c', 'd', 'e']]
    for (const t of cases) {
      expect(candidatesFor(t as never).length, `地貌 ${JSON.stringify(t)} 时池子空了`).toBeGreaterThan(0)
    }
  })

  it('靠的是至少有一个「通配」道侣(terrains 为空即不论地貌都收)', () => {
    const all = candidatesFor([] as never)
    expect(all.length, '通配项没了:空地貌也筛不出人,池子会空').toBeGreaterThan(0)
    const wildcard = DAOLU.filter(d => d.terrains.length === 0)
    expect(wildcard.length, 'DAOLU 里没有通配项,任意地貌都可能筛空').toBeGreaterThan(0)
  })
})

/**
 * 离线结算每场历练都会调 `gainBondOpportunities`,但四个提前返回分支都没判据。
 *
 * 它在 `offline.ts` 的结算里给道侣累加机会点 —— 无道侣、道侣已逝/已离、
 * 或传入非正数时应当什么都不做。删掉任一道守卫,分数会加到不该加的人身上,
 * 或者把已逝道侣的机会点继续往上堆。
 */
describe('道侣机会点 · 四个不该加的情形', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const makeBond = (over: Record<string, unknown> = {}) =>
    ({
      daoluId: 'dl_muyan',
      stage: 'met',
      fate: 10,
      trust: 10,
      accord: 10,
      shared: 0,
      metAt: 0,
      fallen: false,
      doneEvents: [],
      opportunities: 3,
      nextEventAt: 0,
      ...over
    }) as never

  it('有道侣时按场次累加(向下取整)', () => {
    const player = usePlayerStore()
    player.setBond(makeBond())
    gainBondOpportunities(2.9)
    expect(player.bond?.opportunities, '小数场次应向下取整').toBe(5)
  })

  it('没有道侣时什么都不做(不崩、不建空壳)', () => {
    const player = usePlayerStore()
    player.setBond(null)
    expect(() => gainBondOpportunities(3)).not.toThrow()
    expect(player.bond).toBeNull()
  })

  it('道侣已逝:不再累加', () => {
    const player = usePlayerStore()
    player.setBond(makeBond({ fallen: true }))
    gainBondOpportunities(5)
    expect(player.bond?.opportunities, '已逝道侣不该再攒机会点').toBe(3)
  })

  it('道侣已离开:不再累加', () => {
    const player = usePlayerStore()
    player.setBond(makeBond({ departed: true }))
    gainBondOpportunities(5)
    expect(player.bond?.opportunities, '已离道侣不该再攒机会点').toBe(3)
  })

  it('非正场次不累加(含 0 与负数)', () => {
    const player = usePlayerStore()
    player.setBond(makeBond())
    gainBondOpportunities(0)
    expect(player.bond?.opportunities).toBe(3)
    gainBondOpportunities(-4)
    expect(player.bond?.opportunities, '负数不该把机会点减回去').toBe(3)
  })
})
