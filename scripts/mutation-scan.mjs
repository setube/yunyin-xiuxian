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
import { execFileSync } from 'node:child_process'
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
      found.push({ file, spec, name, index: m.index, text: m[0], mutated: m[0].replace(re, rep) })
      if (found.length >= LIMIT) break
    }
    if (found.length >= LIMIT) break
  }
  if (found.length >= LIMIT) break
}

console.log(`扫到 ${found.length} 个可变异点(上限 ${LIMIT})`)

const missed = []
let checked = 0
for (const t of found) {
  const orig = readFileSync(t.file, 'utf-8')
  if (!orig.includes(t.text) || t.mutated === t.text) continue
  writeFileSync(t.file, orig.replace(t.text, t.mutated))
  let caught = false
  try {
    execFileSync('bunx', ['vitest', 'run', t.spec], { cwd: ROOT, stdio: 'pipe' })
  } catch {
    caught = true
  } finally {
    writeFileSync(t.file, orig)
  }
  checked += 1
  const rel = t.file.slice(ROOT.length + 1)
  if (!caught) {
    missed.push(t)
    console.log(`  ✗ 漏  ${rel}  [${t.name}]  ${t.text.trim().slice(0, 60)}`)
  }
}

console.log(`\n检查 ${checked} 处 | 漏 ${missed.length} 处`)
if (missed.length > 0) {
  console.log('\n漏掉的(改坏了不会红):')
  for (const m of missed) console.log(`  ${m.file.slice(ROOT.length + 1)}  ${m.text.trim().slice(0, 70)}`)
  process.exitCode = 1
}
