/**
 * 四份 QA 脚本的页面清单必须与真实路由表一致。
 *
 * `ui-smoke` / `focus-check` / `aria-check` / `layout-check` 各写一份 `ROUTES`。
 * 当前四份都是 17 页且彼此一致,**但没有任何判据盯着这件事** ——
 * 加一个路由时漏改一处,那一页就在某个脚本里静默不被扫,而其余三个照旧绿。
 * 这种失效没有报错:少扫一页看起来和「那页没问题」完全一样。
 *
 * 为什么是 17 而不是路由表里的 19:
 * `/welcome` 与 `/create` 被路由守卫 `if (game.started) return { name: 'home' }`
 * 弹回首页,只有不带存档的上下文进得去 —— 那两份清单铺的都是后期档,
 * 放进去只会白跑。它们另有覆盖(`edge-states` 的首启两页 + `focus-check` 刚补的那段)。
 *
 * 判据反过来推:从 `src/router/index.ts` 抽出全部真实路径,
 * 扣掉首启两页,剩下的必须与每份清单**逐项相等**。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

/** 路由表里的非通配路径 */
function realRoutes(): string[] {
  const src = readFileSync(resolve(ROOT, 'src/router/index.ts'), 'utf-8')
  const paths = [...src.matchAll(/path: '(\/[^']*)'/g)]
    .map(m => m[1]!)
    // 通配兜底 `/:pathMatch(.*)*` 不是一页
    .filter(p => !p.includes(':'))
  return [...new Set(paths)]
}

/** 某脚本里 `const ROUTES = [...]` 的条目 */
function scriptRoutes(file: string): string[] {
  const src = readFileSync(resolve(ROOT, 'scripts', file), 'utf-8')
  const at = src.indexOf('const ROUTES = [')
  expect(at, `${file} 里找不到 const ROUTES = [`).toBeGreaterThan(-1)
  const end = src.indexOf(']', at)
  expect(end, `${file} 的 ROUTES 没有收尾`).toBeGreaterThan(at)
  const block = src.slice(at, end)
  return [...new Set([...block.matchAll(/'(\/[a-z]*)'/g)].map(m => m[1]!))]
}

/** 只有不带存档才进得去的两页 */
const FIRST_RUN_ONLY = ['/welcome', '/create']

describe('QA 脚本的页面清单与路由表一致', () => {
  const real = realRoutes()
  /** 铺存档的脚本该扫的页 */
  const expected = real.filter(p => !FIRST_RUN_ONLY.includes(p)).sort()

  it('路由表本身读得出东西', () => {
    expect(real.length, '路由表一条路径都没读到 —— 判据要跟着改名').toBeGreaterThan(15)
    expect(real, '路由表里应有首启两页').toEqual(expect.arrayContaining(FIRST_RUN_ONLY))
  })

  it.each([
    ['ui-smoke.mjs'],
    ['focus-check.mjs'],
    ['aria-check.mjs'],
    ['layout-check.mjs']
  ])('%s 覆盖的正是「路由表减去首启两页」', file => {
    const mine = scriptRoutes(file).sort()
    const missing = expected.filter(p => !mine.includes(p))
    const extra = mine.filter(p => !expected.includes(p))
    expect(missing, `${file} 漏了这些页,它们在该脚本里永远不会被扫:${missing.join(', ')}`).toEqual([])
    expect(extra, `${file} 里有路由表没有的页:${extra.join(', ')}`).toEqual([])
  })

  it('四份清单彼此一致', () => {
    const lists = ['ui-smoke.mjs', 'focus-check.mjs', 'aria-check.mjs', 'layout-check.mjs'].map(f => ({
      file: f,
      routes: scriptRoutes(f).sort()
    }))
    const base = lists[0]!
    for (const l of lists.slice(1)) {
      expect(l.routes, `${l.file} 与 ${base.file} 的清单不一致`).toEqual(base.routes)
    }
  })
})

/**
 * 脚本里提到的每条路径都必须是真实路由。
 *
 * `edge-states` 的「单字段畸形走遍主路由」那档清单里曾写着 `/endgame` ——
 * 路由表没有这条,通配兜底 `/:pathMatch(.*)*` 把它重定向到 `/`,
 * 于是**首页被扫了两遍**,而那一项读起来像在扫一个终局页。
 * 这种错没有任何报错:清单少一项、多一项,脚本都照旧绿。
 *
 * 判据:把各脚本里形如 `'/xxx'` 的字面量全取出来,逐个核 route 表。
 * 只认「单段小写路径」,避开 `/cultivation?x=1` 之类带查询的与文件路径。
 */
describe('QA 脚本提到的路径都得是真实路由', () => {
  const REAL = new Set(realRoutes())

  it.each([
    ['edge-states.mjs'],
    ['ui-smoke.mjs'],
    ['focus-check.mjs'],
    ['aria-check.mjs'],
    ['layout-check.mjs'],
    ['detail-geometry.mjs']
  ])('%s 里没有不存在的路由', file => {
    const src = readFileSync(resolve(ROOT, 'scripts', file), 'utf-8')
    const phantom = [...new Set([...src.matchAll(/'(\/[a-z]+)'/g)].map(m => m[1]!))]
      .filter(p => !REAL.has(p))
    expect(phantom, `${file} 里这些路径不是真实路由,会被通配兜底重定向到首页:${phantom.join(', ')}`).toEqual([])
  })
})
