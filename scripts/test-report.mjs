/** 分类测试报告:按类输出 PASS/FAIL。用法:bun run test:report */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TEST_CATEGORIES, classifySpecPath } from './testCategories.ts'

const OUT = '.vitest-report.json'
const ROOT = resolve(import.meta.dirname, '..')

/**
 * 文档不写用例条数(每加删一条就变);规模只记 spec 文件数(由 `bun run docs-check` 校验)。
 * 豁免:行内写明这条规则本身的(含「不许写例数」等说法)。代码块不豁免,否则命令示例里的例数漏检。
 */
const DOC_FILES = [
  { rel: 'README.md', file: join(ROOT, 'README.md') },
  ...readdirSync(join(ROOT, 'docs'), { recursive: true, encoding: 'utf-8' })
    .filter(name => typeof name === 'string' && name.endsWith('.md'))
    // Windows 上 recursive readdir 返回反斜杠,不归一则下面的豁免前缀与 join 都对不上
    .map(name => `docs/${name}`.replace(/\\/g, '/'))
    // 参考仓学习笔记引的是 xian 的读数
    .filter(rel => !rel.startsWith('docs/superpowers/plans/') && rel !== 'docs/study-xian.md')
    .map(rel => ({ rel, file: join(ROOT, rel) })),
  { rel: 'AGENTS.md', file: join(ROOT, 'AGENTS.md') },
]

function caseCountHits(text) {
  const hits = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (/(不许写例数|用例条数不写进文档|不写进文档)/.test(line)) return
    // 只认用例数写法:裸「条」是通用量词不算;英文后缀(tests/cases…)也算,其后须无字母
    if (/(\d[\d,]*)\s*(例|个用例|条用例|个断言|条断言)|\b(\d[\d,]*)\s*(?:tests?|cases?|specs?|assertions?)\b/i.exec(line)) {
      hits.push(`第 ${i + 1} 行: ${line.trim().slice(0, 80)}`)
    }
  })
  return hits
}

// CI(4 vCPU)全量并行会顶爆 worker 内存、整组中断,CI 限 4 worker;本地按核数全速,判据同一份 JSON
const CI_WORKERS = process.env.CI ? ' --maxWorkers=4' : ''
/** vitest 退出码:未处理错误只体现在这里,JSON 报告的 success 不计它 */
let vitestExit = 0
try {
  execSync(`bunx vitest run --reporter=json${CI_WORKERS} --outputFile=${OUT}`, { stdio: 'pipe' })
} catch (e) {
  // 有失败时 vitest 非零退出,报告照样生成
  vitestExit = typeof e?.status === 'number' ? e.status : 1
}

let report
try {
  report = JSON.parse(readFileSync(OUT, 'utf8'))
} catch {
  console.error('未能读取测试报告,请先确认 bunx vitest run 可正常执行')
  process.exit(1)
}
rmSync(OUT, { force: true })

const rows = TEST_CATEGORIES.map(c => ({ ...c, passed: 0, failed: 0, fileFailed: 0 }))
let uncategorized = 0
/** 未登记文件与失败用例逐条点名(本报告是 CI 门) */
const uncategorizedFiles = []
const failures = []
/** 整文件失败:导入失败、beforeAll/afterAll 抛错等,断言里一条失败都没有 */
const fileFailures = []

const docFailures = []
for (const { rel, file } of DOC_FILES) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const hit of caseCountHits(text)) {
    docFailures.push(`${rel} ${hit} —— 文档只记 spec 文件数,用例条数不写进文档`)
  }
}

for (const file of report.testResults ?? []) {
  // Windows 上 vitest 报反斜杠;不统一则目录级条目('/ui/')只在 CI 命中
  const path = String(file.name ?? '').split('\\').join('/')
  const category = classifySpecPath(path)
  const row = category ? rows.find(c => c.name === category.name) : undefined
  const passed = (file.assertionResults ?? []).filter(a => a.status === 'passed').length
  const failed = (file.assertionResults ?? []).filter(a => a.status === 'failed').length
  const short = path.replace(/^.*\/src\//, 'src/')
  for (const a of file.assertionResults ?? []) {
    if (a.status === 'failed') failures.push(`${short} › ${a.fullName ?? a.title}`)
  }
  const wholeFile = file.status === 'failed' && failed === 0
  if (wholeFile) {
    const why = String(file.message ?? '').split('\n')[0].slice(0, 160)
    fileFailures.push(why ? `${short} › ${why}` : short)
  }
  if (row) {
    row.passed += passed
    row.failed += failed
    if (wholeFile) row.fileFailed += 1
  } else {
    uncategorized += passed + failed
    uncategorizedFiles.push(short)
  }
}

console.log('\n—— 《云隐修仙录》分类测试报告 ——\n')
let totalPassed = 0
for (const row of rows) {
  totalPassed += row.passed
  const bad = row.failed > 0 || row.fileFailed > 0
  const status = bad ? 'FAIL' : 'PASS'
  const mark = bad ? '✗' : '✓'
  const fileNote = row.fileFailed ? ` / ${row.fileFailed} 文件失败` : ''
  console.log(`  ${mark} ${row.name.padEnd(22, ' ')} ${status}  (${row.passed} 过${row.failed ? ` / ${row.failed} 败` : ''}${fileNote})`)
}
if (uncategorized > 0) {
  console.log(`  ✗ 未分类用例 ${uncategorized} 个 —— 请在 scripts/test-report.mjs 的 CATEGORIES 中补充映射:`)
  for (const f of uncategorizedFiles) console.log(`      ${f}`)
}
if (failures.length > 0) {
  console.log(`\n  失败用例(${failures.length}):`)
  for (const f of failures) console.log(`    ✗ ${f}`)
}
if (fileFailures.length > 0) {
  console.log(`\n  整文件失败(${fileFailures.length}):`)
  for (const f of fileFailures) console.log(`    ✗ ${f}`)
}
if (docFailures.length > 0) {
  console.log('\n  ✗ 文档里又写回了用例条数(它每次都变,不该记在文档里):')
  for (const f of docFailures) console.log(`      ${f}`)
}
// 败数取逐条点名数:未登记文件的失败不进任何一类,按类汇总会漏
console.log(`\n  共 ${totalPassed} 过 / ${failures.length} 败\n`)
// 未分类、文档例数同样判失败:只提示不拦会悄悄累积
if (docFailures.length > 0) {
  console.log('  退出码 1 的原因:文档里又写回了用例条数\n')
}
// 无失败用例、无整文件失败却非零退出:多为未处理错误(如 SSR 渲染里读 document),JSON 不记
const silentCrash = vitestExit !== 0 && failures.length === 0 && fileFailures.length === 0
if (silentCrash) {
  console.log(`  ✗ vitest 退出码 ${vitestExit},但无失败用例(多为未处理错误),跑 bun run test 看详情\n`)
}
process.exit(failures.length > 0 || fileFailures.length > 0 || uncategorized > 0 || docFailures.length > 0 || silentCrash ? 1 : 0)
