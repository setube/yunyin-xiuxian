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
import { execFileSync } from 'node:child_process'
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
  { script: 'scripts/layout-check.mjs', label: '排版自检中途中断' }
]

const TOUCHED: string[] = []
afterAll(() => {
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
        'const server = { close: (cb) => (cb ? cb() : undefined) }',
        block.replace(/^try \{/m, "try {\n  throw new Error('inject')"),
        /*
         * 真实脚本里汇总打印在 finally 之后,这里照同样形态补上。
         * 两种容器都打:ui-smoke 记在 `errors`(带 where 的对象),其余记在 `failures`。
         * 只打一种会让 ui-smoke 那条假红。
         */
        'if (failures.length) { for (const f of failures) console.error(`  ✗ ${f}`); process.exitCode = 1 }',
        'if (errors.length) { for (const e of errors) console.error(`✗ ${e.where}\n   ${String(e.msg).split("\\n")[0]}`); process.exitCode = 1 }'
      ].join('\n')
      const tmp = resolve(ROOT, `scripts/.crash-${script.split('/').pop()!.replace('.mjs', '')}.tmp.mjs`)
      writeFileSync(tmp, harness)
      TOUCHED.push(tmp)

      let failed = false
      let output = ''
      try {
        output = execFileSync(process.execPath, [tmp], {
          cwd: ROOT,
          encoding: 'utf-8',
          timeout: 30_000,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      } catch (err) {
        failed = true
        const e = err as { stdout?: string; stderr?: string }
        output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`
      }
      expect(failed, `${script} 的收尾没拦住抛错 —— 进程竟然正常退出`).toBe(true)
      expect(output, `${script} 的输出里没有「${label}」—— 崩溃没被记成一条失败`).toContain(label)
      /*
       * 失败必须是「记下来的」,不是冒出去的:未捕获异常的输出里有 `throw new Error`
       * 那几行源码回显。这条同时钉住「catch 吞掉了异常但不报」的反面。
       */
      expect(output, `${script} 的异常是冒出去的,没有被 catch 记成失败`).not.toContain("throw new Error('inject')")
    })
  }
})
