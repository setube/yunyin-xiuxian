/* eslint-disable no-console */
/**
 * 道侣主动意图验收(Phase 34.1)
 *
 * 34.0 的链路是「世界情境 → 事件出现 → 她在事件里说话」——
 * 世界安排了两个人同时遇到某件事。
 *
 * 本轮要验证的是另一件事:**她自己产生意图,然后主动开口。**
 *
 * 真主动的判据只有一条:
 *
 *   **意图的产生与提出都不依赖世界情境。**
 *
 * 若做成「世界检测到她有个想法 → 世界找一个合适情境 → 她开口」,
 * 那看着像主动,实际仍是引擎主动。
 *
 * 五条验收:
 *   一 意图由经历催生,不由关系阈值触发
 *   二 她自己决定何时开口,不需要世界给情境位
 *   三 接受/回绝/忽略三种回应后果不同,忽略不等于回绝
 *   四 回应反过来改变她的状态
 *   五 仍不产出任何 StatMods / 资源 / 道果 / 宿慧
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INTENT_MIN_STAGE,
  SPARK_NAMES,
  SPARK_WEIGHT,
  TEMPER_RESERVE,
  intentFor,
  respondTo,
  sparkDelta,
  willSpeak,
  type BondIntent
} from '@/data/bondIntent'
import { DAOLU, daoluDef } from '@/data/daolu'
import {
  advanceBond,
  currentBond,
  meet,
  pendingIntent,
  respondIntent,
  sparkIntent,
  speakIntent
} from './daoluService'
import { usePlayerStore } from '@/stores/player'

const SERVICE = readFileSync(resolve(__dirname, 'daoluService.ts'), 'utf-8')
const CODE = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 推到同行阶(意图能出现的最低关系) */
function together(id = 'dl_qingli'): void {
  meet(id)
  advanceBond({ fate: 40, trust: 25, shared: true })
}

/** 反复经历同一件事,直到她开口或用尽次数 */
function sparkUntilSpeaks(spark: Parameters<typeof sparkIntent>[0], max = 40): number {
  for (let i = 1; i <= max; i += 1) {
    sparkIntent(spark)
    if (speakIntent()) return i
  }
  return -1
}

describe('主动意图 · 一:由经历催生,不由阈值触发', () => {
  it('催生意图的是「发生了什么」,不是「现在是什么状态」', () => {
    console.log('\n经历            推动')
    for (const [k, v] of Object.entries(SPARK_WEIGHT)) {
      console.log(`${SPARK_NAMES[k as keyof typeof SPARK_NAMES].padEnd(24)} ${v > 0 ? '+' : ''}${v}`)
    }
    // 被辜负是负推动 —— 不是「信任下降所以不触发」,是「这件事让她不想说了」
    expect(SPARK_WEIGHT.crossed).toBeLessThan(0)
  })

  it('关系值拉满但没有经历,她不会开口', () => {
    together()
    // 三维全满
    advanceBond({ fate: 100, trust: 100, accord: 100 })
    // 一次经历都没有
    expect(speakIntent()).toBeNull()
    expect(currentBond()!.intent ?? null).toBeNull()
    console.log('\n缘分/信任/契合全 100,却一句话都没有 —— 她的念头不由关系值触发')
  })

  it('关系值不高但经历够了,她会开口', () => {
    together()
    const b = currentBond()!
    console.log(`\n开口前:缘分 ${b.fate} · 信任 ${b.trust} · 契合 ${b.accord}`)
    const n = sparkUntilSpeaks('shared')
    expect(n).toBeGreaterThan(0)
    const after = currentBond()!
    // 信任仍然不高,她照样说了
    expect(after.trust).toBeLessThan(60)
    console.log(`第 ${n} 次同行之后她开了口,此时信任仍只有 ${after.trust}`)
  })

  it('被辜负会把话咽回去', () => {
    together()
    for (let i = 0; i < 6; i += 1) sparkIntent('shared')
    const before = currentBond()!.intent!.ripeness
    sparkIntent('crossed')
    const after = currentBond()!.intent!.ripeness
    expect(after).toBeLessThan(before)
    console.log(`\n酝酿 ${before.toFixed(2)} → 越线之后 ${after.toFixed(2)} —— 有些话说不出口了`)
  })

  it('性格决定她憋多久', () => {
    const rows: { name: string; temper: string; n: number }[] = []
    for (const id of ['dl_qingli', 'dl_hanzheng']) {
      setActivePinia(createPinia())
      together(id)
      const def = daoluDef(id)!
      rows.push({ name: def.name, temper: def.temper, n: sparkUntilSpeaks('shared') })
    }
    console.log('\n姓名        性格        开口所需同行次数')
    for (const r of rows) console.log(`${r.name.padEnd(10)} ${r.temper.padEnd(10)} ${r.n}`)
    // 谨慎的沈青璃比激进的韩峥憋得久
    expect(rows[0]!.n).toBeGreaterThan(rows[1]!.n)
  })

  it('关系太浅时她根本不会有这种念头', () => {
    meet('dl_qingli')
    // 只到「相识」,未到同行
    advanceBond({ fate: 15 })
    for (let i = 0; i < 20; i += 1) sparkIntent('shared')
    expect(currentBond()!.intent ?? null).toBeNull()
    console.log(`\n未到「${INTENT_MIN_STAGE}」之前,再多同行也不会说这种话`)
  })
})

describe('主动意图 · 二:她自己决定何时开口', () => {
  it('speakIntent 不接受任何情境参数', () => {
    // 与 34.0 的 offerBondEvent(trigger) 分野:那是世界安排,这是她自己
    expect(CODE).toMatch(/export function speakIntent\(\): BondIntent \| null/)
    expect(CODE).not.toMatch(/speakIntent\(\s*trigger/)
    console.log('\nspeakIntent() 无参数 —— 不需要世界递给她一个情境位')
  })

  it('提出与否只看她自己的酝酿,不看世界状态', () => {
    const def = daoluDef('dl_qingli')!
    const raw: BondIntent = {
      daoluId: def.id,
      ...intentFor(def),
      ripeness: 0,
      sparks: [],
      raised: 0,
      responses: [],
      settled: false
    }
    expect(willSpeak(raw, def.temper)).toBe(false)
    expect(willSpeak({ ...raw, ripeness: 99 }, def.temper)).toBe(true)
    // 已了结的意图不再提
    expect(willSpeak({ ...raw, ripeness: 99, settled: true }, def.temper)).toBe(false)
    console.log('\nwillSpeak 只读意图本身:酝酿够了、还没了结,就说')
  })

  it('她的意图来自 33.8 就写好的「她所求」', () => {
    console.log('\n姓名        所求                          开口时说的话')
    for (const d of DAOLU.slice(0, 4)) {
      const { wish, line } = intentFor(d)
      expect(wish).toBe(d.pursuit)
      console.log(`${d.name.padEnd(10)} ${wish.padEnd(28)} ${line}`)
    }
    console.log('\n「她所求」写在数据里一直没有机制读它 —— 现在它成了她开口的理由')
  })
})

describe('主动意图 · 三:三种回应各不相同', () => {
  it('接受 / 回绝 / 忽略的后果', () => {
    const def = daoluDef('dl_qingli')!
    const base: BondIntent = {
      daoluId: def.id,
      ...intentFor(def),
      ripeness: 2,
      sparks: [],
      raised: 1,
      responses: [],
      settled: false
    }
    console.log('\n回应    缘分  信任  契合  了结  她的反应')
    for (const r of ['accept', 'refuse', 'ignore'] as const) {
      const a = respondTo(def, base, r)
      console.log(
        `${r.padEnd(8)} ${String(a.fate).padStart(4)} ${String(a.trust).padStart(5)} ` +
          `${String(a.accord).padStart(5)}  ${a.settled ? '是' : '否'}    ${a.text.slice(0, 24)}…`
      )
    }
    const acc = respondTo(def, base, 'accept')
    const ref = respondTo(def, base, 'refuse')
    const ign = respondTo(def, base, 'ignore')
    // 三者互不相同
    expect(acc.trust).toBeGreaterThan(0)
    expect(ref.trust).toBeLessThan(0)
    expect(ign.trust).toBeLessThan(0)
    expect(ign.trust).not.toBe(ref.trust)
  })

  it('忽略不等于回绝:回绝当场更伤,忽略是慢慢凉掉', () => {
    const def = daoluDef('dl_qingli')!
    const fresh: BondIntent = {
      daoluId: def.id,
      ...intentFor(def),
      ripeness: 2,
      sparks: [],
      raised: 1,
      responses: [],
      settled: false
    }
    const firstIgnore = respondTo(def, fresh, 'ignore')
    const refuse = respondTo(def, fresh, 'refuse')
    // 第一次不作声比当面回绝伤得轻
    expect(firstIgnore.trust).toBeGreaterThan(refuse.trust)
    expect(firstIgnore.settled).toBe(false)

    // 但再三不作声,她自己去了 —— 这一下比回绝更重
    const thrice: BondIntent = { ...fresh, responses: ['ignore', 'ignore'] }
    const finalIgnore = respondTo(def, thrice, 'ignore')
    expect(finalIgnore.trust).toBeLessThan(refuse.trust)
    expect(finalIgnore.settled).toBe(true)
    console.log(
      `\n首次不作声 信任 ${firstIgnore.trust}(未了结)` +
        `\n当面回绝   信任 ${refuse.trust}(未了结,她还惦记着)` +
        `\n再三不理   信任 ${finalIgnore.trust}(已了结)——「${finalIgnore.text}」`
    )
  })

  it('被忽略过之后她更难开口', () => {
    const def = daoluDef('dl_qingli')!
    const base: BondIntent = {
      daoluId: def.id,
      ...intentFor(def),
      ripeness: TEMPER_RESERVE[def.temper],
      sparks: [],
      raised: 1,
      responses: [],
      settled: false
    }
    expect(willSpeak(base, def.temper)).toBe(true)
    // 同样的酝酿度,被忽略过一次就不够了
    expect(willSpeak({ ...base, responses: ['ignore'] }, def.temper)).toBe(false)
    console.log('\n同样的酝酿度,被忽略过一次她就不再开口 —— 说了没人应,下次更难说')
  })
})

describe('主动意图 · 四:回应反过来改变她的状态', () => {
  it('应下之后意图了结,关系推进', () => {
    together()
    sparkUntilSpeaks('omen')
    expect(pendingIntent()).not.toBeNull()
    const before = currentBond()!
    const after = respondIntent('accept')!
    const b = currentBond()!
    expect(b.intent!.settled).toBe(true)
    expect(b.trust).toBeGreaterThan(before.trust)
    expect(pendingIntent()).toBeNull()
    console.log(`\n应下之后:信任 ${before.trust} → ${b.trust},意图了结\n「${after.text}」`)
  })

  it('回绝之后意图未了,会重新酝酿', () => {
    together()
    sparkUntilSpeaks('omen')
    const ripe = currentBond()!.intent!.ripeness
    respondIntent('refuse')
    const b = currentBond()!
    expect(b.intent!.settled).toBe(false)
    // 酝酿被压下去但没归零
    expect(b.intent!.ripeness).toBeLessThan(ripe)
    expect(b.intent!.ripeness).toBeGreaterThan(0)
    console.log(`\n回绝之后:酝酿 ${ripe.toFixed(2)} → ${b.intent!.ripeness.toFixed(2)},她还惦记着`)
  })

  it('回应会记进意图,她记得你怎么对待过这件事', () => {
    together()
    sparkUntilSpeaks('omen')
    respondIntent('ignore')
    expect(currentBond()!.intent!.responses).toEqual(['ignore'])
    console.log('\n她记得你上次没接话')
  })
})

describe('主动意图 · 五:仍不进效率链', () => {
  it('意图数据层无任何属性与资源', () => {
    const data = readFileSync(resolve(__dirname, '../data/bondIntent.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(data).not.toMatch(/StatMods|cultivationSpeed|attackPct|spiritStone|daoFruit|insight/)
  })

  it('回应意图不改变任何属性、道果与宿慧', () => {
    const player = usePlayerStore()
    together()
    sparkUntilSpeaks('omen')
    const mods = JSON.stringify(player.finalStats.mods)
    const fruit = player.reincarnation.daoFruit
    const insight = player.reincarnation.insight
    respondIntent('accept')
    expect(JSON.stringify(player.finalStats.mods)).toBe(mods)
    expect(player.reincarnation.daoFruit).toBe(fruit)
    expect(player.reincarnation.insight).toBe(insight)
    console.log('\n应下她的请求,属性、道果、宿慧分毫未动')
  })
})

describe('主动意图 · 边界', () => {
  it('未遇见任何人时接口安全空转', () => {
    expect(sparkIntent('shared')).toBeNull()
    expect(speakIntent()).toBeNull()
    expect(pendingIntent()).toBeNull()
    expect(respondIntent('accept')).toBeNull()
  })

  it('她离开或陨落后不再有意图', () => {
    together()
    const b = currentBond()!
    usePlayerStore().setBond({ ...b, departed: true })
    expect(sparkIntent('shared')).toBeNull()
  })

  it('没有待回应的提议时,回应无效', () => {
    together()
    sparkIntent('shared')
    expect(respondIntent('accept')).toBeNull()
    console.log('\n她还没开口,你无从回应')
  })

  it('sparkDelta 对谨慎者放大负面、缩小正面', () => {
    const cautiousUp = sparkDelta('shared', 'cautious')
    const boldUp = sparkDelta('shared', 'bold')
    expect(cautiousUp).toBeLessThan(boldUp)
    const cautiousDown = sparkDelta('crossed', 'cautious')
    const boldDown = sparkDelta('crossed', 'bold')
    expect(cautiousDown).toBeLessThan(boldDown)
    console.log(
      `\n同行一次:谨慎 +${cautiousUp.toFixed(3)} / 激进 +${boldUp.toFixed(3)}` +
        `\n越线一次:谨慎 ${cautiousDown.toFixed(3)} / 激进 ${boldDown.toFixed(3)}`
    )
  })
})
