/** 玩家状态 —— 境界 / 修为 / 寿元 / 灵根 / 最终属性汇总 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FinalStats, GNum, LinggenProfile, StatMods } from '@/types'
import { gn, gnMin, gnZero, add, gte, mulN, progress, subClamp } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { realmDef, realmLabel, SUB_NAMES, MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS, START_AGE } from '@/data/constants'
import { legacyInsightOf } from '@/data/samsara'
import { titleDef } from '@/data/titles'
import { petDef } from '@/data/pets'
import { mentorDef } from '@/data/mentors'
import { talentDef } from '@/data/talents'
import { baseCultPerSec, baseQiRegen, expRequirement, qiCap } from '@/core/formulas'
import { computeFinalStats, modOf } from '@/core/statsCalc'
import { forgeSoul } from '@/core/gauntlet'
import type { FortuneChoice } from '@/core/fortuneChain'
import { useInventoryStore } from './inventory'
import { useCultivationStore } from './cultivation'
import { useDongfuStore } from './dongfu'
import { useResourcesStore } from './resources'
import { useEndgameStore } from './endgame'

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
    const eventChains = ref<Record<string, number>>({}) // 奇遇连锁进度
    const winStreak = ref(0) // 当前连胜数
    const lastCaveEventDay = ref(0) // 上次洞府巡游日期
    const selectedRoute = ref<'safe' | 'risky' | 'dangerous'>('safe') // 当前探索路线
    const companionBeastId = ref<string | null>(null) // 陪行灵兽

    // Phase 30 区域镇压(每个区域独立统计)
    const regionStats = ref<Record<string, import('@/core/suppress').RegionStats>>({})
    const suppressedRegions = ref<string[]>([])
    /** 镇压时间戳:区域 → 镇压开始的时刻(供复苏判定) */
    const suppressedSince = ref<Record<string, number>>({})

    // Phase 31 师承:凡界修行者的额外成长思想(跨世保留)
    const mentor = ref<import('@/data/mentors').MentorId | null>(null)

    // Phase 31 A2 区域动态事件(单区域内一次一个,自动过期)
    const regionEvent = ref<import('@/core/regionEvent').RegionEventState | null>(null)

    // Phase 31 S3 短期秘境(一次性内容容器,进行中状态)
    const secretRealm = ref<import('@/core/secretRealm').SecretRealmState | null>(null)

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
    const subName = computed(() => SUB_NAMES[Math.min(sub.value, SUB_NAMES.length - 1)]!)
    const expReq = computed(() => expRequirement(major.value, sub.value))
    const expProgress = computed(() => progress(exp.value, expReq.value))
    const expFull = computed(() => gte(exp.value, expReq.value))
    const isMajorStep = computed(() => sub.value >= SUB_LEVELS - 1)
    const atMaxRealm = computed(() => major.value >= MAX_MAJOR && sub.value >= SUB_LEVELS - 1)

    // ---------- 属性汇总 ----------
    const talentMods = computed<StatMods[]>(() => reincarnation.value.talents.map(id => talentDef(id)?.mods ?? {}))
    const titleMods = computed<StatMods>(() => (titleId.value ? (titleDef(titleId.value)?.mods ?? {}) : {}))
    const mentorMods = computed<StatMods>(() => {
      if (!mentor.value) return {}
      return mentorDef(mentor.value)?.mods ?? {}
    })
    const petMods = computed<StatMods>(() => {
      if (!petId.value) return {}
      const def = petDef(petId.value)
      if (!def) return {}
      const scaled: StatMods = {}
      for (const k in def.mods) {
        const key = k as keyof StatMods
        scaled[key] = (def.mods[key] ?? 0) * dongfu.beastMult
      }
      return scaled
    })

    const qiCapValue = computed(() => Math.floor(qiCap(major.value, sub.value) * dongfu.qiCapMult))
    const qiRich = computed(() => resources.qi >= qiCapValue.value * 0.5)

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
          ...talentMods.value
        ],
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
      const equipSide = endgame.activeSouls.length > 0 ? endgame.soulMods : forgeSoul(inventory.equipMods)
      return computeFinalStats({
        major: major.value,
        sub: sub.value,
        linggenMult: linggen.value?.growthMult ?? 1,
        modSources: [
          equipSide,
          cultivation.gongfaMods,
          cultivation.buffMods,
          dongfu.buildingMods,
          dongfu.veinMods,
          titleMods.value,
          mentorMods.value,
          petMods.value,
          ...talentMods.value
        ],
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

    /** 增加修为,封顶于当前突破需求 */
    function gainExp(v: GNum): void {
      exp.value = gnMin(add(exp.value, v), expReq.value)
    }

    function loseExpPct(pct: number): void {
      exp.value = subClamp(exp.value, mulN(exp.value, pct))
    }

    function advanceRealm(): void {
      if (isMajorStep.value) {
        if (major.value < MAX_MAJOR) {
          major.value += 1
          sub.value = 0
        }
      } else {
        sub.value += 1
      }
      exp.value = gnZero()
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
    }

    /** 存档修复 */
    function sanitize(): void {
      exp.value = gn(exp.value)
      if (!Number.isFinite(age.value)) age.value = START_AGE
      if (!Number.isFinite(major.value) || major.value < 0) major.value = 0
      if (!Number.isFinite(sub.value) || sub.value < 0) sub.value = 0
      // Phase 32.5:旧存档没有宿慧/履历/命题三项,按转世次数折算补齐,不让老玩家凭空掉档
      const r = reincarnation.value
      const count = Number.isFinite(r?.count) ? Math.max(0, r.count) : 0
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
    function advanceEventChain(eventId: string): void {
      const current = eventChains.value[eventId] ?? 0
      eventChains.value = { ...eventChains.value, [eventId]: current + 1 }
    }

    function incrementWinStreak(): void {
      winStreak.value += 1
    }

    function resetWinStreak(): void {
      winStreak.value = 0
    }

    function setSelectedRoute(route: 'safe' | 'risky' | 'dangerous'): void {
      selectedRoute.value = route
    }

    function setCompanionBeast(id: string | null): void {
      companionBeastId.value = id
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
      selectedRoute,
      companionBeastId,
      regionStats,
      suppressedRegions,
      suppressedSince,
      nemeses,
      regionWins,
      mentor,
      regionEvent,
      secretRealm,
      fortuneChoices,
      realm,
      realmName,
      subName,
      expReq,
      expProgress,
      expFull,
      isMajorStep,
      atMaxRealm,
      qiCapValue,
      qiRich,
      finalStats,
      celestialStats,
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
      advanceEventChain,
      incrementWinStreak,
      resetWinStreak,
      setSelectedRoute,
      setCompanionBeast,
      markCaveEventToday,
      updateRegionStats,
      suppressRegion,
      unsuppressRegion,
      recordRegionWin,
      setNemeses,
      adoptMentor,
      setRegionEvent,
      setSecretRealm,
      setFortuneChoices
    }
  },
  { persist: persistConfig('player') }
)
