/** 典籍志审计:境界 lore 里引到书名号《》的原典,典籍表里须真有这一部,且关联该境 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLASSICS, PLANNED_SCHOOLS, classicDef, classicsForRealm } from '@/data/classics'
import { HEXAGRAMS, TRIGRAMS } from '@/data/yijing'
import { GATES } from '@/data/qimen'
import { REALMS } from '@/data/realms'

const norm = (s: string): string => s.replace(/\s+/g, '')

/** 境界出处类别 → 典籍学派(两套命名,不直接字符串比对) */
const BASIS_SCHOOL: Record<string, string> = {
  内丹: '丹道',
  佛道: '佛道',
  道教仙阶: '道教',
  网文: '网文',
  道家本源: '道家'
}

describe('典籍志 · 结构', () => {
  it('每一部典籍字段齐全,id 唯一', () => {
    expect(CLASSICS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(CLASSICS.map(c => c.id)).size).toBe(CLASSICS.length)
    for (const c of CLASSICS) {
      expect(c.title, `${c.id} 缺书名`).toBeTruthy()
      expect(c.source, `《${c.title}》缺作者/年代`).toBeTruthy()
      expect(c.gist.length, `《${c.title}》缺释义`).toBeGreaterThanOrEqual(12)
      expect(classicDef(c.id)?.title).toBe(c.title)
    }
  })

  it('典籍关联的境界 id 都真实存在', () => {
    const ids = new Set(REALMS.map(r => r.id))
    for (const c of CLASSICS) {
      for (const rid of c.realms) {
        expect(ids.has(rid), `《${c.title}》关联了不存在的境界 ${rid}`).toBe(true)
      }
    }
  })

  it('四大来路各有原典:丹道 / 道家 / 道教 / 网文', () => {
    const schools = new Set(CLASSICS.map(c => c.school))
    for (const s of ['丹道', '道家', '道教', '网文']) {
      expect(schools.has(s as never), `缺少「${s}」一脉的典籍`).toBe(true)
    }
  })
})

describe('典籍志 · 与境界 lore 双向对得上', () => {
  it('境界 lore 引到的每一部书,典籍表里都有,且确实关联该境', () => {
    for (const r of REALMS) {
      for (const m of r.lore.matchAll(/《([^》]+)》/g)) {
        const cited = norm(m[1]!)
        const hit = CLASSICS.find(c => norm(c.title) === cited)
        expect(hit, `${r.name} 的 lore 引了《${m[1]}》,典籍表里却没有这一部`).toBeDefined()
        expect(hit!.realms, `《${hit!.title}》未关联 ${r.name}(${r.id})`).toContain(r.id)
      }
    }
  })

  it('反向:典籍点名的境界,其 lore 或 basis 与之相符', () => {
    for (const c of CLASSICS) {
      for (const rid of c.realms) {
        const realm = REALMS.find(r => r.id === rid)!
        // 网文一脉不引书名
        const cites = norm(realm.lore).includes(norm(c.title))
        const sameSchool = c.school === '网文' || BASIS_SCHOOL[realm.basis] === c.school
        expect(cites || sameSchool, `《${c.title}》关联了 ${realm.name},但两者既不同源也无引用`).toBe(true)
      }
    }
  })

  it('按境界回查典籍(界域志据此展示)', () => {
    expect(classicsForRealm('yuanying').map(c => c.title)).toContain('性命圭旨')
    expect(classicsForRealm('hundundaozu').map(c => c.title)).toContain('道德经')
    expect(classicsForRealm('nope')).toEqual([])
  })
})

describe('典籍志 · 未实装门类如实标注', () => {
  it('待续清单非空,且每条都注明未实装', () => {
    // 不设下限:四门全接上后空着才对
    for (const p of PLANNED_SCHOOLS) {
      expect(p.name).toBeTruthy()
      expect(p.note, `${p.name} 未注明状态`).toContain('未实装')
    }
  })

  it('实装了就得从待续里出来:四门俱在,待续清了账', () => {
    for (const school of ['周易', '紫微', '星象', '奇门']) {
      expect(PLANNED_SCHOOLS.some(p => p.name.includes(school)), `${school}仍挂在待续`).toBe(false)
    }
    expect(PLANNED_SCHOOLS, '四门皆已实装,待续清单该是空的').toEqual([])
    expect(TRIGRAMS.length).toBe(8)
    expect(HEXAGRAMS.length).toBe(64)
    expect(GATES.length).toBe(8)
  })

  it('界域志真的把周易摊开了:八卦、六十四卦与问卦都在页面上', () => {
    const src = readFileSync(resolve(__dirname, '../views/RealmCodexView.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    // 只认用过的形态(调用/列表渲染),注释与 import 不算接线。
    // 六十四卦那栏现由 hexRows 铺(每卦画成六爻),故判据盯的是「hexRows 的来源仍是 HEXAGRAMS」。
    for (const token of ['in TRIGRAMS', 'in hexRows', 'HEXAGRAMS.map', 'askDivination(', 'DIVINATION_COST']) {
      expect(src, `界域志没有接上 ${token}`).toContain(token)
    }
  })
})

describe('界域志 · 分册', () => {
  const src = readFileSync(resolve(__dirname, '../views/RealmCodexView.vue'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  const tabIds = [...src.matchAll(/id: '(realm|classics|yi|ziwei|xiang|qimen|todo)'/g)].map(m => m[1]!)

  it('六册俱全(界域/典籍/周易/紫微/星象/奇门)', () => {
    for (const id of ['realm', 'classics', 'yi', 'ziwei', 'xiang', 'qimen']) {
      expect(tabIds, `分册缺了 ${id}`).toContain(id)
    }
  })

  it('每一册都有对应的内容段 —— 点了不会落到空白页', () => {
    for (const id of ['realm', 'classics', 'yi', 'ziwei', 'xiang', 'qimen']) {
      expect(src, `分册 ${id} 没有对应内容`).toContain(`codexTab === '${id}'`)
    }
  })

  it('六门各自的标题都在页面上(分册只是分组,不删内容)', () => {
    /*
     * 前五门用 `SectionTitle title="…"`;「界域」那一册不同 ——
     * 它的标题就是页面面包屑本身(「← 人物 · 界域志」),再放一个同名 SectionTitle
     * 会让同一屏出现两句一样的话。所以这里按「这一册叫什么」验,
     * 而不是死盯 `title="…"` 这一种写法。
     */
    for (const title of ['典籍', '周易', '紫微', '星象', '奇门']) {
      expect(src, `页面上找不到「${title}」`).toContain(`title="${title}"`)
    }
    expect(src, '界域那一册缺标题(面包屑里的那句)').toContain('>界域志<')
  })
})
