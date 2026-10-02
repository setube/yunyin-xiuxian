/**
 * 智能收纳 · 自动裁决的边界
 * 应有之物(O):品质达标的、流派核心的、组合技部件的、成套共鸣的、词条近满的,
 * 都算值得留;行囊满时挤掉的是最弱的那件无缘旧物。
 * 不该有的(X):把玩家练过的件(强化/重铸/封存)当垃圾自动扔掉 ——
 * 那是他自己花资源养起来的,工具没资格替他决定。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EquipmentInstance, QualityId } from '@/types'
import { BAG_CAPACITY } from '@/data/constants'
import { useSettingsStore } from '@/stores/settings'
import { useInventoryStore } from '@/stores/inventory'
import { acquireEquipment } from './loot'
import { compareEvictable, hasInvestment, keepVerdict, perfectRolls, shouldAutoRecycle } from './smartKeep'

/** 夹具一律用「不带套」的青云道袍,免得套件规则混进别的判据 */
function mk(uid: string, quality: QualityId = 'mortal', opts: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    uid,
    templateId: 'b_qingyun',
    quality,
    tier: 3,
    level: 0,
    affixes: [],
    ...opts
  }
}

/** 智能收纳全开、品质线 灵品 */
function smartOn(): void {
  useSettingsStore().decomposeRanks = [] // 本文件测的是智能收纳那半边,不掺「一键分解勾选档」
  useSettingsStore().smartKeep = {
    enabled: true,
    minQuality: 3,
    keepMinTier: 0,
    keepCoreAffix: true,
    keepComboPiece: true,
    keepPerfectRolls: true,
    keepSetPiece: true
  }
}

describe('智能收纳 · 自动裁决的边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    smartOn()
  })

  it('练过的件(强化/重铸/封存/转入词条)一律当藏,且不进自动回收闸', () => {
    const cases: [string, Partial<EquipmentInstance>][] = [
      ['强化过', { level: 5 }],
      ['重铸过', { reforgeCount: 2 }],
      ['封存过词条', { sealedAffixIds: ['atk1'] }],
      ['转入过词条', { transferCount: 1 }]
    ]
    for (const [why, patch] of cases) {
      const item = mk(`l_${why}`, 'mortal', patch)
      expect(hasInvestment(item), why).toBe(true)
      const v = keepVerdict(item)
      expect(v.keep, why).toBe(true)
      expect(v.reason, why).toMatch(/淬养/)
      expect(shouldAutoRecycle(item), why).toBe(false)
    }
  })

  it('未练过的凡品照旧判无缘', () => {
    expect(hasInvestment(mk('plain'))).toBe(false)
    expect(keepVerdict(mk('plain')).keep).toBe(false)
    expect(shouldAutoRecycle(mk('plain'))).toBe(true)
  })

  it('成套共鸣件当藏(机制优先于数值),关掉开关才放手', () => {
    const setPiece = mk('set1', 'mortal', { templateId: 'w_xuantie' }) // s_tiebi 铁壁共鸣
    const v = keepVerdict(setPiece)
    expect(v.keep).toBe(true)
    expect(v.reason).toContain('铁壁共鸣')
    useSettingsStore().smartKeep.keepSetPiece = false
    expect(keepVerdict(setPiece).keep).toBe(false)
  })

  it('词条条条近满当藏;有一条拉胯或干脆没词条都不算', () => {
    const perfect = mk('p_full', 'excellent', { affixes: [{ id: 'atk1', roll: 0.95 }, { id: 'def1', roll: 0.88 }] })
    const mixed = mk('p_mix', 'excellent', { affixes: [{ id: 'atk1', roll: 0.95 }, { id: 'def1', roll: 0.4 }] })
    const bare = mk('p_bare', 'excellent')
    expect(perfectRolls(perfect)).toBe(true)
    expect(keepVerdict(perfect).reason).toContain('近满')
    expect(perfectRolls(mixed)).toBe(false)
    expect(keepVerdict(mixed).keep).toBe(false)
    expect(perfectRolls(bare)).toBe(false)
    expect(keepVerdict(bare).keep).toBe(false)
    useSettingsStore().smartKeep.keepPerfectRolls = false
    expect(keepVerdict(perfect).keep).toBe(false)
  })

  it('阶级自留线:阶数到了,品质再低也当藏(硬保底,先于品质)', () => {
    const settings = useSettingsStore()
    settings.smartKeep.keepMinTier = 8
    // 连凡品(rank 0 < 品质线 3)、无任何识宝命中 —— 单凭阶数 8 就该留
    expect(keepVerdict(mk('t8', 'mortal', { tier: 8 })).keep).toBe(true)
    expect(keepVerdict(mk('t12', 'mortal', { tier: 12 })).keep).toBe(true)
    expect(keepVerdict(mk('t12', 'mortal', { tier: 12 })).reason).toMatch(/阶/)
  })

  it('阶级自留线未设(0)时,行为与从前一致 —— 阶数不掺和裁决', () => {
    // beforeEach 里 keepMinTier 已是 0,凡品(tier 3)不进品质线、也不进阶级线 → 无缘
    expect(keepVerdict(mk('t3', 'mortal')).keep).toBe(false)
  })

  it('两线是「或」:未达阶级线的珍品仍由品质线兜住,未达任何线的才化尘', () => {
    const settings = useSettingsStore()
    settings.smartKeep.keepMinTier = 8
    settings.smartKeep.keepCoreAffix = false
    settings.smartKeep.keepComboPiece = false
    settings.smartKeep.keepSetPiece = false
    settings.smartKeep.keepPerfectRolls = false
    // tier 3 玄品:未达阶线(8),但品质 ≥ 3 → 留
    expect(keepVerdict(mk('hq', 'spirit', { tier: 3 })).keep).toBe(true)
    // tier 3 凡品:两条线都不达、识宝全关 → 化尘
    expect(keepVerdict(mk('lq', 'mortal', { tier: 3 })).keep).toBe(false)
  })

  it('「一键分解」勾选的品质档与自动裁决彻底隔离 —— 手动筛的是行囊,落包不看它', () => {
    // 即便手动把「全套分解」勾满,智能收纳要留的件一个也不会被勾选档卷走
    useSettingsStore().decomposeRanks = [0, 1, 2, 3, 4, 5]
    // 练过的成套件:是玩家投入又命中套件 —— 手动档再宽也碰不得
    const invested = mk('set2', 'mortal', { templateId: 'w_xuantie', level: 3 })
    expect(shouldAutoRecycle(invested)).toBe(false)
    // 素而无缘的件仍归自动回收 —— 那是智能收纳自己的裁决,与勾选档无关
    expect(shouldAutoRecycle(mk('plain'))).toBe(true)
  })

  it('总闸:智能收纳未启用时,什么都不会被自动回收(手动勾选档也无从借道)', () => {
    const settings = useSettingsStore()
    settings.smartKeep.enabled = false
    settings.decomposeRanks = [0, 1]
    expect(shouldAutoRecycle(mk('plain'))).toBe(false)
    expect(shouldAutoRecycle(mk('gated', 'mortal', { level: 3 }))).toBe(false)
  })

  it('挤位先挤最弱:练过的件不在候选里,同档先走层级低的', () => {
    const inventory = useInventoryStore()
    inventory.addEquipment(mk('lv', 'mortal', { level: 9, tier: 20 })) // 练过的,不可动
    inventory.addEquipment(mk('low_tier', 'mortal', { tier: 1 }))
    inventory.addEquipment(mk('mid_tier', 'mortal', { tier: 2 }))
    for (let i = 0; inventory.bagItems.length < BAG_CAPACITY; i += 1) {
      inventory.addEquipment(mk(`f${i}`, 'mortal', { tier: 8 }))
    }
    const incoming = mk('in', 'profound', { tier: 9 })
    acquireEquipment(incoming)
    expect(inventory.findItem('lv'), '练过的件被挤掉了').toBeDefined()
    expect(inventory.findItem('low_tier'), '没挤掉层级最低的那件').toBeUndefined()
    expect(inventory.findItem('in'), '新件没进去').toBeDefined()
    expect(inventory.bagItems.length).toBeLessThanOrEqual(BAG_CAPACITY)
  })

  it('比较键:品质 → 层级 → 词条,弱者在先', () => {
    const weak = mk('w', 'mortal', { tier: 1, affixes: [{ id: 'atk1', roll: 0.1 }] })
    const strong = mk('s', 'mortal', { tier: 1, affixes: [{ id: 'atk1', roll: 0.9 }] })
    const higherTier = mk('h', 'mortal', { tier: 5 })
    const betterQuality = mk('q', 'spirit', { tier: 1 })
    expect(compareEvictable(weak, strong)).toBeLessThan(0)
    expect(compareEvictable(weak, higherTier)).toBeLessThan(0)
    expect(compareEvictable(weak, betterQuality)).toBeLessThan(0)
  })
})
