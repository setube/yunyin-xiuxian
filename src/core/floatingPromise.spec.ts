/**
 * 浮动的 Promise:异步函数被调用却没 await / void / return,错误无人接。
 *
 * 起因:rerollMortalWorld 在凝界改分块异步时变成 async,两处调用点没跟上 ——
 * 类型检查不报错、CI 全绿,但玩家转世后落地看到「此世未成」,几秒后草忽然出来。
 * `vue-tsc -b` 抓不到这类问题(浮动 Promise 是运行时语义),而 eslint 的
 * no-floating-promises 需要 projectService,实测把 lint 从 15s 拉到 101s、check 拉到 128s ——
 * 对 CI 太贵。故用这份源码扫描兜底:只认本仓自有的 async 导出 + 几个框架调用,
 * 代价几毫秒。
 *
 * 故障注入:把任一处 `await fooAsync()` 的 await 去掉,本条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(e) && !e.endsWith('.spec.ts')) out.push(p)
  }
  return out
}

/** 本仓自有的 async 导出函数名 */
function asyncExportNames(files: string[]): Set<string> {
  const names = new Set<string>()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(m[1]!)
    }
  }
  return names
}

/**
 * 已知返回 Promise 的框架调用。
 * 故意不收 fetch 之类:本仓单机离线,不该出现。
 */
const KNOWN_PROMISE = ['router.push', 'router.replace', 'router.back', 'navigator.clipboard.writeText']

/** 前面这些记号说明这次调用已经被接住了 */
const HANDLED = /(?:await|void|return|yield)\s*$|[=(,?:!]\s*$|=>\s*$/

/** 逐行扫一次;块注释与行注释先剔掉,行号保持 */
function scanFile(path: string, asyncFns: Set<string>): string[] {
  const out: string[] = []
  // .vue 的模板注释 <!-- --> 先剔成等长空白,行号不错位
  const text = readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
  const lines = text.split('\n')
  let inBlock = false
  lines.forEach((raw, i) => {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) return
      line = line.slice(end + 2)
      inBlock = false
    }
    line = line.replace(/\/\*[\s\S]*?\*\//g, '')
    const blockStart = line.indexOf('/*')
    if (blockStart >= 0) {
      line = line.slice(0, blockStart)
      inBlock = true
    }
    line = line.replace(/\/\/.*$/, '')
    if (!line.trim()) return
    // 声明处、import 行不算调用
    if (/^\s*(export\s+)?(async\s+)?function\b/.test(line) || /\bimport\b/.test(line)) return
    const flag = (pos: number, name: string): void => {
      const before = line.slice(0, pos)
      if (HANDLED.test(before)) return
      // 字符串字面量里提到函数名(注释/文案)不算调用
      const quotes = (line.slice(0, pos).match(/'/g) ?? []).length
      if (quotes % 2 === 1) return
      out.push(`${relative(SRC, path)}:${i + 1}  ${name}  |  ${line.trim().slice(0, 70)}`)
    }
    for (const fn of asyncFns) {
      const m = new RegExp(`(?<![\\w.$])${fn}\\s*\\(`).exec(line)
      if (m) flag(m.index, fn)
    }
    for (const k of KNOWN_PROMISE) {
      const pos = line.indexOf(k)
      if (pos >= 0) flag(pos, k)
    }
  })
  return out
}

describe('浮动的 Promise', () => {
  it('给定全仓源码,当扫异步调用,则每一处都被 await / void / return 接住', () => {
    const files = walk(SRC)
    const asyncFns = asyncExportNames(files)
    expect(asyncFns.size, '没扫到任何 async 导出 —— 扫描本身失效了').toBeGreaterThan(5)
    const hits = files.flatMap(f => scanFile(f, asyncFns))
    expect(hits, '这些异步调用没被接住:await、void 或 return 掉它').toEqual([])
  })

  it('给定三种写法混在一起,当扫一遍,则只抓到没被接住的那一行', () => {
    const tmp = join(SRC, '__floating_probe.ts')
    writeFileSync(tmp, 'fooAsync()\nconst x = await fooAsync()\nvoid fooAsync()\n')
    try {
      const caught = scanFile(tmp, new Set(['fooAsync']))
      expect(caught.length, '样例里只有第一行是裸调用').toBe(1)
      expect(caught[0], '抓到的该是第一行').toContain('__floating_probe.ts:1')
    } finally {
      unlinkSync(tmp)
    }
  })
})
