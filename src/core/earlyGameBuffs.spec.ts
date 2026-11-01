/**
 * 前期玩法 buff 闭环。addBuff 查无此定义静默 return。
 *  1. 数据完整性:凡选项引用的 buffId(含惩罚 type)都须在 buffs.ts 有定义;
 *  2. 行为闭环:选顿悟挂上 buff、选巡游惩罚生效、qiCapPct/beastPct 抬高灵气上限与灵兽效果。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { INJURY_DURATION } from '@/data/constants'

describe('重伤时长取自 INJURY_DURATION(常数接线)', () => {
  it('buffs.ts 的重伤时长就是那个常数', () => {
    expect(buffDef('injury')?.durationSec).toBe(INJURY_DURATION)
  })
})
import { setActivePinia, createPinia } from 'pinia'
import { buffDef } from '@/data/buffs'
import { ENLIGHTENMENT_OPTIONS, CAVE_EVENT_POOL } from '@/data/earlyGame'
import { usePlayerStore } from '@/stores/player'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { petDef } from '@/data/pets'

describe('前期玩法 buff 数据完整性(防「无此定义→静默空转」回潮)', () => {
  it('每一个顿悟选项引用的 buffId 都有定义', () => {
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      if (opt.buffId) expect(buffDef(opt.buffId), `顿悟选项 ${opt.label} 的 buff ${opt.buffId} 未注册`).toBeDefined()
    }
  })

  it('每一个巡游 buff 奖励引用的 buffId 都有定义', () => {
    for (const location of Object.keys(CAVE_EVENT_POOL)) {
      for (const ev of CAVE_EVENT_POOL[location as keyof typeof CAVE_EVENT_POOL]) {
        for (const opt of ev.options) {
          if ('reward' in opt && opt.reward?.type === 'buff') {
            expect(buffDef(opt.reward.value as string), `巡游「${opt.label}」的 buff ${opt.reward.value} 未注册`).toBeDefined()
          }
        }
      }
    }
  })

  it('每一个巡游惩罚 type 都有对应的惩罚 buff 定义', () => {
    for (const location of Object.keys(CAVE_EVENT_POOL)) {
      for (const ev of CAVE_EVENT_POOL[location as keyof typeof CAVE_EVENT_POOL]) {
        for (const opt of ev.options) {
          if ('penalty' in opt && opt.penalty) {
            expect(buffDef(`cave_penalty_${opt.penalty.type}`), `巡游「${opt.label}」的惩罚 ${opt.penalty.type} 未注册`).toBeDefined()
          }
        }
      }
    }
  })
})

describe('悟道顿悟选择实际生效(修复前是纯空转)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // 触发 8% 判定 + 锁定首个选项 = 静心凝神
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('选「静心凝神」挂上 enlighten_cult,修炼速度加成 20%', async () => {
    const { mayTriggerEnlightenment, getCurrentEnlightenment, chooseEnlightenment } = await import('./earlyGameService')
    mayTriggerEnlightenment()
    expect(getCurrentEnlightenment()).not.toBeNull()
    const cult = useCultivationStore()
    chooseEnlightenment(0)
    expect(cult.buffs.find(b => b.defId === 'enlighten_cult'), '顿悟选择的 buff 应当真的挂上').toBeDefined()
    expect(cult.buffMods.cultivationSpeed).toBeCloseTo(0.2)
  })

  it('选「灵机一动」走即时奖励,悟道点 +5', async () => {
    vi.resetModules()
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.01) // 触发判定
      .mockReturnValueOnce(0.95) // 池尾 → 灵机一动
      .mockReturnValueOnce(0.95) // → 吐纳有序
      .mockReturnValueOnce(0.95) // → 悟透瓶颈
    const { mayTriggerEnlightenment, chooseEnlightenment } = await import('./earlyGameService')
    const { useResourcesStore } = await import('@/stores/resources')
    mayTriggerEnlightenment()
    chooseEnlightenment(0)
    expect(useResourcesStore().wudao).toBe(5)
  })
})

describe('洞府巡游选择真正结算(修复前 buff 与惩罚都等于没选)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // 地点锁定 field,可预测选项下标
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('选「强行吸收」挂上惩罚 buff,修炼速度 -15% 生效', async () => {
    const { mayTriggerCaveEvent, chooseCaveOption } = await import('./earlyGameService')
    expect(mayTriggerCaveEvent()).not.toBeNull()
    const cult = useCultivationStore()
    chooseCaveOption(1) // field_1 的「强行吸收」:奖励修为 + 惩罚 cultivationSpeed
    expect(cult.buffs.find(b => b.defId === 'cave_penalty_cultivationSpeed'), '巡游惩罚应当真的挂上').toBeDefined()
    expect(cult.buffMods.cultivationSpeed).toBeCloseTo(-0.15)
  })
})

describe('qiCapPct / beastPct 接线(修复阵法 / 安抚灵兽语出必践)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('cave_array_qicap buff 抬高灵气上限(炼气·零级聚灵阵:100 → 125)', () => {
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    expect(player.qiCapValue).toBe(100)
    cultivation.addBuff('cave_array_qicap', Date.now())
    expect(player.qiCapValue).toBe(125)
  })

  /**
   * 基数从数据表读,不硬写 —— 灵兽数值会随品阶阶梯调整(见 core/petLadder.spec)。
   * 本条要钉的是「安抚增益真的乘进 finalStats」,不是青羽灵狐恰好等于 0.1。
   */
  const PET_SPEED = petDef('pet_qingyu')!.mods.explorationSpeed!
  /** 安抚灵兽(cave_garden_pet)的放大系数,与 buffs 表同源 */
  const GARDEN_BUFF = 1.3

  it('cave_garden_pet buff 放大灵兽效果(零级灵兽园:基数 → ×1.3)', () => {
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    player.setPet('pet_qingyu')
    expect(player.finalStats.mods.explorationSpeed).toBeCloseTo(PET_SPEED)
    cultivation.addBuff('cave_garden_pet', Date.now())
    expect(player.finalStats.mods.explorationSpeed).toBeCloseTo(PET_SPEED * GARDEN_BUFF)
  })

  it('兽苑卡片的出战加成走「真到账」那份:petModsFor 随灵兽园等级与安抚增益同源放大(非 base)', () => {
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    const dongfu = useDongfuStore()
    player.setPet('pet_qingyu')
    // 灵兽园 8 级 + 安抚增益:基数 × 1.8 × 1.3
    dongfu.setLevel('beast', 8)
    cultivation.addBuff('cave_garden_pet', Date.now())
    const expected = PET_SPEED * 1.8 * GARDEN_BUFF
    // 卡片渲染源与「真到账」finalStats 同一份
    expect(player.petModsFor(petDef('pet_qingyu')!).explorationSpeed).toBeCloseTo(expected)
    expect(player.finalStats.mods.explorationSpeed).toBeCloseTo(expected)
  })
})

describe('qiCapPct / beastPct 不只吃 buffMods', () => {
  it('灵气上限与灵兽放大从 ownedModSources 合并,避免装备功法将来变成死词条', () => {
    const src = readFileSync(new URL('../stores/player.ts', import.meta.url), 'utf8')
    expect(src).toContain("modOf(mergeMods(ownedModSources.value), 'beastPct')")
    expect(src).toContain("modOf(mergeMods([...ownedModSources.value, petMods.value]), 'qiCapPct')")
    expect(src).not.toContain("modOf(cultivation.buffMods, 'beastPct')")
    expect(src).not.toContain("modOf(cultivation.buffMods, 'qiCapPct')")
  })
})
