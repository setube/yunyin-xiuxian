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

/**
 * `package.json` 里「先 build 再跑实测脚本」的那些命令也要带上 `--strict-dist`。
 *
 * 它们已经 `bun run build &&` 了,产物本该是新的 —— 但构建完成到脚本启动之间
 * 仍有空隙:源码在这期间被改,脚本照样会跑旧产物,而它一样不吭声。
 * 带上 `--strict-dist` 就把「我刚构建过」从假设变成受校验的断言。
 *
 * 只查「命令里既有 build、又有实测脚本」的那些;单独的 build / dev / test 不在内。
 */
describe('package.json · 实测命令要带严格档', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
    scripts: Record<string, string>
  }
  /** 实测脚本清单(与上面 READ_DIST 同源,这里取文件名判断) */
  const QA_SCRIPTS = [
    'ui-smoke.mjs',
    'focus-check.mjs',
    'aria-check.mjs',
    'multitab-check.mjs',
    'layout-check.mjs',
    'offline-check.mjs',
    'treasure-check.mjs',
    'detail-geometry.mjs',
    'modal-patrol.mjs',
    'edge-states.mjs',
    'world-check.mjs',
    'orb-check.mjs',
    /* 性能类同样读 dist:评审指出漏了它们 */
    'first-paint.mjs',
    'perf-profile.mjs'
  ]

  it('先 build 再跑实测脚本的命令都带 --strict-dist', () => {
    const bad: string[] = []
    for (const [name, body] of Object.entries(pkg.scripts)) {
      if (!body.includes('bun run build')) continue
      for (const s of QA_SCRIPTS) {
        /*
         * 按**参数**判,不按「紧跟其后」的前瞻。
         *
         * 评审指出:原先的 `(?!\s+--strict-dist)` 只认紧跟在脚本名后面的那一个 ——
         * `--stress` / `--curve` 排在前面时有效调用会被判红;而
         * `--strict-dist-typo` 这种前缀相似的又会蒙混过关。
         * `requireDist` 本身就是 `process.argv.includes('--strict-dist')`,
         * 这里照同一口径:该脚本名之后出现、且整词等于 `--strict-dist` 才算。
         */
        const at = body.indexOf(s)
        if (at < 0) continue
        const rest = body.slice(at + s.length)
        // 切到下一个命令边界(&&)为止
        const seg = rest.split('&&')[0] ?? ''
        if (!/(?:^|\s)--strict-dist(?:\s|$)/.test(seg)) bad.push(`${name} → ${s}`)
      }
    }
    expect(bad, `这些命令跑了实测脚本却没带 --strict-dist:${bad.join('、')}`).toEqual([])
  })
})
