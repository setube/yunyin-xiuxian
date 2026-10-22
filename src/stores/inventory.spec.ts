/**
 * 装备槽属性汇总(equipMods)守卫。
 *
 * inventory.equipMods 是「已装备件 + 法宝被动」合计的唯一权威,喂进 finalStats。
 * 此前零直接规格(statBreakdown 只测比例折算,不测原始按槽汇总)——一个把未装备件
 * 掺进来、或叠加错、或卸下不撤的回归,会静默腐蚀玩家总属性。
 * 这里用 mergeMods 对「恰好已装备的那批 resolveEquipStats.mods」作真值,断言
 * equipMods 深等(能抓住幻影来源/叠加错/漏撤三类回归)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '@/stores/inventory'
import { mergeMods } from '@/core/statsCalc'
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
    // 深等即证明两件都在(若 b 被忽略/覆盖,equipMods 只会等于单件合并,不会等于 both)
    expect(inv.equipMods).toEqual(both)
  })

  it('未装备件不掺:多摆一件未装备的,equipMods 深等只含已装件', () => {
    const inv = useInventoryStore()
    const a = mk('a', [{ id: 'atk1', roll: 0.5 }])
    const c = mk('c', [{ id: 'hp1', roll: 0.9 }]) // 不装备
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

  /**
   * 坏档/导入档里两件同 uid:`equippedUids` 是 uid 集合,装备一次会让两件同时
   * 计入属性(翻倍),而两件又都从行囊里消失 —— 既看不见,也没拿到该得的那份。
   * 修形只留先出现的一件。
   */
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
    // 只算一次:与单件祭炼的值深等(算两次会把 maxHpPct 叠加成两倍)
    expect(inv.equipMods).toEqual(mergeMods([value.passive]))
  })

  /**
   * 装备栏里的坏映射会让一件装备从行囊消失、却不出现在任何槽卡上:
   * 槽名认不得(旧版/手改)、uid 对不上任何一件、件与槽不符、一件占两槽。
   * 只保留「槽名合法 + 件存在 + 件属该槽 + 未被占用」的映射。
   */
  it('sanitize:坏槽位映射被清掉,装备回到行囊而不是凭空消失', () => {
    const inv = useInventoryStore()
    const weapon = mk('w1', [], 'w_qingshuang')
    const head = mk('h1', [], 'h_heifengjin')
    const body = mk('b1', [])
    inv.items = [weapon, head, body]
    inv.$patch({
      equipped: {
        weapon: 'w1',
        // 同一件占两个槽:第二个槽不该成立
        head: 'w1',
        // uid 对不上任何一件(ghost)
        body: 'ghost',
        // 件与槽不符:这其实是头冠
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

  /**
   * 法宝重数写成字符串/NaN 时,`level >= ARTIFACT_MAX_LEVEL` 为假,祭炼价
   * `Math.pow(1.6, level)` 变成 NaN;服务又把 NaN 当成「不缺料」,照扣灵石、
   * 报成功,并把悟道点写成 NaN。sanitize 必须把重数也修成有限整数。
   *
   * 故障注入:去掉 level 归一化 → 本条第一个断言即红,后续会以 NaN 价/库存失败。
   */
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

  /**
   * 替换分支不能替「已经超编」的列表打圆场。
   *
   * 境界跌落(元婴位没了)、未经 sanitize 的内存直塞,都能让佩带列表**本来就超编**。
   * 旧的 `slice(1)` 只摘掉一件、余下的照旧生效 —— 于是从这条路进去,
   * 「法宝位上限」形同虚设,超编的每一件被动都还在身上。
   *
   * 故障注入:把 `kept` 改回 `equippedArtifacts.value.slice(1)`,本条必红(长度 2)。
   */
  it('槽位降到 1 位后替换法宝,结果必须只剩 1 件', () => {
    const inv = useInventoryStore()
    inv.$patch({
      artifacts: [
        { defId: 'af_muyu', level: 0 },
        { defId: 'af_lihuo', level: 0 },
        { defId: 'af_xuantian', level: 0 }
      ],
      // 超编:两件在身,而当前境界只开一位
      equippedArtifacts: ['af_muyu', 'af_lihuo']
    })
    expect(inv.toggleArtifact('af_xuantian', 1)).toBe('replaced')
    expect(inv.equippedArtifacts, '替换后仍超编 —— 槽位上限在这条路上失效').toEqual(['af_xuantian'])
  })

  /**
   * 按钮点名的那件，得真的让位。
   *
   * 替换分支的剩余规则是 `留最近的 slots-1 件`，而提示上只点名了第一件。
   * 两条规则分开写时就分异了:按钮上读到的与真正被替下的对不上号 ——
   * 玩家照着提示去行囊找那件,发现它还在,而另一件正好不见了。
   *
   * 故障注入: 把 `artifactEvictedBy` 改回只返回 `equipped[0]`
   * (单件), 本条必红。
   */
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
    // 显示的让位名单必须等于真正被替下的那些
    const named = artifactEvictedBy(before, 1)
    expect(named.length, '超编时不只有一件让位').toBeGreaterThan(1)
    const kept = before.filter(id => !named.includes(id))
    expect(inv.equippedArtifacts).toEqual([...kept, 'af_xuantian'])
  })

  /**
   * 超编的祭炼位列表不许把第三件的被动一起算进属性。
   *
   * 槽位上限从前有四道裁剪(读档 sanitize / toggleArtifact 替换 / applyLoadout
   * 切换 / 忆战快照),而 `currentArtifacts` —— equipMods、buildPlayerSnap、
   * buildDetect 共同的读入口 —— 偏偏没裁:坏档或内存直塞写进三件时,第三件的
   * 被动与神通一起进面板、一起进战斗。实测三件 maxHp 法宝(5% + 21.6% + 18%)
   * 在两位之下给出 51.9% 而非 44.6%,玩家却从未点过那个按钮。
   *
   * 故障注入:把 `currentArtifacts` 的 `.slice(0, ARTIFACT_MAX_SLOTS)` 删掉,
   * 这一条与下面那条同时红。
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
    // 真值独立复算:前两件的 maxHp 被动合并(凡品零重,倍率 1)
    const expected = mergeMods([
      artifactValue(artifactDef('af_muyu')!, 0).passive,
      artifactValue(artifactDef('af_bishui')!, 0).passive
    ])
    expect(inv.equipMods, '超编那件的被动不该混进汇总').toEqual(expected)
    // 品阶倍率照常生效(af_bishui 是良品),这里只钉「第三件没进来」这件事
    const withoutThird = expected.maxHpPct ?? 0
    const withThird = withoutThird + artifactValue(artifactDef('af_xianding')!, 0).passive.maxHpPct!
    expect(inv.equipMods.maxHpPct, '第三件的 maxHp 不该进来').toBeCloseTo(withoutThird, 9)
    expect(inv.equipMods.maxHpPct, '判据得真能分辨:带上第三件会是另一个数').not.toBeCloseTo(withThird, 3)
  })
})
