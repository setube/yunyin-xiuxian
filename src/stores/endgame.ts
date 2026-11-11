/** 真仙终局状态 —— 道途 / 道源 / 战绩 / 道痕 / 远征进行时 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CelestialWorldDef, DaoMark, DaoPathId, StatMods } from '@/types'
import { persistConfig } from '@/utils/storage'
import { localDayNum } from '@/utils/time'
import { mergeMods } from '@/core/statsCalc'
import {
  EXPEDITION_GUARDIAN_LAYER,
  EXPEDITION_ROUTE_LAYERS,
  celestialWorldDef,
  daoPathDef,
  trialDef
} from '@/data/endgame'
import { NAME_MAX_LENGTH } from '@/data/constants'
import { SOUL_GRADES, SOUL_SLOTS, soulMods as soulModsOf, soulTypeDef, type SoulInstance } from '@/data/souls'
import { milestoneDef, recordDef } from '@/data/identity'
import { mutatorDef } from '@/data/mutators'
import { gateDef } from '@/data/qimen'
import { pactDef } from '@/data/pacts'
import { ARTIFACT_MAX_LEVEL, ARTIFACT_MAX_SLOTS, artifactDef } from '@/data/artifacts'
import { STAT_KEYS } from '@/data/statNames'
import { MAX_MAJOR } from '@/data/realms'
import { useAdventureStore } from '@/stores/adventure'
import {
  asArray,
  asCarriedHpPct,
  asCombatRules,
  asCombatSkills,
  asBoundedGNum,
  hasCombatRules,
  asFiniteNumber,
  asNumberRecord,
  asObjectOrNull,
  asRecord,
  asRecordOf,
  asStringArray,
  truncateCodePoints,
  asTimestamp,
} from '@/utils/saveShape'

interface TrialRecord {
  clears: number
  /** 最少总回合 */
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
 * 词条表修形:只留属性目录里的键与有限非零值;一条不剩返回 null(= 无加成)。
 * 野键会被 `modDepth` 算进构筑厚度,坏值经 `stackedMods` 把攻防染成 NaN。
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
 * 虚界(程序化生成)四个配置数的读档上界。
 *
 * 这些不是「只给人看的」字段,而是直接进结算的:
 * `rewardDaoSource` 决定道源到账、`entryCost` 是入场费、`fights` 是全程场数。
 * 上界按 `worldGen` 的真实产出来定,各留一档余量:
 * 赏格被夹在 55–100、入场费恒 20、场数恒 6、锚点层级恒 32。
 */
const VOID_ANCHOR_TIER_MAX = 64
const VOID_REWARD_MAX = 200
const VOID_ENTRY_COST_MAX = 500
const VOID_FIGHTS_MAX = 20
const VOID_NODE_BONUS_MAX = 100

/**
 * 界域/试炼战绩与世号的读档上界 —— 这几处都是**裸插值**,没有格式化兜底。
 *
 * 「已破 ×N」「最佳 N 回合」「第N世」直接印数字:坏档写 1e300 就成了科学计数。
 * 一局里破一界几百次、一场打几百回合都已是极值。
 *
 * **世号的上界必须比写入端高一档**:多个写入点记的是
 * `player.reincarnation.count + 1`(道痕、里程碑、试炼记录),而
 * `player.ts` 里 `count` 的读档守卫是 1e6。若这里取同一个数,
 * `count` 正好等于上限时写入端会写 `cap + 1`,读回来却被夹成 `cap` ——
 * 本世道痕/里程碑的世号对不上,整块记录消失(审查意见指出的)。
 */
const LIFE_COUNTER_CAP = 10_000_000

/** 忆战快照的速度上界:真实量级在 1~3,取一百已极宽 */
const REPLAY_SPEED_MAX = 100

/**
 * 一趟远征的总回合上界(仅用于无战报行的旧档兜底)。
 *
 * 它进 `slaughterSpeedBonus` 与道痕记录的回合数 —— 后者会印在道痕面板上。
 * 一趟五战、每战至多数百回合,取一万已极宽。
 */
const WORLD_RUN_ROUNDS_MAX = 10_000

const WORLD_CLEARS_MAX = 10_000
const TRIAL_CLEARS_MAX = 10_000
const BATTLE_ROUNDS_CAP = 10_000


/**
 * 虚界敌方形态修形:远征每战都读 `shape.skills.map` 与 `atkR/hpR`,缺一样即白屏。
 * 比例须为正有限数,0 或负数会算出负血/秒杀。
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
 * 虚界程序化生成,无目录可逐字段对照:形状坏即整座作废(界面回到「窥探虚界」)。
 * 不修局部:CelestialView 读 `foes`/`ruleText`,远征读 `routes[layer][choice]` 与 `guardian`;
 * 半份世界的入场费/赏格/规则也已不对应。
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
        ...(hasCombatRules(node.rules) ? { rules: asCombatRules(node.rules) } : {}),
        bonus: Math.floor(asFiniteNumber(node.bonus, 0, 0, VOID_NODE_BONUS_MAX)),
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
    /*
     * 四个配置数都要封顶 —— 它们不是「只给人看的」,而是**直接进结算**:
     * `rewardDaoSource` 进 `reward = world.rewardDaoSource + run.bonus`(道源到账),
     * `entryCost` 是入场费,`fights` 是全程场数,`anchorTier` 决定该界锚点境界。
     * 坏档写 1e300 时:白得 1e300 道源、入场费永远付不起、远征永远打不完。
     *
     * 上界按生成器的真实产出来定(`worldGen`):
     * `rewardDaoSource` 被 `Math.min(100, Math.max(55, ...))` 夹在 55–100;
     * `entryCost` 恒为 20、`fights` 恒为 6、`anchorTier` 恒为 `VOID_ANCHOR_TIER`(32)。
     * 各留一档余量。
     */
    anchorTier: Math.floor(asFiniteNumber(w.anchorTier, 0, 0, VOID_ANCHOR_TIER_MAX)),
    desc: typeof w.desc === 'string' ? w.desc : '',
    ruleText: asStringArray(w.ruleText),
    rules: asCombatRules(w.rules),
    entryCost: Math.floor(asFiniteNumber(w.entryCost, 0, 0, VOID_ENTRY_COST_MAX)),
    fights: Math.floor(asFiniteNumber(w.fights, 1, 1, VOID_FIGHTS_MAX)),
    healBetweenPct: asFiniteNumber(w.healBetweenPct, 0.5, 0, 1),
    foes: foes as import('@/types').WorldFoeShape[],
    guardian,
    rewardDaoSource: Math.floor(asFiniteNumber(w.rewardDaoSource, 0, 0, VOID_REWARD_MAX)),
    routes
  }
}


/**
 * 忆战快照修形:`snapFromReplay` 直接 `.map` 技能/法宝,三维经 `gn()` 归一后不能为零。
 * 认不出的技能/法宝逐条剔掉;快照不成立整块作废,界面按「战况不可考」处理。
 */
function sanitizeMarkReplay(raw: unknown): DaoMark['replay'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Partial<NonNullable<DaoMark['replay']>>
  if (!Array.isArray(r.skills) || !Array.isArray(r.artifacts)) return undefined
  // 三维可能缺栏、是裸数字或半截对象:asBoundedGNum 既能归一也带指数上界。
  // 裸 gn() 不设界,坏档能让道痕列表把战力印成「1.00e1000000000」。
  const gnumOf = (v: unknown): import('@/types').GNum => asBoundedGNum(v)
  const attack = gnumOf(r.attack)
  const defense = gnumOf(r.defense)
  const maxHp = gnumOf(r.maxHp)
  /*
   * 速度要有上界 —— 它直接进 `CombatantSnap.speed`,参与先手判定
   * (`pFirst = pSpeed >= eSpeed`)。坏档写 1e300 时,**忆战重演里玩家永远后手**,
   * 「往世之你 vs 今世之你」的对比就不再是当年那一场。
   * 正常量级:玩家侧是 `1 + modOf(speed)`,词缀与法宝各加零点几,到不了两位数。
   */
  const speed = asFiniteNumber(r.speed, 0, 0, REPLAY_SPEED_MAX)
  if (attack.m === 0 || defense.m === 0 || maxHp.m === 0 || speed <= 0) return undefined
  const mods = sanitizeMods(r.mods) ?? {}
  const skills = asCombatSkills(r.skills)
  /**
   * 快照法宝按真实佩带规则收口,须与 inventory.sanitize / toggleArtifact / applyLoadout / player.sanitize 同尺。
   * 同 id 重复会每回合触发两次;重数越界会让 artifactValue 超上限。
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
    .slice(0, ARTIFACT_MAX_SLOTS)
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
 * 道痕逐条修形:天界「道痕」栏与轮回页「修行画像」共用底账。
 * `buildName` 非字符串会让 `cultivatorProfile` 抛错(轮回页白屏);`cleared` 只认 true。
 * 认不出的 `targetId` 保留:挑战书(custom)与天道变数(mutation)不在天界/试炼目录里。
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
      life: Math.floor(asFiniteNumber(m.life, 1, 1, LIFE_COUNTER_CAP)),
      daoPathId: typeof m.daoPathId === 'string' && daoPathDef(m.daoPathId) ? (m.daoPathId as DaoPathId) : null,
      ...(Number.isFinite(m.major) ? { major: Math.min(MAX_MAJOR, Math.floor(major)) } : {}),
      targetId: m.targetId,
      targetName: typeof m.targetName === 'string' && m.targetName ? m.targetName : m.targetId,
      cleared: m.cleared === true,
      // 道痕面板印「{{ mark.rounds }} 回合」,是裸插值;坏档巨值会印成科学计数
      rounds: Math.floor(asFiniteNumber(m.rounds, 0, 0, BATTLE_ROUNDS_CAP)),
      buildName: typeof m.buildName === 'string' && m.buildName ? m.buildName : '杂学',
      powerText: typeof m.powerText === 'string' ? m.powerText : '',
      at: Math.floor(asTimestamp(m.at, 0)),
      ...(typeof m.ruleset === 'string' ? { ruleset: m.ruleset } : {}),
      ...(fixedContext ? { context: fixedContext } : {}),
      ...(replay ? { replay } : {})
    })
  }
  // 与 addMark 同上限 MAX_MARKS
  return out.slice(0, MAX_MARKS)
}

export const useEndgameStore = defineStore(
  'endgame',
  () => {
    /** 本世道途(转世后重选) */
    const daoPath = ref<DaoPathId | null>(null)
    // 道源的上界,只为拦坏档;真实累积到不了百万
    const DAO_SOURCE_MAX = 1e9
    /*
     * 一趟远征里两个计数的上界 —— **按各自的真实上限分别定**,不共用一个数。
     *
     * 逐胜叠层:`入界 + 每层择路 + 界主` 共 `EXPEDITION_ROUTE_LAYERS + 2 = 5` 战,
     * 故叠层不可能超过 5;留一档余量到 16。
     *
     * 沿途道源(`run.bonus`)是**累计的路线奖励、会并入最终结算**
     * (`reward = world.rewardDaoSource + run.bonus`)。节点 bonus 实测取值
     * 8/10/12/14/16,三层各取一个 → 正常上限 48。首版把两个计数共用一个 16 的
     * 上界,会直接吞掉玩家已经挣到的道源(审查意见里那条「高」)。
     * 取 256:宽到任何真实路线都够,窄到拦得住 1e300。
     */
    const WORLD_RUN_STACKS_MAX = 16
    /*
     * 沿途道源:`run.bonus` 在每次**择路**后累加当层节点的 bonus,
     * 而择路只发生在 `layer 0..EXPEDITION_ROUTE_LAYERS-1` —— 即最多
     * `EXPEDITION_ROUTE_LAYERS`(3)次。节点 bonus 实测最大 16,故一趟最多 48。
     * 取 256 留五倍余量:正常到不了,越过的必定是坏档。
     */
    const WORLD_RUN_BONUS_MAX = 256
    // 两处都走 asFiniteNumber 的第四个参数,不再手写 Math.min(统一钳制规则)

    /** 道源(跨世保留) */
    const daoSource = ref(0)
    const worldClears = ref<Record<string, number>>({})
    const trialRecords = ref<Record<string, TrialRecord>>({})
    const marks = ref<DaoMark[]>([])
    /** 进行中的路线远征(null = 无) */
    const worldRun = ref<WorldRunState | null>(null)
    /** 历练在途的只读投影:终局核心与入口共用同一份在途判据 */
    const adventureSession = computed(() => useAdventureStore().session)
    /** 当前虚界(程序化生成并过审;id 恒为 'void') */
    const voidWorld = ref<CelestialWorldDef | null>(null)
    /** 今日天道完成日(day number;跨世保留) */
    const dailyDoneDay = ref<number | null>(null)
    /** 修行节点:跨世保留的「首次」历史 */
    const milestones = ref<{ id: string; life: number; at: number }[]>([])
    /** 极限纪录:只与过去的自己比 */
    const records = ref<Record<string, { value: number; life: number; note: string }>>({})

    // 一次性教学标记:终局导览 / 道果解释 / 资源说明已阅
    const endgameTutorialSeen = ref(false)
    const daoFruitTutorialSeen = ref(false)
    const resourceDialogSeen = ref(false)
    /** 器魂:持有池 + 已装配(至多 SOUL_SLOTS 枚) */
    const souls = ref<SoulInstance[]>([])
    const equippedSouls = ref<string[]>([])
    const soulTutorialSeen = ref(false)

    /** 存档修复:道痕/器魂/纪录表坏形会让天界页渲染期抛错。 */
    function sanitize(): void {
      // 认不出的道途回落 null(同转世后未择道);否则选道被「此生道途已定」挡回
      daoPath.value = typeof daoPath.value === 'string' && daoPathDef(daoPath.value) ? (daoPath.value as DaoPathId) : null
      /*
       * 上界只为拦坏档:道源按「道果 ×200」这类速率累积,真实游玩到不了百万。
       * 原先 `asFiniteNumber(v, 0, 0)` 只给了下限 —— 而 `1e300` 是有限数,
       * 原样通过,界面经 formatNum 印成「1.00e300」。实测灌 1e300 后 sanitize 不修。
       *
       * **越界要归零,不是夹到上界**:夹到 1e9 等于凭空送给玩家十亿道源,
       * 而道源是可以直接花掉的(熔炉、器魂)。坏值本来就没有可信来源,
       * 与「非有限」同一条退路 —— 归 0。
       */
      const rawDaoSource = asFiniteNumber(daoSource.value, 0, 0)
      daoSource.value = rawDaoSource > DAO_SOURCE_MAX ? 0 : rawDaoSource
      // 一次性引导标记:与 settings 的布尔开关同一套清洗纪律
      endgameTutorialSeen.value = endgameTutorialSeen.value === true
      daoFruitTutorialSeen.value = daoFruitTutorialSeen.value === true
      resourceDialogSeen.value = resourceDialogSeen.value === true
      soulTutorialSeen.value = soulTutorialSeen.value === true
      /*
       * 「已破 ×N」只留认得的天界/虚界,次数收口为非负整数**且封顶**。
       *
       * 界面上那处是裸插值(`已破 ×{{ endgame.worldClears[world.id] }}`),
       * 而 `asNumberRecord` 只判 `Number.isFinite` —— 坏档写 1e300 会印成「已破 ×1e+300」。
       * 一局里破一界几百次已经极多,取一万已极宽。
       */
      const fixedClears: Record<string, number> = {}
      for (const [id, n] of Object.entries(asNumberRecord(worldClears.value, 0))) {
        if (id !== 'void' && !celestialWorldDef(id)) continue
        fixedClears[id] = Math.floor(asFiniteNumber(n, 0, 0, WORLD_CLEARS_MAX))
      }
      worldClears.value = fixedClears
      // 试炼纪录同理;bestRounds 的 NaN 经 `Math.min(NaN, x)` 再也好不了
      const fixedTrials: Record<string, TrialRecord> = {}
      for (const [id, raw] of Object.entries(asRecordOf<TrialRecord>(trialRecords.value, r => !!r && typeof r === 'object'))) {
        if (!trialDef(id)) continue
        const r = raw as Partial<TrialRecord>
        const clears = Math.floor(asFiniteNumber(r.clears, 0, 0, TRIAL_CLEARS_MAX))
        if (clears <= 0) continue
        // 「最佳 N 回合」同样是裸插值;回合数真实是两位到三位数
        fixedTrials[id] = {
          clears,
          bestRounds: Math.floor(asFiniteNumber(r.bestRounds, 0, 0, BATTLE_ROUNDS_CAP))
        }
      }
      trialRecords.value = fixedTrials
      marks.value = sanitizeMarks(marks.value)
      worldRun.value = asObjectOrNull<WorldRunState>(worldRun.value)
      // 远征进行时每场都读 layer/carriedHpPct/winStacks,须夹回合法值;认不得的世界整趟作废
      if (worldRun.value) {
        const run = worldRun.value
        const worldOk = !!celestialWorldDef(run.worldId) || run.worldId === 'void'
        if (!worldOk) {
          worldRun.value = null
        } else {
          const rows = asArray<WorldRunState['rows'][number]>(
            run.rows,
            [],
            r => !!r && typeof (r as { foeName?: unknown }).foeName === 'string'
          ).map(r => ({
            foeName: r.foeName,
            win: r.win === true,
            // 战报行里的回合数也是裸插值
            rounds: Math.floor(asFiniteNumber(r.rounds, 0, 0, BATTLE_ROUNDS_CAP)),
            hpLeftPct: asFiniteNumber(r.hpLeftPct, 0, 0, 1)
          }))
          worldRun.value = {
            ...run,
            // 认不出的契约/门回落未立契约/未择门:否则规则静默失效,界面仍挂着名字
            pactId: typeof run.pactId === 'string' && pactDef(run.pactId) ? run.pactId : null,
            gateId: typeof run.gateId === 'string' && gateDef(run.gateId) ? run.gateId : null,
            layer: Math.min(EXPEDITION_GUARDIAN_LAYER, Math.max(0, Math.floor(asFiniteNumber(run.layer, 0, 0)))),
            /*
             * 上界按「一趟远征最多几战」推:入界 + 每层择路 + 界主 = ROUTE_LAYERS+2 = 5 战,
             * 故逐胜叠层不可能超过 5。`bonus`(沿途道源)同量级。
             * 这两个数会**乘进战斗属性**(见 expedition 的 stackedMods),
             * 坏档写 1e300 会让玩家攻击瞬间无限大。原先只有下限,实测原样保留。
             */
            bonus: Math.floor(asFiniteNumber(run.bonus, 0, 0, WORLD_RUN_BONUS_MAX)),
            rows,
            carriedHpPct: asCarriedHpPct(run.carriedHpPct),
            // 总回合以逐行战报回合和为准,不一致会让杀伐速战赏与道痕多给;无 rows 的旧档保留原值
            /*
             * 两条路都要封顶:rows 非空时是**逐行累加**,空时取存档原值。
             * 首版只封了后者 —— 而逐行求和同样会越过上限(每行本身已夹到
             * BATTLE_ROUNDS_CAP,五行相加就能到五倍)。
             */
            totalRounds: Math.min(
              WORLD_RUN_ROUNDS_MAX,
              rows.length > 0
                ? rows.reduce((sum, row) => sum + row.rounds, 0)
                : Math.floor(asFiniteNumber(run.totalRounds, 0, 0))
            ),
            winStacks: Math.floor(asFiniteNumber(run.winStacks, 0, 0, WORLD_RUN_STACKS_MAX)),
            // 逆命契封印每场并入玩家属性;整份不可用视为无封印
            sealedMods: sanitizeMods(run.sealedMods) ?? undefined
          }
        }
      }
      voidWorld.value = sanitizeVoidWorld(voidWorld.value)
      /**
       * 虚界远征须有可解析的虚界,且须在 voidWorld 修形之后判。
       * 否则 resolveWorld('void') 返回 undefined:在途面板与「中道而返」隐藏,新远征又被拒。
       */
      if (worldRun.value?.worldId === 'void' && !voidWorld.value) {
        worldRun.value = null
      }
      /*
       * 天道日记号不许落在今天之后。
       *
       * 闸门写的是 `dailyDoneDay === daily.day`,闸门值小时它恒真(选不了),大时恒假(可重复挑战)。
       * 坏档(时钟调快过)正好给的是后者 —— 实测一年后的日期能一路通过 sanitize。
       * 超出今天的归 null,即「今日未挑战」。
       */
      dailyDoneDay.value =
        typeof dailyDoneDay.value === 'number' && Number.isFinite(dailyDoneDay.value) && dailyDoneDay.value >= 0
          ? Math.floor(dailyDoneDay.value) > localDayNum(Date.now())
            ? null
            : Math.floor(dailyDoneDay.value)
          : null
      // 修行节点只认 MILESTONE_DEFS 里的 id:野 id 会把「修行节点 N/总数」顶破
      milestones.value = asArray<{ id: string; life: number; at: number }>(
        milestones.value,
        [],
        m => !!m && typeof (m as { id?: unknown }).id === 'string' && !!milestoneDef((m as { id: string }).id)
      ).map(m => ({
        id: m.id,
        life: Math.floor(asFiniteNumber(m.life, 0, 0, LIFE_COUNTER_CAP)),
        at: Math.floor(asTimestamp(m.at, 0))
      }))
      // 「首次」语义(同 addMilestone):同 id 只留先出现的那条
      const seenMilestone = new Set<string>()
      milestones.value = milestones.value.filter(m => {
        if (seenMilestone.has(m.id)) return false
        seenMilestone.add(m.id)
        return true
      })
      const fixedRecords: Record<string, { value: number; life: number; note: string }> = {}
      for (const [id, raw] of Object.entries(
        asRecordOf<{ value: number; life: number; note: string }>(records.value, r => !!r && typeof r === 'object' && !Array.isArray(r))
      )) {
        if (!recordDef(id)) continue
        const r = raw as Partial<{ value: number; life: number; note: string }>
        const value = asFiniteNumber(r.value, 0)
        // 纪录值以正数为语义:0 回合的破界、0 道源的赏格不算成绩
        if (value <= 0) continue
        fixedRecords[id] = {
          value,
          life: Math.floor(asFiniteNumber(r.life, 0, 0, LIFE_COUNTER_CAP)),
          /*
           * note 截到 NAME_MAX_LENGTH,与 updateRecord 的写入路径同一把尺。
           * 上一轮只补了 updateRecord,读档这条仍能塞进几十万字符
           * (实测塞 10 万字后 $state 序列化出来 100343 字节)。
           */
          note: typeof r.note === 'string' ? truncateCodePoints(r.note.trim(), NAME_MAX_LENGTH) : ''
        }
      }
      records.value = fixedRecords
      /**
       * 器魂 uid 须唯一:同号会让 `activeSouls` 把同一枚算两次。
       * 品阶是 `SOUL_GRADES[rank]!` 的裸下标,坏值会让器魂页渲染抛错。
       * 坏品阶夹回 [0, 顶阶] 而不丢弃:器魂是烧掉法器换来的。
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
      equippedSouls.value = [...new Set(asStringArray(equippedSouls.value))]
      // 清掉已不存在的 uid:否则幽灵占槽,再装配静默失败
      const soulUids = new Set(souls.value.map(s => s.uid))
      // 截到 SOUL_SLOTS,与 equipSoul 的硬闸同尺;保留先装的,与「槽满即拒」同序
      equippedSouls.value = equippedSouls.value.filter(id => soulUids.has(id)).slice(0, SOUL_SLOTS)
    }

    /** 已装配器魂(过滤掉已不存在的 uid) */
    const activeSouls = computed<SoulInstance[]>(() => {
      // 旧档/坏档里两字段可能不是数组,渲染期抛错会让 Vue 反复重试
      const equipped = equippedSouls.value
      const pool = souls.value
      if (!Array.isArray(equipped) || !Array.isArray(pool)) return []
      return equipped.map(id => pool.find(s => s.uid === id)).filter((s): s is SoulInstance => s !== undefined)
    })

    /** 持有的器魂(恒为数组) */
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
      // 槽位按 activeSouls 计(已滤幽灵)
      if (activeSouls.value.length >= SOUL_SLOTS) return false
      if (!soulList.value.some(s => s.uid === uid)) return false
      equippedSouls.value = [...equipped, uid]
      return true
    }

    function unequipSoul(uid: string): void {
      equippedSouls.value = (Array.isArray(equippedSouls.value) ? equippedSouls.value : []).filter(id => id !== uid)
    }

    /** 散去器魂(不可逆) */
    function dissolveSoul(uid: string): void {
      souls.value = soulList.value.filter(s => s.uid !== uid)
      equippedSouls.value = (Array.isArray(equippedSouls.value) ? equippedSouls.value : []).filter(id => id !== uid)
    }

    const totalClears = computed(() => {
      const worlds = asRecord<number>(worldClears.value)
      const trials = asRecordOf<TrialRecord>(trialRecords.value, r => !!r && typeof r === 'object')
      return (
        Object.values(worlds).reduce((s, n) => s + asFiniteNumber(n, 0, 0), 0) +
        Object.values(trials).reduce((s, r) => s + Math.floor(asFiniteNumber(r.clears, 0, 0)), 0)
      )
    })

    function chooseDao(id: DaoPathId): boolean {
      if (daoPath.value !== null && daoPathDef(daoPath.value)) return false
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
      const clears = asNumberRecord(worldClears.value, 0)
      /*
       * 自增要饱和。`sanitize` 只在开场跑一次,而这里每次通关都 +1 ——
       * 不封顶的话,拖到上限之后重启会被夹回来,玩家看到「已破 ×N」变小。
       * 与 `diag.record` 的自增封顶同一条理:两处用同一个常量。
       */
      worldClears.value = {
        ...clears,
        [worldId]: Math.min(WORLD_CLEARS_MAX, Math.floor(clears[worldId] ?? 0) + 1)
      }
    }

    function recordTrial(trialId: string, rounds: number): void {
      if (!trialDef(trialId) || !Number.isFinite(rounds) || rounds <= 0) return
      /*
       * 回合数也要封顶 —— 它与 `bestRounds` 出自同一处,
       * 而读档守卫已按 `BATTLE_ROUNDS_CAP` 夹过;这里不夹的话,
       * 一次坏入参(比如别处传了个 1e300)就能让「最佳 N 回合」当场变成科学计数。
       */
      const fixedRounds = Math.min(BATTLE_ROUNDS_CAP, Math.max(1, Math.floor(rounds)))
      const records = asRecordOf<TrialRecord>(trialRecords.value, r => !!r && typeof r === 'object')
      const prev = records[trialId]
      trialRecords.value = {
        ...records,
        [trialId]: {
          // 同 recordWorldClear:自增要饱和,否则重启后计数会变小
          clears: Math.min(TRIAL_CLEARS_MAX, Math.floor(asFiniteNumber(prev?.clears, 0, 0)) + 1),
          bestRounds: prev ? Math.min(Math.max(1, Math.floor(asFiniteNumber(prev.bestRounds, fixedRounds, 1))), fixedRounds) : fixedRounds
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
      /*
       * note 要截到 NAME_MAX_LENGTH。它有两个来源:
       *   1. 自建挑战的书名 —— 输入框写了 maxlength=8,但那只是输入侧的约束;
       *   2. 读档 —— 手改存档能塞进几十万字符,存档爆量且纪录行要渲染那一整段。
       * 与 player.name / loadouts.name 同一把尺(见 data/constants 里 NAME_MAX_LENGTH 的注释)。
       */
      const fixedNote = truncateCodePoints(note.trim(), NAME_MAX_LENGTH)
      records.value = { ...records.value, [id]: { value, life: Math.floor(life), note: fixedNote } }
      return true
    }

    /** 转世:道途与进行中的远征清空,道源与道痕保留 */
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
      adventureSession,
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
