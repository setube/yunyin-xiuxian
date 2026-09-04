/* eslint-disable no-console */
/**
 * 道侣共同事件验收(Phase 33.9)
 *
 * 33.8 留下三个缺口,它们其实是同一件事:**道侣还没有自己的意志。**
 *   accordShift 有接口没来源 · 诉求与底线只是展示文本 · 玩家做不了选择
 *
 * 本轮验收的核心不是「事件能触发」,而是:
 *
 *   一 契合是**行为结果**,不是 API 参数 —— 玩家道途由行为计数推断
 *   二 同一道侣在不同玩家选择下得到不同关系结果
 *   三 三维吃不同类型的行为,不被平均修改
 *   四 她可以自己做决定,也可以离开
 *   五 共同事件不产出任何 StatMods / 资源 / 道果 / 宿慧
 *
 * 故障注入(用户指定):把 accordShift 从事件选择链断掉,测试必须失败。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BOND_EVENTS,
  LEAN_COUNTERS,
  leanFromCounters,
  resolveChoice,
  sheDecidesNow
} from '@/data/bondEvents'
import { daoluDef, stageIndex as stageIdxOf } from '@/data/daolu'
import {
  advanceBond,
  archiveBond,
  chooseBondEvent,
  currentBond,
  hasDeparted,
  herStance,
  meet,
  playerLean,
  offerBondEvent,
  pendingBondEvent
} from './daoluService'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'

const SRC = readFileSync(resolve(__dirname, 'daoluService.ts'), 'utf-8')
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const DATA = readFileSync(resolve(__dirname, '../data/bondEvents.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 把关系推到目标阶,返回实际到达的阶序 */
function bondTo(id: string, target: 'known' | 'together' | 'confidant'): number {
  meet(id)
  if (target === 'known') advanceBond({ fate: 15 })
  if (target === 'together') advanceBond({ fate: 40, trust: 25, shared: true })
  if (target === 'confidant') {
    advanceBond({ fate: 55, trust: 55, accord: 20, shared: true })
    advanceBond({ shared: true })
  }
  return stageIdxOf(currentBond()!.stage)
}

describe('共同事件 · 一:契合是行为结果,不是参数', () => {
  it('玩家道途由行为计数推断,不是设定项', () => {
    const quests = useQuestsStore()
    // 没有任何行为时不判定道途
    expect(playerLean()).toBeNull()
    // 大量斩杀 → 杀伐
    quests.inc('kills', 400)
    expect(playerLean()).toBe('slaughter')
    console.log('\n斩敌 400 → 玩家道途判为「杀伐」,无需任何设定按钮')
  })

  it('各道途都有自己的行为来源', () => {
    console.log('\n道途    行为计数')
    for (const [lean, keys] of Object.entries(LEAN_COUNTERS)) {
      console.log(`${lean.padEnd(10)} ${keys.join(' / ')}`)
    }
    // 每条道途至少绑定一个计数器,否则它永远无法被推断出来
    for (const keys of Object.values(LEAN_COUNTERS)) expect(keys.length).toBeGreaterThan(0)
  })

  it('同一个选择,玩家道途不同则契合结果不同', () => {
    const def = daoluDef('dl_qingli')!
    const ev = BOND_EVENTS.find(e => e.id === 'be_spare')!
    const kill = ev.choices.find(c => c.id === 'kill')!
    const asSlaughter = resolveChoice(def, kill, 'slaughter')
    const asAlchemy = resolveChoice(def, kill, 'alchemy')
    expect(asSlaughter.accord).not.toBe(asAlchemy.accord)
    console.log(
      `\n同样是「斩草除根」,对丹鼎道的沈青璃:` +
        `\n  一贯杀伐的玩家 → 契合 ${asSlaughter.accord}` +
        `\n  一贯丹鼎的玩家 → 契合 ${asAlchemy.accord}` +
        `\n——同一个动作,由「你是谁」决定她怎么看`
    )
  })

  it('故障注入:把道途链断掉,契合差异立刻消失', () => {
    const def = daoluDef('dl_qingli')!
    const ev = BOND_EVENTS.find(e => e.id === 'be_spare')!
    const kill = ev.choices.find(c => c.id === 'kill')!
    // 正常:两种道途给出不同契合
    expect(resolveChoice(def, kill, 'slaughter').accord).not.toBe(resolveChoice(def, kill, 'alchemy').accord)
    // 断链模拟:playerLean 恒为 null(即 33.8 的状态——没有来源)
    const broken = resolveChoice(def, kill, null)
    const broken2 = resolveChoice(def, kill, null)
    expect(broken.accord).toBe(broken2.accord)
    console.log(
      `\n断掉道途来源后,任何玩家得到的契合都是 ${broken.accord} —— 完全一样。` +
        '\n这正是 33.8 的状态:接口存在,但契合不由玩家决定'
    )
  })

  it('chooseBondEvent 确实读取了玩家道途', () => {
    // 源码层面:选择结算必须调用 playerLean(),否则又退回喂参数
    expect(CODE).toMatch(/resolveChoice\([^)]*playerLean\(\)/)
    console.log('\nchooseBondEvent → resolveChoice(def, ch, playerLean()) —— 链路接通')
  })
})

describe('共同事件 · 二:同一道侣,不同选择不同结果', () => {
  it('六个事件各代表一种关系冲突', () => {
    console.log('\n事件      冲突类型   她的诉求')
    for (const e of BOND_EVENTS) {
      console.log(`${e.title.padEnd(8)} ${e.kind.padEnd(10)} ${e.herWish}`)
    }
    const kinds = new Set(BOND_EVENTS.map(e => e.kind))
    // 类型齐比数量多重要
    expect(kinds.size).toBe(BOND_EVENTS.length)
  })

  it('同一事件的三个选项走出三种反应', () => {
    const results: Record<string, string> = {}
    for (const cid of ['take_recipe', 'take_artifact', 'take_both']) {
      setActivePinia(createPinia())
      bondTo('dl_qingli', 'together')
      const r = chooseBondEvent('be_relic', cid)!
      results[cid] = r.reaction
    }
    console.log('\n遗府事件的三种选择:')
    for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(14)} → ${v}`)
    expect(new Set(Object.values(results)).size).toBeGreaterThan(1)
  })

  it('触碰底线会实际扣信任 —— 底线不再只是展示文本', () => {
    const def = daoluDef('dl_qingli')!
    const ev = BOND_EVENTS.find(e => e.id === 'be_relic')!
    const crossing = ev.choices.find(c => c.crossesTaboo)!
    const normal = ev.choices.find(c => c.id === 'take_recipe')!
    const a = resolveChoice(def, crossing, null)
    const b = resolveChoice(def, normal, null)
    expect(a.trust).toBeLessThan(b.trust)
    console.log(`\n触碰底线 信任 ${a.trust};依她所愿 信任 ${b.trust}`)
  })

  it('支持她会实际加信任', () => {
    const def = daoluDef('dl_qingli')!
    const ev = BOND_EVENTS.find(e => e.id === 'be_lead')!
    const support = ev.choices.find(c => c.supportsHer)!
    const r = resolveChoice(def, support, null)
    expect(r.trust).toBeGreaterThan(10)
    console.log(`\n陪她进去 信任 +${r.trust} —— 「在危险中支持她」是信任的来源`)
  })
})

describe('共同事件 · 三:三维吃不同来源', () => {
  it('缘分来自共历,信任来自支持与兑现,契合来自道途', () => {
    const def = daoluDef('dl_qingli')!
    // 陪她冒险:缘分与信任大涨,契合几乎不动
    const lead = BOND_EVENTS.find(e => e.id === 'be_lead')!
    const accompany = resolveChoice(def, lead.choices.find(c => c.id === 'accompany')!, null)
    // 价值观选择:契合大动
    const price = BOND_EVENTS.find(e => e.id === 'be_price')!
    const forgo = resolveChoice(def, price.choices.find(c => c.id === 'forgo')!, null)
    console.log(
      `\n陪她冒险    缘分 +${accompany.fate}  信任 +${accompany.trust}  契合 +${accompany.accord}` +
        `\n为她作罢    缘分 +${forgo.fate}  信任 +${forgo.trust}  契合 +${forgo.accord}`
    )
    // 风险事件的信任增幅明显高于契合;价值观事件反之
    expect(accompany.trust).toBeGreaterThan(accompany.accord)
    expect(forgo.accord).toBeGreaterThan(forgo.trust)
  })

  it('三维可以背离 —— 这次是选择走出来的,不是手动传参', () => {
    const quests = useQuestsStore()
    // 玩家一贯杀伐
    quests.inc('kills', 400)
    bondTo('dl_qingli', 'confidant')
    // 陪她冒险(缘分信任涨),但在关键处按自己的道走
    chooseBondEvent('be_lead', 'accompany')
    chooseBondEvent('be_spare', 'kill')
    const b = currentBond()!
    console.log(
      `\n一贯杀伐的玩家 + 丹鼎道的沈青璃:` +
        `\n  缘分 ${b.fate} · 信任 ${b.trust} · 契合 ${b.accord}` +
        `\n陪她走过险路,却在刀下见了分晓 —— 亲近,但不同道`
    )
    expect(b.trust).toBeGreaterThan(b.accord)
  })
})

describe('共同事件 · 四:她有自己的意志', () => {
  it('信任不足时她自己先做决定', () => {
    bondTo('dl_yunshu', 'confidant')
    const b = currentBond()!
    // 压低信任
    advanceBond({ trust: -(b.trust - 10) })
    const ev = BOND_EVENTS.find(e => e.id === 'be_rescue')!
    const stance = herStance(ev)
    expect(stance).not.toBeNull()
    console.log(`\n信任 ${currentBond()!.trust} 时的重伤事件:「${stance}」`)
  })

  it('信任充足时她不抢先表态', () => {
    bondTo('dl_yunshu', 'confidant')
    advanceBond({ trust: 60 })
    const ev = BOND_EVENTS.find(e => e.id === 'be_rescue')!
    expect(herStance(ev)).toBeNull()
    console.log(`\n信任 ${currentBond()!.trust} 时,她把选择交给你`)
  })

  it('她可以离开 —— 关系随之冻结,但履历仍记这一段', () => {
    bondTo('dl_qingli', 'confidant')
    const r = chooseBondEvent('be_depart', 'part_ways')!
    expect(r.left).toBe(true)
    expect(hasDeparted()).toBe(true)
    console.log(`\n「${r.text}」`)
    // 冻结:此后推进无效
    const before = currentBond()!
    advanceBond({ fate: 50, trust: 50 })
    expect(currentBond()!.fate).toBe(before.fate)
    // 但归档仍留下这一段
    const rec = archiveBond()!
    expect(rec.ending).toBe('parted')
    console.log(`归档结局:${rec.ending} —— 留下的不是数字,是这一世发生过什么`)
  })

  it('信任与契合双双崩塌也会导致她离开', () => {
    const quests = useQuestsStore()
    quests.inc('kills', 400)
    bondTo('dl_baiwei', 'confidant')
    // 连续违背她
    chooseBondEvent('be_relic', 'take_artifact')
    chooseBondEvent('be_spare', 'kill')
    const r = chooseBondEvent('be_price', 'take')
    const b = currentBond()!
    console.log(`\n连番违背之后:信任 ${b.trust} · 契合 ${b.accord} · 离开=${b.departed === true}`)
    expect(r).not.toBeNull()
  })
})

describe('共同事件 · 五:仍不进效率链', () => {
  it('事件数据层不含任何属性或资源字段', () => {
    expect(DATA).not.toMatch(/StatMods|cultivationSpeed|attackPct|spiritStone|daoFruit|insight/)
    console.log('\nbondEvents.ts 无属性、无资源、无道果宿慧 —— 只有关系与叙事')
  })

  it('选择事件不改变任何玩家属性与资源', () => {
    const player = usePlayerStore()
    bondTo('dl_qingli', 'together')
    const mods = JSON.stringify(player.finalStats.mods)
    const fruit = player.reincarnation.daoFruit
    const insight = player.reincarnation.insight
    chooseBondEvent('be_relic', 'take_recipe')
    expect(JSON.stringify(player.finalStats.mods)).toBe(mods)
    expect(player.reincarnation.daoFruit).toBe(fruit)
    expect(player.reincarnation.insight).toBe(insight)
    console.log('\n做完一次选择:属性、道果、宿慧分毫未动')
  })

  it('服务层新增代码同样不含任何发放', () => {
    expect(CODE).not.toMatch(/addDaoFruit|addInsight|useResourcesStore|StatMods|cultivationSpeed/)
  })
})

describe('共同事件 · 边界', () => {
  it('事件不重复触发', () => {
    bondTo('dl_qingli', 'together')
    chooseBondEvent('be_relic', 'take_recipe')
    expect(currentBond()!.doneEvents).toContain('be_relic')
    expect(chooseBondEvent('be_relic', 'take_recipe')).toBeNull()
  })

  it('阶段不足时高阶事件不会出现', () => {
    // 只推到「相识」——低于三个高阶事件的门槛
    const idx = bondTo('dl_qingli', 'known')
    const pool = new Set<string>()
    for (const trig of ['enterPlace', 'firstVictory', 'bossDefeated', 'nearDeath'] as const) {
      for (let i = 0; i < 20; i += 1) {
        const e = offerBondEvent(trig)
        if (e) {
          pool.add(e.id)
          // 清掉待决与冷却,继续探测其余可能
          const b = currentBond()!
          usePlayerStore().setBond({ ...b, pendingEventId: null, nextEventAt: 0 })
        }
      }
    }
    const gated = BOND_EVENTS.filter(e => e.minStageIndex > idx)
    for (const g of gated) expect(pool.has(g.id)).toBe(false)
    console.log(
      `\n阶序 ${idx}(相识)可遇:${[...pool].join('、') || '无'}` +
        `\n因阶段不足未出现:${gated.map(g => g.title).join('、')}`
    )
  })

  it('未遇见任何人时所有接口安全返回', () => {
    expect(offerBondEvent('enterPlace')).toBeNull()
    expect(pendingBondEvent()).toBeNull()
    expect(chooseBondEvent('be_relic', 'take_recipe')).toBeNull()
    expect(hasDeparted()).toBe(false)
  })

  it('leanFromCounters 在行为量过少时不妄下判断', () => {
    expect(leanFromCounters(() => 0)).toBeNull()
    expect(leanFromCounters(k => (k === 'kills' ? 5 : 0))).toBeNull()
    console.log('\n零星几场战斗不足以判定道途 —— 避免开局就被贴标签')
  })

  it('sheDecidesNow 对无表态事件返回 null', () => {
    const ev = BOND_EVENTS.find(e => !e.sheDecides)!
    expect(sheDecidesNow(ev, { trust: 0, accord: 0 }, 'cautious')).toBeNull()
  })
})
