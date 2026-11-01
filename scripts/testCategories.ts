/**
 * 分类测试报告的路径映射:按路径子串匹配,取数组里第一个命中的分类。
 * ① 串要够长:`stores/game.spec` 写成 `game.spec` 会把 data/stores 的 endgame.spec 截进 Regression;
 * ② 新增 spec 须在此登记,且只命中一类(`gateWiring.spec.ts` 逐个验证)。
 */
export interface TestCategory {
  name: string
  match: readonly string[]
}

export const TEST_CATEGORIES: readonly TestCategory[] = [
  {
    name: 'Unit        数值纯函数',
    match: ['gnum', 'format', 'setMath', 'saveShape', 'savePlaintext', 'useNativeInsets', 'formulas', 'forgeUpgrade', 'forgeArtifactBatch', 'linggenGen', 'linggenShape', 'inventoryShape', 'equipGen', 'equipmentIcon', 'crypto', 'quests', 'craftability', 'reforge.spec', 'reforgeAuto', 'theme', 'savePersistence', 'dongfu.spec', 'inventory.spec', 'ui.spec', 'inventoryNote', 'affixTransfer.spec', 'affixes', 'appVersion', 'timeUnits', 'random.spec']
  },
  {
    name: 'Combat      战斗规则',
    match: ['combat.spec', 'battleFactor', 'highTierSmoke', 'ironwall', 'bossAudit', 'bossPhaseAudit', 'bossArchetypes', 'gauntlet', 'exploration.spec', 'exploreModes', 'playerMatchup']
  },
  {
    name: 'Balance     流派与生态',
    match: ['buildSim', 'buildSearch', 'buildDetect', 'buildAdvisor', 'powerRating', 'statBreakdown', 'equipSet', 'equipBest', 'astral', 'artifactLadder', 'talentLadder', 'gongfaBranch', 'gongfaService', 'softCapAudit', 'softCapVisibility', 'speedGranularity', 'linggenAffinity', 'linggenRole', 'enlightenBalance', 'daoDepth', 'playerSnap', 'compare.spec', 'ruleBudget', 'herbPrice', 'statsCalc', 'resilience', 'metaSim', 'rateRankConsistency', 'simBaseline', 'soulSealConsistency', 'earlyGameText', 'mutators', 'achievements', 'lifeTrials', 'pacts', 'lifeThemes', 'gongfa.spec', 'chains', 'contentCounts', 'data/statNames', 'realmShape', 'bothVectors', 'comboArts', 'importValidate', 'prepTier', 'earlyEventDecay', 'auditBaseline', 'diminishScope', 'mergeRules', 'playerName', 'sanitizeIdempotent', 'capScale', 'qualityWeights', 'enlightenOptionShape', 'pillDurationText', 'contentNonEmpty', 'skillEffectParity']
  },
  { name: 'Progression 成长曲线', match: ['realms.spec', 'realmBanking', 'realmNaming', 'realmLadder', 'classics', 'progressionDoc', 'progressionSim', 'realPacing', 'breakthrough.spec', 'breakthroughCounter', 'breakthroughFlow', 'inflationAudit', 'samsaraAudit', 'suppressRebirth', 'daoFruitCurve', 'saveCalibration', 'rebirthRoi', 'deepCultivationRoi', 'contentGateAudit', 'shallowRebirthGains', 'narrowingImpact', 'impactSurface', 'compoundingAudit', 'daoFruitRoles', 'fruitOutlets', 'lifeTrialService', 'trialMotivation', 'motivationType', 'mortalWorldGen', 'mortalIdentity', 'mortalGate', 'mortalRouteAccess', 'overviewNecessity', 'contentTakeover', 'bossUnique', 'worldNaming', 'worldSemantics', 'player.rebirth', 'playerHistoryShape', 'eta.spec', 'progress.spec', 'questProgress', 'firstStep', 'reincarnation', 'heritage'] },
  { name: 'Economy     资源经济', match: ['economySim', 'economyModuleBalance', 'expIncome', 'lootSim', 'loot.spec', 'salvage', 'smartKeep', 'petLuck', 'eventPetLuck', 'pillValue', 'pillService', 'pillBatch', 'useBrewing', 'veinEconomyAudit', 'veinVisibility', 'resourceGuidance', 'offlineCap', 'offlineEquipCap', 'offlineLedger', 'offlineModeReward', 'offlineParity', 'offlineScope', 'offlineFactorParity', 'veinService', 'veinBatch', 'qiRepair', 'buildingService', 'buildingBatch', 'affixTransferEconomy', 'dropQualityWindow', 'herbGrade', 'resources.spec', 'buffCap', 'economyAudit', 'wudaoExchange'] },
  {
    name: 'Regression  服务与归因',
    // artifactsIcon 属展示层引用的源码级归因(同 iconRegistry、dataTextAudit),归此不归 Unit
    match: ['/ui/', 'rewardText', 'gateWiring', 'gateRuleText', 'unlockChainSelfHeal', 'loadoutService', 'loadouts.spec', 'adventure.spec', 'battleAnalysis', 'foeOrigin', 'loreService', 'lore.spec', 'smithingLore', 'contentReachability', 'contentDensity', 'mentorService', 'daoluService', 'bondEvents', 'bondTiming', 'bondIntent', 'bondCausality', 'worldMemory', 'phase31LinkAudit', 'suppress.spec', 'suppressOnline', 'regionRevival', 'stores/game.spec', 'playerBoundary.spec', 'enginePause', 'engine.spec', 'audio', 'earlyGameService', 'cavePatrolDay', 'earlyGameBuffs', 'savePlatform', 'saveAndroidTransfer', 'saveRoundTrip', 'saveBackup', 'saveFileRead', 'importCorruption', 'saveMigration', 'sanitizeAll', 'codexSource', 'achievementHint', 'titleLadder', 'titleReunlock', 'artifactEffects', 'artifactsIcon', 'dataHeaderAudit', 'deadExportAudit', 'chainProgression', 'vocabularyCoverage', 'singleSourceAudit', 'effectWiring', 'uiLayering', 'layeringAudit', 'itemText', 'kaiFontCoverage', 'fatePreview', 'goBack', 'storeResilience', 'smokeClassify', 'cultivation.spec', 'diag.spec', 'platform.spec', 'pacingTelemetry.spec', 'rewardReachability', 'dataIntegrity', 'dataTextAudit', 'useAffixTransfer', 'useGameClock', 'useNow', 'useWallClock', 'useServiceWorkerUpdate', 'useModalStack', 'time.spec', 'soulText', 'produceText', 'settings.spec', 'scriptDepsAudit', 'layoutMeasure']
  },
  { name: 'Celestial   真仙终局', match: ['celestialSim', 'celestialCaliber', 'endgameService', 'endgame.spec', 'phase21', 'expedition', 'trialChallenge', 'dailyChallenge', 'challenge', 'soulForge', 'souls.spec', 'soulService', 'daoSource', 'rulesetEra', 'qimen', 'celestialJudgementInvariant'] },
  {
    name: 'Decision    决策质量',
    match: [
      'decisionAudit', 'synergyScan', 'worldGen', 'ruleUniverse', 'ecosystemHealth', 'playerLab', 'legacy', 'identity', 'samsara.spec',
      'fortune', 'worldEcho', 'regionEvent', 'eventTier', 'eventEngine', 'explorationDnd', 'weather.spec', 'boundaryTribulation', 'tribulation', 'secretRealm', 'petPersonality', 'goal.spec', 'divination', 'fate.spec', 'astronomy', 'artShu', 'mansionRedirect'
    ]
  },
  {
    name: 'Features    玩法·坊市/收徒/悬赏',
    match: ['market.spec', 'apprentice.spec', 'apprenticeService.spec', 'apprentices.spec', 'bounty.spec', 'bountyService.spec', 'useBountyRows.spec']
  }
]

/** Windows 上 vitest 报反斜杠;统一成正斜杠,目录级匹配才不漏 */
export function normalizeSpecPath(path: string): string {
  return path.split('\\').join('/')
}

/** 一个 spec 路径命中的全部分类;正常应恰好 1 条 */
export function matchingCategories(path: string): TestCategory[] {
  const normalized = normalizeSpecPath(path)
  return TEST_CATEGORIES.filter(category => category.match.some(m => normalized.includes(m)))
}

/** 报告归类:取第一个命中分类 */
export function classifySpecPath(path: string): TestCategory | undefined {
  return matchingCategories(path)[0]
}
