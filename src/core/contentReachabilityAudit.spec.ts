/* eslint-disable no-console */
/**
 * 内容可达性审计:内容库里有没有玩家永远触达不到的内容。
 *
 * 判据:凡被消费的知识,必有获取路径。
 * 未接入的骨架(炼器图纸、铭纹技艺)无人消费,自然豁免;一旦有配方吃 inscribe
 * 或库里放进第一张图纸,豁免自动失效,这里变红。
 *
 * 分工:loreService.spec.ts 测藏经阁这条路本身(速度、顺序、边界),这边测全部内容清单。
 * 新增判据先读 docs/审计规范.md:须附故障注入配方,并先证明能被打红。
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
import { CAVE_EVENT_POOL } from '@/data/earlyGame'
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
/** 每个采集池的试抽次数:池内最低占比 1% 时漏空概率约百万分之六 */
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
    // 行为验证:真抽 rollFieldMaterial,不复刻它的权重公式 —— 复刻版测不出零概率
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
      // 同层第二处地界与正区同 tier,故只要求不回退
      expect(r.tier, `${r.id} 层级低于前置 ${prev!.id}`).toBeGreaterThanOrEqual(prev!.tier)
      expect(r.minRealm, `${r.id} 境界门槛低于前置 ${prev!.id}`).toBeGreaterThanOrEqual(prev!.minRealm)
    }
  })
})

describe('内容可达性 · 事件点名发放的灵兽', () => {
  /** once 事件触发后不再出现:点名灵兽要么事件可重复,要么该选项必得 */
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
    // 扩界新增的四只神兽
    for (const id of ['pet_yinglong', 'pet_qilin', 'pet_kunpeng', 'pet_taotie']) {
      expect(grantable.has(id), `${id} 没有任何可重复或必得的发放路径`).toBe(true)
    }
  })
})

describe('内容可达性 · 法宝与装备模板', () => {
  /** 掉落池按「fromTier ≤ 当前层级」过滤 */
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
  /** 事件点名的 id 写错时引擎不报错,静默改成「灵草 +10」之类的兜底 */
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
  /** 丹药价值审计不验开炉;缺料、rank 越界、材料池为空只在真开一炉时现形 */
  it('仙界及以上每一张可炼丹方都能开炉(不因缺方/缺料中止)', () => {
    setActivePinia(createPinia())
    seedLoreIfNeeded()
    const lore = useLoreStore()
    const resources = useResourcesStore()
    const player = usePlayerStore()
    player.major = MAX_MAJOR
    // 高界方子按品吃草:仙品(3)/神品(4)/道品(5)
    resources.addHerb(3, 20_000_000)
    resources.addHerb(4, 20_000_000)
    resources.addHerb(5, 20_000_000)
    // 高界丹方灵石开销 1.9^tier 量级
    resources.addStone(gn(1e40))

    const highCraft = PILLS.filter(p => p.recipe && p.minRealm >= WORLD_BREAK_MAJOR)
    expect(highCraft.length, '新界没有任何可炼丹方').toBeGreaterThan(0)

    for (const p of highCraft) {
      lore.addRecipeMastery(p.id, 1)
      // 技艺拉满:只验不因缺料/越界而中止
      for (const s of Object.keys(recipeCraft(p)!.skills) as SkillId[]) lore.addSkillExp(s, 50_000)
      const out = craftPill(p.id)
      expect(out.aborted, `${p.name} 开炉被中止(缺方或缺料)`).toBeFalsy()
    }
  })
})

describe('内容可达性 · 功法', () => {
  it('修到顶再一路参悟下去,三十余部功法一部不落', () => {
    // 行为验证:真参悟到池空,不复刻 gongfaService 的池条件 —— 复刻版测不出条件改错或权重为零
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const cultivation = useCultivationStore()
    player.major = MAX_MAJOR

    // 池非空时每轮必学走一部;富余轮数用来区分权重极低与权重为零
    for (let i = 0; i < GONGFA.length * 40; i += 1) {
      if (learnRandomGongfa() === null) break
    }
    const dead = GONGFA.filter(g => !cultivation.learned[g.id]).map(g => `${g.name}(${g.id} minRealm${g.minRealm})`)
    expect(dead).toEqual([])
  })

  it('任何灵根都不会把某部功法的亲和压到零 —— 亲和只改概率,不关门', () => {
    // 只断言 gongfaAffinity 本身;外层品质权重归上一条
    const allElements = Object.keys(ELEMENT_AFFINITY) as ElementId[]
    for (const g of GONGFA) {
      for (const roots of [[], allElements] as const) {
        expect(gongfaAffinity(g.element, roots)).toBeGreaterThan(0)
      }
    }
  })
})

describe('内容可达性 · 技艺', () => {
  /** 被丹方吃重的技艺,按权重定成败(见 craftability.weightedSkill) */
  const consumed = new Set<SkillId>()
  for (const p of CRAFTABLE) {
    for (const id of Object.keys(recipeCraft(p)?.skills ?? {})) consumed.add(id as SkillId)
  }

  it('丹方吃重的技艺都是有名有姓的技艺 —— 键名写错一个字便是暗伤', () => {
    // craftability 按这批键读熟练度,pillService 按同一批键发经验;键写错两处都不报错
    const legal = new Set<string>(SKILL_IDS)
    const bogus = [...consumed].filter(id => !legal.has(id))
    expect(bogus).toEqual([])
  })

  it('丹方不吃炼器道的技艺 —— 否则铭纹得靠开丹炉来练', () => {
    // 「未接骨架自动失效」的守卫:炼器道尚无内容
    const crossDao = [...consumed]
      .map(id => skillDef(id))
      .filter((d): d is SkillDef => d?.dao === 'lianqi')
      .map(d => `${d.name}(${DAO_NAMES[d.dao]})`)
    expect(crossDao).toEqual([])
  })

  it('开一炉丹,这张方子吃重的技艺样样都长', () => {
    // 行为验证:消费与获得同出一表、互推恒真,须真开一炉;钉「读」「发」两端同源
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

    // 成败不论,炸炉也长经验
    const out = craftPill(def.id)
    expect(out.aborted).toBeFalsy()
    for (const id of skills) expect(lore.expOf(id)).toBeGreaterThan(before.get(id)!)
  })
})

describe('内容可达性 · 炼器骨架', () => {
  /**
   * 源码文本级守卫:炼器道无图纸定义可遍历,改查代码里有无人读、有无人给图纸掌握度。
   * 写下 `lore.blueprintMastery(...)` 而无 studyBlueprint 调用点,这里变红。
   */
  const SOURCES = import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const code = Object.entries(SOURCES)
    .filter(([path]) => !path.includes('.spec.'))
    .map(([, text]) => text)
    .join('\n')

  it('图纸掌握度有人读就得有人给 —— 炼器道要么两头都接,要么两头都不接', () => {
    // 读:只认取自 store 实例的 `xxx.blueprintMastery(`;store 内 addBlueprintMastery 的裸调用不算
    const isConsumed = /\.blueprintMastery\s*\(/.test(code)
    // 给:定义本身占一次,>1 才有调用点
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
    // 识材路径:照面涨识材,认出药性再涨该材的专业技艺(见 loreService)
    const fromMaterials = new Set<SkillId>(['discern'])
    for (const m of MATERIALS) fromMaterials.add(m.bucket === 'herb' ? 'herbLore' : 'smithing')
    // 开炉路径:按丹方权重发放(见 pillService.gainCraftExp)
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

/**
 * 洞府事件惩罚按 `cave_penalty_${type}` 拼 buff id(见 earlyGameService)。
 *
 * 拼接出来的 id 一旦对不上,`addBuff` 里 `if (!def) return` 会静默跳过 ——
 * 惩罚不生效,玩家白拿好处,而且不报错。判断它们对不对只能靠命名约定,
 * 所以这里把约定本身钉住:每个声明过的 penalty.type 都得有同名 buff。
 */
describe('内容可达性 · 洞府惩罚 buff 的命名约定', () => {
  it('每个 penalty.type 都能拼出一个真实存在的 buff', () => {
    /*
     * 原先靠 `JSON.stringify(...).includes('"penalty":{"type":"…"')` 认惩罚:
     * 属性顺序一变(先写 value 再写 type)就匹配不上,循环直接 `continue`,
     * 命名约定检查照样绿,而那条惩罚其实没有对应 buff。现在直接读对象。
     */
    const types = new Set<string>()
    for (const pool of Object.values(CAVE_EVENT_POOL)) {
      for (const ev of pool as { options: { penalty?: { type?: string } }[] }[]) {
        for (const opt of ev.options ?? []) {
          const t = opt.penalty?.type
          if (typeof t === 'string' && t) types.add(t)
        }
      }
    }
    expect(types.size, '没扫到任何惩罚类型,守卫空转').toBeGreaterThan(0)
    for (const t of types) {
      expect(buffDef(`cave_penalty_${t}`), `惩罚类型 ${t} 拼出的 cave_penalty_${t} 在 BUFFS 里不存在 —— 惩罚会静默失效`).toBeDefined()
    }
  })

  /**
   * 奖励侧的 buff 引用同样要查。
   *
   * 上一条只用 `penalty.type` 拼名字,不碰 `reward.value`。而奖励也可以是一条增益
   * (「吸纳药气」给 cave_furnace_cult),写错 id 时走的是同一个 `if (!def) return`,
   * 一样静默失效 —— 玩家选了那个选项,什么都没发生,也没有回执。
   * 实测:把那条 value 改成不存在的 id,上一条判据照样绿。
   */
  it('reward 指向的 buff id 都真实存在', () => {
    const ids = new Set<string>()
    for (const pool of Object.values(CAVE_EVENT_POOL)) {
      for (const ev of pool as { options: { reward?: { type?: string; value?: unknown } }[] }[]) {
        for (const opt of ev.options ?? []) {
          if (opt.reward?.type === 'buff' && typeof opt.reward.value === 'string') ids.add(opt.reward.value)
        }
      }
    }
    expect(ids.size, '没扫到任何奖励 buff,守卫空转').toBeGreaterThan(0)
    for (const id of ids) {
      expect(buffDef(id), `奖励 buff ${id} 在 BUFFS 里不存在 —— 选了那个选项会静默失效`).toBeDefined()
    }
  })
})
