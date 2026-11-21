/**
 * QA 脚本的崩溃收口 —— **真的跑一次**才算验过。
 *
 * 缘起:上一轮给八份实测脚本都包了 try/catch/finally,并写了源码判据。
 * 评审(PR #626)指出那些判据有洞:留一个空的顶层 try、把主体挪到外面,断言照样全过。
 * 我先试着用静态位置数「try 罩住了几处判据」,发现根本数不准 ——
 * 各脚本的判据多半写在辅助函数里(judge / auditModal / SCENES 里的闭包),
 * **定义在 try 之外、执行在 try 之内**(实测 edge-states 数出 2、detail-geometry 数出 0,
 * 而这两份的收尾都是对的)。
 *
 * 故改为跑一次注入:在主体开头插一句必抛的语句,起真进程跑,断言
 *   ① 退出码非零(崩溃没有被吞掉)
 *   ② 输出里有「…中途中断:…」那条失败,而不是只有一段堆栈
 * 注入只写进临时副本,仓库里的源码一个字节都不动。
 *
 * 这些脚本都要起浏览器,故阈值按「注入点在最前面」定:
 * 抛在开浏览器之前,整轮只需几秒。
 */
import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

/**
 * 每份脚本:注入锚点(主体第一句真活)与它该报出的中断字样。
 *
 * 锚点取「顶层 try 之后紧跟着的那条语句」的原文片段 —— 注入点插在它前面,
 * 保证异常确实发生在 try 之内。锚点选错时测试会因「输出里没有中断字样」而红,
 * 不会静默通过。
 */
const CASES: Array<{ script: string; anchor: string; label: string }> = [
  {
    script: 'scripts/orb-check.mjs',
    anchor: "const { page, context } = await open('/')",
    label: '法球形制实测中途中断'
  },
  {
    script: 'scripts/world-check.mjs',
    anchor: 'const { page, context } = await open(',
    label: '界域印实测中途中断'
  },
  {
    script: 'scripts/edge-states.mjs',
    anchor: 'for (const scene of SCENES) {',
    label: '巡查中途中断'
  }
]

const TOUCHED: string[] = []
afterAll(() => {
  for (const p of TOUCHED) rmSync(p, { force: true })
})

describe('QA 脚本 · 中途抛错真的会报出来', () => {
  for (const { script, anchor, label } of CASES) {
    it(`${script}:注入一次抛错,输出里有「${label}」`, () => {
      const src = readFileSync(resolve(ROOT, script), 'utf-8')
      const anchorAt = src.indexOf(anchor)
      expect(anchorAt, `${script} 找不到注入锚点 —— 判据要跟着改名`).toBeGreaterThan(-1)
      // 锚点必须在顶层 try 之内
      const tryAt = src.search(/^try \{$/m)
      expect(tryAt, `${script} 找不到顶层 try`).toBeGreaterThan(-1)
      expect(tryAt, `${script} 的锚点在 try 之外,注入验不到收尾`).toBeLessThan(anchorAt)

      const injected =
        src.slice(0, anchorAt) +
        "throw new Error('注入:模拟某处 evaluate 超时')\n" +
        src.slice(anchorAt)
      // 写到同目录,`import './lib/...'` 这类相对路径才解析得到
      const tmp = resolve(ROOT, script.replace(/\.mjs$/, '.inject.spec.mjs'))
      writeFileSync(tmp, injected)
      TOUCHED.push(tmp)

      let failed = false
      let output = ''
      try {
        output = execFileSync(process.execPath, [tmp], {
          cwd: ROOT,
          encoding: 'utf-8',
          timeout: 120_000,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      } catch (err) {
        failed = true
        const e = err as { stdout?: string; stderr?: string }
        output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`
      }
      expect(existsSync(tmp), '临时副本被清理掉了,读不到输出').toBe(true)
      /*
       * 崩溃必须被记住:退出码非零(①),且那条失败真的打印出来(②)。
       * 只断退出码不够 —— 未捕获异常也会让码非零,而那正是修之前的形态。
       */
      expect(failed, `${script} 注入抛错后竟然退出码为零 —— 异常被吞了`).toBe(true)
      expect(output, `${script} 的输出里没有「${label}」—— 崩溃没被记成一条失败`).toContain(label)
    }, 180_000)
  }
})
