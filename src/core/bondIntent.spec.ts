/* eslint-disable no-console */
/** 道侣主动意图验收。判据:意图的产生与提出都不依赖世界情境 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INTENT_MIN_STAGE,
  RESPONSE_NAMES,
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
    expect(SPARK_WEIGHT.crossed).toBeLessThan(0)
  })

  it('关系值拉满但没有经历,她不会开口', () => {
    together()
    advanceBond({ fate: 100, trust: 100, accord: 100 })
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

  /**
   * 连续越线不许把 ripeness 压成负数。
   *
   * `sparkDelta('crossed', ...)` 是**真的负数**(谨慎 -0.405 / 激进 -0.225),所以
   * `sparkIntent` 里那句 `Math.max(0, cur.ripeness + sparkDelta(...))` 不是防将来的兜底 ——
   * 它每越线一次就真的在钳。上面那条用例只测了「越线后变小」,没测「不会变负」:
   * 从 ripeness 0 连越五次,不钳就是 -2.025,而 `willSpeak` 拿它跟门槛比、界面也有读数。
   */
  it('连着越线:ripeness 一路钳在 0,不会掉成负数', () => {
    together()
    for (let i = 0; i < 6; i += 1) {
      sparkIntent('crossed')
      const cur = currentBond()!.intent!.ripeness
      expect(cur, `第 ${i + 1} 次越线后 ripeness 变成了 ${cur} —— 钳制没了`).toBeGreaterThanOrEqual(0)
    }
    // 同期再同行:从 0 往上累加,不该带上之前的负账
    sparkIntent('shared')
    expect(currentBond()!.intent!.ripeness, '负账不该拖着,同行该从 0 起算').toBeGreaterThan(0)
  })

  it('sparks 只记「发生过哪些类型」:重复的同行不去重会攒出存档膨胀', () => {
    together()
    for (let i = 0; i < 3; i += 1) sparkIntent('shared')
    // 历练每 6% 一战推一次 'shared'
    expect(currentBond()!.intent!.sparks, '同一经历只记一次').toEqual(['shared'])
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
    expect(firstIgnore.trust).toBeGreaterThan(refuse.trust)
    expect(firstIgnore.settled).toBe(false)

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

  /**
   * speakIntent 由 maybeEncounter 在每一场战斗里调用(历练战斗间隔 12 秒),willSpeak 只看酝酿度:
   * 少了「还在等回应」这一问,同一句话会每十几秒弹一次、raised 一路涨。
   */
  it('她还在等回应时,不会重复开口(同一提议只弹一次)', () => {
    together()
    expect(sparkUntilSpeaks('omen')).toBeGreaterThan(0)
    const first = currentBond()!.intent!
    expect(pendingIntent(), '开口之后应当在等她回应').not.toBeNull()

    for (let i = 0; i < 5; i += 1) expect(speakIntent()).toBeNull()
    expect(currentBond()!.intent!.raised, '重复询问不该再涨「已开口」次数').toBe(first.raised)
    expect(currentBond()!.intent!.wish).toBe(first.wish)
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

/** 钉住:历次回应(intent.responses)展示层有读取 */
describe('主动意图 · 回应有记录', () => {
  it('三种回应都有名字,且取自同一份数据', () => {
    expect(Object.keys(RESPONSE_NAMES).sort()).toEqual(['accept', 'ignore', 'refuse'])
    for (const v of Object.values(RESPONSE_NAMES)) expect(v.length).toBeGreaterThan(0)
  })

  it('回应记进 intent.responses,可被展示层读到', () => {
    together()
    sparkUntilSpeaks('omen')
    respondIntent('ignore')
    const b = currentBond()!
    expect(b.intent?.responses).toEqual(['ignore'])
  })

  it('人物页把历次回应摆出来,不是只在注释里承诺', () => {
    // 判据随道侣弹窗本体走
    const src = readFileSync(resolve(__dirname, '../components/character/BondDialog.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    // 只认使用形态:import 那一行不算接线
    expect(src).toContain('RESPONSE_NAMES[')
    expect(src).toContain('intent?.responses')
  })
})
