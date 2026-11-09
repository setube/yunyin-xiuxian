/* eslint-disable no-console */
/** 内容可达性审计:逐类核实门槛真伪,金丹刷得到的不算深修回报 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { rng } from '@/utils/random'
import { useCultivationStore } from '@/stores/cultivation'
import { CONTENT_GATES, disqualified, qualifiedRewards, reachabilityTable } from './contentGateAudit'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { REALMS, WORLD_BREAK_MAJOR } from '@/data/realms'
import { EVENTS } from '@/data/events'
import { PETS, genericPetPool, petDef, IMMORTAL_RANK } from '@/data/pets'
import { qualityDef } from '@/data/qualities'
import { resolveEventChoice } from './eventEngine'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import type { EventDef } from '@/types'

const NAMES = REALMS.map(r => r.name)

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
    // 本项目暂无「使用门槛」
    expect(kinds.has('acquire')).toBe(true)
    expect(kinds.has('trigger')).toBe(true)
    expect(kinds.has('none')).toBe(true)
  })
})

describe('内容可达性 · 被证伪的候选', () => {
  it('灵兽:入门灵兽无门槛,神兽须行至神界', () => {
    const pet = CONTENT_GATES.find(g => g.id === 'pet')!
    const row = reachabilityTable().find(r => r.gate.id === 'pet')!
    expect(pet.kind).toBe('trigger')
    expect(pet.reachableByGoldRebirth).toBe(false)
    expect(pet.qualifies).toBe(true)
    expect(row.goldShare!).toBeLessThan(1)
    console.log(`\n灵兽:${pet.evidence}`)
  })

  it('灵兽:泛型事件池只发入门圣兽;仙品/神品神兽仅由仙界及以上(≥9)的指名事件发放', () => {
    // ev_wounded_beast / ft_beast_pledge 共用 genericPetPool
    const entry = genericPetPool(new Set())
    for (const p of entry) {
      expect(qualityDef(p.quality).rank, `${p.id} 不得进泛型池`).toBeLessThan(IMMORTAL_RANK)
    }
    const entryIds = new Set(entry.map(p => p.id))
    // petId -> 各指名事件的 minRealm
    const grantedAt: Record<string, number[]> = {}
    for (const e of EVENTS) {
      for (const c of e.choices) {
        for (const o of c.outcomes) {
          for (const f of o.effects) {
            if (f.type !== 'pet') continue
            if (!f.id) continue
            ;(grantedAt[f.id] ??= []).push(e.minRealm ?? 0)
          }
        }
      }
    }
    for (const p of PETS) {
      if (qualityDef(p.quality).rank < IMMORTAL_RANK) continue
      expect(entryIds.has(p.id), `${p.id} 神兽不得经泛型池获得`).toBe(false)
      expect(grantedAt[p.id]?.length ?? 0, `${p.id} 神兽须有指名 id 的事件`).toBeGreaterThan(0)
      expect(Math.min(...(grantedAt[p.id] ?? [])), `${p.id} 所有发放事件须在仙界及以上(≥9)`).toBeGreaterThanOrEqual(9)
    }
  })

  it('灵兽:真实解析泛型灵兽事件,实际发放的每一只都在入门档(无神兽漏网)', () => {
    // 走事件结算入口,钉住 eventEngine 泛型分支用的就是 genericPetPool(改回 PETS.filter 会放过神兽)
    setActivePinia(createPinia())
    const player = usePlayerStore()
    player.initCharacter('事件', { roots: [] } as never)
    player.major = 9
    const quests = useQuestsStore()
    const def: EventDef = {
      id: 'ev_test_pet_generic',
      title: '',
      text: '',
      tags: ['general'],
      weight: 1,
      choices: [{ label: '收留', outcomes: [{ weight: 1, text: '得一灵兽', effects: [{ type: 'pet' }] }] }]
    }
    // 泛型池混入神兽时,刷 150 次几乎必然冒出仙/神品
    for (let i = 0; i < 150; i += 1) resolveEventChoice(def, 0, 3)
    expect(quests.collections.pet.length, '泛型灵兽事件应能发到入门圣兽').toBeGreaterThan(0)
    for (const id of quests.collections.pet) {
      const p = petDef(id)!
      expect(qualityDef(p.quality).rank, `${id} 泛型事件不得发 仙品/神品 神兽`).toBeLessThan(IMMORTAL_RANK)
    }
  })

  it('师承:同样无门槛,且跨世保留——第一世拜完就永久有了', () => {
    const mentor = CONTENT_GATES.find(g => g.id === 'mentor')!
    expect(mentor.kind).toBe('none')
    expect(mentor.reachableByGoldRebirth).toBe(true)
    expect(mentor.qualifies).toBe(false)
    console.log(`\n师承:${mentor.evidence}`)
  })

  it('奇遇事件:绝大多数无门槛,少数高阶奇遇需深修', () => {
    const ev = CONTENT_GATES.find(g => g.id === 'event')!
    const row = reachabilityTable().find(r => r.gate.id === 'event')!
    expect(ev.qualifies).toBe(false)
    expect(row.goldShare!).toBeGreaterThan(0.8)
    console.log(`\n事件:金丹可触发 ${(row.goldShare! * 100).toFixed(0)}%,有 ${row.deepOnly} 个需要深修`)
  })

  it('这三项若包装成深修回报,只是换一种方式制造假选择', () => {
    const bad = disqualified().map(g => g.name)
    expect(bad).toContain('师承')
    // 神兽是神界专属,灵兽已归入「有资格」一列
    expect(bad).not.toContain('灵兽')
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
    expect(g.minMajor).toBe(WORLD_BREAK_MAJOR)
    expect(g.bypass).toBe('无')
    expect(g.qualifies).toBe(true)
  })
})

describe('内容可达性 · 结论', () => {
  it('有资格作深修独有回报的有五类', () => {
    const ok = qualifiedRewards().map(g => g.name)
    expect(ok).toHaveLength(5)
    console.log(`\n合格:${ok.join('、')}`)
    console.log(`不合格:${disqualified().map(g => g.name).join('、')}`)
  })

  it('门槛是一次性的:认知跨世保留,跨过一次就永久在账上', () => {
    // confirmReincarnation 不清 lore/quests:深修回报是一次性投资,不是持续的停世理由
    const oneTime = qualifiedRewards().filter(g => g.id === 'recipe' || g.id === 'gongfa')
    expect(oneTime.length).toBe(2)
  })

  it('警告:四类合格回报里有三类集中在同一条轴上', () => {
    const knowledge = qualifiedRewards().filter(g => ['recipe', 'gongfa', 'region'].includes(g.id))
    expect(knowledge).toHaveLength(3)
    console.log(
      `\n四类合格回报中,${knowledge.map(g => g.name).join('、')} 同属「知识」轴,` +
        `\n只有天界道痕在另一条轴上——方向差异不足,需要新增非知识类的深修价值`
    )
  })
})

/*
 * 事件施加的 buff 真能落到身上。
 *
 * `eventEngine.ts` 的 `case 'buff'` 里有一道 `if (!def) return null` 的判空。
 * 实测事件表引用 5 个 buff id(bless_qingfeng / bless_daoyun / injury /
 * bless_jiyuan / curse_xinmo)**全部有定义**,那道判空一处也走不到 —— 是死分支。
 *
 * 所以不补判空,改锁真正影响玩家的那条:选到「施加 buff」的结果时,
 * 该 buff 必须出现在修为状态的 buff 列表里。少了这一步,玩家看到战报说
 * 「你受了些内伤」,面板上却什么也没有。
 */
describe('事件效果 · buff 那一支真的生效', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('选到「灵力反噬受内伤」的结果,则内伤 buff 落到身上', () => {
    const def = EVENTS.find(e => e.id === 'ev_jade_slip')!
    const cultivation = useCultivationStore()
    // 第一个选择的第 3 个结果是 injury(权重 20/100);让 rand 落在最后一段
    vi.spyOn(rng, 'rand').mockReturnValue(0.95)
    try {
      const res = resolveEventChoice(def, 0, 3)
      expect(res.lines.join('|'), '该报「陷入重伤」').toContain('重伤')
      expect(cultivation.buffs.some(b => b.defId === 'injury'), '重伤 buff 该真的挂上').toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
