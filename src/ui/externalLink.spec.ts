import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 外部链接一律 `target="_blank"` 配 `rel="noopener noreferrer"`。
 *
 * `noopener` 挡住新页面通过 `window.opener` 反向操纵本页(钓鱼、跳转);
 * `noreferrer` 顺带不把本页 URL 发过去。两者在桌面壳(Electron)里尤其要紧 ——
 * 那里新窗口与本页同属一个进程树。
 *
 * 本项目只有两处应用内外链(关于 / 隐私)与四个静态页外链,数量少,但一旦有人
 * 照着写第三个、忘了 rel,就没有东西会报警。
 */
const ROOTS = ['src/components', 'src/views']
const STATIC_FILES = ['public/privacy.html']

function vueFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name.endsWith('.vue')) out.push(full.replace(/\\/g, '/'))
    }
  }
  for (const r of ROOTS) walk(resolve(__dirname, '../..', r))
  return out
}

describe('外部链接 · 新窗口须带 rel', () => {
  it('每个 target="_blank" 都配了 noopener 与 noreferrer', () => {
    const bad: string[] = []
    const files = [...vueFiles(), ...STATIC_FILES.map(f => resolve(__dirname, '../..', f).replace(/\\/g, '/'))]
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      // 逐个 <a ...> 开标签看
      for (const m of src.matchAll(/<a\b[^>]*>/g)) {
        const tag = m[0]
        if (!/target="_blank"/.test(tag)) continue
        const rel = /\brel="([^"]*)"/.exec(tag)?.[1] ?? ''
        if (!/\bnoopener\b/.test(rel) || !/\bnoreferrer\b/.test(rel)) {
          bad.push(`${f.replace(/.*\//, '')}: ${tag.replace(/\s+/g, ' ').slice(0, 70)}`)
        }
      }
    }
    expect(bad, `这些外链没配齐 noopener / noreferrer:\n${bad.join('\n')}`).toEqual([])
  })

  it('至少扫到一个外链,判据没空转', () => {
    let count = 0
    for (const f of vueFiles()) count += (readFileSync(f, 'utf-8').match(/target="_blank"/g) ?? []).length
    count += (readFileSync(resolve(__dirname, '../..', 'public/privacy.html'), 'utf-8').match(/target="_blank"/g) ?? []).length
    expect(count, '一个 target="_blank" 都没扫到 —— 判据空转').toBeGreaterThan(0)
  })
})
