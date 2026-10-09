/**
 * 构筑快照 store —— 深度修形 / 上限 / 增删改 / 换装接线
 *
 * 构筑是持久化分片里嵌套最深的一类(each 槽位 → uid 的 equipment 表、
 * subGongfa/artifactIds 数组、savedAt),此前只有 storeResilience 的「恶意值不炸」红线
 * 兜着(不炸 ≠ 值修对了),一旦 applyLoadout 在换装时踩到 Object.keys/.filter 里的
 * null / 非数组,就是一场白屏(见 loadouts.sanitize 的注释)。这里把 value-correction
 * 逐条钉死。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoadoutsStore, MAX_LOADOUTS, type Loadout } from './loadouts'
import { applyLoadout } from '@/core/loadoutService'
import { useInventoryStore } from './inventory'

function mk(id: string, over: Partial<Loadout> = {}): Loadout {
  return { id, name: id, seal: '道', mainGongfa: null, subGongfa: [], artifactIds: [], equipment: {}, savedAt: 1, ...over }
}

describe('构筑 · sanitize 深度修形', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('嵌套坏值逐项归位,坏条目(id 非字符串)整条丢弃,不炸', () => {
    const l = useLoadoutsStore()
    l.$patch({
      list: [
        // 正常条目 + 深坏值:名字/印/功法/数组/equipment 表/时刻全被写坏
        {
          id: 'x',
          name: 42,
          seal: null,
          mainGongfa: 7,
          subGongfa: 42,
          artifactIds: null,
          equipment: { weapon: NaN, head: 'u1', body: 5 },
          savedAt: 'bad'
        },
        { id: 99, name: '扔', equipment: {}, savedAt: 2 } // id 非字符串 → 整条丢
      ]
    } as never)
    l.sanitize()
    expect(l.list).toHaveLength(1)
    const lo = l.list[0]!
    expect(lo.id).toBe('x')
    expect(lo.name, '非字符串名字回落空串').toBe('')
    expect(lo.seal, '非字符串印回落空串').toBe('')
    expect(lo.mainGongfa, '非字符串功法回落 null').toBeNull()
    expect(lo.subGongfa, 'string-array 过滤:42 被剔为空').toEqual([])
    expect(lo.artifactIds, 'string-array 过滤:null 变空').toEqual([])
    expect(lo.equipment, 'equipment 只留合法字符串 uid,剔 NaN/纯数字').toEqual({ head: 'u1' })
    expect(lo.savedAt, '非数字时刻夹回 ≥0(0)').toBe(0)
  })

  it('正常构筑过 sanitize 不被误伤', () => {
    const l = useLoadoutsStore()
    const clean = mk('a', { subGongfa: ['g1'], artifactIds: ['art1'], equipment: { weapon: 's1' }, savedAt: 500 })
    l.$patch({ list: [clean] } as never)
    l.sanitize()
    expect(l.list[0]).toEqual(clean)
  })
})

describe('构筑 · 上限与增删改', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('至多 MAX_LOADOUTS 套,满了收纳被拒', () => {
    const l = useLoadoutsStore()
    for (let i = 0; i < MAX_LOADOUTS; i += 1) expect(l.add(mk(`a${i}`)), `第 ${i + 1} 套应收下`).toBe(true)
    expect(l.add(mk('over')), `满 ${MAX_LOADOUTS} 套后不再收纳`).toBe(false)
    expect(l.list).toHaveLength(MAX_LOADOUTS)
  })

  it('add/rename/remove 各自生效', () => {
    const l = useLoadoutsStore()
    l.add(mk('a'))
    l.add(mk('b'))
    l.rename('a', '甲')
    expect(l.list.find(x => x.id === 'a')!.name).toBe('甲')
    l.remove('a')
    expect(l.list.map(x => x.id)).toEqual(['b'])
  })
})

describe('构筑 · 换装接线(applyLoadout)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('换装选对那件装备并真正穿上(值级断言,不止于不炸)', () => {
    const inv = useInventoryStore()
    // 一件青竹剑(模板槽=武器)躺在多挂里,尚未穿着
    inv.$patch({ items: [{ uid: 'sword1', templateId: 'w_zhuqing', quality: 'fine', tier: 1, level: 0, affixes: [] }] })
    const l = useLoadoutsStore()
    l.add(mk('load1', { name: '剑修', equipment: { weapon: 'sword1' } }))
    expect(applyLoadout('load1')).toBe(true)
    expect(inv.equipped['weapon'], '切换后武器槽应穿上 sword1').toBe('sword1')
  })

  it('换装缺件的槽不乱穿:uid 对应的件不存在时不抛、不脏穿', () => {
    const inv = useInventoryStore()
    const l = useLoadoutsStore()
    l.add(mk('load2', { equipment: { weapon: 'ghost' } })) // ghost 不存在
    expect(applyLoadout('load2')).toBe(true)
    expect(inv.equipped['weapon'], '缺件槽不该被穿上').toBeUndefined()
  })
})
