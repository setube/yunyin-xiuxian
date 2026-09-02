/**
 * Phase 32.5:轮回从「次数」改成「历史」
 *
 * 这一组测试盯的不是某个函数的返回值,而是这套设计的三条命脉:
 *
 * 1. **宿慧确实由所知长出来** —— 折算口径不含任何可挂机自增的项。
 * 2. **命题都是做得到的** —— 判据的目标值必须落在游戏内容的实际上限之内,
 *    否则玩家会立下一条永远走不完的题。
 * 3. **认知层确实在藏东西** —— 未交手就不该看见它的招式与残血变阵。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ENEMIES, enemyDef } from '@/data/enemies'
import { MATERIALS, LORE_MAX } from '@/data/materials'
import { PILLS } from '@/data/pills'
import { REALMS } from '@/data/realms'
import { SKILL_IDS, skillLevelFromExp } from '@/data/crafting'
import { LIFE_THEMES, themesForStage, type LifeThemeDef, type LifeThemeMetric } from '@/data/lifeThemes'
import {
  INSIGHT_PER_ENEMY,
  INSIGHT_PER_MATERIAL,
  INSIGHT_PER_MATERIAL_MASTERED,
  INSIGHT_PER_RECIPE,
  INSIGHT_SKILL_DIV,
  SAMSARA_STAGES,
  legacyInsightOf,
  nextStageAfter,
  stageAt
} from '@/data/samsara'
import { ENEMY_LORE_MAX, useLoreStore } from '@/stores/lore'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { describeEnemy, effectiveEnemyStage } from '@/ui/enemyLore'
import {
  aptitudeFloorNow,
  beginLife,
  carryLore,
  lifeInsight,
  loreInsight,
  noteTaboo,
  offerThemes,
  totalInsight,
  vowProgress,
  vowResult,
  type LoreSnapshot
} from './samsaraService'

const RECIPE_COUNT = PILLS.filter(p => p.recipe).length
const MAX_MAJOR = REALMS.length - 1

function emptySnap(): LoreSnapshot {
  return { materialLore: {}, recipeLore: {}, skillExp: {}, enemyLore: {} }
}

describe('宿慧折算(loreInsight)', () => {
  it('一无所知时为 0 —— 宿慧没有任何自然增长的底噪', () => {
    expect(loreInsight(emptySnap())).toBe(0)
  })

  it('认得与通晓分两笔计:认得它叫什么和会用它,是两回事', () => {
    const known = loreInsight({ ...emptySnap(), materialLore: { m_a: 1 } })
    const mastered = loreInsight({ ...emptySnap(), materialLore: { m_a: LORE_MAX } })
    expect(known).toBe(INSIGHT_PER_MATERIAL)
    expect(mastered).toBe(INSIGHT_PER_MATERIAL + INSIGHT_PER_MATERIAL_MASTERED)
  })

  it('丹方只在通晓(掌握度满)时计,半懂不懂不算', () => {
    expect(loreInsight({ ...emptySnap(), recipeLore: { p_a: 0.9 } })).toBe(0)
    expect(loreInsight({ ...emptySnap(), recipeLore: { p_a: 1 } })).toBe(INSIGHT_PER_RECIPE)
  })

  it('敌人只在洞悉(认知层满)时计', () => {
    expect(loreInsight({ ...emptySnap(), enemyLore: { e_a: ENEMY_LORE_MAX - 1 } })).toBe(0)
    expect(loreInsight({ ...emptySnap(), enemyLore: { e_a: ENEMY_LORE_MAX } })).toBe(INSIGHT_PER_ENEMY)
  })

  it('九项技艺按熟练度之和折算,且双曲饱和永不到顶', () => {
    const huge = Object.fromEntries(SKILL_IDS.map(id => [id, 1e9]))
    const got = loreInsight({ ...emptySnap(), skillExp: huge })
    expect(got).toBe(Math.floor((SKILL_IDS.length * skillLevelFromExp(1e9)) / INSIGHT_SKILL_DIV))
    // 每项熟练度趋近 100 却永远够不着,所以这一路的折算也够不到理论顶
    expect(got).toBeLessThan((SKILL_IDS.length * 100) / INSIGHT_SKILL_DIV)
  })

  it('一世阅历随走到的境界递增', () => {
    expect(lifeInsight(0)).toBeLessThan(lifeInsight(MAX_MAJOR))
    expect(lifeInsight(-5)).toBe(lifeInsight(0))
  })
})

describe('轮回阶段(SAMSARA_STAGES)', () => {
  it('门槛严格递增,分阶取不超过宿慧的最高一阶', () => {
    for (let i = 1; i < SAMSARA_STAGES.length; i += 1) {
      expect(SAMSARA_STAGES[i]!.insight).toBeGreaterThan(SAMSARA_STAGES[i - 1]!.insight)
    }
    expect(stageAt(0).index).toBe(0)
    expect(stageAt(SAMSARA_STAGES[2]!.insight - 1).index).toBe(1)
    expect(stageAt(1e9).index).toBe(SAMSARA_STAGES.length - 1)
    expect(nextStageAfter(1e9)).toBeNull()
  })

  it('能力只增不减 —— 高阶不该收回低阶已开的见识', () => {
    for (let i = 1; i < SAMSARA_STAGES.length; i += 1) {
      const prev = SAMSARA_STAGES[i - 1]!
      const cur = SAMSARA_STAGES[i]!
      expect(cur.knownMaterialRank).toBeGreaterThanOrEqual(prev.knownMaterialRank)
      expect(Number(cur.enemyInsight)).toBeGreaterThanOrEqual(Number(prev.enemyInsight))
      expect(Number(cur.heavenInsight)).toBeGreaterThanOrEqual(Number(prev.heavenInsight))
    }
  })

  it('顶阶「睁眼即识」覆盖全部灵材', () => {
    const top = SAMSARA_STAGES[SAMSARA_STAGES.length - 1]!
    const maxRank = Math.max(...MATERIALS.map(m => m.rank))
    expect(top.knownMaterialRank).toBeGreaterThanOrEqual(maxRank)
  })

  /**
   * 这是本 Phase 最要紧的一条平衡门:把认知全刷满(现量)也够不到顶阶,
   * 顶阶必须靠一世一世的阅历攒。否则「百世老修」会在第二世就被速通掉,
   * 而它描述的分明是"带着百世记忆重新投胎的存在"。
   */
  it('单靠一世刷满全部认知,够得到第三阶但够不到顶阶', () => {
    const maxLore =
      MATERIALS.length * (INSIGHT_PER_MATERIAL + INSIGHT_PER_MATERIAL_MASTERED) +
      RECIPE_COUNT * INSIGHT_PER_RECIPE +
      (SKILL_IDS.length * 100) / INSIGHT_SKILL_DIV +
      ENEMIES.length * INSIGHT_PER_ENEMY
    expect(maxLore).toBeGreaterThanOrEqual(SAMSARA_STAGES[2]!.insight)
    expect(maxLore).toBeLessThan(SAMSARA_STAGES[SAMSARA_STAGES.length - 1]!.insight)
  })

  /**
   * 旧存档折算是一道两难:折低了老玩家凭空掉档,折高了等于替他们补上从未走过的路。
   * 现取值偏向下限 —— 转世一次仍是初入轮回(不白送),转世十次才落到「熟知凡间」。
   */
  it('旧存档折算:一世不白送,十世落到「熟知凡间」', () => {
    expect(stageAt(legacyInsightOf(1)).index).toBe(0)
    expect(stageAt(legacyInsightOf(10)).index).toBeGreaterThanOrEqual(1)
    expect(legacyInsightOf(-3)).toBe(0)
  })
})

describe('这一世的命题(LIFE_THEMES)', () => {
  it('id 不重复', () => {
    expect(new Set(LIFE_THEMES.map(t => t.id)).size).toBe(LIFE_THEMES.length)
  })

  it('每一阶都至少有三条可选命题 —— 少于三条,抽三取一就没有取舍可言', () => {
    for (const st of SAMSARA_STAGES) {
      expect(themesForStage(st.index).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('高阶命题的宿慧回报不低于低阶命题的最高回报', () => {
    for (let i = 1; i < SAMSARA_STAGES.length; i += 1) {
      const prev = LIFE_THEMES.filter(t => t.minStage === i - 1)
      const cur = LIFE_THEMES.filter(t => t.minStage === i)
      if (prev.length === 0 || cur.length === 0) continue
      expect(Math.min(...cur.map(t => t.insight))).toBeGreaterThanOrEqual(Math.max(...prev.map(t => t.insight)))
    }
  })

  /** 立下一条永远走不完的题,比不给题更伤 —— 逐条核对判据目标落在内容上限内 */
  it('每一条判据的目标都落在游戏内容的实际上限之内', () => {
    const check = (m: LifeThemeMetric, t: LifeThemeDef): void => {
      switch (m.kind) {
        case 'realm':
          expect(m.major, `${t.id} 境界目标越界`).toBeLessThanOrEqual(MAX_MAJOR)
          break
        case 'materialLore':
          expect(m.stage, `${t.id} 认知层越界`).toBeLessThanOrEqual(LORE_MAX)
          expect(m.n, `${t.id} 灵材数越界`).toBeLessThanOrEqual(MATERIALS.length)
          break
        case 'recipeMastered':
          expect(m.n, `${t.id} 丹方数越界`).toBeLessThanOrEqual(RECIPE_COUNT)
          break
        case 'skill':
          expect(SKILL_IDS, `${t.id} 技艺 id 不存在`).toContain(m.id)
          // 熟练度双曲饱和于 100,取满不可能,留出余量
          expect(m.level, `${t.id} 熟练度目标不可达`).toBeLessThan(100)
          break
        case 'enemyLore':
          expect(m.n, `${t.id} 敌手数越界`).toBeLessThanOrEqual(ENEMIES.length)
          break
        case 'counter':
        case 'branch':
        case 'avenge':
          expect(m.n, `${t.id} 目标须为正`).toBeGreaterThan(0)
          break
        case 'all':
          expect(m.of.length, `${t.id} 组合判据至少两条`).toBeGreaterThanOrEqual(2)
          for (const sub of m.of) check(sub, t)
          break
      }
    }
    for (const t of LIFE_THEMES) check(t.metric, t)
  })

  it('立了忌讳的命题,回报高于同阶无忌讳的命题', () => {
    for (const t of LIFE_THEMES.filter(x => x.taboo)) {
      const peers = LIFE_THEMES.filter(x => x.minStage === t.minStage && !x.taboo)
      if (peers.length === 0) continue
      expect(t.insight, `${t.id} 守了规矩却不比不守的值钱`).toBeGreaterThan(Math.max(...peers.map(x => x.insight)))
    }
  })
})

describe('命题的取用与判定', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('非顶阶抽三取一,顶阶全池自选', () => {
    const low = SAMSARA_STAGES[0]!
    const top = SAMSARA_STAGES[SAMSARA_STAGES.length - 1]!
    const first = (arr: LifeThemeDef[]): LifeThemeDef => arr[0]!
    expect(offerThemes(low, first).length).toBe(3)
    expect(offerThemes(top, first).length).toBe(themesForStage(top.index).length)
  })

  it('抽签不重样', () => {
    const picked = offerThemes(SAMSARA_STAGES[2]!, arr => arr[arr.length - 1]!)
    expect(new Set(picked.map(t => t.id)).size).toBe(picked.length)
  })

  it('「本世计」以开世快照为准,前世的战绩不算进来', () => {
    const quests = useQuestsStore()
    quests.inc('explores', 100)
    beginLife('lt_lishi')
    expect(vowProgress()?.cur).toBe(0)
    quests.inc('explores', 60)
    expect(vowProgress()?.done).toBe(true)
    expect(vowResult()).toBe('done')
  })

  it('未立题时无进度可言', () => {
    beginLife(null)
    expect(vowProgress()).toBeNull()
    expect(vowResult()).toBeNull()
  })

  it('犯忌当场破题,且只破自己那一条', () => {
    beginLife('lt_bugu')
    noteTaboo('artifact')
    expect(vowResult()).toBe('unfinished')
    noteTaboo('pill')
    expect(vowResult()).toBe('broken')
  })

  it('破了的题不因后来达标而复活', () => {
    const player = usePlayerStore()
    beginLife('lt_bugu')
    noteTaboo('pill')
    player.major = 9
    expect(vowResult()).toBe('broken')
  })

  it('组合判据取最落后的一条,全部达成才算走到底', () => {
    const lore = useLoreStore()
    for (const m of MATERIALS) lore.advanceLore(m.id, 1)
    beginLife('lt_zhushu')
    const prog = vowProgress()
    // 灵材那一条已满,丹方那一条为 0 —— 进度须报丹方
    expect(prog?.cur).toBe(0)
    expect(prog?.need).toBe(12)
    expect(prog?.done).toBe(false)
  })
})

describe('轮回带走的那一份', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('资质地板两条口径取大:次数保底,宿慧才是主路', () => {
    const player = usePlayerStore()
    expect(aptitudeFloorNow()).toBe(5)
    player.addInsight(600)
    expect(aptitudeFloorNow()).toBe(Math.floor(600 / 12))
  })

  it('宿慧 = 存量 + 现量,认知涨了不必等到转世才认账', () => {
    const player = usePlayerStore()
    const lore = useLoreStore()
    player.addInsight(30)
    expect(totalInsight()).toBe(30)
    lore.advanceLore(MATERIALS[0]!.id, 1)
    expect(totalInsight()).toBe(30 + INSIGHT_PER_MATERIAL)
  })

  it('睁眼即识只补足、不清零:已通晓的灵材不会被降回「已辨识」', () => {
    const lore = useLoreStore()
    const first = MATERIALS[0]!
    lore.advanceLore(first.id, LORE_MAX)
    const top = SAMSARA_STAGES[SAMSARA_STAGES.length - 1]!
    const n = carryLore(top)
    expect(lore.loreOf(first.id)).toBe(LORE_MAX)
    expect(n).toBe(MATERIALS.length - 1)
    // 再补一次不该重复计数
    expect(carryLore(top)).toBe(0)
  })

  it('初入轮回一味也不认得', () => {
    expect(carryLore(SAMSARA_STAGES[0]!)).toBe(0)
    expect(useLoreStore().knownMaterialCount).toBe(0)
  })

  /** legacyInsightOf 与 player.sanitize 各算各的,口径一旦分叉,老存档的显示与实际就对不上 */
  it('旧存档迁移补齐的宿慧,与折算口径一致', () => {
    const player = usePlayerStore()
    // 模拟 Phase 32.5 之前的存档:reincarnation 只有 count / daoFruit / talents 三项
    const old: Record<string, unknown> = { count: 7, daoFruit: 3, talents: ['t_tiansheng'] }
    player.reincarnation = old as typeof player.reincarnation
    player.sanitize()
    expect(player.reincarnation.insight).toBe(legacyInsightOf(7))
    expect(player.reincarnation.lives).toEqual([])
    expect(player.reincarnation.vow).toBeNull()
    expect(player.reincarnation.talents).toEqual(['t_tiansheng'])
    // 再清洗一次不该把已有宿慧重算回折算值
    player.addInsight(50)
    player.sanitize()
    expect(player.reincarnation.insight).toBe(legacyInsightOf(7) + 50)
  })
})

describe('敌人认知的逐层揭示(describeEnemy)', () => {
  const boss = enemyDef('e_wolfking')!

  it('未识:一个字都不给,只给一句"去打"', () => {
    const v = describeEnemy(boss, 0)
    expect(v.frame).toEqual([])
    expect(v.elementName).toBeNull()
    expect(v.skills).toEqual([])
    expect(v.phases).toEqual([])
    expect(v.archetype).toBeNull()
    expect(v.hint).not.toBeNull()
  })

  it('眼熟:见得到体格,还看不出招式', () => {
    const v = describeEnemy(boss, 1)
    expect(v.frame.length).toBeGreaterThan(0)
    expect(v.skills).toEqual([])
    expect(v.phases).toEqual([])
  })

  it('知其路数:招式与门道到手,残血变阵仍瞒着', () => {
    const v = describeEnemy(boss, 2)
    expect(v.skills.length).toBe(boss.skills.length)
    expect(v.skills.every(s => s.note.length > 0)).toBe(true)
    expect(v.phases).toEqual([])
    expect(v.archetype).toBeNull()
    expect(v.hint).not.toBeNull()
  })

  it('洞悉:残血变阵与本相一并交底,再无提示可言', () => {
    const v = describeEnemy(boss, ENEMY_LORE_MAX)
    expect(v.phases.length).toBe(boss.phases?.length ?? 0)
    expect(v.archetype).not.toBeNull()
    expect(v.hint).toBeNull()
  })

  it('层数越界不炸,自行夹紧', () => {
    expect(describeEnemy(boss, -3).stage).toBe(0)
    expect(describeEnemy(boss, 99).stage).toBe(ENEMY_LORE_MAX)
  })

  it('每一头敌人在洞悉层都说得出点什么 —— 没有一条是空壳', () => {
    for (const def of ENEMIES) {
      const v = describeEnemy(def, ENEMY_LORE_MAX)
      expect(v.frame.length + v.skills.length, `${def.id} 洞悉了却无话可说`).toBeGreaterThan(0)
      if (def.isBoss) expect(v.archetype, `${def.id} 是首领却无本相`).not.toBeNull()
    }
  })

  it('宿慧下调门槛只补一档,且替不了亲手打过的那一场', () => {
    expect(effectiveEnemyStage(0, true)).toBe(0)
    expect(effectiveEnemyStage(1, true)).toBe(2)
    expect(effectiveEnemyStage(ENEMY_LORE_MAX, true)).toBe(ENEMY_LORE_MAX)
    expect(effectiveEnemyStage(1, false)).toBe(1)
  })
})
