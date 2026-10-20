/**
 * 分类测试报告 —— 按系统输出 PASS/FAIL,而非只看总数
 * 用法: bun run test:report
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 分类映射。匹配是路径子串,按数组顺序取第一个命中的分类,故有两条约束:
 * ① 串要够长以免误伤(用 'game.spec' 而非 'game',否则 endgameService 会被截胡);
 * ② 同一文件只应命中一类。新增 spec 后务必在此登记 —— 未登记的用例不进任何
 *    分类,报告就少算了它,等于这份报告在撒谎。
 */
const CATEGORIES = [
  {
    name: 'Unit        数值纯函数',
    match: ['gnum', 'format', 'setMath', 'saveShape', 'savePlaintext', 'useNativeInsets', 'formulas', 'forgeUpgrade', 'forgeArtifactBatch', 'linggenGen', 'linggenShape', 'inventoryShape', 'equipGen', 'equipmentIcon', 'crypto', 'quests', 'codex', 'craftability', 'reforge', 'theme', 'savePersistence', 'dongfu.spec', 'inventory.spec', 'ui.spec', 'inventoryNote', 'affixTransfer.spec', 'affixes', 'questNav', 'appVersion', 'timeUnits']
  },
  {
    name: 'Combat      战斗规则',
    match: ['combat.spec', 'battleFactor', 'highTierSmoke', 'ironwall', 'bossAudit', 'bossPhaseAudit', 'bossArchetypes', 'gauntlet', 'exploration.spec', 'exploreModes', 'playerMatchup']
  },
  {
    name: 'Balance     流派与生态',
    match: ['buildSim', 'buildSearch', 'buildDetect', 'buildAdvisor', 'powerRating', 'statBreakdown', 'equipSet', 'equipBest', 'astral', 'artifactLadder', 'talentLadder', 'gongfaBranch', 'gongfaService', 'softCapAudit', 'softCapVisibility', 'speedGranularity', 'linggenAffinity', 'linggenRole', 'enlightenBalance']
  },
  { name: 'Progression 成长曲线', match: ['realms.spec', 'realmBanking', 'realmNaming', 'realmLadder', 'classics', 'progressionDoc', 'progressionSim', 'realPacing', 'breakthrough', 'inflationAudit', 'samsaraAudit', 'suppressRebirth', 'daoFruitCurve', 'saveCalibration', 'rebirthRoi', 'deepCultivationRoi', 'contentGateAudit', 'shallowRebirthGains', 'narrowingImpact', 'impactSurface', 'compoundingAudit', 'daoFruitRoles', 'fruitOutlets', 'lifeTrialService', 'trialMotivation', 'motivationType', 'mortalWorldGen', 'mortalIdentity', 'mortalGate', 'mortalRouteAccess', 'overviewNecessity', 'contentTakeover', 'bossUnique', 'worldNaming', 'worldSemantics', 'player.rebirth', 'playerHistoryShape', 'eta.spec', 'progress.spec', 'reincarnation', 'heritage'] },
  { name: 'Economy     资源经济', match: ['economySim', 'economyModuleBalance', 'expIncome', 'lootSim', 'loot.spec', 'salvage', 'smartKeep', 'petLuck', 'eventPetLuck', 'pillValue', 'pillService', 'pillBatch', 'veinEconomyAudit', 'veinVisibility', 'resourceGuidance', 'offlineCap', 'offlineEquipCap', 'offlineLedger', 'offlineModeReward', 'offlineParity', 'offlineScope', 'offlineFactorParity', 'veinService', 'veinBatch', 'qiRepair', 'buildingService', 'buildingBatch', 'affixTransferEconomy', 'dropQualityWindow', 'herbGrade', 'resources.spec', 'buffCap', 'economyAudit', 'wudaoExchange'] },
  {
    name: 'Regression  服务与归因',
    match: ['/ui/', 'rewardText', 'gateWiring', 'unlockChainSelfHeal', 'loadoutService', 'loadouts.spec', 'battleAnalysis', 'foeOrigin', 'loreService', 'lore.spec', 'smithingLore', 'contentReachability', 'contentDensity', 'mentorService', 'daoluService', 'bondEvents', 'bondTiming', 'bondIntent', 'bondCausality', 'worldMemory', 'phase31LinkAudit', 'suppress', 'regionRevival', 'game.spec', 'enginePause', 'engine.spec', 'audio', 'earlyGameService', 'cavePatrolDay', 'earlyGameBuffs', 'savePlatform', 'saveRoundTrip', 'saveBackup', 'importCorruption', 'saveMigration', 'sanitizeAll', 'codexSource', 'achievementHint', 'titleLadder', 'titleReunlock', 'artifactEffects', 'dataHeaderAudit', 'deadExportAudit', 'chainProgression', 'vocabularyCoverage', 'singleSourceAudit', 'effectWiring', 'uiLayering', 'layeringAudit', 'itemText', 'kaiFontCoverage', 'fatePreview', 'goBack', 'storeResilience', 'smokeClassify', 'cultivation.spec', 'diag.spec', 'platform.spec', 'rewardReachability', 'dataIntegrity', 'dataTextAudit', 'useAffixTransfer', 'useGameClock', 'useServiceWorkerUpdate', 'time.spec', 'soulText', 'produceText', 'settings.spec', 'scriptDepsAudit']
  },
  { name: 'Celestial   真仙终局', match: ['celestialSim', 'celestialCaliber', 'endgameService', 'phase21', 'expedition', 'trialChallenge', 'dailyChallenge', 'challenge', 'soulForge', 'souls.spec', 'soulService', 'rulesetEra', 'qimen', 'celestialJudgementInvariant'] },
  {
    name: 'Decision    决策质量',
    match: [
      'decisionAudit', 'synergyScan', 'worldGen', 'ruleUniverse', 'playerLab', 'legacy', 'identity', 'samsara',
      'fortune', 'worldEcho', 'regionEvent', 'eventTier', 'eventEngine', 'explorationDnd', 'weather', 'boundaryTribulation', 'tribulation', 'secretRealm', 'petPersonality', 'goal.spec', 'divination', 'fate.spec', 'astronomy', 'artShu'
    ]
  },
  {
    name: 'Features    玩法·坊市/收徒/悬赏',
    match: ['market.spec', 'apprentice.spec', 'apprenticeService.spec', 'apprentices.spec', 'bounty.spec', 'bountyService.spec']
  }
]

const OUT = '.vitest-report.json'
const ROOT = resolve(import.meta.dirname, '..')

/**
 * 文档里不许写用例条数 —— 它每次加删一条用例都会变,记进文档就变成
 * 「每加一条用例改两处、改漏还打红」。规模数只记 spec **文件数**
 * (由 `bun run docs-check` 对着真实文件数校验)。
 *
 * 例外只有两种:
 *   · 行内已写明这是规则本身的(含「不许写例数」等说法);
 *   · 目录树里以 `#` 开头的结构说明,那是目录注释不是实录。
 * **代码块不整体豁免** —— xian 的第一版放了它,结果 README 里那条
 * `vp test # 全量用例(346 spec / 3436 例…)` 恰好写在代码块里,最重要的
 * 那处反而漏检。给豁免开的每个口子,都要先想到它会被用来绕过。
 */
const DOC_FILES = [
  { rel: 'README.md', file: join(ROOT, 'README.md') },
  ...readdirSync(join(ROOT, 'docs'), { recursive: true, encoding: 'utf-8' })
    .filter(name => typeof name === 'string' && name.endsWith('.md'))
    .map(name => `docs/${name}`)
    // 研读参考仓的学习笔记引的是 xian 的读数,不是本仓的
    .filter(rel => !rel.startsWith('docs/superpowers/plans/') && rel !== 'docs/study-xian.md')
    .map(rel => ({ rel, file: join(ROOT, rel) })),
  { rel: 'AGENTS.md', file: join(ROOT, 'AGENTS.md') },
]

function caseCountHits(text) {
  const hits = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (/(不许写例数|用例条数不写进文档|不写进文档)/.test(line)) return
    /*
     * 只认真正的用例数写法:中文里「条」是通用量词,「四条去路」不是用例数。
     * 英文后缀也要认 —— 中文档里偶尔夹一句 `292 tests` 一样是把例数写进文档
     * (英文复数后缀要求后面不再接字母,免得 `1 caseX` 之类误伤)。
     */
    if (/(\d[\d,]*)\s*(例|个用例|条用例|个断言|条断言)|\b(\d[\d,]*)\s*(?:tests?|cases?|specs?|assertions?)\b/i.exec(line)) {
      hits.push(`第 ${i + 1} 行: ${line.trim().slice(0, 80)}`)
    }
  })
  return hits
}

// CI 的 4 vCPU runner 上 169 个文件全量并行,worker 内存顶爆会整组打断:
// 2026-10-05 一轮 PR 连续两次同一批 8 条 exploration 战败用例被打断,本地任何
// 配置(含 --pool=forks --maxWorkers=4)都全绿,改为流式输出后同一份代码当场即绿 ——
// 是负荷态下的 worker 中断,不是逻辑败。合入闸门不许靠运气,故 CI 限核:
// 本地不设 CI 变量时按机器核心数全速,两边的判据仍是同一份 JSON。
const CI_WORKERS = process.env.CI ? ' --maxWorkers=4' : ''
try {
  execSync(`bunx vitest run --reporter=json${CI_WORKERS} --outputFile=${OUT}`, { stdio: 'pipe' })
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
if (docFailures.length > 0) {
  console.log('\n  ✗ 文档里又写回了用例条数(它每次都变,不该记在文档里):')
  for (const f of docFailures) console.log(`      ${f}`)
}
// 总数用逐条点名的失败数:未登记文件里的失败不计入任何一类,只按类汇总会把它算成「0 败」
console.log(`\n  共 ${totalPassed} 过 / ${failures.length} 败\n`)
// 未分类也算失败:漏登记的用例不计入任何一类,报告便少算了它。
// 只提示不拦截的话,这个数会一路悄悄涨上去(曾积到 225 个才被发现)。
// 文档例数同样拦截:加删用例而不同步文档,等于把判据写进文档又拆掉。
if (docFailures.length > 0) {
  console.log('  退出码 1 的原因:文档里又写回了用例条数\n')
}
process.exit(failures.length > 0 || uncategorized > 0 || docFailures.length > 0 ? 1 : 0)
