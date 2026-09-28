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
      <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full text-ink/8" viewBox="0 0 400 110" preserveAspectRatio="none">
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
            {{ Math.round(currentGoal.progress * 100) }}%
          </span>
        </p>
        <p v-if="currentGoal.hint" class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ currentGoal.hint }}</p>
      </div>
    </div>

    <!-- 天界入口(真仙) -->
    <RouterLink
      v-if="player.major >= WORLD_BREAK_MAJOR"
      to="/celestial"
      class="card-ink flex items-center gap-3 border-cinnabar/40 px-4 py-3 active:scale-99"
    >
      <span class="grid h-9 w-9 place-items-center rounded-md bg-cinnabar/90 font-kai text-[17px] text-paper animate-breathe">天</span>
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">天界已开</span>
        <span class="block text-[10px] text-ink-faint">道途 · 特殊世界 · 天道熔炉 · 试炼 · 道痕</span>
      </span>
      <span class="text-[11px] text-cinnabar">踏天 →</span>
    </RouterLink>

    <!-- 修行志(任务) -->
    <section>
      <SectionTitle title="修行志" />
      <div class="card-ink mt-2 px-4 py-3">
        <template v-if="mainQuest">
          <p class="flex items-center justify-between">
            <span class="font-kai text-[13px] tracking-wider text-ink">{{ mainQuest.name }}</span>
            <span class="text-[10px] text-ink-faint">主线 {{ quests.mainIdx + 1 }}/{{ MAIN_QUESTS.length }}</span>
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
              <span :class="t.done ? 'text-ink-ghost line-through' : 'text-ink-soft'">{{ t.desc }}</span>
              <span v-if="!t.done && rewardPreview(t.reward)" class="mt-0.5 block text-[10px] tabular text-azure">
                {{ rewardPreview(t.reward) }}
              </span>
            </span>
            <span class="shrink-0 tabular text-[11px]" :class="t.done ? 'text-jade' : 'text-ink-faint'">
              {{ t.done ? '已成' : `${t.progress}/${t.target}` }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 洞府入口(灵脉已统合进洞府页,入口副题带上一句免得找不到);右侧带实况:离线可攒 + 已营座数 -->
    <RouterLink to="/dongfu" class="card-ink flex items-center justify-between gap-3 px-4 py-3 active:scale-99">
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
  import { isRetreating } from '@/core/earlyGameService'
  import { homeStatusText } from '@/ui/homeStatus'
  import { rewardPreview } from '@/core/progress'
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

  const dailyRows = computed(() =>
    DAILY_TASKS.map(t => ({
      ...t,
      progress: Math.min(t.target, quests.dailyDelta(t.counterKey)),
      done: quests.daily.done.includes(t.id)
    }))
  )
</script>
