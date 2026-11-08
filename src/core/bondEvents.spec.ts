/* eslint-disable no-console */
/** 故障注入:把 accordShift 从事件选择链断掉,本用例红。 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RandomService, mulberry32 } from '@/utils/random'
import {
  BOND_EVENTS,
  LEAN_COUNTERS,
  TRIGGER_NAMES,
  bondEventView,
  leanFromCounters,
  resolveChoice,
  sheDecidesNow
} from '@/data/bondEvents'
import {
  DAOLU,
  ENDING_NAMES,
  LEAN_NAMES,
  STAGE_GATES,
  STAGE_NAMES,
  TA,
  TEMPER_NAMES,
  bondText,
  daoluDef,
  daoluView,
  stageIndex as stageIdxOf,
  type DaoluDef
} from '@/data/daolu'
import { RESPONSE_NAMES, SPARK_NAMES, intentFor, respondTo, type BondIntent } from '@/data/bondIntent'
import {
  PERIL_SAFE_ACCORD,
  PERIL_SAFE_TRUST,
  advanceBond,
  archiveBond,
  chooseBondEvent,
  currentBond,
  herStance,
  meet,
  playerLean,
  offerBondEvent,
  pendingBondEvent,
  pendingIntent,
  respondIntent,
  sparkIntent,
  speakIntent
} from './daoluService'
import { useBondOverview } from '@/composables/useBondOverview'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useUiStore } from '@/stores/ui'

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
    expect(playerLean()).toBeNull()
    quests.inc('kills', 400)
    expect(playerLean()).toBe('slaughter')
    console.log('\n斩敌 400 → 玩家道途判为「杀伐」,无需任何设定按钮')
  })

  it('各道途都有自己的行为来源', () => {
    console.log('\n道途    行为计数')
    for (const [lean, keys] of Object.entries(LEAN_COUNTERS)) {
      console.log(`${lean.padEnd(10)} ${keys.join(' / ')}`)
    }
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
    expect(resolveChoice(def, kill, 'slaughter').accord).not.toBe(resolveChoice(def, kill, 'alchemy').accord)
    // 断链模拟:playerLean 恒为 null
    const broken = resolveChoice(def, kill, null)
    const broken2 = resolveChoice(def, kill, null)
    expect(broken.accord).toBe(broken2.accord)
    console.log(
      `\n断掉道途来源后,任何玩家得到的契合都是 ${broken.accord} —— 完全一样。` +
        '\n这正是 33.8 的状态:接口存在,但契合不由玩家决定'
    )
  })

  it('chooseBondEvent 确实读取了玩家道途', () => {
    expect(CODE).toMatch(/resolveChoice\([^)]*playerLean\(\)/)
    console.log('\nchooseBondEvent → resolveChoice(def, ch, playerLean()) —— 链路接通')
  })

  /**
   * 玩家道途真的参与契合计算 —— 用行为验，不只查源码里有没有 `playerLean()`。
   *
   * 上面那条只确认 `chooseBondEvent` 的调用里出现了 `playerLean()` 这个名字。
   * 若 `resolveChoice` 内部把 playerLean 那段删掉(或写错方向),字符串一字不差,它照样绿,
   * 而 33.8 那个「接口存在、契合不由玩家决定」的老毛病就回来了。
   *
   * 判据钉三件:对齐道途 > 不对齐(至少差 6)、相冲道途最低、传 null 时退回不含玩家项那档。
   * 故障注入:删掉 resolveChoice 里 `if (playerLean) {...}` 整段,本条红。
   */
  it('同一选择,不同玩家道途给出不同的契合(对齐者更高、相冲者更低)', () => {
    const def = daoluDef(DAOLU[0]!.id)!
    // 找一个「道侣道途 = 选项道途」的组合,这样 def 与 choice 对齐这档是 6
    const ev = BOND_EVENTS.find(e => e.choices.some(c => c.lean === def.lean))!
    const ch = ev.choices.find(c => c.lean === def.lean)!

    // tension 表:slaughter↔longevity、sword↔alchemy。相冲者取 def.lean 的对家
    const TENSION: Record<string, string> = { slaughter: 'longevity', longevity: 'slaughter', sword: 'alchemy', alchemy: 'sword' }
    const aligned = resolveChoice(def, ch, def.lean).leanShift
    // 无关者:既非对齐也非相冲,取一个真实存在的第三方道途
    const unrelated = (Object.keys(LEAN_NAMES) as (keyof typeof LEAN_NAMES)[]).find(
      k => k !== def.lean && k !== TENSION[def.lean]
    )!
    const neutral = resolveChoice(def, ch, unrelated).leanShift
    const hostile = resolveChoice(def, ch, TENSION[def.lean] as never).leanShift
    const noPlayer = resolveChoice(def, ch, null).leanShift

    expect(noPlayer, '传 null 时该退回「不含玩家项」那一档').toBe(6)
    expect(aligned, '玩家道途与道侣对齐时该更高').toBeGreaterThan(noPlayer)
    expect(neutral, '玩家道途无关时该低于对齐').toBeLessThan(aligned)
    expect(hostile, '相冲道途该是三者最低').toBeLessThan(aligned)
    // 三档必须真有三档,否则「不同道途同一结果」的老毛病会静默回来
    expect(new Set([aligned, neutral, hostile]).size, '三种道途算出了相同的契合 —— 玩家道途没起作用').toBe(3)
  })
})

describe('共同事件 · 二:同一道侣,不同选择不同结果', () => {
  it('六个事件各代表一种关系冲突', () => {
    console.log('\n事件      冲突类型   她的诉求')
    for (const e of BOND_EVENTS) {
      console.log(`${e.title.padEnd(8)} ${e.kind.padEnd(10)} ${e.herWish}`)
    }
    const kinds = new Set(BOND_EVENTS.map(e => e.kind))
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
    const lead = BOND_EVENTS.find(e => e.id === 'be_lead')!
    const accompany = resolveChoice(def, lead.choices.find(c => c.id === 'accompany')!, null)
    const price = BOND_EVENTS.find(e => e.id === 'be_price')!
    const forgo = resolveChoice(def, price.choices.find(c => c.id === 'forgo')!, null)
    console.log(
      `\n陪她冒险    缘分 +${accompany.fate}  信任 +${accompany.trust}  契合 +${accompany.accord}` +
        `\n为她作罢    缘分 +${forgo.fate}  信任 +${forgo.trust}  契合 +${forgo.accord}`
    )
    expect(accompany.trust).toBeGreaterThan(accompany.accord)
    expect(forgo.accord).toBeGreaterThan(forgo.trust)
  })

  it('三维可以背离 —— 这次是选择走出来的,不是手动传参', () => {
    const quests = useQuestsStore()
    quests.inc('kills', 400)
    bondTo('dl_qingli', 'confidant')
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
    expect(currentBond()?.departed).toBe(true)
    console.log(`\n「${r.text}」`)
    const before = currentBond()!
    advanceBond({ fate: 50, trust: 50 })
    expect(currentBond()!.fate).toBe(before.fate)
    const rec = archiveBond()!
    expect(rec.ending).toBe('parted')
    console.log(`归档结局:${rec.ending} —— 留下的不是数字,是这一世发生过什么`)
  })

  it('信任与契合双双崩塌也会导致她离开', () => {
    const quests = useQuestsStore()
    quests.inc('kills', 400)
    bondTo('dl_baiwei', 'confidant')
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
    const idx = bondTo('dl_qingli', 'known')
    const pool = new Set<string>()
    for (const trig of ['enterPlace', 'firstVictory', 'bossDefeated', 'nearDeath'] as const) {
      for (let i = 0; i < 20; i += 1) {
        const e = offerBondEvent(trig)
        if (e) {
          pool.add(e.id)
          // 清掉待决与冷却,继续探测
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
    expect(currentBond()?.departed ?? false).toBe(false)
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

/** 共命之险(唯一会死人的一条路):不可逆的后果须由玩家选择、事先写明、另有活路 */
describe('共同事件 · 共命之险', () => {
  const PERIL_EVENT = 'be_jie'
  const PERIL_CHOICE = 'share'

  function meetAt(trust: number, accord: number): void {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    meet('dl_qingli')
    // 事件门槛要 stage ≥ 4,即 confidant
    player.setBond({
      ...player.bond!,
      stage: 'confidant',
      fate: 60,
      trust,
      accord,
      shared: 4,
      opportunities: 20,
      nextEventAt: 0,
      pendingEventId: PERIL_EVENT
    })
  }

  it('选项自带警示:label 里写明她未必撑得住,且另有两条活路', () => {
    const ev = BOND_EVENTS.find(e => e.id === PERIL_EVENT)!
    const peril = ev.choices.find(c => c.id === PERIL_CHOICE)!
    expect(peril.peril).toBe(true)
    expect(peril.label, '不可逆选项必须在标签上写明代价').toContain('未必撑得住')
    expect(ev.choices.filter(c => !c.peril).length, '必须另有不必拼命的选项').toBeGreaterThanOrEqual(2)
    for (const other of BOND_EVENTS) {
      if (other.id === PERIL_EVENT) continue
      expect(other.choices.some(c => c.peril), `${other.id} 不该有致命选项`).toBe(false)
    }
  })

  it('关系不够深就真的殒落:fallen + perished,且她此后不再有后续', () => {
    meetAt(30, 20)
    const r = chooseBondEvent(PERIL_EVENT, PERIL_CHOICE)!
    expect(r.perished).toBe(true)
    const player = usePlayerStore()
    expect(player.bond?.fallen).toBe(true)
    expect(pendingBondEvent()).toBeNull()
    expect(pendingIntent()).toBeNull()
  })

  it('关系够深则同生:信任与契合都过线就不死人', () => {
    meetAt(PERIL_SAFE_TRUST + 5, PERIL_SAFE_ACCORD + 5)
    const r = chooseBondEvent(PERIL_EVENT, PERIL_CHOICE)!
    expect(r.perished).toBeUndefined()
    expect(usePlayerStore().bond?.fallen).toBe(false)
    console.log(`\n共命之险:信任 ${PERIL_SAFE_TRUST}+ 且契合 ${PERIL_SAFE_ACCORD}+ 才过得去`)
  })

  it('另外两条路永不致死(哪怕关系极差)', () => {
    for (const id of ['shield', 'send']) {
      meetAt(5, 5)
      const r = chooseBondEvent(PERIL_EVENT, id)
      expect(r, `${id} 应当能选`).not.toBeNull()
      expect(r!.perished).toBeUndefined()
      expect(usePlayerStore().bond?.fallen, `${id} 不该致死`).toBe(false)
    }
  })
})

describe('共命之险 · 在真实路径上够得着', () => {
  it('每个声明的触发情境都真的被玩法调用(不是只写在类型里)', () => {
    // 玩法源码(排除本文件与 daoluService 自身)
    const coreDir = resolve(__dirname)
    const callers = readdirSync(coreDir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'daoluService.ts')
      .map(f => readFileSync(resolve(coreDir, f), 'utf-8'))
      .join('\n')
    const declared = new Set(BOND_EVENTS.flatMap(e => [...e.triggers]))
    expect(declared.size).toBeGreaterThan(0)
    for (const trig of declared) {
      expect(callers, `没有任何玩法代码会 offer「${trig}」—— 声明了却从不发生`).toContain(`offerBondEvent('${trig}')`)
    }
  })

  it('靠行为推到「知交」,「濒死」情境的一掷里真的有「共劫」', () => {
    // 全程用行为推进,不手改 stage
    meet('dl_qingli')
    advanceBond({ fate: 40, trust: 30, shared: true })
    advanceBond({ fate: 60, trust: 60, shared: true })
    expect(currentBond()!.stage).toBe('confidant')

    const peril = BOND_EVENTS.find(e => e.id === 'be_jie')!
    expect(stageIdxOf(currentBond()!.stage)).toBeGreaterThanOrEqual(peril.minStageIndex)

    // 带种子的随机源;池子是 [重伤, 共劫]
    const rand = new RandomService(mulberry32(20260912))
    const seen = new Set<string>()
    for (let i = 0; i < 400 && !seen.has('be_jie'); i += 1) {
      const b = currentBond()!
      usePlayerStore().setBond({ ...b, pendingEventId: null, opportunities: 99, nextEventAt: 0 })
      const e = offerBondEvent('nearDeath', rand)
      if (e) seen.add(e.id)
    }
    expect(seen.has('be_jie'), '「共劫」够不着 —— 道侣陨落又成了没有触发路径的特例').toBe(true)
    console.log(`\n历练「濒死」情境可遇:${[...seen].join('、')}`)
  })
})

/**
 * 道侣代词:道侣有男有女,共用文案一律写 {ta},上屏前按本人性别换成 她/他。
 *
 * 故障注入:把任一条事件文案里的 {ta} 改回「她」→「数据守卫」红;
 * 去掉 pendingBondEvent 里的渲染 →「上屏路径」红。
 */
describe('道侣代词 · 性别', () => {
  it('十位道侣各有性别;速写写明「女修」的必为女', () => {
    expect(Object.fromEntries(DAOLU.map(d => [d.id, d.gender]))).toEqual({
      dl_qingli: 'f',
      dl_zhaoyan: 'm',
      dl_muyan: 'f',
      dl_hanzheng: 'm',
      dl_yunshu: 'f',
      dl_ligu: 'm',
      dl_baiwei: 'f',
      dl_zhongli: 'm',
      dl_xuewu: 'f',
      dl_cangming: 'm'
    })
    for (const d of DAOLU) if (d.brief.includes('女修')) expect(d.gender, d.name).toBe('f')
  })

  it('同一句模板:男道侣渲染为「他」,女道侣渲染为「她」', () => {
    const tpl = BOND_EVENTS.find(e => e.id === 'be_relic')!.text
    expect(tpl).toContain(TA)
    const male = bondText(tpl, daoluDef('dl_zhaoyan')!.gender)
    const female = bondText(tpl, daoluDef('dl_qingli')!.gender)
    expect(male.startsWith('你与他循着')).toBe(true)
    expect(male).not.toContain('她')
    expect(female.startsWith('你与她循着')).toBe(true)
    expect(female).not.toContain('他')
  })
})

/** 不指道侣的「他」:逐条写明指谁,守卫只放过这些 */
const NOT_DAOLU: Record<string, string> = {
  他人: '「别人」,不是代词',
  他法: '「别的法子」,不是代词',
  他方才还在设伏: '刀下:跪地的散修',
  放他走: '刀下:散修',
  不管他: '刀下:散修'
}

function stripNotDaolu(text: string): string {
  return Object.keys(NOT_DAOLU).reduce((s, w) => s.split(w).join(''), text)
}

function intentStub(d: DaoluDef, responses: BondIntent['responses']): BondIntent {
  return { daoluId: d.id, ...intentFor(d), ripeness: 2, sparks: [], raised: 1, responses, settled: false }
}

/** 道侣文本数据里一切可能上屏的字串(未渲染的模板),逐字段收齐 */
function bondCorpus(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  const walk = (where: string, v: unknown): void => {
    if (typeof v === 'string') out.push({ where, text: v })
    else if (Array.isArray(v)) v.forEach((x, i) => walk(`${where}[${i}]`, x))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${where}.${k}`, x)
  }
  walk('BOND_EVENTS', BOND_EVENTS)
  walk('DAOLU', DAOLU)
  walk('STAGE_GATES', STAGE_GATES)
  walk('SPARK_NAMES', SPARK_NAMES)
  walk('RESPONSE_NAMES', RESPONSE_NAMES)
  walk('TRIGGER_NAMES', TRIGGER_NAMES)
  walk('STAGE_NAMES', STAGE_NAMES)
  walk('ENDING_NAMES', ENDING_NAMES)
  walk('LEAN_NAMES', LEAN_NAMES)
  walk('TEMPER_NAMES', TEMPER_NAMES)
  for (const d of DAOLU) {
    walk(`intentFor(${d.id})`, intentFor(d))
    for (const responses of [[], ['ignore', 'ignore']] as BondIntent['responses'][]) {
      for (const r of ['accept', 'refuse', 'ignore'] as const) {
        walk(`respondTo(${d.id},${r},${responses.length})`, respondTo(d, intentStub(d, responses), r).text)
      }
    }
  }
  return out
}

describe('道侣代词 · 数据守卫', () => {
  it('道侣文本数据里不再有裸「她/他」指代道侣', () => {
    const corpus = bondCorpus()
    expect(corpus.length, '语料没收上来,判据会假绿').toBeGreaterThan(150)
    const bare = corpus.filter(c => /[她他]/.test(stripNotDaolu(c.text))).map(c => `${c.where}: ${c.text}`)
    expect(bare, '指道侣的代词写 {ta}').toEqual([])
    // 放行名单逐条都得真用得上,过期的条目会把将来的裸代词放过去
    for (const w of Object.keys(NOT_DAOLU)) {
      expect(corpus.some(c => c.text.includes(w)), `放行名单「${w}」已无出处`).toBe(true)
    }
  })

  it('每位道侣渲染全部事件、选项、结果后不残留占位,代词与本人一致', () => {
    for (const d of DAOLU) {
      const want = d.gender === 'm' ? '他' : '她'
      const wrong = d.gender === 'm' ? '她' : '他'
      const pairs: [string, string][] = []
      for (const ev of BOND_EVENTS) {
        const view = bondEventView(ev, d.gender)
        expect(view.id).toBe(ev.id)
        pairs.push([ev.title, view.title], [ev.text, view.text], [ev.herWish, view.herWish], [ev.herLimit, view.herLimit])
        if (ev.sheDecides) pairs.push([ev.sheDecides.line, view.sheDecides!.line])
        ev.choices.forEach((ch, i) => {
          pairs.push([ch.label, view.choices[i]!.label], [ch.outcome.text, view.choices[i]!.outcome.text])
        })
      }
      const shown = daoluView(d)
      pairs.push([d.brief, shown.brief], [d.pursuit, shown.pursuit], [d.taboo, shown.taboo])
      for (const s of Object.values(SPARK_NAMES)) pairs.push([s, bondText(s, d.gender)])
      const intent = intentFor(d)
      pairs.push([intent.line, bondText(intent.line, d.gender)], [intent.wish, bondText(intent.wish, d.gender)])
      for (const [raw, out] of pairs) {
        expect(out, `${d.name}:${raw}`).not.toMatch(/[{}]/)
        expect(stripNotDaolu(out), `${d.name}:${out}`).not.toContain(wrong)
        if (raw.includes(TA)) expect(out, `${d.name}:${raw}`).toContain(want)
      }
    }
    // 渲染出的是新对象,数据本身仍是模板
    expect(BOND_EVENTS.find(e => e.id === 'be_relic')!.text).toContain(TA)
  })

  it('道侣的服务、投影与弹窗代码里不手写「她/他」', () => {
    const strip = (s: string): string =>
      s
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
    const files = ['daoluService.ts', '../composables/useBondOverview.ts', '../components/character/BondDialog.vue']
    for (const f of files) {
      const code = strip(readFileSync(resolve(__dirname, f), 'utf-8'))
      expect(code.match(/.*[她他].*/g) ?? [], f).toEqual([])
    }
    const dialog = strip(readFileSync(resolve(__dirname, '../components/character/BondDialog.vue'), 'utf-8'))
    // 弹窗自己写的标签走投影给的代词,经历名走同一个渲染口
    expect(dialog).toContain('{{ pronoun }}所求')
    expect(dialog).toContain('ta(SPARK_NAMES[s])')
  })
})

describe('道侣代词 · 上屏路径', () => {
  /** 摆好一段知交关系,待决事件为 eventId;信任契合都压低,好让表态、离去、殒落都走一遍 */
  function setUp(daoluId: string, eventId: string): void {
    setActivePinia(createPinia())
    meet(daoluId)
    const player = usePlayerStore()
    player.setBond({
      ...player.bond!,
      stage: 'confidant',
      fate: 60,
      trust: 10,
      accord: 10,
      shared: 4,
      opportunities: 20,
      nextEventAt: 0,
      pendingEventId: eventId
    })
  }

  for (const [daoluId, gender] of [
    ['dl_zhaoyan', 'm'],
    ['dl_qingli', 'f']
  ] as const) {
    it(`${daoluId}:待决事件、表态、选择结果与提示条按本人性别渲染`, () => {
      const def = daoluDef(daoluId)!
      expect(def.gender).toBe(gender)
      expect(TA).toBe('{ta}')
      const p = gender === 'm' ? '他' : '她'
      const wrong = gender === 'm' ? '她' : '他'
      let checked = 0
      for (const ev of BOND_EVENTS) {
        for (const ch of ev.choices) {
          setUp(daoluId, ev.id)
          const shown = pendingBondEvent()!
          expect(shown.id).toBe(ev.id)
          expect(shown.text).toBe(ev.text.split(TA).join(p))
          expect(shown.herWish).toBe(ev.herWish.split(TA).join(p))
          expect(shown.herLimit).toBe(ev.herLimit.split(TA).join(p))
          expect(shown.choices.map(c => c.label)).toEqual(ev.choices.map(c => c.label.split(TA).join(p)))
          const stance = herStance(shown)
          if (ev.sheDecides) {
            expect(stance).toBe(ev.sheDecides.line.split(TA).join(p))
            // 传原始定义进来也得换好
            expect(herStance(ev)).toBe(stance)
          }
          const r = chooseBondEvent(ev.id, ch.id)!
          expect(r.text.startsWith(ch.outcome.text.split(TA).join(p))).toBe(true)
          const texts = [r.text, stance ?? '', ...useUiStore().toasts.map(t => t.text)]
          for (const t of texts) {
            expect(t).not.toMatch(/[{}]/)
            expect(stripNotDaolu(t), t).not.toContain(wrong)
          }
          checked += 1
        }
      }
      expect(checked).toBe(BOND_EVENTS.reduce((n, e) => n + e.choices.length, 0))
    })
  }

  it('男道侣自己提的事:开口提示、弹窗所见、回应结果都是「他」', () => {
    meet('dl_zhaoyan')
    advanceBond({ fate: 40, trust: 25, shared: true })
    let spoke = false
    for (let i = 0; i < 40 && !spoke; i += 1) {
      sparkIntent('omen')
      spoke = speakIntent() !== null
    }
    expect(spoke).toBe(true)
    const def = daoluDef('dl_zhaoyan')!
    const line = bondText(intentFor(def).line, 'm')
    expect(line.startsWith('他')).toBe(true)
    expect(useUiStore().toasts.map(t => t.text)).toContain(line)
    expect(pendingIntent()!.line).toBe(line)
    const ov = useBondOverview()
    expect(ov.herIntent.value!.line).toBe(line)
    expect(ov.pronoun.value).toBe('他')
    expect(ov.ta(SPARK_NAMES.supported)).toBe('你站在他那边')
    for (const r of ['refuse', 'ignore'] as const) {
      const after = respondIntent(r)
      if (after) expect(after.text).not.toMatch(/[{}她]/)
      sparkIntent('omen')
      speakIntent()
    }
    for (const t of useUiStore().toasts) expect(t.text).not.toMatch(/[{}她]/)
  })

  it('人物卡投影:所求与底线里指本人的代词按性别换好,意图存的是换好的整句', () => {
    meet('dl_hanzheng')
    const ov = useBondOverview()
    expect(ov.bondDef.value!.pursuit).toBe('找到当年灭他满门的那个人')
    expect(ov.pronoun.value).toBe('他')
    advanceBond({ fate: 40, trust: 25, shared: true })
    sparkIntent('omen')
    expect(currentBond()!.intent!.wish).toBe('找到当年灭他满门的那个人')
    expect(currentBond()!.intent!.line.startsWith('他')).toBe(true)

    setActivePinia(createPinia())
    meet('dl_ligu')
    expect(useBondOverview().bondDef.value!.taboo).toBe('不许他人碰他未成的器胚')

    setActivePinia(createPinia())
    meet('dl_baiwei')
    const f = useBondOverview()
    expect(f.pronoun.value).toBe('她')
    expect(f.ta(SPARK_NAMES.crossed)).toBe('你越过了她的线')
  })

  it('旧档:待决事件存的是 id,读档后按性别渲染;意图存的整句原样保留', () => {
    const player = usePlayerStore()
    const oldLine = '他把剑横在膝上:「这柄铁剑,我想带它去个地方。」'
    player.$patch({
      bond: {
        daoluId: 'dl_zhaoyan',
        stage: 'confidant',
        fate: 60,
        trust: 60,
        accord: 60,
        shared: 4,
        metAt: 1,
        fallen: false,
        doneEvents: [],
        pendingEventId: 'be_relic',
        opportunities: 20,
        nextEventAt: 0,
        lastKind: null,
        intent: {
          daoluId: 'dl_zhaoyan',
          wish: '把那柄铁剑养到出鞘',
          line: oldLine,
          ripeness: 2,
          sparks: ['omen'],
          raised: 1,
          responses: [],
          settled: false
        },
        intentPending: true
      }
    })
    player.sanitize()
    expect(pendingBondEvent()!.text.startsWith('你与他循着')).toBe(true)
    expect(pendingIntent()!.line).toBe(oldLine)
  })
})
