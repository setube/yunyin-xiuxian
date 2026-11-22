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
    /*
     * 引号两种都要认。
     *
     * 评审指出:`perf-profile.mjs` / `first-paint.mjs` 里写的是
     * `join(ROOT, "dist")`(双引号),原先只认单引号,于是这两份漏在判据之外 ——
     * 而它们同样读 dist、同样会在过期产物上给出误导性读数。
     */
    return /dist\/index\.html|preview\(\{[^}]*dist|resolve\(ROOT,\s*['"]dist|join\(ROOT,\s*['"]dist/.test(src)
  })
  .sort()

describe('实测脚本 · 读 dist 前先问产物是否新鲜', () => {
  it('扫到的脚本数对得上(不是空转)', () => {
    /*
     * 下限定按实际扫到的数走。原先定 9,加上 perf-profile / first-paint
     * (双引号写法,评审指出的漏网)之后是 11。
     * 少一份说明正则漏了,那这条判据就白写了。
     */
    expect(READ_DIST.length, '读 dist 的脚本扫到太少 —— 判据要跟着改名').toBeGreaterThanOrEqual(11)
  })

  /*
   * 走 vite preview 的三份也一并管。
   *
   * 评审指出:它们靠 preview 的默认 root 读 dist,不匹配路径正则 ——
   * 从其中任一份删掉守卫,这条判据照样绿,「全脚本都有闸」就是空话。
   */
  const PREVIEW_BASED = ['aria-check.mjs', 'focus-check.mjs', 'multitab-check.mjs']
  for (const name of PREVIEW_BASED) {
    it(`${name}(preview 型)也有 requireDist 闸`, () => {
      const src = readFileSync(resolve(SCRIPTS, name), 'utf-8')
      expect(src, `${name} 没有 requireDist —— preview 读的是默认 dist,同样会量到旧产物`).toMatch(
        /if \(!requireDist\([^)]*\)\) process\.exit\(1\)/
      )
    })
  }

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

/**
 * 守卫必须**在读取 dist 或开始测量之前**执行。
 *
 * 评审指出:原先只断言「源码里有那句 `if (!requireDist(…))`」——
 * 把它挪到脚本末尾(测量跑完之后)照样能过,而过期产物的结果已经被采信了。
 *
 * 判据:守卫的位置必须早于该脚本里第一处「真正用到 dist」的语句。
 * 「用到 dist」= 拼 dist 路径(join/resolve + 'dist')、或对它起 preview/读文件。
 */
describe('实测脚本 · 守卫要早于用 dist', () => {
  const fs = readdirSync(SCRIPTS).filter(n => n.endsWith('.mjs'))
  const usesDist = (src: string): number =>
    src.search(/dist\/index\.html|resolve\(ROOT,\s*['"]dist|join\(ROOT,\s*['"]dist|preview\(\{/)

  for (const name of fs.slice().sort()) {
    const src = readFileSync(resolve(SCRIPTS, name), 'utf-8')
    const guardAt = src.search(/if \(!requireDist\(/)
    if (guardAt < 0) continue
    const distAt = usesDist(src)
    if (distAt < 0) continue
    it(`${name}:守卫在用到 dist 之前`, () => {
      expect(
        guardAt,
        `${name} 的 requireDist 排在用 dist 之后 —— 那时过期产物已经被采信了`
      ).toBeLessThan(distAt)
    })
  }
})
