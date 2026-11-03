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
 * 两类写法分开判:
 *  1. `x.slice(0, N)` —— 接收者是纯标识符,靠名字猜是不是数组(见 looksArray)。
 *  2. `x.trim().slice(0, N)` / `String(y).slice(0, N)` —— 带方法调用。**只在方法名
 *     必然返回字符串时才判**:`trim` / `toString` / `String` / `JSON.stringify`。
 *     其余调用(`recommendForRegion(x).slice(0, 2)`)返回的是数组,取前 N 项是正常写法。
 *
 * 第 2 类原先整个没扫到:构筑名在 loadoutService 里连着两处
 * `name.trim().slice(0, 8)`,守卫从头到尾是绿的。
 */
const STRING_RETURNING = new Set(['trim', 'toString', 'String', 'stringify'])
function offenders(): { file: string; line: number; code: string }[] {
  const hits: { file: string; line: number; code: string }[] = []
  const callSlice = /([A-Za-z_$][\w$.]*)\([^()]*\)\s*\.\s*(slice|substring|substr)\(0,\s*\d+\)/g
  const plainSlice = /([A-Za-z_$][\w$.]*)\.(slice|substring|substr)\(0,\s*(\d+)\)/g
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, 'utf-8').split('\n')
    lines.forEach((code, i) => {
      const hit = (): void => {
        hits.push({ file: file.slice(ROOT.length + 1), line: i + 1, code: code.trim().slice(0, 100) })
      }
      let isString = false
      for (const g of code.matchAll(callSlice)) {
        // 取最后一段方法名:`name.trim()` 要判 `trim`,不是 `name.trim`
        const callee = g[1]!.split('.').pop() ?? ''
        if (STRING_RETURNING.has(callee)) isString = true
      }
      if (isString) {
        hit()
        return
      }
      let isPlain = false
      for (const g of code.matchAll(plainSlice)) if (!looksArray(g[1]!)) isPlain = true
      if (isPlain) hit()
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

  it('建角页与构筑名的输入框都不设 maxlength(maxlength 按码元计数)', () => {
    const create = readFileSync(join(SRC, 'views/CreateView.vue'), 'utf-8')
    const input = /<input[\s\S]*?\/>/.exec(create)?.[0] ?? ''
    expect(input).toContain('道号')
    expect(input).not.toMatch(/maxlength/)

    // 构筑名同一毛病:输入框按码元砍,后面两处收敛也按码元
    const build = readFileSync(join(SRC, 'views/BuildView.vue'), 'utf-8')
    const buildInput = /<input[\s\S]*?\/>/.exec(build.slice(build.indexOf('构筑名号') - 800))?.[0] ?? ''
    expect(buildInput, '构筑名输入框没找到,守卫空转').toContain('构筑名号')
    expect(buildInput, '构筑名输入框别设 maxlength').not.toMatch(/maxlength/)
  })

  it('构筑名的两处收敛走 truncateCodePoints(带方法调用的接收者也要能扫到)', () => {
    const svc = readFileSync(join(SRC, 'core/loadoutService.ts'), 'utf-8')
    expect(svc, 'captureLoadout 与 renameLoadout 都该按码点收敛').toMatch(/truncateCodePoints\(/)
    expect(svc, '别再退回 name.trim().slice(0, 8)').not.toMatch(/\.trim\(\)\.slice\(0,\s*8\)/)
  })
})
