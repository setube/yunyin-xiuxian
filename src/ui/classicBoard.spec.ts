/**
 * 典籍谱:按来路分谱,不再平铺成十一张同形的卡。
 *
 * 判据:
 *   一 分组只换摆法:书名、来路、相涉境界仍取 data/classics,不另立一份。
 *   二 一部书不漏、不重 —— 分组后的部数之和等于原表长度。
 *   三 来路有固定次序;数据里新出现的一脉不会被静默丢掉。
 *   四 每脉的境界数是去重后的数,不是把各书的境界数相加。
 *   五 视图按谱铺,不再自己 filter 一遍。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLASSICS } from '@/data/classics'
import { classicsAccountedFor, classicsBySchool, schoolNote } from './classicBoard'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')

describe('典籍谱 · 一、分组不另立数据', () => {
  it('每脉的书就是数据表里 school 相同的那几部,顺序不变', () => {
    for (const row of classicsBySchool()) {
      const expected = CLASSICS.filter(c => c.school === row.school).map(c => c.title)
      expect(row.books.map(b => b.title), `${row.school}的书`).toEqual(expected)
    }
  })

  it('书名与来路原样转发,不改写', () => {
    const rows = classicsBySchool()
    for (const row of rows) {
      for (const b of row.books) {
        expect(b.title).toBeTruthy()
        expect(b.school).toBe(row.school)
      }
    }
  })
})

describe('典籍谱 · 二、一部书不漏', () => {
  it('分组后的部数之和等于原表长度', () => {
    expect(classicsAccountedFor(classicsBySchool())).toBe(CLASSICS.length)
  })

  it('没有一部书被分进两脉', () => {
    const seen = classicsBySchool().flatMap(r => r.books.map(b => b.id))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('每脉至少一部 —— 不摆空行', () => {
    for (const row of classicsBySchool()) expect(row.books.length, row.school).toBeGreaterThan(0)
  })
})

describe('典籍谱 · 三、来路次序稳定', () => {
  it('按丹道 → 道家 → 道教 → 佛道 → 网文 排', () => {
    const order = classicsBySchool().map(r => r.school)
    const expected = ['丹道', '道家', '道教', '网文']
    expect(order.filter(s => expected.includes(s))).toEqual(expected)
  })

  it('佛道在固定次序里,补上后落在道教与网文之间,不甩到末尾', () => {
    // 数据里本来没有佛道;补一部进去,它该按 SCHOOL_ORDER 就位
    const rows = classicsBySchool([
      ...CLASSICS,
      { id: 'x', title: '某经', source: '今', school: '佛道', gist: '', realms: [] }
    ])
    const order = rows.map(r => r.school)
    expect(order).toContain('佛道')
    expect(order.indexOf('佛道')).toBeGreaterThan(order.indexOf('道教'))
    expect(order.indexOf('佛道')).toBeLessThan(order.indexOf('网文'))
    expect(classicsAccountedFor(rows)).toBe(CLASSICS.length + 1)
  })

  it('固定次序之外的新来路补在末尾,不被静默丢掉', () => {
    const rows = classicsBySchool([
      ...CLASSICS,
      { id: 'y', title: '杂书', source: '今', school: '杂家' as never, gist: '', realms: [] }
    ])
    expect(rows[rows.length - 1]!.school).toBe('杂家')
    expect(classicsAccountedFor(rows)).toBe(CLASSICS.length + 1)
  })

  it('空表给空谱,不抛错', () => {
    expect(classicsBySchool([])).toEqual([])
    expect(classicsAccountedFor([])).toBe(0)
  })
})

describe('典籍谱 · 四、境界数去重', () => {
  it('一脉的境界数是去重后的数,各书相涉的数相加', () => {
    // 道教一脉:性命圭旨涉 3 境、黄庭经 0 境 —— 去重才是 3
    const dao = classicsBySchool().find(r => r.school === '道教')!
    const sum = dao.books.reduce((n, b) => n + b.realms.length, 0)
    const uniq = new Set(dao.books.flatMap(b => b.realms)).size
    expect(dao.realmCount).toBe(uniq)
    expect(dao.realmCount, '不该把各书的境界数直接相加').toBeLessThanOrEqual(sum)
  })

  it('网文一脉涉六个境界 —— 去重后才对', () => {
    const web = classicsBySchool().find(r => r.school === '网文')!
    expect(web.realmCount).toBe(new Set(web.books.flatMap(b => b.realms)).size)
    expect(web.realmCount).toBe(6)
  })

  it('不涉境界的书算 0,不借别脉的数', () => {
    for (const row of classicsBySchool()) {
      if (row.books.every(b => b.realms.length === 0)) expect(row.realmCount, row.school).toBe(0)
    }
  })
})

describe('典籍谱 · 五、界面接上了', () => {
  it('模板按 classicRows 铺,不再 v-for CLASSICS', () => {
    expect(VIEW).toContain('classicRows')
    expect(VIEW).toMatch(/v-for="row in classicRows"/)
    expect(VIEW, '典籍册不该再直接列 CLASSICS').not.toMatch(/v-for="c in CLASSICS"/)
  })

  it('每脉带一句来路说明,取自同一份表', () => {
    expect(VIEW).toContain('schoolNote')
    expect(schoolNote('丹道')).toBeTruthy()
    expect(schoolNote('网文')).toBeTruthy()
  })

  it('认不出的来路给空串,不编一句假的', () => {
    expect(schoolNote('')).toBe('')
    expect(schoolNote('杂家')).toBe('')
  })
})
