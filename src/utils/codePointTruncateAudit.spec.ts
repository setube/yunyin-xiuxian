/**
 * 全仓审计:字符串不许按码元截。
 *
 * 这条坑踩过三次:存档形状(第 262 轮)、建角页输入(第 302 轮)、
 * 以及同一个 store 里的 `sanitize()` —— 后者是读旧档时的自愈路径,
 * 最容易被漏掉:界面已经按码点钳过了,自愈却把它再劈一次。
 *
 * `.slice(0, N)` 用在**字符串**上就会把 emoji 切成孤立代理项;
 * 用在数组上是正常的取前 N 项,不该误报。所以判据按「接收者名字」区分。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = join(ROOT, 'src')

/**
 * 看起来是数组的接收者:这些按码元截是正常的。
 *
 * 要**整词**匹配,不能只含 `name` 就算 —— `createName` / `userName` 正是字符串,
 * 放进来会让判据自己失效(实测过:把 sanitize 改回 slice,主判据竟不红)。
 */
const ARRAYISH = new Set([
  'names', 'list', 'arr', 'rows', 'row', 'items', 'item', 'entries', 'shallow', 'ranked',
  'reasons', 'candidates', 'subGongfa', 'errors', 'owned', 'equip', 'loadouts', 'tabs',
  'deltas', 'risks', 'rates', 'chips', 'stars', 'results', 'cells', 'lines', 'parts'
])
/** 取接收者最后一段(`a.b.c` 取 `c`),按整词判是不是数组 */
function looksArray(recv: string): boolean {
  const tail = recv.split('.').pop() ?? recv
  const bare = tail.replace(/^\$/, '')
  if (ARRAYISH.has(bare)) return true
  if (ARRAYISH.has(bare.replace(/[._-]/g, ''))) return true
  return false
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.spec.ts')) out.push(p)
  }
  return out
}

/**
 * 找出「对字符串按码元截」的地方。
 *
 * 只看 `.slice(0, 数字)` / `.substring(0, 数字)` / `.substr(0, 数字)`,
 * 且接收者不是明显的数组名。`slice(0, -1)` 这类负数是剥尾字符,不算。
 */
function offenders(): { file: string; line: number; code: string }[] {
  const hits: { file: string; line: number; code: string }[] = []
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, 'utf-8').split('\n')
    lines.forEach((code, i) => {
      const m = /([A-Za-z_$][\w$.]*)\.(slice|substring|substr)\(0,\s*(\d+)\)/g
      let g: RegExpExecArray | null
      while ((g = m.exec(code)) !== null) {
        const recv = g[1]!
        if (looksArray(recv)) continue
        hits.push({ file: file.slice(ROOT.length + 1), line: i + 1, code: code.trim().slice(0, 100) })
      }
    })
  }
  return hits
}

describe('全仓 · 字符串不许按码元截', () => {
  it('没有一处对字符串用 slice(0, N) / substring / substr', () => {
    const bad = offenders()
    const msg = bad.map(b => `${b.file}:${b.line}  ${b.code}`).join('\n')
    expect(bad, `按码元截会把 emoji 切成半个,请改用 truncateCodePoints:\n${msg}`).toEqual([])
  })

  it('判据本身有效:已知的两个调用点确实走的是 truncateCodePoints', () => {
    const game = readFileSync(join(SRC, 'stores/game.ts'), 'utf-8')
    // sanitize 与 setCreateName 两处都必须按码点
    expect(game.match(/truncateCodePoints\([^)]*,\s*8\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(game, 'sanitize 里别再退回 slice').not.toMatch(/createName\.value\.slice\(0,\s*8\)/)
  })

  it('建角页的输入框不设 maxlength(maxlength 按码元计数)', () => {
    const create = readFileSync(join(SRC, 'views/CreateView.vue'), 'utf-8')
    const input = /<input[\s\S]*?\/>/.exec(create)?.[0] ?? ''
    expect(input).toContain('道号')
    expect(input).not.toMatch(/maxlength/)
  })
})
