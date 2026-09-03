/* eslint-disable no-console */
/**
 * 浅轮回收益面审计
 *
 * 要回答的问题:**金丹轮回一世,到底能永久推进哪些东西?**
 *
 * 判据:
 *   若只有道果 → 健康,玩家在「刷资源」与「探索内容」之间做选择
 *   若还能大量推进其他永久资产 → 收益面过宽,这才是
 *     「反复轮回却觉得没意义」的真正来源:什么都在涨,却没一样非深修不可
 */
import { describe, expect, it } from 'vitest'
import { SHALLOW_GAINS, summarizeShallow } from './shallowRebirthGains'
import { qualifiedRewards } from './contentGateAudit'

describe('浅轮回收益 · 金丹一世能推进什么', () => {
  it('永久收益清单', () => {
    const KIND = { unbounded: '无上限', capped: '有上限', onetime: '一次性', gated: '够不着' }
    console.log('\n金丹轮回一世的永久收益:')
    console.log('资产                性质    每世推进        上限')
    for (const g of SHALLOW_GAINS) {
      console.log(
        `${g.name.padEnd(20)} ${KIND[g.kind].padEnd(7)} ${g.perLife.padEnd(14)} ` +
          `${g.cap === null ? '无' : String(g.cap)}${g.livesToCap ? `(约${g.livesToCap}世满)` : ''}`
      )
    }
    for (const g of SHALLOW_GAINS) console.log(`  · ${g.name}:${g.evidence}`)
  })

  it('收益面确实过宽:金丹轮回能推进七项永久资产,不止道果', () => {
    const s = summarizeShallow()
    console.log(
      `\n可推进 ${s.progressable} 项(无上限 ${s.unbounded.length} + 有上限 ${s.capped.length})、` +
        `一次性 ${s.onetime.length} 项、够不着 ${s.gated.length} 项`
    )
    // 判据里的「健康」情形是只有道果;实测远不止
    expect(s.progressable).toBeGreaterThan(1)
    expect(s.unbounded.map(g => g.name)).toContain('道果')
  })

  it('两项无上限:道果与宿慧——宿慧此前一直被当成有界项', () => {
    const s = summarizeShallow()
    expect(s.unbounded).toHaveLength(2)
    const names = s.unbounded.map(g => g.name)
    expect(names).toContain('道果')
    expect(names).toContain('宿慧')
    console.log(`\n无上限项:${names.join('、')}——金丹每世都在推,永远不会到头`)
  })

  it('五项有上限,但都能靠浅轮回刷满,不需要深修一次', () => {
    const s = summarizeShallow()
    const names = s.capped.map(g => g.name)
    expect(names).toContain('先天之姿')
    expect(names).toContain('灵脉')
    expect(names).toContain('灵兽')
    expect(names).toContain('认知(材料/丹方/敌手/技艺)')
    expect(names).toContain('成就与图鉴')
    console.log(`\n有上限但浅轮回可刷满:${names.join('、')}`)
  })
})

describe('浅轮回收益 · 与深修的对照', () => {
  it('深修独有的只剩「高阶知识 + 天界」,其余全在浅轮回覆盖范围内', () => {
    // contentGateAudit 认定的四类合格回报
    const deep = qualifiedRewards().map(g => g.name)
    // 而浅轮回能推进的清单里已包含「认知」——两者在低阶部分重叠
    const shallowLore = SHALLOW_GAINS.find(g => g.id === 'lore')!
    expect(shallowLore.kind).toBe('capped')
    console.log(
      `\n深修独有:${deep.join('、')}\n` +
        `但认知的**低阶部分**浅轮回照样在推(${shallowLore.evidence.split(';')[0]})——` +
        `深修只在高阶段落才独有`
    )
  })

  it('诊断:什么都在涨,才是「反复轮回没意义」的来源', () => {
    const s = summarizeShallow()
    // 玩家金丹刷一世,道果、宿慧、天赋、灵脉、灵兽、认知、成就同时前进。
    // 没有任何一样是「非深修不可」,于是深修在体感上从未成为必需——
    // 而所有东西又都在缓慢前进,于是每一世都不特别
    expect(s.progressable).toBeGreaterThanOrEqual(7)
    console.log(
      `\n金丹一世同时推进 ${s.progressable} 项永久资产。没有一样非深修不可,` +
        `\n于是「深修」从未成为必需,而每一世又都在缓慢前进——` +
        `\n轮回因此既停不下来,也没有哪一次显得重要`
    )
  })

  it('真实存档印证:十七世即天赋满、成就 48/50,收益面确实吃得很快', () => {
    // saveCalibration 的样本:小黄鸭 18 世 / 天赋 33 满 / 成就 48
    const talents = SHALLOW_GAINS.find(g => g.id === 'talents')!
    expect(talents.livesToCap).toBeLessThanOrEqual(17)
    console.log(`\n天赋约 ${talents.livesToCap} 世集满,与真实存档(17 世 33 项)吻合`)
  })
})

describe('浅轮回收益 · 可动的地方', () => {
  it('宿慧是意外发现的第二个无界项', () => {
    // 此前 samsaraAudit 只把道果列为无界。宿慧同样每世线性入账且无上限,
    // 虽不直接给战力(它决定阶位),但决定功法保留档与认知补齐量,
    // 因此同样是「浅轮回永远有正收益」的来源之一
    const insight = SHALLOW_GAINS.find(g => g.id === 'insight')!
    expect(insight.kind).toBe('unbounded')
    expect(insight.perLife).toContain('+6')
  })

  it('师承是唯一真正的一次性资产——可作为设计参照', () => {
    // adoptMentor 的 `if (mentor.value !== null) return` 是全项目唯一
    // 「拿一次就锁死」的写法。若要给深修配可重复回报,这是反例;
    // 若要给浅轮回收窄收益面,这是正例
    const mentor = SHALLOW_GAINS.find(g => g.id === 'mentor')!
    expect(mentor.kind).toBe('onetime')
    const others = SHALLOW_GAINS.filter(g => g.kind === 'onetime')
    expect(others).toHaveLength(1)
  })
})
