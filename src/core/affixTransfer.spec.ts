/* eslint-disable no-console -- 遍历规模与价位样例给人看 */
/**
 * 词条转移(议题 #22)—— 规则、合法件不变量、界面与服务同判
 *
 * 三类判据:
 *   一 规则逐条:部位、品质、同一件、同 id、满条、递减属性、封存的三种走法、残留封存清理;
 *   二 合法件不变量:用种子生成一批件,遍历「源 × 词条 × 目标 × 落位 × 封存」,
 *      凡计划成立的,落地后的目标件都得是一件**掉落里可能出现**的合法件。
 *      条件在这里独立写出,不调 affixFitBlock —— 判据若借被测函数自证,就成了同源推演;
 *   三 界面说行 ⇔ 服务做成:planTransfer 成立且付得起,transferAffix 就必须做成,反之亦然。
 *      (本项目反复出过「按钮亮着却进不去」:两边各写一份判据,迟早分叉。)
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  planTransfer,
  targetBlock,
  transferAffix,
  transferCandidates,
  transferLandings,
  transferShort,
  transferShortfall
} from './affixTransfer'
import { generateEquipment } from './equipGen'
import { reforgeCost, sealCost } from './reforge'
import { stoneByTier } from './formulas'
import { AFFIXES, affixDef, affixValue } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import { DIMINISH_KEYS, REFORGE_DUST_BASE, REFORGE_STONE_BASE } from '@/data/constants'
import { RandomService, mulberry32 } from '@/utils/random'
import { gn, gnZero, isZero, mulN } from '@/utils/gnum'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { transferBlockText } from '@/ui/affixTransferText'
import type { EquipmentInstance, GNum } from '@/types'

const toNum = (g: GNum): number => g.m * Math.pow(10, g.e)

function mk(uid: string, templateId: string, quality: EquipmentInstance['quality'], affixes: [string, number][], patch: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return { uid, templateId, quality, tier: 20, level: 0, affixes: affixes.map(([id, roll]) => ({ id, roll })), ...patch }
}

/** 天品武器(rank 6,上限 7 条) */
const W = 'w_hanfeng'
/** 戒指 */
const R = 'r_tongjie'

describe('词条转移 · 规则逐条', () => {
  it('部位:武器专属「洞虚」转不到戒指上', () => {
    const src = mk('s', W, 'heaven', [['pen3', 0.9]])
    const ring = mk('t', R, 'heaven', [['atk1', 0.5]])
    expect(targetBlock(src, ring, 'pen3')).toBe('slot')
    expect(planTransfer(src, ring, 'pen3', null, false)).toEqual({ ok: false, block: 'slot' })
  })

  it('品质:「洞虚」要天品,转不到地品武器上;标签写明要哪一品', () => {
    const src = mk('s', W, 'heaven', [['pen3', 0.9]])
    const earth = mk('t', W, 'earth', [['atk1', 0.5]])
    expect(targetBlock(src, earth, 'pen3')).toBe('rank')
    expect(transferBlockText('rank', 'pen3')).toBe(`需${qualityDef('heaven').name}`)
  })

  it('同一件、源件没有这条、目标模板缺失、要顶替的条不在目标上', () => {
    const src = mk('s', W, 'heaven', [['pen3', 0.9]])
    expect(targetBlock(src, src, 'pen3')).toBe('same')
    expect(targetBlock(src, mk('t', W, 'heaven', []), 'atk1')).toBe('noAffix')
    expect(targetBlock(src, mk('t', 'no_such_template', 'heaven', []), 'pen3')).toBe('noTemplate')
    // 陈旧的落位(那条已经不在目标上)不许当成「新增」静默执行
    expect(planTransfer(src, mk('t', W, 'heaven', [['def1', 0.5]]), 'pen3', 'ghost', false)).toEqual({ ok: false, block: 'noLanding' })
  })

  it('源件上封着的那条转走:封存不随行;要封得在目标上另付', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9], ['def1', 0.4]], { sealedAffixIds: ['atk3'] })
    const tgt = mk('t', W, 'heaven', [['hp1', 0.5]])
    const none = planTransfer(src, tgt, 'atk3', null, false)
    expect(none.ok).toBe(true)
    if (!none.ok) return
    expect(none.plan.sealMode).toBe('none')
    expect(none.plan.target.sealedAffixIds).toEqual([])
    expect(none.plan.cost.sealStone).toBeNull()
    const paid = planTransfer(src, tgt, 'atk3', null, true)
    expect(paid.ok).toBe(true)
    if (!paid.ok) return
    expect(paid.plan.target.sealedAffixIds).toEqual(['atk3'])
    expect(toNum(paid.plan.cost.sealStone!)).toBeCloseTo(toNum(sealCost({ ...none.plan.target })!), 6)
  })

  it('满条:新增被挡;顶替一条成立,条数不变', () => {
    const cap = qualityDef('heaven').affixes[1]
    const full = mk('t', W, 'heaven', [['atk1', 0.5], ['def1', 0.5], ['hp1', 0.5], ['cult1', 0.5], ['gain1', 0.5], ['spd1', 0.5], ['dmg1', 0.5]])
    expect(full.affixes).toHaveLength(cap)
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    expect(planTransfer(src, full, 'atk3', null, false)).toEqual({ ok: false, block: 'full' })
    const swap = planTransfer(src, full, 'atk3', 'def1', false)
    expect(swap.ok).toBe(true)
    if (swap.ok) {
      expect(swap.plan.target.affixes).toHaveLength(cap)
      expect(swap.plan.target.affixes.map(a => a.id)).toContain('atk3')
      expect(swap.plan.target.affixes.map(a => a.id)).not.toContain('def1')
    }
  })

  it('同 id:目标那条不更低就挡;更低时只能覆盖它自己,永不出现重复 id', () => {
    const src = mk('s', W, 'heaven', [['atk1', 0.9]])
    expect(targetBlock(src, mk('t', W, 'heaven', [['atk1', 0.95]]), 'atk1')).toBe('dup')
    expect(targetBlock(src, mk('t', W, 'heaven', [['atk1', 0.9]]), 'atk1')).toBe('dup')
    const low = mk('t', W, 'heaven', [['atk1', 0.1], ['def1', 0.5]])
    expect(targetBlock(src, low, 'atk1')).toBeNull()
    expect(planTransfer(src, low, 'atk1', null, false)).toEqual({ ok: false, block: 'dup' })
    expect(planTransfer(src, low, 'atk1', 'def1', false)).toEqual({ ok: false, block: 'dup' })
    const cover = planTransfer(src, low, 'atk1', 'atk1', false)
    expect(cover.ok).toBe(true)
    if (cover.ok) {
      expect(cover.plan.target.affixes).toEqual([{ id: 'atk1', roll: 0.9 }, { id: 'def1', roll: 0.5 }])
    }
  })

  it('递减属性不新增叠加:只能顶替同属性那条;非递减属性照掉落规则可以并存', () => {
    expect(DIMINISH_KEYS).toContain(affixDef('crit3')!.key)
    const src = mk('s', W, 'heaven', [['crit3', 0.9], ['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['crit1', 0.5], ['def1', 0.5], ['atk1', 0.5]])
    expect(planTransfer(src, tgt, 'crit3', null, false)).toEqual({ ok: false, block: 'stack' })
    expect(planTransfer(src, tgt, 'crit3', 'def1', false)).toEqual({ ok: false, block: 'stack' })
    expect(planTransfer(src, tgt, 'crit3', 'crit1', false).ok).toBe(true)
    // 掉落里本就带一对的:对内升级可以,再加第三条不行
    const pair = mk('t2', W, 'heaven', [['crit1', 0.5], ['crit2', 0.5], ['def1', 0.5]])
    expect(planTransfer(src, pair, 'crit3', 'crit1', false).ok).toBe(true)
    expect(planTransfer(src, pair, 'crit3', null, false)).toEqual({ ok: false, block: 'stack' })
    // 攻击不是递减属性:atk1 在身,再新增 atk3 照样成立
    expect(DIMINISH_KEYS).not.toContain(affixDef('atk3')!.key)
    expect(planTransfer(src, tgt, 'atk3', null, false).ok).toBe(true)
  })

  it('顶替已封存的条:新条沿用封存,封存数不变、不收封存费', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['def1', 0.5], ['hp1', 0.5]], { sealedAffixIds: ['def1'] })
    const r = planTransfer(src, tgt, 'atk3', 'def1', true)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan.sealMode).toBe('inherit')
    expect(r.plan.target.sealedAffixIds).toEqual(['atk3'])
    expect(r.plan.cost.sealStone).toBeNull()
  })

  it('同时封存:费用就是手动封存那一笔;已封满时不能封,不封照样成立', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['def1', 0.5], ['hp1', 0.5]])
    const paid = planTransfer(src, tgt, 'atk3', null, true)
    const none = planTransfer(src, tgt, 'atk3', null, false)
    expect(paid.ok && none.ok).toBe(true)
    if (!paid.ok || !none.ok) return
    const unsealed = { ...none.plan.target, sealedAffixIds: [] }
    expect(paid.plan.sealMode).toBe('paid')
    expect(toNum(paid.plan.cost.sealStone!)).toBeCloseTo(toNum(sealCost(unsealed)!), 6)
    expect(toNum(paid.plan.cost.stone)).toBeCloseTo(toNum(none.plan.cost.stone) + toNum(paid.plan.cost.sealStone!), 0)
    expect(paid.plan.target.sealedAffixIds).toEqual(['atk3'])
    expect(none.plan.target.sealedAffixIds).toEqual([])
    // 两条、已封一条(封满):顶替未封那条后仍是两条一封,不能再封
    const capped = mk('t2', W, 'heaven', [['def1', 0.5], ['hp1', 0.5]], { sealedAffixIds: ['def1'] })
    expect(planTransfer(src, capped, 'atk3', 'hp1', true)).toEqual({ ok: false, block: 'sealFull' })
    const plain = planTransfer(src, capped, 'atk3', 'hp1', false)
    expect(plain.ok, '封不了就不封,转移照样成立').toBe(true)
    if (!plain.ok) return
    expect(plain.plan.canSeal).toBe(false)
    expect(plain.plan.sealMode).toBe('none')
    expect(plain.plan.target.sealedAffixIds).toEqual(['def1'])
  })

  it('残留封存 id 被清掉:封存只含现有词条', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['def1', 0.5], ['hp1', 0.5]], { sealedAffixIds: ['def1', 'ghost', 'def1'] })
    const r = planTransfer(src, tgt, 'atk3', null, false)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plan.target.sealedAffixIds).toEqual(['def1'])
  })

  it('残留封存 id 恰好就是转入那条:不白得封存,也不重复封存', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['def1', 0.5], ['hp1', 0.5]], { sealedAffixIds: ['atk3'] })
    const free = planTransfer(src, tgt, 'atk3', null, false)
    expect(free.ok && free.plan.target.sealedAffixIds).toEqual([])
    const paid = planTransfer(src, tgt, 'atk3', null, true)
    expect(paid.ok && paid.plan.target.sealedAffixIds).toEqual(['atk3'])
    expect(paid.ok && paid.plan.cost.sealStone).not.toBeNull()
  })

  it('源件抽到只剩封存条:不能重铸了,但还能转入、转出,不卡死', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9], ['def1', 0.4]], { sealedAffixIds: ['atk3'] })
    const tgt = mk('t', W, 'heaven', [['hp1', 0.5]])
    const r = planTransfer(src, tgt, 'def1', null, false)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const husk = r.plan.source
    expect(husk.affixes.map(a => a.id)).toEqual(['atk3'])
    // 还能把封着的那条转出去
    expect(planTransfer(husk, tgt, 'atk3', null, false).ok).toBe(true)
    // 也还能往里转一条(转入的不封 → 又有可重掷位)
    expect(planTransfer(tgt, husk, 'hp1', null, false).ok).toBe(true)
  })

  it('字段:目标只改词条、封存与转入次数;源件只少这一条(连同它的封存)', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9], ['def1', 0.4]], { level: 6, locked: true, note: '旧剑', sealedAffixIds: ['atk3'], reforgeCount: 9 })
    const tgt = mk('t', W, 'heaven', [['hp1', 0.5]], { level: 3, invested: { dust: 12, stone: gn(1000) }, locked: true, note: '主手', reforgeCount: 2 })
    const r = planTransfer(src, tgt, 'atk3', null, false)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 除这几项之外,其余字段原样不动
    const rest = (x: EquipmentInstance): Record<string, unknown> =>
      Object.fromEntries(Object.entries(x).filter(([k]) => !['affixes', 'sealedAffixIds', 'transferCount'].includes(k)))
    expect(rest(r.plan.target)).toEqual(rest(tgt))
    expect(r.plan.target.transferCount).toBe(1)
    expect(rest(r.plan.source)).toEqual(rest(src))
    expect(r.plan.source.affixes).toEqual([{ id: 'def1', roll: 0.4 }])
    expect(r.plan.source.sealedAffixIds).toEqual([])
    expect(r.plan.source.transferCount, '转出不算转入').toBeUndefined()
    expect(r.plan.target.sealedAffixIds, '源件上的封存不随行').toEqual([])
  })

  it('定价:数值不进价;顶替比新增便宜;权重低的条更贵;灵石只认目标阶,尘不分阶', () => {
    const tgt = mk('t', W, 'heaven', [['def1', 0.5], ['hp1', 0.5], ['cult1', 0.5]])
    const lo = planTransfer(mk('s', W, 'heaven', [['atk2', 0.05]]), tgt, 'atk2', null, false)
    const hi = planTransfer(mk('s', W, 'heaven', [['atk2', 0.99]]), tgt, 'atk2', null, false)
    expect(lo.ok && hi.ok).toBe(true)
    if (!lo.ok || !hi.ok) return
    expect(hi.plan.cost.dust).toBe(lo.plan.cost.dust)
    expect(toNum(hi.plan.cost.stone)).toBe(toNum(lo.plan.cost.stone))
    // 灵石与尘折的是同一个「次数」:灵石 ÷ 一次无封重铸的灵石 ≈ 尘 ÷ 30
    const once = toNum(reforgeCost({ ...tgt, sealedAffixIds: [] })!.stone)
    expect(toNum(lo.plan.cost.stone) / once).toBeCloseTo(lo.plan.cost.dust / REFORGE_DUST_BASE, 1)
    const swap = planTransfer(mk('s', W, 'heaven', [['atk2', 0.5]]), tgt, 'atk2', 'def1', false)
    expect(swap.ok && swap.plan.cost.dust < lo.plan.cost.dust).toBe(true)
    const rare = planTransfer(mk('s', W, 'heaven', [['atk4', 0.5]]), mk('t', W, 'immortal', tgt.affixes.map(a => [a.id, a.roll] as [string, number])), 'atk4', null, false)
    const common = planTransfer(mk('s', W, 'heaven', [['atk1', 0.5]]), mk('t', W, 'immortal', tgt.affixes.map(a => [a.id, a.roll] as [string, number])), 'atk1', null, false)
    expect(rare.ok && common.ok && rare.plan.cost.dust > common.plan.cost.dust).toBe(true)
    // 源件阶数不进价
    const fromLow = planTransfer(mk('s', W, 'heaven', [['atk2', 0.5]], { tier: 3 }), tgt, 'atk2', null, false)
    const fromHigh = planTransfer(mk('s', W, 'heaven', [['atk2', 0.5]], { tier: 30 }), tgt, 'atk2', null, false)
    expect(fromLow.ok && fromHigh.ok && toNum(fromLow.plan.cost.stone) === toNum(fromHigh.plan.cost.stone)).toBe(true)
    // 目标阶:灵石按 stoneByTier 的比走,尘相同
    const t10 = planTransfer(mk('s', W, 'heaven', [['atk2', 0.5]]), { ...tgt, tier: 10 }, 'atk2', null, false)
    const t25 = planTransfer(mk('s', W, 'heaven', [['atk2', 0.5]]), { ...tgt, tier: 25 }, 'atk2', null, false)
    expect(t10.ok && t25.ok).toBe(true)
    if (!t10.ok || !t25.ok) return
    const ratio = toNum(stoneByTier(25, REFORGE_STONE_BASE)) / toNum(stoneByTier(10, REFORGE_STONE_BASE))
    expect(toNum(t25.plan.cost.stone) / toNum(t10.plan.cost.stone)).toBeCloseTo(ratio, 3)
    expect(t25.plan.cost.dust).toBe(t10.plan.cost.dust)
    const once25 = toNum(reforgeCost({ ...tgt, tier: 25, sealedAffixIds: [] })!.stone)
    expect(toNum(t25.plan.cost.stone) / once25).toBeCloseTo(t25.plan.cost.dust / REFORGE_DUST_BASE, 1)
    console.log(`\n  天品武器 3 条 → 新增「破军」:尘×${lo.plan.cost.dust}(≈ ${(lo.plan.cost.dust / REFORGE_DUST_BASE).toFixed(1)} 次无封重铸)`)
  })
})

/** 一批确定的件:各部位、各品质,部分随机封存 —— 不变量遍历与同判扫面共用 */
function seededItems(seed: number, n: number): EquipmentInstance[] {
  const r = new RandomService(mulberry32(seed))
  const out: EquipmentInstance[] = []
  for (let i = 0; i < n; i += 1) {
    const tier = 8 + ((i * 7) % 25)
    const item = generateEquipment(tier, r, { minQualityRank: i % 9 })
    const sealable = Math.max(0, item.affixes.length - 1)
    const sealed = item.affixes.slice(0, r.int(0, sealable)).map(a => a.id)
    out.push({ ...item, uid: `g${i}`, sealedAffixIds: sealed })
  }
  return out
}

/** 掉落里可能出现的合法件 —— 条件独立写出,不借被测的 affixFitBlock */
function legalProblems(item: EquipmentInstance): string[] {
  const out: string[] = []
  const tpl = equipmentTemplate(item.templateId)
  const q = qualityDef(item.quality)
  const ids = item.affixes.map(a => a.id)
  if (!tpl) return ['模板缺失']
  if (item.affixes.length > q.affixes[1]) out.push(`条数 ${item.affixes.length} > 上限 ${q.affixes[1]}`)
  if (new Set(ids).size !== ids.length) out.push('重复 id')
  for (const a of item.affixes) {
    const def = AFFIXES.find(d => d.id === a.id)
    if (!def) {
      out.push(`未知词条 ${a.id}`)
      continue
    }
    if (def.slots && !def.slots.includes(tpl.slot)) out.push(`${a.id} 不该长在 ${tpl.slot}`)
    if (def.minRank !== undefined && q.rank < def.minRank) out.push(`${a.id} 要品质 ${def.minRank},此件 ${q.rank}`)
  }
  const sealed = item.sealedAffixIds ?? []
  if (sealed.some(id => !ids.includes(id))) out.push('封存了不存在的词条')
  if (sealed.length > Math.max(0, ids.length - 1)) out.push('封存数超出可封上限')
  return out
}

describe('词条转移 · 合法件不变量', () => {
  it('凡成立的计划,落地后的目标件都是合法件,源件恰好少一条', () => {
    const items = seededItems(20261001, 28)
    for (const it of items) expect(legalProblems(it), `种子件 ${it.uid} 本身不合法`).toEqual([])
    let plans = 0
    for (const src of items) {
      for (const moved of src.affixes) {
        for (const tgt of items) {
          for (const replaceId of [null, ...tgt.affixes.map(a => a.id)]) {
            for (const seal of [false, true]) {
              const r = planTransfer(src, tgt, moved.id, replaceId, seal)
              if (!r.ok) continue
              plans += 1
              expect(legalProblems(r.plan.target), `${src.uid}:${moved.id} → ${tgt.uid}@${replaceId}`).toEqual([])
              expect(r.plan.source.affixes).toHaveLength(src.affixes.length - 1)
              expect(r.plan.source.affixes.some(a => a.id === moved.id)).toBe(false)
              expect(r.plan.target.affixes).toHaveLength(tgt.affixes.length + (replaceId === null ? 1 : 0))
              expect(r.plan.target.affixes.find(a => a.id === moved.id)?.roll).toBe(moved.roll)
              // 递减属性的条数只降不升(新增那一条不算超出原有的一条)
              const key = affixDef(moved.id)!.key
              if ((DIMINISH_KEYS as readonly string[]).includes(key)) {
                const count = (x: EquipmentInstance): number => x.affixes.filter(a => affixDef(a.id)?.key === key).length
                expect(count(r.plan.target)).toBeLessThanOrEqual(Math.max(1, count(tgt)))
              }
            }
          }
        }
      }
    }
    console.log(`\n  合法件不变量:${items.length} 件互转,${plans} 份成立的计划全部合法`)
    expect(plans, '遍历没跑到成立的计划,判据没跑到东西').toBeGreaterThan(200)
  })
})

describe('词条转移 · 界面说行 ⇔ 服务做成', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seat(items: EquipmentInstance[], stone: GNum, dust: number): void {
    const inventory = useInventoryStore()
    inventory.items = items
    const resources = useResourcesStore()
    resources.spiritStone = stone
    resources.dust = dust
  }

  it('确定性抽样 400 组:planTransfer 成立且付得起 ⇔ transferAffix 做成', () => {
    const items = seededItems(77, 16)
    const r = new RandomService(mulberry32(4242))
    let yes = 0
    let no = 0
    for (let k = 0; k < 400; k += 1) {
      const src = items[r.int(0, items.length - 1)]!
      const tgt = items[r.int(0, items.length - 1)]!
      if (src.affixes.length === 0) continue
      const moved = src.affixes[r.int(0, src.affixes.length - 1)]!
      const pool = [null, ...tgt.affixes.map(a => a.id)]
      const replaceId = pool[r.int(0, pool.length - 1)]!
      const seal = r.chance(0.5)
      setActivePinia(createPinia())
      // 资源分四档:都够 / 灵石差一截 / 尘差 1 / 都不够 —— 够与不够、缺哪样都覆盖
      const quote = planTransfer(src, tgt, moved.id, replaceId, seal)
      const tierPick = r.int(0, 3)
      const stone = !quote.ok ? gn(1e30) : tierPick === 1 || tierPick === 3 ? mulN(quote.plan.cost.stone, 0.5) : mulN(quote.plan.cost.stone, 2)
      const dust = !quote.ok ? 1e6 : tierPick === 2 || tierPick === 3 ? Math.max(0, quote.plan.cost.dust - 1) : quote.plan.cost.dust * 2
      seat(items.map(x => ({ ...x })), stone, dust)
      const sayOk = quote.ok && transferShort(quote.plan.cost) === null
      const did = transferAffix({ sourceUid: src.uid, targetUid: tgt.uid, affixId: moved.id, replaceId, seal })
      expect(did, `#${k} ${src.uid}:${moved.id} → ${tgt.uid}@${replaceId} 界面说${sayOk ? '行' : '不行'}`).toBe(sayOk)
      if (did) yes += 1
      else no += 1
    }
    console.log(`\n  同判扫面:做成 ${yes} 组、被拒 ${no} 组`)
    expect(yes, '扫面里一组都没做成,判据没跑到东西').toBeGreaterThan(10)
    expect(no).toBeGreaterThan(10)
  })
})

describe('词条转移 · 服务记账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('付得起:按价签扣尘扣石,两件都写入,装备槽不动;已装备、已上锁的源件照样转出', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9], ['def1', 0.4]], { locked: true })
    const tgt = mk('t', W, 'heaven', [['hp1', 0.5]])
    const inventory = useInventoryStore()
    inventory.items = [src, tgt]
    inventory.equip('s', 'weapon')
    const resources = useResourcesStore()
    const quote = planTransfer(src, tgt, 'atk3', null, true)
    expect(quote.ok).toBe(true)
    if (!quote.ok) return
    // 余额只比价签多几倍:大额余额减去小额价签会被大数精度吞掉,对不出账
    resources.spiritStone = mulN(quote.plan.cost.stone, 3)
    resources.dust = quote.plan.cost.dust * 3
    const before = { stone: toNum(resources.spiritStone), dust: resources.dust }
    expect(transferAffix({ sourceUid: 's', targetUid: 't', affixId: 'atk3', replaceId: null, seal: true })).toBe(true)
    expect(before.dust - resources.dust).toBe(quote.plan.cost.dust)
    expect((before.stone - toNum(resources.spiritStone)) / toNum(quote.plan.cost.stone)).toBeCloseTo(1, 6)
    expect(inventory.findItem('s')!.affixes.map(a => a.id)).toEqual(['def1'])
    expect(inventory.findItem('t')!.affixes.map(a => a.id)).toEqual(['hp1', 'atk3'])
    expect(inventory.findItem('t')!.sealedAffixIds).toEqual(['atk3'])
    expect(inventory.findItem('t')!.transferCount).toBe(1)
    expect(inventory.equipped.weapon).toBe('s')
    expect(useUiStore().toasts.at(-1)?.text).toContain('「灭世」已转入')
  })

  it('缺哪样报哪样并写出实际差额,一笔不扣、一处不改;被挡也一样', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['hp1', 0.5]])
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    const ui = useUiStore()
    inventory.items = [src, tgt]
    const quote = planTransfer(src, tgt, 'atk3', null, false)
    expect(quote.ok).toBe(true)
    if (!quote.ok) return
    resources.spiritStone = gn(1e30)
    resources.dust = 0
    expect(transferAffix({ sourceUid: 's', targetUid: 't', affixId: 'atk3', replaceId: null, seal: false })).toBe(false)
    const dustGap = transferShortfall(quote.plan.cost)
    expect(ui.toasts.at(-1)?.text).toBe(`器灵尘尚差 ${dustGap.dust}`)
    resources.spiritStone = gn(0)
    resources.dust = 1e6
    expect(transferAffix({ sourceUid: 's', targetUid: 't', affixId: 'atk3', replaceId: null, seal: false })).toBe(false)
    expect(ui.toasts.at(-1)?.text).toContain('灵石尚差 ')
    expect(isZero(resources.spiritStone)).toBe(true)
    expect(resources.dust).toBe(1e6)
    expect(transferAffix({ sourceUid: 's', targetUid: 's', affixId: 'atk3', replaceId: null, seal: false })).toBe(false)
    expect(ui.toasts.at(-1)?.text).toBe('同一件')
    expect(transferAffix({ sourceUid: 's', targetUid: 'nope', affixId: 'atk3', replaceId: null, seal: false })).toBe(false)
    expect(ui.toasts.at(-1)?.text).toBe('装备不在')
    expect(resources.dust).toBe(1e6)
    expect(inventory.findItem('s')).toEqual(src)
    expect(inventory.findItem('t')).toEqual(tgt)
  })

  it('转移缺口与扣款同源:两样各差多少都算得出,够时归零', () => {
    const src = mk('s', W, 'heaven', [['atk3', 0.9]])
    const tgt = mk('t', W, 'heaven', [['hp1', 0.5]])
    const quote = planTransfer(src, tgt, 'atk3', null, false)
    expect(quote.ok).toBe(true)
    if (!quote.ok) return
    const resources = useResourcesStore()
    resources.spiritStone = gn(1)
    resources.dust = quote.plan.cost.dust - 3
    const gap = transferShortfall(quote.plan.cost)
    expect(gap.short, '两样都缺时先报灵石').toBe('stone')
    expect(gap.stone.m).toBeGreaterThan(0)
    expect(gap.dust).toBe(3)
    resources.spiritStone = mulN(quote.plan.cost.stone, 2)
    resources.dust = quote.plan.cost.dust
    expect(transferShortfall(quote.plan.cost)).toEqual({ short: null, stone: gnZero(), dust: 0 })
  })

  it('候选与落位都由同一份判据给出:部位不合的不列;已有且不更低的、同部位品质不够的置灰', () => {
    const src = mk('s', W, 'heaven', [['atk2', 0.5]])
    const inventory = useInventoryStore()
    inventory.items = [
      src,
      mk('ok', W, 'heaven', [['def1', 0.5]]),
      mk('dup', W, 'heaven', [['atk2', 0.9]]),
      mk('ring', R, 'heaven', [['def1', 0.5]]),
      mk('low', W, 'mortal', []),
      mk('lowRing', R, 'mortal', [])
    ]
    const c = transferCandidates(src, 'atk2')
    // 「破军」要精品:同部位的凡品武器列出置灰,别的部位品质不够的不列
    expect(c.map(x => `${x.item.uid}:${x.block}`)).toEqual(['ok:null', 'ring:null', 'dup:dup', 'low:rank'])
    expect(transferBlockText('rank', 'atk2')).toBe(`需${qualityDef('excellent').name}`)
    const landings = transferLandings(src, inventory.findItem('ok')!, 'atk2')
    expect(landings.map(l => l.replaceId)).toEqual([null, 'def1'])
    expect(landings.every(l => l.check.ok)).toBe(true)
    expect(affixValue(affixDef('atk2')!, 0.9)).toBeGreaterThan(affixValue(affixDef('atk2')!, 0.5))
    // 武器专属的「洞虚」:戒指、护甲因部位被挡,连置灰都不列
    const s2 = mk('s2', W, 'heaven', [['pen3', 0.5]])
    inventory.items = [s2, mk('w2', W, 'heaven', []), mk('ring2', R, 'heaven', []), mk('armor2', 'b_mabu', 'heaven', [])]
    expect(targetBlock(s2, inventory.findItem('ring2')!, 'pen3')).toBe('slot')
    expect(targetBlock(s2, inventory.findItem('armor2')!, 'pen3')).toBe('slot')
    expect(transferCandidates(s2, 'pen3').map(x => x.item.uid)).toEqual(['w2'])
  })
})
