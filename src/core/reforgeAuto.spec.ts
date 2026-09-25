/**
 * 自动重铸(玩家反馈:「一键快速重铸多次,且洗到指定词条就停,可指定数值范围」)。
 *
 * 判据与手动连点完全等价:逐次照常消耗/长技艺,只把提示合成一条。
 * 这里用「封存一条 = 它必被保留」这一确定性,把「洗出目标」钉成可测的:
 * 目标词条用封存锁住,首次重铸必命中 → 应在 1 次内收手。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useLoreStore } from '@/stores/lore'
import { autoReforge, refRoleMatches, reforgeCost } from './reforge'
import { gn } from '@/utils/gnum'

/** rng:重掷条数取区间下沿即可,词条取池中第一项,roll 恒 0.64 */
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return {
    ...mod,
    rng: {
      next: () => 0.64,
      int: (a: number) => a,
      float: (a: number) => a,
      pick: <T,>(arr: readonly T[]): T => arr[0]!,
      weighted: <T,>(arr: readonly T[]): T => arr[0]!,
      chance: () => true
    }
  }
})

/** 一件 4 阶天品武器:封存「破军(atk2)」,其余位可重掷 */
function forgeWeapon(): string {
  const inv = useInventoryStore()
  inv.items = [
    {
      uid: 'w1',
      templateId: 'w_hanfeng',
      quality: 'heaven',
      tier: 4,
      level: 0,
      affixes: [
        { id: 'atk2', roll: 0.5 },
        { id: 'def2', roll: 0.5 }
      ],
      sealedAffixIds: ['atk2']
    }
  ]
  return 'w1'
}

function giveWealth(): void {
  const res = useResourcesStore()
  res.addSmall('dust', 100_000)
  res.addStone(gn(1e12))
}

describe('自动重铸', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('封存的目标词条必被保留:首次重铸即命中,1 次收手并记账', () => {
    giveWealth()
    const uid = forgeWeapon()
    const out = autoReforge(uid, [{ affixId: 'atk2' }], 20)
    expect(out.stop).toBe('target')
    expect(out.rolls).toBe(1)
    expect(out.hit?.id).toBe('atk2')
    expect(out.dust).toBeGreaterThan(0)
    expect(out.affixIds).toContain('atk2')
  })

  it('带最低 roll 的目标:命中线过了才算(0.9 的要求对 0.64 不出手)', () => {
    giveWealth()
    const uid = forgeWeapon()
    const out = autoReforge(uid, [{ affixId: 'atk2', minRoll: 0.9 }], 3)
    expect(out.stop, '0.64 够不着 0.9,应撞预算').toBe('budget')
    expect(out.rolls).toBe(3)
  })

  it('预算用光没洗到:按预算次数收手,不硬刷', () => {
    giveWealth()
    const uid = forgeWeapon()
    const out = autoReforge(uid, [], 5)
    expect(out.stop).toBe('budget')
    expect(out.rolls).toBe(5)
  })

  it('灵石见底:洗到没钱就停,不负债', () => {
    const uid = forgeWeapon()
    // 只给刚好一次重铸的灵石
    const item = useInventoryStore().findItem(uid)!
    const cost = reforgeCost(item)!
    useResourcesStore().addStone(cost.stone)
    useResourcesStore().addSmall('dust', cost.dust)
    const out = autoReforge(uid, [], 50)
    expect(out.stop).toBe('broke')
    expect(out.rolls).toBe(1)
  })

  it('refRoleMatches:任一目标命中即返回;minRoll 过滤', () => {
    const inst: import('@/types').EquipmentInstance = {
      uid: 'x',
      templateId: 'w_hanfeng',
      quality: 'heaven',
      tier: 4,
      level: 0,
      affixes: [
        { id: 'atk2', roll: 0.3 },
        { id: 'def3', roll: 0.8 }
      ]
    }
    expect(refRoleMatches(inst, [{ affixId: 'def3' }])).toEqual({ id: 'def3', roll: 0.8 })
    expect(refRoleMatches(inst, [{ affixId: 'atk2', minRoll: 0.5 }]), '0.3 够不着 0.5').toBeNull()
    expect(refRoleMatches(inst, [{ affixId: 'atk2', minRoll: 0.2 }])).toEqual({ id: 'atk2', roll: 0.3 })
    expect(refRoleMatches(inst, [{ affixId: 'nope' }])).toBeNull()
  })

  it('重铸会涨铭纹技艺 —— 铭纹不再是永远的生疏', () => {
    giveWealth()
    const uid = forgeWeapon()
    const before = useLoreStore().skillLevel('inscribe')
    autoReforge(uid, [{ affixId: 'atk2' }], 20)
    expect(useLoreStore().skillLevel('inscribe')).toBeGreaterThan(before)
  })
})
