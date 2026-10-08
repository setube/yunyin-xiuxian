<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!--
      iOS 上「加进主屏幕」这件事得主动说一次:不说,玩家不会知道七天不打开就会丢档。
      只在 iOS 且未安装时出现,「知道了」之后永不再露(设置页里还留着一份常驻的,随时可查)。
    -->
    <InstallToHomeNotice />

    <!-- 人物水墨主视觉 -->
    <div class="card-ink relative overflow-hidden px-4 pb-4 pt-5">
      <!-- 远山 -->
      <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full fill-ink/8" viewBox="0 0 400 110" preserveAspectRatio="none">
        <path
          class="drift-far"
          d="M0 110 L60 40 Q80 20 100 45 L150 95 L200 30 Q215 12 235 38 L300 100 L340 55 Q355 38 372 60 L400 90 L400 110 Z"
          fill="currentColor"
        />
        <path
          class="drift-near"
          d="M0 110 L40 80 L110 105 L180 70 L260 108 L330 80 L400 105 L400 110 Z"
          fill="currentColor"
          opacity="0.6"
        />
      </svg>
      <div class="relative z-10 flex items-start justify-between">
        <div class="min-w-0 flex-1">
          <p class="text-[11px]" :class="player.lifespanRatio < LIFESPAN_WARN_RATIO ? 'text-cinnabar' : 'text-ink-faint'">
            {{ statusText }}
          </p>
          <!-- 今日天时:确定性环境,影响当日产出与渡劫 -->
          <div class="mt-3 flex items-center gap-1.5">
            <GameIcon name="sparkles" :size="13" class="shrink-0 text-gold-ink" />
            <span class="font-kai text-[12px] tracking-widest text-ink">{{ weather.name }}</span>
          </div>
          <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ weather.desc }}</p>
          <!-- 风味句不负责报数:加减从天时定义现算,避免「火属 / 雷属」这类并未生效的承诺 -->
          <p class="mt-0.5 text-[10px] leading-relaxed text-ink-soft tabular">{{ weatherLine }}</p>
        </div>
        <!--
          修炼法球 · 灵气法阵环绕。
          窄屏并排时 140px 的法球会占到主卡大半宽,把左侧的天气/风味句压成极窄高列;
          380px 以下改用 108px 法球(内部粒子/八卦环随 size 比例缩放,不是简单 blur),
          给左侧文本让出地方。
        -->
        <div class="relative mr-1 -mt-1 h-35 w-35 shrink-0 max-[380px]:h-[108px] max-[380px]:w-[108px]">
          <CultivationOrb :active="true" :full="player.expFull" :progress="player.expProgress" :size="orbSize">
            <span class="text-[17px] max-[380px]:text-[13px]">☯</span>
          </CultivationOrb>
        </div>
      </div>
    </div>

    <!-- Phase 29 修行目标:只给方向,不替玩家做决定(goal.ts 此前零展示,接线摆上主页) -->
    <div v-if="currentGoal" class="card-ink flex items-center gap-3 px-4 py-3">
      <GameIcon name="scroll" :size="14" class="shrink-0 text-jade" />
      <div class="min-w-0 flex-1">
        <p class="flex items-baseline justify-between gap-2">
          <span class="font-kai text-[13px] tracking-wider text-ink">{{ currentGoal.text }}</span>
          <span v-if="currentGoal.progress !== undefined" class="shrink-0 text-[10px] text-ink-faint tabular">
            进度 {{ Math.round(currentGoal.progress * 100) }}%
          </span>
        </p>
        <p v-if="currentGoal.hint" class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ currentGoal.hint }}</p>
      </div>
    </div>

    <!-- 天界入口(真仙) -->
    <RouterLink
      v-if="player.major >= WORLD_BREAK_MAJOR"
      to="/celestial"
      class="card-ink flex items-center gap-3 border-cinnabar/40 px-4 py-3 active:scale-98"
    >
      <span class="grid h-9 w-9 place-items-center rounded-md bg-cinnabar/90 font-kai text-[17px] text-paper animate-breathe">天</span>
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">天界已开</span>
        <span class="block text-[10px] text-ink-faint">道途 · 特殊世界 · 天道熔炉 · 试炼 · 道痕</span>
      </span>
      <span class="text-[11px] text-cinnabar">踏天 →</span>
    </RouterLink>

    <!-- 本世之界:这一世的「名」散落在历练深处,主页却只在洞府/天界处开了门 —— 舆图该在门面首层 -->
    <RouterLink to="/world" class="card-ink flex items-center gap-3 border-azure/30 px-4 py-3 active:scale-98">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-azure/15 text-azure">
        <GameIcon name="cloud" :size="18" />
      </span>
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-widest text-ink">本世之界</span>
        <span class="block truncate text-[10px] leading-relaxed text-ink-faint">{{ worldBrief }}</span>
      </span>
      <span class="shrink-0 text-[11px] text-azure">观 象 →</span>
    </RouterLink>

    <!-- 坊市:灵石换机缘的地界,洞府门面给一个常驻入口 -->
    <RouterLink to="/market" class="card-ink flex items-center gap-3 border-gold-ink/30 px-4 py-3 active:scale-98">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold-ink/10 text-gold-ink">
        <GameIcon name="store" :size="18" />
      </span>
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-widest text-ink">坊市</span>
        <span class="block truncate text-[10px] text-ink-faint">灵石换丹药 · 续料 · 淘一件趁手兵刃</span>
      </span>
      <span class="shrink-0 text-[11px] text-gold-ink">购置 →</span>
    </RouterLink>

    <!-- 收徒:弟子跑腿,后台自长 —— 洞府门面第二个常驻入口 -->
    <RouterLink to="/apprentice" class="card-ink flex items-center gap-3 border-jade/30 px-4 py-3 active:scale-98">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-jade/15 text-jade">
        <GameIcon name="users" :size="18" />
      </span>
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-widest text-ink">收徒</span>
        <span class="block truncate text-[10px] text-ink-faint">遣弟子采药 · 历练 · 寻机缘,归来带回资材</span>
      </span>
      <span class="shrink-0 text-[11px] text-jade">遣派 →</span>
    </RouterLink>

    <!-- 修行志(任务);日课按本地午夜重排,未成即作罢 —— 规则得摆在台面上,不然玩家会以为昨天差一步的日课还欠着 -->
    <section>
      <SectionTitle title="修行志" hint="午夜更替 · 未成作罢" />
      <div class="card-ink mt-2 px-4 py-3">
        <!-- 更替时刻摆成活数:不只说「未成作罢」的规矩,还报还剩几时 —— 与 SectionTitle 的 hint 同面日历 -->
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[9px] text-ink-faint">距午夜更替</span>
          <span class="countdown-slot text-[10px] text-amber-ink tabular">{{ tilRollover }}</span>
        </div>
        <template v-if="mainQuest">
          <p class="flex items-center justify-between">
            <span class="font-kai text-[13px] tracking-wider text-ink">{{ mainQuest.name }}</span>
            <span class="flex shrink-0 items-center gap-1.5">
              <span v-if="mainProgress" class="tabular text-[10px] text-azure">{{ mainProgress }}</span>
              <span class="text-[10px] text-ink-faint">主线 {{ quests.mainIdx + 1 }}/{{ MAIN_QUESTS.length }}</span>
              <!-- 拿得准去哪办,就给一枚走往的箭头;拿不准的不摆,免得摆着指错路 -->
              <RouterLink
                v-if="mainNav"
                :to="mainNav"
                class="-my-1 -mr-1 p-2 text-[13px] leading-none text-ink-faint active:text-azure"
                :aria-label="`去办:${mainQuest.name}`"
                >›</RouterLink
              >
            </span>
          </p>
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ mainQuest.desc }}</p>
          <p v-if="rewardPreview(mainQuest.reward)" class="mt-0.5 text-[10px] tabular text-azure">
            达成即得 {{ rewardPreview(mainQuest.reward) }}
          </p>
        </template>
        <p v-else class="text-[12px] text-ink-faint">主线已尽,前路由你自己书写。</p>
        <div class="ink-divider my-2.5" />
        <div class="space-y-1.5">
          <div v-for="t in dailyRows" :key="t.id" class="flex items-start justify-between gap-2 text-[12px]">
            <span class="min-w-0">
              <span :class="t.done ? 'text-ink-faint line-through' : 'text-ink-soft'">{{ t.desc }}</span>
              <span v-if="!t.done && rewardPreview(t.reward)" class="mt-0.5 block text-[10px] tabular text-azure">
                {{ rewardPreview(t.reward) }}
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-0.5">
              <span class="tabular text-[11px]" :class="t.done ? 'text-jade' : 'text-ink-faint'">
                {{ t.done ? '已成' : `${t.progress}/${t.target}` }}
              </span>
              <RouterLink
                v-if="!t.done && t.nav"
                :to="t.nav"
                class="-my-1 -mr-1 p-2 text-[13px] leading-none self-center text-ink-faint active:text-azure"
                :aria-label="`去办:${t.desc}`"
                >›</RouterLink
              >
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 洞府入口(灵脉已统合进洞府页,入口副题带上一句免得找不到);右侧带实况:离线可攒 + 已营座数 -->
    <RouterLink to="/dongfu" class="card-ink flex items-center justify-between gap-3 px-4 py-3 active:scale-98">
      <span class="min-w-0 flex-1">
        <span class="block font-kai text-[14px] tracking-widest text-ink">洞府营造</span>
        <span class="block truncate text-[10px] leading-relaxed text-ink-faint">灵脉 · 经营家业,道途更稳</span>
      </span>
      <span class="flex shrink-0 flex-col items-end gap-0.5 text-[10px]">
        <span class="tabular text-gold-ink">离线 {{ offlineHrs }} 时</span>
        <span class="tabular text-ink-faint">已营 {{ builtCount }}/{{ BUILDINGS.length }}</span>
      </span>
      <span class="shrink-0 text-[12px] text-ink-faint">›</span>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useDongfuStore } from '@/stores/dongfu'
  import { useAdventureStore } from '@/stores/adventure'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useQuestsStore } from '@/stores/quests'
  import { BUILDINGS } from '@/data/buildings'
  import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
  import { LIFESPAN_WARN_RATIO } from '@/data/constants'
  import { WORLD_BREAK_MAJOR } from '@/data/realms'
  import { todayWeather } from '@/core/weather'
  import { worldView } from '@/core/mortalWorldService'
  import { isRetreating } from '@/core/earlyGameService'
  import { homeStatusText } from '@/ui/homeStatus'
  import { rewardPreview } from '@/core/progress'
  import { mainQuestNav, dailyTaskNav } from '@/ui/questNav'
  import { useNow } from '@/composables/useNow'
  import { secsUntilNextMidnight } from '@/utils/time'
  import { formatCountdown } from '@/utils/format'
  import { weatherEffectText } from '@/ui/weatherText'
  import { generateCurrentGoal, type Goal } from '@/core/goal'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import CultivationOrb from '@/components/common/CultivationOrb.vue'
  import InstallToHomeNotice from '@/components/common/InstallToHomeNotice.vue'

  const player = usePlayerStore()
  const dongfu = useDongfuStore()
  const adventure = useAdventureStore()
  const cultivation = useCultivationStore()
  const quests = useQuestsStore()

  // 法球尺寸:380px 以下卡片内宽骤减,法球随断点同步缩到 108px(与模板容器 max-[380px] 一致)。
  // 不能只算一次:横竖屏切换、窗口拖拽都会改 matchMedia 结果,故监听 change 让 orbSize 跟着变,
  // 否则容器(纯 CSS 断点)已缩、法球(JS size)仍是 140px,两者脱节会溢出。
  const narrower = ref(false)
  const orbSize = computed<number>(() => (narrower.value ? 108 : 140))
  // 直接平铺、不用 {} 作用域块 —— 该块内容在 script setup 里会被编译器提升重排,花括号反而碍事
  const orbMq = window.matchMedia('(max-width: 380px)')
  narrower.value = orbMq.matches
  orbMq.addEventListener('change', e => {
    narrower.value = e.matches
  })

  /** 洞府入口右侧实况:离线可攒小时 + 已营座数(与洞府页纪要同源现算) */
  const offlineHrs = computed(() => dongfu.offlineCapHours)
  const builtCount = computed(() => BUILDINGS.filter(b => (dongfu.levels[b.id] ?? 0) > 0).length)

  /** 本世之界入口的一句话 —— 与历练页同一条 worldView,只是标题 */
  const worldBrief = computed(() => {
    const w = adventure.mortalWorld
    if (!w) return '此世气象未明,一观便知'
    return worldView(w, id => id).title
  })

  // Phase 29 修行目标:只给方向,不替玩家做决定(goal.ts 此前零展示,接线摆上主页)
  const currentGoal = computed<Goal | null>(() => generateCurrentGoal(player))

  const statusText = computed(() =>
    homeStatusText({
      dead: player.dead,
      adventuring: adventure.sessionActive,
      regionName: adventure.currentRegion?.name ?? '',
      injured: cultivation.hasBuff('injury'),
      retreating: isRetreating(),
      expFull: player.expFull
    })
  )

  // Phase 31 A1:今日天时(确定性,refreshed 每游戏日)
  const weather = computed(() => todayWeather())
  const weatherLine = computed(() => weatherEffectText(weather.value))

  const mainQuest = computed(() => MAIN_QUESTS[quests.mainIdx])
  /** 主线的「去办」落点:拿得准才给箭头(判据见 questNav) */
  const mainNav = computed(() => (mainQuest.value ? mainQuestNav(mainQuest.value.cond) : null))
  /** 计数型主线的当刻进度:里程碑(境界/custom)不给数字,别拿它当计数器 */
  const mainProgress = computed(() => {
    const c = mainQuest.value?.cond
    if (c?.type !== 'counter') return null
    const cur = Math.min(c.value, quests.counter(c.key))
    return `${cur}/${c.value}`
  })

  const dailyRows = computed(() =>
    DAILY_TASKS.map(t => ({
      ...t,
      progress: Math.min(t.target, quests.dailyDelta(t.counterKey)),
      done: quests.daily.done.includes(t.id),
      nav: dailyTaskNav(t.counterKey)
    }))
  )

  /** 距午夜更替的活倒计时 —— 日课「未成即作罢」还剩几时,同屏数得出来 */
  const now = useNow()
  const tilRollover = computed(() => formatCountdown(secsUntilNextMidnight(now.value)))
</script>
