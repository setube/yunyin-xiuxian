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

describe('典籍谱 · 六、境界卡与一脉计数各算一次', () => {
  /*
   * 界域卡的「所据:…」原先在模板里调三次 `classicsOf(cell.def.id)`:
   * v-if 判一次、正文 `map` 又一次(还是自己再 filter 一遍全表),21 境铺下来四十多遍扫描。
   * 典籍册的「涉 N 境 · 已过 M」同样一处调三次 `schoolSpan(row.school)`,
   * 每次都要把这一脉的书重新过滤一遍。
   *
   * 现两处都改成「一次算齐、模板只读字段」—— 判据盯的是**模板里不再有函数调用**,
   * 与既有那批「同一种算法到八遍」的修法同规(见 MortalWorldView 的 places)。
   */
  it('境界卡读预先算好的字段,不再在模板里调 classicsOf', () => {
    expect(VIEW, '境界卡该读 cell.classics').toContain('cell.classics')
    expect(VIEW, 'classicsOf 还在模板里被调 —— 每次都是一遍全表扫描').not.toContain('classicsOf(')
  })

  it('一脉的计数读预先算好的表,不再在模板里按脉过滤全表', () => {
    // 只看模板段:脚本里那张 computed 本来就要过滤一次,那是唯一该有的那一次
    const tpl = VIEW.slice(0, VIEW.indexOf('<script setup'))
    expect(tpl, '典籍册该读 schoolSpans').toContain('schoolSpans.get(row.school)')
    expect(tpl, '又把「这一脉的书」过滤挪回模板了').not.toMatch(/CLASSICS\.filter\(/)
    expect(tpl, 'schoolSpan 函数还在模板里被调 —— 一处三遍').not.toContain('schoolSpan(row.school)')
  })

  it('预计算的境界→书名串与逐次过滤的结论逐字相同', () => {
    // 复刻视图里那段 IOC:同一份 CLASSICS,按 realm 归并书名
    const map = new Map<string, string>()
    for (const c of CLASSICS) {
      for (const id of c.realms) {
        const prev = map.get(id)
        map.set(id, prev === undefined ? `《${c.title}》` : `${prev} 《${c.title}》`)
      }
    }
    const realms = [...new Set(CLASSICS.flatMap(c => c.realms))]
    // 防空转:确实有境界挂着书
    expect(realms.length).toBeGreaterThan(0)
    for (const id of realms) {
      const want = CLASSICS.filter(c => c.realms.includes(id)).map(c => `《${c.title}》`).join(' ')
      expect(map.get(id), `${id} 的所据书串与逐次过滤不一致`).toBe(want)
    }
  })
})
