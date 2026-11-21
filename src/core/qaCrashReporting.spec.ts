/**
 * QA 脚本的崩溃收口 —— 用**真进程**验,但不依赖浏览器。
 *
 * 缘起:上一轮给八份实测脚本都包了 try/catch/finally 并写了源码判据。
 * 评审(PR #626)指出那些判据有洞:留一个空的顶层 try、把主体挪到外面,断言照样全过。
 * 我先试过静态数「try 罩住了几处判据」—— 数不准:各脚本的判据多半写在辅助函数里
 * (judge / auditModal / SCENES 里的闭包),定义在 try 之外、执行在 try 之内
 * (实测 edge-states 数出 2、detail-geometry 数出 0,而这两份收尾都是对的)。
 *
 * 第一版这里起真进程跑整份脚本 —— **在 CI 上挂了**:那些脚本都要 launch 浏览器,
 * 而单测环境没装 Playwright 浏览器。单元测试不该握着一个外部二进制。
 *
 * 现在改成:从各脚本里**抽出它自己的 try/catch/finally 结构**(原样片段,
 * 只把主体换成一句必抛),在一个最小进程里跑。这样验的正是那几行收尾代码本身,
 * 与浏览器无关,也就不再受环境影响。
 *
 * 断言三件:①退出码非零(崩溃没被吞)②输出里有那条「…中途中断:…」失败
 * ③失败不是以未捕获异常的形式冒出来的(输出里没有裸的 "throw new Error")。
 */
import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

/**
 * 每份脚本:文件名与该脚本自己的中断字样。
 *
 * 抽取方式不依赖具体行号 —— 找到「顶层 try 的起始」与「配对的 finally 结束」,
 * 把那一段原样搬进临时脚本,只把 try 体替换成必抛。
 */
const CASES: Array<{ script: string; label: string }> = [
  { script: 'scripts/orb-check.mjs', label: '法球形制实测中途中断' },
  { script: 'scripts/world-check.mjs', label: '界域印实测中途中断' },
  { script: 'scripts/edge-states.mjs', label: '巡查中途中断' },
  { script: 'scripts/detail-geometry.mjs', label: '二步确认几何中途中断' },
  { script: 'scripts/offline-check.mjs', label: '离线自检中途中断' },
  { script: 'scripts/ui-smoke.mjs', label: '冒烟中途中断' },
  { script: 'scripts/modal-patrol.mjs', label: '弹窗巡逻中途中断' },
  { script: 'scripts/layout-check.mjs', label: '排版自检中途中断' },
  /*
   * 这两份原先**只有 try/finally、没有 catch**:崩了浏览器照关,但
   * `failures` 里已攒下的读数一条也打印不出来 —— 实测注入一条失败再抛错,
   * 输出里只剩堆栈。补 catch 后归入本判据。
   */
  { script: 'scripts/focus-check.mjs', label: '切页焦点自检中途中断' },
  { script: 'scripts/multitab-check.mjs', label: '两页同开自检中途中断' },
  { script: 'scripts/aria-check.mjs', label: '读屏属性自检中途中断' }
]

const TOUCHED: string[] = []
afterAll(() => {
  // KEEP_HARNESS=1 时留着生成物,方便人工看它长什么样(排查判据自身的问题时用)
  if (process.env.KEEP_HARNESS) return
  for (const p of TOUCHED) rmSync(p, { force: true })
})

/**
 * 抽出收尾结构:从顶层 `try {` 起到 finally 块结束止。
 *
 * 靠**行首标记**定位,不做花括号配平 —— 段内嵌着大量 `{}` 与对象字面量,
 * 配平一旦把 `catch (err) {` 那个 `{` 也算进去就永远对不上(第一版就是这么挂的)。
 * 各脚本的收尾形态是一致的:行首 `try {` → … → 行首 `} catch (err) {` →
 * 行首 `} finally {` → 行首 `}`。
 */
function extractCleanup(src: string): { block: string } | null {
  const lines = src.split('\n')
  const tryAt = lines.findIndex(l => /^try \{$/.test(l))
  if (tryAt < 0) return null
  const catchAt = lines.findIndex((l, i) => i > tryAt && /^\} catch \(err\) \{$/.test(l))
  if (catchAt < 0) return null
  const finallyAt = lines.findIndex((l, i) => i > catchAt && /^\} finally \{$/.test(l))
  if (finallyAt < 0) return null
  // finally 块到第一个行首 `}` 结束
  const endAt = lines.findIndex((l, i) => i > finallyAt && /^\}$/.test(l))
  if (endAt < 0) return null
  /*
   * 不采集脚本自己的声明 —— harness 会自己声明容器。
   * 采集了反而撞车:`const failures = []` 出现两次即 SyntaxError
   * (第一版就是这么全红的,而报错信息只有一句「输出里没有中断字样」)。
   */
  return { block: lines.slice(tryAt, endAt + 1).join('\n') }
}

describe('QA 脚本 · 收尾结构在中途抛错时真的会报', () => {
  for (const { script, label } of CASES) {
    it(`${script}:注入一次抛错,输出里有「${label}」`, () => {
      const src = readFileSync(resolve(ROOT, script), 'utf-8')
      const parts = extractCleanup(src)
      expect(parts, `${script} 抽不出 try/catch/finally 结构 —— 判据要跟着改名`).not.toBeNull()
      const { block } = parts!

      /*
       * 拼一个最小进程:声明的容器 + 收尾结构(主体换成必抛)+ 与真实脚本同样形态的
       * 「有失败就打印」。`browser` / `server` 换成惰性桩,免得真去 launch。
       */
      const harness = [
        'const failures = []',
        'const errors = []',
        'const browser = { close: async () => {} }',
        /*
         * server 桩要盖住两种形态:`server.close()`(offline-check)与
         * `server.httpServer.close()`(focus-check / multitab-check)。
         * 少了后者,finally 里那句会抛 TypeError,异常从 finally 冒出,
         * 看起来像「catch 没记住」—— 实测这两份就是这么假红的。
         */
        'const server = { close: (cb) => (cb ? cb() : undefined), httpServer: { close: () => {} } }',
        /*
         * 注入**之前先放一条已有失败** —— 这是评审指出的关键一步。
         *
         * 只注入 throw 再查「输出里有中断字样」是不够的:catch 完全可能
         * 在记录中断前把 failures 清空/重建(比如误写成 `failures = [...]`),
         * 那样中断照样打印,而之前查出来的全丢了 —— 正是要防的东西。
         * 所以先塞一条哨兵,断言输出里**同时**有哨兵与中断字样。
         */
        block.replace(/^try \{/m, "try {\n  failures.push('哨兵:注入前已查出的失败')\n  throw new Error('inject')"),
        /*
         * 汇总打印由 harness 提供(只打两种容器),但**退出码不在这里设**。
         *
         * 评审指出:harness 自己写一句 `process.exitCode = 1` 会把「真实脚本不再为
         * 失败设置非零退出状态」这件事遮掉 —— 脚本退化成「打印了但退出码为零」时
         * 这条照样绿。故退出码另由下面一条判据**直接查源码**;这里只负责打印,
         * 断言改成「输出里有中断字样」而非「退出码非零」。
         */
        'if (failures.length) { for (const f of failures) console.error(`  ✗ ${f}`) }',
        'if (errors.length) { for (const e of errors) console.error(`✗ ${e.where} ${String(e.msg).split(/\\s+/)[0]}`) }'
      ].join('\n')
      const tmp = resolve(ROOT, `scripts/.crash-${script.split('/').pop()!.replace('.mjs', '')}.tmp.mjs`)
      writeFileSync(tmp, harness)
      TOUCHED.push(tmp)

      /*
       * 输出**一律走 stderr 合并**。
       *
       * 这几份脚本的失败清单是 `console.error` 打的,`execFileSync` 正常返回时
       * **只给 stdout** —— 于是 harness 不设退出码时,输出读成空串,
       * 看起来像「catch 没记住」(实测就是这么假红的)。
       * 用 spawnSync 拿两路,再合并。
       */
      const run = spawnSync(process.execPath, [tmp], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 30_000
      })
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
      expect(output, `${script} 的输出里没有「${label}」—— 崩溃没被记成一条失败`).toContain(label)
      /*
       * 哨兵必须在:崩溃前已查出的那条失败不许被 catch 吞掉或覆盖。
       * ui-smoke 用 errors 容器,故哨兵也要能在那边体现 —— 它走的是同一条 push,
       * 只是字段不同,故这里只查标题文字。
       */
      expect(output, `${script} 的 catch 把先前查出的失败吞掉了 —— 只剩中断那一条`).toContain('哨兵')
      /*
       * 脚本自己必须仍为失败设非零退出码 —— 从源码直接查,不经 harness。
       * 这一条替代了原先「harness 自己设 exitCode 再看进程码」的写法:
       * 那种写法下脚本即便不再设退出码,判据也照样绿(评审指出)。
       */
      expect(
        src,
        `${script} 不再为失败设非零退出码 —— 打印了但 CI 看不到,判据等于没生效`
      ).toMatch(/process\.exitCode = 1|process\.exit\(1\)/)
      /*
       * 失败必须是「记下来的」,不是冒出去的:未捕获异常的输出里有 `throw new Error`
       * 那几行源码回显。这条同时钉住「catch 吞掉了异常但不报」的反面。
       */
      expect(output, `${script} 的异常是冒出去的,没有被 catch 记成失败`).not.toContain("throw new Error('inject')")
    })
  }
})
