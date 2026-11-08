import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pageTitle } from './pageTitle'

/**
 * 每页须有且仅有一个 h1。
 *
 * 底栏五页里原先只有首页有视觉隐藏的 h1,其余十二页第一层标题直接是 h2 ——
 * 无障碍树里没有 h1,读屏用标题跳转(NVDA 的 H、VoiceOver 的转子)会落在二级标题上,
 * 页面本身没有名字。实测 inventory 的 AX 树里 heading 只有一个 level=2。
 *
 * 修法是在 App.vue 的 main 里按路由补一个 sr-only h1;自带可见 h1 的视图
 * (界域页、修仙录)不进名表,否则一页两个。
 */
describe('页面名 · 每页一个 h1', () => {
  it('名表里的每个路由名都能取出非空页面名', () => {
    // 直接扫源码取键,不给运行时模块多加一个只服务于 spec 的导出(deadExportAudit 会红)
    const src = readFileSync(resolve(__dirname, 'pageTitle.ts'), 'utf-8')
    const keys = [...src.matchAll(/^\s{2}(\w+):\s*'([^']+)'/gm)].map(m => ({ name: m[1]!, title: m[2]! }))
    expect(keys.length, '名表一个键都没扫到,判据空转').toBeGreaterThan(10)
    for (const { name, title } of keys) {
      expect(title, `${name} 的页面名为空`).not.toBe('')
      expect(pageTitle(name)).toBe(title)
    }
  })

  it('认不出的路由名返回空串,调用方据此不渲染 h1', () => {
    expect(pageTitle('welcome')).toBe('')
    expect(pageTitle('create')).toBe('')
    expect(pageTitle(undefined)).toBe('')
    expect(pageTitle(42)).toBe('')
  })

  it('自带可见 h1 的视图不进名表', () => {
    // 这两页模板里有 <h1>,再叠一个 sr-only h1 就会一页两个
    const selfTitled = ['views/MortalWorldView.vue', 'views/LegacyView.vue', 'views/WelcomeView.vue', 'views/CreateView.vue']
    const tableSrc = readFileSync(resolve(__dirname, 'pageTitle.ts'), 'utf-8')
    const names = new Set([...tableSrc.matchAll(/^\s{2}(\w+):\s*'/gm)].map(m => m[1]!))
    for (const rel of selfTitled) {
      const src = readFileSync(resolve(__dirname, '../..', 'src', rel), 'utf-8')
      expect(src, `${rel} 里没有可见 h1,白名单过期了`).toMatch(/<h1\b/)
      const routeName = rel.replace('views/', '').replace('View.vue', '').toLowerCase()
      expect(names.has(routeName), `${rel} 有自带 h1,不该进名表`).toBe(false)
    }
  })

  it('App.vue 的 main 里挂了 sr-only h1,且按路由取值', () => {
    const src = readFileSync(resolve(__dirname, '../App.vue'), 'utf-8')
    expect(src, 'main 里没有 sr-only 的 h1').toMatch(/<h1[^>]*class="sr-only"[^>]*>\{\{ pageTitle\(route\.name\) \}\}<\/h1>/)
  })

  it('视图目录里不该再有第二个硬编码页面名 h1', () => {
    // HomeView 原先自己写了一个 `sr-only` 的「洞府」,App.vue 补上之后会一页两个
    const src = readFileSync(resolve(__dirname, '../views/HomeView.vue'), 'utf-8')
    expect(src, 'HomeView 又写回了 sr-only h1,会与 App.vue 的重复').not.toMatch(/<h1[^>]*sr-only/)
  })
})
