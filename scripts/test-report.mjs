/**
 * 分类测试报告 —— 按系统输出 PASS/FAIL,而非只看总数
 * 用法: npm run test:report
 */
import { execSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

const CATEGORIES = [
  { name: 'Unit        数值纯函数', match: ['gnum', 'format', 'formulas', 'linggenGen', 'equipGen', 'crypto', 'quests'] },
  { name: 'Combat      战斗规则', match: ['combat.spec'] },
  { name: 'Balance     流派与生态', match: ['buildSim', 'buildSearch', 'buildDetect', 'buildAdvisor'] },
  { name: 'Progression 成长曲线', match: ['progressionSim'] },
  { name: 'Economy     资源经济', match: ['economySim', 'lootSim', 'pillValue'] },
  { name: 'Regression  服务与归因', match: ['loadoutService', 'battleAnalysis'] },
  { name: 'Celestial   真仙终局', match: ['celestialSim', 'endgameService', 'phase21'] },
  { name: 'Decision    决策质量', match: ['decisionAudit', 'synergyScan', 'worldGen', 'ruleUniverse', 'playerLab', 'legacy', 'identity', 'samsara'] }
]

const OUT = '.vitest-report.json'

try {
  execSync(`npx vitest run --reporter=json --outputFile=${OUT}`, { stdio: 'pipe' })
} catch {
  // 有测试失败时 vitest 以非零码退出,报告文件仍会生成
}

let report
try {
  report = JSON.parse(readFileSync(OUT, 'utf8'))
} catch {
  console.error('未能读取测试报告,请先确认 npx vitest run 可正常执行')
  process.exit(1)
}
rmSync(OUT, { force: true })

const rows = CATEGORIES.map(c => ({ ...c, passed: 0, failed: 0 }))
let uncategorized = 0

for (const file of report.testResults ?? []) {
  const path = String(file.name ?? '')
  const row = rows.find(c => c.match.some(m => path.includes(m)))
  const passed = (file.assertionResults ?? []).filter(a => a.status === 'passed').length
  const failed = (file.assertionResults ?? []).filter(a => a.status === 'failed').length
  if (row) {
    row.passed += passed
    row.failed += failed
  } else {
    uncategorized += passed + failed
  }
}

console.log('\n—— 《云隐修仙录》分类测试报告 ——\n')
let totalPassed = 0
let totalFailed = 0
for (const row of rows) {
  totalPassed += row.passed
  totalFailed += row.failed
  const status = row.failed > 0 ? 'FAIL' : 'PASS'
  const mark = row.failed > 0 ? '✗' : '✓'
  console.log(`  ${mark} ${row.name.padEnd(22, ' ')} ${status}  (${row.passed} 过${row.failed ? ` / ${row.failed} 败` : ''})`)
}
if (uncategorized > 0) {
  console.log(`  ! 未分类用例 ${uncategorized} 个 —— 请在 scripts/test-report.mjs 中补充映射`)
}
console.log(`\n  共 ${totalPassed} 过 / ${totalFailed} 败\n`)
process.exit(totalFailed > 0 ? 1 : 0)
