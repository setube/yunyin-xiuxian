/* eslint-disable no-console */
/**
 * 轮回继承审计
 *
 * 玩家反馈「轮回次数太多没有意义」。本套用例把「轮回一次后还需重新经历多少」
 * 量化成可回归的读数,并锁住当前现状——后续若要治理,这些阈值应被主动调紧。
 *
 * 判据取自一条原则:**保留「我是谁」,重置「我现在拥有多少」。**
 * 遗产(知识、认知、履历、道果)该继承;状态(境界、肉身、资源、装备)该重建。
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { usePlayerStore } from '@/stores/player'
import {
  daoFruitAfterLives,
  FRUIT_PER_LIFE,
  HERITAGE,
  heritageGroups,
  hoursToPeakAt,
  pacePerLife,
  permanentPowerMultAt,
  summarize,
  talentsAfterLives
} from './samsaraAudit'

describe('轮回审计 · 继承清单(逐条对照代码核实)', () => {
  it('当前继承全貌', () => {
    const s = summarize()
    console.log(`\n完整继承 ${s.fullCount} 项 / 部分继承 ${s.partialCount} 项 / 重置 ${s.resetCount} 项`)
    for (const r of HERITAGE) {
      const tag = r.mode === 'full' ? '继承' : r.mode === 'partial' ? '折半' : '重置'
      console.log(`  [${tag}] ${r.name}(${r.kind === 'legacy' ? '遗产' : '状态'}/战力${r.power})：${r.detail}`)
    }
  })

  it('「状态」类资产已基本重建,玩家反馈的清单与代码实际有出入', () => {
    const byId = (id: string) => HERITAGE.find(r => r.id === id)!
    // 装备、丹药、法宝、材料、区域进度都是全清,不是「继承」
    for (const id of ['equipment', 'pills', 'artifacts', 'materials', 'regions', 'realm']) {
      expect(byId(id).mode).toBe('reset')
    }
    // 洞府是外物,整座归零;功法只留门类、层数归零(仍属"半留")
    expect(byId('buildings').mode).toBe('reset')
    expect(byId('gongfa').mode).toBe('partial')
  })

  it('外物已全部归零;仍完整继承的状态类只剩荣誉/道统/世界记忆', () => {
    const s = summarize()
    const names = s.stateButFull.map(r => r.name)
    console.log(`\n属于状态却完整继承:${names.join('、')}`)
    // 灵兽/洞府/灵脉已改为归零(外物随皮囊散去)
    expect(names).not.toContain('灵兽')
    expect(names).not.toContain('洞府建筑')
    expect(names).not.toContain('灵脉投资')
    // 留下的三项各有理由:荣誉(称号)、道统(师承)、世界记忆(镇压与宿敌)
    expect(names).toContain('称号')
    expect(names).toContain('师承')
  })
})

describe('轮回审计 · 追平时间(轮回还剩多少「重新经历」)', () => {
  it('修满真仙的耗时随世数塌缩', () => {
    const rows = pacePerLife([1, 2, 3, 5, 10, 20, 50, 100])
    console.log('\n第 N 世修满真仙所需:')
    for (const r of rows) {
      console.log(
        `  第 ${String(r.life).padStart(3)} 世 · 道果 ${String(r.daoFruit).padStart(5)} · 天赋 ${String(r.talents).padStart(2)} · ` +
          `${r.hoursToPeak.toFixed(1).padStart(7)}h(第一世的 ${(r.vsFirstLife * 100).toFixed(1)}%) · 永久战力 ×${r.permanentMult.toFixed(1)}`
      )
    }
  })

  it('第二世就砍掉近半耗时,第十世只剩一成半', () => {
    // 实测:第2世 54.7%、第3世 39.3%、第10世 14.4%
    const [l2, l3, l10] = [2, 3, 10].map(n => hoursToPeakAt(n) / hoursToPeakAt(1))
    expect(l2!).toBeLessThan(0.6)
    expect(l3!).toBeLessThan(0.45)
    expect(l10!).toBeLessThan(0.2)
    console.log(`\n耗时占比:第2世 ${(l2! * 100).toFixed(1)}% / 第3世 ${(l3! * 100).toFixed(1)}% / 第10世 ${(l10! * 100).toFixed(1)}%`)
  })

  it('百世时重修一遍只需第一世的百分之二,「重新经历」名存实亡', () => {
    const ratio = hoursToPeakAt(100) / hoursToPeakAt(1)
    expect(ratio).toBeLessThan(0.03)
    console.log(`\n第100世修满真仙仅需 ${hoursToPeakAt(100).toFixed(1)}h,为第一世的 ${(ratio * 100).toFixed(1)}%`)
  })

  it('耗时单调递减且不收敛于任何下界——这是无上限累积的特征', () => {
    const lives = [1, 5, 10, 20, 50, 100, 200, 500]
    const hours = lives.map(hoursToPeakAt)
    for (let i = 1; i < hours.length; i += 1) {
      expect(hours[i]!).toBeLessThan(hours[i - 1]!)
    }
    // 若存在下界,深世之间的降幅应趋近于零;实测仍在持续下探
    const lateDrop = 1 - hours[hours.length - 1]! / hours[hours.length - 2]!
    expect(lateDrop).toBeGreaterThan(0.1)
    console.log(`\n第200→500世仍再降 ${(lateDrop * 100).toFixed(0)}%,未见收敛`)
  })
})

describe('轮回审计 · 永久乘区的累积', () => {
  it('道果是唯一无上限项:天赋会集齐封顶,道果不会', () => {
    // 天赋 33 项,约十世集齐后不再增长
    expect(talentsAfterLives(10)).toBe(talentsAfterLives(100))
    // 道果每世固定入账,永不封顶
    expect(daoFruitAfterLives(100)).toBeGreaterThan(daoFruitAfterLives(10) * 9)
    console.log(
      `\n天赋:第10世 ${talentsAfterLives(10)} 项 = 第100世 ${talentsAfterLives(100)} 项(已封顶)\n` +
        `道果:第10世 ${daoFruitAfterLives(10)} 枚 → 第100世 ${daoFruitAfterLives(100)} 枚(每世 +${FRUIT_PER_LIFE},无顶)`
    )
  })

  it('永久战力乘数随世数持续攀升,百世逾百倍', () => {
    const m10 = permanentPowerMultAt(10)
    const m100 = permanentPowerMultAt(100)
    expect(m10).toBeGreaterThan(15)
    expect(m100).toBeGreaterThan(90)
    expect(m100).toBeGreaterThan(m10 * 4)
    console.log(`\n永久战力乘数:第10世 ×${m10.toFixed(1)} → 第100世 ×${m100.toFixed(1)}`)
  })

  it('道果的软化指数压不住发散:^0.9 仍是超线性累积', () => {
    // 软化只是让斜率变缓,不改变「无界」这个性质
    const a = permanentPowerMultAt(50)
    const b = permanentPowerMultAt(500)
    expect(b).toBeGreaterThan(a * 2)
    console.log(`\n第50世 ×${a.toFixed(1)} → 第500世 ×${b.toFixed(1)}(仍在增长,无渐近上界)`)
  })
})

describe('轮回审计 · 与数值膨胀共根', () => {
  it('压缩下一世成长空间的条目集中在永久乘区与半留资产', () => {
    const s = summarize()
    const names = s.compressing.map(r => r.name)
    console.log(`\n压缩成长空间的 ${names.length} 项:${names.join('、')}`)
    // 道果、天赋、功法(门类保留)是主要压缩源;洞府已归零,不再压缩
    for (const n of ['道果', '先天之姿', '功法']) {
      expect(names).toContain(n)
    }
    expect(names).not.toContain('洞府建筑')
    expect(names).not.toContain('灵脉投资')
  })

  it('认知与成就不压缩成长空间——它们只让人「知道得更多」', () => {
    const byId = (id: string) => HERITAGE.find(r => r.id === id)!
    // 这两项是「遗产」的正例:完整继承却不侵蚀重新成长的意义
    expect(byId('lore').mode).toBe('full')
    expect(byId('lore').compressesGrowth).toBe(false)
    expect(byId('quests').mode).toBe('full')
    expect(byId('quests').compressesGrowth).toBe(false)
  })
})

describe('轮回审计 · 灵脉投资', () => {
  it('灵脉是外物:转世即清零,不再带着投满的地脉出生', () => {
    const row = HERITAGE.find(r => r.id === 'veins')!
    expect(row.mode).toBe('reset')
    expect(row.kind).toBe('state')
    expect(row.compressesGrowth).toBe(false)
    console.log(`\n灵脉:${row.detail}`)
  })

  it('跨世累积只剩有界的天赋与无界的道果两项', () => {
    // 灵脉已归零,不再是跨世累积项;天赋有界(集齐即止),道果无界
    expect(talentsAfterLives(10)).toBe(talentsAfterLives(1000))
    // 道果不然
    expect(daoFruitAfterLives(1000)).toBeGreaterThan(daoFruitAfterLives(10) * 90)
  })
})

/**
 * 继承清单的「最小完备」:凡有跨世去留的功能都要在 HERITAGE 里登记一行。
 * 这份 id 清单随功能增长 —— 新加一个会跨世的系统(或改掉一项的去留)时,
 * 必须同时回答「它跨世留不留」,而不是让它在代码里悄悄决定。
 */
describe('轮回审计 · 继承清单最小完备', () => {
  const REQUIRED = [
    'realm',
    'equipment',
    'pills',
    'artifacts',
    'materials',
    'regions',
    'buildings',
    'gongfa',
    'daoFruit',
    'talents',
    'heritage',
    'insight',
    'title',
    'pet',
    'mentor',
    'veins',
    'lore',
    'quests',
    'endgame',
    'suppress',
    'secretRealm',
    'regionEvent',
    'mortalWorld',
    'fortuneMemory',
    'bonds',
    'trial',
    'streak',
    'linggen'
  ]

  it('每一个跨世系统都在清单里有一行', () => {
    const ids = new Set(HERITAGE.map(r => r.id))
    const missing = REQUIRED.filter(id => !ids.has(id))
    expect(missing, `这些系统未登记跨世去留:${missing.join('、')}`).toEqual([])
  })

  /**
   * 上一条靠**手写清单**,所以新加的状态字段会悄悄漏过(divination / breakthroughPrep /
   * enlightenmentAt 就是这样漏了整整一轮)。这条改成从存档实际字段倒推:
   * player.$state 的每一个键,都必须能指到清单里的某一行(或登记为无需登记的例外)。
   */
  const STATE_KEY_ROWS: Record<string, string[]> = {
    age: ['realm'],
    bond: ['bonds'],
    breakthroughPrep: ['breakthroughPrep'],
    dead: ['realm'],
    divination: ['divination'],
    enlightenmentAt: ['enlightenmentAt'],
    eventChains: ['fortuneMemory'],
    exp: ['realm'],
    fortuneChoices: ['fortuneMemory'],
    lastCaveEventDay: ['streak'],
    lifespanBonusYears: ['realm'],
    linggen: ['linggen'],
    major: ['realm'],
    mentor: ['mentor'],
    name: ['name'],
    nemeses: ['suppress'],
    petId: ['pet'],
    regionEvent: ['regionEvent'],
    regionStats: ['regions'],
    regionWins: ['regions'],
    // 轮回对象是一整套(次数/道果/天赋/宿慧/履历/命题/契/道友),由下面几行共同覆盖
    reincarnation: ['reincarnationCount', 'daoFruit', 'talents', 'heritage', 'insight', 'lives', 'vow', 'trial', 'bonds'],
    secretRealm: ['secretRealm'],
    sub: ['realm'],
    suppressQualified: ['suppress'],
    suppressedRegions: ['suppress'],
    suppressedSince: ['suppress'],
    titleId: ['title'],
    winStreak: ['streak']
  }

  /** 存档里有、但确实不需要跨世登记的行(写清理由,不许留空) */
  const NO_ROW_NEEDED: Record<string, string> = {
    // 例:player.$state 里没有任何"纯运行时且无跨世意义"的字段;将来若出现,登记在此并写明理由
  }

  it('存档里的每个字段都登记了跨世去留 —— 从 $state 倒推,不靠手写清单', () => {
    setActivePinia(createPinia())
    const keys = Object.keys(usePlayerStore().$state).sort()
    expect(keys.length, '取不到 player 存档字段,断言形同虚设').toBeGreaterThan(20)
    const unmapped = keys.filter(k => !(k in STATE_KEY_ROWS) && !(k in NO_ROW_NEEDED))
    expect(
      unmapped,
      `这些存档字段没有跨世去留的结论:${unmapped.join('、')} —— 要么补 HERITAGE 一行,要么在此写明为何不用登记`
    ).toEqual([])
  })

  it('映射指向的清单行真实存在;手写清单与倒推清单不打架', () => {
    const ids = new Set(HERITAGE.map(r => r.id))
    for (const [key, rows] of Object.entries(STATE_KEY_ROWS)) {
      expect(rows.length, `${key} 没有指向任何清单行`).toBeGreaterThan(0)
      for (const id of rows) expect(ids.has(id), `${key} 指向了不存在的行 ${id}`).toBe(true)
    }
    // 手写清单里的每一行,也应至少被某个字段或另一行的 detail 用到 ——
    // 只要求"手写与倒推互相认得出来",不要求一一对应(有些行是组合概念)
    const referenced = new Set(Object.values(STATE_KEY_ROWS).flat())
    const orphanRows = HERITAGE.filter(r => !referenced.has(r.id) && !REQUIRED.includes(r.id))
    expect(orphanRows.map(r => r.id), '这些清单行既不在手写清单,也没有字段指向').toEqual([])
  })

  it('轮回结算的交割清单直接渲染这张表,不另写一份', () => {
    const src = readFileSync(resolve(__dirname, '../components/character/ReincarnationDialog.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src, '结算弹窗没有接上继承表,玩家看到的与代码交割会分叉').toContain('heritageGroups()')
  })

  it('外物一律归零:装备/法宝/丹药/材料/灵兽/洞府/灵脉/区域/本世/秘境/事件/契约', () => {
    const byId = (id: string) => HERITAGE.find(r => r.id === id)!
    for (const id of [
      'equipment',
      'artifacts',
      'pills',
      'materials',
      'regions',
      'buildings',
      'veins',
      'pet',
      'secretRealm',
      'regionEvent',
      'mortalWorld',
      'trial',
      'streak',
      'linggen'
    ]) {
      expect(byId(id).mode, `${byId(id).name} 是外物,应归零`).toBe('reset')
    }
  })

  it('记忆/精神/灵魂一律留:认知/成就/道果/天赋/宿慧/称号/师承/道痕/世界记忆/机缘记忆', () => {
    const byId = (id: string) => HERITAGE.find(r => r.id === id)!
    for (const id of ['lore', 'quests', 'daoFruit', 'talents', 'insight', 'title', 'mentor', 'fortuneMemory']) {
      expect(byId(id).mode, `${byId(id).name} 属记忆/精神/灵魂,应保留`).toBe('full')
    }
    // 功法只「半留」:门类是记忆,层数是修为进度
    expect(byId('gongfa').mode).toBe('partial')
    // 道友同理:关系归档入履历,人不留下
    expect(byId('bonds').mode).toBe('partial')
    // 终局同理:道途归还天地(本世之诺),道源与道痕随神魂不灭
    expect(byId('endgame').mode).toBe('partial')
    // 镇压同理(半留):镇压**收益**是「我拥有多少」—— 旧世压下的远境若跨世,新世按
    // 旧阶位派发高阶装备/灵石,数值爆炸;故清 suppressedRegions/suppressedSince。
    // 宿敌记忆与区域战绩(「世界记得你」的叙事)仍随神魂不灭
    expect(byId('suppress').mode, `区域${byId('suppress').name} 产出不跨世、记忆跨世`).toBe('partial')
  })

  it('结算界面按去留分组时,清单一行不漏、一行不重(界面与代码同源)', () => {
    const groups = heritageGroups()
    expect(groups.map(g => g.mode)).toEqual(['full', 'partial', 'reset'])
    const seen = groups.flatMap(g => g.rows.map(r => r.id))
    expect(seen.length, '分组后条目总数应等于清单总数').toBe(HERITAGE.length)
    expect(new Set(seen).size, '不得有条目被重复归组').toBe(HERITAGE.length)
    for (const g of groups) expect(g.title, `${g.mode} 组缺界面用语`).toBeTruthy()
  })
})
