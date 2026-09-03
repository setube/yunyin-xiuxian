/* eslint-disable no-console */
/**
 * 内容可达性审计
 *
 * 深修补偿审计证明:可折算的第二回报走不通(A 案造新膨胀、B 案需 168 倍补偿)。
 * 于是深修回报的成立条件只剩一条——**金丹路线拿不到,或拿不到同等的**。
 *
 * 本套用例逐类核实门槛真伪,防止把「看着像深修专属、实际金丹刷得到」的东西
 * 包装成深修回报——那只是换一种方式制造假选择。
 *
 * 关键前提:认知层(丹方掌握度、材料药性、器纹、敌手路数)与成就图鉴
 * **完全跨世保留**。所以境界门槛是**一次性**的:跨过一次就永久记在账上,
 * 此后无限轮回都还在。
 */
import { describe, expect, it } from 'vitest'
import { CONTENT_GATES, disqualified, qualifiedRewards, reachabilityTable } from './contentGateAudit'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { MAX_MAJOR } from '@/data/realms'

const NAMES = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '真仙']

describe('内容可达性 · 门槛全貌', () => {
  it('逐类内容的真实门槛与金丹可达度', () => {
    console.log(`\n轮回门槛 = ${NAMES[MANUAL_REBIRTH_MIN_MAJOR]}(major ${MANUAL_REBIRTH_MIN_MAJOR})`)
    console.log('内容            门槛性质  最低境界  金丹可达  深修专属  可作独有回报')
    for (const r of reachabilityTable()) {
      const g = r.gate
      const share = r.goldShare === null ? '   —' : `${(r.goldShare * 100).toFixed(0)}%`.padStart(5)
      const deep = r.deepOnly === null ? '  —' : String(r.deepOnly).padStart(4)
      console.log(
        `${g.name.padEnd(12)} ${g.kind.padEnd(8)} ${(g.minMajor > 0 ? NAMES[g.minMajor]! : '无').padStart(6)} ` +
          `${share} ${deep}      ${g.qualifies ? '是' : '否'}`
      )
    }
  })

  it('门槛分三种性质,不可混为一谈', () => {
    const kinds = new Set(CONTENT_GATES.map(g => g.kind))
    // 获得门槛(拿不到)、触发门槛(事件不出现)、无门槛——本项目暂无「使用门槛」
    expect(kinds.has('acquire')).toBe(true)
    expect(kinds.has('trigger')).toBe(true)
    expect(kinds.has('none')).toBe(true)
  })
})

describe('内容可达性 · 被证伪的候选', () => {
  it('灵兽:无任何境界门槛,金丹前就能集齐', () => {
    const pet = CONTENT_GATES.find(g => g.id === 'pet')!
    expect(pet.kind).toBe('none')
    expect(pet.reachableByGoldRebirth).toBe(true)
    expect(pet.qualifies).toBe(false)
    console.log(`\n灵兽:${pet.evidence}`)
  })

  it('师承:同样无门槛,且跨世保留——第一世拜完就永久有了', () => {
    const mentor = CONTENT_GATES.find(g => g.id === 'mentor')!
    expect(mentor.kind).toBe('none')
    expect(mentor.reachableByGoldRebirth).toBe(true)
    expect(mentor.qualifies).toBe(false)
    console.log(`\n师承:${mentor.evidence}`)
  })

  it('奇遇事件:51 个里只有 2 个带门槛,不足以支撑一条路线', () => {
    const ev = CONTENT_GATES.find(g => g.id === 'event')!
    const row = reachabilityTable().find(r => r.gate.id === 'event')!
    expect(ev.qualifies).toBe(false)
    // 金丹可触发绝大多数事件
    expect(row.goldShare!).toBeGreaterThan(0.95)
    console.log(`\n事件:金丹可触发 ${(row.goldShare! * 100).toFixed(0)}%,仅 ${row.deepOnly} 个需要深修`)
  })

  it('这三项若包装成深修回报,只是换一种方式制造假选择', () => {
    const bad = disqualified().map(g => g.name)
    expect(bad).toContain('灵兽')
    expect(bad).toContain('师承')
    console.log(`\n被证伪:${bad.join('、')}——它们都在金丹的可达范围内`)
  })
})

describe('内容可达性 · 有资格的候选', () => {
  it('丹方:八个方子在金丹之上,minRealm 是硬过滤', () => {
    const row = reachabilityTable().find(r => r.gate.id === 'recipe')!
    expect(row.gate.qualifies).toBe(true)
    expect(row.deepOnly).toBeGreaterThan(0)
    console.log(`\n丹方:金丹可学 ${(row.goldShare! * 100).toFixed(0)}%,深修专属 ${row.deepOnly} 个`)
  })

  it('功法:可预支一境,故实际门槛比标称低一档', () => {
    const g = CONTENT_GATES.find(x => x.id === 'gongfa')!
    expect(g.bypass).toContain('预支')
    const row = reachabilityTable().find(r => r.gate.id === 'gongfa')!
    console.log(`\n功法:金丹(含预支)可学 ${(row.goldShare! * 100).toFixed(0)}%,深修专属 ${row.deepOnly} 门`)
    // 仍有深修专属,但要记住这条绕过路径
    expect(row.deepOnly).toBeGreaterThan(0)
  })

  it('区域与敌手认知:金丹只能进三分之一,是最硬的门槛之一', () => {
    const row = reachabilityTable().find(r => r.gate.id === 'region')!
    expect(row.gate.qualifies).toBe(true)
    expect(row.goldShare!).toBeLessThan(0.4)
    expect(row.gate.bypass).toContain('无')
    console.log(`\n区域:金丹可进 ${(row.goldShare! * 100).toFixed(0)}%,深修专属 ${row.deepOnly} 个,且无绕过路径`)
  })

  it('天界与道痕:唯一要求满级的内容,无任何替代入口', () => {
    const g = CONTENT_GATES.find(x => x.id === 'celestial')!
    expect(g.minMajor).toBe(MAX_MAJOR)
    expect(g.bypass).toBe('无')
    expect(g.qualifies).toBe(true)
  })
})

describe('内容可达性 · 结论', () => {
  it('有资格作深修独有回报的只有四类', () => {
    const ok = qualifiedRewards().map(g => g.name)
    expect(ok).toHaveLength(4)
    console.log(`\n合格:${ok.join('、')}`)
    console.log(`不合格:${disqualified().map(g => g.name).join('、')}`)
  })

  it('门槛是一次性的:认知跨世保留,跨过一次就永久在账上', () => {
    // 这是最要紧的一条约束。confirmReincarnation 不清 lore/quests,
    // 所以「深修一次拿到丹方」之后,玩家可以回到金丹无限轮回而不失去它。
    // 换言之深修回报天然是**一次性投资**,不是持续的停世理由——
    // 若要让深修反复值得,回报必须可重复获取或逐世累加
    const oneTime = qualifiedRewards().filter(g => g.id === 'recipe' || g.id === 'gongfa')
    expect(oneTime.length).toBe(2)
  })

  it('警告:四类合格回报里有三类集中在同一条轴上', () => {
    // 丹方、功法、区域认知本质都是「知识」,天界道痕是「终局资格」。
    // 若把深修价值全押在知识上,各境界之间仍缺乏方向差异——
    // 玩家还是会算出一个固定停世点,只是从金丹挪到了「知识吃满的那一境」
    const knowledge = qualifiedRewards().filter(g => ['recipe', 'gongfa', 'region'].includes(g.id))
    expect(knowledge).toHaveLength(3)
    console.log(
      `\n四类合格回报中,${knowledge.map(g => g.name).join('、')} 同属「知识」轴,` +
        `\n只有天界道痕在另一条轴上——方向差异不足,需要新增非知识类的深修价值`
    )
  })
})
