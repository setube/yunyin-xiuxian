/**
 * 每一份读 `dist/` 的实测脚本都要先问一句「产物是不是当前源码构建的」。
 *
 * 这些脚本量的是**构建产物**,不是源码。改了 `src/` 却没重新 build 时,
 * 它们量到的是旧代码,而读数看起来完全正常 —— 那比报错更糟:
 * 实测过,同一个 session 里拿旧产物的读数下了结论,方向整个是错的。
 *
 * 原先只有 aria-check / focus-check / multitab-check 三份做了这道闸,
 * 另外九份直接读 dist、一句也不问。
 *
 * 故障注入:删掉任一脚本里的 `requireDist`,对应那条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const SCRIPTS = resolve(__dirname, '../../scripts')

/** 所有会读 dist 的实测脚本 */
const READ_DIST = readdirSync(SCRIPTS)
  .filter(n => n.endsWith('.mjs'))
  .filter(n => {
    const src = readFileSync(resolve(SCRIPTS, n), 'utf-8')
    // 读 dist/index.html、或对 dist/ 起 preview、或从 dist 里读 CSS
    return /dist\/index\.html|preview\(\{[^}]*dist|resolve\(ROOT, 'dist|join\(ROOT, 'dist/.test(src)
  })
  .sort()

describe('实测脚本 · 读 dist 前先问产物是否新鲜', () => {
  it('扫到的脚本数对得上(不是空转)', () => {
    /*
     * 实测这九份直接读 dist(aria-check / focus-check / multitab-check 走的是
     * preview 服务器,不匹配这个正则,但它们早就有这道闸)。
     * 下限定 9:少一份说明正则漏了,那这条判据就白写了。
     */
    expect(READ_DIST.length, '读 dist 的脚本扫到太少 —— 判据要跟着改名').toBeGreaterThanOrEqual(9)
  })

  for (const name of READ_DIST) {
    it(`${name}:调了 requireDist`, () => {
      const src = readFileSync(resolve(SCRIPTS, name), 'utf-8')
      expect(src, `${name} 读 dist 却不问产物是否过期 —— 改了源码没重建时它会量旧代码`).toContain(
        'requireDist('
      )
      expect(src, `${name} 调了 requireDist 却不看返回值 —— 缺产物时会继续跑`).toMatch(
        /if \(!requireDist\([^)]*\)\) process\.exit\(1\)/
      )
    })
  }
})
