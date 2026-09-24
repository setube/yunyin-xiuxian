/**
 * 自动回收 —— 装备入包前的第一道闸(Phase 26.2)
 * 应有之物(O):无论在线(战斗掉落/事件/镇压)还是离线(挂机结算),
 * 一切装备在进入行囊前都要先过一遍回收裁决;
 * 命中回收规则(分解勾选档 / 智能收纳判无缘)的,不入包、直接化尘。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { rng } from '@/utils/random'
import {
  afterWin,
  acquireArtifact,
  acquireEquipment,
  ARTIFACT_NEAR_BONUS,
  ARTIFACT_NEAR_WINDOW,
  artifactDropWeight,
  randomDropArtifact
} from './loot'
import { upgradeEquipment } from './forge'
import { ARTIFACTS, artifactDef, artifactValue } from '@/data/artifacts'
import type { ArtifactDef } from '@/types'
import { budgetOfMods } from './ruleBudget'
import { regionDef } from '@/data/regions'
import { usePlayerStore } from '@/stores/player'
import { shouldAutoRecycle } from './smartKeep'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useSettingsStore } from '@/stores/settings'
import { qualityDef } from '@/data/qualities'
import { DECOMPOSE_DUST } from '@/data/constants'
import { useLoreStore } from '@/stores/lore'
import { gn } from '@/utils/gnum'
import type { EquipmentInstance, QualityId } from '@/types'

describe('自动回收 · 装备入包前的第一道闸', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 一件好判的凡俗道袍:不带套、无词条 —— 判定只看品质。
  // (此前用 generateEquipment 随手生成的件:模板可能成套、词条可能条条近满,
  //  于是「这件算不算垃圾」被随机模板搅浑,判据不再只测它想测的那条规则。)
  let seq = 0
  function mk(quality: QualityId): EquipmentInstance {
    seq += 1
    return { uid: `u${seq}`, templateId: 'b_qingyun', quality, tier: 3, level: 0, affixes: [] }
  }

  function bagUids(): string[] {
    return useInventoryStore().items.map(it => it.uid)
  }

  // ISS-030:rng.chance 不钳制(rand()<p),法宝 ×6×luck / doubleDropRate 等倍率堆叠
  // 一旦把 p 堆出 (0,1) 就会变成"必然掉落"或"永不掉落"。此不变量兜住任何未来平衡数据。
  it('ISS-030:afterWin 里每个概率输入都钳在 [0,1] 内', () => {
    const player = usePlayerStore()
    player.initCharacter('概率钳制', { roots: [] } as never)
    const spy = vi.spyOn(rng, 'chance').mockImplementation((p: number) => {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
      return false
    })
    try {
      const region = regionDef('qingyun')!
      afterWin(region, 1, true)
      expect(spy).toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('智能收纳开启时,凡良(分解勾选档)拾取即化尘,不入行囊,器灵尘到账', () => {
    useSettingsStore().smartKeep.enabled = true
    const resources = useResourcesStore()
    for (const q of ['mortal', 'fine'] as const) {
      const dustBefore = resources.dust
      const item = mk(q)
      const line = acquireEquipment(item).line
      expect(bagUids()).not.toContain(item.uid)
      expect(resources.dust).toBe(dustBefore + (DECOMPOSE_DUST[qualityDef(q).rank] ?? 1))
      expect(line).toContain('自动回收')
      expect(line).toContain('器灵尘')
    }
  })

  it('总闸:智能收纳未开启时,凡良(默认分解勾选档)照常入包,不再自动回收', () => {
    expect(useSettingsStore().smartKeep.enabled).toBe(false)
    for (const q of ['mortal', 'fine'] as const) {
      const item = mk(q)
      acquireEquipment(item)
      expect(bagUids()).toContain(item.uid)
    }
  })

  it('灵品及以上(未勾分解,亦足保留线)照常入包', () => {
    const item = mk('spirit')
    acquireEquipment(item)
    expect(bagUids()).toContain(item.uid)
  })

  it('上锁的分解档装备不会被误回收', () => {
    const item = mk('mortal')
    item.locked = true
    acquireEquipment(item)
    expect(bagUids()).toContain(item.uid)
  })

  it('智能收纳开启后,低于保留线又无核心词条的精品也会化尘', () => {
    useSettingsStore().smartKeep.enabled = true
    const resources = useResourcesStore()
    const item = mk('excellent') // 精品 rank2,非勾选档 → 交由智能收纳裁决
    const got = acquireEquipment(item)
    expect(bagUids()).not.toContain(item.uid)
    expect(got.line).toContain('道途未成')
    expect(resources.dust).toBeGreaterThanOrEqual(DECOMPOSE_DUST[2] ?? 1)
  })

  it('勾选档回收要写明是所勾品质,不写成与道无缘', () => {
    useSettingsStore().smartKeep.enabled = true
    const item = mk('mortal')
    const got = acquireEquipment(item)
    expect(got.line).toContain(`所勾${qualityDef('mortal').name}`)
    expect(got.line).not.toContain('与道无缘')
  })

  it('新手馈赠(forceKeep)不受回收规则影响,必入包', () => {
    const starter = mk('mortal')
    acquireEquipment(starter, { forceKeep: true })
    expect(bagUids()).toContain(starter.uid)
  })

  it('行囊满时,保留下来的新件仍按老规矩腾退包内无缘旧件', () => {
    useSettingsStore().smartKeep.enabled = true
    const inventory = useInventoryStore()
    // 塞满 120 件凡品(老规矩积压的垃圾)
    for (let i = 0; i < 120; i += 1) inventory.addEquipment(mk('mortal'))
    expect(inventory.bagFull).toBe(true)
    const keep = mk('spirit')
    acquireEquipment(keep)
    expect(bagUids()).toContain(keep.uid)
    expect(inventory.items.length).toBeLessThanOrEqual(120)
  })

  it('回收裁决无随机性:同件装备重复判定结果一致(在线/离线一致的基础)', () => {
    useSettingsStore().smartKeep.enabled = true
    const junk = mk('mortal')
    expect(shouldAutoRecycle(junk)).toBe(true)
    expect(shouldAutoRecycle({ ...junk, uid: 'dummy' })).toBe(true)
    expect(shouldAutoRecycle(mk('spirit'))).toBe(false)
  })
})

/**
 * 法宝掉落的取样口径 —— 「高界该掉高界的东西」不能只写在注释里。
 *
 * 池子本身一直是「fromTier ≤ 当前层级」(旧法宝仍可能掉,图鉴要补齐),
 * 但权重从前只按品质折算:凡品 40 对神品 7.7,于是到了混沌海,
 * 掉出来的多半还是人间界的墨玉葫芦 —— 本界域的法宝反而撞不见。
 * 现加一层就近加成(见 loot.artifactDropWeight),此处钉住它的三条承诺:
 * 同品质下近者更重、旧物不被关掉、高层级时高界之物占多数。
 */
describe('法宝掉落 · 高界的池子该像高界', () => {
  it('池子不关门:凡层级可及的法宝,权重都大于零', () => {
    for (const tier of [1, 10, 20, 26, 32]) {
      const reachable = ARTIFACTS.filter(a => a.fromTier <= tier)
      expect(reachable.length).toBeGreaterThan(0)
      for (const a of reachable) {
        expect(artifactDropWeight(a, tier), `${a.name} 在 ${tier} 阶被完全关掉了`).toBeGreaterThan(0)
      }
    }
  })

  it('同品质下,同层级的那件明显更重(约二十一倍)', () => {
    /**
     * 从表里找一对「同一档品阶、一件刚好在本阶、另一件已出就近窗口」的真实法宝,
     * 而不是写死两个 id —— 品阶重排之后,这一对会自己换人,判据仍旧成立。
     */
    const pair = ARTIFACTS.map(near => ({
      near,
      old: ARTIFACTS.find(b => b.quality === near.quality && near.fromTier - b.fromTier >= ARTIFACT_NEAR_WINDOW)
    })).find((p): p is { near: ArtifactDef; old: ArtifactDef } => p.old !== undefined)
    expect(pair, '池子里没有一对同品质、相隔 ≥ 就近窗口的法宝 —— 判据失去对象').toBeDefined()
    const { near, old } = pair!
    const tier = near.fromTier
    const ratio = artifactDropWeight(near, tier) / artifactDropWeight(old, tier)
    // 同阶 ×(1 + 幅度 × 窗口),出了窗口只剩它自己 —— 比例就是窗口那一条的幅度
    const expected = 1 + ARTIFACT_NEAR_BONUS * ARTIFACT_NEAR_WINDOW
    expect(ratio, `同品质的「${near.name}」只比 ${ARTIFACT_NEAR_WINDOW} 阶前的「${old.name}」重 ${ratio.toFixed(2)} 倍`).toBeCloseTo(expected, 6)
  })

  it('到混沌海走一趟,掉出来的大半是仙/神/混沌之物', () => {
    let high = 0
    const n = 1200
    for (let i = 0; i < n; i += 1) {
      const id = randomDropArtifact(32)
      expect(id, '32 阶抽不出任何法宝').toBeTruthy()
      if (artifactDef(id!)!.fromTier >= 21) high += 1
    }
    // 实测约 0.61(品阶重排前后都是这个量级;没有就近加成时约 0.40)——
    // 阈值留足余量,免得这条统计判据自己变得时红时绿
    expect(high / n, `${n} 次里只有 ${high} 次抽到仙界以上的法宝`).toBeGreaterThan(0.55)
  })
})

/**
 * 品阶阶梯 —— 神品要稀缺,而池子仍要以近阶之物为主。
 *
 * 品阶不是装饰标签:它同时定掉落权重(artifactDropWeight)与数值倍率
 * (data/artifacts.artifactQualityMult)。若 45 件里有一小半都挂着神品,
 * 「神品」二字就不携带任何信息,挂在它上面的倍率也就跟着失去意义。
 *
 * 于是标签按 (fromTier 升,同阶内预算升) 排成一条不降的阶梯,并钉住两条:
 *   一 不许倒挂 —— 深地界出的那件,品阶不低于浅地界出的;
 *   二 每个界域的池子里,神品的权重占比都是个位数百分比 —— 按件数算也一样。
 *
 * 故障注入:把这 45 件的品阶退回重排之前那一版(18 件神品),第二条立刻变红。
 */
describe('法宝品阶 · 稀缺标签', () => {
  it('标签跟着 fromTier 走:深地界出的那件,品阶不低于浅地界出的', () => {
    /**
     * 排序键是**玩家看到的**被动预算(artifactValue 之后的),不是数据里的基线 ——
     * 品阶倍率是玩家看得见的那一层,承诺"标签=强度阶梯"就该用那一层的数去对。
     * 同预算时按品阶排,避免"数组书写顺序"这种与玩家无关的东西决定成败。
     */
    const ranked = [...ARTIFACTS].sort(
      (a, b) =>
        a.fromTier - b.fromTier ||
        budgetOfMods(artifactValue(a, 0).passive) - budgetOfMods(artifactValue(b, 0).passive) ||
        qualityDef(a.quality).rank - qualityDef(b.quality).rank
    )
    const bad: string[] = []
    for (let i = 1; i < ranked.length; i += 1) {
      const prev = ranked[i - 1]!
      const cur = ranked[i]!
      if (qualityDef(cur.quality).rank < qualityDef(prev.quality).rank) {
        bad.push(`「${prev.name}」(${prev.fromTier} 阶 · ${qualityDef(prev.quality).name}) → 「${cur.name}」(${cur.fromTier} 阶 · ${qualityDef(cur.quality).name})`)
      }
    }
    expect(bad, `这些法宝的品阶与 fromTier 倒挂了:\n${bad.join('\n')}`).toEqual([])
    expect(qualityDef(ranked[ranked.length - 1]!.quality).rank, '最深的那件不是最高档,阶梯形同虚设').toBe(8)
  })

  it('每个界域的池子里,神品都只占个位数百分比(按权重与按件数都算一遍)', () => {
    let maxShare = 0
    let maxTier = 0
    for (let tier = 1; tier <= 32; tier += 1) {
      const pool = ARTIFACTS.filter(a => a.fromTier <= tier)
      const total = pool.reduce((sum, a) => sum + artifactDropWeight(a, tier), 0)
      const divine = pool.filter(a => a.quality === 'divine')
      const share = divine.reduce((sum, a) => sum + artifactDropWeight(a, tier), 0) / total
      expect(share, `${tier} 阶的池子里神品占了 ${(share * 100).toFixed(1)}%`).toBeLessThan(0.1)
      expect(divine.length / pool.length, `${tier} 阶的池子里 ${divine.length}/${pool.length} 是神品`).toBeLessThan(0.1)
      if (share > maxShare) {
        maxShare = share
        maxTier = tier
      }
    }
    // 神品不能稀到不存在:最深的那一阶得至少有一件,否则这条阶梯的上端是空的
    expect(ARTIFACTS.filter(a => a.quality === 'divine').length, '一件神品都没有 —— 阶梯缺了顶端').toBeGreaterThan(0)
    expect(maxShare, `神品在 ${maxTier} 阶占比最高,为 ${(maxShare * 100).toFixed(1)}%`).toBeLessThan(0.1)
  })
})

/**
 * 装备见闻 —— 图鉴的收录深度就靠这一笔。
 *
 * 装备图鉴此前只有「见没见过」两态;深度取自 lore.equipLore,而写它的地方
 * 只有一处:acquireEquipment(装备入账的唯一漏斗)。这里守三件事:
 * 拾得即记、只记更好的一件、以及**被化尘的那件也算见过**(图鉴记的是见闻,不是家当)。
 */
describe('装备见闻 · 入账那一刻就记下成色', () => {
  function mkItem(uid: string, quality: QualityId, tier: number, templateId = 'w_xuantie'): EquipmentInstance {
    return { uid, templateId, quality, tier, level: 0, affixes: [] }
  }

  it('拾得一件就记下它的品质与层级', () => {
    acquireEquipment(mkItem('a', 'heaven', 15), { quiet: true, forceKeep: true })
    expect(useLoreStore().equipSeen('w_xuantie')).toEqual({ q: qualityDef('heaven').rank, t: 15, u: 0 })
  })

  it('后来更差的一件不拉低记录,更好的一件才刷新', () => {
    acquireEquipment(mkItem('a', 'fine', 4), { quiet: true, forceKeep: true })
    acquireEquipment(mkItem('b', 'heaven', 15), { quiet: true, forceKeep: true })
    acquireEquipment(mkItem('c', 'mortal', 2), { quiet: true, forceKeep: true })
    expect(useLoreStore().equipSeen('w_xuantie'), '差的一件把好记录顶掉了').toEqual({
      q: qualityDef('heaven').rank,
      t: 15,
      u: 0
    })
    acquireEquipment(mkItem('d', 'divine', 20), { quiet: true, forceKeep: true })
    expect(useLoreStore().equipSeen('w_xuantie')).toEqual({ q: qualityDef('divine').rank, t: 20, u: 0 })
  })

  it('被自动回收(化尘)的那件也算见过 —— 图鉴记的是见闻,不是家当', () => {
    useSettingsStore().smartKeep.enabled = true
    // 换个模板:lore 分片在测试之间会随 localStorage 留着,别让前两条的账串味
    const res = acquireEquipment(mkItem('a', 'mortal', 7, 'w_qingshuang'), { quiet: true })
    expect(res.bagged, '这一件本该被回收').toBe(false)
    expect(useLoreStore().equipSeen('w_qingshuang'), '化成尘的那件也该记在见闻里').toEqual({
      q: qualityDef('mortal').rank,
      t: 7,
      u: 0
    })
  })

  /**
   * 「亲手用过」与「见过什么成色」分开记:成色靠运气(要撞上天品),
   * 而用不用它由玩家自己决定 —— 图鉴第二档因此是可推进的(见 ui/codex 的装备梯子)。
   */
  it('装备上身即算上手;强化也算;两者都写进见闻的 u', () => {
    const lore = useLoreStore()
    const inv = useInventoryStore()
    const res = useResourcesStore()
    // 直接摆一件进包:这条判据测的是「上手」怎么记,不想被自动回收与满包规则搅进来
    const item: EquipmentInstance = { uid: 'used-1', templateId: 'w_hanfeng', quality: 'fine', tier: 3, level: 0, affixes: [] }
    inv.items = [...inv.items, item]
    expect(lore.equipSeen('w_hanfeng')?.u ?? 0, '还没上身,不算用过').toBe(0)
    inv.equip('used-1', 'weapon')
    expect(lore.equipSeen('w_hanfeng')?.u, '装备上身即上手').toBe(1)

    // 强化也记:这是另一条能推进图鉴那一档的路
    res.addSmall('dust', 10_000)
    res.addStone(gn(1e12))
    const before = lore.equipSeen('w_qingshuang')?.u ?? 0
    expect(before).toBe(0)
    inv.items = [...inv.items, { uid: 'used-2', templateId: 'w_qingshuang', quality: 'heaven', tier: 3, level: 0, affixes: [] }]
    expect(upgradeEquipment('used-2'), '强化应当成功(素材已给足)').toBe(true)
    expect(lore.equipSeen('w_qingshuang')?.u, '强化过也算上手').toBe(1)
  })
})

/**
 * 逆旅「独行」· 到手法宝默认祭上的问题(玩家反馈,两条):
 * 「PC网页版转世立契,一世不用法器,但是解锁法器的时候系统会默认装备,契约直接失效了」
 * 「轮回时选择'整世不祭炼一件法宝'契约,下一世得到第一个法宝会默认装备,
 *   就算没有手动祭炼也会打破契约」
 *
 * 立下 artifact 禁忌之题时,系统不该替他「祭出」第一个法宝 ——
 * 破题必须是玩家自己的选择,不能是默认装备替他说了算。
 */
describe('逆旅「独行」· 到手法宝不默认祭上', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function vow(broken = false): import('@/data/samsara').LifeVow {
    return { themeId: 'lt_zejian', at: 0, base: {}, baseBranches: 0, baseAvenged: 0, broken }
  }

  it('未立题时,首个法宝照旧自动祭上(原行为)', () => {
    acquireArtifact('af_muyu')
    const inv = useInventoryStore()
    expect(inv.artifacts).toHaveLength(1)
    expect(inv.equippedArtifacts, '首个法宝默认祭上').toEqual(['af_muyu'])
  })

  it('立下「整世不祭法宝」之题后,到手法宝只入囊、不默认祭上', () => {
    usePlayerStore().setVow(vow(false))
    acquireArtifact('af_muyu')
    const inv = useInventoryStore()
    expect(inv.artifacts, '法宝在囊中').toHaveLength(1)
    expect(inv.equippedArtifacts, '立誓不祭法宝时不得自动祭上').toEqual([])
  })

  it('已破题或题目不忌法宝:照旧自动祭上(不得好心办坏事)', () => {
    usePlayerStore().setVow(vow(true))
    acquireArtifact('af_muyu')
    expect(useInventoryStore().equippedArtifacts, '破题后恢复默认行为').toEqual(['af_muyu'])

    setActivePinia(createPinia())
    usePlayerStore().setVow({ ...vow(false), themeId: 'lt_feisheng' }) // 不忌法宝的题
    acquireArtifact('af_muyu')
    expect(useInventoryStore().equippedArtifacts, '题目无关法宝时照常祭上').toEqual(['af_muyu'])
  })
})
