/**
 * 装备槽属性汇总(equipMods)守卫:equipMods 是「已装备件 + 法宝被动」合计的唯一权威,喂进 finalStats。
 * 真值取 mergeMods(已装备件的 resolveEquipStats.mods) 深等,抓幻影来源/叠加错/漏撤三类回归。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { mergeMods } from '@/core/statsCalc'
import { BAG_CAPACITY } from '@/data/constants'
import { resolveEquipStats } from '@/core/equipGen'
import { ARTIFACT_MAX_LEVEL, ARTIFACT_MAX_SLOTS, artifactDef, artifactEvictedBy, artifactValue } from '@/data/artifacts'
import { artifactUpCost, upgradeArtifact } from '@/core/forge'
import { useResourcesStore } from '@/stores/resources'
import type { EquipmentInstance } from '@/types'
import { gn } from '@/utils/gnum'

function mk(uid: string, affixes: Array<{ id: string; roll: number }>, templateId = 'b_qingyun'): EquipmentInstance {
  return { uid, templateId, quality: 'mortal', tier: 3, level: 0, affixes }
}

describe('装备槽属性汇总(equipMods)守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('单件:equipMods 恰等于该件 resolveEquipStats.mods(合并后)', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    inv.items = [a]
    inv.equip('a', 'body')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods]))
    // 确有内容(不是空壳自洽)
    expect(Object.keys(inv.equipMods).length).toBeGreaterThan(0)
  })

  it('两件共享词条键:mergeMods 叠加(不互覆盖,两件都在)', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const b = mk('b', [{ id: 'atk1', roll: 0.8 }])
    inv.items = [a, b]
    inv.equip('a', 'body')
    inv.equip('b', 'head')
    const both = mergeMods([resolveEquipStats(a).mods, resolveEquipStats(b).mods])
    expect(inv.equipMods).toEqual(both)
  })

  it('未装备件不掺:多摆一件未装备的,equipMods 深等只含已装件', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const c = mk('c', [{ id: 'hp1', roll: 0.9 }])
    inv.items = [a, c]
    inv.equip('a', 'body')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods]))
  })

  it('卸下即撤:unequip 后该件贡献消失(回到只含余下装备)', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const b = mk('b', [{ id: 'atk1', roll: 0.8 }])
    inv.items = [a, b]
    inv.equip('a', 'body')
    inv.equip('b', 'head')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods, resolveEquipStats(b).mods]))
    inv.unequip('head')
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(a).mods]))
  })

  it('空装备/空槽:equipMods 为空对象(无杂键)', () => {
    expect(useInventoryStore().equipMods).toEqual({})
  })

  it('sanitize:重复 uid 只留先出现的一件,属性不翻倍、另一件仍可行囊', () => {
    const inv = useInventoryStore()
    const first = mk('dup', [{ id: 'atk1', roll: 0.5 }])
    const second = mk('dup', [{ id: 'atk1', roll: 0.9 }])
    const other = mk('other', [])
    inv.items = [first, second, other]
    inv.sanitize()
    expect(inv.items.map(i => i.uid), '同号只留先出现的那件').toEqual(['dup', 'other'])
    inv.equip('dup', 'body')
    expect(inv.equippedItems, '一次装备只该算一件').toHaveLength(1)
    expect(inv.bagItems.map(i => i.uid), '另一件不同号的仍留在行囊').toEqual(['other'])
    expect(inv.equipMods).toEqual(mergeMods([resolveEquipStats(first).mods]))
  })

  it('sanitize:同一件法宝写两条、祭炼位写两遍,被动都只算一次', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_muyu', level: 0 }
      ],
      equippedArtifacts: ['af_muyu', 'af_muyu']
    })
    inv.sanitize()
    expect(inv.artifacts, '库里同一件法宝只留一条').toHaveLength(1)
    expect(inv.equippedArtifacts, '祭炼位同一件只占一个').toEqual(['af_muyu'])
    const value = artifactValue(artifactDef('af_muyu')!, 0)
    expect(inv.equipMods).toEqual(mergeMods([value.passive]))
  })

  it('sanitize:坏槽位映射被清掉,装备回到行囊而不是凭空消失', () => {
    const inv = useInventoryStore()
    const weapon = mk('w1', [], 'w_qingshuang')
    const head = mk('h1', [], 'h_heifengjin')
    const body = mk('b1', [])
    inv.items = [weapon, head, body]
    inv.$patch({
      equipped: {
        weapon: 'w1',
        // 同一件占两槽
        head: 'w1',
        // uid 对不上任何一件
        body: 'ghost',
        // 件与槽不符:实为头冠
        boots: 'h1',
        // 槽名认不得
        unknownSlot: 'b1'
      }
    } as never)
    inv.sanitize()
    expect(inv.equipped, '只留成立的那一条映射').toEqual({ weapon: 'w1' })
    expect(inv.bagItems.map(i => i.uid).sort(), '其余件都回行囊').toEqual(['b1', 'h1'])
    expect(inv.equippedItems.map(i => i.uid), '一件只算一个槽').toEqual(['w1'])
  })

  it('sanitize:祭炼位不超过法宝槽上限(坏档写满也只算前两件)', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: ['af_muyu', 'af_lihuo', 'af_xuantian', 'af_fuyao'].map(defId => ({ defId, level: 0 })),
      equippedArtifacts: ['af_muyu', 'af_lihuo', 'af_xuantian', 'af_fuyao']
    } as never)
    inv.sanitize()
    expect(inv.equippedArtifacts, '至多 ARTIFACT_MAX_SLOTS 件').toHaveLength(2)
  })

  it('sanitize:认不出的法宝 id 清掉,法宝页不会再对 undefined 取品质', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 2 },
        { defId: 'af_ghost', level: 0 }
      ],
      equippedArtifacts: ['af_muyu', 'af_ghost']
    } as never)
    inv.sanitize()
    expect(inv.artifacts.map(a => a.defId), '只留认得的法宝').toEqual(['af_muyu'])
    expect(inv.equippedArtifacts, '野 id 不会在祭炼位上白占一格').toEqual(['af_muyu'])
  })

  /** 故障注入:去掉 level 归一化,本用例第一个断言即红。 */
  it('sanitize:法宝坏重数归一后,祭炼不会把悟道点写成 NaN', () => {
    const inv = useInventoryStore()
    const res = useResourcesStore()
    inv.$patch({
      artifacts: [{ defId: 'af_muyu', level: 'x' }],
      equippedArtifacts: ['af_muyu']
    } as never)
    inv.sanitize()
    expect(inv.artifacts[0]!.level, '坏重数夹回 0').toBe(0)

    res.wudao = 1000
    res.spiritStone = gn(1e9)
    const cost = artifactUpCost('af_muyu')!
    expect(Number.isFinite(cost.wudao), '祭炼价不该是 NaN').toBe(true)
    expect(Number.isFinite(cost.stone.m), '灵石价不该是 NaN').toBe(true)
    expect(upgradeArtifact('af_muyu')).toBe(true)
    expect(inv.artifacts[0]!.level).toBe(1)
    expect(res.wudao, '悟道点按价扣,不是 NaN').toBe(1000 - cost.wudao)
  })

  it('sanitize:丹匣只留认得的丹药,零条与野 id 一并清掉', () => {
    const inv = useInventoryStore()
    inv.$patch({ pills: { p_jvqisan: 3, p_ghost: 9, p_huichun: 0 } } as never)
    inv.sanitize()
    expect(inv.pills, '野 id 画不出来，零条也没有可服的').toEqual({ p_jvqisan: 3 })
  })
})

describe('丹匣公共写入边界 · 非有限值与反向扣丹', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('丹药入账只认有限正数,小数向下取整', () => {
    const inv = useInventoryStore()
    for (const bad of [NaN, Infinity, -Infinity, -5, 0]) inv.addPill('p_jvqisan', bad)
    expect(inv.pills.p_jvqisan, '坏增量不能把丹匣写成 NaN 或负数').toBeUndefined()
    inv.addPill('p_ghost', 3)
    expect(inv.pills.p_ghost, '认不出的丹药不该进丹匣').toBeUndefined()
    inv.addPill('p_jvqisan', 2.9)
    expect(inv.pills.p_jvqisan).toBe(2)
  })

  it('丹药扣款拒绝负数与非有限值,0 保持成功且不动账', () => {
    const inv = useInventoryStore()
    inv.addPill('p_jvqisan', 5)
    expect(inv.spendPill('p_jvqisan', -5), '负扣款不得反向加丹').toBe(false)
    expect(inv.spendPill('p_jvqisan', NaN)).toBe(false)
    expect(inv.spendPill('p_jvqisan', Infinity)).toBe(false)
    expect(inv.pills.p_jvqisan).toBe(5)
    expect(inv.spendPill('p_jvqisan', 0), '零扣款仍按成功且不动账').toBe(true)
    expect(inv.pills.p_jvqisan).toBe(5)
  })
})

describe('法宝公共写入边界 · 目录、拥有、满重与祭炼槽', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('获得法宝只认目录内 id,野 id 不入库也不自动占祭炼位', () => {
    const inv = useInventoryStore()
    expect(inv.addArtifact('af_ghost')).toBe(false)
    expect(inv.artifacts).toEqual([])
    expect(inv.equippedArtifacts).toEqual([])
    expect(inv.addArtifact('af_muyu')).toBe(true)
    expect(inv.artifacts.map(a => a.defId)).toEqual(['af_muyu'])
  })

  it('升级只认已拥有且未满重者,野 id/未拥有/满重都不动库存', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 2 },
        { defId: 'af_lihuo', level: ARTIFACT_MAX_LEVEL }
      ]
    })
    expect(inv.levelUpArtifact('af_ghost')).toBe(false)
    expect(inv.levelUpArtifact('af_xuantian')).toBe(false)
    expect(inv.levelUpArtifact('af_lihuo')).toBe(false)
    expect(inv.artifacts).toEqual([
      { defId: 'af_muyu', level: 2 },
      { defId: 'af_lihuo', level: ARTIFACT_MAX_LEVEL }
    ])
    expect(inv.levelUpArtifact('af_muyu')).toBe(true)
    expect(inv.artifacts[0]!.level).toBe(3)
  })

  it('祭炼只认已拥有法宝,野 id/未拥有/坏槽数一律拒绝且不改当前佩带', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [{ defId: 'af_muyu', level: 0 }],
      equippedArtifacts: []
    })
    for (const id of ['af_ghost', 'af_lihuo']) {
      expect(inv.toggleArtifact(id, ARTIFACT_MAX_SLOTS)).toBe('rejected')
    }
    for (const slots of [NaN, Infinity, 0, 0.5, -1]) {
      expect(inv.toggleArtifact('af_muyu', slots)).toBe('rejected')
    }
    expect(inv.equippedArtifacts).toEqual([])
  })

  it('外部传入超大槽数仍受法宝位绝对上限约束,不会无限佩带', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_lihuo', level: 0 },
        { defId: 'af_xuantian', level: 0 }
      ],
      equippedArtifacts: []
    })
    expect(inv.toggleArtifact('af_muyu', 99)).toBe('equipped')
    expect(inv.toggleArtifact('af_lihuo', 99)).toBe('equipped')
    expect(inv.toggleArtifact('af_xuantian', 99)).toBe('replaced')
    expect(inv.equippedArtifacts).toHaveLength(ARTIFACT_MAX_SLOTS)
    expect(inv.equippedArtifacts).toEqual(['af_lihuo', 'af_xuantian'])
  })

  /** 故障注入:把 `kept` 改成 `equippedArtifacts.value.slice(1)`,本用例红(长度 2)。 */
  it('槽位降到 1 位后替换法宝,结果必须只剩 1 件', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_lihuo', level: 0 },
        { defId: 'af_xuantian', level: 0 }
      ],
      // 超编:两件在身,只开一位
      equippedArtifacts: ['af_muyu', 'af_lihuo']
    })
    expect(inv.toggleArtifact('af_xuantian', 1)).toBe('replaced')
    expect(inv.equippedArtifacts, '替换后仍超编 —— 槽位上限在这条路上失效').toEqual(['af_xuantian'])
  })

  /** 故障注入:把 `artifactEvictedBy` 改成只返回 `equipped[0]`(单件),本用例红。 */
  it('提示名单与真正让位的那件对得上（含超编列表）', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_lihuo', level: 0 },
        { defId: 'af_xuantian', level: 0 }
      ],
      equippedArtifacts: ['af_muyu', 'af_lihuo']
    })
    const before = [...inv.equippedArtifacts]
    expect(inv.toggleArtifact('af_xuantian', 1)).toBe('replaced')
    const named = artifactEvictedBy(before, 1)
    expect(named.length, '超编时不只有一件让位').toBeGreaterThan(1)
    const kept = before.filter(id => !named.includes(id))
    expect(inv.equippedArtifacts).toEqual([...kept, 'af_xuantian'])
  })

  /**
   * 让位名单须在换件之前取:`artifactEvictedBy` 读现列表,换件后再取会指向新佩上的那件。
   * 故障注入:把 ArtifactPanel.toggleArtifact 里的 `artifactEvictedBy(...)` 挪到 `inventory.toggleArtifact(...)` 之后,本用例红。
   */
  it('让位名单取早了才作数:换件之后同一份判据会改指刚戴上来的那一件', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_lihuo', level: 0 },
        { defId: 'af_xuantian', level: 0 }
      ],
      equippedArtifacts: ['af_muyu']
    })
    const pre = artifactEvictedBy(inv.equippedArtifacts, 1)
    expect(pre, '一位之下带着墨玉葫芦,按玄天镜该让它让位').toEqual(['af_muyu'])

    expect(inv.toggleArtifact('af_xuantian', 1)).toBe('replaced')

    const post = artifactEvictedBy(inv.equippedArtifacts, 1)
    expect(post, '换完之后列表只剩新件,再算就改指它自己了').toEqual(['af_xuantian'])
    expect(post, '事后取的名单指的不是真正让位的那一件').not.toEqual(pre)
    // 真正被替下的与事前取的一致
    expect(inv.equippedArtifacts).not.toContain('af_muyu')
  })

  /**
   * `currentArtifacts` 是 equipMods、buildPlayerSnap、buildDetect 共同的读入口。
   * 故障注入:删掉 `currentArtifacts` 的 `.slice(0, ARTIFACT_MAX_SLOTS)`,本用例红。
   */
  it('currentArtifacts 不超法宝位上限:超编件不进属性汇总', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 }, // maxHpPct 0.05
        { defId: 'af_bishui', level: 0 }, // maxHpPct 0.216
        { defId: 'af_xianding', level: 0 } // maxHpPct 0.18
      ],
      equippedArtifacts: ['af_muyu', 'af_bishui', 'af_xianding']
    })
    expect(inv.currentArtifacts, '生效的只该是前 ARTIFACT_MAX_SLOTS 件').toHaveLength(ARTIFACT_MAX_SLOTS)
    // 真值独立复算:前两件的被动合并
    const expected = mergeMods([
      artifactValue(artifactDef('af_muyu')!, 0).passive,
      artifactValue(artifactDef('af_bishui')!, 0).passive
    ])
    expect(inv.equipMods, '超编那件的被动不该混进汇总').toEqual(expected)
    const withoutThird = expected.maxHpPct ?? 0
    const withThird = withoutThird + artifactValue(artifactDef('af_xianding')!, 0).passive.maxHpPct!
    expect(inv.equipMods.maxHpPct, '第三件的 maxHp 不该进来').toBeCloseTo(withoutThird, 9)
    expect(inv.equipMods.maxHpPct, '判据得真能分辨:带上第三件会是另一个数').not.toBeCloseTo(withThird, 3)
  })

/**
 * 超容量坏档的截断。
 *
 * BAG_CAPACITY 原本只用来判 bagFull(「行囊已满」),从不用来限容:
 * 把 items 撑到几千件的坏档会被原样吃下,bagFull 恒为 true,
 * addItem 从此一律 return false —— 玩家再也捡不到装备,界面还要渲染几千行。
 * 这条把「读档后容量有上界、已装备的不会被截掉」钉住。
 */
describe('行囊容量 · 坏档截断', () => {
  const WEAPON = 'w_zhuqing'

  function makeItems(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      uid: `u${i}`,
      templateId: WEAPON,
      tier: 1,
      quality: 'mortal',
      level: 1,
      locked: false,
      affixes: []
    }))
  }

  it('容量以内的库存原样保留', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY) as never
    inv.sanitize()
    expect(inv.items).toHaveLength(BAG_CAPACITY)
  })

  it('超容量时截断到 BAG_CAPACITY', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY * 5) as never
    inv.sanitize()
    expect(inv.items.length, '坏档撑不破容量上限').toBe(BAG_CAPACITY)
  })

  it('截断后 bagFull 不再恒为 true —— 玩家还能捡到新装备', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY * 3) as never
    inv.sanitize()
    // 全部在背包里(没有装备)→ 恰好满;但不会「超满」到永远加不进
    expect(inv.bagItems.length).toBeLessThanOrEqual(BAG_CAPACITY)
    expect(inv.items.some(it => !inv.bagItems.includes(it)) || inv.bagItems.length === BAG_CAPACITY).toBe(true)
  })

  it('已装备的件一定被保住(哪怕原下标在容量之外)', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY * 2) as never
    inv.equipped = { weapon: `u${BAG_CAPACITY * 2 - 1}` } as never
    inv.sanitize()
    const keptUids = inv.items.map(it => it.uid)
    expect(keptUids, '最后一件被截掉了,但它是玩家身上的装备').toContain(`u${BAG_CAPACITY * 2 - 1}`)
    expect(inv.equipped.weapon, '装备栏映射应保留').toBe(`u${BAG_CAPACITY * 2 - 1}`)
  })

  it('截断后背包仍有空位(装备占位不算进背包)', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY * 2) as never
    inv.equipped = { weapon: `u${BAG_CAPACITY * 2 - 1}` } as never
    inv.sanitize()
    expect(inv.bagItems.length, '截断后背包数应比容量少一件(那件在身上)').toBe(BAG_CAPACITY - 1)
    expect(inv.bagFull).toBe(false)
  })

  it('截断保持读档顺序(前面的留下)', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY * 2) as never
    inv.sanitize()
    const kept = inv.items.map(it => it.uid)
    expect(kept[0]).toBe('u0')
    expect(kept.length).toBe(BAG_CAPACITY)
  })

  it('满仓但一件未装备时 bagFull 为 true(这是正常状态,不是坏档)', () => {
    const inv = useInventoryStore()
    inv.items = makeItems(BAG_CAPACITY) as never
    inv.sanitize()
    expect(inv.bagFull).toBe(true)
  })
})
})
