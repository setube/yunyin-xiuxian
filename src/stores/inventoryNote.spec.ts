/**
 * 装备标记(玩家反馈:「同名装备想按不同流派区分」)。
 *
 * EquipmentInstance 新增可选 note(≤4 字):详情弹窗可改,格卡/部位行带出。
 * 这里钉住一件事 —— 它得**熬得过读档清洗**(inventory.sanitize):
 * 老档/未标记件的 note 是 undefined,不该被清洗误填或去掉。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'

describe('装备标记', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('写了标记的绕过读档清洗照旧在', () => {
    const inv = useInventoryStore()
    inv.items = [{ uid: 'u1', templateId: 'w_hanfeng', quality: 'heaven', tier: 4, level: 0, affixes: [], note: '攻速' }]
    inv.sanitize()
    expect(inv.findItem('u1')!.note, '清洗不该把标记洗掉').toBe('攻速')
  })

  it('未标记的件 note 为 undefined,不占位', () => {
    const inv = useInventoryStore()
    inv.items = [{ uid: 'u2', templateId: 'w_hanfeng', quality: 'fine', tier: 3, level: 0, affixes: [] }]
    inv.sanitize()
    expect(inv.findItem('u2')!.note).toBeUndefined()
  })
})
