/**
 * 图鉴来源说明须与真实「收录点」对得上:判据扫源码里的 collect() 调用点,收录模块须对上说明里的路子。
 * 故障注入:把某册说明「历练掉落」改成「宗门赐下」,或把 collect('talent') 挪到别的模块,本文件红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CODEX_SOURCES } from '@/ui/codex'
import type { CollectionCategory } from '@/stores/quests'

const SRC = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/** 某类在哪些模块被 collect(相对 src/ 的路径,正斜杠) */
function collectorsOf(cat: CollectionCategory): string[] {
  const hits: string[] = []
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8')
    if (new RegExp(`collect\\(\\s*'${cat}'`).test(src)) {
      // Windows 上 join 产出 `core\loot.ts`,机制表是正斜杠,须归一
      hits.push(file.slice(SRC.length + 1).replace(/\\/g, '/'))
    }
  }
  return hits.sort()
}

/** 模块 → 说明里必须出现的字样 */
const MODULE_KEYWORD: Record<string, string> = {
  'core/loot.ts': '掉落',
  'core/gongfaService.ts': '参悟',
  'core/pillService.ts': '炼',
  'core/eventEngine.ts': '际遇',
  'core/reincarnation.ts': '转世',
  // 道侣在历练途中按地貌相遇(见 core/daoluService.candidatesFor),归「际遇」
  'core/daoluService.ts': '际遇'
}

/**
 * 每一类收藏册都要有落处:store 里初始化成空数组、sanitize 里回填。
 *
 * 加类别时最容易漏的不是 collect,而是这两处 ——
 * 漏了 store 初始化,collect 时 `collections.value[category]` 是 undefined,
 * 函数静默 return false,收录永远不生效而界面不报错。
 * 旧档更麻烦:存档里根本没有这一栏,只有 sanitize 回填才补得回来。
 *
 * 故障注入:删掉 store 里任一 `xxx: []` 或 sanitize 里的回填行,本条红。
 */
describe('图鉴 · 每类都有落处', () => {
  const STORE = readFileSync(resolve(__dirname, '../stores/quests.ts'), 'utf-8')
  const cats = Object.keys(CODEX_SOURCES)

  it('store 初始化把每一类都列出来', () => {
    for (const cat of cats) {
      expect(STORE, `store 的 collections 初始化漏了 ${cat}`).toMatch(new RegExp(`\\b${cat}:\\s*\\[\\]`))
    }
  })

  it('sanitize 把每一类都回填 —— 旧档没有这一栏', () => {
    for (const cat of cats) {
      // 用 includes 而不是正则:这段里满是 `...` 与括号,正则的转义层级容易写错
      expect(STORE, `sanitize 漏了 ${cat},旧档读进来会是 undefined`).toContain(
        `${cat}: [...new Set(asStringArray(cats.${cat}))]`
      )
    }
  })

  it('判据本身不是空转 —— 类别数对得上说明表', () => {
    expect(cats.length, '扫到的类别太少,可能 CODEX_SOURCES 被改坏了').toBeGreaterThanOrEqual(8)
  })
})

describe('图鉴 · 来源说明与收录点同源', () => {
  const CATS = Object.keys(CODEX_SOURCES) as CollectionCategory[]

  it('每一类都有来源说明,且不是空话', () => {
    for (const cat of CATS) {
      expect(CODEX_SOURCES[cat], `${cat} 没有来源说明 —— 那一册的「???」就成了死胡同`).toMatch(/^来源:/)
    }
  })

  it('说明里提的路子,就是 collect 真正发生的地方', () => {
    const problems: string[] = []
    for (const cat of CATS) {
      const collectors = collectorsOf(cat)
      if (collectors.length === 0) {
        problems.push(`${cat}: 找不到任何 collect 调用点 —— 这一类没有获取路径?`)
        continue
      }
      const known = collectors.filter(f => f in MODULE_KEYWORD)
      if (known.length === 0) {
        problems.push(`${cat}: 收录点 ${collectors.join('、')} 都不在已知机制表里,说明无从校准`)
        continue
      }
      const text = CODEX_SOURCES[cat]
      for (const file of known) {
        const keyword = MODULE_KEYWORD[file]!
        if (!text.includes(keyword)) {
          problems.push(`${cat}: 收录发生在 ${file},而说明里没提「${keyword}」——现在写的是「${text}」`)
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('反向也成立:说明里提到的机制,得有对应的收录点', () => {
    for (const cat of CATS) {
      const text = CODEX_SOURCES[cat]
      if (!text.includes('炼')) continue
      expect(
        collectorsOf(cat).includes('core/pillService.ts'),
        `${cat} 的说明说能炼出来,但没有任何炼丹收录点`
      ).toBe(true)
    }
  })
})
