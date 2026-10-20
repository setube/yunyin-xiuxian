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
  WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PRICE_BASE, WUDAO_EXCHANGE_GAIN, WUDAO_EXCHANGE_PER_DAY
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
import { readingFromState, readingMods } from '@/core/divination'
import { gameNow } from '@/core/enginePause'
import { asArray, asCarriedHpPct, asFiniteNumber, asNumberRecord, asRecord, asStringArray } from '@/utils/saveShape'
import { SECRET_LAYERS, SECRET_MAX_LOSSES, SECRET_REALMS, SECRET_RULES } from '@/data/secretRealms'
import { DAOLU, ENDING_NAMES, STAGE_NAMES, STAGE_ORDER, type BondEnding, type BondStage } from '@/data/daolu'
import { lifeThemeDef } from '@/data/lifeThemes'
import { bondEventDef } from '@/data/bondEvents'
import { regionDef } from '@/data/regions'
// 事件表放在 data/ 是有意的:core/regionEvent 依赖本 store,这里反向 import 会成环
import { regionEventDef } from '@/data/regionEvents'
import { artifactSlotsFor } from '@/data/artifacts'
import { lifeTrialDef, type LifeTrialState } from '@/data/lifeTrials'
import { STARS } from '@/data/ziwei'
import { fateChart, fateFocusMods, fateSeed } from '@/core/fate'
import type { MansionRedirect } from '@/core/astronomy'
import type { FortuneChoice } from '@/core/fortuneChain'
import { useInventoryStore } from './inventory'
import { useCultivationStore } from './cultivation'
import { useDongfuStore } from './dongfu'
import { useApprenticeStore } from './apprentice'
import { useResourcesStore } from './resources'
import { useEndgameStore } from './endgame'
import { useGameStore } from './game'

/** 修行速率的下限乘数:修为/灵气增速从不归零(防负增益把成长钉死在地板上) */
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
     * 轮回(Phase 32.5 重构)。
     *
     * count 从此只是历史计数,不再承担成长职责;
     * insight(宿慧)才是分阶依据,lives 是历世履历,vow 是这一世立下的题。
     * 注意 insight 只存「过去发生过的事」(历世阅历 + 已达成的命题);
     * 由认知折算的那一份是现量,每次从 lore store 实时算(见 core/samsaraService.ts)。
     */
    const reincarnation = ref({
      count: 0,
      daoFruit: 0,
      talents: [] as string[],
      /**
       * 宿命传承:跨世永久的能力位,随神魂不灭、不清零
       * (锻造生命周期见 core/heritageForge)
       */
      heritage: [] as string[],
      /**
       * 本世各传承效果已用掉几回(每世重置)。
       *
       * 「每世一回」类容错(渡劫跬步)与本世三炉(浴火丹心)的用量账:跨世不带,
       * 故 rebirth() 里清空;落进存档是为了刷新页面不白嫖(见 sanitizeHeritageUses)。
       */
      heritageUses: {} as Record<string, number>,
      insight: 0,
      lives: [] as import('@/data/samsara').LifeRecord[],
      vow: null as import('@/data/samsara').LifeVow | null,
      /** 这一世签下的逆旅契(道果的第一个非效率出口);转世时清空 */
      trial: null as import('@/data/lifeTrials').LifeTrialState | null,
      /**
       * 历世的关系履历(Phase 33.8)。
       *
       * 跨轮回**只留历史,不留人**:下一世不会自动带回同一个道侣,
       * 但「曾与谁走到哪一步」会记在这里,并成为宿缘重逢的依据
       */
      bonds: [] as import('@/core/daoluService').BondRecord[]
    })

    /**
     * 这一世的关系(Phase 33.8)。
     *
     * 与 reincarnation.bonds 分开:那是历史,这是当下。
     * 转世时清空 —— 人不跨世继承
     */
    const bond = ref<import('@/core/daoluService').BondState | null>(null)

    // Phase 28 前期玩法状态
    const eventChains = ref<import('@/types').EventChainState>({}) // 奇遇连锁进度(链路实装见 RIL)
    const winStreak = ref(0) // 当前连胜数
    const lastCaveEventDay = ref(0) // 上次洞府巡游日期

    // Phase 30 区域镇压(每个区域独立统计)
    const regionStats = ref<Record<string, import('@/core/suppress').RegionStats>>({})
    const suppressedRegions = ref<string[]>([])
    /**
     * 镇压资格(取得即永久,随世界记忆跨世保留)。
     *
     * 「镇压过就镇压过」:一旦对某地区域取得过绝对优势,此后随时可把它切回收益态,
     * 不必再打满二十场重新证明一遍。收益是否正在收取是另一件事(见 suppressedRegions)。
     */
    const suppressQualified = ref<string[]>([])
    /** 镇压时间戳:区域 → 镇压开始的时刻(供复苏判定) */
    const suppressedSince = ref<Record<string, number>>({})

    // Phase 31 师承:凡界修行者的额外成长思想(跨世保留)
    const mentor = ref<import('@/data/mentors').MentorId | null>(null)

    // Phase 31 A2 区域动态事件(单区域内一次一个,自动过期)
    const regionEvent = ref<import('@/core/regionEvent').RegionEventState | null>(null)

    // Phase 31 S3 短期秘境(一次性内容容器,进行中状态)
    const secretRealm = ref<import('@/core/secretRealm').SecretRealmState | null>(null)

    /** Phase 34.3 问卦所得之卦(一世一时之象,过期自散;转世不带) */
    const divination = ref<import('@/core/divination').DivinationState | null>(null)

    /**
     * 突破准备(静坐/聚气丹)—— **付费的一次性加成必须存进档**。
     *
     * 原先它是 earlyGameService 的模块态:聚气丹花掉 80 灵石换来 +5%,
     * 玩家一刷新页面就没了 —— 顿悟/巡游丢状态无所谓(那是免费的提示),
     * 花钱买的一次性加成丢了就是吞了玩家的资源。
     */
    const breakthroughPrep = ref<import('@/core/earlyGameService').BreakthroughPrepState | null>(null)

    /**
     * 上次顿悟的时刻 —— 这是**频次闸**,必须随档。
     *
     * 顿悟给悟道点(真货币),原先冷却挂在模块上:刷新一次页面冷却归零,
     * 变成「重开页面刷顿悟」。闸门跨世保留(它不是本世进度,是速率限制)。
     */
    const enlightenmentAt = ref(0)

    // Phase 31.1 机缘链:机缘选择记忆(取/弃),影响师承推荐与未来同类机缘
    const fortuneChoices = ref<Record<string, FortuneChoice>>({})

    // Phase 30.9 世界记忆
    /** 宿敌列表(同一敌人败我 ≥3 次) */
    const nemeses = ref<import('@/types').NemesisRecord[]>([])
    /** 区域总胜场(供兴衰状态派生;regionStats 已有近似数据,但保持独立统计纯胜场) */
    const regionWins = ref<Record<string, number>>({})

    // ---------- 境界 ----------
    const realm = computed(() => realmDef(major.value))
    const realmName = computed(() => realmLabel(major.value, sub.value))
    const world = computed(() => worldOf(major.value))
    const worldName = computed(() => world.value.name)
    const subName = computed(() => SUB_NAMES[Math.min(sub.value, SUB_NAMES.length - 1)]!)
    const expReq = computed(() => expRequirement(major.value, sub.value))
    const expProgress = computed(() => progress(exp.value, expReq.value))
    const expFull = computed(() => gte(exp.value, expReq.value))
    /** 修为积余:越过当前突破需求的部分(卡境期间继续累积,突破时随境界带走) */
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

    /** 当天天时(Phase 31 A1)作为环境 mod 源并入最终属性:
     * 灵雨修炼/灵气、赤阳伤害、月蚀福缘/掉落、雷鸣攻伐/渡劫抗性 ——
     * 战斗/掉落/渡劫均读 finalStats.mods,故并入即可全链路生效,无需各自接线 */
    const weatherMods = computed<StatMods>(() => todayWeather().mods)

    /**
     * 在身之卦:与天时同法并入最终属性。
     * 卦是"此一时的时机",故走环境通道,不动根基数值;过期即散。
     *
     * 过期要随时间自散,故借修行时长(引擎每秒推进)作依赖 ——
     * 否则 computed 只会记住第一次算出的结果,卦会一直留在身上。
     */
    const activeDivination = computed(() => {
      // 读一次心跳:过期判定要随引擎推进被重新计算(见 engine 的 addPlayTime)
      void useGameStore().totalPlaySec
      const state = divination.value
      return state && state.expiresAt > gameNow() ? state : null
    })
    const divinationMods = computed<StatMods>(() => {
      const state = activeDivination.value
      if (!state) return {}
      const reading = readingFromState(state)
      return reading ? readingMods(reading) : {}
    })

    /**
     * 本世命格(紫微十二宫):由灵根与转世数确定性推出,不落状态、不耗时日。
     * 一世不变,转世重算 —— 与"一时之卦"分工明确。
     */
    const chart = computed(() => fateChart(fateSeed(linggen.value, reincarnation.value.count)))
    /**
     * 命格点化主星(Phase A-1):选中的主星 id,或 null(未点化)。
     *
     * 是存档状态(不是随机)—— 同人同世同 focus 必同果,转世也不动它(它是"这一世怎么凸显",
     * 不是命盘本身)。sanitize 里按白名单(十四主星)校验,认不出的清回 null。
     */
    const fateFocus = ref<string | null>(null)
    const fateModsValue = computed<StatMods>(() => fateFocusMods(chart.value, fateFocus.value))

    /**
     * 星象值日定向(Phase A-2):玩家把今日所利界域定向到哪一界的覆盖。
     *
     * 「当日有效」:gameDay 不是今天就不生效(次日自动回落天数派生,无需清理)。
     * 「限次」:count 记当日已定向几次,达 MANSION_REDIRECT_MAX 后当日回落到天数派生。
     * 定向本身不改变二十八宿轮值,只改"今日利哪一界"(仍是只利一界 +10%)。
     */
    const mansionRedirect = ref<MansionRedirect | null>(null)

    /**
     * 后期限量灵石→悟道兑换(Phase C-1):{gameDay, count} 记每游戏日已兑几次。
     * 「当日计数」:gameDay 不是今天即从 0 重算(次日自动重置,无需清理)。
     * 上限 WUDAO_EXCHANGE_PER_DAY,达上限当日无法再兑。
     */
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

    // 灵兽出战加成:基础词缀 × 灵兽园等级(beastMult) × 安抚灵兽增益(beastPct)
    // —— 这是「真到账」那份;图鉴/兽苑卡片必须也按它渲染,给 base 会与角色面板来源明细对不上
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
    /** 灵气积余上限(标称容量 × 积余倍数):卡境期间灵气可存到此处 */
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
        // 名字与上面一一对应 —— 面板的「来源明细」直接读它们,不再另起一套说法。
        // 天时的名号就是当天的具体气象:修炼页的修为来路里「天时 +12%」,
        // 若只写渠道名,玩家看不清是仙雨还是混沌潮;名前带气象,一眼即知。
        // (mods 与名字取自同一个 todayWeather(),同源;清和日无词条,该行自然不出现。)
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
        /** 凡界的平铺三维:**装备给的攻防血就是从这里进来的**(见 core/statsCalc) */
        equipFlats: inventory.equipFlats,
        daoFruit: reincarnation.value.daoFruit,
        qiRich: qiRich.value
      })
    )

    /**
     * 天界口径属性(Phase 33.3)——凡器入天界,数值尽去,只余形意。
     *
     * 装配了器魂:装备词条完全不计,改用器魂词条(玩家主动凝炼、主动取舍的那三缕形意)。
     * 一枚未凝:退化为 forgeSoul 兜底,把装备词条等比压到器魂容量——
     * 不至于让没接触过器魂系统的玩家直接裸装进天界,但也拿不到凝炼者的方向红利。
     *
     * 功法、洞府、称号、师承、灵兽、天赋皆属修士自身之道,不受此约束
     */
    const celestialStats = computed<FinalStats>(() => {
      const endgame = useEndgameStore()
      return computeFinalStats({
        major: major.value,
        sub: sub.value,
        linggenMult: linggen.value?.growthMult ?? 1,
        modSources: [
          /**
           * 天界这一侧:**凡界装备照常作数**(词条与平铺三维都算),器魂是**叠加**上去的。
           *
           * 从前这里是二选一:凝了器魂就用器魂替换掉凡器,没凝就把凡器词条压到容量。
           * 那套做法把玩家在天界的绝对强度抹平了 —— 一身神品与一身凡品打同一个守关者,
           * 结果一模一样,基础属性在天界等于不存在。
           *
           * 现在改回来:攻防血到哪儿都是最核心的属性,一切额外判定都**建立在它之上**
           * (天界的差别落在敌人一侧:道之理解会看破你的厚度,境界压制会对低境者增伤 ——
           * 见 core/gauntlet.celestialJudgement)。
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
        /** 平铺三维也照常作数:它就是「基础属性」本身 */
        equipFlats: inventory.equipFlats,
        daoFruit: reincarnation.value.daoFruit,
        qiRich: qiRich.value
      })
    })

    /** 修为增速(每秒) */
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

    /**
     * 增加修为 —— **不封顶**。
     *
     * 修为是可累积的:卡在某一境(等突破、等灵气、渡劫失败)时,修为仍继续增长,
     * 越过当前需求的部分存为「积余」。突破成功时只扣去当时的那一份需求,
     * 积余带入下一境 —— 等待因此不是浪费,而是把后面的指数级开销先垫上。
     */
    function gainExp(v: GNum): void {
      exp.value = add(exp.value, v)
    }

    function loseExpPct(pct: number): void {
      exp.value = subClamp(exp.value, mulN(exp.value, pct))
    }

    function advanceRealm(): void {
      // 先记下「刚走完的这一境」的需求:突破只该扣这一份,积余随境界带走
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
      age.value += years
    }

    function addLifespan(years: number): void {
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
      reincarnation.value = { ...reincarnation.value, daoFruit: reincarnation.value.daoFruit + n }
    }

    /**
     * 宿命传承:永久持有,跨世不清零。重复锻造(旧档残留/重复触发)会被忽略。
     * 锻造由 core/heritageForge.lifeForge 判定,在 confirmReincarnation 落账。
     */
    function addHeritage(id: string): void {
      if (!reincarnation.value.heritage.includes(id)) {
        reincarnation.value = {
          ...reincarnation.value,
          heritage: [...reincarnation.value.heritage, id]
        }
      }
    }

    /**
     * 消耗一次「每世一回/每世 N 回」的传承效果(渡劫跬步 / 浴火丹心)。
     *
     * 只在**持有该传承、且本世还没用满**时返回 true 并记账 —— 调用方据此决定
     * 「这一下要不要照常结算损失/照常开炉」;返回 false 就照旧。
     * 用量跨世不带(rebirth 清空),只落在本世 —— 刷新页面不白嫖(sanitize 修形)。
     */
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

    /** 形状修复:传承用量只保留「认识的 id + 正整数次」 */
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

    /**
     * 逆旅契形状修复:坏档/改出来的 trial 若带未知契 id、缺字段或非有限数,
     * 一律归 null。否则它会让 canSignLifeTrial 只见「已立契」而永远签不了(须等转世才解)。
     */
    function sanitizeTrial(raw: unknown): LifeTrialState | null {
      if (typeof raw !== 'object' || raw === null) return null
      const t = raw as { trialId?: unknown; at?: unknown; paid?: unknown }
      if (typeof t.trialId !== 'string' || !lifeTrialDef(t.trialId)) return null
      if (!Number.isFinite(t.at) || !Number.isFinite(t.paid)) return null
      return { trialId: t.trialId, at: t.at as number, paid: t.paid as number }
    }

    /**
     * 历世履历修形:条目本身要是个对象,字段要能直接印到「第 N 世 · 化神 · 寿终 320 载」。
     *
     * 从前只做了 `Array.isArray` 就原样收下,一条 `null` 就能让轮回页 `l.index` 抛错白屏,
     * 而 `NaN` 会印成「第 NaN 世」。认不出的命题/逆旅契 id 回落 null(与「本世未立题/未签约」
     * 同一语义);认不出的结局同样回落 null,由界面按「未竟」兜底,不让一个野值把
     * `RESULT_TEXTS[...]` 读成 undefined。
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
     * 历世同行修形:`CharacterView` 直接读 `r.name`,并把 `r.stage`/`r.ending` 当下标
     * 去查 `STAGE_NAMES`/`ENDING_NAMES`。一条 `null` 就会白屏,野枚举会印出英文原文。
     *
     * 认不出的道侣 id 不丢:这段同行确实发生过,只是那个人已从名册里撤下 ——
     * 名字仍在履历里,阶位与结局回落「素昧平生 / 缘悭一面」。
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
     * 本世命题修形:野 `themeId` 会让 `vowProgress()` 恒返回 null(界面写着「在途」却
     * 永不推进),而 `broken: 'yes'` 这类非字面真值会让「已破」判定失真。
     *
     * 认不出的命题整块作废 —— 等同于「这一世不曾立题」,下次兵解时可重新择题;
     * 反过来若只清 id 保留外壳,玩家会卡在一个既无定义又不可再选的空题上。
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

    /**
     * 花掉道果。
     *
     * 余额**真的减少** —— 不是记一笔「已花费」了事。
     * 道果此前只进不出,任何固定定价终将被无上限的余额淹没(见 core/fruitOutlets.ts),
     * 所以出口必须让余额下降,「积累 → 判断 → 花费」才成立
     *
     * @returns 余额不足时返回 false,不做任何改动
     */
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
      // 老存档的 bond 可能缺 34.0 新增的机会点字段,补默认值
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

    /** 把一世的关系结局记入履历(只记事,不给任何资源) */
    function recordBond(r: import('@/core/daoluService').BondRecord): void {
      reincarnation.value = { ...reincarnation.value, bonds: [...reincarnation.value.bonds, r] }
    }

    /** 记入宿慧(历世阅历与达成的命题都走这里) */
    function addInsight(n: number): void {
      if (!(n > 0)) return
      reincarnation.value = { ...reincarnation.value, insight: reincarnation.value.insight + n }
    }

    /** 立下这一世的题(null 为不立题) */
    function setVow(vow: import('@/data/samsara').LifeVow | null): void {
      reincarnation.value = { ...reincarnation.value, vow }
    }

    /** 破题:犯了忌讳。不扣任何东西,只是这一世的话没说到底 */
    function breakVow(): void {
      const cur = reincarnation.value.vow
      if (!cur || cur.broken) return
      reincarnation.value = { ...reincarnation.value, vow: { ...cur, broken: true } }
    }

    /** 归档一世履历 */
    function recordLife(rec: import('@/data/samsara').LifeRecord): void {
      reincarnation.value = { ...reincarnation.value, lives: [...reincarnation.value.lives, rec] }
    }

    function markDead(): void {
      dead.value = true
    }

    /** 转世重置(保留天赋/道果/转世次数/宿命传承) */
    function rebirth(newLinggen: LinggenProfile): void {
      reincarnation.value = {
        ...reincarnation.value,
        count: reincarnation.value.count + 1,
        // 每世一回类容错/本世三炉的用量账跨世不带,新的一世从头算
        heritageUses: {}
      }
      linggen.value = newLinggen
      // 新的一世从炼气起步;若已持有「元婴凝实」传承,保底从筑基起(见 heritageEffects.birthMajorFloor)
      major.value = birthMajorFloor(reincarnation.value.heritage)
      sub.value = 0
      exp.value = gnZero()
      age.value = START_AGE
      lifespanBonusYears.value = 0
      dead.value = false
      // 新的一世:本世进程全部清零。
      // 连胜/当日巡游属于「这一世」的当下进度;秘境是进行中的一次性内容
      // (其门槛 minMajor≥3 本就是境界限制,新世 major=0 理应推倒重来)。
      // 保留跨世:镇压/区域兴衰(「成长改变世界」的世界记忆,见 DEC-003)、
      // 机缘选择记忆(fortuneChoices,「世界记得你的选择」)、奇缘(eventChains)
      winStreak.value = 0
      lastCaveEventDay.value = 0
      secretRealm.value = null
      regionEvent.value = null
      // 卦是此一时的时机,不是"我是谁":转世即散
      divination.value = null
      // 突破准备也随这一世散去(下一世要重新备)
      breakthroughPrep.value = null
      // 命格点化主星是"这一世侧重哪一路"的选择:转世命盘重排,点化随之散去
      fateFocus.value = null
      // 星象值日定向与悟道兑换都是「当日账」:gameDay 相合才计入当日、次日自动回落/重置,
      // 转世**不**清它们 —— 否则同游戏日转世会重开当日兑换/改向配额(见 samsaraAudit
      // wudaoExchange/mansionRedirect 行,「此生交割」也把它们列为随神魂带走)

      // 镇压权益随皮囊散去:旧世压下的远境(多为高阶)若跨世,新世炼气仍在按旧阶位
      // 派发高阶装备/灵石,数值当场爆炸 —— 妖气复聚、回到历练地。这属于「我拥有多少」
      // 而非「我是谁」;宿敌记忆与区域战绩(regionStats)仍随神魂不灭(见 samsaraAudit
      // 'suppress' 一行的 partial 口径,「世界记得你」的叙事不丢)。
      // 资格(取得即永久那枚令)也是经济权柄:不随世走,否则新世炼气一键把高阶远境
      // 切回收益态,爆炸就换了个入口回来(sanitize 的 suppressReachable 兜老档同款)
      suppressedRegions.value = []
      suppressedSince.value = {}
      suppressQualified.value = []
      // 外物随皮囊散去:灵兽、洞府建筑、灵脉投资都是「我拥有多少」,不是「我是谁」
      petId.value = null
      dongfu.resetForRebirth()
      // 道童同为今生观中家业,随皮囊散去 —— 与洞府同处归零,新世 sync() 会补送一名入门道童
      apprentices.resetForRebirth()
      // 新的皮囊,新的道号:神魂不灭带走的是所知所历(宿慧/道果/天赋/称号),不是这个名号。
      // 每一世重掷一个道号(避免与上世撞名),亦是「N 世」在界面上一眼可辨的体现 ——
      // 否则转世后顶栏仍是同一个道号,「这一世是全新的一世」无从感知(见 samsaraAudit 的姓名一行)。
      let fresh: string
      do {
        fresh = randomDaoName(rng)
      } while (fresh === name.value)
      name.value = fresh
    }

    /** 存档修复 */
    function sanitize(): void {
      exp.value = gn(exp.value)
      /**
       * 灵根是**裸下标 + 裸方法**的两处渲染点:角色页写 `ELEMENTS[root.element].color`
       * 与 `linggen.growthMult.toFixed(2)`,建号页同样如此。坏档里元素名认不出时
       * 对 undefined 取属性、倍率写成 null 时对 null 调方法,渲染期直接抛错 ——
       * 而 Vue 会不断重试,玩家看到的是「出现异常,已记录」的 toast 反复弹出。
       * 故整份过一遍形状修复(见 core/linggenGen.sanitizeLinggen)。
       */
      linggen.value = sanitizeLinggen(linggen.value)
      if (!Number.isFinite(age.value)) age.value = START_AGE
      if (!Number.isFinite(major.value) || major.value < 0) major.value = 0
      if (!Number.isFinite(sub.value) || sub.value < 0) sub.value = 0
      /**
       * 佩戴物按 id 认物:认不出的称号/灵兽既不产出词条,也不该继续占着位置。
       * 灵兽尤其致命 —— 角色页取它的族类画图标,`petDef(...)!` 对野 id 当场抛错。
       */
      if (titleId.value !== null && !titleDef(titleId.value)) titleId.value = null
      if (petId.value !== null && !petDef(petId.value)) petId.value = null
      /**
       * 师承同理,只是后果更隐蔽:一经拜定便「不再更改」,认不出的旧 id 会把
       * mentor 占成非 null,此后每一次拜师都被挡回 —— 与天界认不出的道途 id
       * 属同一类彻底锁死。认不得即回落「尚未拜师」。
       */
      if (mentor.value !== null && !mentorDef(mentor.value)) mentor.value = null
      // 寿元加算:lifespanMax = floor(base×(1+pct) + 此栏),写坏(字符串/NaN)会让它变 NaN,
      // 而引擎死亡判据 `age < lifespanMax` 恒为 false → 下一拍即「油尽灯枯」。坏档必死,必须修回
      lifespanBonusYears.value = asFiniteNumber(lifespanBonusYears.value, 0)
      // Phase 32.5:旧存档没有宿慧/履历/命题三项,按转世次数折算补齐,不让老玩家凭空掉档
      const r = reincarnation.value
      const count = Number.isFinite(r?.count) ? Math.max(0, r.count) : 0
      // 旧存档没有卦象一栏(Phase 34.3);形状不对的直接作废,不让坏数据进属性汇总
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
      // 旧存档没有突破准备一栏(Phase 34.6);形状不对的直接作废
      if (breakthroughPrep.value) {
        const p = breakthroughPrep.value
        const ok = Number.isFinite(p.bonus) && Number.isFinite(p.readyAt) && (p.kind === 'meditate' || p.kind === 'pill')
        if (!ok) breakthroughPrep.value = null
      }
      // 旧存档没有顿悟冷却一栏(Phase 34.6):0 = 从未顿悟,合法
      if (!Number.isFinite(enlightenmentAt.value) || enlightenmentAt.value < 0) enlightenmentAt.value = 0
      /**
       * 命格点化主星(Phase A-1):白名单校验。
       * 认不出的 id(坏档/旧版)清回 null —— 别让坏 id 既得不到任何放大,
       * 也别让一个重复 id 在实际放大时假性命中而把某通道翻倍。
       */
      if (fateFocus.value !== null && !STARS.some(s => s.id === fateFocus.value)) {
        fateFocus.value = null
      }
      /**
       * 星象值日定向(Phase A-2):界域必须真实(WORLDS 里有这一界)、次数必须有限。
       * 形状不对/界域认不出 → 整块清空(回落到天数派生,不残留坏覆盖);次数越界夹回上限。
       */
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
      /**
       * 悟道兑换(Phase C-1):每日计数夹回 [0, WUDAO_EXCHANGE_PER_DAY]。
       * 坏档把 count 写成负数/NaN/越界,都会让当天要么白送、要么永不可兑 —— 夹回常态。
       */
      const we = wudaoExchange.value
      if (!we || !Number.isFinite(we.gameDay) || !Number.isFinite(we.count)) {
        wudaoExchange.value = { gameDay: 0, count: 0 }
      } else {
        wudaoExchange.value = {
          gameDay: Math.max(0, Math.floor(we.gameDay)),
          count: Math.min(WUDAO_EXCHANGE_PER_DAY, Math.max(0, Math.floor(we.count)))
        }
      }
      /**
       * 秘境状态修形(Phase 34.9):它现在真的会进档(以前是进不去的骨架)。
       * 层数越界会让「第 99 层」直接结算通关,携带气血越界会把战斗开局算成 NaN —— 故逐项夹回。
       */
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
            rules: asStringArray(sr.rules).filter(t => SECRET_RULES.some(r => r.text === t)),
            carriedHpPct: asCarriedHpPct(sr.carriedHpPct),
            finished: sr.finished === true
          }
        }
      }
      /**
       * 道侣状态修形(Phase 34.10):三维是 0~100 的钳制量(advanceBond 里夹过),
       * 但坏档能绕过写入口。若 trust 被改成 NaN,门槛判定(nextGateHint)与履历都会跟着算歪。
       */
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
            /**
             * 待决事件按 id 认事:认不出的 id 弹窗永远打不开(角色页读 pendingBondEvent 得 undefined),
             * 而 offerBondEvent 见到非空 pendingEventId 就不再出新事件 —— 整条道侣线会被一个
             * 野 id 永久堵死。认不得即回落「无待决」,下一次历练机会照常来。
             */
            pendingEventId:
              typeof b.pendingEventId === 'string' && bondEventDef(b.pendingEventId) ? b.pendingEventId : null,
            intentPending: b.intentPending === true,
            // 意图结构复杂且由经历催生:形状不对就整块作废,让她重新酝酿
            intent: b.intent && Array.isArray(b.intent.sparks) && typeof b.intent.wish === 'string' ? b.intent : null
          }
        }
      }
      /**
       * 区域动态事件:它靠 endsAt 自己过期(currentRegionEvent 里比较)。
       * 坏了就有两种结果 —— endsAt=NaN 永不失效,或者负值当场失效,故按「认不出就清掉」处理。
       * 事件 id 同样要认:野 id 不产生任何倍率,却照样占住「本轮已有事件」这一个槽,
       * 使真正的事件在它到期前一直掷不进来。
       */
      if (regionEvent.value) {
        const ev = regionEvent.value
        const regionOk = !!regionDef(ev.regionId) && !!regionEventDef(ev.eventId)
        const endsAt = asFiniteNumber(ev.endsAt, 0, 0)
        if (!regionOk || endsAt <= 0) regionEvent.value = null
        else regionEvent.value = { ...ev, endsAt }
      }
      /**
       * 奇缘连锁进度(Phase 34 奇缘录):写入口 setEventChain 已夹(0 ≤ stage),但读档
       * sanitize 此前没夹加载——越界/残链的 stage 会让 pendingChainStages 读到
       * chain.stages[done] === undefined,那条奇缘被当成「已了」永不再现。故这里夹回
       * [0, 链长],认不出的链整条清掉(跨世保留的设计不变,只是修形)。
       */
      if (typeof eventChains.value !== 'object' || eventChains.value === null) {
        eventChains.value = {}
      } else {
        const chainNext: Record<string, number> = {}
        for (const [chainId, stage] of Object.entries(eventChains.value)) {
          const chain = CHAINS.find(c => c.id === chainId)
          if (!chain) continue // 认不出的链:整条清掉
          chainNext[chainId] = Math.min(chain.stages.length, Math.max(0, Math.floor(asFiniteNumber(stage, 0, 0))))
        }
        eventChains.value = chainNext
      }
      /**
       * 数组类字段先补形,再谈内容 —— 存档可能被改坏、写坏或在旧版本里根本没有这一栏。
       * 此前只挡了 suppressQualified,没挡 suppressedRegions,于是坏档会在
       * `for...of` 上直接抛出,玩家看到的是白屏而不是「回到云隐山下」。
       */
      if (!Array.isArray(suppressedRegions.value)) suppressedRegions.value = []
      if (!Array.isArray(suppressQualified.value)) suppressQualified.value = []
      // 镇压权益是「这一世」的东西:凡这一世根本打不进那一界(minRealm>当前境界)的
      // 远境,要么是修复上线前已转世的老档残留、要么是被改档写进来的 —— 一律妖气复聚、
      // 回到它本来该在的地方。判据保守:只清「境界之下不可能征服」的,本世真实的镇压
      // (minRealm≤境界,转世前也这么压过)原样保留。suppressedSince 同步清,免得一旧一新。
      if (typeof suppressedSince.value !== 'object' || suppressedSince.value === null) suppressedSince.value = {}
      const suppressReachable = (id: string): boolean => (regionDef(id)?.minRealm ?? Infinity) <= major.value
      /**
       * 镇压表按地界去重:结算逐条遍历它,同一位写两遍会让同一片地界
       * 每拍产出两份灵石/物产/装备(离线一并放大);资格表同理会把「已镇压」判重。
       */
      suppressedRegions.value = [...new Set(asStringArray(suppressedRegions.value))].filter(suppressReachable)
      suppressQualified.value = [...new Set(asStringArray(suppressQualified.value))].filter(suppressReachable)
      /**
       * 镇压起钟只认「认得的地界 + 正数时刻」:坏档里的 NaN 会被
       * `now - NaN > 72h` 判成假,那片地界从此**永不复苏**(且界面写着
       * 「妖气 NaN 后复聚」);负值/0 则当场绕过守时直接复聚。两种都是坏档,
       * 不是「刚镇压」——按此刻重新起钟:收益照拿,72 小时后照常回到历练,
       * 既不会永久白拿,也不会因为一个坏数把已镇压的地界一并没收。
       * 不在镇压表里的起钟一并丢掉,免得旧档残项在「转为历练」后还留着。
       */
      const rawSince = asNumberRecord(suppressedSince.value)
      const fixedSince: Record<string, number> = {}
      for (const id of suppressedRegions.value) {
        const at = rawSince[id]
        fixedSince[id] = at !== undefined && at > 0 ? at : Date.now()
      }
      suppressedSince.value = fixedSince
      for (const id of suppressedRegions.value) {
        if (!suppressQualified.value.includes(id)) suppressQualified.value.push(id)
      }
      /**
       * 区域战绩是镇压判定与兴衰展示的共同底账:
       * - `avgRounds` 写成 NaN 时 `avgRounds <= 3` 恒假,玩家打满二十场也永远压不住;
       * - `lastUpdateAt` 写成 NaN 会让 `regionTouchedAt` 取 max 得 NaN,复聚钟停摆;
       * - 界面还会直接报「均 NaN 回合」「均受伤 NaN%」。
       * 逐项修平,认不出的区域整条丢掉(战绩只对真实地界有意义)。
       */
      const fixedRegionStats: Record<string, import('@/core/suppress').RegionStats> = {}
      for (const [id, raw] of Object.entries(asRecord<unknown>(regionStats.value))) {
        if (!regionDef(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const st = raw as Partial<import('@/core/suppress').RegionStats>
        fixedRegionStats[id] = {
          totalFights: Math.floor(asFiniteNumber(st.totalFights, 0, 0)),
          avgRounds: asFiniteNumber(st.avgRounds, 0, 0),
          // 受伤占比是 0~1 的比率(界面乘 100),越界只可能来自坏档
          avgDamageTakenPct: Math.min(1, asFiniteNumber(st.avgDamageTakenPct, 0, 0)),
          consecutiveWins: Math.floor(asFiniteNumber(st.consecutiveWins, 0, 0)),
          lastUpdateAt: asFiniteNumber(st.lastUpdateAt, 0, 0)
        }
      }
      regionStats.value = fixedRegionStats
      // 连胜/巡游日期都直接进界面与「今日已抽」判定:NaN 会让连胜显示成 NaN、
      // 巡游判定恒假(每 30 秒重掷一次)。按非负整数收口。
      winStreak.value = Math.floor(asFiniteNumber(winStreak.value, 0, 0))
      lastCaveEventDay.value = Math.floor(asFiniteNumber(lastCaveEventDay.value, 0, 0))
      regionWins.value = Object.fromEntries(
        Object.entries(asNumberRecord(regionWins.value, 0)).map(([id, n]) => [id, Math.floor(n)])
      )
      /**
       * 机缘选择记忆是「取 / 弃」的二元账:`identityService` 对它调 `Object.entries`、
       * 师承推荐与遗产回声按下标读 —— 坏档写成 `null` 时三处一起抛错(人物页的
       * 「修行身份」正是渲染期算的)。只留 `take`/`leave` 两个字面值:别的写法
       * 既不构成「取」(拿不到身份词条),也不构成「弃」(不会触发回声),留着只会
       * 让「曾选过」的账目看着有、实际哪一头都不算。
       */
      const fixedFortunes: Record<string, FortuneChoice> = {}
      for (const [id, choice] of Object.entries(asRecord<unknown>(fortuneChoices.value))) {
        if (choice === 'take' || choice === 'leave') fixedFortunes[id] = choice
      }
      fortuneChoices.value = fixedFortunes
      /**
       * 宿敌按 enemyId 认人:坏档里同一位写两条时,征战录会画出两行同 key、
       * 「宿敌 N 位」多报;而 recordLoss / markAvenged / ghostOf 都只 find 第一条,
       * 败绩与雪耻各记各的,第二条永远「尚为宿敌」。
       * 合并回一条:败绩取较大、最后败北取较晚、首次雪耻取较早那次。
       */
      const mergedNemeses = new Map<string, import('@/types').NemesisRecord>()
      for (const n of asArray<import('@/types').NemesisRecord>(
        nemeses.value,
        [],
        x => !!x && typeof (x as import('@/types').NemesisRecord).enemyId === 'string'
      )) {
        const lossCount = Math.max(0, Math.floor(asFiniteNumber(n.lossCount, 0, 0)))
        const lastLossAt = asFiniteNumber(n.lastLossAt, 0, 0)
        const avengedAt = typeof n.avengedAt === 'number' && Number.isFinite(n.avengedAt) ? n.avengedAt : undefined
        // 名字与地界都直接印在征战录上:坏值回落成可读文本,不让数字/null 露在「败我 N 次」前面
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
          // 同名宿敌合并时,先出现的那条若没有名字,后用后一条的
          enemyName: prev.enemyName || enemyName,
          regionId: prev.regionId || regionId,
          lossCount: Math.max(prev.lossCount, lossCount),
          lastLossAt: Math.max(prev.lastLossAt, lastLossAt),
          ...(firstAvenged === undefined ? {} : { avengedAt: firstAvenged })
        })
      }
      nemeses.value = [...mergedNemeses.values()]
      /**
       * 祭炼位按境界裁:超过当前境界的槽数(坏档/降境界的旧档)会让多出来的法宝
       * 被动一起生效 —— 槽位上限在 toggleArtifact/applyLoadout 那里是硬闸,读档同一把尺。
       * 截断而不是清空:保留先祭炼的那几件,与「槽满时替换最早」的顺序语义一致。
       */
      // sanitizeAll 里 player 先于 inventory,此处读到的是原始分片 —— 形状也要自己兜
      inventory.equippedArtifacts = asStringArray(inventory.equippedArtifacts).slice(0, artifactSlotsFor(major.value))
      reincarnation.value = {
        count,
        daoFruit: Number.isFinite(r?.daoFruit) ? Math.max(0, r.daoFruit) : 0,
        /**
         * 天赋/传承都是「有或没有」的集合(addTalent/addHeritage 只在没有时才加):
         * 坏档里同一条写两遍,talentMods 会把同一份词条算两次(白送属性),
         * 传承清单也会重复列出同一件。去重并只留认识的 id。
         *
         * 天赋不按数据表清未知 id:认不出的 id 本就不产生词条(talentDef 返回 undefined),
         * 但可能来自改名/下线的旧档,留着只在履历里显示原名,丢掉则是无声的档案损失。
         * 传承不同 —— 它参与「是否持有」判定,未知 id 必须清,否则会挡住发放路径。
         */
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

    // Phase 28 前期玩法动作
    /**
     * 奇缘进度 = 已走完的程数(0 未起,等于该链条长度即已了)。
     * 推进与断绝都只是"把它设到哪一程",故只留这一个写入口。
     */
    function setEventChain(chainId: string, stage: number): void {
      eventChains.value = { ...eventChains.value, [chainId]: Math.max(0, Math.floor(stage)) }
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

    // Phase 30 区域镇压操作
    function updateRegionStats(
      regionId: string,
      win: boolean,
      rounds: number,
      damageTakenPct: number,
    ): void {
      const current = regionStats.value[regionId] ?? {
        consecutiveWins: 0,
        totalFights: 0,
        avgRounds: 0,
        avgDamageTakenPct: 0,
        lastUpdateAt: Date.now(),
      }

      const newStats = {
        consecutiveWins: win ? current.consecutiveWins + 1 : 0,
        totalFights: current.totalFights + 1,
        avgRounds: current.avgRounds * 0.7 + rounds * 0.3,
        avgDamageTakenPct: current.avgDamageTakenPct * 0.7 + damageTakenPct * 0.3,
        lastUpdateAt: Date.now(),
      }

      regionStats.value = { ...regionStats.value, [regionId]: newStats }
    }

    function suppressRegion(regionId: string): void {
      if (!suppressedRegions.value.includes(regionId)) {
        suppressedRegions.value = [...suppressedRegions.value, regionId]
        suppressedSince.value = { ...suppressedSince.value, [regionId]: Date.now() }
      }
    }

    /** 记下镇压资格(幂等) —— 资格一旦取得便不再失,故与收益开关分开存 */
    function markSuppressQualified(regionId: string): void {
      if (!suppressQualified.value.includes(regionId)) {
        suppressQualified.value = [...suppressQualified.value, regionId]
      }
    }

    function unsuppressRegion(regionId: string): void {
      suppressedRegions.value = suppressedRegions.value.filter(id => id !== regionId)
      const next = { ...suppressedSince.value }
      delete next[regionId]
      suppressedSince.value = next
      // 重置连胜计数
      if (regionStats.value[regionId]) {
        regionStats.value = {
          ...regionStats.value,
          [regionId]: { ...regionStats.value[regionId]!, consecutiveWins: 0 },
        }
      }
    }

    // ---------- Phase 30.9 世界记忆 ----------
    /** 记录一次净胜(用于区域兴衰的累计胜场) */
    function recordRegionWin(regionId: string): void {
      regionWins.value = { ...regionWins.value, [regionId]: (regionWins.value[regionId] ?? 0) + 1 }
    }

    /** 记录一条宿敌(由 worldMemory.recordLoss 提供) */
    function setNemeses(list: import('@/types').NemesisRecord[]): void {
      nemeses.value = list
    }

    // ---------- Phase 31 师承 ----------
    /** 拜入师门(一经确立,不再更改;转世保留) */
    function adoptMentor(id: import('@/data/mentors').MentorId): void {
      if (mentor.value !== null) return
      mentor.value = id
    }

    // ---------- Phase 31 A2 区域事件 ----------
    function setRegionEvent(ev: import('@/core/regionEvent').RegionEventState | null): void {
      regionEvent.value = ev
    }

    // ---------- Phase 31 S3 短期秘境 ----------
    function setSecretRealm(state: import('@/core/secretRealm').SecretRealmState | null): void {
      secretRealm.value = state
    }

    // ---------- Phase 34.3 问卦 ----------
    function setDivination(state: import('@/core/divination').DivinationState | null): void {
      divination.value = state
    }

    // ---------- Phase 28 突破准备 ----------
    function setBreakthroughPrep(state: import('@/core/earlyGameService').BreakthroughPrepState | null): void {
      breakthroughPrep.value = state
    }

    function setEnlightenmentAt(t: number): void {
      enlightenmentAt.value = Number.isFinite(t) ? Math.max(0, t) : 0
    }

    // ---------- Phase A-1 命格点化主星 ----------
    /**
     * 点化主星:花灵石把某位主星之力放大(STAR_FOCUS_COST_BASE)。
     *
     * 守则:
     * - 只认十四主星(认不出的 id 直接拒,不产生新放大/不报错);
     * - 已点化同一星不反复收钱(点化是"选",不是"每次掏钱刷取值");
     * - 灵石不足原子拒绝(spendStone 契约):不扣、不改,返回 false。
     */
    function focusFateStar(starId: string): boolean {
      const star = STARS.find(s => s.id === starId)
      if (!star || fateFocus.value === starId) return false
      const cost = gn(STAR_FOCUS_COST_BASE)
      if (!resources.spendStone(cost)) return false
      fateFocus.value = starId
      return true
    }

    // ---------- Phase A-2 星象值日定向 ----------
    /**
     * 把今日值日定向到某界:花灵石(MANSION_REDIRECT_COST)把今日所利界域改成所选。
     *
     * 守则:
     * - 只认真实世界(WORLDS 里有这一界,认不出的直接拒);
     * - 已定向到同一界 / 当日次数已耗尽:不再收钱重复定向;
     * - 灵石不足原子拒绝(spendStone 契约):不扣、不改、返回 false。
     * 每一成功定向让当日 count +1;count 达 MANSION_REDIRECT_MAX 当日即回落到天数派生(core/astronomy 判定)。
     */
    function redirectFavoredWorld(worldId: WorldId): boolean {
      if (!WORLDS.some(w => w.id === worldId)) return false
      const day = gameDay(useGameStore().totalPlaySec)
      const cur = mansionRedirect.value
      if (cur && cur.gameDay === day && (cur.count >= MANSION_REDIRECT_MAX || cur.worldId === worldId)) {
        return false
      }
      const cost = gn(MANSION_REDIRECT_COST)
      if (!resources.spendStone(cost)) return false
      mansionRedirect.value = cur && cur.gameDay === day ? { gameDay: day, worldId, count: cur.count + 1 } : { gameDay: day, worldId, count: 1 }
      return true
    }

    // ---------- Phase C-1 后期限量灵石→悟道兑换 ----------
    /**
     * 后期限量「灵石 → 悟道点」兑换。
     *
     * 后期(realm≥18)灵石过剩,给一个可控出口换悟道点(功法进修/法宝炼化的真货币)。
     * 守则:
     * - 境界不到 WUDAO_EXCHANGE_MIN_MAJOR 不开(锁定,连灵石也不碰);
     * - 当天已兑满 WUDAO_EXCHANGE_PER_DAY 拒兑(限额是"节奏",不是无限印钞机);
     * - 灵石不足原子拒绝(spendStone 契约):不扣、不加、返回 false。
     * 只动灵石→悟道这条**可选的限量**出口,不重建效率回路、不动熔炉(审计敏感点)。
     */
    function exchangeStoneForWudao(): boolean {
      if (major.value < WUDAO_EXCHANGE_MIN_MAJOR) return false
      const day = gameDay(useGameStore().totalPlaySec)
      const cur = wudaoExchange.value
      const today = cur && cur.gameDay === day ? cur : { gameDay: day, count: 0 }
      if (today.count >= WUDAO_EXCHANGE_PER_DAY) return false
      if (!resources.spendStone(gn(WUDAO_EXCHANGE_PRICE_BASE))) return false
      resources.addSmall('wudao', WUDAO_EXCHANGE_GAIN)
      wudaoExchange.value = { gameDay: day, count: today.count + 1 }
      return true
    }
    /** 今天已兑了几次(次日自动归零的口径,界面展示用) */
    const wudaoExchangeToday = computed(() => {
      const day = gameDay(useGameStore().totalPlaySec)
      const cur = wudaoExchange.value
      return cur && cur.gameDay === day ? cur.count : 0
    })
    /** 现在能不能再兑(境界到门 + 当日未兑满) */
    const canExchangeWudao = computed(
      () => major.value >= WUDAO_EXCHANGE_MIN_MAJOR && wudaoExchangeToday.value < WUDAO_EXCHANGE_PER_DAY
    )

    // ---------- Phase 31.1 机缘链 ----------
    function setFortuneChoices(choices: Record<string, FortuneChoice>): void {
      fortuneChoices.value = choices
    }

    /**
     * 暂停恢复:把按墙钟到期的状态顺延暂停时长。
     *
     * 暂停(重置 / 导入确认窗)期间心跳不结算,但这些时间戳仍按真实时钟走 ——
     * 不顺延就会「确认窗背后自己散卦、区域事件自己过期、调息自己变就绪」。
     * 与 `enginePause.gameNow()` 的冻结语义配套;持续时长的起点
     * (suppressedSince / regionStats.lastUpdateAt)同样顺延,免得暂停吃掉
     * 镇压复聚或世界记忆的计时。
     */
    function shiftTimedState(pausedMs: number): void {
      if (pausedMs <= 0) return
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
      nemeses,
      regionWins,
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
      suppressRegion,
      unsuppressRegion,
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
