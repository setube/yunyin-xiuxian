import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDongfuStore, fieldHerbGrade } from './dongfu'
import { BUILDINGS, ARRAY_QI_CAP_PER_LEVEL, BEAST_EFFECT_PER_LEVEL } from '@/data/buildings'
import {
  FIELD_HERB_PER_HOUR,
  FIELD_ORE_PER_HOUR,
  FORGE_LEVEL_PER_CAP,
  LIBRARY_WUDAO_PER_HOUR,
  VEIN_MAIN_CAPACITY,
  VEIN_TOTAL_CAPACITY
} from '@/data/constants'
import { MAX_MAJOR } from '@/data/realms'
import type { HerbGrade } from '@/data/herbGrades'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { modsText } from '@/data/statNames'
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

  it('灵脉点数只留认得的四条脉,单脉超出主脉容量的部分裁回', () => {
    const dongfu = useDongfuStore()
    // 多余键会计入「已投 N/100」,却无卡可显示或迁出
    dongfu.veinPoints = { gather: 60, craft: 999, alchemy: 2, insight: 0, ghost: 400 } as never
    dongfu.sanitize()
    expect(Object.keys(dongfu.veinPoints).sort()).toEqual(['alchemy', 'craft', 'gather', 'insight'])
    // 单脉先各自裁到主脉容量(70),总量再压回 VEIN_TOTAL_CAPACITY。
    // 原断言写 132 —— 那是「单脉裁完就不管总量」的旧结果,会让「132/100」与 132% 进度条露在界面上,
    // 也会让 investVein 的 `veinTotal >= VEIN_TOTAL_CAPACITY` 闸门恒为真、从此一点也投不进去。
    expect(dongfu.veinTotal).toBe(VEIN_TOTAL_CAPACITY)
    expect(dongfu.veinPoints.craft).toBeGreaterThan(0)
  })

  it('主脉认不出时回落到「未定主脉」,四条脉重新按主脉档可投', () => {
    const dongfu = useDongfuStore()
    dongfu.veinMain = 'ghost' as never
    dongfu.veinPoints = { gather: 30, craft: 0, alchemy: 0, insight: 0 }
    dongfu.sanitize()
    expect(dongfu.veinMain).toBeNull()
  })

  it('灵脉投点只认认得的脉与有限正数,坏调用不污染点数', () => {
    const dongfu = useDongfuStore()
    dongfu.addVeinPoint('gather', 3)
    dongfu.addVeinPoint('gather', NaN)
    dongfu.addVeinPoint('gather', Infinity)
    dongfu.addVeinPoint('gather', -5)
    dongfu.addVeinPoint('gather', 0)
    dongfu.addVeinPoint('ghost' as never, 5)
    expect(dongfu.veinPoints.gather).toBe(3)
    expect(dongfu.veinPoints).not.toHaveProperty('ghost')
  })

  it('灵脉公共写入:单脉不超过主脉容量,主脉只认目录', () => {
    const dongfu = useDongfuStore()
    dongfu.addVeinPoint('gather', VEIN_MAIN_CAPACITY + 20)
    expect(dongfu.veinPoints.gather, '单脉封顶到主脉容量').toBe(VEIN_MAIN_CAPACITY)
    dongfu.setVeinMain('ghost' as never)
    expect(dongfu.veinMain, '野脉不立为主脉').toBeNull()
  })

  it('建筑公共写入:只认目录,等级夹到 0..品类上限', () => {
    const dongfu = useDongfuStore()
    const field = BUILDINGS.find(b => b.id === 'field')!
    dongfu.setLevel('ghost' as never, 3)
    expect(dongfu.levels).not.toHaveProperty('ghost')
    dongfu.setLevel('field', NaN)
    expect(dongfu.levels.field).toBe(0)
    dongfu.setLevel('field', -4)
    expect(dongfu.levels.field).toBe(0)
    dongfu.setLevel('field', field.maxLevel + 99)
    expect(dongfu.levels.field).toBe(field.maxLevel)
    dongfu.setLevel('field', 3.9)
    expect(dongfu.levels.field).toBe(3)
  })

  it('坏产出时长:NaN/Infinity/负数都不推进余数,也不反向扣资源', () => {
    const dongfu = useDongfuStore()
    dongfu.setLevel('field', 1)
    dongfu.frac = { herb: 0.25, ore: 0.25, wudao: 0.25 }
    for (const dt of [NaN, Infinity, -10]) {
      dongfu.produce(dt)
      expect(dongfu.frac, `坏时长 ${dt} 不动余数`).toEqual({ herb: 0.25, ore: 0.25, wudao: 0.25 })
    }
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
      expect(def.maxLevel).toBeLessThan(25)
    }
  })

  it('洞府自身只受品类上限约束,不被自己闸门卡住', () => {
    const dongfu = useDongfuStore()
    const mansion = BUILDINGS.find(b => b.id === 'mansion')!
    expect(dongfu.buildingCap('mansion')).toBe(mansion.maxLevel)
  })
})

/** 洞府产出对等级须线性:三级余数恰为一级的三倍 */
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
    // 时长须短到三条产线都不满 1 份:否则整数已 floor 进资源,余数不再成比例
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
    // 这两条只由词条行给出,effectText 不写
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

  const SECONDS = 2400 // fieldLv × 6/3600 × 2400 = fieldLv × 4 株
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
    // 1 级田上限凡品,max(当前品 5) 兜住
    expect(yieldByGrade(MAX_MAJOR, 1)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: herbCount(1) })
  })

  it('到顶不越道品(5):混沌海拉满灵田仍止于道品', () => {
    expect(yieldByGrade(MAX_MAJOR, 15)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: herbCount(15) })
  })
})

describe('fieldHerbGrade 直接判定(洞府纪要的「前瞻 ↑」信号源)', () => {
  // 界面「前瞻 ↑」与 produce 同用此判据;钉住边界,防二者漂移

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

  /** 中档夹逼:major 9-13 当前品 3,田满(可种 5)只到 4,田低(可种 2)仍保 3 */
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
    // 灵田 lv1 = 6 株/时:450s = 0.75 株、900s = 1.5 株;拆批与一次的余数进位须一致
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
    // 再补 300s(0.5 株):余数凑满 1,再整发 1 株
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
    // lv2:herb = 2*6*dt/3600、ore = 2*2.4*dt/3600、wudao = 2*1.5*dt/3600
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

describe('灵田产草品阶 · 等级表唯一事实源', () => {
  it('低境拉满也最多高当前一档,等级低时压回当前品(不越级不砸下限)', () => {
    // major 0=凡品(1):田满(cap 5)也只前瞻到 2;田零级(cap 1)压回当前品 1
    expect(fieldHerbGrade(0, 15)).toBe(2)
    expect(fieldHerbGrade(0, 0)).toBe(1)
    // major 9=仙品(3):田满前瞻 +1 → 神品(4)
    expect(fieldHerbGrade(9, 15)).toBe(4)
    // major 20 混沌海=道品(5):已到顶,不加不降
    expect(fieldHerbGrade(20, 15)).toBe(5)
  })

  it('灵田卡面 effectText 也写明品阶,不再只写「每小时 X 株」(等级表同为数据事实源)', () => {
    const field = BUILDINGS.find(b => b.id === 'field')!
    const text = field.effectText(15)
    // 满级可种道品,卡面须写明品阶
    expect(text).toContain('道品')
    expect(text).toContain('灵草')
  })

/**
 * 灵脉总量上限。
 *
 * sanitize 原本只把单脉各自裁到主脉容量(70),不管总量:
 * 四条一起到 70 时 veinTotal 就成了 280,而闸门是 `veinTotal >= VEIN_TOTAL_CAPACITY`。
 * 后果有三处:界面显示「280/100」、进度条算出 280%、investVein 从此一点也投不进去。
 * 与「行囊已满恒真」是同一类坏档后果,本条把容量压回上限。
 */
describe('灵脉总量 · 坏档压回容量', () => {
  function fullVeins(n: number) {
    return { gather: n, craft: n, alchemy: n, insight: n }
  }

  it('四条脉各撑到主脉容量时,总量仍被压回 VEIN_TOTAL_CAPACITY', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = fullVeins(VEIN_MAIN_CAPACITY) as never
    dongfu.sanitize()
    expect(dongfu.veinTotal).toBe(VEIN_TOTAL_CAPACITY)
    expect(dongfu.veinTotal, '总量不得越过上限 —— 否则界面会出现「280/100」').toBeLessThanOrEqual(VEIN_TOTAL_CAPACITY)
  })

  it('远超上限的坏档也压回(不只压一档)', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = { gather: 5000, craft: 5000, alchemy: 5000, insight: 5000 } as never
    dongfu.sanitize()
    expect(dongfu.veinTotal).toBe(VEIN_TOTAL_CAPACITY)
  })

  it('正常范围内的存档原样保留(修形非空转)', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = { gather: 70, craft: 10, alchemy: 10, insight: 10 }
    dongfu.sanitize()
    expect(dongfu.veinPoints).toEqual({ gather: 70, craft: 10, alchemy: 10, insight: 10 })
    expect(dongfu.veinTotal).toBe(VEIN_TOTAL_CAPACITY)
  })

  it('压回后仍有可投空间之外的情况:恰满 100 时总量就是 100,不是 99 也不是 101', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = { gather: 40, craft: 30, alchemy: 20, insight: 10 }
    dongfu.sanitize()
    expect(dongfu.veinTotal).toBe(100)
  })

  it('按比例压回:四条同投入的脉保住了相对份额,不是削掉两条', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = fullVeins(VEIN_MAIN_CAPACITY) as never
    dongfu.sanitize()
    const values = Object.values(dongfu.veinPoints)
    // 逐条削的实现会给出 0/0/30/70 —— 四脉等额投入却白丢两条
    expect(values.filter(v => v > 0).length, '压回容量不该把任一条脉清成 0').toBe(4)
    expect(Math.max(...values) - Math.min(...values), '等额投入应等额压回').toBeLessThanOrEqual(1)
  })

  it('按比例压回:投入悬殊时保住悬殊关系(多投的仍多)', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = { gather: 70, craft: 40, alchemy: 20, insight: 10 }
    dongfu.sanitize()
    expect(dongfu.veinTotal).toBe(VEIN_TOTAL_CAPACITY)
    expect(dongfu.veinPoints.gather).toBeGreaterThan(dongfu.veinPoints.craft)
    expect(dongfu.veinPoints.craft).toBeGreaterThan(dongfu.veinPoints.alchemy)
    expect(dongfu.veinPoints.alchemy).toBeGreaterThan(dongfu.veinPoints.insight)
  })

  it('点数都非负整数(压回不会产生小数或负数)', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints = { gather: 33.7, craft: 99.9, alchemy: 0.4, insight: -5 } as never
    dongfu.sanitize()
    for (const v of Object.values(dongfu.veinPoints)) {
      expect(Number.isInteger(v), `${v} 不是整数`).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
    expect(dongfu.veinTotal).toBeLessThanOrEqual(VEIN_TOTAL_CAPACITY)
  })
})
})
