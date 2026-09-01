/** 玩家状态 —— 境界 / 修为 / 寿元 / 灵根 / 最终属性汇总 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FinalStats, GNum, LinggenProfile, StatMods } from '@/types'
import { gn, gnMin, gnZero, add, gte, mulN, progress, subClamp } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { realmDef, realmLabel, SUB_NAMES, MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS, START_AGE } from '@/data/constants'
import { titleDef } from '@/data/titles'
import { petDef } from '@/data/pets'
import { mentorDef } from '@/data/mentors'
import { talentDef } from '@/data/talents'
import { baseCultPerSec, baseQiRegen, expRequirement, qiCap } from '@/core/formulas'
import { computeFinalStats, modOf } from '@/core/statsCalc'
import { useInventoryStore } from './inventory'
import { useCultivationStore } from './cultivation'
import { useDongfuStore } from './dongfu'
import { useResourcesStore } from './resources'

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
    const reincarnation = ref({ count: 0, daoFruit: 0, talents: [] as string[] })

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
      setSecretRealm
    }
  },
  { persist: persistConfig('player') }
)
