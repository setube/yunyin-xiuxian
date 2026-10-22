/** 真仙终局状态 —— 道途 / 道源 / 战绩 / 道痕 / 远征进行时 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CelestialWorldDef, DaoMark, DaoPathId, StatMods } from '@/types'
import { persistConfig } from '@/utils/storage'
import { mergeMods } from '@/core/statsCalc'
import {
  EXPEDITION_GUARDIAN_LAYER,
  EXPEDITION_ROUTE_LAYERS,
  celestialWorldDef,
  daoPathDef,
  trialDef
} from '@/data/endgame'
import { SOUL_GRADES, SOUL_SLOTS, soulMods as soulModsOf, soulTypeDef, type SoulInstance } from '@/data/souls'
import { milestoneDef, recordDef } from '@/data/identity'
import { mutatorDef } from '@/data/mutators'
import { gateDef } from '@/data/qimen'
import { pactDef } from '@/data/pacts'
import { ARTIFACT_MAX_LEVEL, artifactDef } from '@/data/artifacts'
import { STAT_KEYS } from '@/data/statNames'
import { MAX_MAJOR } from '@/data/realms'
import { gn } from '@/utils/gnum'
import {
  asArray,
  asCarriedHpPct,
  asCombatSkills,
  asFiniteNumber,
  asNumberRecord,
  asObjectOrNull,
  asRecordOf,
  asStringArray
} from '@/utils/saveShape'

interface TrialRecord {
  clears: number
  /** 最少总回合(越少越好) */
  bestRounds: number
}

/** 路线远征进行时(可跨会话续行) */
export interface WorldRunState {
  worldId: string
  pactId: string | null
  /** 奇门遁甲:此趟入界所择之门(未择为 null;见 data/qimen) */
  gateId?: string | null
  /** 0..2 = 待选该层路线;3 = 待战界主 */
  layer: number
  /** 沿途节点累计的额外道源 */
  bonus: number
  rows: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }[]
  carriedHpPct: number
  totalRounds: number
  /** 剑意/杀意逐胜层数 */
  winStacks: number
  /** 逆命契:签约时封印的主流派核心词条(负值) */
  sealedMods?: StatMods
}

const MAX_MARKS = 60

/**
 * 词条表修形:只留属性目录里的键,且值必须是有限非零数。
 *
 * 野键会被 `modDepth` 一并算进「构筑厚度」(天界判定据此加厚敌人),坏值则会
 * 顺着 `stackedMods` 把整身攻防染成 NaN。一条可用词条都没有时返回 null,
 * 与「这一层没有加成」同一语义。
 */
function sanitizeMods(raw: unknown): StatMods | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: StatMods = {}
  for (const key of STAT_KEYS) {
    const v = (raw as StatMods)[key]
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) out[key] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * 虚界的敌方形态修形:远征每一战都拿 `shape.skills.map` 与 `atkR/hpR` 现算三维,
 * 缺一样就是「一点启程就白屏」。比例必须是正有限数 —— 0 或负数会把敌人算成
 * 负血/秒杀,比报错更难察觉。
 */
function sanitizeFoeShape(raw: unknown): import('@/types').WorldFoeShape | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const f = raw as Partial<import('@/types').WorldFoeShape>
  if (typeof f.name !== 'string' || !f.name) return null
  const atkR = asFiniteNumber(f.atkR, 0, 0)
  const defR = asFiniteNumber(f.defR, 0, 0)
  const hpR = asFiniteNumber(f.hpR, 0, 0)
  const speed = asFiniteNumber(f.speed, 0, 0)
  if (atkR <= 0 || hpR <= 0 || speed <= 0) return null
  if (!Array.isArray(f.skills)) return null
  return {
    name: f.name,
    icon: typeof f.icon === 'string' ? f.icon : 'user',
    atkR,
    defR,
    hpR,
    speed,
    skills: asCombatSkills(f.skills),
    mods: sanitizeMods(f.mods) ?? {}
  }
}

/**
 * 虚界是**程序化生成的临时世界**,与手工四界不同:它没有目录可以逐字段对照,
 * 形状坏掉只能整座作废(界面回到「窥探虚界」,玩家可再窥一座)。
 *
 * 不修局部的原因:CelestialView 直接读 `foes.map(f => f.name)` / `ruleText.map`,
 * 远征读 `routes[layer][choice]` 与 `guardian`;缺一节就会在真打或渲染时抛错。
 * 而半份世界即使勉强不抛,「入场费/赏格/规则」之间也已不对应 —— 那不是同一座虚界。
 */
function sanitizeVoidWorld(raw: unknown): CelestialWorldDef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const w = raw as Partial<CelestialWorldDef>
  if (w.id !== 'void' || typeof w.name !== 'string' || typeof w.seal !== 'string') return null
  if (!Array.isArray(w.ruleText) || !Array.isArray(w.foes) || w.foes.length === 0) return null
  if (!Array.isArray(w.routes) || w.routes.length !== EXPEDITION_ROUTE_LAYERS) return null
  const guardian = sanitizeFoeShape(w.guardian)
  if (!guardian) return null
  const foes = w.foes.map(sanitizeFoeShape)
  if (foes.some(f => f === null)) return null
  const routes: NonNullable<CelestialWorldDef['routes']> = []
  for (const layer of w.routes) {
    if (!Array.isArray(layer) || layer.length !== 2) return null
    const nodes = layer.map(n => {
      if (!n || typeof n !== 'object') return null
      const node = n as Partial<import('@/types').WorldRouteNode>
      const foe = sanitizeFoeShape(node.foe)
      if (!foe || typeof node.id !== 'string' || typeof node.name !== 'string') return null
      return {
        id: node.id,
        name: node.name,
        desc: typeof node.desc === 'string' ? node.desc : '',
        foe,
        ...(node.rules && typeof node.rules === 'object' && !Array.isArray(node.rules) ? { rules: node.rules } : {}),
        bonus: Math.floor(asFiniteNumber(node.bonus, 0, 0)),
        riskText: typeof node.riskText === 'string' ? node.riskText : ''
      }
    })
    if (nodes.some(n => n === null)) return null
    routes.push(nodes as [import('@/types').WorldRouteNode, import('@/types').WorldRouteNode])
  }
  return {
    id: 'void',
    name: w.name,
    seal: w.seal,
    anchorTier: asFiniteNumber(w.anchorTier, 0, 0),
    desc: typeof w.desc === 'string' ? w.desc : '',
    ruleText: asStringArray(w.ruleText),
    rules: w.rules && typeof w.rules === 'object' && !Array.isArray(w.rules) ? w.rules : {},
    entryCost: Math.floor(asFiniteNumber(w.entryCost, 0, 0)),
    fights: Math.max(1, Math.floor(asFiniteNumber(w.fights, 1, 1))),
    healBetweenPct: asFiniteNumber(w.healBetweenPct, 0.5, 0),
    foes: foes as import('@/types').WorldFoeShape[],
    guardian,
    rewardDaoSource: Math.floor(asFiniteNumber(w.rewardDaoSource, 0, 0)),
    routes
  }
}

/**
 * 忆战快照的修形 —— 快照就是「当年那一局」本身,少一样就不再是那一局。
 *
 * `snapFromReplay` 直接把 `skills`/`artifacts` 拿去 `.map`,坏档里写成非数组时
 * 玩家一点「忆」就抛错;三维经 `gn()` 归一,归零则这一战根本打不起来。
 * 故此处只保留「三维成数、技能与法宝都还是表」的快照;认不出的技能/法宝条目
 * 逐条剔掉(它们在战斗里本就查不到定义),认不出的契约/组合技回落空。
 * 快照不成立就整块作废 —— 界面按「此痕年代久远,战况已不可考」处理,
 * 比拿一份缺胳膊的快照重打、再把结果写回道痕要诚实。
 */
function sanitizeMarkReplay(raw: unknown): DaoMark['replay'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Partial<NonNullable<DaoMark['replay']>>
  if (!Array.isArray(r.skills) || !Array.isArray(r.artifacts)) return undefined
  // 存档里的三维是 unknown(可能缺栏、可能是裸数字或半截对象):gn() 运行时都能归一
  const gnumOf = (v: unknown): import('@/types').GNum => gn(v as number | import('@/types').GNum)
  const attack = gnumOf(r.attack)
  const defense = gnumOf(r.defense)
  const maxHp = gnumOf(r.maxHp)
  const speed = asFiniteNumber(r.speed, 0, 0)
  if (attack.m === 0 || defense.m === 0 || maxHp.m === 0 || speed <= 0) return undefined
  // 词条只认目录里的键与有限数:野键会被 modDepth 一并计入「构筑厚度」,
  // 进而让忆战里的天道判定与当年对不上
  const mods = sanitizeMods(r.mods) ?? {}
  const skills = asCombatSkills(r.skills)
  /**
   * 快照里的法宝也要按「真实佩带规则」收口:
   *   - 重数坏成 999 时,artifactValue 会在读档后给出远超上限的神通数值;
   *   - 同一 defId 写两遍,战斗循环会每回合替它触发两次 —— 实际一局里
   *     inventory.sanitize 早就不允许同件法宝并存。
   * 故认不出的 defId 剔掉、同 id 只留首件,重数夹回 0..ARTIFACT_MAX_LEVEL。
   */
  const seenArtifact = new Set<string>()
  const artifacts = r.artifacts
    .filter(a => !!a && typeof a === 'object' && typeof (a as { defId?: unknown }).defId === 'string')
    .filter(a => !!artifactDef(a.defId))
    .filter(a => {
      if (seenArtifact.has(a.defId)) return false
      seenArtifact.add(a.defId)
      return true
    })
    .map(a => ({
      defId: a.defId,
      level: Math.min(ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(asFiniteNumber(a.level, 0, 0))))
    }))
  return {
    mods,
    attack,
    defense,
    maxHp,
    speed,
    skills,
    artifacts,
    ...(typeof r.comboArt === 'string' ? { comboArt: r.comboArt } : {}),
    pactId: typeof r.pactId === 'string' ? r.pactId : null
  }
}

/**
 * 道痕逐条修形 —— 天界「道痕」栏与轮回页「修行画像」的共同底账。
 *
 * 此前只挡了「条目是不是对象、targetId 是不是字符串」,字段原样进界面:
 *   - `buildName` 不是字符串时,`cultivatorProfile` 的 `m.buildName.includes('·')`
 *     当场抛错 —— 道痕满五则,轮回页整页白屏;
 *   - `life`/`rounds` 是 NaN 时写出「第 NaN 世」「NaN 回合」,`at` 是 NaN 时
 *     「今昔之比」按坏时刻排序,早晚两世会颠倒;
 *   - `cleared` 写成 `'yes'` 这类真值会被当成破界,败绩被记成功;
 *   - `daoPathId` 认不出时道途名留空,`markRules` 也取不到当年的道途规则。
 *
 * 认不出的 `targetId` 不丢:挑战书(custom)与天道变数(mutation)本就不是
 * 天界/试炼目录里的 id,但它们同样是真道痕。只剔掉完全没有 id 的残骸。
 */
function sanitizeMarks(raw: unknown): DaoMark[] {
  const out: DaoMark[] = []
  for (const item of asArray<unknown>(raw)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const m = item as Partial<DaoMark>
    if (typeof m.targetId !== 'string' || m.targetId === '') continue
    const major = asFiniteNumber(m.major, 0, 0)
    const replay = sanitizeMarkReplay(m.replay)
    const context = m.context
    let fixedContext: DaoMark['context']
    if (context && typeof context === 'object' && !Array.isArray(context)) {
      const c = context as NonNullable<DaoMark['context']>
      fixedContext = {
        ...(typeof c.worldId === 'string' ? { worldId: c.worldId } : {}),
        ...(Array.isArray(c.mutatorIds)
          ? { mutatorIds: asStringArray(c.mutatorIds).filter(id => !!mutatorDef(id)) }
          : {}),
        ...(typeof c.gateId === 'string' && gateDef(c.gateId) ? { gateId: c.gateId } : {})
      }
    }
    out.push({
      life: Math.max(1, Math.floor(asFiniteNumber(m.life, 1, 1))),
      daoPathId: typeof m.daoPathId === 'string' && daoPathDef(m.daoPathId) ? (m.daoPathId as DaoPathId) : null,
      ...(Number.isFinite(m.major) ? { major: Math.min(MAX_MAJOR, Math.floor(major)) } : {}),
      targetId: m.targetId,
      targetName: typeof m.targetName === 'string' && m.targetName ? m.targetName : m.targetId,
      cleared: m.cleared === true,
      rounds: Math.floor(asFiniteNumber(m.rounds, 0, 0)),
      buildName: typeof m.buildName === 'string' && m.buildName ? m.buildName : '杂学',
      powerText: typeof m.powerText === 'string' ? m.powerText : '',
      at: Math.floor(asFiniteNumber(m.at, 0, 0)),
      ...(typeof m.ruleset === 'string' ? { ruleset: m.ruleset } : {}),
      ...(fixedContext ? { context: fixedContext } : {}),
      ...(replay ? { replay } : {})
    })
  }
  // 写入侧 addMark 只留最近 MAX_MARKS 则:坏档塞进上千条会把道痕栏与画像统计一并撑爆
  return out.slice(0, MAX_MARKS)
}

export const useEndgameStore = defineStore(
  'endgame',
  () => {
    /** 本世道途(转世后重选) */
    const daoPath = ref<DaoPathId | null>(null)
    /** 道源:跨世永存的终局资粮 */
    const daoSource = ref(0)
    const worldClears = ref<Record<string, number>>({})
    const trialRecords = ref<Record<string, TrialRecord>>({})
    const marks = ref<DaoMark[]>([])
    /** 进行中的路线远征(null = 无) */
    const worldRun = ref<WorldRunState | null>(null)
    /** 当前虚界(程序化生成、裁判过审的世界;id 恒为 'void') */
    const voidWorld = ref<CelestialWorldDef | null>(null)
    /** 今日天道完成日(day number;跨世保留) */
    const dailyDoneDay = ref<number | null>(null)
    /** 修行节点(Phase 28):跨世不灭的「首次」历史 */
    const milestones = ref<{ id: string; life: number; at: number }[]>([])
    /** 极限纪录(Phase 28):只与过去的自己比 */
    const records = ref<Record<string, { value: number; life: number; note: string }>>({})

    // Phase 30.9 道源/道果认知:一次性教学标记(终局导览 / 道果解释 / 资源说明已阅)
    const endgameTutorialSeen = ref(false)
    const daoFruitTutorialSeen = ref(false)
    const resourceDialogSeen = ref(false)
    /** 器魂:凡器在天界的形意。持有池 + 已装配(至多 SOUL_SLOTS 枚) */
    const souls = ref<SoulInstance[]>([])
    const equippedSouls = ref<string[]>([])
    const soulTutorialSeen = ref(false)

    /**
     * 存档修复:道痕/器魂/纪录表被写坏会让天界页在渲染期抛错。
     * (activeSouls 已有一层防御读取,但那是补丁;这里把形状一次修平)
     */
    function sanitize(): void {
      /**
       * 道途按 id 认道:认不出的 string 会被 `chooseDao` 当成「此生道途已定」,
       * 之后每一次选道都被「来世方可另择」挡回去 —— 天界此后再也走不进去。
       * 认不得就回落 null(等同于本世尚未择道),与「转世归还天地」同一状态。
       */
      daoPath.value = typeof daoPath.value === 'string' && daoPathDef(daoPath.value) ? (daoPath.value as DaoPathId) : null
      daoSource.value = asFiniteNumber(daoSource.value, 0, 0)
      // 一次性引导标记:损坏档里混入真值(1/"true")会永久压掉引导,混入假值(0/"")又可能重播。
      // 一律 ===true 归一,与 settings 的布尔开关同一套清洗纪律。
      endgameTutorialSeen.value = endgameTutorialSeen.value === true
      daoFruitTutorialSeen.value = daoFruitTutorialSeen.value === true
      resourceDialogSeen.value = resourceDialogSeen.value === true
      soulTutorialSeen.value = soulTutorialSeen.value === true
      /**
       * 「已破 ×N」按世界 id 认界:认不出的键只会占一行读数,而其值若是 NaN/负数
       * 还会把「已破」写成负数。只留认得的天界/虚界,次数按非负整数收口。
       */
      const fixedClears: Record<string, number> = {}
      for (const [id, n] of Object.entries(asNumberRecord(worldClears.value, 0))) {
        if (id !== 'void' && !celestialWorldDef(id)) continue
        fixedClears[id] = Math.floor(n)
      }
      worldClears.value = fixedClears
      /**
       * 试炼纪录同理:键认不出就没有卡会读它;bestRounds 写成 NaN 会让
       * 「最佳 NaN 回合」挂在那张试炼卡上,且 `Math.min(NaN, x)` 之后再也好不了。
       */
      const fixedTrials: Record<string, TrialRecord> = {}
      for (const [id, raw] of Object.entries(asRecordOf<TrialRecord>(trialRecords.value, r => !!r && typeof r === 'object'))) {
        if (!trialDef(id)) continue
        const r = raw as Partial<TrialRecord>
        const clears = Math.floor(asFiniteNumber(r.clears, 0, 0))
        if (clears <= 0) continue
        fixedTrials[id] = { clears, bestRounds: Math.floor(asFiniteNumber(r.bestRounds, 0, 0)) }
      }
      trialRecords.value = fixedTrials
      marks.value = sanitizeMarks(marks.value)
      worldRun.value = asObjectOrNull<WorldRunState>(worldRun.value)
      /**
       * 远征进行时同样是活状态(每一场都读 layer/carriedHpPct/winStacks):
       * layer 越界会跳到不存在的层,carriedHpPct 越界会把开局算成 NaN 或无敌。
       * 认不得的世界直接作废 —— 让它重新起程,比带着坏状态打下去安全。
       */
      if (worldRun.value) {
        const run = worldRun.value
        const worldOk = !!celestialWorldDef(run.worldId) || run.worldId === 'void'
        if (!worldOk) {
          worldRun.value = null
        } else {
          // 每一行都是战报读数:坏行留着会写出「NaN回合 · 余血 NaN%」,
          // 故按行逐项修平;认不出名字的行直接丢掉(没有可报的对象)
          const rows = asArray<WorldRunState['rows'][number]>(
            run.rows,
            [],
            r => !!r && typeof (r as { foeName?: unknown }).foeName === 'string'
          ).map(r => ({
            foeName: r.foeName,
            win: r.win === true,
            rounds: Math.floor(asFiniteNumber(r.rounds, 0, 0)),
            hpLeftPct: Math.min(1, asFiniteNumber(r.hpLeftPct, 0, 0))
          }))
          worldRun.value = {
            ...run,
            /**
             * 契约与门都按 id 认:认不出的 id 在 `pactDef`/`gateDef` 里查不到,
             * 于是「契约束缚」与「门之规则」双双静默失效 —— 玩家签了一份血契、
             * 走的是死门,打的却是无契无门的白板局,而界面上还挂着那个名字。
             * 认不得即回落「未立契约 / 未择门」,与启程时同一语义。
             */
            pactId: typeof run.pactId === 'string' && pactDef(run.pactId) ? run.pactId : null,
            gateId: typeof run.gateId === 'string' && gateDef(run.gateId) ? run.gateId : null,
            layer: Math.min(EXPEDITION_GUARDIAN_LAYER, Math.max(0, Math.floor(asFiniteNumber(run.layer, 0, 0)))),
            bonus: Math.floor(asFiniteNumber(run.bonus, 0, 0)),
            rows,
            carriedHpPct: asCarriedHpPct(run.carriedHpPct),
            // 总回合与逐行战报必须同账:二者不一致时,结算的杀伐速战赏与道痕
            // 会按「没有发生过的快仗」多给。逐行战报是这一趟唯一可复核的记录,
            // 故以其回合和为准;旧档没有 rows 时仍保留原字段。
            totalRounds:
              rows.length > 0
                ? rows.reduce((sum, row) => sum + row.rounds, 0)
                : Math.floor(asFiniteNumber(run.totalRounds, 0, 0)),
            winStacks: Math.floor(asFiniteNumber(run.winStacks, 0, 0)),
            /**
             * 逆命契封印的是「主流派核心词条」的负值快照,每一场都并入玩家属性:
             * 坏档里的 NaN 会顺着 `stackedMods` 把整身攻防染成 NaN(玩家打不动任何东西),
             * 野键则会被 `modDepth` 算进构筑厚度,让天道判定凭空加厚。
             * 词条只留目录里的键与有限数;整份不可用就当作「没有封印」。
             */
            sealedMods: sanitizeMods(run.sealedMods) ?? undefined
          }
        }
      }
      voidWorld.value = sanitizeVoidWorld(voidWorld.value)
      dailyDoneDay.value =
        typeof dailyDoneDay.value === 'number' && Number.isFinite(dailyDoneDay.value) && dailyDoneDay.value >= 0
          ? Math.floor(dailyDoneDay.value)
          : null
      /**
       * 修行节点的 life/at 是直接报给玩家的读数,坏数会写出「第 NaN 世」;
       * 按非负整数修平。认不出的 id 则清掉:节点页只按 MILESTONE_DEFS 取名,
       * 野 id 会把「修行节点 N/13」顶过总数,时间线上还只剩一行原始 id。
       */
      milestones.value = asArray<{ id: string; life: number; at: number }>(
        milestones.value,
        [],
        m => !!m && typeof (m as { id?: unknown }).id === 'string' && !!milestoneDef((m as { id: string }).id)
      ).map(m => ({
        id: m.id,
        life: Math.floor(asFiniteNumber(m.life, 0, 0)),
        at: Math.floor(asFiniteNumber(m.at, 0, 0))
      }))
      // 修行节点是「首次」语义(addMilestone 只在没有时才记):坏档同一条写两遍会让
      // 「修行节点 N/总数」多报、时间线上同一件事出现两次。只留先出现的那条。
      const seenMilestone = new Set<string>()
      milestones.value = milestones.value.filter(m => {
        if (seenMilestone.has(m.id)) return false
        seenMilestone.add(m.id)
        return true
      })
      /**
       * 极限纪录的 value/life 是被直接读出来的数,坏值会让「最快破界」显示成 NaN。
       * 键同样按 RECORD_DEFS 认:纪录页只遍历这四条,野键永远不会被画出来。
       */
      const fixedRecords: Record<string, { value: number; life: number; note: string }> = {}
      // 条目本身先要是个对象:records = { a: null } 这类坏档不能直接读 .value
      for (const [id, raw] of Object.entries(
        asRecordOf<{ value: number; life: number; note: string }>(records.value, r => !!r && typeof r === 'object' && !Array.isArray(r))
      )) {
        if (!recordDef(id)) continue
        const r = raw as Partial<{ value: number; life: number; note: string }>
        const value = asFiniteNumber(r.value, 0)
        // 极限纪录的四种「最好成绩」都以正数为语义:0 回合的破界、0 道源的赏格不是一场真成绩。
        if (value <= 0) continue
        fixedRecords[id] = {
          value,
          life: Math.floor(asFiniteNumber(r.life, 0, 0)),
          note: typeof r.note === 'string' ? r.note : ''
        }
      }
      records.value = fixedRecords
      /**
       * 器魂 uid 必须唯一:装配表按 uid 映射回魂仓,两条同号会让 `activeSouls`
       * 把同一枚的主动与词条各算两次(实际只有一枚)。
       *
       * 同时逐枚修形:品阶是 `SOUL_GRADES[rank]!` 的裸下标 —— 坏档写成 `NaN`
       * 时取到 `undefined`,器魂页渲染 `soulGradeDef(grade).color` 当场抛错,
       * 而 Vue 会不断重试渲染,表现成「出现异常,已记录」的 toast 反复弹出。
       * 类型同理:野 type 在 `soulTypeDef` 里查不到,器魂名与词条都成空壳。
       * 品阶夹回 [0, 顶阶] 而不是丢弃这一枚 —— 器魂是玩家烧掉一件法器换来的,
       * 坏数修平即可,没理由连带没收。
       */
      const seenSoul = new Set<string>()
      const maxSoulGrade = SOUL_GRADES.length - 1
      souls.value = asArray<SoulInstance>(
        souls.value,
        [],
        s =>
          !!s &&
          typeof (s as SoulInstance).uid === 'string' &&
          typeof (s as SoulInstance).type === 'string' &&
          !!soulTypeDef((s as SoulInstance).type)
      )
        .filter(s => {
          if (seenSoul.has(s.uid)) return false
          seenSoul.add(s.uid)
          return true
        })
        .map(s => ({
          uid: s.uid,
          type: s.type,
          grade: Math.min(maxSoulGrade, Math.floor(asFiniteNumber(s.grade, 0, 0))),
          fromName: typeof s.fromName === 'string' ? s.fromName : ''
        }))
      // 装配位亦然:同一个 uid 写两遍只会让同一枚占两个槽、算两遍词条
      equippedSouls.value = [...new Set(asStringArray(equippedSouls.value))]
      // 装配表清掉已不存在的 uid(ghost):否则原始槽位与 activeSouls(过滤读数)分叉 ——
      // 幽灵占着槽、栏里看着有空位,再装配却静默失败
      const soulUids = new Set(souls.value.map(s => s.uid))
      /**
       * 装到第 SOUL_SLOTS 缕为止,与 equipSoul 的硬闸同一把尺:
       * 坏档写进五缕会让五缕词条一起生效(写入侧根本装不上第三缕以外的),
       * 「已凝 5/3」还会把读数顶破上限。截断保留先装的那几缕,与「槽满即拒」同序。
       */
      equippedSouls.value = equippedSouls.value.filter(id => soulUids.has(id)).slice(0, SOUL_SLOTS)
    }

    /** 已装配器魂(过滤掉已不存在的 uid) */
    const activeSouls = computed<SoulInstance[]>(() => {
      // 防御两个数组字段:器魂是后加的 state,若存档来自旧版本、经过外部迁移或被手工改坏,
      // 恢复后这里可能不是数组。直接 .map 会在**渲染期**抛 TypeError,
      // 而 Vue 会不断重试渲染 —— 表现就是「出现异常,已记录」的 toast 反复弹出
      const equipped = equippedSouls.value
      const pool = souls.value
      if (!Array.isArray(equipped) || !Array.isArray(pool)) return []
      return equipped.map(id => pool.find(s => s.uid === id)).filter((s): s is SoulInstance => s !== undefined)
    })

    /** 持有的器魂(同上,保证调用方永远拿到数组) */
    const soulList = computed<SoulInstance[]>(() => (Array.isArray(souls.value) ? souls.value : []))

    /** 已装配器魂提供的词条合计(天界生效) */
    const soulMods = computed<StatMods>(() => mergeMods(activeSouls.value.map(soulModsOf)))

    function addSoul(soul: SoulInstance): void {
      if (
        !soul ||
        typeof soul.uid !== 'string' ||
        !soul.uid ||
        typeof soul.type !== 'string' ||
        !soulTypeDef(soul.type) ||
        !Number.isFinite(soul.grade) ||
        soulList.value.some(s => s.uid === soul.uid)
      ) {
        return
      }
      souls.value = [
        ...soulList.value,
        {
          uid: soul.uid,
          type: soul.type,
          grade: Math.min(SOUL_GRADES.length - 1, Math.max(0, Math.floor(soul.grade))),
          fromName: typeof soul.fromName === 'string' ? soul.fromName : ''
        }
      ]
    }

    /** 装配器魂;槽位已满或已装配则返回 false */
    function equipSoul(uid: string): boolean {
      const equipped = Array.isArray(equippedSouls.value) ? equippedSouls.value : []
      if (equipped.includes(uid)) return false
      // 槽位按「有效装配」算(activeSouls 已滤幽灵):幽灵占原始槽只会让装配静默失败
      if (activeSouls.value.length >= SOUL_SLOTS) return false
      if (!soulList.value.some(s => s.uid === uid)) return false
      equippedSouls.value = [...equipped, uid]
      return true
    }

    function unequipSoul(uid: string): void {
      equippedSouls.value = (Array.isArray(equippedSouls.value) ? equippedSouls.value : []).filter(id => id !== uid)
    }

    /** 散去器魂(不可逆:原器早已毁去,散了就没了) */
    function dissolveSoul(uid: string): void {
      souls.value = soulList.value.filter(s => s.uid !== uid)
      equippedSouls.value = (Array.isArray(equippedSouls.value) ? equippedSouls.value : []).filter(id => id !== uid)
    }

    const totalClears = computed(
      () =>
        Object.values(worldClears.value).reduce((s, n) => s + n, 0) + Object.values(trialRecords.value).reduce((s, r) => s + r.clears, 0)
    )

    function chooseDao(id: DaoPathId): boolean {
      if (daoPath.value !== null) return false
      if (!daoPathDef(id)) return false
      daoPath.value = id
      return true
    }

    function addDaoSource(n: number): void {
      if (!Number.isFinite(n) || n <= 0) return
      const amount = Math.floor(n)
      if (amount <= 0) return
      daoSource.value = Math.max(0, daoSource.value + amount)
    }

    function spendDaoSource(n: number): boolean {
      if (!Number.isFinite(n) || n < 0) return false
      const amount = Math.floor(n)
      if (amount === 0) return true
      if (daoSource.value < amount) return false
      daoSource.value -= amount
      return true
    }

    function recordWorldClear(worldId: string): void {
      if (worldId !== 'void' && !celestialWorldDef(worldId)) return
      worldClears.value = { ...worldClears.value, [worldId]: (worldClears.value[worldId] ?? 0) + 1 }
    }

    function recordTrial(trialId: string, rounds: number): void {
      if (!trialDef(trialId) || !Number.isFinite(rounds) || rounds <= 0) return
      const fixedRounds = Math.max(1, Math.floor(rounds))
      const prev = trialRecords.value[trialId]
      trialRecords.value = {
        ...trialRecords.value,
        [trialId]: {
          clears: (prev?.clears ?? 0) + 1,
          bestRounds: prev ? Math.min(prev.bestRounds, fixedRounds) : fixedRounds
        }
      }
    }

    function addMark(mark: DaoMark): void {
      const fixed = sanitizeMarks([mark])
      if (fixed.length === 0) return
      marks.value = [...fixed, ...marks.value].slice(0, MAX_MARKS)
    }

    function markDailyDone(day: number): void {
      if (!Number.isFinite(day) || day < 0) return
      dailyDoneDay.value = Math.floor(day)
    }

    /** 记一个修行节点(首次才记),返回是否新增 */
    function addMilestone(id: string, life: number): boolean {
      if (!milestoneDef(id) || !Number.isFinite(life) || life < 1) return false
      if (milestones.value.some(m => m.id === id)) return false
      milestones.value = [...milestones.value, { id, life: Math.floor(life), at: Date.now() }]
      return true
    }

    /** 更新极限纪录;better 决定方向(如最少回合取小),返回是否刷新 */
    function updateRecord(id: string, value: number, life: number, note: string, better: 'min' | 'max'): boolean {
      const def = recordDef(id)
      if (!def || def.better !== better) return false
      if (!Number.isFinite(value) || !Number.isFinite(life) || life < 1 || typeof note !== 'string') return false
      if (value <= 0) return false
      const prev = records.value[id]
      if (prev && (better === 'min' ? value >= prev.value : value <= prev.value)) return false
      records.value = { ...records.value, [id]: { value, life: Math.floor(life), note } }
      return true
    }

    /** 转世:道途归还天地,道源与道痕随神魂不灭;进行中的远征就此中断 */
    function onRebirth(): void {
      daoPath.value = null
      worldRun.value = null
    }

    return {
      daoPath,
      daoSource,
      worldClears,
      trialRecords,
      marks,
      worldRun,
      voidWorld,
      dailyDoneDay,
      milestones,
      records,
      endgameTutorialSeen,
      souls,
      equippedSouls,
      soulTutorialSeen,
      activeSouls,
      soulList,
      soulMods,
      addSoul,
      equipSoul,
      unequipSoul,
      dissolveSoul,
      daoFruitTutorialSeen,
      resourceDialogSeen,
      totalClears,
      chooseDao,
      addDaoSource,
      spendDaoSource,
      recordWorldClear,
      recordTrial,
      addMark,
      markDailyDone,
      addMilestone,
      updateRecord,
      onRebirth,
      sanitize
    }
  },
  { persist: persistConfig('endgame') }
)
