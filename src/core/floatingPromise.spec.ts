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
import { readFileSync, readdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

  /**
   * 样例写进**系统临时目录**,不写进 src/。
   *
   * 原先写的是 `src/core/__floating_probe.ts`,跑完再 unlink。单跑没事,
   * 但 vitest 同进程并行跑别的 spec 时,有多个 spec 会**遍历 src/** 逐文件读
   * (palette.spec 扫色名、本文件自己也 walk 一遍)。谁在这一瞬间路过就会读到它,
   * 而它下一刻已被删掉 —— 实测复现 `ENOENT ... __floating_probe.ts`,
   * 表现是 palette.spec 偶发一条失败(十二轮里中一次,重跑就绿),看起来像天气。
   * 临时目录里的文件不在任何 spec 的扫描范围内,这个窗口就不存在了。
   *
   * 断言只认 basename + 行号(`__floating_probe.ts:1`),故换到哪个目录都不受影响。
   */
  it('给定三种写法混在一起,当扫一遍,则只抓到没被接住的那一行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yunyin-floating-'))
    const tmp = join(dir, '__floating_probe.ts')
    writeFileSync(tmp, 'fooAsync()\nconst x = await fooAsync()\nvoid fooAsync()\n')
    try {
      const caught = scanFile(tmp, new Set(['fooAsync']))
      expect(caught.length, '样例里只有第一行是裸调用').toBe(1)
      expect(caught[0], '抓到的该是第一行').toContain('__floating_probe.ts:1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * 不许有 spec 往 `src/` 里写文件。
 *
 * 这条不是洁癖:同进程并行时,别的 spec 正在**遍历 src/** 逐文件读
 * (palette.spec 扫色名、本文件上面的全仓扫描、dataTextAudit 扫文案都是这一类)。
 * 写进去的临时文件会被谁在那一刻读到,下一刻又被删掉 —— 读的那一方拿到 ENOENT,
 * 表现为一条无关的、跑一次就绿的偶发失败。实测就是本文件原先的 `__floating_probe.ts`:
 * 十二轮全量里中一次,报的是 palette.spec「源码里引用的色名…」而不是这里。
 *
 * 判据只认「写进 src/ 常量路径」这一种形状:mkdir/mkdtemp 到系统临时目录不算。
 * 故障注入:把上面那条样例改回 `join(SRC, '__floating_probe.ts')` → 红。
 */
describe('测试卫生 · 不在源码树里落临时文件', () => {
  it('给定全部 spec,当扫写文件调用,则没有一处写进 src/', () => {
    const specs: string[] = []
    const collect = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name)
        if (entry.isDirectory()) collect(path)
        else if (entry.name.endsWith('.spec.ts')) specs.push(path)
      }
    }
    collect(SRC)
    expect(specs.length, '一个 spec 都没扫到,判据空转').toBeGreaterThan(100)

    const offenders: string[] = []
    for (const spec of specs) {
      /*
       * 先把注释抹掉再扫 —— 注释里讲解这条判据时会照抄 `const tmp = join(SRC, '__probe.ts')`,
       * 不剥的话判据会把自己讲道理的那段话当成违规(实测第一版就是这样自报的)。
       */
      const text = readFileSync(spec, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      /*
       * 两步认:先认出「指向 src/ 的路径变量」,再看写文件调用用的是不是它们。
       *
       * 只看第一段实参里有没有 `SRC` 是不够的 —— 真实写法都是先
       * `const tmp = join(SRC, '__probe.ts')` 再 `writeFileSync(tmp, …)`,
       * 到调用点只剩一个变量名。第一版就是这么漏的:把样例改回原来的写法照样绿。
       */
      const srcVars = new Set<string>()
      for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n]+)/g)) {
        const init = m[2]!
        if (/\b(?:join|resolve)\(\s*SRC\b/.test(init) || /^SRC\b/.test(init.trim())) srcVars.add(m[1]!)
      }
      for (const m of text.matchAll(/\b(?:writeFileSync|appendFileSync|copyFileSync|renameSync|mkdirSync)\(\s*([^,\n]+)/g)) {
        const target = m[1]!.trim()
        // 注释里提到这些函数名不算
        const lineStart = text.lastIndexOf('\n', m.index) + 1
        if (/^\s*(\*|\/\/)/.test(text.slice(lineStart, m.index))) continue
        const bare = target.replace(/[^A-Za-z0-9_$]/g, '')
        if (/\b(?:join|resolve)\(\s*SRC\b/.test(target) || srcVars.has(bare) || target.includes("'../")) {
          offenders.push(`${relative(SRC, spec)} → ${m[0].slice(0, 60)}`)
        }
      }
    }
    expect(offenders, '这些 spec 往 src/ 里写了文件 —— 并行跑的别的 spec 会读到半截').toEqual([])
  })
})
