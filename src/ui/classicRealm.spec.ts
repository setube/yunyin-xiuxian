/**
 * 典籍所指境界的位置标记。
 *
 * 典籍卡原写「相涉:筑基、金丹、元婴」—— 一串纯文字,看不出这几个境界里
 * 哪些是自己走过的、哪个正身处其中、哪些还没到。而那正是翻典籍时最先想知道的事:
 * 这本书讲的是来路,还是去路。
 *
 * 判据:
 *   一 三态判定与 ui/worldProgress 的「已过」同口径:严格低于当前才算过。
 *   二 书里记了不存在的境界 id 时给原名,不静默吞掉 —— 数据错了要看得见。
 *   三 一脉的境界并集不重复计数。
 *   四 界面接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLASSICS, type ClassicDef } from '@/data/classics'
import { REALMS } from '@/data/realms'
import { allClassicRealmIds, classicRealmMarks, realmPhase, schoolRealmSpan } from './classicRealm'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')

const classic = (realms: string[]): ClassicDef => ({
  id: 'x', title: '《某书》', source: '某', school: '丹道', gist: '', realms
})

describe('典籍境界 · 一、三态与「已过」同口径', () => {
  it('严格低于当前才算已过 —— 当前那一境不算过', () => {
    expect(realmPhase(3, 5)).toBe('past')
    expect(realmPhase(4, 5)).toBe('past')
    expect(realmPhase(5, 5)).toBe('here')
    expect(realmPhase(6, 5)).toBe('ahead')
  })

  it('第零境与当前为第零境', () => {
    expect(realmPhase(0, 0)).toBe('here')
    expect(realmPhase(0, 1)).toBe('past')
  })

  it('坏值按未至处理 —— 少承诺', () => {
    expect(realmPhase(Number.NaN, 5)).toBe('ahead')
    expect(realmPhase(3, Number.NaN)).toBe('ahead')
  })

  it('与 worldProgress 的已过口径一致(严格低于当前)', () => {
    const wp = readFileSync(resolve(ROOT, 'src/ui/worldProgress.ts'), 'utf-8')
    expect(wp, 'worldProgress 的已过口径变了,本层要跟着改').toContain('严格低于当前境界')
  })
})

describe('典籍境界 · 二、数据错了要看得见', () => {
  it('记了不存在的境界 id 时给原名,不吞成空', () => {
    const marks = classicRealmMarks(classic(['zhuji', 'not_a_realm']), 0)
    expect(marks).toHaveLength(2)
    expect(marks[1]!.name).toBe('not_a_realm')
    expect(marks[1]!.phase).toBe('ahead')
  })

  it('真境界给境界名', () => {
    const marks = classicRealmMarks(classic(['zhuji']), 0)
    const idx = REALMS.findIndex(r => r.id === 'zhuji')
    expect(marks[0]!.name).toBe(REALMS[idx]!.name)
    expect(marks[0]!.phase).toBe('ahead')
  })

  it('空 realms 给空表,不抛错', () => {
    expect(classicRealmMarks(classic([]), 3)).toEqual([])
  })
})

describe('典籍境界 · 三、一脉的并集不重复计数', () => {
  it('两部书都点筑基,并集只算一个', () => {
    const span = schoolRealmSpan([classic(['zhuji']), classic(['zhuji', 'jindan'])], 0)
    expect(span.total).toBe(2)
  })

  it('已过数只数严格低于当前的', () => {
    // 当前 major=1(第二境):第 0 境已过、第 1 境是当前
    const span = schoolRealmSpan([classic([REALMS[0]!.id, REALMS[1]!.id])], 1)
    expect(span.total).toBe(2)
    expect(span.past).toBe(1)
  })

  it('全书所有境界 id 都可解析', () => {
    const bad = allClassicRealmIds().filter(id => !REALMS.some(r => r.id === id))
    expect(bad, `这些境界 id 在 REALMS 里不存在:${bad.join('、')}`).toEqual([])
  })

  it('CLASSICS 非空,判据没在空表上空转', () => {
    expect(CLASSICS.length).toBeGreaterThan(5)
  })
})

describe('典籍境界 · 四、界面接上了', () => {
  it('典籍卡按位置给三种字色,不再一串纯文字', () => {
    expect(VIEW).toContain('classicRealmMarks')
    expect(VIEW, '该按位置挂类').toContain('classic-realm')
  })

  it('流派卡报出「涉几境、其中几个已过」', () => {
    expect(VIEW).toContain('schoolRealmSpan')
    expect(VIEW, '该报已过数').toContain('past')
  })

  it('已过比未至淡 —— 翻典籍时想知道的是去路,不是来路', () => {
    // 三态各有自己的色;方向若反了,「已过的最抢眼」会读错
    const css = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
    const block = (sel: string): string =>
      new RegExp(`\\n${sel.replace('.', '\\.')} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? ''
    const past = block('.classic-realm--past')
    const ahead = block('.classic-realm--ahead')
    expect(past, '缺已过那一态的样式').not.toBe('')
    expect(ahead, '缺未至那一态的样式').not.toBe('')
    // 已过取 ink-faint、未至取 ink-soft:前者更淡
    expect(past, '已过该比未至淡').toContain('color-ink-faint-rgb')
    expect(ahead, '未至该比已过清楚').toContain('color-ink-soft-rgb')
  })

  it('位置判定不另写一套,取 ui/classicRealm', () => {
    expect(VIEW).toContain("from '@/ui/classicRealm'")
  })
})
