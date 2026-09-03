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
import {
  veinCultBonusAt,
  daoFruitAfterLives,
  FRUIT_PER_LIFE,
  HERITAGE,
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
    // 洞府与功法是折半,不是原样带走
    expect(byId('buildings').mode).toBe('partial')
    expect(byId('gongfa').mode).toBe('partial')
  })

  it('仍有「状态」类资产被完整继承——违反「重置我拥有多少」', () => {
    const s = summarize()
    const names = s.stateButFull.map(r => r.name)
    console.log(`\n属于状态却完整继承:${names.join('、')}`)
    // 称号、灵兽、师承的 mods 直接带入下一世;rebirth() 未重置这三项
    expect(names).toContain('称号')
    expect(names).toContain('灵兽')
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
    // 道果、天赋、功法、洞府是主要压缩源
    for (const n of ['道果', '先天之姿', '功法', '洞府建筑']) {
      expect(names).toContain(n)
    }
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
  it('灵脉完全不重置,第二世起就带着投满的地脉出生', () => {
    const row = HERITAGE.find(r => r.id === 'veins')!
    expect(row.mode).toBe('full')
    // 属于「状态」类(我拥有多少)却完整继承,与称号/灵兽/师承同一性质
    expect(row.kind).toBe('state')
    expect(row.compressesGrowth).toBe(true)
    console.log(`\n灵脉:${row.detail}`)
  })

  it('灵脉是有界项:满投即封顶,不同于道果的无界累积', () => {
    // 第 2 世就能吃满,之后不再增长
    expect(veinCultBonusAt(2)).toBe(veinCultBonusAt(100))
    expect(veinCultBonusAt(0)).toBe(0)
    console.log(`\n灵脉修速加成 +${(veinCultBonusAt(2) * 100).toFixed(0)}%(第2世即封顶,与第100世相同)`)
  })

  it('灵脉与天赋同为有界项,道果是唯一无界的那个', () => {
    const bounded = [veinCultBonusAt(10) === veinCultBonusAt(1000), talentsAfterLives(10) === talentsAfterLives(1000)]
    expect(bounded).toEqual([true, true])
    // 道果不然
    expect(daoFruitAfterLives(1000)).toBeGreaterThan(daoFruitAfterLives(10) * 90)
  })
})
