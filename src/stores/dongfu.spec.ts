import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDongfuStore, fieldHerbGrade } from './dongfu'
import { BUILDINGS, ARRAY_QI_CAP_PER_LEVEL, BEAST_EFFECT_PER_LEVEL } from '@/data/buildings'
import { FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, FORGE_LEVEL_PER_CAP, LIBRARY_WUDAO_PER_HOUR } from '@/data/constants'
import { MAX_MAJOR } from '@/data/realms'
import type { HerbGrade } from '@/data/herbGrades'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { modsText } from '@/ui/statNames'
import { readFileSync } from 'node:fs'
import type { BuildingId } from '@/types'

describe('dongfu store · sanitize', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('损坏的等级收敛回 0', () => {
    const dongfu = useDongfuStore()
    const corrupted = { ...dongfu.levels, mansion: NaN, alchemy: -3 } as Record<BuildingId, number>
    dongfu.levels = corrupted
    dongfu.sanitize()
    expect(dongfu.levels.mansion).toBe(0)
    expect(dongfu.levels.alchemy).toBe(0)
    // 修复后离线封顶小时恢复合法值,不再 NaN
    expect(dongfu.offlineCapHours).toBeGreaterThan(0)
    expect(Number.isFinite(dongfu.offlineCapHours)).toBe(true)
  })

  it('炼器台每 FORGE_LEVEL_PER_CAP 级提升强化上限 1(常数真的接线,不是写死的 2)', () => {
    const dongfu = useDongfuStore()
    dongfu.setLevel('forge', FORGE_LEVEL_PER_CAP * 3)
    expect(dongfu.forgeCapBonus).toBe(3)
    dongfu.setLevel('forge', FORGE_LEVEL_PER_CAP * 3 + 1)
    expect(dongfu.forgeCapBonus).toBe(3) // 未满一档
  })

  it('越界的等级钳到建筑上限', () => {
    const dongfu = useDongfuStore()
    const mansion = BUILDINGS.find(b => b.id === 'mansion')!
    dongfu.levels = { ...dongfu.levels, mansion: mansion.maxLevel + 99 }
    dongfu.sanitize()
    expect(dongfu.levels.mansion).toBe(mansion.maxLevel)
  })

  it('非法产出小数与灵脉点数归零', () => {
    const dongfu = useDongfuStore()
    dongfu.frac = { herb: NaN, ore: Infinity, wudao: 3 }
    dongfu.veinPoints = { gather: NaN, craft: -2, alchemy: 5, insight: 0 }
    dongfu.sanitize()
    expect(dongfu.frac.herb).toBe(0)
    expect(dongfu.frac.ore).toBe(0)
    expect(dongfu.frac.wudao).toBe(3)
    expect(dongfu.veinPoints.gather).toBe(0)
    expect(dongfu.veinPoints.craft).toBe(0)
    expect(dongfu.veinPoints.alchemy).toBe(5)
  })
})

describe('dongfu store · buildingCap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('洞府低级时是全局闸门在管:灵兽园品类 8 也被压在 5', () => {
    const dongfu = useDongfuStore() // mansion 0 -> buildingLevelCap 5
    const beast = BUILDINGS.find(b => b.id === 'beast')!
    expect(dongfu.buildingCap('beast')).toBe(Math.min(beast.maxLevel, 5))
  })

  it('洞府提级后上限上浮,直到自身品类上限接管', () => {
    const dongfu = useDongfuStore()
    dongfu.levels = { ...dongfu.levels, mansion: 1 } // cap 10
    // 灵兽园品类 8 < 10,仍是品类在管
    expect(dongfu.buildingCap('beast')).toBe(8)
    // 藏经阁品类 12 > 10,此时洞府闸门在管
    const library = BUILDINGS.find(b => b.id === 'library')!
    expect(dongfu.buildingCap('library')).toBe(Math.min(library.maxLevel, 10))
  })

  it('洞府满级 25 永不成为其余建筑的瓶颈:各建筑品类上限更低', () => {
    const dongfu = useDongfuStore()
    dongfu.levels = { ...dongfu.levels, mansion: 4 } // cap 25
    for (const def of BUILDINGS) {
      if (def.id === 'mansion') continue
      expect(dongfu.buildingCap(def.id)).toBe(def.maxLevel)
      expect(def.maxLevel).toBeLessThan(25) // 品类上限都在 25 之下
    }
  })

  it('洞府自身只受品类上限约束,不被自己闸门卡住', () => {
    const dongfu = useDongfuStore()
    const mansion = BUILDINGS.find(b => b.id === 'mansion')!
    expect(dongfu.buildingCap('mansion')).toBe(mansion.maxLevel)
  })
})

/**
 * 比率体检:洞府产出对**等级**必须是线性的(与镇压对时长的线性同一条尺子)。
 * 只看"有没有产出"看不出某处被 clamp 或按整点取整 —— 三级灵田的余数
 * 应当恰是一级的三倍。
 */
describe('洞府产出 · 等级线性', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const fracAfter = (level: number, seconds: number): { herb: number; ore: number; wudao: number } => {
    setActivePinia(createPinia())
    const dongfu = useDongfuStore()
    dongfu.levels.field = level
    dongfu.levels.library = level
    dongfu.produce(seconds)
    return { herb: dongfu.frac.herb, ore: dongfu.frac.ore, wudao: dongfu.frac.wudao }
  }

  it('三级灵田/藏经阁的产出恰是一级的三倍(取整前看余数,避免被 floor 掩盖)', () => {
    /**
     * 时长要短到"一份整产出都不满":produce 每次调用都会把整数量 floor 进资源,
     * 一旦某条产线凑够 1,余数就不再与总量成比例(实测 1332 秒时铁矿余数比只剩 0.75)。
     * 120 秒下三条产线都不到 1,frac 就是总量本身,比值才干净。
     */
    const seconds = 120
    const one = fracAfter(1, seconds)
    const three = fracAfter(3, seconds)
    expect(one.herb).toBeGreaterThan(0)
    expect(three.herb / one.herb).toBeCloseTo(3, 6)
    expect(three.ore / one.ore).toBeCloseTo(3, 6)
    expect(three.wudao / one.wudao).toBeCloseTo(3, 6)
  })

  it('零级不产出(升级是唯一来源,没有兜底白送)', () => {
    const zero = fracAfter(0, 3600)
    expect(zero.herb).toBe(0)
    expect(zero.ore).toBe(0)
    expect(zero.wudao).toBe(0)
  })
})

describe('建筑卡与结算同源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('卡片把 mods 另起一行,洞府修速与藏经阁战斗修为不再只活在属性里', () => {
    const card = readFileSync(new URL('../components/dongfu/BuildingCard.vue', import.meta.url), 'utf8')
    expect(card).toContain('modsText(')
    const mansion = BUILDINGS.find(b => b.id === 'mansion')!
    const library = BUILDINGS.find(b => b.id === 'library')!
    expect(modsText(mansion.mods!(1))).toContain('修炼速度 +4%')
    expect(modsText(library.mods!(1))).toContain('战斗修为 +3%')
    // effectText 不再手写这两条,避免和词条行各说各的
    expect(mansion.effectText(1)).not.toContain('修炼速度')
    expect(library.effectText(1)).not.toContain('战斗修为')
  })

  it('聚灵阵灵气上限与灵兽园倍率,文案和结算读同一个常数', () => {
    const dongfu = useDongfuStore()
    dongfu.setLevel('array', 5)
    dongfu.setLevel('beast', 3)
    expect(dongfu.qiCapMult).toBeCloseTo(1 + 5 * ARRAY_QI_CAP_PER_LEVEL)
    expect(dongfu.beastMult).toBeCloseTo(1 + 3 * BEAST_EFFECT_PER_LEVEL)
    const array = BUILDINGS.find(b => b.id === 'array')!
    const beast = BUILDINGS.find(b => b.id === 'beast')!
    expect(array.effectText(5)).toContain(`${Math.round(5 * ARRAY_QI_CAP_PER_LEVEL * 100)}%`)
    expect(beast.effectText(3)).toContain(`${Math.round(3 * BEAST_EFFECT_PER_LEVEL * 100)}%`)
    expect(array.effectText(1)).not.toMatch(/灵气恢复|修炼速度/)
  })

  it('炼器台强化上限文案跟 FORGE_LEVEL_PER_CAP 走', () => {
    const forge = BUILDINGS.find(b => b.id === 'forge')!
    expect(forge.effectText(FORGE_LEVEL_PER_CAP)).toContain('强化上限 +1')
  })
})

describe('洞府产出 · 灵田品阶(灵田等级越高产更高品)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const SECONDS = 2400 // 久到 1 级田也凑得出一整株:fieldLv × 6/3600 × 2400 = fieldLv×4 株
  const herbCount = (fieldLv: number): number => (fieldLv * FIELD_HERB_PER_HOUR * SECONDS) / 3600

  const yieldByGrade = (major: number, fieldLv: number): Record<HerbGrade, number> => {
    const player = usePlayerStore()
    player.major = major
    const dongfu = useDongfuStore()
    dongfu.setLevel('field', fieldLv)
    dongfu.produce(SECONDS)
    const res = useResourcesStore()
    return { 1: res.herbOf(1), 2: res.herbOf(2), 3: res.herbOf(3), 4: res.herbOf(4), 5: res.herbOf(5) }
  }

  it('低灵田:产出当前境界品,凡境(0)只落凡品', () => {
    expect(yieldByGrade(0, 1)).toEqual({ 1: herbCount(1), 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('高灵田:同凡境(0)前瞻一档提到灵品(2),不越当前+1', () => {
    expect(yieldByGrade(0, 13)).toEqual({ 1: 0, 2: herbCount(13), 3: 0, 4: 0, 5: 0 })
  })

  it('高境界低灵田:仍保当前品下限,不掉回低品', () => {
    // 道品(5)境、1 级田:田上限只是凡品,但 max(当前品=5) 兜住,仍给道品
    expect(yieldByGrade(MAX_MAJOR, 1)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: herbCount(1) })
  })

  it('到顶不越道品(5):混沌海拉满灵田仍止于道品', () => {
    expect(yieldByGrade(MAX_MAJOR, 15)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: herbCount(15) })
  })
})

describe('fieldHerbGrade 直接判定(洞府纪要的「前瞻 ↑」信号源)', () => {
  // 界面「前瞻 ↑ XX品」就靠 fieldHerbGrade 是否高于当前境品判 —— 与 produce 同一判据,
  // 单独把它钉在边界上,免得界面提示与实际入账漂移。

  it('低灵田未到跃迁档:产当前境品(凡境 3 级田仍凡品)', () => {
    expect(fieldHerbGrade(0, 3)).toBe(1)
  })

  it('灵田 4 级(跃迁档)凡境即前瞻为灵品:产 2,高于当前品 1', () => {
    expect(fieldHerbGrade(0, 4)).toBe(2)
  })

  it('高境界低灵田:保当前品下限,不因田低掉回低品', () => {
    expect(fieldHerbGrade(MAX_MAJOR, 1)).toBe(5)
  })

  it('混沌海(道品=5)拉满:止于道品,不再越', () => {
    expect(fieldHerbGrade(MAX_MAJOR, 15)).toBe(5)
  })

  /**
   * 中档夹逼 —— 极端(band 两端)之外,「至多高当前一档」「保当前品下限」在
   * 中间境界才真正发威:major 9-13 当前品=3,田拉满(可种 5)只许前瞻到 4,
   * 绝不一步到道品;田低(可种 2)仍保 3,不掉回灵品。
   */
  it('中境界拉满(当前品3/可种5):只前瞻+1到4,不跳到田上限5', () => {
    expect(fieldHerbGrade(9, 15)).toBe(4)
    expect(fieldHerbGrade(13, 15)).toBe(4) // band 上缘(13)同一判据
  })

  it('中境界低田(当前品3/可种2):保下限仍 3,不因田低掉回灵品', () => {
    expect(fieldHerbGrade(9, 4)).toBe(3)
  })

  it('中境界田恰在当前品(可种3):前瞻无空间,仍 3', () => {
    expect(fieldHerbGrade(9, 7)).toBe(3)
  })

  it('低境界拉满(当前品1/可种5):只前瞻到2,不一步到5', () => {
    expect(fieldHerbGrade(0, 15)).toBe(2)
  })

  it('灵品境(当前品2)低田:保下限仍 2', () => {
    expect(fieldHerbGrade(5, 4)).toBe(2)
  })

  it('道品之境(当前品4)拉满:可种5→5,仍不越道品', () => {
    expect(fieldHerbGrade(14, 15)).toBe(5)
  })
})

describe('洞府产出 · 跨整界原子(拆批等值/余数进位)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const herbTotal = (): number => Object.values(useResourcesStore().herbByGrade).reduce((a, b) => a + (b ?? 0), 0)

  it('拆开多次与一次连产等值:produce(450)×2 的落账与 frac 恰等于 produce(900) 一次', () => {
    // 灵田 lv1 = 6 株/时 -> 450s=0.75 株、900s=1.5 株;粗看 floor 会吞小数,
    // 但余数进位必须两边一致(逐次取整的漂移在此会露头)
    const batch = (): { herb: number; frac: number } => {
      setActivePinia(createPinia())
      const d = useDongfuStore()
      d.levels.field = 1
      d.levels.library = 1
      d.produce(900)
      return { herb: herbTotal(), frac: d.frac.herb }
    }
    const s = (): { herb: number; frac: number } => {
      setActivePinia(createPinia())
      const d = useDongfuStore()
      d.levels.field = 1
      d.levels.library = 1
      d.produce(450)
      d.produce(450)
      return { herb: herbTotal(), frac: d.frac.herb }
    }
    const a = s()
    const b = batch()
    expect(a.herb, '拆开与一次连产应给出同样多的整株').toBe(b.herb)
    expect(a.frac).toBeCloseTo(b.frac, 9)
    expect(Number.isFinite(a.frac)).toBe(true)
  })

  it('跨整界只整发:灵田 lv1 产 900s(=1.5 株)只落 1 株、余 0.5 进位,不加刀', () => {
    setActivePinia(createPinia())
    const d = useDongfuStore()
    d.levels.field = 1
    const before = herbTotal()
    d.produce(900) // 1.5 株 -> 整发 1
    expect(herbTotal() - before).toBe(1)
    expect(d.frac.herb).toBeCloseTo(0.5, 9)
    // 再补 300s(=0.5 株) -> 余数 0.5+0.5=1.0,恰好再整发 1 株
    const mid = herbTotal()
    d.produce(300)
    expect(herbTotal() - mid).toBe(1)
    expect(d.frac.herb).toBeCloseTo(0, 9)
  })

  it('产出落在灵田当前可种品(整发的草挂对品阶桶)', () => {
    setActivePinia(createPinia())
    const d = useDongfuStore()
    const player = usePlayerStore()
    d.levels.field = 1
    const grade = fieldHerbGrade(player.major, 1)
    d.produce(600) // 恰 1 株
    expect(useResourcesStore().herbByGrade[grade] ?? 0).toBeGreaterThanOrEqual(1)
  })
})

describe('洞府产出 · 长时间量级(长时整发恰准/拆批等值不漂)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const herbTotal = (): number => Object.values(useResourcesStore().herbByGrade).reduce((a, b) => a + (b ?? 0), 0)
  const wudaoTotal = (): number => useResourcesStore().wudao
  const oreTotal = (): number => useResourcesStore().ore

  it('长时单次(field/library 2 × 200000s ≈ 55.6h)产出恰按 floor 整发,余数收进 [0,1) 不丢不漂', () => {
    // lv2:herb = 2*6*dt/3600、ore = 2*2.4*dt/3600、wudao = 2*1.5*dt/3600 (dt=200000 → 666.67/266.67/166.67)
    const d = useDongfuStore()
    d.levels.field = 2
    d.levels.library = 2
    const herbBefore = herbTotal()
    const wudaoBefore = wudaoTotal()
    const oreBefore = oreTotal()
    d.produce(200_000)
    expect(herbTotal() - herbBefore).toBe(Math.floor((2 * FIELD_HERB_PER_HOUR * 200_000) / 3600))
    expect(oreTotal() - oreBefore).toBe(Math.floor((2 * FIELD_ORE_PER_HOUR * 200_000) / 3600))
    expect(wudaoTotal() - wudaoBefore).toBe(Math.floor((2 * LIBRARY_WUDAO_PER_HOUR * 200_000) / 3600))
    // 3 层整发后余数都收敛在 [0,1):量级放大不该丢整份、也不该多给
    expect(d.frac.herb).toBeGreaterThanOrEqual(0)
    expect(d.frac.herb).toBeLessThan(1)
    expect(d.frac.ore).toBeLessThan(1)
    expect(d.frac.wudao).toBeLessThan(1)
  })

  it('量级拆批等值:produce(100000)×2 的落账与 frac 恰等于 produce(200000) 一次(漂移在放大 dt 下也成立)', () => {
    const runBoth = (): { herb: number; wudao: number; fracHerb: number } => {
      setActivePinia(createPinia())
      const d = useDongfuStore()
      d.levels.field = 2
      d.levels.library = 2
      const h0 = herbTotal()
      const w0 = wudaoTotal()
      d.produce(100_000)
      d.produce(100_000)
      return { herb: herbTotal() - h0, wudao: wudaoTotal() - w0, fracHerb: d.frac.herb }
    }
    const runOne = (): { herb: number; wudao: number; fracHerb: number } => {
      setActivePinia(createPinia())
      const d = useDongfuStore()
      d.levels.field = 2
      d.levels.library = 2
      const h0 = herbTotal()
      const w0 = wudaoTotal()
      d.produce(200_000)
      return { herb: herbTotal() - h0, wudao: wudaoTotal() - w0, fracHerb: d.frac.herb }
    }
    const split = runBoth()
    const one = runOne()
    expect(split.herb).toBe(one.herb)
    expect(split.wudao).toBe(one.wudao)
    expect(split.fracHerb).toBeCloseTo(one.fracHerb, 9)
  })
})
