/**
 * 变异扫描:找出「改坏了也没测试报」的守卫。
 *
 * 为什么要有这一份:测试全绿只证明当前状态没坏,不能证明判据有牙。
 * 把某处守卫改成恒假再跑它的 spec —— 会红说明有人盯着,不会红说明是盲区。
 *
 * 只做**语义明确的单点变异**,不碰语法结构:
 *   - `if (X) return`        → `if (false) return`
 *   - `Math.max(A, B)`       → `(B)`
 *   - `.length === 0`        → `.length < 0`
 * 每处变异后跑对应 spec,再原样写回(失败也写回)。
 *
 * 用法:node scripts/mutation-scan.mjs [--limit N]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 40)

const PATTERNS = [
  { name: '守卫恒假', re: /if \((![A-Za-z_$][\w$.]*(?:\([^)]*\))?)\) return/g, rep: 'if (false) return' },
  { name: '钳制下限', re: /Math\.max\(0(?:\.\d+)?,\s*([^;()]+(?:\([^)]*\))?[^;()]*)\)/g, rep: '$1' },
  { name: '空判取反', re: /\.length === 0\)/g, rep: '.length < 0)' }
]

function targets(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) targets(p, out)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p)
  }
  return out
}

const files = targets(join(ROOT, 'src/core')).concat(targets(join(ROOT, 'src/stores'))).concat(targets(join(ROOT, 'src/utils')))
const found = []

for (const file of files) {
  const spec = file.replace(/\.ts$/, '.spec.ts')
  let specSrc
  try { specSrc = readFileSync(spec, 'utf-8') } catch { continue }
  const src = readFileSync(file, 'utf-8')
  for (const { name, re, rep } of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split('\n').length
      found.push({ file, spec, name, index: m.index, line, text: m[0], mutated: m[0].replace(re, rep) })
      if (found.length >= LIMIT) break
    }
    if (found.length >= LIMIT) break
  }
  if (found.length >= LIMIT) break
}

console.log(`扫到 ${found.length} 个可变异点(上限 ${LIMIT})`)

/**
 * 跑一次被变异文件的 spec。
 *
 * 退出码不能直接当「抓到了」用:启动失败、语法错误、setup 崩掉都会非零退出,
 * 把设施故障记成「这条守卫有牙」等于给自己发一张假绿灯。故按 vitest 的 JSON
 * 报告区分三态 —— 只有「跑完了且有用例失败」才算抓到。
 *
 * @returns {'caught' | 'survived' | 'infra'}
 */
function runSpec(spec) {
  const out = join(ROOT, '.vitest', 'mutation-scan.json')
  const res = spawnSync(
    'bunx',
    ['vitest', 'run', spec, '--reporter=json', `--outputFile=${out}`],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' }
  )
  let report
  try {
    report = JSON.parse(readFileSync(out, 'utf-8'))
  } catch {
    // stderr 前几行常是 esbuild/oxc 的固定告警,取最后一行更像真错误
    const tail = (res.stderr ?? '').trim().split('\n').filter(Boolean).slice(-1)[0]
    return { verdict: 'infra', detail: (tail ?? `退出码 ${res.status}`).slice(0, 160) }
  }
  const failed = (report.testResults ?? []).filter(r => r.status === 'failed')
  if (failed.length > 0) return { verdict: 'caught' }
  // 一条都没跑,等同于什么都没验证
  if ((report.numTotalTests ?? 0) === 0) return { verdict: 'infra', detail: '没有用例被执行' }
  if (res.status !== 0) return { verdict: 'infra', detail: `退出码 ${res.status} 但报告里没有失败用例` }
  return { verdict: 'survived' }
}

const missed = []
const infra = []
let checked = 0
for (const t of found) {
  const orig = readFileSync(t.file, 'utf-8')
  // 同一段文本可能在文件里出现多次:按记录的下标定位,否则后续几处会重复变异第一处
  if (orig.slice(t.index, t.index + t.text.length) !== t.text || t.mutated === t.text) continue
  writeFileSync(t.file, orig.slice(0, t.index) + t.mutated + orig.slice(t.index + t.text.length))
  let verdict
  try {
    verdict = runSpec(t.spec)
  } finally {
    writeFileSync(t.file, orig)
  }
  checked += 1
  const rel = `${t.file.slice(ROOT.length + 1)}:${t.line ?? t.index}`
  if (verdict.verdict === 'survived') {
    missed.push(t)
    console.log(`  ✗ 漏  ${rel}  [${t.name}]  ${t.text.trim().slice(0, 60)}`)
  } else if (verdict.verdict === 'infra') {
    infra.push({ ...t, detail: verdict.detail })
    console.log(`  ! 故障 ${rel}  [${t.name}]  ${verdict.detail}`)
  }
}

console.log(`\n检查 ${checked} 处 | 漏 ${missed.length} 处 | 设施故障 ${infra.length} 处`)
if (missed.length > 0) {
  console.log('\n漏掉的(改坏了不会红):')
  for (const m of missed) console.log(`  ${m.file.slice(ROOT.length + 1)}  ${m.text.trim().slice(0, 70)}`)
}
if (infra.length > 0) {
  console.log('\n设施故障(没测成,不算抓到也不算漏):')
  for (const m of infra) console.log(`  ${m.file.slice(ROOT.length + 1)}  ${m.detail}`)
}
if (missed.length > 0 || infra.length > 0) process.exitCode = 1
