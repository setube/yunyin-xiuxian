/** 玩家状态 —— 境界 / 修为 / 寿元 / 灵根 / 最终属性汇总 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FinalStats, GNum, LinggenProfile, StatMods, WorldId } from '@/types'
import { gn, gnZero, add, gte, mulN, progress, subClamp } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { realmDef, realmLabel, worldOf, WORLDS, SUB_NAMES, MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS, START_AGE } from '@/data/constants'
import { QI_BANK_MULT, QI_RICH_RATIO } from '@/data/constants'
import {
  STAR_FOCUS_COST_BASE, MANSION_REDIRECT_COST, MANSION_REDIRECT_MAX,
  WUDAO_EXCHANGE_PRICE_BASE, WUDAO_EXCHANGE_GAIN, WUDAO_EXCHANGE_PER_DAY
} from '@/data/constants'
import { legacyInsightOf } from '@/data/samsara'
import { titleDef } from '@/data/titles'
import { petDef } from '@/data/pets'
import type { PetDef } from '@/types'
import { mentorDef } from '@/data/mentors'
import { talentDef } from '@/data/talents'
import { heritageDef } from '@/data/heritage'
import { CHAINS } from '@/data/chains'
import { birthMajorFloor } from '@/core/heritageEffects'
import { sanitizeLinggen } from '@/core/linggenGen'
import { randomDaoName } from '@/data/names'
import { rng } from '@/utils/random'
import { baseCultPerSec, baseQiRegen, expRequirement, gameDay, qiCap } from '@/core/formulas'
import { computeFinalStats, mergeMods, modOf } from '@/core/statsCalc'
import { todayWeather } from '@/core/weather'
import { divinationActiveAt, readingFromState, readingMods } from '@/core/divination'
import { gameNow } from '@/core/enginePause'
import { asArray, asCarriedHpPct, asFiniteNumber, asNumberRecord, asRecord, asStringArray } from '@/utils/saveShape'
import { SECRET_LAYERS, SECRET_MAX_LOSSES, SECRET_REALMS, secretRuleByText } from '@/data/secretRealms'
import { DAOLU, ENDING_NAMES, STAGE_NAMES, STAGE_ORDER, type BondEnding, type BondStage } from '@/data/daolu'
import { lifeThemeDef } from '@/data/lifeThemes'
import { bondEventDef } from '@/data/bondEvents'
import { regionDef } from '@/data/regions'
// 事件表从 data/ 引:core/regionEvent 依赖本 store,反向 import 会成环
import { regionEventDef } from '@/data/regionEvents'
import { artifactSlotsFor } from '@/data/artifacts'
import { lifeTrialDef, type LifeTrialState } from '@/data/lifeTrials'
import { STARS } from '@/data/ziwei'
import { fateChart, fateFocusMods, fateSeed } from '@/core/fate'
import type { MansionRedirect } from '@/core/astronomy'
import { mansionRedirectCheck } from '@/core/mansionRedirect'
import { wudaoExchangeState as evaluateWudaoExchange, type WudaoExchangeState } from '@/core/wudaoExchange'
import type { FortuneChoice } from '@/core/fortuneChain'
import { useInventoryStore } from './inventory'
import { useCultivationStore } from './cultivation'
import { useDongfuStore } from './dongfu'
import { useApprenticeStore } from './apprentice'
import { useResourcesStore } from './resources'
import { useEndgameStore } from './endgame'
import { useGameStore } from './game'

/** 修行速率下限乘数:负增益下修为/灵气增速也不归零 */
const MIN_SPEED_MULT = 0.05

export const usePlayerStore = defineStore(
  'player',
  () => {
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    const dongfu = useDongfuStore()
    const apprentices = useApprenticeStore()
    const resources = useResourcesStore()

    const name = ref('无名散修')
    const linggen = ref<LinggenProfile | null>(null)
    const major = ref(0)
    const sub = ref(0)
    const exp = ref<GNum>(gnZero())
    const age = ref(START_AGE)
    const lifespanBonusYears = ref(0)
    const titleId = ref<string | null>(null)
    const petId = ref<string | null>(null)
    const dead = ref(false)
    /**
     * 轮回。count 只是历史计数,不承担成长职责;insight(宿慧)是分阶依据,lives 是历世履历,vow 是这一世立下的题。
     * insight 只存历世阅历 + 已达成的命题;认知折算的那份每次从 lore store 实时算(见 core/samsaraService.ts)。
     */
    const reincarnation = ref({
      count: 0,
      daoFruit: 0,
      talents: [] as string[],
      /** 宿命传承:跨世永久的能力位,不清零(锻造生命周期见 core/heritageForge) */
      heritage: [] as string[],
      /**
       * 本世各传承效果已用几回(渡劫跬步每世一回、浴火丹心本世三炉):rebirth() 清空;
       * 须落档,否则刷新页面即重置用量(见 sanitizeHeritageUses)
       */
      heritageUses: {} as Record<string, number>,
      insight: 0,
      lives: [] as import('@/data/samsara').LifeRecord[],
      vow: null as import('@/data/samsara').LifeVow | null,
      /** 这一世签下的逆旅契;转世时清空 */
      trial: null as import('@/data/lifeTrials').LifeTrialState | null,
      /** 历世的关系履历(曾与谁走到哪一步),宿缘重逢的依据;下一世不带回道侣 */
      bonds: [] as import('@/core/daoluService').BondRecord[]
    })

    /** 这一世的关系(历史在 reincarnation.bonds);转世时清空 */
    const bond = ref<import('@/core/daoluService').BondState | null>(null)

    /** 奇缘进度:链 id → 已走完的段数(见 core/eventEngine 的 pendingChainStages) */
    const eventChains = ref<import('@/types').EventChainState>({})
    const winStreak = ref(0)
    const lastCaveEventDay = ref(0) // 上次洞府巡游日期

    // 区域镇压
    const regionStats = ref<Record<string, import('@/core/suppress').RegionStats>>({})
    const suppressedRegions = ref<string[]>([])
    /**
     * 镇压资格:本世取得即永久,随时可切回收益态;是否正在收益见 suppressedRegions。
     * rebirth() 清空:跨世保留会让新世按旧阶位派发高阶装备与灵石。
     */
    const suppressQualified = ref<string[]>([])
    /** 区域 → 镇压开始时间戳(供复苏判定) */
    const suppressedSince = ref<Record<string, number>>({})
    /**
     * 镇压物产的小数累积器:区域 → 还没凑够一件的零头(<1),攒够一件即入账。
     * 每 tick 直接 floor 会让在线所得恒为 0;累积后在线长挂与离线一次折算等价。
     */
    const suppressFrac = ref<Record<string, number>>({})
    /**
     * 镇压权益所属世号(reincarnation.count):与当前世不符才是旧世残留。
     * 用 minRealm > 当前境界 判残留会没收本世打下的高境镇压(进入只受解锁链管,不受 minRealm 管)。
     * 默认 −1 是老档哨兵:读档时按旧境界兜底清一次并把世号补盖成当前世(见 sanitize)。
     */
    const suppressLife = ref(-1)

    // 师承:跨世保留
    const mentor = ref<import('@/data/mentors').MentorId | null>(null)

    // 区域动态事件:单区域内一次一个,自动过期
    const regionEvent = ref<import('@/core/regionEvent').RegionEventState | null>(null)

    // 短期秘境(进行中状态)
    const secretRealm = ref<import('@/core/secretRealm').SecretRealmState | null>(null)

    /** 问卦所得之卦:过期自散;转世不带 */
    const divination = ref<import('@/core/divination').DivinationState | null>(null)

    /** 突破准备(静坐/聚气丹):付费的一次性加成,须存进档(放模块态刷新即丢) */
    const breakthroughPrep = ref<import('@/core/earlyGameService').BreakthroughPrepState | null>(null)

    /** 上次顿悟的时刻:频次闸,须随档(挂在模块上刷新即冷却归零);跨世保留 */
    const enlightenmentAt = ref(0)

    // 机缘选择记忆(取/弃):影响师承推荐与未来同类机缘
    const fortuneChoices = ref<Record<string, FortuneChoice>>({})

    // 世界记忆
    /** 宿敌列表(同一敌人败我 ≥3 次) */
    const nemeses = ref<import('@/types').NemesisRecord[]>([])
    /**
     * 区域总胜场,供兴衰状态派生;独立于 regionStats,只计纯胜场。
     * 胜场跨世留作叙事,兴衰判据只认本世(否则旧世胜场让新世直接判「繁盛」)。
     */
    const regionWins = ref<Record<string, number>>({})
    /** 区域胜场的世号:与 regionWins 同键、须同步;兴衰判据读它 */
    const regionWinsLife = ref<Record<string, number>>({})

    // ---------- 境界 ----------
    const realm = computed(() => realmDef(major.value))
    const realmName = computed(() => realmLabel(major.value, sub.value))
    const world = computed(() => worldOf(major.value))
    const worldName = computed(() => world.value.name)
    const subName = computed(() => SUB_NAMES[Math.min(sub.value, SUB_NAMES.length - 1)]!)
    const expReq = computed(() => expRequirement(major.value, sub.value))
    const expProgress = computed(() => progress(exp.value, expReq.value))
    const expFull = computed(() => gte(exp.value, expReq.value))
    /** 修为积余:越过当前突破需求的部分,卡境期间继续累积,突破时随境界带走 */
    const expOverflow = computed(() => subClamp(exp.value, expReq.value))
    const isMajorStep = computed(() => sub.value >= SUB_LEVELS - 1)
    const atMaxRealm = computed(() => major.value >= MAX_MAJOR && sub.value >= SUB_LEVELS - 1)

    // ---------- 属性汇总 ----------
    const talentMods = computed<StatMods[]>(() => reincarnation.value.talents.map(id => talentDef(id)?.mods ?? {}))
    const titleMods = computed<StatMods>(() => (titleId.value ? (titleDef(titleId.value)?.mods ?? {}) : {}))
    const mentorMods = computed<StatMods>(() => {
      if (!mentor.value) return {}
      return mentorDef(mentor.value)?.mods ?? {}
    })

    /** 当天天时并入最终属性:战斗/掉落/渡劫均读 finalStats.mods,并入即全链路生效,无需各自接线 */
    const weatherMods = computed<StatMods>(() => todayWeather().mods)

    /** 在身之卦:与天时同法并入最终属性,过期即散 */
    const activeDivination = computed(() => {
      // 读一次心跳作依赖:否则 computed 只记住第一次结果,卦过期不散(见 engine 的 addPlayTime)
      void useGameStore().totalPlaySec
      return divinationActiveAt(divination.value, gameNow())
    })
    const divinationMods = computed<StatMods>(() => {
      const state = activeDivination.value
      if (!state) return {}
      const reading = readingFromState(state)
      return reading ? readingMods(reading) : {}
    })

    /** 本世命格(紫微十二宫):由灵根与转世数确定性推出,不落状态;转世重算 */
    const chart = computed(() => fateChart(fateSeed(linggen.value, reincarnation.value.count)))
    /**
     * 命格点化主星 id,null 为未点化;存档状态,转世清空。
     * sanitize 按白名单(十四主星)校验,认不出的清回 null。
     */
    const fateFocus = ref<string | null>(null)
    const fateModsValue = computed<StatMods>(() => fateFocusMods(chart.value, fateFocus.value))

    /**
     * 星象值日定向:今日所利界域的覆盖。gameDay 不是今天即不生效(无需清理);
     * count 记当日已定向几次,上限 MANSION_REDIRECT_MAX。不改二十八宿轮值,仍只利一界 +10%。
     */
    const mansionRedirect = ref<MansionRedirect | null>(null)

    /** 灵石→悟道兑换的当日计数:gameDay 不是今天即从 0 重算(无需清理);每日上限 WUDAO_EXCHANGE_PER_DAY */
    const wudaoExchange = ref<{ gameDay: number; count: number }>({ gameDay: 0, count: 0 })

    /**
     * Mod sources except the pet itself. beastPct/qiCapPct must not read
     * finalStats (qiRich → qiCap → finalStats would cycle; pet scaling
     * cannot include the pet's own mods).
     */
    const ownedModSources = computed(() => [
      inventory.equipMods,
      cultivation.gongfaMods,
      cultivation.buffMods,
      dongfu.buildingMods,
      dongfu.veinMods,
      titleMods.value,
      mentorMods.value,
      weatherMods.value,
      divinationMods.value,
      fateModsValue.value,
      ...talentMods.value
    ])

    // 灵兽出战实际加成:基础词缀 × 灵兽园等级(beastMult) × 安抚灵兽增益(beastPct)
    // 图鉴/兽苑卡片须按它渲染,给 base 会与角色面板来源明细对不上
    function petModsFor(def: PetDef): StatMods {
      const beastPct = 1 + modOf(mergeMods(ownedModSources.value), 'beastPct')
      const scaled: StatMods = {}
      for (const k in def.mods) {
        const key = k as keyof StatMods
        scaled[key] = (def.mods[key] ?? 0) * dongfu.beastMult * beastPct
      }
      return scaled
    }
    const petMods = computed<StatMods>(() => {
      if (!petId.value) return {}
      const def = petDef(petId.value)
      if (!def) return {}
      return petModsFor(def)
    })

    const qiCapValue = computed(() => {
      const capPct = 1 + modOf(mergeMods([...ownedModSources.value, petMods.value]), 'qiCapPct')
      return Math.floor(qiCap(major.value, sub.value) * dongfu.qiCapMult * capPct)
    })
    const qiRich = computed(() => resources.qi >= qiCapValue.value * QI_RICH_RATIO)
    /** 灵气积余上限:卡境期间灵气可存到此处 */
    const qiBankCapValue = computed(() => qiCapValue.value * QI_BANK_MULT)

    const finalStats = computed<FinalStats>(() =>
      computeFinalStats({
        major: major.value,
        sub: sub.value,
        linggenMult: linggen.value?.growthMult ?? 1,
        modSources: [
          inventory.equipMods,
          cultivation.gongfaMods,
          cultivation.buffMods,
          dongfu.buildingMods,
          dongfu.veinMods,
          titleMods.value,
          mentorMods.value,
          petMods.value,
          weatherMods.value,
          divinationMods.value,
          fateModsValue.value,
          ...talentMods.value
        ],
        // 须与上面一一对应,面板「来源明细」直接读它们
        // 天时名带当天气象,与 mods 同取自 todayWeather();清和日无词条,该行不出现
        sourceNames: [
          '装备',
          '功法',
          '丹药与增益',
          '洞府建筑',
          '灵脉',
          '称号',
          '师承',
          '灵兽',
          `天时·${todayWeather().name}`,
          '在身之卦',
          '命格',
          ...reincarnation.value.talents.map(id => `天赋·${talentDef(id)?.name ?? id}`)
        ],
        /** 凡界平铺三维:装备攻防血由此进入(见 core/statsCalc) */
        equipFlats: inventory.equipFlats,
        daoFruit: reincarnation.value.daoFruit,
        qiRich: qiRich.value
      })
    )

    const celestialStats = computed<FinalStats>(() => {
      const endgame = useEndgameStore()
      return computeFinalStats({
        major: major.value,
        sub: sub.value,
        linggenMult: linggen.value?.growthMult ?? 1,
        modSources: [
          /**
           * 天界口径:凡界装备照常作数(词条与平铺三维都算),器魂叠加其上;用器魂替换凡器会抹平天界绝对强度。
           * 天界的差别落在敌人一侧(道之理解、境界压制,见 core/gauntlet.celestialJudgement)。
           */
          inventory.equipMods,
          endgame.activeSouls.length > 0 ? endgame.soulMods : {},
          cultivation.gongfaMods,
          cultivation.buffMods,
          dongfu.buildingMods,
          dongfu.veinMods,
          titleMods.value,
          mentorMods.value,
          petMods.value,
          weatherMods.value,
          divinationMods.value,
          fateModsValue.value,
          ...talentMods.value
        ],
        sourceNames: [
          '凡界装备',
          '器魂',
          '功法',
          '丹药与增益',
          '洞府建筑',
          '灵脉',
          '称号',
          '师承',
          '灵兽',
          '天时',
          '在身之卦',
          '命格',
          ...reincarnation.value.talents.map(id => `天赋·${talentDef(id)?.name ?? id}`)
        ],
        equipFlats: inventory.equipFlats,
        daoFruit: reincarnation.value.daoFruit,
        qiRich: qiRich.value
      })
    })

    const cultPerSec = computed(
      () => baseCultPerSec(major.value, sub.value) * Math.max(MIN_SPEED_MULT, 1 + modOf(finalStats.value.mods, 'cultivationSpeed'))
    )
    const qiRegenPerSec = computed(() => baseQiRegen(major.value) * Math.max(MIN_SPEED_MULT, 1 + modOf(finalStats.value.mods, 'qiRegen')))

    // ---------- 寿元 ----------
    const lifespanMax = computed(() => {
      const base = realm.value.lifespanYears
      return Math.floor(base * (1 + modOf(finalStats.value.mods, 'lifespanPct')) + lifespanBonusYears.value)
    })
    const lifespanRatio = computed(() => Math.max(0, 1 - age.value / Math.max(1, lifespanMax.value)))

    // ---------- 动作 ----------
    function initCharacter(newName: string, profile: LinggenProfile): void {
      name.value = newName
      linggen.value = profile
      major.value = 0
      sub.value = 0
      exp.value = gnZero()
      age.value = START_AGE
      lifespanBonusYears.value = 0
      dead.value = false
    }

    /** 增加修为,不封顶(越过需求的部分即积余) */
    function gainExp(v: GNum): void {
      exp.value = add(exp.value, v)
    }

    function loseExpPct(pct: number): void {
      exp.value = subClamp(exp.value, mulN(exp.value, pct))
    }

    function advanceRealm(): void {
      // 先记下刚走完这一境的需求:突破只扣这一份
      const spent = expReq.value
      if (isMajorStep.value) {
        if (major.value < MAX_MAJOR) {
          major.value += 1
          sub.value = 0
        }
      } else {
        sub.value += 1
      }
      exp.value = subClamp(exp.value, spent)
    }

    function addAge(years: number): void {
      if (!Number.isFinite(years) || years < 0) return
      age.value += years
    }

    function addLifespan(years: number): void {
      if (!Number.isFinite(years) || years <= 0) return
      lifespanBonusYears.value += years
    }

    function setTitle(id: string | null): void {
      titleId.value = id
    }

    function setPet(id: string | null): void {
      petId.value = id
    }

    function addTalent(id: string): void {
      if (!reincarnation.value.talents.includes(id)) {
        reincarnation.value = {
          ...reincarnation.value,
          talents: [...reincarnation.value.talents, id]
        }
      }
    }

    function addDaoFruit(n: number): void {
      if (!Number.isFinite(n) || n <= 0) return
      const amount = Math.floor(n)
      if (amount <= 0) return
      reincarnation.value = { ...reincarnation.value, daoFruit: reincarnation.value.daoFruit + amount }
    }

    /** 宿命传承:锻造由 core/heritageForge.lifeForge 判定,在 confirmReincarnation 落账 */
    function addHeritage(id: string): void {
      if (!reincarnation.value.heritage.includes(id)) {
        reincarnation.value = {
          ...reincarnation.value,
          heritage: [...reincarnation.value.heritage, id]
        }
      }
    }

    /** 消耗一次「每世 N 回」传承效果(渡劫跬步 / 浴火丹心);用量只落在本世,rebirth 清空 */
    function consumeHeritageUse(id: string, max = 1): boolean {
      if (!reincarnation.value.heritage.includes(id)) return false
      const used = reincarnation.value.heritageUses[id] ?? 0
      if (used >= max) return false
      reincarnation.value = {
        ...reincarnation.value,
        heritageUses: { ...reincarnation.value.heritageUses, [id]: used + 1 }
      }
      return true
    }

    function sanitizeHeritageUses(raw: unknown): Record<string, number> {
      const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const out: Record<string, number> = {}
      for (const [id, n] of Object.entries(src)) {
        if (!heritageDef(id)) continue
        const v = Number(n)
        if (Number.isFinite(v) && v > 0) out[id] = Math.floor(v)
      }
      return out
    }

    /** 逆旅契形状修复:坏档 trial 一律归 null,否则 canSignLifeTrial 只见「已立契」,须等转世才解 */
    function sanitizeTrial(raw: unknown): LifeTrialState | null {
      if (typeof raw !== 'object' || raw === null) return null
      const t = raw as { trialId?: unknown; at?: unknown; paid?: unknown }
      if (typeof t.trialId !== 'string' || !lifeTrialDef(t.trialId)) return null
      if (!Number.isFinite(t.at) || !Number.isFinite(t.paid)) return null
      return { trialId: t.trialId, at: t.at as number, paid: t.paid as number }
    }

    /**
     * 历世履历修形:字段直接印到轮回页,一条 `null` 会白屏,`NaN` 会印成「第 NaN 世」。
     * 认不出的命题/逆旅契 id 回落 null(同「本世未立题/未签约」);认不出的结局回落 null,界面按「未竟」兜底。
     */
    function sanitizeLives(raw: unknown): import('@/data/samsara').LifeRecord[] {
      const out: import('@/data/samsara').LifeRecord[] = []
      for (const item of asArray<unknown>(raw)) {
        if (!item || typeof item !== 'object') continue
        const l = item as Partial<import('@/data/samsara').LifeRecord>
        const themeResult =
          l.themeResult === 'done' || l.themeResult === 'broken' || l.themeResult === 'unfinished' ? l.themeResult : null
        const bond = l.bond && typeof l.bond === 'object' ? l.bond : null
        out.push({
          index: Math.max(0, Math.floor(asFiniteNumber(l.index, 0, 0))),
          major: Math.max(0, Math.floor(asFiniteNumber(l.major, 0, 0))),
          realmLabel: typeof l.realmLabel === 'string' ? l.realmLabel : '',
          age: Math.max(0, Math.floor(asFiniteNumber(l.age, 0, 0))),
          themeId: typeof l.themeId === 'string' && lifeThemeDef(l.themeId) ? l.themeId : null,
          themeResult,
          insight: Math.max(0, Math.floor(asFiniteNumber(l.insight, 0, 0))),
          trialId: typeof l.trialId === 'string' && lifeTrialDef(l.trialId) ? l.trialId : null,
          bond: bond
            ? {
                name: typeof bond.name === 'string' ? bond.name : '',
                stage: typeof bond.stage === 'string' && bond.stage in STAGE_NAMES ? bond.stage : '',
                ending: typeof bond.ending === 'string' && bond.ending in ENDING_NAMES ? bond.ending : ''
              }
            : null,
          at: Math.max(0, Math.floor(asFiniteNumber(l.at, 0, 0)))
        })
      }
      return out
    }

    /**
     * 历世同行修形:道侣弹窗直接读 `r.name`,以 `r.stage`/`r.ending` 为下标查 `STAGE_NAMES`/`ENDING_NAMES`;
     * 一条 `null` 渲染期抛错,野枚举印成空白;野阶位/结局回落「素昧平生 / 缘悭一面」,认不出的道侣 id 不丢。
     */
    function sanitizeBonds(raw: unknown): import('@/core/daoluService').BondRecord[] {
      const out: import('@/core/daoluService').BondRecord[] = []
      for (const item of asArray<unknown>(raw)) {
        if (!item || typeof item !== 'object') continue
        const r = item as Partial<import('@/core/daoluService').BondRecord>
        out.push({
          daoluId: typeof r.daoluId === 'string' ? r.daoluId : '',
          name: typeof r.name === 'string' ? r.name : '',
          stage: (typeof r.stage === 'string' && r.stage in STAGE_NAMES ? r.stage : 'none') as BondStage,
          ending: (typeof r.ending === 'string' && r.ending in ENDING_NAMES ? r.ending : 'missed') as BondEnding,
          shared: Math.max(0, Math.floor(asFiniteNumber(r.shared, 0, 0)))
        })
      }
      return out
    }

    /**
     * 本世命题修形:野 `themeId` 会让 `vowProgress()` 恒返回 null;`broken` 只认字面真值。
     * 认不出的命题整块作废(同「这一世不曾立题」),只清 id 保留外壳会卡在不可再选的空题上。
     */
    function sanitizeVow(raw: unknown): import('@/data/samsara').LifeVow | null {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const v = raw as Partial<import('@/data/samsara').LifeVow>
      if (typeof v.themeId !== 'string' || !lifeThemeDef(v.themeId)) return null
      return {
        themeId: v.themeId,
        at: Math.max(0, asFiniteNumber(v.at, 0, 0)),
        base: asNumberRecord(v.base, 0),
        baseBranches: Math.max(0, Math.floor(asFiniteNumber(v.baseBranches, 0, 0))),
        baseAvenged: Math.max(0, Math.floor(asFiniteNumber(v.baseAvenged, 0, 0))),
        broken: v.broken === true
      }
    }

    /** 花掉道果:余额真的减少,不是记一笔「已花费」(见 core/fruitOutlets.ts) */
    function spendDaoFruit(n: number): boolean {
      if (!(n > 0) || reincarnation.value.daoFruit < n) return false
      reincarnation.value = { ...reincarnation.value, daoFruit: reincarnation.value.daoFruit - n }
      return true
    }

    /** 签下这一世的逆旅契(null 为解除) */
    function setLifeTrial(trial: import('@/data/lifeTrials').LifeTrialState | null): void {
      reincarnation.value = { ...reincarnation.value, trial }
    }

    function setBond(b: import('@/core/daoluService').BondState | null): void {
      // 老存档的 bond 可能缺机会点字段
      bond.value = b
        ? {
            ...b,
            doneEvents: b.doneEvents ?? [],
            opportunities: b.opportunities ?? 0,
            nextEventAt: b.nextEventAt ?? 0,
            pendingEventId: b.pendingEventId ?? null,
            lastKind: b.lastKind ?? null
          }
        : null
    }

    /** 关系结局记入履历(只记事,不给资源) */
    function recordBond(r: import('@/core/daoluService').BondRecord): void {
      reincarnation.value = { ...reincarnation.value, bonds: [...reincarnation.value.bonds, r] }
    }

    /** 记入宿慧(历世阅历与达成的命题都走这里) */
    function addInsight(n: number): void {
      if (!Number.isFinite(n) || n <= 0) return
      const amount = Math.floor(n)
      if (amount <= 0) return
      reincarnation.value = { ...reincarnation.value, insight: reincarnation.value.insight + amount }
    }

    /** 立下这一世的题(null 为不立题) */
    function setVow(vow: import('@/data/samsara').LifeVow | null): void {
      reincarnation.value = { ...reincarnation.value, vow }
    }

    /** 破题:犯了忌讳,不扣任何东西 */
    function breakVow(): void {
      const cur = reincarnation.value.vow
      if (!cur || cur.broken) return
      reincarnation.value = { ...reincarnation.value, vow: { ...cur, broken: true } }
    }

    function recordLife(rec: import('@/data/samsara').LifeRecord): void {
      reincarnation.value = { ...reincarnation.value, lives: [...reincarnation.value.lives, rec] }
    }

    function markDead(): void {
      dead.value = true
    }

    /**
     * 转世重置。保留:天赋/道果/宿慧/称号/转世次数/宿命传承、区域战绩与宿敌、
     * 机缘选择记忆(fortuneChoices)、奇缘(eventChains)
     */
    function rebirth(newLinggen: LinggenProfile): void {
      const previousLife = reincarnation.value.count
      reincarnation.value = {
        ...reincarnation.value,
        count: reincarnation.value.count + 1,
        heritageUses: {}
      }
      linggen.value = newLinggen
      major.value = birthMajorFloor(reincarnation.value.heritage)
      sub.value = 0
      exp.value = gnZero()
      age.value = START_AGE
      lifespanBonusYears.value = 0
      dead.value = false
      winStreak.value = 0
      lastCaveEventDay.value = 0
      secretRealm.value = null
      regionEvent.value = null
      divination.value = null
      breakthroughPrep.value = null
      fateFocus.value = null
      // 星象值日定向与悟道兑换是「当日账」,转世不清,否则同游戏日转世会重开当日兑换/改向配额
      // (见 samsaraAudit wudaoExchange/mansionRedirect 行)

      // 镇压权益与资格不随世走(见 samsaraAudit 'suppress' 一行的 partial 口径),否则新世炼气按旧阶位
      // 派发高阶装备/灵石;老档由 sanitize 的 suppressReachable 兜
      suppressedRegions.value = []
      suppressedSince.value = {}
      suppressQualified.value = []
      suppressFrac.value = {}
      // 战绩/胜场跨世保留,但须当场盖旧世号:否则判据按「未知即本世」放行,
      // 新世炼气赢一场即自动重新镇压旧世高阶地界
      regionStats.value = Object.fromEntries(
        Object.entries(regionStats.value).map(([id, st]) => [id, { ...st, life: previousLife }])
      )
      regionWinsLife.value = Object.fromEntries(
        Object.keys(regionWins.value).map(id => [id, previousLife])
      )
      // 世号当场同步,不等下一次 sanitize
      suppressLife.value = reincarnation.value.count
      petId.value = null
      dongfu.resetForRebirth()
      apprentices.resetForRebirth()
      // 每世重掷道号,不与上世撞名(见 samsaraAudit 的姓名一行)
      let fresh: string
      do {
        fresh = randomDaoName(rng)
      } while (fresh === name.value)
      name.value = fresh
    }

    /** 存档修复 */
    function sanitize(): void {
      exp.value = gn(exp.value)
      // 角色页/建号页裸用 `ELEMENTS[root.element].color` 与 `linggen.growthMult.toFixed(2)`:坏档在渲染期抛错
      linggen.value = sanitizeLinggen(linggen.value)
      if (!Number.isFinite(age.value)) age.value = START_AGE
      // 大阶是境界表下标、层数直接进公式
      major.value = Math.min(MAX_MAJOR, Math.max(0, Math.floor(asFiniteNumber(major.value, 0))))
      sub.value = Math.min(SUB_LEVELS - 1, Math.max(0, Math.floor(asFiniteNumber(sub.value, 0))))
      if (titleId.value !== null && !titleDef(titleId.value)) titleId.value = null
      if (petId.value !== null && !petDef(petId.value)) petId.value = null
      // 师承一经拜定不再更改:认不出的 id 占住 mentor 会永久挡回拜师
      if (mentor.value !== null && !mentorDef(mentor.value)) mentor.value = null
      // lifespanMax 加算项:NaN 使引擎死亡判据 `age < lifespanMax` 恒假,下一拍即「大限已至」
      lifespanBonusYears.value = asFiniteNumber(lifespanBonusYears.value, 0)
      // 旧存档缺宿慧/履历/命题三项:按转世次数折算补齐
      const r = reincarnation.value
      const count = Number.isFinite(r?.count) ? Math.max(0, r.count) : 0
      // 旧存档无卦象一栏
      if (divination.value) {
        const d = divination.value
        const ok =
          Array.isArray(d.lines) &&
          d.lines.length === 6 &&
          Array.isArray(d.changingAt) &&
          typeof d.expiresAt === 'number' &&
          !!readingFromState(d)
        if (!ok) divination.value = null
      }
      // 旧存档无突破准备一栏
      if (breakthroughPrep.value) {
        const p = breakthroughPrep.value
        const ok = Number.isFinite(p.bonus) && Number.isFinite(p.readyAt) && (p.kind === 'meditate' || p.kind === 'pill')
        if (!ok) breakthroughPrep.value = null
      }
      // 旧存档无顿悟冷却一栏;0 = 从未顿悟
      if (!Number.isFinite(enlightenmentAt.value) || enlightenmentAt.value < 0) enlightenmentAt.value = 0
      if (fateFocus.value !== null && !STARS.some(s => s.id === fateFocus.value)) {
        fateFocus.value = null
      }
      // 整块清空即回落天数派生
      if (mansionRedirect.value) {
        const mr = mansionRedirect.value
        const worldOk = typeof mr.worldId === 'string' && WORLDS.some(w => w.id === mr.worldId)
        if (
          !worldOk ||
          !Number.isFinite(mr.gameDay) ||
          typeof mr.count !== 'number' ||
          !Number.isFinite(mr.count)
        ) {
          mansionRedirect.value = null
        } else {
          mansionRedirect.value = {
            gameDay: Math.max(0, Math.floor(mr.gameDay)),
            worldId: mr.worldId,
            count: Math.min(MANSION_REDIRECT_MAX, Math.max(0, Math.floor(mr.count)))
          }
        }
      }
      const we = wudaoExchange.value
      if (!we || !Number.isFinite(we.gameDay) || !Number.isFinite(we.count)) {
        wudaoExchange.value = { gameDay: 0, count: 0 }
      } else {
        wudaoExchange.value = {
          gameDay: Math.max(0, Math.floor(we.gameDay)),
          count: Math.min(WUDAO_EXCHANGE_PER_DAY, Math.max(0, Math.floor(we.count)))
        }
      }
      // 层数越界会直接结算通关;携带气血越界使战斗开局 NaN
      if (secretRealm.value) {
        const sr = secretRealm.value
        const known = SECRET_REALMS.some(r => r.id === sr.realmId)
        if (!known) {
          secretRealm.value = null
        } else {
          secretRealm.value = {
            realmId: sr.realmId,
            enteredAt: asFiniteNumber(sr.enteredAt, Date.now(), 0),
            layer: Math.min(SECRET_LAYERS, Math.max(1, Math.floor(asFiniteNumber(sr.layer, 1, 1)))),
            wins: Math.floor(asFiniteNumber(sr.wins, 0, 0)),
            losses: Math.min(SECRET_MAX_LOSSES, Math.floor(asFiniteNumber(sr.losses, 0, 0))),
            spoils: asStringArray(sr.spoils),
            // 旧说法归一为现行说法并去重
            rules: [...new Set(asStringArray(sr.rules).flatMap(t => secretRuleByText(t)?.text ?? []))],
            carriedHpPct: asCarriedHpPct(sr.carriedHpPct),
            finished: sr.finished === true
          }
        }
      }
      // 三维是 0~100 的钳制量(同 advanceBond)
      if (bond.value) {
        const b = bond.value
        const known = DAOLU.some(d => d.id === b.daoluId)
        if (!known) {
          bond.value = null
        } else {
          const clamp100 = (v: unknown, fallback = 0): number => Math.min(100, asFiniteNumber(v, fallback, 0))
          bond.value = {
            ...b,
            stage: STAGE_ORDER.includes(b.stage) ? b.stage : 'met',
            fate: clamp100(b.fate),
            trust: clamp100(b.trust),
            accord: clamp100(b.accord),
            shared: Math.floor(asFiniteNumber(b.shared, 0, 0)),
            metAt: asFiniteNumber(b.metAt, Date.now(), 0),
            fallen: b.fallen === true,
            departed: b.departed === true,
            doneEvents: asStringArray(b.doneEvents),
            opportunities: Math.floor(asFiniteNumber(b.opportunities, 0, 0)),
            nextEventAt: Math.floor(asFiniteNumber(b.nextEventAt, 0, 0)),
            // offerBondEvent 见非空 pendingEventId 即不出新事件:认不出的 id 会永久堵死道侣线
            pendingEventId:
              typeof b.pendingEventId === 'string' && bondEventDef(b.pendingEventId) ? b.pendingEventId : null,
            intentPending: b.intentPending === true,
            // 意图由经历催生:作废后会重新酝酿
            intent: b.intent && Array.isArray(b.intent.sparks) && typeof b.intent.wish === 'string' ? b.intent : null
          }
        }
      }
      // endsAt 为 NaN 则永不过期;认不出的事件 id 不产倍率,却占住事件槽直到到期
      if (regionEvent.value) {
        const ev = regionEvent.value
        const regionOk = !!regionDef(ev.regionId) && !!regionEventDef(ev.eventId)
        const endsAt = asFiniteNumber(ev.endsAt, 0, 0)
        if (!regionOk || endsAt <= 0) regionEvent.value = null
        else regionEvent.value = { ...ev, endsAt }
      }
      // stage 夹在 [0, 链长](同 setEventChain):越界时 pendingChainStages 把该链当「已了」永不再现
      if (typeof eventChains.value !== 'object' || eventChains.value === null) {
        eventChains.value = {}
      } else {
        const chainNext: Record<string, number> = {}
        for (const [chainId, stage] of Object.entries(eventChains.value)) {
          const chain = CHAINS.find(c => c.id === chainId)
          if (!chain) continue
          chainNext[chainId] = Math.min(chain.stages.length, Math.max(0, Math.floor(asFiniteNumber(stage, 0, 0))))
        }
        eventChains.value = chainNext
      }
      // 先补形再谈内容:非数组会在 `for...of` 上直接抛错
      if (!Array.isArray(suppressedRegions.value)) suppressedRegions.value = []
      if (!Array.isArray(suppressQualified.value)) suppressQualified.value = []
      if (typeof suppressedSince.value !== 'object' || suppressedSince.value === null) suppressedSince.value = {}
      // 结算逐条遍历镇压表:重复项使同一地界每拍双份产出
      suppressedRegions.value = [...new Set(asStringArray(suppressedRegions.value))]
      suppressQualified.value = [...new Set(asStringArray(suppressQualified.value))]
      // 老档(−1)分不出旧世残留与本世所得:按旧境界保守清一次(高境镇压收益是数值爆炸源头)
      if (!Number.isFinite(suppressLife.value) || suppressLife.value < 0) {
        const suppressReachable = (id: string): boolean => (regionDef(id)?.minRealm ?? Infinity) <= major.value
        suppressedRegions.value = suppressedRegions.value.filter(suppressReachable)
        suppressQualified.value = suppressQualified.value.filter(suppressReachable)
      } else if (suppressLife.value !== count) {
        suppressedRegions.value = []
        suppressQualified.value = []
      }
      suppressLife.value = count
      // NaN 起钟永不复苏、≤0 当场复聚:均按此刻重起
      // 仍在镇压或仍持有资格即保留:unsuppressRegion 摘镇压表时起点照留,切回时复聚钟接着走
      const rawSince = asNumberRecord(suppressedSince.value)
      const fixedSince: Record<string, number> = {}
      const keepsTenure = new Set([...suppressedRegions.value, ...suppressQualified.value])
      for (const id of keepsTenure) {
        const at = rawSince[id]
        fixedSince[id] = at !== undefined && at > 0 ? at : Date.now()
      }
      suppressedSince.value = fixedSince
      // 零头取值 [0,1),只认镇压表内地界(松开镇压时已清)
      const rawFrac = asNumberRecord(suppressFrac.value)
      const fixedFrac: Record<string, number> = {}
      for (const id of suppressedRegions.value) {
        const v = rawFrac[id]
        if (v !== undefined && Number.isFinite(v) && v >= 0 && v < 1) fixedFrac[id] = v
      }
      suppressFrac.value = fixedFrac
      for (const id of suppressedRegions.value) {
        if (!suppressQualified.value.includes(id)) suppressQualified.value.push(id)
      }
      // 镇压判定与兴衰展示的共同底账:NaN 会让 `avgRounds <= 3` 恒假、复聚钟停摆
      const fixedRegionStats: Record<string, import('@/core/suppress').RegionStats> = {}
      // 世号须在清洗前定下(老档战绩盖章用)
      const statsLife = count
      for (const [id, raw] of Object.entries(asRecord<unknown>(regionStats.value))) {
        if (!regionDef(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const st = raw as Partial<import('@/core/suppress').RegionStats>
        const rawLife = asFiniteNumber(st.life, Number.NaN, 0)
        fixedRegionStats[id] = {
          totalFights: Math.floor(asFiniteNumber(st.totalFights, 0, 0)),
          avgRounds: asFiniteNumber(st.avgRounds, 0, 0),
          // 受伤占比 0~1(界面乘 100)
          avgDamageTakenPct: Math.min(1, asFiniteNumber(st.avgDamageTakenPct, 0, 0)),
          consecutiveWins: Math.floor(asFiniteNumber(st.consecutiveWins, 0, 0)),
          lastUpdateAt: asFiniteNumber(st.lastUpdateAt, 0, 0),
          // 有世号原样留(旧世的不参与判据);老档无世号按当前世认,不追溯没收
          life: Number.isFinite(rawLife) ? Math.floor(rawLife) : statsLife
        }
      }
      regionStats.value = fixedRegionStats
      // 巡游日期为 NaN 时「今日已抽」恒假,每 30 秒重掷一次
      winStreak.value = Math.floor(asFiniteNumber(winStreak.value, 0, 0))
      lastCaveEventDay.value = Math.floor(asFiniteNumber(lastCaveEventDay.value, 0, 0))
      regionWins.value = Object.fromEntries(
        Object.entries(asNumberRecord(regionWins.value, 0)).map(([id, n]) => [id, Math.floor(n)])
      )
      // 老档无世号按当前世认,同 regionStats.life 口径
      const rawWinsLife = asNumberRecord(regionWinsLife.value, Number.NaN)
      const fixedWinsLife: Record<string, number> = {}
      for (const id of Object.keys(regionWins.value)) {
        if (!regionDef(id)) continue
        const at = rawWinsLife[id]
        fixedWinsLife[id] = at !== undefined && Number.isFinite(at) && at >= 0 ? Math.floor(at) : count
      }
      regionWinsLife.value = fixedWinsLife
      // `identityService` 对它调 `Object.entries`、师承推荐与遗产回声按下标读:`null` 即抛错
      const fixedFortunes: Record<string, FortuneChoice> = {}
      for (const [id, choice] of Object.entries(asRecord<unknown>(fortuneChoices.value))) {
        if (choice === 'take' || choice === 'leave') fixedFortunes[id] = choice
      }
      fortuneChoices.value = fixedFortunes
      // 须按 enemyId 唯一:recordLoss / markAvenged / ghostOf 只 find 第一条
      const mergedNemeses = new Map<string, import('@/types').NemesisRecord>()
      for (const n of asArray<import('@/types').NemesisRecord>(
        nemeses.value,
        [],
        x => !!x && typeof (x as import('@/types').NemesisRecord).enemyId === 'string'
      )) {
        const lossCount = Math.max(0, Math.floor(asFiniteNumber(n.lossCount, 0, 0)))
        const lastLossAt = asFiniteNumber(n.lastLossAt, 0, 0)
        const avengedAt = typeof n.avengedAt === 'number' && Number.isFinite(n.avengedAt) ? n.avengedAt : undefined
        const enemyName = typeof n.enemyName === 'string' && n.enemyName ? n.enemyName : n.enemyId
        const regionId = typeof n.regionId === 'string' ? n.regionId : ''
        const prev = mergedNemeses.get(n.enemyId)
        if (!prev) {
          mergedNemeses.set(n.enemyId, {
            enemyId: n.enemyId,
            enemyName,
            regionId,
            lossCount,
            lastLossAt,
            ...(avengedAt === undefined ? {} : { avengedAt })
          })
          continue
        }
        const firstAvenged =
          prev.avengedAt === undefined ? avengedAt : avengedAt === undefined ? prev.avengedAt : Math.min(prev.avengedAt, avengedAt)
        mergedNemeses.set(n.enemyId, {
          ...prev,
          enemyName: prev.enemyName || enemyName,
          regionId: prev.regionId || regionId,
          lossCount: Math.max(prev.lossCount, lossCount),
          lastLossAt: Math.max(prev.lastLossAt, lastLossAt),
          ...(firstAvenged === undefined ? {} : { avengedAt: firstAvenged })
        })
      }
      nemeses.value = [...mergedNemeses.values()]
      // 槽数上限同 toggleArtifact/applyLoadout;截断保留先祭炼的,与「槽满时替换最早」顺序一致
      // sanitizeAll 里 player 先于 inventory:此处读到原始分片,形状须自兜
      inventory.equippedArtifacts = asStringArray(inventory.equippedArtifacts).slice(0, artifactSlotsFor(major.value))
      reincarnation.value = {
        count,
        daoFruit: Number.isFinite(r?.daoFruit) ? Math.max(0, r.daoFruit) : 0,
        // 集合须去重:重复天赋会被 talentMods 算两次
        // 天赋保留认不出的 id(改名/下线的旧档);传承须清:参与「是否持有」判定,会挡住发放路径
        talents: [...new Set(asStringArray(r?.talents))],
        heritage: [...new Set(asStringArray(r?.heritage).filter(id => !!heritageDef(id)))],
        heritageUses: sanitizeHeritageUses(r?.heritageUses),
        insight: Number.isFinite(r?.insight) ? Math.max(0, r.insight) : legacyInsightOf(count),
        lives: sanitizeLives(r?.lives),
        vow: sanitizeVow(r?.vow),
        trial: sanitizeTrial(r?.trial),
        bonds: sanitizeBonds(r?.bonds)
      }
    }

    // 前期玩法动作
    /** 奇缘进度 = 已走完的程数(0 未起,等于链长即已了);唯一写入口 */
    function setEventChain(chainId: string, stage: number): void {
      const chain = CHAINS.find(c => c.id === chainId)
      if (!chain || !Number.isFinite(stage)) return
      const next = Math.min(chain.stages.length, Math.max(0, Math.floor(stage)))
      eventChains.value = { ...eventChains.value, [chainId]: next }
    }

    function incrementWinStreak(): void {
      winStreak.value += 1
    }

    function resetWinStreak(): void {
      winStreak.value = 0
    }

    function markCaveEventToday(day: number): void {
      lastCaveEventDay.value = day
    }

    // 区域镇压操作
    function updateRegionStats(
      regionId: string,
      win: boolean,
      rounds: number,
      damageTakenPct: number,
    ): void {
      if (!regionDef(regionId) || !Number.isFinite(rounds) || rounds < 0) return
      if (!Number.isFinite(damageTakenPct) || damageTakenPct < 0) return
      const damage = Math.min(1, damageTakenPct)
      const current = regionStats.value[regionId] ?? {
        consecutiveWins: 0,
        totalFights: 0,
        avgRounds: 0,
        avgDamageTakenPct: 0,
        lastUpdateAt: Date.now(),
      }
      /**
       * 换世即重起判据账:旧世 EMA 与胜场不替新世作证;无世号的老账按本世认。
       * 不拿 suppressLife 的 −1 哨兵盖章:会让下一场把本世刚写的账当旧世重起。
       */
      const life = suppressLife.value >= 0 ? suppressLife.value : reincarnation.value.count
      const base = current.life === undefined || current.life < 0 || current.life === life
        ? current
        : { consecutiveWins: 0, totalFights: 0, avgRounds: 0, avgDamageTakenPct: 0, lastUpdateAt: Date.now() }

      const newStats = {
        consecutiveWins: win ? base.consecutiveWins + 1 : 0,
        totalFights: base.totalFights + 1,
        avgRounds: base.avgRounds * 0.7 + rounds * 0.3,
        avgDamageTakenPct: base.avgDamageTakenPct * 0.7 + damage * 0.3,
        lastUpdateAt: Date.now(),
        life,
      }

      regionStats.value = { ...regionStats.value, [regionId]: newStats }
    }

    /**
     * 一次写入 N 场同质净胜(离线整段结算用);指数移动平均与逐场调用 `updateRegionStats` 等价。
     * 兴衰胜场同时累计:离线与在线写同一本账。
     */
    function applyRegionWinBatch(
      regionId: string,
      n: number,
      rounds: number,
      damageTakenPct: number,
    ): void {
      if (!regionDef(regionId) || !Number.isFinite(rounds) || rounds < 0) return
      if (!Number.isFinite(damageTakenPct) || damageTakenPct < 0) return
      const count = Math.floor(n)
      if (!Number.isFinite(n) || count <= 0) return
      const damage = Math.min(1, damageTakenPct)
      const current = regionStats.value[regionId] ?? {
        consecutiveWins: 0,
        totalFights: 0,
        avgRounds: 0,
        avgDamageTakenPct: 0,
        lastUpdateAt: Date.now(),
      }
      // 同上:跨世重起判据账
      const life = suppressLife.value >= 0 ? suppressLife.value : reincarnation.value.count
      const base = current.life === undefined || current.life < 0 || current.life === life
        ? current
        : { consecutiveWins: 0, totalFights: 0, avgRounds: 0, avgDamageTakenPct: 0, lastUpdateAt: Date.now() }
      const decay = 0.7 ** count
      regionStats.value = {
        ...regionStats.value,
        [regionId]: {
          consecutiveWins: base.consecutiveWins + count,
          totalFights: base.totalFights + count,
          avgRounds: base.avgRounds * decay + rounds * (1 - decay),
          avgDamageTakenPct: base.avgDamageTakenPct * decay + damage * (1 - decay),
          lastUpdateAt: Date.now(),
          life,
        },
      }
      // 胜场按世起算,无世号按本世认;与 recordRegionWin、regionWinsOfThisLife 同一口径
      const taggedLife = regionWinsLife.value[regionId]
      const winsBase = taggedLife === undefined || taggedLife < 0 || taggedLife === life
        ? (regionWins.value[regionId] ?? 0)
        : 0
      regionWins.value = { ...regionWins.value, [regionId]: winsBase + count }
      regionWinsLife.value = { ...regionWinsLife.value, [regionId]: life }
    }

    function suppressRegion(regionId: string): void {
      if (!regionDef(regionId)) return
      suppressLife.value = reincarnation.value.count
      if (!suppressedRegions.value.includes(regionId)) {
        suppressedRegions.value = [...suppressedRegions.value, regionId]
        /**
         * 起点只在缺失时补(首次镇压 / 坏档被清掉)。
         * 切回收益态时重写会让守时归零:兴衰掉回混乱、装备气运清零、72 小时复聚钟从头再走。
         */
        if (!(suppressedSince.value[regionId]! > 0)) {
          suppressedSince.value = { ...suppressedSince.value, [regionId]: Date.now() }
        }
      }
    }

    /** 记下镇压资格(幂等) */
    function markSuppressQualified(regionId: string): void {
      if (!regionDef(regionId)) return
      suppressLife.value = reincarnation.value.count
      if (!suppressQualified.value.includes(regionId)) {
        suppressQualified.value = [...suppressQualified.value, regionId]
      }
    }

    /** 本拍物产并进零头累积器,返回够整件的部分(供结算入账) */
    function takeSuppressResource(regionId: string, amount: number): number {
      if (!regionDef(regionId) || !Number.isFinite(amount) || amount <= 0) return 0
      const acc = (suppressFrac.value[regionId] ?? 0) + amount
      const whole = Math.floor(acc)
      const rest = acc - whole
      suppressFrac.value = { ...suppressFrac.value, [regionId]: rest }
      return whole
    }

    function unsuppressRegion(regionId: string): void {
      if (!regionDef(regionId)) return
      suppressedRegions.value = suppressedRegions.value.filter(id => id !== regionId)
      // 不删 suppressedSince:停取只关产出,起点随资格保留;转世 / 坏档清洗另有清除路径
      // 零头一并清掉:留着会让下次镇压凭空多出半件
      if (regionId in suppressFrac.value) {
        const rest = { ...suppressFrac.value }
        delete rest[regionId]
        suppressFrac.value = rest
      }
      if (regionStats.value[regionId]) {
        regionStats.value = {
          ...regionStats.value,
          [regionId]: { ...regionStats.value[regionId]!, consecutiveWins: 0 },
        }
      }
    }

    /** 妖气复聚:镇压被世界收回,守土起点一并清掉(主动停取则保留起点) */
    function loosenSuppression(regionId: string): void {
      unsuppressRegion(regionId)
      if (!(regionId in suppressedSince.value)) return
      const next = { ...suppressedSince.value }
      delete next[regionId]
      suppressedSince.value = next
    }

    // ---------- 世界记忆 ----------
    /** 记录一次净胜(区域兴衰的累计胜场) */
    function recordRegionWin(regionId: string): void {
      if (!regionDef(regionId)) return
      const life = suppressLife.value >= 0 ? suppressLife.value : reincarnation.value.count
      // 换世后胜场从 1 重新起算;与 updateRegionStats 的判据账同一口径
      const tagged = regionWinsLife.value[regionId]
      const sameLife = tagged === undefined || tagged < 0 || tagged === life
      regionWins.value = { ...regionWins.value, [regionId]: sameLife ? (regionWins.value[regionId] ?? 0) + 1 : 1 }
      regionWinsLife.value = { ...regionWinsLife.value, [regionId]: life }
    }

    /** 宿敌列表由 worldMemory 提供 */
    function setNemeses(list: import('@/types').NemesisRecord[]): void {
      nemeses.value = list
    }

    // ---------- 师承 ----------
    /** 拜入师门,一经确立不再更改 */
    function adoptMentor(id: import('@/data/mentors').MentorId): void {
      if (mentor.value !== null) return
      mentor.value = id
    }

    // ---------- 区域事件 ----------
    function setRegionEvent(ev: import('@/core/regionEvent').RegionEventState | null): void {
      regionEvent.value = ev
    }

    // ---------- 短期秘境 ----------
    function setSecretRealm(state: import('@/core/secretRealm').SecretRealmState | null): void {
      secretRealm.value = state
    }

    // ---------- 问卦 ----------
    function setDivination(state: import('@/core/divination').DivinationState | null): void {
      divination.value = state
    }

    // ---------- 突破准备 ----------
    function setBreakthroughPrep(state: import('@/core/earlyGameService').BreakthroughPrepState | null): void {
      breakthroughPrep.value = state
    }

    function setEnlightenmentAt(t: number): void {
      enlightenmentAt.value = Number.isFinite(t) ? Math.max(0, t) : 0
    }

    // ---------- 命格点化主星 ----------
    /**
     * 点化主星:花灵石(STAR_FOCUS_COST_BASE)放大某位主星之力。
     * 只认十四主星;已点化同一星不反复收钱;灵石不足原子拒绝(spendStone 契约)。
     */
    function focusFateStar(starId: string): boolean {
      const star = STARS.find(s => s.id === starId)
      if (!star || fateFocus.value === starId) return false
      const cost = gn(STAR_FOCUS_COST_BASE)
      if (!resources.spendStone(cost)) return false
      fateFocus.value = starId
      return true
    }

    // ---------- 星象值日定向 ----------
    /**
     * 花灵石(MANSION_REDIRECT_COST)把今日所利界域改成所选。
     * 只认 WORLDS 里的界;已定向到同一界 / 当日次数已耗尽不再收钱;灵石不足原子拒绝(spendStone 契约)。
     */
    function redirectFavoredWorld(worldId: WorldId): boolean {
      if (!WORLDS.some(w => w.id === worldId)) return false
      const day = gameDay(useGameStore().totalPlaySec)
      const cur = mansionRedirect.value
      if (mansionRedirectCheck(day, cur, worldId, resources.spiritStone).blocked) return false
      const cost = gn(MANSION_REDIRECT_COST)
      if (!resources.spendStone(cost)) return false
      mansionRedirect.value = cur && cur.gameDay === day ? { gameDay: day, worldId, count: cur.count + 1 } : { gameDay: day, worldId, count: 1 }
      return true
    }

    // ---------- 后期限量灵石→悟道兑换 ----------
    /**
     * 后期限量「灵石 → 悟道点」兑换。
     * 境界不到 WUDAO_EXCHANGE_MIN_MAJOR / 当天已兑满 WUDAO_EXCHANGE_PER_DAY 拒兑;灵石不足原子拒绝(spendStone 契约)。
     * 审计敏感:只动这条限量出口,不重建效率回路、不动熔炉。
     */
    function exchangeStoneForWudao(): boolean {
      if (!wudaoExchangeState.value.canExchange) return false
      const day = gameDay(useGameStore().totalPlaySec)
      const cur = wudaoExchange.value
      const today = cur && cur.gameDay === day ? cur : { gameDay: day, count: 0 }
      if (!resources.spendStone(gn(WUDAO_EXCHANGE_PRICE_BASE))) return false
      resources.addSmall('wudao', WUDAO_EXCHANGE_GAIN)
      wudaoExchange.value = { gameDay: day, count: today.count + 1 }
      return true
    }
    /** 当天已兑次数(次日归零,界面展示用) */
    const wudaoExchangeToday = computed(() => {
      const day = gameDay(useGameStore().totalPlaySec)
      const cur = wudaoExchange.value
      return cur && cur.gameDay === day ? cur.count : 0
    })
    /** 兑换判据:境界、当日限额与灵石余额同源 */
    const wudaoExchangeState = computed<WudaoExchangeState>(() =>
      evaluateWudaoExchange(major.value, wudaoExchangeToday.value, resources.spiritStone)
    )
    const canExchangeWudao = computed(() => wudaoExchangeState.value.canExchange)

    // ---------- 机缘链 ----------
    function setFortuneChoices(choices: Record<string, FortuneChoice>): void {
      fortuneChoices.value = choices
    }

    /**
     * 暂停恢复:墙钟到期的时间戳与持续时长起点(suppressedSince / regionStats.lastUpdateAt)顺延暂停时长。
     * 暂停(重置 / 导入确认窗)期间心跳不结算;与 `enginePause.gameNow()` 的冻结语义配套。
     */
    function shiftTimedState(pausedMs: number): void {
      if (!Number.isFinite(pausedMs) || pausedMs <= 0) return
      if (divination.value) {
        divination.value = { ...divination.value, expiresAt: divination.value.expiresAt + pausedMs }
      }
      if (regionEvent.value) {
        regionEvent.value = { ...regionEvent.value, endsAt: regionEvent.value.endsAt + pausedMs }
      }
      if (breakthroughPrep.value) {
        breakthroughPrep.value = {
          ...breakthroughPrep.value,
          readyAt: breakthroughPrep.value.readyAt + pausedMs
        }
      }
      if (enlightenmentAt.value > 0) enlightenmentAt.value += pausedMs

      const nextSince: Record<string, number> = {}
      for (const [id, at] of Object.entries(suppressedSince.value)) {
        nextSince[id] = at > 0 ? at + pausedMs : at
      }
      suppressedSince.value = nextSince

      const nextStats: Record<string, (typeof regionStats.value)[string]> = {}
      for (const [id, st] of Object.entries(regionStats.value)) {
        nextStats[id] = { ...st, lastUpdateAt: st.lastUpdateAt > 0 ? st.lastUpdateAt + pausedMs : st.lastUpdateAt }
      }
      regionStats.value = nextStats
    }

    return {
      name,
      linggen,
      major,
      sub,
      exp,
      age,
      lifespanBonusYears,
      titleId,
      petId,
      petModsFor,
      dead,
      reincarnation,
      eventChains,
      winStreak,
      lastCaveEventDay,
      regionStats,
      suppressedRegions,
      suppressQualified,
      suppressedSince,
      suppressFrac,
      suppressLife,
      nemeses,
      regionWins,
      regionWinsLife,
      mentor,
      regionEvent,
      secretRealm,
      divination,
      breakthroughPrep,
      enlightenmentAt,
      fortuneChoices,
      realm,
      realmName,
      world,
      worldName,
      subName,
      expReq,
      expProgress,
      expFull,
      expOverflow,
      isMajorStep,
      atMaxRealm,
      qiCapValue,
      qiBankCapValue,
      qiRich,
      finalStats,
      celestialStats,
      activeDivination,
      divinationMods,
      fateChart: chart,
      fateMods: fateModsValue,
      fateFocus,
      focusFateStar,
      mansionRedirect,
      redirectFavoredWorld,
      wudaoExchange,
      wudaoExchangeToday,
      wudaoExchangeState,
      canExchangeWudao,
      exchangeStoneForWudao,
      cultPerSec,
      qiRegenPerSec,
      lifespanMax,
      lifespanRatio,
      initCharacter,
      gainExp,
      loseExpPct,
      advanceRealm,
      addAge,
      addLifespan,
      setTitle,
      setPet,
      addTalent,
      addHeritage,
      consumeHeritageUse,
      addDaoFruit,
      addInsight,
      bond,
      setBond,
      recordBond,
      spendDaoFruit,
      setLifeTrial,
      setVow,
      breakVow,
      recordLife,
      markDead,
      rebirth,
      sanitize,
      setEventChain,
      incrementWinStreak,
      resetWinStreak,
      markCaveEventToday,
      updateRegionStats,
      applyRegionWinBatch,
      suppressRegion,
      unsuppressRegion,
      loosenSuppression,
      takeSuppressResource,
      markSuppressQualified,
      recordRegionWin,
      setNemeses,
      adoptMentor,
      setRegionEvent,
      setSecretRealm,
      setDivination,
      setBreakthroughPrep,
      setEnlightenmentAt,
      setFortuneChoices,
      shiftTimedState
    }
  },
  { persist: persistConfig('player') }
)
