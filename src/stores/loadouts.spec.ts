/**
 * 构筑快照 store:深度修形 / 上限 / 增删改 / 换装接线。
 * storeResilience 只钉「恶意值不炸」;这里钉修形后的值。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoadoutsStore, MAX_LOADOUTS, type Loadout } from './loadouts'
import { applyLoadout } from '@/core/loadoutService'
import { useInventoryStore } from './inventory'
import { SUB_GONGFA_SLOT_HARD_CAP } from '@/data/constants'
import { ARTIFACT_MAX_SLOTS } from '@/data/artifacts'

function mk(id: string, over: Partial<Loadout> = {}): Loadout {
  return { id, name: id, seal: '道', mainGongfa: null, subGongfa: [], artifactIds: [], equipment: {}, savedAt: 1, ...over }
}

describe('构筑 · sanitize 深度修形', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('嵌套坏值逐项归位,坏条目(id 非字符串)整条丢弃,不炸', () => {
    const l = useLoadoutsStore()
    l.$patch({
      list: [
        // 深坏值:名字/印/功法/数组/equipment 表/时刻全坏
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
        { id: 99, name: '扔', equipment: {}, savedAt: 2 }
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

  it('同号构筑重排 id:两套都留、各自可切可删,不相互误伤', () => {
    const l = useLoadoutsStore()
    l.$patch({ list: [mk('dup', { name: '甲' }), mk('dup', { name: '乙' })] } as never)
    l.sanitize()
    expect(l.list, '两套都留下').toHaveLength(2)
    const ids = l.list.map(x => x.id)
    expect(new Set(ids).size, 'id 必须唯一').toBe(2)
    expect(l.list.map(x => x.name), '名字/内容不串').toEqual(['甲', '乙'])

    l.rename(ids[1]!, '乙改')
    expect(l.list.map(x => x.name), '改名只动目标那套').toEqual(['甲', '乙改'])
    l.remove(ids[0]!)
    expect(l.list.map(x => x.name), '删一套不漏另一套').toEqual(['乙改'])
  })

  it('快照里重复的辅修/法宝去重,应用时不重复占槽', () => {
    const l = useLoadoutsStore()
    l.$patch({
      list: [mk('a', { subGongfa: ['g1', 'g1'], artifactIds: ['art1', 'art1'] })]
    } as never)
    l.sanitize()
    expect(l.list[0]!.subGongfa, '同门辅修只留一次').toEqual(['g1'])
    expect(l.list[0]!.artifactIds, '同一件法宝只留一次').toEqual(['art1'])

    // 未过 sanitize 的快照(内存直塞重复)应用时同样不重复占槽
    const raw = mk('raw', { subGongfa: ['g1', 'g1'], artifactIds: ['art1', 'art1'] })
    l.$patch({ list: [raw] } as never)
    const inv = useInventoryStore()
    inv.$patch({ artifacts: [{ defId: 'art1', level: 0 }], equippedArtifacts: [] } as never)
    applyLoadout('raw')
    expect(inv.equippedArtifacts, '应用重复快照也只装备一次').toEqual(['art1'])
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

  it('公共写入挡住坏 id 与重复 id,不出现删一套误删另一套', () => {
    const l = useLoadoutsStore()
    expect(l.add(mk('dup'))).toBe(true)
    expect(l.add(mk('dup', { name: '第二套' })), '同号第二套不收').toBe(false)
    expect(l.list).toHaveLength(1)
    expect(l.add({ ...mk('bad'), id: '' }), '空 id 不收').toBe(false)
    l.rename('missing', '无关')
    expect(l.list[0]!.name).toBe('dup')
    l.remove('missing')
    expect(l.list, '删不存在的 id 不动现有快照').toHaveLength(1)
    l.$patch({ list: [mk(''), mk('keep')] } as never)
    l.remove('')
    expect(l.list.map(x => x.id), '空 id 不能当成「删全部空号」').toEqual(['', 'keep'])
  })
})

describe('构筑 · 换装接线(applyLoadout)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('换装选对那件装备并真正穿上(值级断言,不止于不炸)', () => {
    const inv = useInventoryStore()
    // 青竹剑(模板槽=武器),未穿着
    inv.$patch({ items: [{ uid: 'sword1', templateId: 'w_zhuqing', quality: 'fine', tier: 1, level: 0, affixes: [] }] })
    const l = useLoadoutsStore()
    l.add(mk('load1', { name: '剑修', equipment: { weapon: 'sword1' } }))
    expect(applyLoadout('load1')).toBe(true)
    expect(inv.equipped['weapon'], '切换后武器槽应穿上 sword1').toBe('sword1')
  })

  /*
   * 构筑 id 不存在 —— 与「构筑存在但件缺失」是两个守卫。
   * 变异扫描报 `if (!loadout) return false` 改坏不红:去掉后 `loadout.equipment`
   * 直接抛 TypeError。入参 id 可能来自存档字符串或过期 UI 快照。
   */
  it('换装:构筑 id 不存在时返回 false,不抛也不动任何槽', () => {
    const inv = useInventoryStore()
    inv.$patch({ items: [{ uid: 'sword1', templateId: 'w_zhuqing', quality: 'fine', tier: 1, level: 0, affixes: [] }] })
    const before = JSON.parse(JSON.stringify(inv.equipped))
    expect(() => applyLoadout('no_such_loadout'), '过期构筑 id 不该抛').not.toThrow()
    expect(applyLoadout('no_such_loadout')).toBe(false)
    expect(inv.equipped, '没换成就一个槽都不许动').toEqual(before)
  })

  it('换装缺件的槽不乱穿:uid 对应的件不存在时不抛、不脏穿', () => {
    const inv = useInventoryStore()
    const l = useLoadoutsStore()
    l.add(mk('load2', { equipment: { weapon: 'ghost' } }))
    expect(applyLoadout('load2')).toBe(true)
    expect(inv.equipped['weapon'], '缺件槽不该被穿上').toBeUndefined()
  })

  it('快照里的野槽名被清掉,那件装备留在行囊里看得见', () => {
    const inv = useInventoryStore()
    inv.$patch({ items: [{ uid: 'sword1', templateId: 'w_zhuqing', quality: 'fine', tier: 1, level: 0, affixes: [] }] })
    const l = useLoadoutsStore()
    l.$patch({ list: [mk('bad', { equipment: { artifact: 'sword1' } as never })] } as never)
    l.sanitize()
    expect(l.list[0]!.equipment, '野槽名不留在快照里').toEqual({})
    applyLoadout('bad')
    expect(inv.equipped.artifact, '不会凭空多出一个装备槽').toBeUndefined()
    expect(inv.bagItems.map(i => i.uid), '件仍在行囊里,看得见也穿得回').toEqual(['sword1'])
  })

/**
 * 超上限截断。
 *
 * add() 的判据是 `list.length >= MAX_LOADOUTS`,而 sanitize 原先不截断:
 * 把 list 撑到几十套的坏档会被原样吃下,add 从此恒返 false ——
 * 玩家再也存不了新构筑。与「行囊已满」「灵脉容量已尽」「收徒恒 full」同构。
 */
describe('构筑 · 超上限坏档截断', () => {
  function many(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `l${i}`,
      name: `构筑${i}`,
      equipment: {},
      subGongfa: [],
      artifactIds: []
    }))
  }

  it('上限以内原样保留', () => {
    const s = useLoadoutsStore()
    s.list = many(MAX_LOADOUTS) as never
    s.sanitize()
    expect(s.list).toHaveLength(MAX_LOADOUTS)
  })

  it('超上限时截断到 MAX_LOADOUTS', () => {
    const s = useLoadoutsStore()
    s.list = many(MAX_LOADOUTS * 8) as never
    s.sanitize()
    expect(s.list.length, '坏档撑不破构筑上限').toBe(MAX_LOADOUTS)
  })

  it('截断后 add 不再恒返 false —— 还能存新构筑', () => {
    const s = useLoadoutsStore()
    s.list = many(MAX_LOADOUTS * 8) as never
    s.sanitize()
    // 截断后正好满,remove 一套就能再存
    const firstId = s.list[0]!.id
    s.remove(firstId)
    expect(s.add(mk('brand-new'))).toBe(true)
  })

  it('截断保持存档顺序(前面的留下)', () => {
    const s = useLoadoutsStore()
    s.list = many(20) as never
    s.sanitize()
    expect(s.list.map(l => l.id)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5'])
  })

  it('空列表仍是空(不因截断凭空产生构筑)', () => {
    const s = useLoadoutsStore()
    s.list = []
    s.sanitize()
    expect(s.list).toHaveLength(0)
  })
})

/**
 * 快照内子数组的条数上限。
 *
 * 应用侧 applyLoadout 会按动态槽位再截一次(subGongfaSlots / artifactSlotsFor),
 * 所以功能本身是安全的;但存档里留下的冗余 id 会一直躺着 ——
 * 手改快照能塞进几千个 id,存档量白白膨胀几倍。
 */
describe('构筑 · 子数组条数上限', () => {
  function withArrays(subs: number, arts: number) {
    const s = useLoadoutsStore()
    s.list = [
      {
        id: 'a',
        name: 'n',
        seal: '道',
        mainGongfa: null,
        subGongfa: Array.from({ length: subs }, (_, i) => `g${i}`),
        artifactIds: Array.from({ length: arts }, (_, i) => `a${i}`),
        equipment: {},
        savedAt: 1
      }
    ] as never
    s.sanitize()
    return s.list[0]!
  }

  it('辅修席超量的部分被截掉', () => {
    expect(withArrays(5000, 0).subGongfa).toHaveLength(SUB_GONGFA_SLOT_HARD_CAP)
  })

  it('法宝位超量的部分被截掉', () => {
    expect(withArrays(0, 5000).artifactIds).toHaveLength(ARTIFACT_MAX_SLOTS)
  })

  it('正常快照原样保留(修形非空转)', () => {
    const l = withArrays(2, 1)
    expect(l.subGongfa).toEqual(['g0', 'g1'])
    expect(l.artifactIds).toEqual(['a0'])
  })

  it('截断保留前面的 id(读档顺序即优先序)', () => {
    const l = withArrays(5000, 5000)
    expect(l.subGongfa[0]).toBe('g0')
    expect(l.artifactIds[0]).toBe('a0')
  })
})
})
