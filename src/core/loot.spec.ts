// 在线/离线的装备入包前都先过回收裁决,命中回收规则即化尘。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PILLS } from '@/data/pills'
import { rng } from '@/utils/random'
import {
  afterWin,
  acquireArtifact,
  acquireArtifactGain,
  acquireEquipment,
  ARTIFACT_NEAR_BONUS,
  ARTIFACT_NEAR_WINDOW,
  artifactDropWeight,
  expectedWinReward,
  randomDropArtifact,
  randomDropPill
} from './loot'
import { upgradeEquipment } from './forge'
import { ARTIFACTS, artifactDef, artifactValue } from '@/data/artifacts'
import type { ArtifactDef } from '@/types'
import { budgetOfMods } from './ruleBudget'
import { regionDef } from '@/data/regions'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { usePlayerStore } from '@/stores/player'
import { shouldAutoRecycle } from './smartKeep'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useSettingsStore } from '@/stores/settings'
import { useQuestsStore } from '@/stores/quests'
import { qualityDef } from '@/data/qualities'
import { DECOMPOSE_DUST } from '@/data/constants'
import { useLoreStore } from '@/stores/lore'
import { gn, toNum } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { modOf, capChance } from './statsCalc'
import type { EquipmentInstance, QualityId } from '@/types'
import { useUiStore } from '@/stores/ui'
import { ARTIFACTS as ALL_ARTIFACTS } from '@/data/artifacts'
import { equipmentTemplate } from '@/data/equipment'

describe('自动回收 · 装备入包前的第一道闸', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 不带套、无词条,判定只看品质;generateEquipment 的随机模板会搅浑判据。
  let seq = 0
  function mk(quality: QualityId): EquipmentInstance {
    seq += 1
    return { uid: `u${seq}`, templateId: 'b_qingyun', quality, tier: 3, level: 0, affixes: [] }
  }

  function bagUids(): string[] {
    return useInventoryStore().items.map(it => it.uid)
  }

  // rng.chance 不钳制,倍率堆叠出界即"必然掉落"或"永不掉落"。
  it('afterWin 里每个概率输入都钳在 [0,1] 内', () => {
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

  it('采集给草按「地界」品阶,不按玩家当前大境界(回刷低境只给低品)', () => {
    const player = usePlayerStore()
    player.initCharacter('品阶守卫', { roots: [] } as never)
    player.major = 12 // 仙品(3);青云(地界 0)只该给凡品(1)
    const resources = useResourcesStore()
    for (const g of [1, 2, 3, 4, 5] as const) resources.herbByGrade[g] = 0
    // 只放行灵草(rng.chance 判 0.5 的只有灵草)
    const spyC = vi.spyOn(rng, 'chance').mockImplementation(p => p === 0.5)
    const spyI = vi.spyOn(rng, 'int').mockReturnValue(2)
    try {
      afterWin(regionDef('qingyun')!, 1, false)
    } finally {
      spyC.mockRestore()
      spyI.mockRestore()
    }
    expect(resources.herbByGrade[1], '青云(地界 0)该给凡品灵草').toBeGreaterThan(0)
    expect(resources.herbOf(herbGradeOfMajor(player.major)), '采集不该按玩家当前大境界给品').toBe(0)
  })

  it('出行预览 expectedWinReward 与 afterWin 均值口径同源(所见即所打)', () => {
    const player = usePlayerStore()
    player.initCharacter('预览', { roots: [] } as never)
    const region = regionDef('qingyun')!
    const rewardMult = 1.4
    // 均值:灵石 float(0.8,1.2)→1.0;不翻倍、无掉落
    const spyF = vi.spyOn(rng, 'float').mockReturnValue(1)
    const spyC = vi.spyOn(rng, 'chance').mockReturnValue(false)
    try {
      const actual = afterWin(region, rewardMult, false)
      const preview = expectedWinReward(region, rewardMult)
      expect(toNum(preview.stone), '预览灵石应与实发均值一致').toBeCloseTo(toNum(actual.stone), 6)
      expect(toNum(preview.exp), '预览修为应与实发均值一致').toBeCloseTo(toNum(actual.exp), 6)
      expect(toNum(preview.stone)).toBeGreaterThan(0)
    } finally {
      spyF.mockRestore()
      spyC.mockRestore()
    }
  })

  it('智能收纳开启时,低于保留线的凡良拾取即化尘,不入行囊,器灵尘到账', () => {
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

  it('总闸:智能收纳未开启时,任何时候凡良都照常入包,不再自动回收', () => {
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
    const item = mk('excellent') // 精品 rank2,低于保留线
    const got = acquireEquipment(item)
    expect(bagUids()).not.toContain(item.uid)
    expect(got.line).toContain('未成流派')
    expect(resources.dust).toBeGreaterThanOrEqual(DECOMPOSE_DUST[2] ?? 1)
  })

  it('手动「一键分解」勾到全套,也不影响自动收纳的取舍 —— 该留的照留', () => {
    const settings = useSettingsStore()
    settings.smartKeep.enabled = true
    settings.decomposeRanks = [0, 1, 2, 3, 4, 5]
    for (const q of ['spirit', 'profound'] as const) {
      const item = mk(q) // 灵/玄品 ≥ 保留线(灵品)
      const got = acquireEquipment(item)
      expect(bagUids(), q).toContain(item.uid)
      expect(got.line, q).not.toContain('自动回收')
    }
  })

  it('新手馈赠(forceKeep)不受回收规则影响,必入包', () => {
    const starter = mk('mortal')
    acquireEquipment(starter, { forceKeep: true })
    expect(bagUids()).toContain(starter.uid)
  })

  it('行囊满时,保留下来的新件仍按老规矩腾退包内无缘旧件', () => {
    useSettingsStore().smartKeep.enabled = true
    const inventory = useInventoryStore()
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

/** 钉 loot.artifactDropWeight 就近加成三条:同品质下近者更重、旧物不被关掉、高层级时高界之物占多数。 */
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

  /**
   * 层级低于法宝来源层级时,权重不该继续涨。
   *
   * `artifactDropWeight` 里 `Math.max(0, tier - def.fromTier)` 把层级差钳在 0 —— 没有它,
   * tier 远低于 fromTier 时 distance 是负数,`ARTIFACT_NEAR_WINDOW - distance` 就超过窗口,
   * 就近加成会**突破设计上限**:实测 tier=-100 时权重 41800,是正常最大值的二十倍。
   * 现有用例都先按 `fromTier <= tier` 过滤,永远走不到这一支(变异扫描点名)。
   *
   * 钉法:tier 低于 fromTier 时,权重封顶在 tier == fromTier 那一档,不再增长。
   */
  it('层级不够时权重封顶,不因层级差为负而超过窗口上限', () => {
    const def = ARTIFACTS.find(a => a.fromTier > 1)!
    const atSource = artifactDropWeight(def, def.fromTier)
    const ceiling = atSource
    for (const tier of [def.fromTier - 1, 0, -50, -1000]) {
      const w = artifactDropWeight(def, tier)
      expect(w, `tier=${tier} 的权重 ${w} 超过了封顶 ${ceiling} —— 钳制没了`).toBeLessThanOrEqual(ceiling)
      expect(w, `tier=${tier} 该与来源层级同权重`).toBeCloseTo(ceiling, 6)
      expect(Number.isFinite(w), `tier=${tier} 的权重不是有限数`).toBe(true)
    }
  })

  it('同品质下,同层级的那件明显更重(约二十一倍)', () => {
    // 从表里取一对同品质、相隔 ≥ 就近窗口的真实法宝,不写死 id:品阶重排后判据仍成立
    const pair = ARTIFACTS.map(near => ({
      near,
      old: ARTIFACTS.find(b => b.quality === near.quality && near.fromTier - b.fromTier >= ARTIFACT_NEAR_WINDOW)
    })).find((p): p is { near: ArtifactDef; old: ArtifactDef } => p.old !== undefined)
    expect(pair, '池子里没有一对同品质、相隔 ≥ 就近窗口的法宝 —— 判据失去对象').toBeDefined()
    const { near, old } = pair!
    const tier = near.fromTier
    const ratio = artifactDropWeight(near, tier) / artifactDropWeight(old, tier)
    // 同阶 ×(1 + 幅度 × 窗口),出了窗口 ×1
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
    // 实测约 0.61(无就近加成约 0.40),阈值留足余量
    expect(high / n, `${n} 次里只有 ${high} 次抽到仙界以上的法宝`).toBeGreaterThan(0.55)
  })
})

/**
 * 品阶同时定掉落权重(artifactDropWeight)与数值倍率(data/artifacts.artifactQualityMult)。
 * 钉两条:按 (fromTier 升,同阶内预算升) 品阶不倒挂;每个界域池中神品占比(按权重与按件数)都是个位数百分比。
 * 故障注入:把 45 件的品阶退回重排之前那一版(18 件神品),第二条红。
 */
describe('法宝品阶 · 稀缺标签', () => {
  it('标签跟着 fromTier 走:深地界出的那件,品阶不低于浅地界出的', () => {
    // 排序键是 artifactValue 之后的被动预算,不是数据里的基线;同预算按品阶排,不让数组书写顺序决定成败
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
    expect(ARTIFACTS.filter(a => a.quality === 'divine').length, '一件神品都没有 —— 阶梯缺了顶端').toBeGreaterThan(0)
    expect(maxShare, `神品在 ${maxTier} 阶占比最高,为 ${(maxShare * 100).toFixed(1)}%`).toBeLessThan(0.1)
  })
})

/** lore.equipLore 唯一写入点是 acquireEquipment。守三条:拾得即记、只记更好的一件、被化尘的那件也算见过。 */
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
    // 换模板:lore 分片在用例之间随 localStorage 残留
    const res = acquireEquipment(mkItem('a', 'mortal', 7, 'w_qingshuang'), { quiet: true })
    expect(res.bagged, '这一件本该被回收').toBe(false)
    expect(useLoreStore().equipSeen('w_qingshuang'), '化成尘的那件也该记在见闻里').toEqual({
      q: qualityDef('mortal').rank,
      t: 7,
      u: 0
    })
  })

  /** 「亲手用过」(u)与「见过什么成色」分开记,供图鉴第二档(见 ui/codex 的装备梯子) */
  it('装备上身即算上手;强化也算;两者都写进见闻的 u', () => {
    const lore = useLoreStore()
    const inv = useInventoryStore()
    const res = useResourcesStore()
    // 直接摆一件进包,绕开自动回收与满包规则
    const item: EquipmentInstance = { uid: 'used-1', templateId: 'w_hanfeng', quality: 'fine', tier: 3, level: 0, affixes: [] }
    inv.items = [...inv.items, item]
    expect(lore.equipSeen('w_hanfeng')?.u ?? 0, '还没上身,不算用过').toBe(0)
    inv.equip('used-1', 'weapon')
    expect(lore.equipSeen('w_hanfeng')?.u, '装备上身即上手').toBe(1)

    res.addSmall('dust', 10_000)
    res.addStone(gn(1e12))
    const before = lore.equipSeen('w_qingshuang')?.u ?? 0
    expect(before).toBe(0)
    inv.items = [...inv.items, { uid: 'used-2', templateId: 'w_qingshuang', quality: 'heaven', tier: 3, level: 0, affixes: [] }]
    expect(upgradeEquipment('used-2'), '强化应当成功(素材已给足)').toBe(true)
    expect(lore.equipSeen('w_qingshuang')?.u, '强化过也算上手').toBe(1)
  })
})

/** 立下 artifact 禁忌之题时,系统不替玩家祭出第一个法宝;破题须是玩家自己的选择。 */
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

describe('出行预览 · 福缘翻倍均值', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('预览含 doubleDropRate 的均值期望(探宝构筑"一胜约" == 均值公式× (1+capChance(p)))', () => {
    const player = usePlayerStore()
    player.initCharacter('拾珍', { roots: [] } as never)
    ;(player.reincarnation as { talents: string[] }).talents = ['t_tanbao'] // +0.05 双倍福缘
    const region = regionDef('qingyun')!
    const rewardMult = 1
    const mods = player.finalStats.mods
    const p = modOf(mods, 'doubleDropRate')
    expect(p, '探宝应注入双倍福缘').toBeGreaterThan(0)
    const r = expectedWinReward(region, rewardMult)
    // 与 afterWin 的 doubled / 离线 doubleMult 同源;漏乘 (1+capChance(p)) 即红
    expect(toNum(r.stone)).toBeCloseTo(
      toNum(stoneByTier(region.tier, 10 * rewardMult * (1 + modOf(mods, 'spiritStoneGain')) * (1 + capChance(p)))),
      6
    )
  })
})

describe('矿石掉落战报', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('矿石掉落要报进「本战拾获」(与灵草同规:给即报品,不能凭空到账)', () => {
    const resources = useResourcesStore()
    const before = resources.ore
    // 只放行矿石(rng.chance 判 ORE_DROP_CHANCE=0.35)
    const spyC = vi.spyOn(rng, 'chance').mockImplementation(p => p === 0.35)
    const spyI = vi.spyOn(rng, 'int').mockReturnValue(1)
    let lines: string[] = []
    try {
      lines = afterWin(regionDef('qingyun')!, 1, false).lines
    } finally {
      spyC.mockRestore()
      spyI.mockRestore()
    }
    expect(resources.ore, '矿石掉落实发').toBeGreaterThan(before)
    expect(lines.some(l => l.includes('玄铁')), '掉落的矿石必须报进战报行,不能给而不报').toBe(true)
  })
})


describe('得宝仪典 · 顶档之物入手才翻开那一刻', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** 天/仙/神三档逐档拾一件;只有神品该开仪典 */
  it('拾得神品开仪典,天品与仙品不开 —— 落差只给最顶那一档', () => {
    const ui = useUiStore()
    for (const q of ['heaven', 'immortal'] as const) {
      ui.clearTreasure()
      acquireEquipment({
        uid: `t-${q}`,
        templateId: 'b_qingyun',
        quality: q,
        tier: 3,
        level: 0,
        affixes: []
      })
      expect(ui.treasure, `${qualityDef(q).name}不该开仪典`).toBeNull()
    }

    ui.clearTreasure()
    acquireEquipment({
      uid: 't-divine',
      templateId: 'b_qingyun',
      quality: 'divine',
      tier: 20,
      level: 0,
      affixes: []
    })
    expect(ui.treasure, '神品该开仪典').not.toBeNull()
    expect(ui.treasure!.grade).toBe(qualityDef('divine').name)
    expect(ui.treasure!.kindName).toBe('装备')
    // 名取自模板表,不是 toast 里那串「神品·名」拼出来的
    expect(ui.treasure!.name).toBe(equipmentTemplate('b_qingyun')!.name)
  })

  it('quiet(离线批量结算)一件都不开 —— 玩家没看着屏幕', () => {
    const ui = useUiStore()
    ui.clearTreasure()
    acquireEquipment(
      { uid: 'q-divine', templateId: 'b_qingyun', quality: 'divine', tier: 20, level: 0, affixes: [] },
      { quiet: true, forceKeep: true }
    )
    expect(ui.treasure, '静默拾取不该翻开仪典').toBeNull()
  })

  it('神品法宝同样开;凡品法宝不开', () => {
    const ui = useUiStore()
    const divine = ALL_ARTIFACTS.find(a => a.quality === 'divine')!
    const mortal = ALL_ARTIFACTS.find(a => a.quality === 'mortal')!
    ui.clearTreasure()
    acquireArtifact(mortal.id)
    expect(ui.treasure, '凡品法宝不该开仪典').toBeNull()
    ui.clearTreasure()
    acquireArtifact(divine.id)
    expect(ui.treasure, '神品法宝该开仪典').not.toBeNull()
    expect(ui.treasure!.kindName).toBe('法宝')
    expect(ui.treasure!.name).toBe(divine.name)
  })

  it('被自动回收/化尘的神品不翻仪典 —— 没入囊的东西不该敲锣', () => {
    const ui = useUiStore()
    ui.clearTreasure()
    useSettingsStore().smartKeep.enabled = true
    // 化尘发生在入包之前,仪典只在真正入囊那条分支上
    acquireEquipment({ uid: 'dust-divine', templateId: 'b_qingyun', quality: 'mortal', tier: 1, level: 0, affixes: [] })
    expect(ui.treasure).toBeNull()
  })

  it('store 的仪典是单件语义:后一件顶替前一件,不排队', () => {
    const ui = useUiStore()
    ui.clearTreasure()
    acquireEquipment({ uid: 'd1', templateId: 'b_qingyun', quality: 'divine', tier: 20, level: 0, affixes: [] })
    const first = ui.treasure!.name
    acquireEquipment({ uid: 'd2', templateId: 'h_muzan', quality: 'divine', tier: 20, level: 0, affixes: [] })
    expect(ui.treasure!.name).not.toBe(first)
    ui.clearTreasure()
    expect(ui.treasure).toBeNull()
  })
})

describe('法宝入囊 · 野 id', () => {
  // 单独 -t 跑时顶层 hook 不生效,须自己装(否则 useInventoryStore 直接抛)
  beforeEach(() => setActivePinia(createPinia()))

  it('给定法宝表里没有的 id,当收入,则得 null 且不写行囊、不记收集、不刷 toast', () => {
    /*
     * `if (!def) return null` 是真守卫:去掉后 collect('artifact', 野id) 会把这个 id
     * 记进图鉴,而 addArtifact 也会拿到不存在的 defId —— 行囊里多出一件查无定义的器。
     * 注释写明「null 表示野 id,调用方须停止后续抽取」,这条契约值得钉住。
     */
    const inv = useInventoryStore()
    const quests = useQuestsStore()
    const res = useResourcesStore()
    const artifactsBefore = JSON.stringify(inv.artifacts)
    const collectionsBefore = JSON.stringify(quests.collections)
    const wudaoBefore = res.wudao
    const toastsBefore = useUiStore().toasts.length

    expect(() => acquireArtifactGain('no_such_artifact')).not.toThrow()
    expect(acquireArtifactGain('no_such_artifact')).toBeNull()
    expect(JSON.stringify(inv.artifacts), '野 id 不该进行囊').toBe(artifactsBefore)
    // collect() 会把 id 写进图鉴收集表 —— 这条是审查指出漏掉的那一项
    expect(JSON.stringify(quests.collections), '野 id 不该被记进图鉴').toBe(collectionsBefore)
    // 重复法宝那一支会发悟道之尘;野 id 连 def 都没有,更不该走到那
    expect(res.wudao, '野 id 不该发任何资源').toBe(wudaoBefore)
    expect(useUiStore().toasts.length, '野 id 不该给玩家提示').toBe(toastsBefore)
  })
})

/*
 * 掉落丹药:池子只装「当前境界用得上、且没有配方」的那几味。
 *
 * `randomDropPill` 此前零覆盖,变异扫描因此把 `if (pool.length === 0) return null`
 * 报成「改坏了不会红」。查下来那是**死分支**:无配方的丹有 20 味、minRealm 落在
 * 0~19,连 major=0 都摸得到一味,池子永远不会空。
 * 所以不补那条,改锁真正会影响玩家的两条:池子的**成分**与**边界**。
 */
describe('掉落丹药 · 池子装的是哪些', () => {
  it('给定境界,当抽掉落丹,则只在「用得上且无配方」的那几味里出', () => {
    for (const major of [0, 3, 9, 14, 20]) {
      const allowed = PILLS.filter(p => p.minRealm <= major && !p.recipe).map(p => p.id)
      expect(allowed.length, `major=${major} 的池子不该是空的(那是死分支的前提)`).toBeGreaterThan(0)
      for (let i = 0; i < 20; i += 1) {
        const id = randomDropPill(major)
        expect(id, `major=${major} 抽到了空`).not.toBeNull()
        expect(allowed, `major=${major} 抽到了池子外的 ${id}`).toContain(id!)
      }
    }
  })

  it('给定高于所有配方丹的境界,当抽掉落丹,则不会给出需要配方的那几味', () => {
    // 配方丹是玩家自己炼的,不该凭空掉 —— 这一条是 `!p.recipe` 那半个条件的行为面
    const recipeIds = new Set(PILLS.filter(p => p.recipe).map(p => p.id))
    for (let i = 0; i < 30; i += 1) {
      const id = randomDropPill(20)
      expect(recipeIds.has(id!), `抽到了配方丹 ${id}`).toBe(false)
    }
  })
})
