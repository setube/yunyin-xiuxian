/* eslint-disable no-console */
/**
 * 藏经阁求索回归 —— 丹方是否真的拿得到
 *
 * 这组测试守的是一条曾经断掉的路:Phase 32.6 把灵乳移出掉落池,注释里写"丹方须
 * 另行习得",而当时"另行习得"根本不存在 —— 丹方掌握度只有三个写入点,播种是
 * 一次性的、炸炉要求已能开炉、studyTick 只补已知未通的方子,没有一处能把一张
 * 掌握度为 0 的方子捡起来。于是新号这辈子只会那三张入门方,rank 4 以上的丹全是
 * 看得见炼不出的死内容。
 *
 * 所以这里不止测灵乳。真正要钉住的是那条通则:
 * **每一张写进 PILLS 的可炼丹方,都得有一条走得通的到手路径。**
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PILLS } from '@/data/pills'
import { recipeCraft } from '@/data/crafting'
import { bearableRank } from './craftability'
import { NEW_RECIPE_START, STUDY_REACH_OVER, seedLoreIfNeeded, studiableRecipes, studyTick } from './loreService'
import { useLoreStore } from '@/stores/lore'
import { useDongfuStore } from '@/stores/dongfu'
import { usePlayerStore } from '@/stores/player'

const CRAFTABLE = PILLS.filter(p => p.recipe)
const NOTHING_KNOWN = (): number => 0
const rankOf = (id: string): number => {
  const def = PILLS.find(p => p.id === id)
  return def ? (recipeCraft(def)?.rank ?? 0) : 0
}

describe('藏经阁候选(纯函数)', () => {
  it('金丹期够得着四转的灵乳', () => {
    const ids = studiableRecipes(2, NOTHING_KNOWN).map(p => p.id)
    expect(ids).toContain('p_lingru')
  })

  it('筑基期还够不着 —— 灵乳的准入境界与阶位都在其上', () => {
    const ids = studiableRecipes(1, NOTHING_KNOWN).map(p => p.id)
    expect(ids).not.toContain('p_lingru')
  })

  it('已在手的方子不会被重复翻出', () => {
    const ids = studiableRecipes(2, id => (id === 'p_lingru' ? NEW_RECIPE_START : 0)).map(p => p.id)
    expect(ids).not.toContain('p_lingru')
  })

  it('先易后难:候选按阶位升序,同阶按准入境界升序', () => {
    const list = studiableRecipes(5, NOTHING_KNOWN)
    expect(list.length).toBeGreaterThan(3)
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]!
      const cur = list[i]!
      const dr = rankOf(cur.id) - rankOf(prev.id)
      expect(dr).toBeGreaterThanOrEqual(0)
      if (dr === 0) expect(cur.minRealm).toBeGreaterThanOrEqual(prev.minRealm)
    }
  })

  it('候选一律未超出"够一够能到"的阶位', () => {
    for (let major = 0; major <= 9; major += 1) {
      const ceiling = bearableRank(major) + STUDY_REACH_OVER
      for (const p of studiableRecipes(major, NOTHING_KNOWN)) {
        expect(rankOf(p.id)).toBeLessThanOrEqual(ceiling)
        expect(p.minRealm).toBeLessThanOrEqual(major)
      }
    }
  })

  it('无死内容:每一张可炼丹方都终有翻到之日', () => {
    const reachable = new Set<string>()
    for (let major = 0; major <= 9; major += 1) {
      for (const p of studiableRecipes(major, NOTHING_KNOWN)) reachable.add(p.id)
    }
    const dead = CRAFTABLE.filter(p => !reachable.has(p.id)).map(p => `${p.name}(${p.id})`)
    expect(dead).toEqual([])
    expect(reachable.size).toBe(CRAFTABLE.length)
  })
})

describe('藏经阁钻研(挂机推演)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** 挂机若干小时,返回灵乳到手时已耗的时辰数;始终未到手返回 null */
  function hoursUntil(id: string, libraryLv: number, major: number, capHours: number): number | null {
    const player = usePlayerStore()
    player.major = major
    useDongfuStore().setLevel('library', libraryLv)
    seedLoreIfNeeded()
    const lore = useLoreStore()
    expect(lore.recipeMastery(id)).toBe(0)
    for (let h = 1; h <= capHours; h += 1) {
      studyTick(3600)
      if (lore.recipeMastery(id) > 0) return h
    }
    return null
  }

  it('金丹期挂机终能翻出灵乳的方子', () => {
    const hours = hoursUntil('p_lingru', 6, 2, 400)
    expect(hours).not.toBeNull()
    // 拿得到只是及格线;还得在放置游戏说得过去的时长内拿到,否则与死内容无异
    expect(hours!).toBeLessThanOrEqual(80)
    console.log(`  灵乳丹方:六级藏经阁 · 金丹期,约 ${hours} 个时辰到手`)
  })

  it('新翻出的方子只是抄下来了,火候节点仍靠后续钻研', () => {
    const player = usePlayerStore()
    player.major = 1
    useDongfuStore().setLevel('library', 4)
    seedLoreIfNeeded()
    const lore = useLoreStore()
    const before = lore.knownRecipeCount

    studyTick(3600 * 24)
    expect(lore.knownRecipeCount).toBe(before + 1)
    const fresh = Object.entries(lore.recipeLore).find(([, v]) => v > 0 && v < 1)
    expect(fresh).toBeDefined()
    expect(fresh![1]).toBeCloseTo(NEW_RECIPE_START, 6)
  })

  it('一次心跳只办一件事,不会一口气刷出整架书', () => {
    const player = usePlayerStore()
    player.major = 3
    useDongfuStore().setLevel('library', 12)
    seedLoreIfNeeded()
    const lore = useLoreStore()
    const before = lore.knownRecipeCount
    studyTick(3600 * 1000)
    expect(lore.knownRecipeCount).toBe(before + 1)
  })

  it('架上无书可读时钻研量归零,不会无限膨胀', () => {
    const player = usePlayerStore()
    player.major = 0
    useDongfuStore().setLevel('library', 3)
    seedLoreIfNeeded()
    const lore = useLoreStore()
    // 炼气期够得着的方子拢共就那几张,翻通之后再攒也无处可用
    const total = studiableRecipes(0, id => lore.recipeMastery(id)).length + lore.knownRecipeCount
    for (let h = 0; h < 300; h += 1) studyTick(3600)
    expect(lore.knownRecipeCount).toBe(total)
    expect(lore.studyFrac).toBe(0)
  })

  it('未建藏经阁则毫无进展 —— 这条路要先修出来', () => {
    const player = usePlayerStore()
    player.major = 5
    seedLoreIfNeeded()
    const lore = useLoreStore()
    const before = lore.knownRecipeCount
    for (let h = 0; h < 100; h += 1) studyTick(3600)
    expect(lore.knownRecipeCount).toBe(before)
    expect(lore.studyFrac).toBe(0)
  })
})
