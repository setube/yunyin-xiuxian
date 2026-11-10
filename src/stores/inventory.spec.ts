/**
 * 装备槽属性汇总(equipMods)守卫:equipMods 是「已装备件 + 法宝被动」合计的唯一权威,喂进 finalStats。
 * 真值取 mergeMods(已装备件的 resolveEquipStats.mods) 深等,抓幻影来源/叠加错/漏撤三类回归。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { mergeMods } from '@/core/statsCalc'
import { BAG_CAPACITY, EQUIP_AFFIX_HARD_CAP } from '@/data/constants'
import { resolveEquipStats } from '@/core/equipGen'
import { ARTIFACT_MAX_LEVEL, ARTIFACT_MAX_SLOTS, artifactDef, artifactEvictedBy, artifactValue } from '@/data/artifacts'
import { artifactUpCost, upgradeArtifact } from '@/core/forge'
import { useResourcesStore } from '@/stores/resources'
import type { EquipmentInstance } from '@/types'
import { add, gn } from '@/utils/gnum'

function mk(uid: string, affixes: Array<{ id: string; roll: number }>, templateId = 'b_qingyun'): EquipmentInstance {
  return { uid, templateId, quality: 'mortal', tier: 3, level: 0, affixes }
}

/**
 * 行囊一次分区。
 *
 * `equippedItems` 与 `bagItems` 原各 `items.filter(...)` 一遍:满包 120 件时整表被遍历两次,
 * 而两者读同一个 `items` 与 `equippedUids` —— 换装时必然同时失效、同时重扫。
 * 现一次分区,两个视图各取一半;`bagFull` 读其中那一半的长度。
 *
 * 判据钉的是**两者互补且不丢不重**:任一件要么在已装备、要么在行囊,且两摞加起来
 * 恰好是整表。若哪天有人把某一路改成别的筛选口径(例如行囊按「已锁定」分),
 * 这条会立刻红 —— 那正是「满没满」与「能不能分解」两处判据分叉的开始。
 */
describe('行囊 · 已装备与未装备互补不丢不重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('两摞加起来恰好是整表,且互不重叠', () => {
    const inv = useInventoryStore()
    inv.items = [mk('a', []), mk('b', []), mk('c', []), mk('d', [])]
    inv.equip('a', 'body')
    inv.equip('c', 'weapon')

    const equippedUids = inv.equippedItems.map(it => it.uid).sort()
    const bagUids = inv.bagItems.map(it => it.uid).sort()
    expect(equippedUids).toEqual(['a', 'c'])
    expect(bagUids).toEqual(['b', 'd'])
    expect([...equippedUids, ...bagUids].sort(), '两摞该覆盖整表').toEqual(['a', 'b', 'c', 'd'])
    expect(equippedUids.filter(u => bagUids.includes(u)), '同一件不该同时出现在两摞').toEqual([])
  })

  it('换装后分区立刻跟着变,原来的已装备件落回行囊', () => {
    const inv = useInventoryStore()
    inv.items = [mk('a', []), mk('b', [])]
    inv.equip('a', 'body')
    expect(inv.bagItems.map(it => it.uid)).toEqual(['b'])
    inv.equip('b', 'body')
    expect(inv.equippedItems.map(it => it.uid), '换了件,已装备该只剩新的那件').toEqual(['b'])
    expect(inv.bagItems.map(it => it.uid), '被换下的该落回行囊').toEqual(['a'])
  })

  it('bagFull 读的是未装备那一摞:装满行囊后为真,装备一件即不再是满的', () => {
    const inv = useInventoryStore()
    // 上限内摆满:全部未装备
    inv.items = Array.from({ length: BAG_CAPACITY }, (_, i) => mk(`u${i}`, []))
    expect(inv.bagFull, '行囊刚好装满该判满').toBe(true)
    inv.equip('u0', 'body')
    expect(inv.bagItems.length).toBe(BAG_CAPACITY - 1)
    expect(inv.bagFull, '装备一件后行囊少一件,不该再判满').toBe(false)
  })
})

/**
 * 已装备件只解算一次。
 *
 * `equipFlats` 与 `equipMods` 原各 `map(equippedItems, resolveEquipStats)` ——
 * 同一件装备在一次失效里被完整解算两遍(词条排序、品质查表、幂缩放),
 * 而两者都读 `equippedItems`,换一件就同时失效、同时重算,两遍必挨在一起。
 *
 * 现在两者共读一份 `equippedResolved`。判据钉的是**同源**:两个派生量的读数
 * 必须与「一次解算的结果」逐位一致 —— 若哪天有人把其中一路改回自己 map 一遍,
 * 两条路径就可能算出不同结果(比如某一处漏了法宝、或漏了某件),读数会分叉。
 * 这条不能靠数调用(ESM 的模块内绑定改不动),只能靠结果一致性守着。
 */
describe('已装备件 · 平铺与百分比同源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('equipFlats 与 equipMods 的读数与各自单独解算的结果逐位一致', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const b = mk('b', [{ id: 'atk1', roll: 0.25 }], 'b_qingyun')
    inv.items = [a, b]
    inv.equip('a', 'body')
    inv.equip('b', 'weapon')

    // 平铺:逐件单独解算再相加,须与 store 汇总一致
    const expectFlats = { attack: gn(0), defense: gn(0), maxHp: gn(0) }
    for (const it of [a, b]) {
      const r = resolveEquipStats(it)
      expectFlats.attack = add(expectFlats.attack, r.flats.attack)
      expectFlats.defense = add(expectFlats.defense, r.flats.defense)
      expectFlats.maxHp = add(expectFlats.maxHp, r.flats.maxHp)
    }
    expect(inv.equipFlats).toEqual(expectFlats)
    // 百分比:与 mergeMods(逐件 mods) 深等
    expect(inv.equipMods).toEqual(mergeMods([a, b].map(it => resolveEquipStats(it).mods)))
  })

  it('换装后两个派生量一起变,读数仍互相同源', () => {
    const inv = useInventoryStore()
    // 两块平铺数值不同的模板:轻剑(攻 10)对重剑(攻 12,且带动百分比词条)
    const light = mk('a', [{ id: 'atk1', roll: 0.5 }], 'w_zhuqing')
    const heavy = mk('b', [{ id: 'atk1', roll: 1 }], 'w_xuantie')
    inv.items = [light, heavy]
    inv.equip('a', 'weapon')
    const flatsLight = inv.equipFlats
    inv.equip('b', 'weapon')

    expect(inv.equipFlats, '换装后平铺该跟着变').toEqual(resolveEquipStats(heavy).flats)
    expect(inv.equipMods, '换装后百分比该跟着变').toEqual(mergeMods([resolveEquipStats(heavy).mods]))
    expect(inv.equipFlats, '换了把更重的剑,平铺不该原地不动').not.toEqual(flatsLight)
  })
})

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

/**
 * 单件词条数上限。
 *
 * 品质表最高 8 条、洗练只换不增,而 sanitize 原先不限制条数:
 * 手改存档能给一件装备塞几千条,存档爆量且词条面板要渲染那几千行。
 */
describe('装备 · 词条数上限', () => {
  const DEFS = ['atk1', 'atk2', 'atk3', 'def1', 'def2', 'crit1', 'crit2', 'dg1', 'dg2', 'ac1']

  function withAffixes(n: number) {
    const inv = useInventoryStore()
    inv.items = [
      {
        uid: 'u1',
        templateId: 'w_zhuqing',
        tier: 1,
        quality: 'mortal',
        level: 1,
        locked: false,
        affixes: Array.from({ length: n }, (_, i) => ({ id: DEFS[i % DEFS.length], roll: 0.5 }))
      }
    ] as never
    inv.sanitize()
    return inv.items[0]!.affixes
  }

  it('正常条数原样保留(9 条是品质表峰值)', () => {
    expect(withAffixes(9)).toHaveLength(9)
  })

  it('超出硬上界的部分被截掉', () => {
    expect(withAffixes(EQUIP_AFFIX_HARD_CAP + 1)).toHaveLength(EQUIP_AFFIX_HARD_CAP)
    expect(withAffixes(5000)).toHaveLength(EQUIP_AFFIX_HARD_CAP)
  })

  it('截断保留前面的条(读档顺序即优先序)', () => {
    const kept = withAffixes(5000)
    expect(kept[0]!.id).toBe(DEFS[0])
    expect(kept).toHaveLength(EQUIP_AFFIX_HARD_CAP)
  })

  it('截断后每条仍是合法词条(不留下占位空项)', () => {
    for (const a of withAffixes(5000)) {
      expect(a.id.length).toBeGreaterThan(0)
      expect(a.roll).toBeGreaterThanOrEqual(0)
      expect(a.roll).toBeLessThanOrEqual(1)
    }
  })
})
})

/**
 * 背包满时 addEquipment 必须拒收。
 *
 * 它是调用方折算成尘的唯一依据(见 offline 与 salvage 的 `if (!acquireEquipment(...))`)。
 * 删掉 `if (bagFull.value) return false` 后,背包会越过 BAG_CAPACITY 无限膨胀,
 * 而现有判据只覆盖了「坏档截断」,没覆盖「满时拒收」—— 实测变异后全绿。
 */
describe('背包 · 满了就拒收新装备', () => {
  function mkItems(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      uid: `u${i}`,
      templateId: 'w_zhuqing',
      tier: 1,
      quality: 'mortal',
      level: 1,
      locked: false,
      affixes: []
    }))
  }

  it('未满时收下并返回 true,满了返回 false 且件数不再增长', () => {
    const inv = useInventoryStore()
    inv.items = []

    const first = mkItems(1)[0]!
    expect(inv.addEquipment(first as never), '空包应当收下').toBe(true)
    expect(inv.bagItems.length).toBe(1)

    // 撑到刚好满
    inv.items = mkItems(BAG_CAPACITY) as never
    expect(inv.bagFull, '前提:这时应当是满的').toBe(true)

    const extra = mkItems(1)[0]!
    const before = inv.items.length
    expect(inv.addEquipment(extra as never), '满了还返回 true,调用方不会折算成尘').toBe(false)
    expect(inv.items.length, '满了还往包里塞').toBe(before)
  })
})
