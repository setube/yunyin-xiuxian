/* eslint-disable no-console */
/**
 * 解锁链补票 —— 扩界之后,旧档的「已靖」不再等于「下游已开」
 *
 * 现象:玩家反馈「鸿蒙裂隙之主始终刷不到」。
 *
 * 根因:解锁一直是**一次性事件** —— 击败某地之主的那一刻,才把
 * `requireCleared === 此地` 的下游 unlock 进列表(exploration.clearRegionAndUnlockNext)。
 * 于是「下游」如果在击败之后才被加进数据表,那一刻就永远过去了:
 * 首领不会复现(bossDue 认 adventure.cleared),unlock() 没有第二次机会。
 *
 * v1.34.0 的境界扩界正是这个形状:人间界 20 处是老内容,仙界 21 起的 24 处
 * 是新增的,云海仙门 requireCleared = 鸿蒙裂隙。凡是在扩界之前就把鸿蒙裂隙
 * 靖了的老档(即当时通关全部内容的玩家),进入新版本后:
 *
 *   - 鸿蒙裂隙显示「已靖」,首领 e_hmdemon 再也不会出现;
 *   - 云海仙门显示「需先击败鸿蒙裂隙之主,方可踏足此地」,而这句要求永远无法满足;
 *   - 仙界 / 神界 / 混沌海 24 处地界、12 大境界对这份存档整体不可达。
 *
 * 判据不是「解锁表里有没有 yunhai」,而是**行为**:这份旧档在新版本里
 * 到底能不能踏进仙界。
 *
 * 故障注入:把 unlockClosure 的调用从 adventure.sanitize 里摘掉,
 * 「读档补票 / 只补该补的 / 不吞开荒」三条即转红(实测)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MORTAL_REGIONS, REGIONS, regionDef, unlockClosure } from '@/data/regions'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { canEnterRegion } from './mortalWorldService'
import { startExploration } from './exploration'
import { sanitizeOfflineInputs } from './offline'

/** 扩界之前的一份「通关档」:人间界 20 处全部靖了,解锁表也就到鸿蒙裂隙为止 */
function forgeOldEndgameSave(): void {
  const adventure = useAdventureStore()
  const ids = MORTAL_REGIONS.map(r => r.id)
  adventure.unlocked = [...ids]
  adventure.cleared = [...ids]
}

beforeEach(() => {
  setActivePinia(createPinia())
  usePlayerStore().initCharacter('补票', { roots: [] } as never)
})

describe('解锁链补票 · 旧档的仙界入口', () => {
  it('扩界前的通关档:鸿蒙裂隙已靖,云海仙门却永远开不了(修复前的现象)', () => {
    const adventure = useAdventureStore()
    forgeOldEndgameSave()
    expect(adventure.cleared).toContain('hongmeng')
    expect(adventure.unlocked, '旧档的解锁表里没有云海仙门').not.toContain('yunhai')
    console.log(
      `\n旧档:已靖 ${adventure.cleared.length} 处(含鸿蒙裂隙),` +
        `云海仙门可进 = ${canEnterRegion('yunhai')}`
    )
  })

  it('读档补票:前置已靖的地界自动补进解锁表,云海仙门真的能进', () => {
    const adventure = useAdventureStore()
    forgeOldEndgameSave()
    expect(canEnterRegion('yunhai'), '补票前:仙界进不去').toBe(false)

    // 走真实的读档口(engine.start → sanitizeOfflineInputs),不是直接调 store 方法
    sanitizeOfflineInputs()

    expect(adventure.unlocked, '补票后:云海仙门在解锁表里').toContain('yunhai')
    expect(canEnterRegion('yunhai'), '补票后:准入谓词放行').toBe(true)
    // 行为验收:不是列表里有就算数,真开一程才算接上
    expect(startExploration('yunhai', 'normal'), '补票后:仙界真的能出发').toBe(true)
    adventure.setSession(null)
    console.log(`\n补票后:云海仙门 ${regionDef('yunhai')!.name} 可出发`)
  })

  it('补票不会把整张表全开 —— 只开前置确实靖了的那些', () => {
    const adventure = useAdventureStore()
    // 只靖到鸿蒙裂隙:下游到云海仙门为止,金阙玉京(前置谪仙古渡)仍上锁
    forgeOldEndgameSave()
    adventure.sanitize()

    expect(adventure.unlocked).toContain('yunhai')
    expect(adventure.unlocked, '谪仙古渡的前置是云海仙门,云海未靖不该开').not.toContain('zhexian')
    expect(adventure.unlocked, '金阙玉京的前置是谪仙古渡,更不该开').not.toContain('yujing')
    const opened = adventure.unlocked.length - MORTAL_REGIONS.length
    expect(opened, '一次补票只该补 1 处(云海仙门)').toBe(1)
  })

  it('补票幂等:反复读档不会把解锁表撑出重复项', () => {
    const adventure = useAdventureStore()
    forgeOldEndgameSave()
    adventure.sanitize()
    const once = [...adventure.unlocked]
    adventure.sanitize()
    adventure.sanitize()
    expect(adventure.unlocked).toEqual(once)
    expect(new Set(adventure.unlocked).size, '解锁表里出现重复项').toBe(adventure.unlocked.length)
  })

  it('自愈不吞掉正常开荒:新号靖一处只开一处,提示照旧', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = []
    adventure.sanitize()
    expect(adventure.unlocked, '已靖为空时不该凭空开地界').toEqual(['qingyun'])

    // 正常击败青云之主:下游照常开放,且只开 requireCleared 指向青云的那一处
    adventure.markCleared('qingyun')
    adventure.sanitize()
    expect(adventure.unlocked).toEqual(['qingyun', 'luoxia'])
    expect(adventure.unlocked).toHaveLength(2)
  })
})

describe('解锁闭包 · 纯函数', () => {
  it('闭包按前置传递,一次算到底', () => {
    // 青云已靖 → 落霞开;落霞未靖 → 黑风林不开
    const got = unlockClosure(['qingyun'], ['qingyun'])
    expect(got).toEqual(['qingyun', 'luoxia'])
  })

  it('链式补齐:前置连成一片时,整段一起补', () => {
    const got = unlockClosure(['qingyun'], ['qingyun', 'luoxia', 'heifeng'])
    for (const id of ['qingyun', 'luoxia', 'heifeng', 'hantan']) expect(got).toContain(id)
    expect(got, '再下游(万妖林)仍须自己靖').not.toContain('wanyao')
  })

  it('不认识的残留 id 原样留着,不借机清表', () => {
    const got = unlockClosure(['qingyun', 'ghost_region'], [])
    expect(got).toEqual(['qingyun', 'ghost_region'])
  })

  it('全部靖了就是全部开 —— 与数据表同规模', () => {
    const got = unlockClosure(['qingyun'], REGIONS.map(r => r.id))
    expect(new Set(got).size).toBe(REGIONS.length)
  })
})
