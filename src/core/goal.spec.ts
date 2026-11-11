/** 修行目标接线契约:钉住 goal.ts 纯函数行为 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { gn, toNum, gnZero } from '@/utils/gnum'
import { generateCurrentGoal } from './goal'
import { SUB_LEVELS } from '@/data/constants'
import { breakthroughInfo } from './breakthrough'

const { setBuild } = vi.hoisted(() => ({ setBuild: { value: null as unknown } }))
vi.mock('./buildDetect', () => ({ detectBuild: () => setBuild.value }))

describe('修行目标(Phase 29)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setBuild.value = null
  })

  it('死后无目标', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.markDead()
    expect(generateCurrentGoal(player)).toBeNull()
  })

  it('修为 85% 以上 → 突破目标,给 hint', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.9))
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('breakthrough')
    expect(goal.text).toContain('突破')
    expect(goal.text).toContain(breakthroughInfo().targetLabel)
    expect(goal.hint ?? '').not.toContain('天劫')
  })

  it('临近突破但灵气不足时,hint 报出还差几成 —— 破境要耗灵气,别让人空冲', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.9))
    useResourcesStore().setQi(0, player.qiCapValue)
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('breakthrough')
    expect(goal.hint).toContain('灵气尚差')
  })

  it('灵气已足时,临近突破不出读数', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.9))
    useResourcesStore().setQi(player.qiCapValue, player.qiCapValue)
    const goal = generateCurrentGoal(player)!
    expect(goal.hint).toBeUndefined()
  })

  it('圆满层指向下一境,且不把小进阶的丹药说成能渡天劫', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.sub = SUB_LEVELS - 1
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.9))
    const info = breakthroughInfo()
    expect(info.needTribulation, '圆满层必须是大关').toBe(true)
    const goal = generateCurrentGoal(player)!
    expect(goal.text).toContain(info.targetLabel)
    expect(goal.text).not.toContain('圆满')
    expect(goal.hint ?? '').not.toContain('可提升')
    expect(goal.text).toContain('引劫')
    expect(goal.text).not.toContain('尝试突破')
  })

  it('修为 50%~85% → 突破目标,无 hint(未临近,不给多余建议)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.6))
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('breakthrough')
    expect(goal.hint).toBeUndefined()
  })

  it('无临近突破且流派未满 → build 目标,进度分母取流派真实核心数(不写死 4)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    setBuild.value = {
      style: { name: '天龙', core: { critChance: 0.35, critDamage: 0.5 } },
      // 只凑到一个核心键:2 键流派 → 1/2,而不是 1/4
      coreValues: [{ key: 'critChance' }]
    }
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('build')
    expect(goal.text).toContain('天龙')
    expect(goal.progress, '分母该是 2(流派核心数),不是写死的 4').toBe(0.5)
    expect(goal.hint).toContain('1/2')
  })

  /**
   * 核心词条满了就不再是待办。
   *
   * 原先无条件返回 build 目标,满筑玩家的首页写着
   * 「完善「天龙」流派 · 进度 100% · 核心词条 2/2」——
   * 一条 100% 的待办,看着像该做点什么的空转提醒(前期档实测撞到)。
   * 满筑后应让位给后面的目标(历练 → 采草 → 配装)。
   */
  it('流派核心已满 → 不再报「完善」,让位给后续目标', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    setBuild.value = {
      style: { name: '天龙', core: { critChance: 0.35, critDamage: 0.5 } },
      coreValues: [{ key: 'critChance' }, { key: 'critDamage' }]
    }
    const goal = generateCurrentGoal(player)
    expect(goal?.type, '满筑不该再返回 build 目标').not.toBe('build')
    expect(goal?.text ?? '', '文本里不该再出现「完善」').not.toContain('完善')
    // 进度若还在,也不该是「100% 的待办」
    if (goal?.progress !== undefined) expect(goal.progress).toBeLessThan(1)
  })

  it('近突破优先于 build(breakthrough 检查在最前)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    setBuild.value = { style: { name: '玄武' }, coreValues: [{ key: 'x' }] }
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.95))
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('breakthrough')
  })

  it('无临近突破、无 build → explore 目标(未涉足且可入的地界)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    // 默认 unlocked=['qingyun']、cleared=[]
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('explore')
    expect(goal.text).toContain('深入')
  })

  it('已遍历的图清净空、库存与装备皆足 → 真兜底返回 null(不硬塞建议)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    useAdventureStore().cleared = [...useAdventureStore().unlocked]
    useResourcesStore().herbByGrade[1] = 12
    for (const slot of ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman'] as const) {
      useInventoryStore().equip(`u-${slot}`, slot)
    }
    expect(generateCurrentGoal(player)).toBeNull()
  })

  it('通关过地界但灵草见底(herb<10) → material 目标,指向最高层级已通关地界', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun', 'luoxia']
    adventure.cleared = ['qingyun', 'luoxia'] // 无未通关地界,explore 不触发
    useResourcesStore().herbByGrade[1] = 3
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('material')
    expect(goal.text).toContain('采')
    expect(goal.text).toContain('落霞谷') // tier 2 > tier 1,指最高的
    expect(goal.progress).toBe(0.3)
    expect(goal.hint, '进度已在卡上,不另附说明').toBeUndefined()
  })

  it('灵草充足(herb>=10) → material 不触发', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = ['qingyun']
    for (const slot of ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman'] as const) {
      useInventoryStore().equip(`u-${slot}`, slot)
    }
    useResourcesStore().herbByGrade[1] = 12
    expect(generateCurrentGoal(player)).toBeNull()
  })

  it('通关过地界、灵草足、装备槽有空位 → equipment 目标,指向第一个空槽且带进度', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = ['qingyun']
    // 优先级里第一个空槽是 body(衣袍)
    useInventoryStore().equip('u-weapon', 'weapon')
    useInventoryStore().equip('u-head', 'head')
    useResourcesStore().herbByGrade[1] = 12
    const goal = generateCurrentGoal(player)!
    expect(goal.type).toBe('equipment')
    expect(goal.text).toContain('寻一件')
    expect(goal.text).toContain('衣袍')
    expect(goal.progress).toBeCloseTo(2 / 9)
    expect(goal.hint, '进度已在卡上,不另附说明').toBeUndefined()
  })

  it('从未通关过地界(cleared 为空) → 即便灵草与装备皆缺也不硬塞(宁缺毋滥)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    const adventure = useAdventureStore()
    adventure.unlocked = []
    adventure.cleared = []
    useResourcesStore().herbByGrade[1] = 0
    expect(generateCurrentGoal(player)).toBeNull()
  })

  it('当前品见底而旧品成堆 → 仍提示采集(跨品总和会掩盖断粮)', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = ['qingyun']
    // resources.herb(跨品总和)读 500 会放过这次断粮
    useResourcesStore().herbByGrade[1] = 0
    useResourcesStore().herbByGrade[3] = 500
    const goal = generateCurrentGoal(player)!
    expect(goal.type, '当前品断粮就该提示采集,不能被旧品掩盖').toBe('material')
    expect(goal.progress).toBe(0)
  })

  it('world-break 后最高已通关地界低于当前大境界:提示按「实采可得的那一品」判缺,采不出所需之品就不再推', () => {
    const player = usePlayerStore()
    player.initCharacter('目标', { roots: [] } as never)
    player.exp = gnZero()
    player.major = 12 // 当前大境界已是仙品(3)
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun'] // 只通关凡界(地界 0)
    adventure.cleared = ['qingyun']
    for (const slot of ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman'] as const) {
      useInventoryStore().equip(`u-${slot}`, slot)
    }
    const resources = useResourcesStore()
    resources.herbByGrade[1] = 50 // 地界品(凡品)成堆
    resources.herbByGrade[3] = 0 // 当前大境界品(仙品)见底
    // 采集只出凡品,救不了仙品见底
    expect(generateCurrentGoal(player)).toBeNull()
  })
})
