/** 任务 / 成就 / 称号 / 图鉴 / 计数器 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CounterKey } from '@/types'
import { persistConfig } from '@/utils/storage'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { ACHIEVEMENTS } from '@/data/achievements'
import { TITLES } from '@/data/titles'
import { asFiniteNumber, asNumberRecord, asObjectOrNull, asRecord, asStringArray } from '@/utils/saveShape'

export type CollectionCategory = 'equip' | 'gongfa' | 'pill' | 'artifact' | 'pet' | 'event' | 'talent' | 'daolu'

export const useQuestsStore = defineStore(
  'quests',
  () => {
    const counters = ref<Partial<Record<CounterKey, number>>>({})
    const achieved = ref<string[]>([])
    const mainIdx = ref(0)
    const daily = ref<{ date: string; base: Partial<Record<CounterKey, number>>; done: string[] }>({
      date: '',
      base: {},
      done: []
    })
    const titlesOwned = ref<string[]>([])
    const collections = ref<Record<CollectionCategory, string[]>>({
      equip: [],
      gongfa: [],
      pill: [],
      artifact: [],
      pet: [],
      event: [],
      talent: [],
      // 人缘:历世遇见过的道侣。道侣这一世只遇一位,跨世累积才看得出「我都遇过谁」
      daolu: []
    })
    /** 图鉴收录时刻,键为 `${category}:${id}`(旧档已收录条目无记录) */
    const collectedAt = ref<Record<string, number>>({})
    /** 成就达成时刻,键为成就 id */
    const achievedAt = ref<Record<string, number>>({})

    /** 存档修复:计数/图鉴表写坏会让成就判定与图鉴页在渲染期抛错 */
    function sanitize(): void {
      counters.value = asNumberRecord(counters.value, 0)
      // 成就是集合语义:与 unlockAchievement 同口径去重;只留认得的 id(野 id 画不出来却照样计数)
      const achievementIds = new Set(ACHIEVEMENTS.map(a => a.id))
      achieved.value = [...new Set(asStringArray(achieved.value))].filter(id => achievementIds.has(id))
      const maxIdx = Math.max(0, MAIN_QUESTS.length - 1)
      mainIdx.value = Math.min(Math.floor(asFiniteNumber(mainIdx.value, 0, 0)), maxIdx)
      const d = asObjectOrNull<{ date?: unknown; base?: unknown; done?: unknown }>(daily.value)
      const base = asNumberRecord(d?.base, 0)
      /*
       * 日课基线缺失时的兜底:把当前累计当作基线。
       *
       * dailyDelta = counters - base。base 被读成空记录(坏档、手改、字段改名)
       * 而 date 恰好还是今天时,delta 就等于**历史累计** —— 实测 counters.kills=500、
       * base={} 时 delta 是 500,于是 checkDaily 一开局就把所有日课判为达成,
       * 白送全天奖励并刷一串 toast。
       *
       * 归零(delta=0)与抄成当前累计是同一个效果,但后备语义更清楚:
       * 「今天从此刻开始算」,而不是「从 0 起算」。
       */
      const hasBase = Object.keys(base).length > 0
      daily.value = {
        date: typeof d?.date === 'string' ? d.date : '',
        base: hasBase ? base : { ...counters.value },
        done: [...new Set(asStringArray(d?.done))]
      }
      // 名号同为集合:去重;认不出的 id 不产生词条,只在计数上虚增
      const titleIds = new Set(TITLES.map(t => t.id))
      titlesOwned.value = [...new Set(asStringArray(titlesOwned.value))].filter(id => titleIds.has(id))
      const cats = asRecord<string[]>(collections.value)
      // 图鉴各类同为集合语义(collect 只在没有时追加):重复 id 让「已收 N」多报、灵兽册出重复 v-for key
      collections.value = {
        equip: [...new Set(asStringArray(cats.equip))],
        gongfa: [...new Set(asStringArray(cats.gongfa))],
        pill: [...new Set(asStringArray(cats.pill))],
        artifact: [...new Set(asStringArray(cats.artifact))],
        pet: [...new Set(asStringArray(cats.pet))],
        event: [...new Set(asStringArray(cats.event))],
        talent: [...new Set(asStringArray(cats.talent))],
        // 旧档没有这一栏:asStringArray(undefined) 得空数组,自动补上
        daolu: [...new Set(asStringArray(cats.daolu))]
      }
      collectedAt.value = asNumberRecord(collectedAt.value, 0)
      achievedAt.value = asNumberRecord(achievedAt.value, 0)
    }

    const currentMainQuest = computed(() => MAIN_QUESTS[mainIdx.value])

    function counter(key: CounterKey): number {
      return counters.value[key] ?? 0
    }

    function inc(key: CounterKey, n = 1): void {
      if (!Number.isFinite(n) || n <= 0) return
      counters.value = { ...counters.value, [key]: (counters.value[key] ?? 0) + n }
    }

    function hasAchieved(id: string): boolean {
      return achieved.value.includes(id)
    }

    function unlockAchievement(id: string): boolean {
      if (achieved.value.includes(id)) return false
      achieved.value = [...achieved.value, id]
      achievedAt.value = { ...achievedAt.value, [id]: Date.now() }
      return true
    }

    function advanceMain(): void {
      const last = MAIN_QUESTS.length - 1
      if (mainIdx.value < last) mainIdx.value += 1
    }

    function ownTitle(id: string): boolean {
      if (titlesOwned.value.includes(id)) return false
      titlesOwned.value = [...titlesOwned.value, id]
      return true
    }

    function collect(category: CollectionCategory, id: string): boolean {
      const list = collections.value[category]
      if (!Array.isArray(list) || typeof id !== 'string' || id.trim() === '') return false
      if (list.includes(id)) return false
      collections.value = { ...collections.value, [category]: [...list, id] }
      collectedAt.value = { ...collectedAt.value, [`${category}:${id}`]: Date.now() }
      return true
    }

    function rolloverDaily(date: string): void {
      daily.value = { date, base: { ...counters.value }, done: [] }
    }

    function dailyDelta(key: CounterKey): number {
      return (counters.value[key] ?? 0) - (daily.value.base[key] ?? 0)
    }

    function markDailyDone(taskId: string): void {
      if (!DAILY_TASKS.some(t => t.id === taskId) || daily.value.done.includes(taskId)) return
      daily.value = { ...daily.value, done: [...daily.value.done, taskId] }
    }

    return {
      counters,
      achieved,
      mainIdx,
      daily,
      titlesOwned,
      collections,
      collectedAt,
      achievedAt,
      currentMainQuest,
      counter,
      inc,
      hasAchieved,
      unlockAchievement,
      advanceMain,
      ownTitle,
      collect,
      rolloverDaily,
      dailyDelta,
      markDailyDone,
      sanitize
    }
  },
  { persist: persistConfig('quests') }
)
