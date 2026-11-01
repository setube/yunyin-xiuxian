/**
 * 持久化 store 里那些嵌套结构的接口，每个字段都得在 sanitize 里被处理过。
 *
 * 152~155 轮审出三个同形缺陷，全是「字段存在、类型也对、就是没人管值」：
 * resources.spiritStone 不限指数、虚界与凡人界的 world.rules 内部字段原样收下。
 * 155 轮的 nestedShapeGuard 用的是「typeof object 之后 600 字符内有无守卫」这个粗判据，
 * 已知会漏——它只看得到整块被原样拷贝的形态，看不出「漏了某一个字段」。
 *
 * 本条是精确版：从 export interface X { ... } 抽出字段名，
 * 再逐个到对应的 sanitize 函数体里找。找不到就报——不是要求每个字段都有校验，
 * 而是要求它至少在修形代码里被提到，好让人一眼看见「这个字段我处理过了」。
 *
 * 只收真正从存档读出来的那几个接口；ui.ts 的四个是运行时临时状态，不持久化，不收。
 *
 * 已知局限：判据是「字段名在函数体里出现过」，不判校验强度。
 * 实测把 savedAt: asFiniteNumber(l.savedAt, 0, 0) 改成 savedAt: 0 仍算通过（键名还在），
 * 只有整行删掉才会红。这是有意的取舍：校验强度各字段差别太大（有的夹区间、有的原样保留），
 * 写死规则会逼人给正常代码打补丁；而「字段被整个忘掉」才是 152~155 轮那三个缺陷的形态。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/** 从源码里切出一个函数的完整函数体（按大括号配对） */
function bodyOf(text: string, marker: string): string {
  const start = text.indexOf(marker)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ''
}

/** 抽 interface 的顶层字段名 */
function fieldsOf(text: string, iface: string): string[] {
  const m = new RegExp(`${iface} \\{([\\s\\S]*?)\\n\\}`).exec(text)
  if (!m) return []
  return [...m[1]!.matchAll(/^\s{2}(\w+)\??:/gm)].map(x => x[1]!)
}

interface Case {
  file: string
  iface: string
  /** 到哪个函数里找这些字段名；省略则查整个文件 */
  marker: string | null
}

const CASES: readonly Case[] = [
  { file: 'src/stores/endgame.ts', iface: 'export interface WorldRunState', marker: '    function sanitize(): void {' },
  { file: 'src/stores/adventure.ts', iface: 'export interface LastBattleView', marker: null },
  { file: 'src/stores/loadouts.ts', iface: 'export interface Loadout', marker: '    function sanitize(): void {' },
  { file: 'src/stores/pacingTelemetry.ts', iface: 'export interface InteractionEvent', marker: null }
]

describe('嵌套存档接口 · 每个字段都要在修形代码里出现', () => {
  it('四个接口都抽到了字段（防空转）', () => {
    for (const c of CASES) {
      const n = fieldsOf(readFileSync(c.file, 'utf-8'), c.iface).length
      expect(n, `${c.iface} 一个字段都没抽到，判据失效`).toBeGreaterThan(3)
    }
  })

  it.each(CASES)('$iface 的每个字段都被修形代码提到过', c => {
    const text = readFileSync(c.file, 'utf-8')
    const fields = fieldsOf(text, c.iface)
    const scope = c.marker ? bodyOf(text, c.marker) : text
    expect(scope, `${c.file} 里找不到 ${c.marker}`).not.toBe('')
    const missing = fields.filter(f => !scope.includes(f))
    expect(missing, `${c.iface} 这些字段在修形里没出现:\n  ${missing.join(', ')}`).toEqual([])
  })
})
