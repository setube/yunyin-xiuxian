/**
 * 声明即承诺:类型里写下的每种词汇(事件效果 / 选项条件 / 计数器 / 属性键),引擎必须接得住。
 * 故障注入:删掉任一 case、任一 track 写入、任一属性读取点,本文件立刻变红。
 */
import { describe, expect, it } from 'vitest'
import { COUNTER_KEYS } from '@/types'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AFFIXES } from '@/data/affixes'
import { ARTIFACTS } from '@/data/artifacts'
import { BUFFS } from '@/data/buffs'
import { GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { TALENTS } from '@/data/talents'
import { TITLES } from '@/data/titles'

const SRC = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const TYPES_SRC = readFileSync(join(SRC, 'types/index.ts'), 'utf8')

/** 取一段类型声明里的联合成员(字符串字面量) */
function unionMembers(startMarker: string, endMarker: string): string[] {
  const from = TYPES_SRC.indexOf(startMarker)
  expect(from, `types/index.ts 里找不到 ${startMarker}`).toBeGreaterThanOrEqual(0)
  const to = TYPES_SRC.indexOf(endMarker, from)
  const block = TYPES_SRC.slice(from, to > 0 ? to : undefined)
  return [...new Set([...block.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]!))]
}

/** 取判别联合里的 type 值(如 EventEffect/EventCond);只认 type: 字面量,成员内的嵌套联合不算 */
function taggedTypes(startMarker: string): string[] {
  const from = TYPES_SRC.indexOf(startMarker)
  expect(from, `types/index.ts 里找不到 ${startMarker}`).toBeGreaterThanOrEqual(0)
  // 截到声明体之后的第一个顶层 export:EventCond 与 EventEffect 相邻,否则会混入下一段的判别值
  const rest = TYPES_SRC.slice(from)
  const nextExport = rest.slice(1).search(/\nexport /)
  const block = nextExport > 0 ? rest.slice(0, nextExport + 1) : rest
  return [...new Set([...block.matchAll(/type:\s*'([A-Za-z]+)'/g)].map(m => m[1]!))]
}

/** 除数据与类型之外的全部源码(实现层) */
const implFiles = walk(SRC).filter(f => !f.includes('/data/') && !f.endsWith('types/index.ts') && !f.endsWith('.spec.ts'))
const implCorpus = implFiles.map(f => readFileSync(f, 'utf8')).join('\n')
const engineSrc = readFileSync(join(SRC, 'core/eventEngine.ts'), 'utf8')

describe('声明即承诺 · 事件词汇', () => {
  const effectTypes = taggedTypes('export type EventEffect =')
  const condTypes = taggedTypes('export type EventCond =')

  it('每种事件效果都有引擎实现(不靠兜底文案蒙混)', () => {
    expect(effectTypes.length).toBeGreaterThanOrEqual(8)
    for (const t of effectTypes) {
      expect(engineSrc, `事件效果 ${t} 没有 case`).toContain(`case '${t}'`)
    }
  })

  it('每种选项条件都有校验(不靠默认放行蒙混)', () => {
    expect(condTypes.length).toBeGreaterThanOrEqual(3)
    for (const t of condTypes) {
      expect(engineSrc, `选项条件 ${t} 没有 case`).toContain(`case '${t}'`)
    }
  })
})

describe('声明即承诺 · 计数与属性', () => {
  /*
   * 计数器键改读运行时数组:`CounterKey` 现在由 `types` 里的 `COUNTER_KEYS` 推导
   * (`typeof …[number]`),源码里不再有 `| 'key'` 那一串字面量可供抠取。
   */
  const counters: string[] = [...COUNTER_KEYS]
  const statKeys = unionMembers('export type PercentStatKey =', 'export type AnyStatKey')

  it('每个计数器都有写入方 —— 否则引用它的成就永远拿不到', () => {
    expect(counters.length).toBeGreaterThanOrEqual(10)
    /*
     * 认两种记账入口:`track()`(记账 + 当场判定)与 `trackQuiet()`(只记账,
     * 成就由批量末尾统一判)。后者是批量路径与离线结算用的那条 ——
     * 绑死 `track(` 会把「改走批量入口」误报成「没有写入方」。
     */
    const wrote = (k: string): boolean =>
      implCorpus.includes(`track('${k}'`) || implCorpus.includes(`trackQuiet('${k}'`)
    const unbacked = counters.filter(k => !wrote(k))
    expect(unbacked, `这些计数器没有任何写入点(track / trackQuiet)`).toEqual([])
  })

  it('每个属性键都有读取方 —— 否则给它的词条与天赋全是死加成', () => {
    expect(statKeys.length).toBeGreaterThanOrEqual(30)
    const unread = statKeys.filter(k => {
      const asLiteral = implCorpus.includes(`'${k}'`) || implCorpus.includes(`"${k}"`)
      const asField = new RegExp(`\\.${k}\\b`).test(implCorpus)
      return !asLiteral && !asField
    })
    expect(unread, `这些属性键无人读取(接上它,或从类型里删掉)`).toEqual([])
  })

  /**
   * 来源池 = 所有会发 StatMods 的数据表(词条 / 功法分支 / 法宝被动 / 天赋 / 称号 / buff)。
   * 故障注入:把 accuracy 的三处来源(ac1~ac3 词条、庚金剑典·破妄、周天星盘被动)删掉,这里立刻红。
   */
  it('每个属性键都拿得到 —— 否则它只是一句谁也碰不到的类型声明', () => {
    const sources = new Map<string, Set<string>>()
    const note = (key: string, where: string): void => {
      const set = sources.get(key) ?? new Set<string>()
      set.add(where)
      sources.set(key, set)
    }
    for (const a of AFFIXES) note(a.key, '装备词条')
    for (const b of GONGFA_BRANCHES) for (const k of Object.keys(b.mods)) note(k, '功法分支')
    for (const a of ARTIFACTS) for (const k of Object.keys(a.passive)) note(k, '法宝被动')
    for (const t of TALENTS) for (const k of Object.keys(t.mods)) note(k, '天赋')
    for (const t of TITLES) for (const k of Object.keys(t.mods)) note(k, '称号')
    for (const b of BUFFS) for (const k of Object.keys(b.mods)) note(k, '临时状态')

    const orphan = statKeys.filter(k => !sources.has(k))
    expect(
      orphan,
      `这些属性键没有任何来源 —— 玩家一辈子拿不到它:${orphan.join('、')}`
    ).toEqual([])
  })
})
