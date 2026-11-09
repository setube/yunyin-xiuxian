/* eslint-disable no-console */
/** 藏经阁求索回归:每一张写进 PILLS 的可炼丹方,都须有一条走得通的到手路径。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { PILLS } from '@/data/pills'
import { MATERIALS } from '@/data/materials'
import { ENEMIES } from '@/data/enemies'
import { rng } from '@/utils/random'
import { recipeCraft } from '@/data/crafting'
import { MAX_MAJOR } from '@/data/realms'
import { bearableRank } from './craftability'
import {
  NEW_RECIPE_COST,
  NEW_RECIPE_START,
  SEEN_FOR_NATURE,
  STUDY_MASTERY_PER_HOUR,
  STUDY_REACH_OVER,
  discernChance,
  encounterMaterial,
  noteEnemyMany,
  natureChance,
  seedLoreIfNeeded,
  studiableRecipes,
  studyEta,
  studyTick
} from './loreService'
import { useLoreStore } from '@/stores/lore'
import { useDongfuStore } from '@/stores/dongfu'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'

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
    // 超时即与死内容无异
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
    // 唯一未通方子只剩 0.001 缺口,锅中蓄 0.5:只应消费缺口,盈余留给下一拍
    lore.recipeLore = { p_jvqidan: 0.999 }
    lore.studyFrac = 0.5
    studyTick(0.001) // dt 极小,累计增量可忽略
    expect(lore.recipeMastery('p_jvqidan')).toBeCloseTo(1, 6)
    expect(lore.studyFrac).toBeGreaterThan(0.49)
  })

  it('丹方读通要有一声 —— 完成不静默(与翻出新方/灵材通晓同族)', () => {
    const player = usePlayerStore()
    player.major = 1
    useDongfuStore().setLevel('library', 4)
    const ui = useUiStore()
    const lore = useLoreStore()
    lore.recipeLore = { p_jvqidan: 0.999 }
    lore.studyFrac = 0.5
    studyTick(0.001)
    expect(lore.recipeMastery('p_jvqidan')).toBe(1)
    const hit = ui.toasts.find(t => t.text.includes('聚气丹'))
    expect(hit?.text, '读通要报方名与通晓').toContain('通晓')
    expect(hit?.kind, '与灵材通晓同属过程里程碑').toBe('rare')
  })

  it('架上无书可读时钻研量归零,不会无限膨胀', () => {
    const player = usePlayerStore()
    player.major = 0
    useDongfuStore().setLevel('library', 3)
    seedLoreIfNeeded()
    const lore = useLoreStore()
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

/** studyEta 须与 studyTick 同一优先序:先补熟最生的一张、都读通了才求索新方;数值只做「缺口 ÷ 现速」。 */
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
    // 够得着的都补到通晓,独留灵乳一张未启
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

/**
 * 发灵草/玄铁的源码须归类,与 encounterMaterial 注释同口径:计照面的文件调 harvestMaterials,不计的点名。
 * 故障注入:删掉 secretRealm.ts 的 harvestMaterials 调用 → 本条红;新增发草处而不归类 → 本条红。
 */
describe('灵材照面 · 来源归类', () => {
  const SRC = resolve(__dirname, '..')
  /** addHerb,或 addSmall 首参不是残页/器灵尘/悟道点字面量 */
  const GRANT = /\baddHerb\(|\baddSmall\((?!\s*'(?:page|dust|wudao)')/
  const COUNTED = ['core/eventEngine.ts', 'core/loot.ts', 'core/offline.ts', 'core/secretRealm.ts']
  const NOT_COUNTED = ['core/earlyGameService.ts', 'core/progress.ts', 'core/suppress.ts', 'stores/apprentice.ts', 'stores/dongfu.ts', 'stores/market.ts']
  /** 库存本体:定义 addHerb / addSmall */
  const STORE = ['stores/resources.ts']

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.spec.ts')) out.push(full)
    }
    return out
  }

  const code = (full: string): string =>
    readFileSync(full, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('凡发灵草/玄铁的源码都已归类,计照面的确实调了 harvestMaterials', () => {
    const files = walk(SRC)
    expect(files.length, '扫描到了源码(防空转)').toBeGreaterThan(100)
    const granting = files
      .filter(f => GRANT.test(code(f)))
      .map(f => relative(SRC, f).replace(/\\/g, '/'))
      .sort()
    expect(granting).toEqual([...COUNTED, ...NOT_COUNTED, ...STORE].sort())
    for (const rel of COUNTED) expect(code(join(SRC, rel)), `${rel} 须经 harvestMaterials 计照面`).toContain('harvestMaterials(')
  })
})

/**
 * 认知检定的两道夹逼:辨识(0.04~0.9)与知性(0.02~0.75)。
 *
 * 两条都是**可达的**,不是防将来的兜底:
 *  · `discernChance` 的 base 里带 `-(rank-1)*0.018`,rank≥10 时原始值就低于 0.04
 *    (rank=20、无技艺时原始值 -0.142)
 *  · `natureChance` 的 base 带 `-(rank-1)*0.015`,rank≥8 时原始值已为负
 * 不钳的话,高品材料会算出**负概率** —— 比「必失败」更糟:负数喂进 `rng.chance()` 后
 * 判定恒假,但显示层印出来是「-14%」。
 *
 * 这两个函数此前在 spec 里一次都没被调过(变异扫描点名)。下面把两头与中间都钉住。
 */
describe('认知检定 · 概率夹在合法区间', () => {
  it('辨识:高品材料也不低于 4%,再熟也不超过 90%', () => {
    // 高端:rank 拉满、技艺为 0、没见过 → 原始值为负,须钳在 0.04
    for (const rank of [10, 12, 20, 99]) {
      const v = discernChance(rank, 0, 0)
      expect(v, `rank=${rank} 的辨识概率低于下限 —— 钳制没了`).toBeGreaterThanOrEqual(0.04)
      expect(v, `rank=${rank} 该钳在 4%`).toBe(0.04)
    }
    // 低端:低品 + 高技艺 + 见过很多 → 超过上限,须钳在 0.9
    const high = discernChance(1, 999, 999)
    expect(high, '辨识概率超过 90%').toBeLessThanOrEqual(0.9)
    expect(high, '该钳在 90%').toBe(0.9)
    // 中间段不被钳坏
    const mid = discernChance(1, 0, 0)
    expect(mid, '一阶新材料的辨识概率该保持原本算式').toBeCloseTo(0.2, 6)
  })

  it('知性:高品材料也不低于 2%,再熟也不超过 75%', () => {
    for (const rank of [8, 10, 20, 99]) {
      const v = natureChance(rank, 0, 0, SEEN_FOR_NATURE)
      expect(v, `rank=${rank} 的知性概率低于下限 —— 钳制没了`).toBeGreaterThanOrEqual(0.02)
      expect(v, `rank=${rank} 该钳在 2%`).toBe(0.02)
    }
    const high = natureChance(1, 999, 999, 999)
    expect(high, '知性概率超过 75%').toBeLessThanOrEqual(0.75)
    expect(high, '该钳在 75%').toBe(0.75)
  })

  it('知性:照面次数不够时仍是 0(早退优先于夹逼)', () => {
    expect(natureChance(1, 999, 999, SEEN_FOR_NATURE - 1), '没到照面门槛不该给概率').toBe(0)
  })

  it('两条概率对任意输入都不出 [0,1] 之外,也不为 NaN', () => {
    for (const rank of [-5, 0, 1, 10, 99, 1e6]) {
      for (const lv of [0, 50, 1e5]) {
        const d = discernChance(rank, lv, 0)
        expect(Number.isFinite(d), `discernChance(${rank},${lv}) = ${d}`).toBe(true)
        expect(d, `discernChance(${rank},${lv}) 越界`).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(1)
        const n = natureChance(rank, lv, lv, SEEN_FOR_NATURE)
        expect(Number.isFinite(n), `natureChance(${rank},${lv}) = ${n}`).toBe(true)
        expect(n, `natureChance(${rank},${lv}) 越界`).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(1)
      }
    }
  })
})

/*
 * 与灵材照面:认知层推进的唯一入口。
 *
 * `encounterMaterial` 此前零行为测试(只在源码扫描里被提到名字),
 * 变异扫描因此把开头那道 `if (!def) return false` 报成「改坏了不会红」。
 *
 * 这条闸防的是喂进不存在的 id:少了它,`markSeen('nope')` 会先在
 * `materialSeen` 里记下一个假键,再一路走到 `discernChance(def.rank, ...)` ——
 * `def` 是 undefined,当场抛。
 */
describe('灵材照面 · encounterMaterial', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('给定不存在的灵材 id,当照面,则返回 false 且不抛', () => {
    const lore = useLoreStore()
    expect(encounterMaterial('no-such-material'), '查不到就该安静返回').toBe(false)
    expect(lore.seenOf('no-such-material'), '不该往照面表里塞假键').toBe(0)
  })

  it('给定真灵材且判定命中,当照面,则认知层推进一格', () => {
    const lore = useLoreStore()
    const def = MATERIALS[0]!
    vi.spyOn(rng, 'chance').mockReturnValue(true)
    try {
      expect(lore.loreOf(def.id), '起手是第 0 层').toBe(0)
      expect(encounterMaterial(def.id, true), '命中就该推进').toBe(true)
      expect(lore.loreOf(def.id), '推进到第 1 层').toBe(1)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('给定真灵材且判定落空,当照面,则认知层不动但照面数 +1', () => {
    const lore = useLoreStore()
    const def = MATERIALS[0]!
    vi.spyOn(rng, 'chance').mockReturnValue(false)
    try {
      const seenBefore = lore.seenOf(def.id)
      expect(encounterMaterial(def.id, true), '没命中就返回 false').toBe(false)
      expect(lore.loreOf(def.id), '认知层不动').toBe(0)
      expect(lore.seenOf(def.id), '照面数还是要记 —— 熟识度是另一条尺').toBe(seenBefore + 1)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('给定已到第 2 层,当再照面,则不再推进(封顶)', () => {
    const lore = useLoreStore()
    const def = MATERIALS[0]!
    vi.spyOn(rng, 'chance').mockReturnValue(true)
    try {
      encounterMaterial(def.id, true)
      encounterMaterial(def.id, true)
      expect(lore.loreOf(def.id), '两次命中到第 2 层').toBe(2)
      expect(encounterMaterial(def.id, true), '第 2 层就封顶了').toBe(false)
      expect(lore.loreOf(def.id)).toBe(2)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

/*
 * 敌人照面记账:负数胜/败场不许把照面数记账记成负的,也不许反过来多记。
 *
 * `noteEnemyMany` 此前零覆盖。它唯一的生产调用点在离线结算:
 * `noteEnemyMany(mobId, wins, battles - wins)` —— 正常情况下 battles >= wins,
 * 两个入参都非负;但 battles 与 wins 都是存档可写字段,坏档里能出现 wins > battles,
 * 于是 losses 为负。
 *
 * 少了 `Math.max(0, …)`,`wins=3, losses=-5` 算出 0.5 —— 一个**正数**,
 * `seen <= 0` 拦不住它,`markEnemySeen` 也收下了(它只拒 <= 0),玩家于是被判
 * 「与这只妖照面半次」。钳制后该格回到 3,与「只赢 3 场」一致。
 */
describe('敌人照面 · 负数场次的钳制', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('给定负数败场,当记账,则按 0 计而不是扣掉胜场的权重', () => {
    const lore = useLoreStore()
    const id = ENEMIES[0]!.id
    noteEnemyMany(id, 3, -5)
    // 只赢 3 场 = 照面 3 次;不钳制则 losses 的 -5 会抵掉一部分
    expect(lore.enemySeenOf(id), '负败场该按 0 计,照面数就是 3').toBe(3)
  })

  it('给定全负场次,当记账,则不记、返回 false', () => {
    const lore = useLoreStore()
    const id = ENEMIES[0]!.id
    expect(noteEnemyMany(id, -5, -5), '一次都没遇到就该返回 false').toBe(false)
    expect(lore.enemySeenOf(id), '什么都不该记').toBe(0)
  })

  it('给定查不到的妖 id,当记账,则安静返回 false', () => {
    expect(() => noteEnemyMany('no_such_enemy', 3, 2), '不该抛').not.toThrow()
    expect(noteEnemyMany('no_such_enemy', 3, 2)).toBe(false)
  })
})
