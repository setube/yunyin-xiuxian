/* eslint-disable no-console */
/**
 * 灵根职能的三条红线(诊断见 linggenRole.spec.ts):
 *   ① 倾向不是门槛:没有该灵根,那条路照样走得通
 *   ② 解法空间不是成功率:没有对应构筑时,灵根换不来任何东西
 *   ③ 没有唯一最优灵根:多根取最大而非累加
 */
import { describe, it, expect } from 'vitest'
import type { ElementId, StatMods } from '@/types'
import { RandomService, mulberry32 } from '@/utils/random'
import { ELEMENT_AFFINITY, NO_RELIEF } from '@/data/linggenAffinity'
import { TRIBULATIONS, tribulationDef, type TribulationKind } from '@/data/tribulations'
import { GONGFA } from '@/data/gongfa'
import { FORTUNE_EVENTS } from '@/data/events'
import { ELEMENTS } from '@/data/linggen'
import { qualityDef } from '@/data/qualities'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { gongfaAffinity, fortuneAffinity, tribulationRelief, reliefKinds, reliefFelt, reliefElements, rootElements } from './linggenAffinity'
import {
  buildTribulationPlan,
  traceTribulation,
  waveMultiplier,
  tribulationWaves,
  effectiveBurstTier,
  guardScore,
  sustainScore,
  resistScore
} from './tribulationDecision'

const ALL_ELEMENTS = Object.keys(ELEMENT_AFFINITY) as ElementId[]

/** 复现 gongfaService 的参悟权重(须与实现同式) */
function gongfaWeight(quality: string, element: ElementId | undefined, elements: readonly ElementId[]): number {
  return (100 / (1 + qualityDef(quality as never).rank * 1.5)) * gongfaAffinity(element, elements)
}

/** 按灵根抽 n 次功法,返回各功法命中次数 */
function drawGongfa(elements: readonly ElementId[], n: number, seed: number): Map<string, number> {
  const rng = new RandomService(mulberry32(seed))
  const hits = new Map<string, number>()
  for (let i = 0; i < n; i += 1) {
    const picked = rng.weighted(GONGFA, g => gongfaWeight(g.quality, g.element, elements))
    hits.set(picked.id, (hits.get(picked.id) ?? 0) + 1)
  }
  return hits
}

/** 某元素功法在 n 次参悟中的命中率 */
function elementShare(elements: readonly ElementId[], target: ElementId, n: number, seed: number): number {
  const hits = drawGongfa(elements, n, seed)
  const ids = GONGFA.filter(g => g.element === target).map(g => g.id)
  return ids.reduce((s, id) => s + (hits.get(id) ?? 0), 0) / n
}

describe('灵根职能重构 ① 倾向不是门槛', () => {
  it('同源功法更容易参悟到,但无此灵根者照样拿得到', () => {
    const N = 20000
    console.log('\n  金系功法在 20000 次参悟中的命中率:')
    const withMetal = elementShare(['metal'], 'metal', N, 0x9017)
    const without = elementShare(['wood'], 'metal', N, 0x9017)
    const noRoot = elementShare([], 'metal', N, 0x9017)
    console.log(`    金灵根   ${(withMetal * 100).toFixed(2)}%`)
    console.log(`    木灵根   ${(without * 100).toFixed(2)}%`)
    console.log(`    无灵根   ${(noRoot * 100).toFixed(2)}%`)
    console.log(`    → 倾向倍率 ${(withMetal / without).toFixed(2)}x,而非同源者仍有 ${(without * 100).toFixed(2)}% 的路`)

    expect(withMetal, '同源功法未获得偏向,接线失败').toBeGreaterThan(without * 1.5)
    expect(without, '无同源灵根者拿不到该元素功法,倾向已退化为门槛').toBeGreaterThan(0)
    expect(noRoot, '无灵根者被排除,倾向已退化为门槛').toBeGreaterThan(0)
  })

  it('同源加权不会吃掉功法池:非同源功法仍占绝大多数', () => {
    const hits = drawGongfa(['metal'], 40000, 0x5eed)
    const metalIds = new Set(GONGFA.filter(g => g.element === 'metal').map(g => g.id))
    let metalHits = 0
    for (const [id, n] of hits) if (metalIds.has(id)) metalHits += n
    const share = metalHits / 40000
    console.log(`\n  金灵根参悟 40000 次:金系功法占 ${(share * 100).toFixed(1)}%,其余 ${((1 - share) * 100).toFixed(1)}%`)
    console.log(`  参悟到的功法种类:${hits.size}/${GONGFA.length}`)

    expect(share, '同源功法占了大头,灵根从倾向变成了发牌').toBeLessThan(0.35)
    expect(hits.size, '有功法完全抽不到,池子被灵根切断').toBe(GONGFA.length)
  })

  it('机缘偏向同样只是加权:中性机缘对所有灵根一视同仁', () => {
    const withElement = FORTUNE_EVENTS.filter(ev => ev.element)
    const neutral = FORTUNE_EVENTS.filter(ev => !ev.element)
    console.log(`\n  机缘 ${FORTUNE_EVENTS.length} 条:带元素 ${withElement.length}、中性 ${neutral.length}`)
    for (const ev of FORTUNE_EVENTS) {
      const tag = ev.element ? `${ELEMENTS[ev.element].name}系` : '中性  '
      console.log(`    ${tag}  ${ev.title}`)
    }

    expect(neutral.length, '所有机缘都带元素,灵根已从倾向变成职业分配').toBeGreaterThan(0)
    expect(withElement.length, '没有任何机缘带元素,机缘接线未生效').toBeGreaterThan(0)
    for (const el of ALL_ELEMENTS) {
      for (const ev of neutral) expect(fortuneAffinity(ev.element, [el])).toBe(1)
    }
  })
})

describe('灵根职能重构 ② 解法空间不是成功率', () => {
  it('红线:白板构筑不会因为灵根而活下来', () => {
    const bare: StatMods = {}
    console.log('\n  白板构筑(无任何词条)在各劫型下,11 种灵根逐一试渡:')
    for (const def of TRIBULATIONS) {
      const base = buildTribulationPlan(3, bare, def.id, NO_RELIEF)
      expect(base.verdict, `${def.name}劫:白板构筑本应必死,基线已失真`).toBe('danger')
      for (const el of ALL_ELEMENTS) {
        const relief = tribulationRelief([el], def.id)
        if (!reliefFelt(relief)) continue
        const withLg = buildTribulationPlan(3, bare, def.id, relief)
        expect(traceTribulation(def, bare, 3, relief).survived, `${def.name}劫 × ${ELEMENTS[el].name}灵根:白板构筑凭空渡过`).toBe(false)
        expect(withLg.verdict, `${def.name}劫 × ${ELEMENTS[el].name}灵根:白板构筑的决策档被灵根抬高`).toBe(base.verdict)
      }
      console.log(`    ${def.name}:全灭,决策档恒为「${base.verdict}」`)
    }
    console.log('  → 手里没牌时,灵根不发牌')
  })

  it('红线:词条型通道在零词条下逐位归零', () => {
    // 五条通道里有四条乘在玩家自己的词条上;frontLoadEase 改的是劫的形状,守恒见「重压劫总量守恒」用例
    const bare: StatMods = {}
    console.log('\n  白板构筑的四维度量,有灵根 vs 无灵根:')
    for (const def of TRIBULATIONS) {
      for (const el of ALL_ELEMENTS) {
        const relief = tribulationRelief([el], def.id)
        if (!reliefFelt(relief)) continue
        const tag = `${def.name}劫 × ${ELEMENTS[el].name}灵根`
        expect(guardScore(bare, def, relief), `${tag}:无护盾却凭空得到护持`).toBe(guardScore(bare, def, NO_RELIEF))
        expect(sustainScore(bare, def, relief), `${tag}:无恢复却凭空得到续航`).toBe(sustainScore(bare, def, NO_RELIEF))
        expect(resistScore(bare, relief), `${tag}:无减伤却凭空得到抗性`).toBe(resistScore(bare, NO_RELIEF))
        expect(effectiveBurstTier(bare, relief), `${tag}:无攻势却凭空得到爆发档`).toBe(effectiveBurstTier(bare, NO_RELIEF))
      }
    }
    console.log('    护持 / 恢复 / 抗性 / 爆发 —— 55 组劫型×灵根组合,无一位发生变化')
    console.log('  → 灵根乘的是你自己的词条,乘零仍是零')
  })

  it('卸力会让必死者多撑一波,但撑得再久也还是死', () => {
    // frontLoadEase 总量守恒,却不保证"死亡波次"守恒:起手轻了,垂死者能多挨一轮
    const bare: StatMods = {}
    const def = tribulationDef('heavyrush')
    const base = traceTribulation(def, bare, 3, NO_RELIEF)
    const wind = traceTribulation(def, bare, 3, tribulationRelief(['wind'], 'heavyrush'))
    console.log(`\n  白板构筑赴重压劫:无灵根坠于第 ${base.fellAt} 波,风灵根坠于第 ${wind.fellAt} 波`)
    console.log('  → 起手卸力买到的是时间,不是生路;生路要用续航词条自己换')
    expect(base.survived).toBe(false)
    expect(wind.survived, '卸力让白板构筑渡过了重压劫,总量守恒已失效').toBe(false)
    expect(wind.fellAt, '卸力未改变任何东西,波形接线是死的').toBeGreaterThanOrEqual(base.fellAt)
  })

  it('卸力是把伤害挪到后面,不是削掉:重压劫总量守恒', () => {
    const def = tribulationDef('heavyrush')
    const waves = tribulationWaves(3)
    const sum = (relief: typeof NO_RELIEF): number => {
      let t = 0
      for (let w = 1; w <= waves; w += 1) t += waveMultiplier(def, w, waves, relief)
      return t
    }
    const bare = sum(NO_RELIEF)
    const water = sum(tribulationRelief(['water'], 'heavyrush'))
    const wind = sum(tribulationRelief(['wind'], 'heavyrush'))
    console.log(`\n  重压劫 ${waves} 波波形倍率总和:`)
    console.log(`    无灵根 ${bare.toFixed(4)} · 水灵根 ${water.toFixed(4)} · 风灵根 ${wind.toFixed(4)}`)
    const shape = (relief: typeof NO_RELIEF): string =>
      Array.from({ length: waves }, (_, i) => waveMultiplier(def, i + 1, waves, relief).toFixed(2)).join(' ')
    console.log(`    无灵根波形 ${shape(NO_RELIEF)}`)
    console.log(`    风灵根波形 ${shape(tribulationRelief(['wind'], 'heavyrush'))}`)
    console.log('    → 起手变轻、后段变重,总量不变:改的是"要求你怎么活",不是"少挨多少打"')

    expect(water, '水灵根削减了重压劫总伤害,卸力已变质为减伤').toBeCloseTo(bare, 6)
    expect(wind, '风灵根削减了重压劫总伤害,卸力已变质为减伤').toBeCloseTo(bare, 6)
    expect(waveMultiplier(def, 1, waves, tribulationRelief(['wind'], 'heavyrush'))).toBeLessThan(waveMultiplier(def, 1, waves, NO_RELIEF))
  })

  it('爆发加档推不动零:无攻势者拿不到裂魂减免', () => {
    const fire = tribulationRelief(['fire'], 'soulrend')
    console.log('\n  裂魂劫爆发档(火灵根 +1 档):')
    for (const critRate of [0, 0.1, 0.2, 0.4, 0.6]) {
      const base = effectiveBurstTier({ critRate }, NO_RELIEF)
      const lifted = effectiveBurstTier({ critRate }, fire)
      console.log(`    暴击 ${(critRate * 100).toFixed(0).padStart(2)}%  基线 ${base} 档 → 火灵根 ${lifted} 档`)
      if (base === 0) expect(lifted, '零爆发构筑被灵根白送了一档,这是无条件减伤').toBe(0)
      else expect(lifted).toBe(Math.min(3, base + 1))
    }
  })

  it('灵根改变的是"谁能渡过",不是"渡过的概率"', () => {
    console.log('\n  可渡劫型数(共 5 种)· 目标境界 2:')
    console.log('  流派      无灵根   最佳灵根(哪一种)')
    let widened = 0
    let unchanged = 0
    for (const profile of BUILD_PROFILES) {
      const mods = buildSnap(profile).mods
      const solvable = (elements: ElementId[]): TribulationKind[] =>
        TRIBULATIONS.filter(def => traceTribulation(def, mods, 2, tribulationRelief(elements, def.id)).survived).map(d => d.id)
      const base = solvable([])
      let bestEl: ElementId = 'metal'
      let best = base
      for (const el of ALL_ELEMENTS) {
        const ks = solvable([el])
        if (ks.length > best.length) {
          best = ks
          bestEl = el
        }
      }
      const gain = best.length - base.length
      if (gain > 0) widened += 1
      else unchanged += 1
      console.log(`  ${profile.name}    ${base.length}/5      ${best.length}/5 ${gain > 0 ? `(${ELEMENTS[bestEl].name})` : '(无灵根能拓宽)'}`)
    }
    console.log(`  → ${widened} 个流派的窗口被某种灵根拓宽,${unchanged} 个不受任何灵根影响`)
    console.log('    灵根不是万能钥匙:它只在你已经走在那条路上时才打开门')

    expect(widened, '没有任何流派因灵根拓宽窗口,天劫接线未生效').toBeGreaterThan(0)
    expect(unchanged, '所有流派都因灵根获益,这已是变相的全局成功率加成').toBeGreaterThan(0)
  })
})

describe('灵根职能重构 ③ 没有唯一最优灵根', () => {
  it('多根逐项取最大而非累加:五杂灵根不是超级解', () => {
    const five: ElementId[] = ['metal', 'wood', 'water', 'fire', 'earth']
    console.log('\n  五杂灵根 vs 单根,在各自对口劫型下的通道深度:')
    for (const el of five) {
      const kind = ELEMENT_AFFINITY[el].kind!
      const single = tribulationRelief([el], kind)
      const multi = tribulationRelief(five, kind)
      const key = (Object.keys(single) as (keyof typeof single)[]).find(k => single[k] > 0)!
      console.log(`    ${ELEMENTS[el].name}(${tribulationDef(kind).name}劫)  单根 ${single[key]} · 五杂 ${multi[key]}`)
      expect(multi[key], '多根在单一劫型上叠出了更深的通道,五杂将成为唯一最优').toBeLessThanOrEqual(single[key])
    }
    expect(reliefKinds(five).length).toBeGreaterThan(reliefKinds(['metal']).length)
    console.log(`  → 五杂覆盖 ${reliefKinds(five).length}/5 种劫型,单根只覆盖 ${reliefKinds(['metal']).length}/5`)
    console.log('    多根买广度、单根买深度,而根数越多 growthMult 越低——取舍成立')
  })

  it('每种劫型都有多种灵根可解,每种灵根也不止一种劫可赴', () => {
    const byKind = new Map<TribulationKind, ElementId[]>()
    for (const def of TRIBULATIONS) {
      byKind.set(
        def.id,
        ALL_ELEMENTS.filter(el => reliefFelt(tribulationRelief([el], def.id)))
      )
    }
    console.log('\n  劫型 → 可解灵根:')
    for (const [kind, els] of byKind) {
      console.log(`    ${tribulationDef(kind).name}  ${els.map(e => ELEMENTS[e].name).join('、')}`)
      expect(els.length, `${tribulationDef(kind).name}劫的可解灵根过少,该劫会退化为灵根检定`).toBeGreaterThanOrEqual(2)
    }
  })

  it('混沌灵根通吃五劫,但每条通道都浅于专精单根', () => {
    const chaosKinds = reliefKinds(['chaos'])
    expect(chaosKinds.length).toBe(TRIBULATIONS.length)
    console.log('\n  混沌灵根:五劫皆有一线生机,但每条都不如专精者深')
    for (const def of TRIBULATIONS) {
      const chaos = tribulationRelief(['chaos'], def.id)
      const specialists = ALL_ELEMENTS.filter(el => el !== 'chaos' && ELEMENT_AFFINITY[el].kind === def.id)
      for (const el of specialists) {
        const spec = tribulationRelief([el], def.id)
        const key = (Object.keys(spec) as (keyof typeof spec)[]).find(k => spec[k] > 0)!
        if (key === 'burstTierBonus') continue // 星级为整档,无法再细分深浅
        expect(chaos[key], `混沌在${tribulationDef(def.id).name}劫不浅于${ELEMENTS[el].name}灵根,专精失去意义`).toBeLessThan(spec[key])
      }
      console.log(`    ${def.name}:混沌有通道,专精者更深`)
    }
  })
})

describe('灵根职能重构 ④ 红线自检(结构性防回归)', () => {
  it('灵根亲和表里没有任何修炼速度字段', () => {
    // 修炼倍率会被道果碾平(见 linggenRole.spec.ts ②)
    const fields = new Set<string>()
    for (const aff of Object.values(ELEMENT_AFFINITY)) {
      for (const k of Object.keys(aff)) fields.add(k)
      for (const k of Object.keys(aff.relief)) fields.add(k)
    }
    const banned = [...fields].filter(f => /cult|speed|exp|growth|rate/i.test(f))
    console.log(`\n  亲和表字段:[${[...fields].join(', ')}]`)
    console.log(`  触碰红线的字段:${banned.length === 0 ? '无' : banned.join(', ')}`)
    expect(banned, '亲和表出现了修炼速度/成功率字段,灵根正在退回加法池').toEqual([])
  })

  it('灵根不直接改动天劫成功率:所有通道都乘在玩家自己的词条上', () => {
    const carriers: Record<string, string> = {
      shieldRestore: 'shieldOnStart(护盾词条)',
      healRestore: 'regenPerRound / lifesteal(恢复词条)',
      frontLoadEase: '波形分布(总量守恒)',
      burstTierBonus: 'critRate / damageBonus(爆发词条,且推不动零)',
      reductionToResist: 'damageReduction(减伤词条)'
    }
    console.log('\n  五条通道的载体:')
    for (const [k, v] of Object.entries(carriers)) console.log(`    ${k.padEnd(18)} → ${v}`)
    console.log('  没有一条直接加在成功率上——这正是 Phase 32.0 拆掉单指标优化后必须守住的边界')
    expect(Object.keys(carriers).sort()).toEqual(Object.keys(NO_RELIEF).sort())
  })

  it('rootElements 去重且容错:空灵根不会让任何接线崩掉', () => {
    expect(rootElements(undefined)).toEqual([])
    expect(rootElements([])).toEqual([])
    expect(rootElements([{ element: 'metal', aptitude: 80 }, { element: 'metal', aptitude: 60 }])).toEqual(['metal'])
    expect(gongfaAffinity(undefined, ['metal'])).toBe(1)
    expect(fortuneAffinity(undefined, [])).toBe(1)
    for (const def of TRIBULATIONS) expect(tribulationRelief([], def.id)).toEqual(NO_RELIEF)
  })

  it('界面说的「灵根相应」与结算真给的一致:reliefElements 恰好是 relief 非空的那几根', () => {
    // 天劫预览打出的「灵根相应:X、Y」须与结算同源
    const all = Object.keys(ELEMENT_AFFINITY) as ElementId[]
    let claimed = 0
    let mismatched = 0
    for (const def of TRIBULATIONS) {
      const listed = reliefElements(all, def.id)
      claimed += listed.length
      for (const el of all) {
        const saysYes = listed.includes(el)
        const reallyGets = reliefFelt(tribulationRelief([el], def.id))
        if (saysYes !== reallyGets) mismatched += 1
      }
      expect(tribulationRelief(all, def.id), `${def.name}:列出的灵根合并后与全根 relief 不符`).toEqual(
        tribulationRelief(listed, def.id)
      )
    }
    console.log(`\n  五劫 × ${all.length} 元素:共列出 ${claimed} 条「相应」,口径分歧 ${mismatched} 处`)
    expect(mismatched, '界面标注与结算 relief 出现分歧').toBe(0)

    expect(reliefElements([], 'thunder')).toEqual([])
    for (const def of TRIBULATIONS) {
      for (const el of reliefElements(all, def.id)) {
        expect(reliefFelt(tribulationRelief([el], def.id)), `${ELEMENTS[el].name}被列出却拿不到任何通道`).toBe(true)
      }
    }
  })
  /*
   * `relief.frontLoadEase` 是缓解系数,数学上限定在 [0,1]。
   * 缺了 `Math.max(0, ...)`,负值会让 `cut` 变成负数 —— 重压波比不缓解还重
   * (实测 ease=-1 时第一波从 1.70 涨到 2.40)。这里钉住「负值等同于不缓解」。
   */
  it('负的 frontLoadEase 不得把重压变得更重', () => {
    const def = TRIBULATIONS.find(d => d.waveShape === 'frontLoaded')!
    const waves = 6
    const bare = waveMultiplier(def, 1, waves, NO_RELIEF)
    const negative = waveMultiplier(def, 1, waves, { ...NO_RELIEF, frontLoadEase: -1 })
    console.log(`    无缓解 ${bare.toFixed(4)} | 负缓解 ${negative.toFixed(4)}`)
    expect(negative, '负缓解不得让第一波重于无缓解').toBeLessThanOrEqual(bare + 1e-9)
  })

})
