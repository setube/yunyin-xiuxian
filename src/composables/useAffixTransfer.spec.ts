/**
 * 词条转移面板流程(议题 #22)。判据与价签归 core/affixTransfer 的用例。
 * 故障注入:preselect 恒返回 undefined → 「默认落位」用例红;confirm 把 seal 改传 state.sealWanted → 「同时封存」用例红。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAffixTransfer } from './useAffixTransfer'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { gn } from '@/utils/gnum'
import type { EquipmentInstance } from '@/types'

function mk(uid: string, affixes: [string, number][], quality: EquipmentInstance['quality'] = 'heaven', patch: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return { uid, templateId: 'w_hanfeng', quality, tier: 20, level: 0, affixes: affixes.map(([id, roll]) => ({ id, roll })), ...patch }
}

const FULL: [string, number][] = [
  ['atk1', 0.5],
  ['def1', 0.5],
  ['hp1', 0.5],
  ['cult1', 0.5],
  ['gain1', 0.5],
  ['spd1', 0.5],
  ['dmg1', 0.5]
]

/** 等过连点闸再确认 */
function armAndConfirm(flow: ReturnType<typeof useAffixTransfer>): boolean {
  flow.arm()
  vi.advanceTimersByTime(400)
  return flow.confirm()
}

describe('词条转移面板 · 流程', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const inventory = useInventoryStore()
    inventory.items = [
      mk('src', [['atk3', 0.9], ['def3', 0.8]]),
      mk('open', [['hp1', 0.5]]),
      mk('full', FULL),
      mk('low', [['atk3', 0.2], ['hp1', 0.5]]),
      // 两条封一条:顶替未封那条后仍两条一封,封不了
      mk('capped', [['def1', 0.5], ['hp1', 0.5]], 'heaven', { sealedAffixIds: ['def1'] }),
      // 零条件:新增后只有一条,可封上限为 0
      mk('bare', []),
      // 已有同一条且数值更高:转入之后比它低,`targetBlock` 直接判 dup
      mk('samedup', [['atk3', 0.95]])
    ]
    const resources = useResourcesStore()
    resources.spiritStone = gn(1e300)
    resources.dust = 1e12
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('主按钮的字依次报还差哪一步;缺料时报缺哪样', () => {
    const flow = useAffixTransfer('src')
    expect(flow.blockLabel).toBe('未选词条')
    flow.pickAffix('atk3')
    expect(flow.blockLabel).toBe('未选目标')
    flow.pickTarget('open')
    expect(flow.replaceId, '目标未满,默认新增').toBeNull()
    expect(flow.blockLabel).toBeNull()
    useResourcesStore().dust = 0
    expect(flow.blockLabel).toMatch(/^器灵尘尚差 \d+$/)
  })

  it('默认落位:未满 → 新增;有更低的同一条 → 覆盖它;已满且多条可顶 → 不替玩家选', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    expect(flow.replaceId).toBeNull()
    flow.pickTarget('low')
    expect(flow.replaceId, '同一条只能覆盖它自己').toBe('atk3')
    flow.pickTarget('full')
    expect(flow.replaceId).toBeUndefined()
    expect(flow.blockLabel).toBe('未选位置')
  })

  /*
   * 目标「封死」时的拒因要报出来,而不是回落到「已不在行囊」。
   *
   * `blockLabel` 里那一支是 `if (!c.ok) return transferBlockText(c.block, state.affixId)`,
   * 变异扫描报它改坏不红 —— 因为上面几条用例走的都是「能转」或「差几步」,
   * 从没让 `check` 返回 `ok: false`。去掉那一行会落到末尾的 `return null`,
   * 主按钮就成了「可转」,点下去才被拒。
   *
   * 夹具:目标 `samedup` 已带着同一条 `atk3` 且数值更高(0.95 对源的 0.9),
   * `targetBlock` 直接给 `block: 'dup'` —— 主按钮该写「已有此条」。
   * 这条拒因只在 `check` 返回 ok:false 时才出现,去掉那一行会落到末尾的
   * `return null`,按钮写成「可转」,玩家点下去才被拒。
   *
   * 为什么不用「封存满」那条:`sealedPlan` 在封存口径被拒时返回 null,
   * `check` 会回落到不封存的 `basePlan`(ok:true)—— 那个拒因走的是
   * `canSeal` 的禁用态,不经过 `!c.ok` 这一支。
   */
  it('目标拒收时主按钮写拒因,不写成「可转」', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('samedup')
    /*
     * 目标已有同一条、且数值更高 → 默认落位不给(不替玩家选),故这里要手选。
     * `pickTarget` 之后 `replaceId` 是 undefined(待选),不是 null(新增)。
     */
    expect(flow.replaceId, '已有同条时不替玩家选落位').toBeUndefined()
    flow.pickSlot('atk3')
    expect(flow.check?.ok, '夹具没造出拒收态 —— 目标已有更高数值的同一条应被拒').toBe(false)
    expect(flow.blockLabel, '拒收时不该报「可转」').not.toBeNull()
    expect(flow.blockLabel, '拒收时该报「已有此条」').toBe('已有此条')
  })

  it('再点一下已选的词条或目标,不把手选的落位改回默认', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    flow.pickSlot('hp1')
    flow.pickTarget('open')
    expect(flow.replaceId).toBe('hp1')
    flow.pickAffix('atk3')
    expect(flow.replaceId).toBe('hp1')
    flow.toggleSeal()
    expect(flow.replaceId).toBe('hp1')
  })

  it('二步确认:改了封存、位置或目标,确认自动作废', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('full')
    flow.pickSlot('def1')
    flow.arm()
    expect(flow.armed).toBe(true)
    flow.toggleSeal()
    expect(flow.armed, '封存改了').toBe(false)
    flow.arm()
    expect(flow.armed).toBe(true)
    flow.pickSlot('hp1')
    expect(flow.armed, '位置改了').toBe(false)
    flow.arm()
    expect(flow.armed).toBe(true)
    flow.pickTarget('open')
    expect(flow.armed, '目标改了').toBe(false)
    // 没按第一步,确认不算数
    vi.advanceTimersByTime(400)
    expect(flow.confirm()).toBe(false)
  })

  it('连点两下不跳过确认:进确认态 400ms 内的「确认转移」不作数,刚取消的那一下也不退出', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    flow.arm()
    vi.advanceTimersByTime(150)
    expect(flow.confirm(), '第二下落在换出来的「确认转移」上').toBe(false)
    expect(useInventoryStore().findItem('src')!.affixes).toHaveLength(2)
    vi.advanceTimersByTime(300)
    expect(flow.confirm()).toBe(true)
    // 取消后紧接着那一下(落在「返回」上)由页脚按 settling 挡掉
    flow.pickAffix('def3')
    flow.arm()
    vi.advanceTimersByTime(400)
    flow.disarm()
    expect(flow.settling()).toBe(true)
    vi.advanceTimersByTime(400)
    expect(flow.settling()).toBe(false)
  })

  it('确认态随可否失效:按下第一步后资源被别处花掉,退回未确认,按钮写缺什么', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    flow.arm()
    expect(flow.armed).toBe(true)
    useResourcesStore().dust = 0
    expect(flow.armed).toBe(false)
    expect(flow.blockLabel).toMatch(/^器灵尘尚差 \d+$/)
  })

  it('「同时封存」默认勾着,但这一落位封不了时照样能转,目标封存不变', () => {
    const inventory = useInventoryStore()
    // 封满件
    const a = useAffixTransfer('src')
    a.pickAffix('atk3')
    a.pickTarget('capped')
    a.pickSlot('hp1')
    expect(a.sealWanted).toBe(true)
    expect(a.plan?.sealMode).toBe('none')
    expect(a.blockLabel).toBeNull()
    expect(armAndConfirm(a)).toBe(true)
    expect(inventory.findItem('capped')!.sealedAffixIds).toEqual(['def1'])
    // 零条件
    const b = useAffixTransfer('src')
    b.pickAffix('def3')
    b.pickTarget('bare')
    expect(b.replaceId).toBeNull()
    expect(b.plan?.sealMode).toBe('none')
    expect(b.blockLabel).toBeNull()
    expect(armAndConfirm(b)).toBe(true)
    expect(inventory.findItem('bare')!.affixes.map(x => x.id)).toEqual(['def3'])
    expect(inventory.findItem('bare')!.sealedAffixIds).toEqual([])
  })

  it('做成之后留在面板:源件少一条,目标仍选中,词条与位置清空', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    expect(armAndConfirm(flow)).toBe(true)
    const inventory = useInventoryStore()
    expect(inventory.findItem('src')!.affixes.map(a => a.id)).toEqual(['def3'])
    expect(inventory.findItem('open')!.affixes.map(a => a.id)).toEqual(['hp1', 'atk3'])
    expect(inventory.findItem('open')!.sealedAffixIds, '默认同时封存').toEqual(['atk3'])
    expect(flow.targetUid).toBe('open')
    expect(flow.affixId).toBeNull()
    expect(flow.replaceId).toBeUndefined()
    expect(flow.armed).toBe(false)
  })

  it('源件转空之后,主按钮写「暂无词条」而不是「未选词条」', () => {
    const inventory = useInventoryStore()
    inventory.items = [...inventory.items, mk('one', [['atk3', 0.9]])]
    const flow = useAffixTransfer('one')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    expect(armAndConfirm(flow)).toBe(true)
    expect(inventory.findItem('one')!.affixes).toEqual([])
    expect(flow.blockLabel).toBe('暂无词条')
  })

  it('换了源件,进度全部作废', async () => {
    const uid = ref<string | null>('src')
    const flow = useAffixTransfer(uid)
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    uid.value = 'low'
    await nextTick()
    expect(flow.affixId).toBeNull()
    expect(flow.targetUid).toBeNull()
    expect(flow.blockLabel).toBe('未选词条')
  })
})
