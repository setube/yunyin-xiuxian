/**
 * 分解返还 —— 练过的件拆了,强化投入按八成退回来
 * 应有之物(O):分解/回收一件装备,除了底材那份器灵尘,还要把强化花掉的那笔
 * 尘与灵石退回八成;账以实例上记的投入为准,老档按标价补算。
 * 不该有的(X):返还超过实际投入 —— 那会变成「强化再拆」的套利。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { EquipmentInstance, QualityId } from '@/types'
import { DECOMPOSE_DUST, DECOMPOSE_REFUND_RATE } from '@/data/constants'
import { qualityDef } from '@/data/qualities'
import { cmp, gn, toNum } from '@/utils/gnum'
import { upgradeCost } from './formulas'
import { enhanceInvested, salvageOf, salvageRefundPhrase } from './salvage'
import { decomposeByRanks, decomposeEquipment, upgradeEquipment, upgradeEquipmentBatch } from './forge'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'

function mk(uid: string, quality: QualityId, level = 0, tier = 5): EquipmentInstance {
  return { uid, templateId: 'b_qingyun', quality, tier, level, affixes: [] }
}

describe('分解返还 · 强化投入的八成随件退回', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('0 级的件只给底材,不涉及灵石', () => {
    const got = salvageOf(mk('a', 'profound'))
    expect(got.dust).toBe(DECOMPOSE_DUST[qualityDef('profound').rank])
    expect(toNum(got.stone)).toBe(0)
  })

  it('练过的件:尘与灵石各退投入的八成', () => {
    for (const quality of ['fine', 'profound', 'heaven'] as const) {
      for (const level of [1, 3, 7]) {
        const item = mk('b', quality, level, 9)
        const spent = enhanceInvested(item)
        const got = salvageOf(item)
        const base = DECOMPOSE_DUST[qualityDef(quality).rank] ?? 0
        expect(got.dust).toBe(base + Math.floor(spent.dust * DECOMPOSE_REFUND_RATE))
        expect(toNum(got.stone)).toBeCloseTo(toNum(spent.stone) * DECOMPOSE_REFUND_RATE, 6)
        expect(toNum(got.stone)).toBeGreaterThan(0)
      }
    }
  })

  it('老档(件上没记账)按标价补算 —— 与逐级标价之和一致', () => {
    const level = 4
    const spent = enhanceInvested(mk('c', 'spirit', level, 7))
    let dust = 0
    for (let lv = 0; lv < level; lv += 1) dust += upgradeCost(lv, 7, qualityDef('spirit').rank, 0).dust
    expect(spent.dust).toBe(dust)
  })

  it('任何等级与品质下,返还都不超过投入(「强化再拆」不套利)', () => {
    for (const quality of ['mortal', 'excellent', 'earth', 'divine'] as const) {
      for (const tier of [1, 6, 15]) {
        for (let level = 0; level <= 12; level += 1) {
          const item = mk('d', quality, level, tier)
          const spent = enhanceInvested(item)
          const got = salvageOf(item)
          const base = DECOMPOSE_DUST[qualityDef(quality).rank] ?? 0
          // 底材之外退回来的那份,必须小于投入本身(八成)
          expect(got.dust - base).toBeLessThanOrEqual(spent.dust)
          expect(cmp(got.stone, spent.stone)).toBeLessThan(1)
          // 反方向也要管:练过就该退回来,不能一分不退
          if (spent.dust > 0) {
            expect(got.dust - base).toBeGreaterThan(0)
            expect(toNum(got.stone)).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('强化会把这笔账记在件上,数额与实扣一致', () => {
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    inventory.addEquipment(mk('e', 'earth', 0, 8))
    resources.addSmall('dust', 100000)
    resources.addStone(gn(1e9))
    let spentDust = 0
    for (let i = 0; i < 3; i += 1) {
      spentDust += upgradeCost(i, 8, qualityDef('earth').rank, 0).dust
      expect(upgradeEquipment('e')).toBe(true)
    }
    const after = inventory.findItem('e')!
    expect(after.level).toBe(3)
    expect(after.invested?.dust).toBe(spentDust)
  })

  it('强化缺料时说清缺的是尘还是石:两条去路相反', () => {
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    const ui = useUiStore()
    inventory.addEquipment(mk('g', 'earth', 0, 8))

    // 只缺尘:该去分解闲置装备,不该被指去历练
    resources.addStone(gn(1e30))
    resources.addSmall('dust', 0)
    expect(upgradeEquipment('g')).toBe(false)
    expect(ui.toasts.at(-1)?.text).toContain('器灵尘')
    expect(ui.toasts.at(-1)?.text).not.toContain('灵石')

    // 只缺石:该去历练/悬赏
    resources.spendStone(gn(1e30))
    resources.addSmall('dust', 100_000)
    expect(upgradeEquipment('g')).toBe(false)
    expect(ui.toasts.at(-1)?.text).toContain('灵石')
    expect(ui.toasts.at(-1)?.text).not.toContain('器灵尘')
  })

  it('连升一级都升不动时也按「下一级」的真实报价说缺哪样', () => {
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    const ui = useUiStore()
    inventory.addEquipment(mk('h', 'earth', 0, 8))
    resources.addStone(gn(1e30))
    resources.addSmall('dust', 0)
    expect(upgradeEquipmentBatch('h')).toBe(0)
    expect(ui.toasts.at(-1)?.text).toContain('器灵尘')
  })

  it('分解一件练过的件:到账的就是预告那份(尘 + 灵石)', () => {
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    // 先烧掉一次性成就奖励(「初窥仙途」那类会往灵石里加一笔),免得混进这笔账
    inventory.addEquipment(mk('warmup', 'profound', 5, 9))
    decomposeEquipment('warmup')
    const item = { ...mk('f', 'profound', 5, 9), invested: { dust: 300, stone: { m: 2, e: 5 } } }
    inventory.addEquipment(item)
    const want = salvageOf(item)
    const dustBefore = resources.dust
    const stoneBefore = toNum(resources.spiritStone)
    expect(decomposeEquipment('f')).toBe(true)
    expect(resources.dust - dustBefore).toBe(want.dust)
    expect(toNum(resources.spiritStone) - stoneBefore).toBeCloseTo(toNum(want.stone), 6)
    expect(inventory.findItem('f')).toBeUndefined()
  })

  it('上锁的件不分解', () => {
    const inventory = useInventoryStore()
    inventory.addEquipment({ ...mk('g', 'fine'), locked: true })
    expect(decomposeEquipment('g')).toBe(false)
    expect(inventory.findItem('g')).toBeDefined()
  })

  it('一键分解:按一次总账报出来,数字与逐件之和一致', () => {
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    const ui = useUiStore()
    // 同上:一次性成就奖励先烧掉
    inventory.addEquipment(mk('warmup', 'fine', 0, 6))
    decomposeEquipment('warmup')
    for (const t of [...ui.toasts]) ui.dismissToast(t.id)
    const targets = [mk('h1', 'fine', 2, 6), mk('h2', 'fine', 0, 6), mk('h3', 'fine', 4, 6)]
    for (const it of targets) inventory.addEquipment(it)
    inventory.addEquipment(mk('keep', 'heaven', 3, 6)) // 没勾选的档,动不得
    const want = targets.reduce((sum, it) => sum + salvageOf(it).dust, 0)
    const dustBefore = resources.dust
    expect(decomposeByRanks([qualityDef('fine').rank])).toBe(3)
    expect(resources.dust - dustBefore).toBe(want)
    expect(inventory.findItem('keep')).toBeDefined()
    // 逐件弹提示只会互相顶掉(提示窗只留 5 条),批量只报一条总账
    expect(ui.toasts.filter(t => /此器化尘/.test(t.text))).toHaveLength(0)
    const ledger = ui.toasts.find(t => /炉中化去 3 件,得器灵尘×\d+/.test(t.text))
    expect(ledger).toBeDefined()
    // 总账报了实物所得,按正结果播报(success);写 info 时配色与提示音都停在「中性」档
    expect(ledger?.kind).toBe('success')
  })
})

describe('分解返还文案', () => {
  it('八成两个字跟 DECOMPOSE_REFUND_RATE 走,详情与提示都调用同一句', () => {
    expect(salvageRefundPhrase()).toContain(`${Math.round(DECOMPOSE_REFUND_RATE * 100)}%`)
    const dialog = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
    const forge = readFileSync(resolve(__dirname, './forge.ts'), 'utf8')
    expect(dialog).toContain('salvageRefundPhrase()')
    expect(forge).toContain('salvageRefundPhrase()')
    expect(dialog).not.toContain('含强化八成')
    expect(forge).not.toContain('含强化八成')
  })
})
