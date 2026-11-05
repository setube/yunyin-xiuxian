/**
 * 灵兽族徽:灵兽卡此前只有名字、品阶与性格,而这头兽是「走兽」还是「龙属瑞兽」一字未提。
 *
 * 四条判据:
 *   一 一族一印:印字取族名首字,天然不重;重了就是族名起了同一个字头。
 *   二 唯一事实源:族名与图标都来自 data/beastFamilies.ts,本模块不另立对照表。
 *   三 族谱只列有灵兽的族 —— 敌人占了二十一族,全画进来玩家会以为那些也能收。
 *   四 界面真的接上了,且族徽是分类不是品阶:不带品阶色。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BEAST_FAMILIES } from '@/data/beastFamilies'
import { PETS } from '@/data/pets'
import type { BeastFamily } from '@/types'
import { beastCrest, familyRoster } from './beastCrest'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const VIEW = readFileSync(resolve(ROOT, 'src/views/TitlesView.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/beastCrest.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('族徽 · 一、一族一印', () => {
  it('每个族类都取得到印字与族名', () => {
    for (const family of Object.keys(BEAST_FAMILIES) as BeastFamily[]) {
      const crest = beastCrest(family)
      expect(crest.seal, `${family} 缺印字`).toHaveLength(1)
      expect(crest.name, `${family} 缺族名`).toBeTruthy()
    }
  })

  it('各族首字互不相同 —— 重了就是族名起了同一个字头', () => {
    const bySeal = new Map<string, string[]>()
    for (const family of Object.keys(BEAST_FAMILIES) as BeastFamily[]) {
      const { seal } = beastCrest(family)
      bySeal.set(seal, [...(bySeal.get(seal) ?? []), family])
    }
    const shared = [...bySeal.entries()].filter(([, f]) => f.length > 1)
    expect(shared, `以下族类印字重复,须拆开:${JSON.stringify(shared)}`).toEqual([])
  })

  it('灵兽实际用到的族,印字也不重', () => {
    const seals = new Set(PETS.map(p => beastCrest(p.family).seal))
    expect(seals.size, '灵兽各族印字重复').toBe(new Set(PETS.map(p => p.family)).size)
  })
})

describe('族徽 · 二、唯一事实源', () => {
  it('族名与图标都转发自族类表', () => {
    for (const family of Object.keys(BEAST_FAMILIES) as BeastFamily[]) {
      const def = BEAST_FAMILIES[family]
      const crest = beastCrest(family)
      expect(crest.name).toBe(def.name)
      expect(crest.icon).toBe(def.icon)
      expect(crest.seal).toBe(def.name[0])
    }
  })

  it('模块不另抄一张族名表', () => {
    // 出现「走兽: '走'」这类映射就说明抄了一份
    expect(MODULE, '不该另立印字对照表').not.toMatch(/走兽\s*[:=]\s*['"]走['"]/)
    expect(MODULE, '族名应读 BEAST_FAMILIES').toContain('BEAST_FAMILIES')
  })

  it('未知族兜底成一枚印,不抛错', () => {
    const crest = beastCrest('not-a-family' as BeastFamily)
    expect(crest.seal).toHaveLength(1)
    expect(crest.name).toBeTruthy()
  })
})

describe('族徽 · 三、族谱只列有灵兽的族', () => {
  it('族谱行数等于灵兽实际用到的族数', () => {
    const families = new Set(PETS.map(p => p.family))
    expect(familyRoster([]).length).toBe(families.size)
    // 敌人有二十一族,灵兽只用其中几族 —— 族谱不该把它们都列进来
    expect(familyRoster([]).length).toBeLessThan(Object.keys(BEAST_FAMILIES).length)
  })

  it('已有数按 id 现算,总数为该族条数', () => {
    const roster = familyRoster([])
    for (const row of roster) {
      expect(row.owned).toBe(0)
      expect(row.total).toBe(PETS.filter(p => p.family === row.family).length)
    }
    const one = PETS[0]!
    const after = familyRoster([one.id])
    const row = after.find(r => r.family === one.family)!
    expect(row.owned).toBe(1)
  })

  it('全收时各族 owned 等于 total', () => {
    for (const row of familyRoster(PETS.map(p => p.id))) {
      expect(row.owned).toBe(row.total)
    }
  })

  it('次序按数据表首次出现,不按只数排序', () => {
    const expected: string[] = []
    for (const p of PETS) if (!expected.includes(p.family)) expected.push(p.family)
    expect(familyRoster([]).map(r => r.family)).toEqual(expected)
  })
})

describe('族徽 · 五、图鉴册也标出族与性子', () => {
  /**
   * 灵兽册的 meta 原只写品阶名,而族类与性子在名号页都有:
   * 这头兽是走兽、羽禽还是龙属瑞兽,以及它历练时的行为倾向。
   * 两处同读一份数据,不另立 —— 族名走 beastCrest,性子名走 core/petPersonality。
   * 故障注入:把 meta 改回只写品阶名,本条红。
   */
  const COLLECTION = readFileSync(resolve(ROOT, 'src/views/CollectionView.vue'), 'utf-8')

  it('灵兽册的 meta 带上族名与性子名', () => {
    expect(COLLECTION, '灵兽册应读族徽').toContain('beastCrest(p.family)')
    expect(COLLECTION, '灵兽册应读性子名').toContain('PERSONALITY_NAMES[p.personality]')
    expect(COLLECTION, '族名与性子都应与品阶并列,不是各占一处').toMatch(
      /beastCrest\(p\.family\)\.name\} · \$\{PERSONALITY_NAMES\[p\.personality\]\} · \$\{qualityDef\(p\.quality\)\.name/
    )
  })

  it('族名与性子名都取自数据表,不另抄', () => {
    // 名号页与图鉴册必须同一份族名,否则同一头兽在两处叫两个名
    const TITLES = readFileSync(resolve(ROOT, 'src/views/TitlesView.vue'), 'utf-8')
    expect(TITLES, '名号页也读同一份族徽').toContain('beastCrest(')
  })
})

describe('族徽 · 四、界面接上了', () => {
  it('灵兽卡挂族徽,族名给读屏', () => {
    expect(VIEW, '灵兽卡应挂族徽').toContain('beast-crest')
    expect(VIEW, '族徽应读 crest').toContain('row.crest.seal')
    expect(VIEW, '族名应有读屏出口').toContain('row.crest.name')
  })

  it('族谱按已有所得现算', () => {
    expect(VIEW, '族谱应接上').toContain('beast-roster')
    expect(VIEW, '族谱应读 roster').toContain('familyRoster(quests.collections.pet)')
    expect(VIEW, '族谱应显示已有/共有').toContain('{{ f.owned }}/{{ f.total }}')
  })

  it('族徽是分类不是品阶:印面取中性墨色,不套品阶色', () => {
    expect(block('.beast-crest'), '缺族徽样式').not.toBe('')
    const crest = block('.beast-crest')
    expect(crest, '族徽不吃指针事件').toContain('pointer-events: none')
    // 印面色只许取 ink 系;出现 quality/gold/cinnabar 就是把分类当成了品阶
    const tones = [...crest.matchAll(/--color-([a-z-]+)-rgb/g)].map(m => m[1])
    for (const tone of tones) {
      expect(['ink', 'ink-soft'], `族徽用了非中性色 ${tone}`).toContain(tone)
    }
  })
})
