/** 任务 / 成就 / 称号 / 图鉴 / 计数器 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CounterKey } from '@/types'
import { persistConfig } from '@/utils/storage'
import { MAIN_QUESTS } from '@/data/quests'
import { asFiniteNumber, asNumberRecord, asObjectOrNull, asRecord, asStringArray } from '@/utils/saveShape'

export type CollectionCategory = 'equip' | 'gongfa' | 'pill' | 'artifact' | 'pet' | 'event' | 'talent'

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
      talent: []
    })
    /** 图鉴收录时刻,键为 `${category}:${id}`(旧档已收录条目无记录) */
    const collectedAt = ref<Record<string, number>>({})
    /** 成就达成时刻,键为成就 id —— 与收藏页的「收录时间」同型而补在成就一侧 */
    const achievedAt = ref<Record<string, number>>({})

    /** 存档修复:计数/图鉴表被写坏会让成就判定与图鉴页在渲染期抛错 */
    function sanitize(): void {
      counters.value = asNumberRecord(counters.value, 0)
      achieved.value = asStringArray(achieved.value)
      const maxIdx = Math.max(0, MAIN_QUESTS.length - 1)
      mainIdx.value = Math.min(Math.floor(asFiniteNumber(mainIdx.value, 0, 0)), maxIdx)
      const d = asObjectOrNull<{ date?: unknown; base?: unknown; done?: unknown }>(daily.value)
      daily.value = {
        date: typeof d?.date === 'string' ? d.date : '',
        base: asNumberRecord(d?.base, 0),
        done: asStringArray(d?.done)
      }
      titlesOwned.value = asStringArray(titlesOwned.value)
      const cats = asRecord<string[]>(collections.value)
      collections.value = {
        equip: asStringArray(cats.equip),
        gongfa: asStringArray(cats.gongfa),
        pill: asStringArray(cats.pill),
        artifact: asStringArray(cats.artifact),
        pet: asStringArray(cats.pet),
        event: asStringArray(cats.event),
        talent: asStringArray(cats.talent)
      }
      collectedAt.value = asNumberRecord(collectedAt.value, 0)
      achievedAt.value = asNumberRecord(achievedAt.value, 0)
    }

    const currentMainQuest = computed(() => MAIN_QUESTS[mainIdx.value])

    function counter(key: CounterKey): number {
      return counters.value[key] ?? 0
    }

    function inc(key: CounterKey, n = 1): void {
      counters.value = { ...counters.value, [key]: (counters.value[key] ?? 0) + n }
    }

    function hasAchieved(id: string): boolean {
      return achieved.value.includes(id)
    }

    function unlockAchievement(id: string): boolean {
      if (achieved.value.includes(id)) return false
      achieved.value = [...achieved.value, id]
      // 与收藏页同型:达成那刻落定,供成就页回看「何时达成某里程碑」
      achievedAt.value = { ...achievedAt.value, [id]: Date.now() }
      return true
    }

    function advanceMain(): void {
      mainIdx.value += 1
    }

    function ownTitle(id: string): boolean {
      if (titlesOwned.value.includes(id)) return false
      titlesOwned.value = [...titlesOwned.value, id]
      return true
    }

    function collect(category: CollectionCategory, id: string): boolean {
      const list = collections.value[category]
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
