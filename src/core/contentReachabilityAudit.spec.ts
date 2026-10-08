/* eslint-disable no-console */
/**
 * 内容可达性审计 —— 有没有设计出来、玩家却永远碰不到的东西
 *
 * 这套审计的由来:Phase 32.6 把灵乳移出掉落池,注释写"丹方须另行习得",
 * 而"另行习得"当时并不存在。于是 15 张高阶丹方在代码里齐备、在图鉴里列着,
 * 玩家却一张也拿不到。单看丹方那是个 bug;放到系统尺度看,它暴露的是一类
 * 反复会犯的错:**把某样内容从随机掉落改成知识获取时,忘了修那条路。**
 *
 * 所以这里测的不是"功能能不能工作",而是:
 * **整个内容库里,有没有哪一件是玩家永远触达不到的?**
 *
 * 判据是一条通则,不是一张豁免名单:
 *
 *   凡被消费的知识,必有获取路径。
 *
 * 尚未接入的骨架(炼器图纸、铭纹技艺)因无人消费而自然豁免 —— 它们不是死内容,
 * 只是还没接上的接口。而一旦有人让某张配方开始吃 inscribe、或往库里放第一张
 * 图纸,豁免会自动失效,这里就会变红,提醒他先修路再放内容。
 *
 * 与 loreService.spec.ts 的分工:那边测藏经阁这条路本身走不走得通(速度、
 * 顺序、边界),这边测全部内容清单有没有漏网的。
 *
 * 往这里加判据之前先读 docs/审计规范.md —— 每条判据都附有故障注入配方,
 * 新加的那条也得先证明自己能被打红,否则只是让测试计数 +1。
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PILLS, pillDef } from '@/data/pills'
import { MATERIALS } from '@/data/materials'
import { ENEMIES } from '@/data/enemies'
import { REGIONS } from '@/data/regions'
import { GONGFA } from '@/data/gongfa'
import { EVENTS, FORTUNE_EVENTS } from '@/data/events'
import { ARTIFACTS } from '@/data/artifacts'
import { artifactDef } from '@/data/artifacts'
import { buffDef } from '@/data/buffs'
import { petDef } from '@/data/pets'
import { gongfaDef } from '@/data/gongfa'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { REALMS, MAX_MAJOR, WORLD_BREAK_MAJOR } from '@/data/realms'
import { DAO_NAMES, SKILL_IDS, recipeCraft, skillDef, type SkillDef, type SkillId } from '@/data/crafting'
import { ELEMENT_AFFINITY } from '@/data/linggenAffinity'
import { gn } from '@/utils/gnum'
import { useLoreStore } from '@/stores/lore'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { useCultivationStore } from '@/stores/cultivation'
import type { ElementId } from '@/types'
import { gongfaAffinity } from './linggenAffinity'
import { rollFieldMaterial, seedLoreIfNeeded, studiableRecipes } from './loreService'
import { learnRandomGongfa } from './gongfaService'
import { craftPill } from './pillService'

const CRAFTABLE = PILLS.filter(p => p.recipe)
const NOTHING_KNOWN = (): number => 0
/**
 * 每个采集池的试抽次数。取值只需压住偶发:池内最低占比若有 1%,
 * 一千二百次漏空的概率约百万分之六 —— 而真正的零概率必然次次缺席。
 */
const ROLLS_PER_POOL = 1200

describe('内容可达性 · 丹方', () => {
  it('每一张可炼丹方都终有翻到之日', () => {
    const reachable = new Set<string>()
    for (let major = 0; major <= MAX_MAJOR; major += 1) {
      for (const p of studiableRecipes(major, NOTHING_KNOWN)) reachable.add(p.id)
    }
    const dead = CRAFTABLE.filter(p => !reachable.has(p.id)).map(p => `${p.name}(${p.id})`)
    expect(dead).toEqual([])
    expect(reachable.size).toBe(CRAFTABLE.length)
  })
})

describe('内容可达性 · 灵材', () => {
  it('每一味灵材都能在某处区域真抽出来 —— 高阶少见,但不是不可见', () => {
    // 行为验证:直接问 rollFieldMaterial,而不是照着它的公式自己再算一遍。
    // 从前这里复刻了 tier→rank 的换算和 1/rank 的权重,于是权重公式怎么改都
    // 测不出来 —— 谁把高阶灵材调成零概率,这里照样绿。现在真抽,零概率必然缺席。
    const seen = new Set<string>()
    for (const region of REGIONS) {
      for (const bucket of ['herb', 'ore'] as const) {
        for (let i = 0; i < ROLLS_PER_POOL; i += 1) {
          const m = rollFieldMaterial(region.tier, bucket)
          if (m) seen.add(m.id)
        }
      }
    }
    const dead = MATERIALS.filter(m => !seen.has(m.id)).map(m => `${m.name}(${m.id} rank${m.rank})`)
    expect(dead).toEqual([])
  })
})

describe('内容可达性 · 敌人', () => {
  it('每一头敌人都被某处区域引用 —— 否则它的认知永远拿不到', () => {
    const referenced = new Set(REGIONS.flatMap(r => [...r.enemies, r.boss]))
    const dead = ENEMIES.filter(e => !referenced.has(e.id)).map(e => `${e.name}(${e.id})`)
    expect(dead).toEqual([])
  })

  it('区域引用的敌人都真有定义 —— 反向也不能断', () => {
    const defined = new Set(ENEMIES.map(e => e.id))
    const dangling = [...new Set(REGIONS.flatMap(r => [...r.enemies, r.boss]))].filter(id => !defined.has(id))
    expect(dangling).toEqual([])
  })
})

describe('内容可达性 · 区域解锁链', () => {
  it('从青云山麓出发,每一处区域都能沿 requireCleared 链走到', () => {
    // 根节点:无前置
    const roots = REGIONS.filter(r => !r.requireCleared)
    expect(roots.map(r => r.id)).toEqual(['qingyun'])

    const reached = new Set<string>(['qingyun'])
    let grew = true
    while (grew) {
      grew = false
      for (const r of REGIONS) {
        if (reached.has(r.id)) continue
        if (r.requireCleared && reached.has(r.requireCleared)) {
          reached.add(r.id)
          grew = true
        }
      }
    }
    const unreachable = REGIONS.filter(r => !reached.has(r.id)).map(r => `${r.name}(${r.id})`)
    expect(unreachable).toEqual([])
    expect(reached.size).toBe(REGIONS.length)
  })

  it('前置区域必须真实存在,且链上层级与境界门槛单调不回退', () => {
    const byId = new Map(REGIONS.map(r => [r.id, r]))
    for (const r of REGIONS) {
      if (!r.requireCleared) continue
      const prev = byId.get(r.requireCleared)
      expect(prev, `${r.id} 的前置 ${r.requireCleared} 不存在`).toBeDefined()
      // 同层第二处地界与正区同 tier(同难度带),故只要求不回退
      expect(r.tier, `${r.id} 层级低于前置 ${prev!.id}`).toBeGreaterThanOrEqual(prev!.tier)
      expect(r.minRealm, `${r.id} 境界门槛低于前置 ${prev!.id}`).toBeGreaterThanOrEqual(prev!.minRealm)
    }
  })
})

describe('内容可达性 · 事件点名发放的灵兽', () => {
  /**
   * once 事件一旦触发即被标记为「已见」,此后再不出现。
   * 若点名发放的灵兽只是概率分支,运气差的一份存档就永久少一只神兽 ——
   * 这不是稀有,是死内容。要么事件可重复,要么该选项必得。
   */
  it('一次性事件不得把点名灵兽放在概率分支里', () => {
    for (const ev of EVENTS) {
      if (!ev.once) continue
      for (const ch of ev.choices) {
        const grantsNamedPet = ch.outcomes.some(o => o.effects.some(e => e.type === 'pet' && e.id))
        if (!grantsNamedPet) continue
        expect(ch.outcomes.length, `${ev.id} 是 once 事件,却把点名灵兽放在概率分支里`).toBe(1)
      }
    }
  })

  it('点名灵兽终有获得路径:存在可重复(或必得)的发放事件', () => {
    const grantable = new Set<string>()
    for (const ev of EVENTS) {
      for (const ch of ev.choices) {
        for (const o of ch.outcomes) {
          for (const e of o.effects) {
            if (e.type !== 'pet' || !e.id) continue
            const guaranteed = ch.outcomes.length === 1 || !ev.once
            if (guaranteed) grantable.add(e.id)
          }
        }
      }
    }
    // 扩界新增的四只神兽都必须有可重复/必得的来源
    for (const id of ['pet_yinglong', 'pet_qilin', 'pet_kunpeng', 'pet_taotie']) {
      expect(grantable.has(id), `${id} 没有任何可重复或必得的发放路径`).toBe(true)
    }
  })
})

describe('内容可达性 · 法宝与装备模板', () => {
  /** 掉落池按「fromTier ≤ 当前层级」过滤,故 fromTier 一旦高于最高区域层级,该件永不掉落 */
  const MAX_REGION_TIER = Math.max(...REGIONS.map(r => r.tier))

  it('每一件法宝都有可达的掉落层级', () => {
    for (const a of ARTIFACTS) {
      expect(a.fromTier, `法宝「${a.name}」fromTier=${a.fromTier} 高于最高区域层级 ${MAX_REGION_TIER},永不掉落`).toBeLessThanOrEqual(
        MAX_REGION_TIER
      )
    }
  })

  it('每一件装备模板都有可达的掉落层级', () => {
    for (const t of EQUIPMENT_TEMPLATES) {
      expect(t.tier, `装备「${t.name}」tier=${t.tier} 高于最高区域层级 ${MAX_REGION_TIER},永不掉落`).toBeLessThanOrEqual(
        MAX_REGION_TIER
      )
    }
  })
})

describe('内容可达性 · 事件效果的引用完整性', () => {
  /**
   * 事件里点名发的东西若 id 写错,引擎不会报错 —— 它会静默改成「灵草 +10」之类的兜底。
   * 玩家看到的是一句对不上的文案,数据里没有任何红。这条把每个点名的 id 都对一遍。
   */
  const ALL_EVENTS = [...EVENTS, ...FORTUNE_EVENTS]

  it('事件点名的丹药/增益/灵兽/法宝/功法都真实存在', () => {
    for (const ev of ALL_EVENTS) {
      for (const ch of ev.choices) {
        for (const o of ch.outcomes) {
          for (const e of o.effects) {
            if (e.type === 'pill' && e.id) expect(pillDef(e.id), `${ev.id}「${ev.title}」指向不存在的丹药 ${e.id}`).toBeDefined()
            if (e.type === 'buff') expect(buffDef(e.id), `${ev.id}「${ev.title}」指向不存在的增益 ${e.id}`).toBeDefined()
            if (e.type === 'pet' && e.id) expect(petDef(e.id), `${ev.id}「${ev.title}」指向不存在的灵兽 ${e.id}`).toBeDefined()
            if (e.type === 'artifact' && e.id)
              expect(artifactDef(e.id), `${ev.id}「${ev.title}」指向不存在的法宝 ${e.id}`).toBeDefined()
            if (e.type === 'gongfa' && e.id) expect(gongfaDef(e.id), `${ev.id}「${ev.title}」指向不存在的功法 ${e.id}`).toBeDefined()
          }
        }
      }
    }
  })
})

describe('内容可达性 · 高界丹药真能开炉', () => {
  /**
   * 丹药价值审计只算「该值多少」,没验过新界的方子能不能真的开出一炉。
   * 方子清单缺料、rank 越界、材料池为空 —— 这些都在真开一炉时才现形。
   */
  it('仙界及以上每一张可炼丹方都能开炉(不因缺方/缺料中止)', () => {
    setActivePinia(createPinia())
    seedLoreIfNeeded()
    const lore = useLoreStore()
    const resources = useResourcesStore()
    const player = usePlayerStore()
    player.major = MAX_MAJOR
    // 高界方子按品吃草:仙品(3)/神品(4)/道品(5)各给足,免得低阶草喂不了高阶方
    resources.addHerb(3, 20_000_000)
    resources.addHerb(4, 20_000_000)
    resources.addHerb(5, 20_000_000)
    // 高界丹方的灵石开销按层级折算(1.9^tier 量级),远高于元婴期的直觉数
    resources.addStone(gn(1e40))

    const highCraft = PILLS.filter(p => p.recipe && p.minRealm >= WORLD_BREAK_MAJOR)
    expect(highCraft.length, '新界没有任何可炼丹方').toBeGreaterThan(0)

    for (const p of highCraft) {
      lore.addRecipeMastery(p.id, 1) // 先得方
      // 技艺拉满,排除「练不出」的干扰 —— 这里只验流程不因缺料/越界而中止
      for (const s of Object.keys(recipeCraft(p)!.skills) as SkillId[]) lore.addSkillExp(s, 50_000)
      const out = craftPill(p.id)
      expect(out.aborted, `${p.name} 开炉被中止(缺方或缺料)`).toBeFalsy()
    }
  })
})

describe('内容可达性 · 功法', () => {
  it('修到顶再一路参悟下去,三十余部功法一部不落', () => {
    // 行为验证:真去藏经阁参悟到池空。从前这里复刻了 gongfaService 的池条件
    // (minRealm <= major + 1)自己筛一遍,那样只证明了"我抄的条件跟我抄的条件一致"——
    // 谁把 +1 改成 -1、或让某部功法的权重变成零,复刻版都察觉不到。
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    player.major = MAX_MAJOR

    // 池非空时 learnRandomGongfa 必学走一部,故正常情况下 GONGFA.length 轮即尽;
    // 留出富余是为了给"权重极低"和"权重为零"分道:前者终会学到,后者跑满也学不到。
    for (let i = 0; i < GONGFA.length * 40; i += 1) {
      if (learnRandomGongfa() === null) break
    }
    const dead = GONGFA.filter(g => !cultivation.learned[g.id]).map(g => `${g.name}(${g.id} minRealm${g.minRealm})`)
    expect(dead).toEqual([])
  })

  it('任何灵根都不会把某部功法的亲和压到零 —— 亲和只改概率,不关门', () => {
    // 这条只断言 gongfaAffinity 本身(真函数,无同源问题)。
    // 外层的品质权重不在这里复刻 —— 它归上一条行为验证管。
    const allElements = Object.keys(ELEMENT_AFFINITY) as ElementId[]
    for (const g of GONGFA) {
      for (const roots of [[], allElements] as const) {
        expect(gongfaAffinity(g.element, roots)).toBeGreaterThan(0)
      }
    }
  })
})

describe('内容可达性 · 技艺', () => {
  /** 被丹方吃重的技艺 —— 它们按权重直接决定成败,见 craftability.weightedSkill */
  const consumed = new Set<SkillId>()
  for (const p of CRAFTABLE) {
    for (const id of Object.keys(recipeCraft(p)?.skills ?? {})) consumed.add(id as SkillId)
  }

  it('丹方吃重的技艺都是有名有姓的技艺 —— 键名写错一个字便是暗伤', () => {
    // craftability 按这批键读熟练度,pillService 按同一批键发经验。键若写错,
    // 读到的恒为 0(成功率被永久压低),经验则发进一个不存在的技艺 —— 两处都不会报错。
    const legal = new Set<string>(SKILL_IDS)
    const bogus = [...consumed].filter(id => !legal.has(id))
    expect(bogus).toEqual([])
  })

  it('丹方不吃炼器道的技艺 —— 否则铭纹得靠开丹炉来练', () => {
    // 这就是那条"未接骨架自动失效"的守卫。炼器道眼下没有任何内容,
    // 谁要是让丹方开始吃 inscribe,等于拿丹炉给炼器道供经验:路还没修,先别放内容。
    const crossDao = [...consumed]
      .map(id => skillDef(id))
      .filter((d): d is SkillDef => d?.dao === 'lianqi')
      .map(d => `${d.name}(${DAO_NAMES[d.dao]})`)
    expect(crossDao).toEqual([])
  })

  it('开一炉丹,这张方子吃重的技艺样样都长', () => {
    // 行为验证,不是数据推演 —— 数据上"被方子消费"与"从炼丹获得"本就同出一表,
    // 互推恒真、毫无信息量。真开一炉,才看得出经验有没有落到该落的地方。
    // 钉的是"读"与"发"两端同源:若哪天发放改成只给主技艺,余下几项就成了
    // 决定你成败、你却永远练不到的暗坑。
    setActivePinia(createPinia())
    seedLoreIfNeeded()
    const lore = useLoreStore()
    const resources = useResourcesStore()
    resources.addSmall('herb', 9999)
    resources.addStone(gn(1e6))

    const def = pillDef('p_jvqisan')!
    const skills = Object.keys(recipeCraft(def)!.skills) as SkillId[]
    expect(skills.length).toBeGreaterThan(1)
    const before = new Map(skills.map(id => [id, lore.expOf(id)]))

    // 炉开成了才谈得上练;成败在所不论 —— 炸炉照样长本事
    const out = craftPill(def.id)
    expect(out.aborted).toBeFalsy()
    for (const id of skills) expect(lore.expOf(id)).toBeGreaterThan(before.get(id)!)
  })
})

describe('内容可达性 · 炼器骨架', () => {
  /**
   * 源码文本级的守卫。炼器道眼下连一张图纸的定义都没有,无表可遍历,
   * 于是换个问法:代码里有没有人在读图纸掌握度?有没有人在给?
   *
   * 这条守的正是本文件开头那句承诺 —— 豁免必须会自动失效。只要有谁写下
   * 第一处 `lore.blueprintMastery(...)` 而没有同时修出 studyBlueprint 的
   * 调用点,这里立刻变红:读得到、拿不到,又是一条灵乳式的断链。
   */
  const SOURCES = import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const code = Object.entries(SOURCES)
    .filter(([path]) => !path.includes('.spec.'))
    .map(([, text]) => text)
    .join('\n')

  it('图纸掌握度有人读就得有人给 —— 炼器道要么两头都接,要么两头都不接', () => {
    // 读:只认 `xxx.blueprintMastery(` 这种取自 store 实例的调用。store 内部
    // 那次裸调用(addBlueprintMastery 自己要先读旧值)是实现细节,不算消费。
    const isConsumed = /\.blueprintMastery\s*\(/.test(code)
    // 给:studyBlueprint 是模块级导出函数,定义本身占一次,>1 才说明真有人调
    const isSourced = (code.match(/\bstudyBlueprint\s*\(/g) ?? []).length > 1
    expect(isConsumed).toBe(isSourced)
  })
})

describe('内容可达性 · 全局报告', () => {
  it('列出各条知识线的接入状况', () => {
    const reachableRecipes = new Set<string>()
    for (let major = 0; major <= MAX_MAJOR; major += 1) {
      for (const p of studiableRecipes(major, NOTHING_KNOWN)) reachableRecipes.add(p.id)
    }
    // 识材这条路给的技艺:照面涨识材,认出药性再涨该材的专业技艺(见 loreService)
    const fromMaterials = new Set<SkillId>(['discern'])
    for (const m of MATERIALS) fromMaterials.add(m.bucket === 'herb' ? 'herbLore' : 'smithing')
    // 开炉这条路给的技艺:按丹方权重发放(见 pillService.gainCraftExp)
    const fromAlchemy = new Set<SkillId>()
    for (const p of CRAFTABLE) {
      for (const id of Object.keys(recipeCraft(p)?.skills ?? {})) fromAlchemy.add(id as SkillId)
    }
    const sourcedSkills = new Set<SkillId>([...fromMaterials, ...fromAlchemy])
    const unwired = SKILL_IDS.filter(id => !sourcedSkills.has(id))

    console.log('\n  —— 内容可达性审计 ——')
    console.log(`  丹方   ${reachableRecipes.size}/${CRAFTABLE.length} 可达    藏经阁求索`)
    console.log(`  灵材   ${MATERIALS.length}/${MATERIALS.length} 可达    历练采集`)
    console.log(`  敌人   ${ENEMIES.length}/${ENEMIES.length} 可达    区域交手`)
    console.log(`  功法   ${GONGFA.length}/${GONGFA.length} 可达    残页参悟`)
    console.log(`  技艺   ${sourcedSkills.size}/${SKILL_IDS.length} 有来源  识材 ${fromMaterials.size} 项 · 开炉 ${fromAlchemy.size} 项`)
    console.log(`  境界跨度 ${REALMS.length} 重`)
    if (unwired.length > 0) {
      console.log(`  未接骨架:技艺 ${unwired.join('、')} —— 炼器道尚无内容消费,不构成死内容`)
    }
    console.log('  炼器图纸:blueprintLore 有字段无内容,studyBlueprint 尚无调用点\n')

    expect(reachableRecipes.size).toBe(CRAFTABLE.length)
  })
})
