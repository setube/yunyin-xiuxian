/** 玩家状态 —— 境界 / 修为 / 寿元 / 灵根 / 最终属性汇总 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FinalStats, GNum, LinggenProfile, StatMods } from '@/types'
import { gn, gnZero, add, gte, mulN, progress, subClamp } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { realmDef, realmLabel, worldOf, SUB_NAMES, MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS, START_AGE } from '@/data/constants'
import { QI_BANK_MULT, QI_RICH_RATIO } from '@/data/constants'
import { legacyInsightOf } from '@/data/samsara'
import { titleDef } from '@/data/titles'
import { petDef } from '@/data/pets'
import { mentorDef } from '@/data/mentors'
import { talentDef } from '@/data/talents'
import { randomDaoName } from '@/data/names'
import { rng } from '@/utils/random'
import { baseCultPerSec, baseQiRegen, expRequirement, qiCap } from '@/core/formulas'
import { computeFinalStats, mergeMods, modOf } from '@/core/statsCalc'
import { todayWeather } from '@/core/weather'
import { readingFromState, readingMods } from '@/core/divination'
import { asFiniteNumber, asStringArray } from '@/utils/saveShape'
import { SECRET_LAYERS, SECRET_MAX_LOSSES, SECRET_REALMS, SECRET_RULES } from '@/data/secretRealms'
import { DAOLU, STAGE_ORDER } from '@/data/daolu'
import { regionDef } from '@/data/regions'
import { fateChart, fateMods, fateSeed } from '@/core/fate'
import type { FortuneChoice } from '@/core/fortuneChain'
import { useInventoryStore } from './inventory'
import { useCultivationStore } from './cultivation'
import { useDongfuStore } from './dongfu'
import { useResourcesStore } from './resources'
import { useEndgameStore } from './endgame'
import { useGameStore } from './game'

export const usePlayerStore = defineStore(
  'player',
  () => {
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    const dongfu = useDongfuStore()
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
      return state && state.expiresAt > Date.now() ? state : null
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
    const fateModsValue = computed<StatMods>(() => fateMods(chart.value))

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

    const petMods = computed<StatMods>(() => {
      if (!petId.value) return {}
      const def = petDef(petId.value)
      if (!def) return {}
      const beastPct = 1 + modOf(mergeMods(ownedModSources.value), 'beastPct')
      const scaled: StatMods = {}
      for (const k in def.mods) {
        const key = k as keyof StatMods
        scaled[key] = (def.mods[key] ?? 0) * dongfu.beastMult * beastPct
      }
      return scaled
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
      () => baseCultPerSec(major.value, sub.value) * Math.max(0.05, 1 + modOf(finalStats.value.mods, 'cultivationSpeed'))
    )
    const qiRegenPerSec = computed(() => baseQiRegen(major.value) * Math.max(0.05, 1 + modOf(finalStats.value.mods, 'qiRegen')))

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

    /** 转世重置(保留天赋/道果/转世次数) */
    function rebirth(newLinggen: LinggenProfile): void {
      reincarnation.value = { ...reincarnation.value, count: reincarnation.value.count + 1 }
      linggen.value = newLinggen
      major.value = 0
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
      if (!Number.isFinite(age.value)) age.value = START_AGE
      if (!Number.isFinite(major.value) || major.value < 0) major.value = 0
      if (!Number.isFinite(sub.value) || sub.value < 0) sub.value = 0
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
            carriedHpPct: Math.min(1, asFiniteNumber(sr.carriedHpPct, 1, 0.05)),
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
            pendingEventId: typeof b.pendingEventId === 'string' ? b.pendingEventId : null,
            intentPending: b.intentPending === true,
            // 意图结构复杂且由经历催生:形状不对就整块作废,让她重新酝酿
            intent: b.intent && Array.isArray(b.intent.sparks) && typeof b.intent.wish === 'string' ? b.intent : null
          }
        }
      }
      /**
       * 区域动态事件:它靠 endsAt 自己过期(currentRegionEvent 里比较)。
       * 坏了就有两种结果 —— endsAt=NaN 永不失效,或者负值当场失效,故按「认不出就清掉」处理。
       */
      if (regionEvent.value) {
        const ev = regionEvent.value
        const regionOk = !!regionDef(ev.regionId)
        const endsAt = asFiniteNumber(ev.endsAt, 0, 0)
        if (!regionOk || endsAt <= 0) regionEvent.value = null
        else regionEvent.value = { ...ev, endsAt }
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
      suppressedRegions.value = suppressedRegions.value.filter(suppressReachable)
      suppressQualified.value = suppressQualified.value.filter(suppressReachable)
      suppressedSince.value = Object.fromEntries(Object.entries(suppressedSince.value).filter(([id]) => suppressReachable(id)))
      for (const id of suppressedRegions.value) {
        if (!suppressQualified.value.includes(id)) suppressQualified.value.push(id)
      }
      reincarnation.value = {
        count,
        daoFruit: Number.isFinite(r?.daoFruit) ? Math.max(0, r.daoFruit) : 0,
        talents: Array.isArray(r?.talents) ? r.talents : [],
        insight: Number.isFinite(r?.insight) ? Math.max(0, r.insight) : legacyInsightOf(count),
        lives: Array.isArray(r?.lives) ? r.lives : [],
        vow: r?.vow ?? null,
        trial: r?.trial ?? null,
        bonds: Array.isArray(r?.bonds) ? r.bonds : []
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

    // ---------- Phase 31.1 机缘链 ----------
    function setFortuneChoices(choices: Record<string, FortuneChoice>): void {
      fortuneChoices.value = choices
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
      setFortuneChoices
    }
  },
  { persist: persistConfig('player') }
)
