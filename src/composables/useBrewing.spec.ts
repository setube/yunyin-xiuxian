import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { recipeCraft } from '@/data/crafting'
import { pillDef } from '@/data/pills'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoreStore } from '@/stores/lore'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 炉前存货账 —— 方子行报「存 N」。
 *
 * 缺口:开炉弹窗此前只摊把握、代价与短差,不摊行囊里已存几枚。玩家看着
 * 九成把握按下炼制,行囊里可能已躺着八枚,容易重复炼制。
 *
 * 判据同源:存货读 inventory.pills(与丹匣同一份账),不另数一遍。
 */

import { useBrewing } from './useBrewing'

function knowRecipe(id: string): void {
  const lore = useLoreStore()
  lore.addRecipeMastery(id, 0.8)
  for (const mid of recipeCraft(pillDef(id)!)!.materials) lore.advanceLore(mid, 3)
}

function rowOf(id: string): ReturnType<typeof useBrewing>['recipes']['value'][number] {
  const row = useBrewing().recipes.value.find(r => r.def.id === id)
  if (!row) throw new Error(`方子 ${id} 不在清单里`)
  return row
}

describe('炉前存货账(存 N · 药力状态)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('存 N 读 inventory.pills:与丹匣同一份账,入包后行读数跟着变', () => {
    knowRecipe('p_ningshen')
    const inventory = useInventoryStore()
    expect(rowOf('p_ningshen').stock).toBe(0)

    inventory.addPill('p_ningshen', 3)
    expect(rowOf('p_ningshen').stock).toBe(3)
    expect(rowOf('p_ningshen').stock).toBe(inventory.pills.p_ningshen ?? 0)

    inventory.spendPill('p_ningshen')
    expect(rowOf('p_ningshen').stock).toBe(2)
  })

  it('方子行真的把存货写出来,并与丹匣读同一份账', () => {
    knowRecipe('p_ningshen')
    useInventoryStore().addPill('p_ningshen', 8)
    expect(rowOf('p_ningshen').stock).toBe(8)
    const dialog = readFileSync(join(__dirname, '../components/inventory/BrewingDialog.vue'), 'utf8')
    expect(dialog, '方子行要写出行囊存量').toContain('存 {{ r.stock }}')
  })
})

describe('炉前药力账(已顶 · 将顶)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('增益丹按 buffOverflowOf 报状态:顶满已顶、再服只续到顶则将顶,即时丹不误报', () => {
    const t0 = 2_000_000
    vi.setSystemTime(t0)
    knowRecipe('p_juling')
    knowRecipe('p_jvqisan')
    const cultivation = useCultivationStore()
    // 单颗一炷香(30 分):连服 16 颗正好顶到四个时辰
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)

    expect(rowOf('p_juling').overflow, '已到四个时辰上限').toBe('full')
    expect(rowOf('p_jvqisan').overflow, '即时丹没有药力状态').toBeNull()

    vi.setSystemTime(t0 + 900_000)
    expect(rowOf('p_juling').overflow, '余 15 分钟时再服一颗会越过上限').toBe('partial')
  })

  it('方子行真的写出两档状态,措辞与丹匣同族', () => {
    const dialog = readFileSync(join(__dirname, '../components/inventory/BrewingDialog.vue'), 'utf8')
    expect(dialog).toContain("r.overflow === 'full'")
    expect(dialog).toContain('已顶')
    expect(dialog).toContain("r.overflow === 'partial'")
    expect(dialog).toContain('将顶')
    const composable = readFileSync(join(__dirname, 'useBrewing.ts'), 'utf8')
    expect(composable, '药力判据读游戏钟,药效到期后状态自己复位').toContain(
      'buffOverflowOf(cultivation.buffs, def.buffId, now.value)'
    )
  })
})
