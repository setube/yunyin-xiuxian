/**
 * 分类测试报告 —— 按系统输出 PASS/FAIL,而非只看总数
 * 用法: bun run test:report
 */
import { execSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

/**
 * 分类映射。匹配是路径子串,按数组顺序取第一个命中的分类,故有两条约束:
 * ① 串要够长以免误伤(用 'game.spec' 而非 'game',否则 endgameService 会被截胡);
 * ② 同一文件只应命中一类。新增 spec 后务必在此登记 —— 未登记的用例不进任何
 *    分类,报告就少算了它,等于这份报告在撒谎。
 */
const CATEGORIES = [
  {
    name: 'Unit        数值纯函数',
    match: ['gnum', 'format', 'savePlaintext', 'useNativeInsets', 'formulas', 'linggenGen', 'equipGen', 'equipmentIcon', 'crypto', 'quests', 'codex', 'craftability', 'reforge', 'theme', 'savePersistence', 'dongfu.spec', 'ui.spec', 'inventoryNote']
  },
  {
    name: 'Combat      战斗规则',
    match: ['combat.spec', 'battleFactor', 'highTierSmoke', 'ironwall', 'bossAudit', 'bossPhaseAudit', 'exploration.spec', 'exploreModes']
  },
  {
    name: 'Balance     流派与生态',
    match: ['buildSim', 'buildSearch', 'buildDetect', 'buildAdvisor', 'powerRating', 'statBreakdown', 'equipSet', 'equipBest', 'astral', 'artifactLadder', 'talentLadder', 'gongfaBranch', 'softCapAudit', 'softCapVisibility', 'speedGranularity', 'linggenAffinity', 'linggenRole']
  },
  { name: 'Progression 成长曲线', match: ['realms.spec', 'realmBanking', 'realmNaming', 'classics', 'progressionDoc', 'progressionSim', 'realPacing', 'breakthrough', 'inflationAudit', 'samsaraAudit', 'daoFruitCurve', 'saveCalibration', 'rebirthRoi', 'deepCultivationRoi', 'contentGateAudit', 'shallowRebirthGains', 'narrowingImpact', 'impactSurface', 'compoundingAudit', 'daoFruitRoles', 'fruitOutlets', 'lifeTrialService', 'trialMotivation', 'motivationType', 'mortalWorldGen', 'mortalIdentity', 'mortalGate', 'mortalRouteAccess', 'overviewNecessity', 'contentTakeover', 'bossUnique', 'worldNaming', 'worldSemantics', 'player.rebirth'] },
  { name: 'Economy     资源经济', match: ['economySim', 'expIncome', 'lootSim', 'loot.spec', 'salvage', 'smartKeep', 'petLuck', 'pillValue', 'pillService', 'pillBatch', 'veinEconomyAudit', 'veinVisibility', 'resourceGuidance', 'offlineCap', 'offlineLedger', 'offlineParity', 'offlineScope', 'veinService', 'qiRepair'] },
  {
    name: 'Regression  服务与归因',
    match: ['/ui/', 'rewardText', 'unlockChainSelfHeal', 'loadoutService', 'battleAnalysis', 'foeOrigin', 'loreService', 'smithingLore', 'contentReachability', 'contentDensity', 'mentorService', 'daoluService', 'bondEvents', 'bondTiming', 'bondIntent', 'bondCausality', 'worldMemory', 'phase31LinkAudit', 'suppress', 'game.spec', 'earlyGameService', 'earlyGameBuffs', 'savePlatform', 'saveRoundTrip', 'saveBackup', 'importCorruption', 'saveMigration', 'codexSource', 'achievementHint', 'titleLadder', 'titleReunlock', 'artifactEffects', 'dataHeaderAudit', 'deadExportAudit', 'chainProgression', 'vocabularyCoverage', 'singleSourceAudit', 'effectWiring', 'uiLayering', 'itemText', 'kaiFontCoverage', 'fatePreview', 'goBack', 'storeResilience', 'cultivation.spec', 'diag.spec', 'platform.spec', 'rewardReachability', 'dataIntegrity', 'dataTextAudit']
  },
  { name: 'Celestial   真仙终局', match: ['celestialSim', 'celestialCaliber', 'endgameService', 'phase21', 'expedition', 'soulForge', 'souls.spec', 'rulesetEra', 'qimen'] },
  {
    name: 'Decision    决策质量',
    match: [
      'decisionAudit', 'synergyScan', 'worldGen', 'ruleUniverse', 'playerLab', 'legacy', 'identity', 'samsara',
      'fortune', 'worldEcho', 'regionEvent', 'eventTier', 'eventEngine', 'explorationDnd', 'weather', 'boundaryTribulation', 'tribulation', 'secretRealm', 'petPersonality', 'goal.spec', 'divination', 'fate.spec', 'astronomy'
    ]
  }
]

const OUT = '.vitest-report.json'

try {
  execSync(`bunx vitest run --reporter=json --outputFile=${OUT}`, { stdio: 'pipe' })
} catch {
  // 有测试失败时 vitest 以非零码退出,报告文件仍会生成
}

let report
try {
  report = JSON.parse(readFileSync(OUT, 'utf8'))
} catch {
  console.error('未能读取测试报告,请先确认 bunx vitest run 可正常执行')
  process.exit(1)
}
rmSync(OUT, { force: true })

const rows = CATEGORIES.map(c => ({ ...c, passed: 0, failed: 0 }))
let uncategorized = 0
/** 未登记的文件与失败的用例都要点名 —— 这份报告现在是 CI 的门,只给个数字没法修 */
const uncategorizedFiles = []
const failures = []

for (const file of report.testResults ?? []) {
  // 统一成正斜杠:Windows 上 vitest 报的是反斜杠,目录级条目('/ui/')否则只在 CI 命中
  const path = String(file.name ?? '').split('\\').join('/')
  const row = rows.find(c => c.match.some(m => path.includes(m)))
  const passed = (file.assertionResults ?? []).filter(a => a.status === 'passed').length
  const failed = (file.assertionResults ?? []).filter(a => a.status === 'failed').length
  const short = path.replace(/^.*\/src\//, 'src/')
  for (const a of file.assertionResults ?? []) {
    if (a.status === 'failed') failures.push(`${short} › ${a.fullName ?? a.title}`)
  }
  if (row) {
    row.passed += passed
    row.failed += failed
  } else {
    uncategorized += passed + failed
    uncategorizedFiles.push(short)
  }
}

console.log('\n—— 《云隐修仙录》分类测试报告 ——\n')
let totalPassed = 0
for (const row of rows) {
  totalPassed += row.passed
  const status = row.failed > 0 ? 'FAIL' : 'PASS'
  const mark = row.failed > 0 ? '✗' : '✓'
  console.log(`  ${mark} ${row.name.padEnd(22, ' ')} ${status}  (${row.passed} 过${row.failed ? ` / ${row.failed} 败` : ''})`)
}
if (uncategorized > 0) {
  console.log(`  ✗ 未分类用例 ${uncategorized} 个 —— 请在 scripts/test-report.mjs 的 CATEGORIES 中补充映射:`)
  for (const f of uncategorizedFiles) console.log(`      ${f}`)
}
if (failures.length > 0) {
  console.log(`\n  失败用例(${failures.length}):`)
  for (const f of failures) console.log(`    ✗ ${f}`)
}
// 总数用逐条点名的失败数:未登记文件里的失败不计入任何一类,只按类汇总会把它算成「0 败」
console.log(`\n  共 ${totalPassed} 过 / ${failures.length} 败\n`)
// 未分类也算失败:漏登记的用例不计入任何一类,报告便少算了它。
// 只提示不拦截的话,这个数会一路悄悄涨上去(曾积到 225 个才被发现)。
process.exit(failures.length > 0 || uncategorized > 0 ? 1 : 0)
