/** 任务 / 成就 / 称号 / 图鉴 / 计数器 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CounterKey } from '@/types'
import { persistConfig } from '@/utils/storage'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { COUNTER_KEYS } from '@/data/counterKeys'
import { ACHIEVEMENTS } from '@/data/achievements'
import { TITLES } from '@/data/titles'
import { CODEX_IDS } from '@/data/codexIds'
import { asFiniteNumber, asNumberRecord, asObjectOrNull, asRecord, asStringArray, truncateCodePoints } from '@/utils/saveShape'

/**
 * 计数器与日课基线的读档上界。
 *
 * 这两处都是**判定依据**(成就 `counter >= value`、日课 `counters - base`),
 * 不只是显示值。单局几千场已是长线,真实可达到的计数远低于一亿。
 */
const COUNTER_MAX = 100_000_000

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
      /*
       * 计数器是**成就/任务/日课三处的判定依据**,不只是显示值。
       *
       * `asNumberRecord` 只挡非有限值与负数,不管上界 —— 坏档写 `kills: 1e300`
       * 会原样留下,而 `evalCond` 的判据是 `counter(key) >= cond.value`,
       * 于是**一次解锁全部计数类成就**(实测 5 个),日课也一并判为达成。
       * 上界取一亿,超出**归零而不是夹到上界**:夹到一亿仍然是「远超所有成就阈值」的
       * 合法读数,判据照样全过 —— 归零才表达「这条读数不可信」。
       * (同理见 `inventory` 的 `investedDust`;与「夹到边界」那种修法区分开:
       * 夹的值本身可信、只是越界,归零的是值本身不可信。)
       */
      /*
       * 表外的键整条丢掉。
       *
       * 写入侧只有 `inc()`,它的 key 是编译期联合类型;而 `CounterKey` 运行时一个字都不剩,
       * 读档时无从判断一个键认不认得。于是坏档能塞任意多键:实测十万个野键 →
       * `$state` 3.18MB、`sanitize` 自己跑 398ms,而这一步在启动路径上。
       * 野键既不参与 `evalCond`(`counter(key)` 只按已知键查)也不显示,唯一作用是撑大存档。
       *
       * 认得哪些键由 `data/counterKeys` 给出 —— 那份表从**数据表与源码里的 track 调用**
       * 两路推导,不手写;覆盖是否完整有 `counterKeysCoverage.spec` 从源码核。
       */
      counters.value = Object.fromEntries(
        Object.entries(asNumberRecord(counters.value, 0))
          .filter(([k]) => COUNTER_KEYS.has(k as CounterKey))
          .map(([k, v]) => [k, v > COUNTER_MAX ? 0 : v])
      )
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
      /*
       * 基线也要设上界 —— 它与 `counters` 是同一类**判定依据**(`dailyDelta = counters - base`)。
       *
       * 只看「有没有键」不够:坏档写 `base.kills: 1e300` 时,delta 恒为极大的负数,
       * 日课**永远做不完**(实测 `dailyDelta` 得 -1e300)。
       * 巨值按「基线缺失」处理 —— 回落到当前累计,即「今天从此刻开始算」,
       * 这与上面那条兜底同一个语义;归零反而会让 delta 变成历史累计,正是要避免的白送。
       */
      const hasBase =
        Object.keys(base).length > 0 && !Object.values(base).some(v => v > COUNTER_MAX)
      daily.value = {
        /*
         * 日期串也要截。它的合法形只有「YYYY-M-D」(最长 10 字符),而坏档能塞几十万字符 ——
         * 存档爆量,而这条记录本就不参与任何展示(只经 `dayStrToNum` 的正则解析)。
         * 截到 16 已宽:正则不匹配即按「没有记录」翻日,与坏值同一条退路。
         */
        date: typeof d?.date === 'string' ? truncateCodePoints(d.date, 16) : '',
        base: hasBase ? base : { ...counters.value },
        // 与写入路径(completeDaily 的 `DAILY_TASKS.some`)同一道闸:认不得的任务 id 清掉。
        // 原先只去重 —— 手改存档塞 10 万条后 $state 到 1.29MB,存档顶到配额。
        done: [...new Set(asStringArray(d?.done))].filter(id => DAILY_TASKS.some(t => t.id === id))
      }
      // 名号同为集合:去重;认不出的 id 不产生词条,只在计数上虚增
      const titleIds = new Set(TITLES.map(t => t.id))
      titlesOwned.value = [...new Set(asStringArray(titlesOwned.value))].filter(id => titleIds.has(id))
      const cats = asRecord<string[]>(collections.value)
      /*
       * 图鉴各类同为集合语义(collect 只在没有时追加):重复 id 让「已收 N」多报、
       * 灵兽册出重复 v-for key。
       *
       * 还须**滤掉表外的 id**。写入侧 `collect` 的 id 全来自数据表,表外只可能来自坏档;
       * 而收藏册每一处展示都是拿表逐条比对(`codexOwnedCount`、CollectionView 的 entries),
       * 表外 id 既不显示也不计数 —— 唯一作用是把存档撑大:实测十万条野 id 让存档涨到 1.29MB,
       * 那一页却一个字都不会多出来。
       */
      const dedupe = (cat: CollectionCategory): string[] =>
        [...new Set(asStringArray(cats[cat]))].filter(id => CODEX_IDS[cat].has(id))
      collections.value = {
        equip: dedupe('equip'),
        gongfa: dedupe('gongfa'),
        pill: dedupe('pill'),
        artifact: dedupe('artifact'),
        pet: dedupe('pet'),
        event: dedupe('event'),
        talent: dedupe('talent'),
        // 旧档没有这一栏:asStringArray(undefined) 得空数组,自动补上
        daolu: dedupe('daolu')
      }
      /*
       * 两张时间戳表也要按**还留着的键**清 —— 它们是上面两张集合的配套索引。
       *
       * 上一轮把图鉴里的表外 id 与成就里的野 id 清掉了,却漏了这两张表:
       * `asNumberRecord` 只挡非有限值与负数,不管键,两张表各自的键数也没有上界。
       * 实测各灌十万个野键:sanitize 之后 state 仍是 6.38MB,而这两张表**只用来显示
       * 「收录时间」「达成于」** —— 键不在集合里,那一行永远不会被画出来。
       *
       * 键必须由上一步的结果推出来,不能各自独立算:收录键的形是 `${category}:${id}`,
       * 而 `achievedAt` 的键就是成就 id。这样「集合里有的才有时间戳」成为一条不变式,
       * 也顺带挡掉了 `equip:xxx` 这种把类别写错的键。
       */
      const collectionKeys = new Set(
        (Object.keys(collections.value) as CollectionCategory[]).flatMap(cat =>
          collections.value[cat].map(id => `${cat}:${id}`)
        )
      )
      const achievementKeys = new Set(achieved.value)
      const keepOnly = (raw: unknown, allowed: Set<string>): Record<string, number> => {
        const out: Record<string, number> = {}
        for (const [k, v] of Object.entries(asNumberRecord(raw, 0))) {
          if (allowed.has(k)) out[k] = v
        }
        return out
      }
      collectedAt.value = keepOnly(collectedAt.value, collectionKeys)
      achievedAt.value = keepOnly(achievedAt.value, achievementKeys)
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
