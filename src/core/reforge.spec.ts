/* eslint-disable no-console -- 成本表是给人看的 */
/**
 * 重铸与封存 —— 成本只看「阶数」与「封存数」,重铸连条数一起重掷
 *
 * 旧口径是「品质倍率 × 1.5^次数,上限 10 次」。两处都换掉了:
 *   一 **不限次数**:能不能继续炼,不该由一个与装备无关的计数器决定;
 *   二 **成本只随两件事走**:它有多高阶(与强化/封存同一条 stoneByTier 经济)、
 *      你封存了几个词条(封存是保护,保护得越多,重掷剩下部分越贵)。
 * 而「重铸」的动作也换了:旧版只**换掉一条**词条、条数不动;现在把未封存的
 * 词条推倒重来 —— **条数按品质区间重掷**(至少给一条新的),数值全部重掷。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import {
  autoReforge,
  reforgeCost,
  reforgeEquipment,
  reforgePlanShortfall,
  reforgeShort,
  reforgeShortfall,
  reforgeableAffixIds,
  sealCapacity,
  sealCost,
  sealShortfall,
  sealAffix,
  unsealAffix
} from './reforge'
import { REFORGE_DUST_BASE, REFORGE_SEAL_LOAD, REFORGE_STONE_BASE } from '@/data/constants'
import { AUTO_REFORGE_MAX_BUDGET, autoReforgeBudget } from './reforge'
import { qualityDef } from '@/data/qualities'
import { rng } from '@/utils/random'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { useAutoReforge } from '@/composables/useAutoReforge'
import { gn, gnZero, sub } from '@/utils/gnum'
import type { EquipmentInstance } from '@/types'

const stoneOf = (g: { m: number; e: number }): number => g.m * Math.pow(10, g.e)

const base: EquipmentInstance = {
  uid: 'u1',
  templateId: 'w_zhuqing',
  quality: 'excellent',
  tier: 3,
  level: 0,
  affixes: [
    { id: 'atk1', roll: 0.5 },
    { id: 'def1', roll: 0.5 }
  ],
  reforgeCount: 0
}

describe('重铸成本 · 只看阶数与封存数', () => {
  it('不限次数:洗到第两百次仍可重铸,且价格与第一次相同', () => {
    const first = reforgeCost({ ...base, reforgeCount: 0 })!
    const late = reforgeCost({ ...base, reforgeCount: 200 })!
    expect(late, '不该再有次数上限').not.toBeNull()
    expect(stoneOf(late.stone), '次数不进公式').toBeCloseTo(stoneOf(first.stone), 6)
    expect(late.dust).toBe(first.dust)
  })

  it('品质不进公式:凡品与神品洗一次同价(贵贱由阶数与封存数说)', () => {
    const mortal = reforgeCost({ ...base, quality: 'mortal' })!
    const divine = reforgeCost({ ...base, quality: 'divine' })!
    expect(stoneOf(divine.stone)).toBeCloseTo(stoneOf(mortal.stone), 6)
  })

  it('阶数定价:灵石 = stoneByTier(阶) × 基础,与强化同一条经济', () => {
    const t3 = reforgeCost({ ...base, tier: 3 })!
    const t10 = reforgeCost({ ...base, tier: 10 })!
    console.log(`\n  重铸灵石:3 阶 ${stoneOf(t3.stone).toExponential(2)} → 10 阶 ${stoneOf(t10.stone).toExponential(2)}`)
    expect(stoneOf(t10.stone)).toBeGreaterThan(stoneOf(t3.stone) * 5)
    // 未封存时正好是「基础 × 阶数倍率」
    const t3NoSeal = reforgeCost({ ...base, tier: 3 })!
    expect(t3NoSeal.dust).toBe(REFORGE_DUST_BASE)
    expect(REFORGE_STONE_BASE).toBeGreaterThan(0)
  })

  it('封存溢价:每封一条,灵石与器灵尘各上浮 REFORGE_SEAL_LOAD', () => {
    const three = { ...base, affixes: [...base.affixes, { id: 'hp1', roll: 0.5 }] }
    const one = reforgeCost({ ...three, sealedAffixIds: ['atk1'] })!
    const two = reforgeCost({ ...three, sealedAffixIds: ['atk1', 'def1'] })!
    expect(stoneOf(two.stone) / stoneOf(one.stone)).toBeCloseTo((1 + 2 * REFORGE_SEAL_LOAD) / (1 + REFORGE_SEAL_LOAD), 6)
    expect(two.dust).toBe(Math.round(REFORGE_DUST_BASE * (1 + 2 * REFORGE_SEAL_LOAD)))
  })

  it('全部封存就没得重铸了 —— 这是唯一一种"不能再炼"', () => {
    expect(reforgeCost({ ...base, sealedAffixIds: ['atk1', 'def1'] })).toBeNull()
    expect(sealCapacity(base), '封存上限 = 词条数 − 1(至少留一个可重掷位)').toBe(1)
    expect(sealCost({ ...base, sealedAffixIds: ['atk1'] })).toBeNull()
  })
})

describe('重铸动作 · 条数与数值一起重掷', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.restoreAllMocks())

  /** 摆一件装备与足够的资源(重铸要真扣账) */
  function setup(inst: EquipmentInstance): void {
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    res.addSmall('dust', 100_000)
  }

  it('模板缺失(坏档)不洗:没有价、不扣账 —— 抽取池要按部位过滤,不知部位就不洗', () => {
    const broken: EquipmentInstance = { ...base, uid: 'broken', templateId: 'no_such_template' }
    expect(reforgeCost(broken)).toBeNull()
    setup(broken)
    const res = useResourcesStore()
    const dustBefore = res.dust
    expect(reforgeEquipment('broken', true)).toBe(false)
    expect(res.dust).toBe(dustBefore)
    expect(useInventoryStore().findItem('broken')!.affixes).toEqual(broken.affixes)
  })

  it('条数按品质区间重掷:上限拉满时,词条数真的变多', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'count-up',
      quality: 'profound', // 玄品:3~4 条
      affixes: [{ id: 'atk1', roll: 0.5 }]
    }
    setup(inst)
    // 让条数掷到上限、且新词条挑得出
    vi.spyOn(rng, 'int').mockReturnValue(qualityDef('profound').affixes[1])
    expect(reforgeEquipment('count-up')).toBe(true)
    const after = useInventoryStore().findItem('count-up')!
    expect(after.affixes.length).toBe(qualityDef('profound').affixes[1])
    expect(after.affixes.length).toBeGreaterThan(inst.affixes.length)
    expect(after.reforgeCount, '次数仍记着(只是不进公式)').toBe(1)
  })

  it('封存的原样保留,其余词条全部重掷(掷点重来)', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'sealed-keep',
      quality: 'profound',
      affixes: [
        { id: 'atk1', roll: 0.1 },
        { id: 'def1', roll: 0.2 },
        { id: 'hp1', roll: 0.3 }
      ],
      sealedAffixIds: ['atk1']
    }
    setup(inst)
    // 把新掷点钉成一个一眼可辨的值:未封存的那几条若还带着从前的 0.2/0.3,就说明没重掷
    vi.spyOn(rng, 'weighted').mockImplementation(((items: readonly unknown[]) => items[0]) as never)
    vi.spyOn(rng, 'next').mockReturnValue(0.99)
    expect(reforgeEquipment('sealed-keep')).toBe(true)
    const after = useInventoryStore().findItem('sealed-keep')!
    const kept = after.affixes.find(a => a.id === 'atk1')
    expect(kept, '封存的那条必须还在').toBeDefined()
    expect(kept!.roll, '封存的掷点不动').toBe(0.1)
    for (const a of after.affixes.filter(x => x.id !== 'atk1')) {
      expect(a.roll, `${a.id} 还是旧掷点,说明没重掷`).toBe(0.99)
    }
    const [min, max] = qualityDef('profound').affixes
    expect(after.affixes.length).toBeGreaterThanOrEqual(min)
    expect(after.affixes.length).toBeLessThanOrEqual(max)
    expect(new Set(after.affixes.map(a => a.id)).size, '同一件里不该有重复词条').toBe(after.affixes.length)
  })

  it('每次重铸至少给一条新的:封存到只剩一个位时也不会空转', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'one-slot',
      quality: 'excellent', // 精品 2~3 条
      affixes: [
        { id: 'atk1', roll: 0.5 },
        { id: 'def1', roll: 0.5 }
      ],
      sealedAffixIds: ['atk1']
    }
    setup(inst)
    expect(reforgeEquipment('one-slot')).toBe(true)
    const after = useInventoryStore().findItem('one-slot')!
    const [min, max] = qualityDef('excellent').affixes
    // 条数按品质区间重掷(精品 2~3),但封存的那条一定还在、且至少补一条新的
    expect(after.affixes.length).toBeGreaterThanOrEqual(min)
    expect(after.affixes.length).toBeLessThanOrEqual(max)
    expect(after.affixes.some(a => a.id === 'atk1')).toBe(true)
    expect(after.affixes.some(a => a.id !== 'atk1'), '至少要有一条新的').toBe(true)
  })

  it('不止一条可洗:一掷定一份词条构成,而不是只换一条', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'multi',
      quality: 'heaven', // 4~5 条
      affixes: [
        { id: 'atk1', roll: 0.5 },
        { id: 'def1', roll: 0.5 },
        { id: 'hp1', roll: 0.5 },
        { id: 'crit1', roll: 0.5 }
      ]
    }
    setup(inst)
    vi.spyOn(rng, 'int').mockReturnValue(qualityDef('heaven').affixes[1])
    reforgeEquipment('multi')
    const after = useInventoryStore().findItem('multi')!
    expect(after.affixes.length).toBe(qualityDef('heaven').affixes[1])
    expect(new Set(after.affixes.map(a => a.id)).size, '同一件里不该有重复词条').toBe(after.affixes.length)
  })

  it('资源不足时不动装备、不记账', () => {
    const inst: EquipmentInstance = { ...base, uid: 'poor' }
    useInventoryStore().items = [inst]
    expect(reforgeEquipment('poor')).toBe(false)
    expect(useInventoryStore().findItem('poor')!.reforgeCount).toBe(0)
  })

  it('手动重铸缺料回执写出实际差额,不只说未足', () => {
    const inst: EquipmentInstance = { ...base, uid: 'short-receipt' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    const cost = reforgeCost(inst)!
    res.spiritStone = sub(cost.stone, gn(4))
    res.dust = cost.dust
    expect(reforgeEquipment('short-receipt')).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain('灵石尚差 4')
    expect(text).not.toContain('灵石未足')
  })

  it('封存缺石回执写出实际差额,不只说未足', () => {
    const inst: EquipmentInstance = { ...base, uid: 'seal-short' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    const cost = sealCost(inst)!
    res.spiritStone = sub(cost, gn(5))
    expect(sealAffix('seal-short', 'atk1')).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain('灵石尚差 5')
    expect(text).not.toContain('灵石未足')
  })

  it('封存缺口与扣款同源:付不起时给出实际石差,够时归零,封满无价', () => {
    const inst: EquipmentInstance = { ...base, uid: 'seal-gap' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    const cost = sealCost(inst)!
    res.spiritStone = sub(cost, gn(7))
    expect(sealShortfall(inst)!.m).toBeCloseTo(7, 6)
    res.spiritStone = cost
    expect(sealShortfall(inst)).toEqual(gnZero())
    expect(sealShortfall({ ...inst, sealedAffixIds: ['atk1'] })).toBeNull()
  })

  /**
   * 缺哪一样就报哪一样(议题 #130 同族):灵石来自历练与悬赏,器灵尘来自分解,
   * 两条去路相反。一句「灵石或器灵尘未足」会把玩家指得两头都跑。
   */
  it('缺料分得清灵石与器灵尘,提示不再两头都说', () => {
    const inst: EquipmentInstance = { ...base, uid: 'short' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    res.addSmall('dust', 0)
    expect(reforgeShort(reforgeCost(inst)!)).toBe('dust')
    reforgeEquipment('short')
    expect(useUiStore().toasts.at(-1)?.text).toContain('器灵尘')
    expect(useUiStore().toasts.at(-1)?.text).not.toContain('灵石')

    res.spendStone(gn(1e30))
    res.addSmall('dust', 100_000)
    expect(reforgeShort(reforgeCost(inst)!)).toBe('stone')
    reforgeEquipment('short')
    expect(useUiStore().toasts.at(-1)?.text).toContain('灵石')
    expect(useUiStore().toasts.at(-1)?.text).not.toContain('器灵尘')
  })

  it('界面置灰与价签读同一份缺口:灵石与器灵尘各差多少都算得出来', () => {
    const inst: EquipmentInstance = { ...base, uid: 'shortfall' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    const cost = reforgeCost(inst)!
    res.addStone(gn(1))
    res.addSmall('dust', cost.dust - 3)
    const s = reforgeShortfall(cost)
    expect(s.short).toBe('stone')
    expect(s.stone.m).toBeGreaterThan(0)
    expect(s.dust).toBe(3)
  })

  it('自动重铸第一炉就缺料时,结果里写明缺的是哪一样', () => {
    const inst: EquipmentInstance = { ...base, uid: 'auto-short' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    res.addSmall('dust', 0)
    // 目标不能选它已有的那条 —— 否则首轮就命中,压根走不到缺料那一支
    const out = autoReforge('auto-short', [{ affixId: 'hp1' }], 10)
    expect(out.stop).toBe('broke')
    expect(out.rolls).toBe(0)
    expect(out.short).toBe('dust')
  })

  /**
   * 首炉缺料若只写「未足」,面板上却已算得出器灵尘尚差 N —— 同一笔账两套口径。
   * 故障注入:把 useAutoReforge 的 gap 改回不传 / 固定写「未足」→ 本条红。
   */
  it('自动重铸首炉缺料回执写出实际差额', () => {
    const inst: EquipmentInstance = { ...base, uid: 'auto-short-receipt' }
    useInventoryStore().items = [inst]
    const cost = reforgeCost(inst)!
    const res = useResourcesStore()
    res.spiritStone = gn(1e30)
    res.dust = cost.dust - 2
    useUiStore().equipDetailUid = inst.uid
    const flow = useAutoReforge()
    flow.toggleAutoTarget('hp1')
    flow.runAutoReforge()
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain(`器灵尘尚差 2`)
    expect(text).not.toContain('器灵尘未足')
  })

  it('封存要付费,且封满之后不再可封', () => {
    const inst: EquipmentInstance = { ...base, uid: 'seal' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    expect(sealAffix('seal', 'atk1')).toBe(true)
    expect(useInventoryStore().findItem('seal')!.sealedAffixIds).toEqual(['atk1'])
    expect(sealAffix('seal', 'def1'), '只剩一条可重掷位,封不了').toBe(false)
  })
})

describe('封存 ↔ 解封 · 循环可逆', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('封了能解:unsealAffix 移除 id、重铸恢复可替,且免费不扣账', () => {
    const inst: EquipmentInstance = { ...base, uid: 'roundtrip', sealedAffixIds: ['atk1'] }
    useInventoryStore().items = [inst]
    expect(unsealAffix('roundtrip', 'atk1')).toBe(true)
    const after = useInventoryStore().findItem('roundtrip')!
    expect(after.sealedAffixIds, '解封后该条不在封存表里').toEqual([])
    expect(reforgeableAffixIds(after), '解封恢复了它的可重铸性').toContain('atk1')
  })

  it('未封存 / 词条不在 / 件不在,解封一律返回 false 且不动装备', () => {
    const inst: EquipmentInstance = { ...base, uid: 'nos', sealedAffixIds: [] }
    useInventoryStore().items = [inst]
    expect(unsealAffix('nos', 'def1'), '没封过').toBe(false)
    expect(unsealAffix('nos', 'ghost'), '词条根本不在').toBe(false)
    expect(unsealAffix('unknown-uid', 'atk1'), '件不在').toBe(false)
    expect(useInventoryStore().findItem('nos')!.sealedAffixIds).toEqual([])
  })

  it('解封后位子随即空出,可再封', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'reseal',
      quality: 'profound',
      affixes: [
        { id: 'atk1', roll: 0.5 },
        { id: 'def1', roll: 0.5 },
        { id: 'hp1', roll: 0.5 }
      ],
      sealedAffixIds: ['atk1']
    }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    expect(sealCapacity(inst)).toBe(2)
    expect(sealCost(inst), '已封一条、还有位可再封').not.toBeNull()
    expect(unsealAffix('reseal', 'atk1')).toBe(true)
    expect(useInventoryStore().findItem('reseal')!.sealedAffixIds).toEqual([])
    expect(sealAffix('reseal', 'atk1'), '解封后可再封').toBe(true)
    expect(useInventoryStore().findItem('reseal')!.sealedAffixIds).toEqual(['atk1'])
  })
})

describe('界面与判定同源 · 条数上限不写死', () => {
  // 自动重铸整体拆出后判据随本体走:预算与结账在 composable,输入框与「至多花销」按钮在面板。
  // 宿主 + 两处合扫,防拆分后只查宿主假绿。
  const dialog =
    readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8') +
    readFileSync(resolve(__dirname, '../components/equipment/AutoReforgePanel.vue'), 'utf8') +
    readFileSync(resolve(__dirname, '../composables/useAutoReforge.ts'), 'utf8') +
    readFileSync(resolve(__dirname, '../components/equipment/EquipReforgeFooter.vue'), 'utf8')

  it('词条条数上限取自品质表,不在模板里写死数字', () => {
    expect(dialog, '上限应读 qualityDef(...).affixes[1]').toContain('qualityDef(inst.value.quality).affixes[1]')
    expect(dialog, '封存上限应读 sealCapacity(与判定同一处)').toContain('sealCapacity(')
    expect(dialog, '不该再出现「重铸次数 x/10」这类写死的分母').not.toMatch(/重铸次数\s*\{\{/)
  })

  /**
   * 付不起时两个重铸钮都该置灰,并把缺口写出来。
   * 故障注入:删掉任一处 :disabled、或退回 click-then-toast → 本条红。
   */
  it('重铸入口与确认钮都按缺口置灰,并就地写出尚差多少', () => {
    const footer = readFileSync(resolve(__dirname, '../components/equipment/EquipReforgeFooter.vue'), 'utf8')
    expect(footer, '入口钮按缺口置灰').toMatch(/v-if="reforgeCostVal"[\s\S]*?:disabled="reforgeShortVal\?\.short != null"/)
    expect(footer, '确认钮同样按缺口置灰').toMatch(/:disabled="reforgeShortVal\?\.short != null"[\s\S]*?@click="doReforge"/)
    expect(footer, '缺口就地写出来').toContain('灵石尚差 ${formatGN(s.stone)}')
    expect(footer, '缺尘也单独报数').toContain('器灵尘尚差 ${s.dust}')
    expect(footer, '提示与结算同源').toContain('reforgeShortfall(reforgeCostVal.value)')
    expect(footer, 'toast 也带同一份差额').toContain('stone: formatGN(s.stone)')
  })

  /**
   * 封存钮此前只查「有没有价」,余额不足仍亮着,点下才弹石差。
   * 故障注入:把 :disabled 或 sealShortfall 删掉、钮面改回只写「封存」→ 本条红。
   */
  it('封存钮按石差置灰,钮面与页脚都写出实际尚差', () => {
    const seal = readFileSync(resolve(__dirname, '../components/equipment/EquipSealPanel.vue'), 'utf8')
    const footer = readFileSync(resolve(__dirname, '../components/equipment/EquipReforgeFooter.vue'), 'utf8')
    expect(seal, '封存钮读同一份石差').toContain('sealShortfall(inst.value)')
    expect(seal, '付不起时置灰').toContain(':disabled="sealShort"')
    expect(seal, '钮面直接写实际石差').toContain('`差${formatGN(sealGap!)}`')
    expect(seal, '无障碍标签也报石差').toContain('灵石尚差 ${formatGN(sealGap.value!)}')
    expect(footer, '页脚价签同读石差').toContain('sealShortfall(inst.value)')
    expect(footer, '页脚就地写实际尚差').toContain('灵石尚差 {{ formatGN(sealGap) }}')
  })

  /**
   * 自动重铸的预算上限只许有一处(AUTO_REFORGE_MAX_BUDGET)。
   *
   * 从前 500 有三份:输入框 `max="500"`、执行路径 `Math.min(500, …)`、
   * 以及「至多花销」预览(它没夹取)。手输 800 → 预览按 800 报、执行只洗 500,
   * 玩家按虚高的账做决定。故障注入:把预览改回用 autoBudget 原值 → 末条红。
   */
  it('自动重铸预算:上限单源,预览与执行都走 autoReforgeBudget', () => {
    expect(dialog, '输入框上限读具名常量,不写死 500').toContain(':max="AUTO_REFORGE_MAX_BUDGET"')
    expect(dialog, '执行路径走归一 helper').toContain('autoReforgeBudget(autoBudget.value)')
    // 预览 computed(autoMaxCost)必须也用归一后的预算 —— 独立抓这一段,
    // 别让「执行那行还在」把预览侧的漂移掩盖过去
    const flow = readFileSync(resolve(__dirname, '../composables/useAutoReforge.ts'), 'utf8')
    const preview = flow.slice(flow.indexOf('const autoMaxCost'), flow.indexOf('watch([autoTargets, autoBudget]'))
    expect(preview, '预览须走 autoReforgeBudget,不拿 autoBudget 原值虚报花销').toContain(
      'autoReforgeBudget(autoBudget.value)'
    )
    expect(preview, '预览不许直接把 autoBudget 原值当次数').not.toMatch(/Math\.max\(0,\s*autoBudget/)
    // 归一 helper 内部也必须读具名常量,别在 core 里又内联一份 500
    const core = readFileSync(resolve(__dirname, './reforge.ts'), 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n')
    expect(core, 'core 不许再内联 500 上限').not.toMatch(/Math\.min\(500/)
    expect(core, '归一 helper 读具名常量').toContain('Math.min(AUTO_REFORGE_MAX_BUDGET')
  })

  it('autoReforgeBudget 归一:越界夹取、非有限回落 1、小数取整', () => {
    expect(autoReforgeBudget(500)).toBe(500)
    expect(autoReforgeBudget(800)).toBe(AUTO_REFORGE_MAX_BUDGET)
    expect(autoReforgeBudget(0)).toBe(1)
    expect(autoReforgeBudget(-5)).toBe(1)
    expect(autoReforgeBudget(Number.NaN)).toBe(1)
    expect(autoReforgeBudget(Number.POSITIVE_INFINITY)).toBe(1)
    expect(autoReforgeBudget(12.9)).toBe(12)
  })

  it('自动重铸确认钮按整批总账缺口置灰并写出尚差', () => {
    const panel = readFileSync(resolve(__dirname, '../components/equipment/AutoReforgePanel.vue'), 'utf8')
    const flow = readFileSync(resolve(__dirname, '../composables/useAutoReforge.ts'), 'utf8')
    expect(flow, '整批缺口走 reforgePlanShortfall').toContain('reforgePlanShortfall(r, autoBudget.value)')
    expect(panel, '确认钮按整批缺口置灰').toContain(':disabled="autoMaxGap?.short != null"')
    expect(panel, '缺口就地写灵石').toContain('灵石尚差 ${formatGN(gap.stone)}')
    expect(panel, '缺口就地写器灵尘').toContain('器灵尘尚差 ${gap.dust}')
  })

  it('reforgePlanShortfall 按归一预算整批算缺口,不只看一炉', () => {
    setActivePinia(createPinia())
    const inst = { ...base, uid: 'plan-gap' }
    useInventoryStore().items = [inst]
    const cost = reforgeCost(inst)!
    const res = useResourcesStore()
    const three = reforgePlanShortfall(cost, 3)
    expect(three.short, '灵石与尘都缺时按服务旧序先报灵石').toBe('stone')
    expect(stoneOf(three.stone)).toBeCloseTo(stoneOf(cost.stone) * 3, 6)
    expect(three.dust).toBe(cost.dust * 3)

    res.spiritStone = gn(1e30)
    res.dust = 0
    res.dust = cost.dust * 3 - 2
    const dustOnly = reforgePlanShortfall(cost, 3)
    expect(dustOnly.short).toBe('dust')
    expect(dustOnly.stone.m).toBe(0)
    expect(dustOnly.dust).toBe(2)
  })

  it('词条弹框的目标上限读具名常量,不手写 3', () => {
    const sheet = readFileSync(resolve(__dirname, '../components/equipment/AffixInfoSheet.vue'), 'utf8')
    expect(sheet, '满位文案读 AUTO_REFORGE_MAX_TARGETS').toContain('目标已满(${AUTO_REFORGE_MAX_TARGETS})')
    expect(sheet, '不再手写目标上限').not.toContain('目标已满(3)')
  })
})
