/**
 * 词条转移面板的进度(议题 #22)—— 选到哪一步、主按钮上写什么、确认何时作废
 *
 * 判据与价签都在 core/affixTransfer(那边有自己的用例);这里只管流程:
 *   一 主按钮上的字依次是「未选词条 → 未选目标 → 可转」,缺料时写缺哪样;源件转空写「暂无词条」;
 *   二 默认落位:目标未满 → 新增;目标有更低的同一条 → 覆盖它;目标已满且有多条可顶 → 不替玩家选;
 *      再点一下已选的词条或目标不算改选,不把手选的落位改回默认;
 *   三 二步确认:按下第一步后改了任何一项(封存、位置、目标),确认自动作废;
 *      进确认态 400ms 内的「确认转移」不作数(两颗按钮在同一位置,连点两下不该跳过确认);
 *   四 「同时封存」默认勾着,但这一落位封不了时照样能转(界面说行,服务就得做成);
 *   五 做成之后留在面板里,目标保持选中、词条与位置清空;换了源件,进度全部作废。
 * 故障注入:preselect 恒返回 undefined → 第二条红;confirm 把 seal 改传 state.sealWanted → 第四条红。
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

/** 按下「转 移」,等过连点闸,再按「确认转移」 */
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
      // 两条封一条:顶替未封那条后仍是两条一封,封不了
      mk('capped', [['def1', 0.5], ['hp1', 0.5]], 'heaven', { sealedAffixIds: ['def1'] }),
      // 零条件:新增后只有一条,可封上限为 0
      mk('bare', [])
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

  it('再点一下已选的词条或目标,不把手选的落位改回默认', () => {
    const flow = useAffixTransfer('src')
    flow.pickAffix('atk3')
    flow.pickTarget('open')
    flow.pickSlot('hp1')
    flow.pickTarget('open')
    expect(flow.replaceId).toBe('hp1')
    flow.pickAffix('atk3')
    expect(flow.replaceId).toBe('hp1')
    // 切换封存也不丢已选位置
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
    // 没按第一步,直接确认不算数
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
    // 取消之后紧接着那一下(落在「返回」上)由页脚按 settling 挡掉
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
    // 封满件:顶替未封那条
    const a = useAffixTransfer('src')
    a.pickAffix('atk3')
    a.pickTarget('capped')
    a.pickSlot('hp1')
    expect(a.sealWanted).toBe(true)
    expect(a.plan?.sealMode).toBe('none')
    expect(a.blockLabel).toBeNull()
    expect(armAndConfirm(a)).toBe(true)
    expect(inventory.findItem('capped')!.sealedAffixIds).toEqual(['def1'])
    // 零条件:新增后只有一条,可封上限为 0
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
