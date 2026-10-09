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
import { compareEvictable, hasInvestment, keepVerdict, perfectRolls, shouldAutoRecycle, sweepTargets } from './smartKeep'

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

  it('双线皆满才藏:阶线与品质线双双达标才留,一高二低各不独保', () => {
    const settings = useSettingsStore()
    settings.smartKeep.keepMinTier = 12
    settings.smartKeep.keepCoreAffix = false
    settings.smartKeep.keepComboPiece = false
    settings.smartKeep.keepSetPiece = false
    settings.smartKeep.keepPerfectRolls = false
    // 一高二低:阶到了(12)、品质不足(精品 rank 2 < 灵品 3)→ 不藏(旧「阶线硬保底」反例)
    expect(keepVerdict(mk('hi_t_lo_q', 'excellent', { tier: 12 })).keep).toBe(false)
    // 一高一低:品质够(灵品)、阶不够(11 < 12)→ 不藏(旧「品质线兜底」反例)
    expect(keepVerdict(mk('hi_q_lo_t', 'spirit', { tier: 11 })).keep).toBe(false)
    // 双线皆满:灵品·12 阶 → 藏,理由点明两线
    const kept = keepVerdict(mk('both', 'spirit', { tier: 12 }))
    expect(kept.keep).toBe(true)
    expect(kept.reason).toContain('双线')
    // 同品更高阶仍藏
    expect(keepVerdict(mk('both2', 'spirit', { tier: 20 })).keep).toBe(true)
  })

  it('阶级自留线未设(0)时视为「通过」:单设品质线照旧留珍,阶数不掺和裁决', () => {
    // keepMinTier 已是 0:凡品(tier 3)不进品质线、也不进阶级线 → 无缘
    expect(keepVerdict(mk('t3', 'mortal')).keep).toBe(false)
    // 阶线虽未设,品质达标者照旧当藏 —— 通过语义不误伤单线使用
    const v = keepVerdict(mk('hq', 'spirit', { tier: 3 }))
    expect(v.keep).toBe(true)
    expect(v.reason).toBe('灵品当藏')
  })

  it('两线是「且」:未达任何一线的件化尘,双线皆满的珍品当藏', () => {
    const settings = useSettingsStore()
    settings.smartKeep.keepMinTier = 12
    settings.smartKeep.keepCoreAffix = false
    settings.smartKeep.keepComboPiece = false
    settings.smartKeep.keepSetPiece = false
    settings.smartKeep.keepPerfectRolls = false
    // 凡品·3 阶:两线都不达、识宝全关 → 化尘
    expect(keepVerdict(mk('lq', 'mortal', { tier: 3 })).keep).toBe(false)
    // 精品·12 阶:只达阶级线,不达品质线 → 化尘
    expect(keepVerdict(mk('t_only', 'excellent', { tier: 12 })).keep).toBe(false)
    // 灵品·11 阶:只达品质线,不达阶级线 → 化尘
    expect(keepVerdict(mk('q_only', 'spirit', { tier: 11 })).keep).toBe(false)
    // 灵品·12 阶:双线皆满 → 留
    expect(keepVerdict(mk('both', 'spirit', { tier: 12 })).keep).toBe(true)
  })

  it('回归:品质线灵品 × 阶级线 12 阶 —— 灵品·11 不藏、精品·12 不藏、灵品·12 藏', () => {
    const settings = useSettingsStore()
    settings.smartKeep.minQuality = 3 // 灵品
    settings.smartKeep.keepMinTier = 12
    settings.smartKeep.keepCoreAffix = false
    settings.smartKeep.keepComboPiece = false
    settings.smartKeep.keepSetPiece = false
    settings.smartKeep.keepPerfectRolls = false
    expect(keepVerdict(mk('r_lo_t', 'spirit', { tier: 11 })).keep).toBe(false) // 灵品·11:品够阶不够
    expect(keepVerdict(mk('r_hi_t', 'excellent', { tier: 12 })).keep).toBe(false) // 精品·12:阶够品不够
    const kept = keepVerdict(mk('r_both', 'spirit', { tier: 12 })) // 灵品·12:双线皆满
    expect(kept.keep).toBe(true)
    expect(kept.reason).toBe('灵品·12阶,双线皆满')
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

  describe('清理预告 sweepTargets —— 依当前规则列出将化的件(弱者在前,带理由)', () => {
    it('无缘件全数入选并带理由;上锁者豁免', () => {
      const plain1 = mk('p1', 'mortal', { tier: 1 })
      const plain2 = mk('p2', 'mortal', { tier: 4 })
      const locked = mk('lk', 'mortal', { locked: true })
      const targets = sweepTargets([plain1, plain2, locked])
      expect(targets.length).toBe(2)
      expect(targets.every(t => t.reason.length > 0)).toBe(true)
      expect(targets.some(t => t.item.uid === 'lk')).toBe(false)
    })

    it('已留之件(淬养/成套/词条近满/品质线/阶级线)一支不落进名单', () => {
      const invested = mk('lv', 'mortal', { level: 5 })
      const setPiece = mk('set1', 'mortal', { templateId: 'w_xuantie' }) // 铁壁共鸣套件
      const perfect = mk('pf', 'excellent', { affixes: [{ id: 'atk1', roll: 0.95 }, { id: 'def1', roll: 0.88 }] })
      const qualityKept = mk('hq', 'spirit', { tier: 8 }) // 品质线侧:灵品·8 阶(双线皆满)
      const settings = useSettingsStore()
      settings.smartKeep.keepMinTier = 8
      const tierKept = mk('t8', 'spirit', { tier: 9 }) // 阶级线侧:灵品·9 阶(双线皆满)
      expect(sweepTargets([invested, setPiece, perfect, qualityKept, tierKept])).toEqual([])
    })

    it('排序与挤位同一把尺:弱者在前,已留之件不占位', () => {
      const weak = mk('w1', 'mortal', { tier: 1 })
      const tall = mk('w3', 'mortal', { tier: 9 })
      const keptByQuality = mk('q1', 'spirit', { tier: 1 }) // 品质线已留,不进名单
      const uids = sweepTargets([tall, keptByQuality, weak]).map(t => t.item.uid)
      expect(uids).toEqual(['w1', 'w3'])
    })
  })
})
