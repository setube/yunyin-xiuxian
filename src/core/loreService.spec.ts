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
import { MAX_MAJOR } from '@/data/realms'
import { bearableRank } from './craftability'
import { NEW_RECIPE_COST, NEW_RECIPE_START, STUDY_MASTERY_PER_HOUR, STUDY_REACH_OVER, seedLoreIfNeeded, studiableRecipes, studyEta, studyTick } from './loreService'
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
    for (let major = 0; major <= MAX_MAJOR; major += 1) {
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

  it('临近完成的方子吃不下的钻研不蒸发:只吃缺口,盈余留在锅里', () => {
    const player = usePlayerStore()
    player.major = 1
    useDongfuStore().setLevel('library', 4)
    const lore = useLoreStore()
    // 唯一一张未通方子只剩 0.001 缺口,锅中蓄了 0.5 —— 修复前整袋倒进 clamp 到 1,
    // studyFrac 归零,0.499 的钻研蒸发;修复后只消费缺口,盈余留给下一拍继续
    lore.recipeLore = { p_jvqidan: 0.999 }
    lore.studyFrac = 0.5
    studyTick(0.001) // dt 极小,累计增量可忽略
    expect(lore.recipeMastery('p_jvqidan')).toBeCloseTo(1, 6)
    // 盈余保留(δ=本拍 dt 累计的微小增量),而不是整段清零
    expect(lore.studyFrac).toBeGreaterThan(0.49)
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

/**
 * 藏经阁「下一件事」的读数 —— 判据是与 studyTick 同一优先序:
 * 先补熟最生的一张、都读通了才求索新方,数值只做「缺口 ÷ 现速」。
 */
describe('藏经阁翻检概况(studyEta)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未建藏经阁:无事可报 → null', () => {
    setActivePinia(createPinia())
    expect(studyEta()).toBeNull()
  })

  it('手头有半生方子:在补熟那张,时间 = (缺口 − 锅余) ÷ 现速', () => {
    const player = usePlayerStore()
    player.major = 2
    useDongfuStore().setLevel('library', 6)
    const lore = useLoreStore()
    lore.addRecipeMastery('p_lingru', 0.5)
    lore.studyFrac = 0.1
    const eta = studyEta()!
    expect(eta.readingId).toBe('p_lingru')
    expect(eta.nextIsNew).toBe(false)
    const rate = (6 * STUDY_MASTERY_PER_HOUR) / 3600
    expect(eta.nextInSec).toBeCloseTo((1 - 0.5 - 0.1) / rate, 6)
  })

  it('都在手且还有方子可翻:下一件事是求索新方', () => {
    const player = usePlayerStore()
    player.major = 2
    useDongfuStore().setLevel('library', 5)
    const lore = useLoreStore()
    // 把够得着的都补到通晓,独留灵乳一张未启 —— 于是架上还有书
    for (const p of PILLS) {
      if (!p.recipe || p.id === 'p_lingru') continue
      const rank = recipeCraft(p)?.rank ?? Number.MAX_SAFE_INTEGER
      if (p.minRealm <= player.major && rank <= bearableRank(player.major) + STUDY_REACH_OVER) {
        lore.addRecipeMastery(p.id, 1)
      }
    }
    lore.studyFrac = 0.05
    const eta = studyEta()!
    expect(eta.readingId).toBeNull()
    expect(eta.nextIsNew).toBe(true)
    const rate = (5 * STUDY_MASTERY_PER_HOUR) / 3600
    expect(eta.nextInSec).toBeCloseTo((NEW_RECIPE_COST - 0.05) / rate, 6)
  })

  it('够得着的都已到手:读通齐了也无可翻 → 0', () => {
    const player = usePlayerStore()
    player.major = 2
    useDongfuStore().setLevel('library', 5)
    const lore = useLoreStore()
    for (const p of PILLS) {
      if (!p.recipe) continue
      const rank = recipeCraft(p)?.rank ?? Number.MAX_SAFE_INTEGER
      if (p.minRealm <= player.major && rank <= bearableRank(player.major) + STUDY_REACH_OVER) {
        lore.addRecipeMastery(p.id, 1)
      }
    }
    lore.studyFrac = 0.5
    const eta = studyEta()!
    expect(eta.readingId).toBeNull()
    expect(eta.nextIsNew).toBe(false)
    expect(eta.nextInSec).toBe(0)
  })
})
