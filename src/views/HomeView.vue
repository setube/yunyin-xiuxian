<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!--
      首页是仪表盘,视觉上没有页面标题;其余八页都有 h1/h2。
      补一个视觉隐藏的 h1:读屏用户切回首页时有个可定位的页面名(与底栏同名「洞府」)。
    -->
    <h1 class="sr-only">洞府</h1>
    <!-- iOS 七天不打开会丢档:只在 iOS 且未安装时出现,「知道了」之后不再露(设置页另留常驻一份) -->
    <InstallToHomeNotice />

    <div class="card-ink relative overflow-hidden px-4 pb-4 pt-5">
      <div class="relative z-10 flex items-start justify-between">
        <div class="min-w-0 flex-1">
          <p class="text-[11px]" :class="player.lifespanRatio < LIFESPAN_WARN_RATIO ? 'text-cinnabar' : 'text-ink-faint'">
            {{ statusText }}
          </p>
          <div class="mt-3 flex items-center gap-1.5">
            <!-- 图标随天时走(见 core/weather 的 icon):十四种天时各有其形,不再共用一枚 -->
            <GameIcon :name="weather.icon" :size="13" class="shrink-0 text-gold-ink" />
            <span class="font-kai text-[12px] tracking-widest text-ink">{{ weather.name }}</span>
          </div>
          <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ weather.desc }}</p>
          <!-- 风味句不报数:加减从天时定义现算 -->
          <p class="mt-0.5 text-[10px] leading-relaxed text-ink-soft tabular">{{ weatherLine }}</p>
        </div>
        <!-- 380px 以下改用 108px 法球,给左侧文本让出地方 -->
        <div class="relative mr-1 -mt-1 h-35 w-35 shrink-0 max-[380px]:h-[108px] max-[380px]:w-[108px]">
          <CultivationOrb :active="true" :full="player.expFull" :progress="player.expProgress" :size="orbSize">
            <span class="text-[17px] max-[380px]:text-[13px]">☯</span>
          </CultivationOrb>
        </div>
      </div>
    </div>

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

    <!-- 入口宫格:三列,内容顶对齐;不到 320px(200% 缩放)改两列,图标放得下 -->
    <div class="stagger-in grid grid-cols-2 gap-2.5 min-[320px]:grid-cols-3">
      <RouterLink v-if="firstStep" :to="firstStep.to" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/10 text-cinnabar"><GameIcon name="footprints" :size="18" /></span>
        <span class="font-kai text-[13px] tracking-widest text-ink">第一步</span>
        <span class="text-[10px] leading-tight text-cinnabar">{{ firstStep.label }}</span>
      </RouterLink>

      <RouterLink v-if="player.major >= WORLD_BREAK_MAJOR" to="/celestial" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98">
        <span class="seal-face grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar font-kai text-[17px] animate-breathe">天</span>
        <span class="font-kai text-[13px] tracking-widest text-ink">天界</span>
        <span class="text-[9px] leading-snug" :class="dailyTrialLeft ? 'text-cinnabar' : 'text-jade'">
          {{ dailyTrialLeft ? '今日天道未应' : '今日天道已应' }}
        </span>
      </RouterLink>

      <RouterLink to="/world" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-azure/15 text-azure"><GameIcon name="cloud" :size="18" /></span>
        <span class="font-kai text-[13px] tracking-widest text-ink">本世之界</span>
        <!-- 320 窄屏下这句会被截成半句;补 title 让整句仍可读,空态词很短不会截断 -->
        <span class="w-full truncate text-[9px] leading-tight text-ink-faint" :title="worldBrief">{{ worldBrief }}</span>
      </RouterLink>

      <RouterLink to="/market" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold-ink/10 text-gold-ink"><GameIcon name="store" :size="18" /></span>
        <span class="font-kai text-[13px] tracking-widest text-ink">坊市</span>
        <!--
          刷新倒计时:与坊市页同一条口径(marketRemainingSec),墙钟驱动。
          未同步过(stockedAt 为 0)时不报 —— 那时 remainingSec 也是 0,
          会显示成「刷新中」,而其实只是这一格还没读过货架。
        -->
        <span v-if="marketLeft !== null" class="text-[9px] leading-snug tabular" :class="marketLeft <= 0 ? 'text-cinnabar' : 'text-ink-faint'">
          {{ marketLeft <= 0 ? '刷新中' : formatCountdown(marketLeft) }}
        </span>
      </RouterLink>

      <RouterLink to="/apprentice" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-jade/15 text-jade"><GameIcon name="users" :size="18" /></span>
        <span class="font-kai text-[13px] tracking-widest text-ink">道童</span>
        <span class="text-[9px] leading-snug" :class="apprIdle > 0 ? 'text-amber-ink' : 'text-ink-faint'">
          {{ apprTotal > 0 ? (apprIdle > 0 ? `闲置 ${apprIdle}` : '在工') : '无道童' }}
        </span>
      </RouterLink>

      <button type="button" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98" aria-haspopup="dialog" @click="questsOpen = true">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-ink/10 text-amber-ink"><GameIcon name="book" :size="18" /></span>
        <span class="font-kai text-[13px] tracking-widest text-ink">修行志</span>
        <!--
          六个入口里只有两个带副信息,这一格空着而它恰恰有可数的状态:
          今日几项日课还没做。打开弹窗才看得到,不如摆在格上。
        -->
        <span class="text-[9px] leading-snug tabular" :class="dailyLeft > 0 ? 'text-amber-ink' : 'text-jade'">
          {{ dailyLeft > 0 ? `日课余 ${dailyLeft}` : '日课已尽' }}
        </span>
      </button>

      <RouterLink to="/dongfu" class="card-ink flex flex-col items-center gap-1.5 px-1.5 py-3 text-center active:scale-98">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-violet-ink/10 text-violet-ink"><GameIcon name="home" :size="18" /></span>
        <span class="font-kai text-[13px] tracking-widest text-ink">洞府营造</span>
        <span class="flex flex-col items-center text-[9px] leading-snug tabular">
          <span class="text-gold-ink">离线 {{ offlineHrs }} 时</span>
          <span class="text-ink-faint">已启 {{ builtCount }}/{{ BUILDINGS.length }}</span>
        </span>
      </RouterLink>
    </div>

    <!-- 日课按本地午夜重置,未成即作罢 -->
    <BaseModal :open="questsOpen" title="修行志" @close="questsOpen = false">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[10px] text-ink-faint">距重置</span>
        <span class="countdown-slot text-[11px] text-amber-ink tabular">{{ tilRollover }}</span>
      </div>
      <template v-if="mainQuest">
        <p class="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span class="font-kai text-[13px] tracking-wider text-ink">{{ mainQuest.name }}</span>
          <!-- 这一簇须允许换行,不用 `shrink-0`:200% 缩放下会顶出右缘(layout-check 越界) -->
          <span class="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
            <span
              v-if="mainProgress"
              class="tabular text-[10px]"
              :class="mainProgress.done ? 'text-jade' : 'text-azure'"
              >{{ mainProgress.text }}</span
            >
            <span class="text-[10px] text-ink-faint">主线 {{ quests.mainIdx + 1 }}/{{ MAIN_QUESTS.length }}</span>
            <RouterLink
              v-if="mainNav"
              :to="mainNav"
              class="-my-1 -mr-1 p-2 text-[13px] leading-none text-ink-faint active:text-azure"
              :aria-label="`去办:${mainQuest.name}`"
              @click="questsOpen = false"
              >›</RouterLink
            >
          </span>
        </p>
        <p class="mt-0.5 text-[11px] text-ink-faint">{{ mainQuest.desc }}</p>
        <p v-if="rewardPreview(mainQuest.reward)" class="mt-0.5 text-[10px] tabular text-azure">
          {{ rewardPreview(mainQuest.reward) }}
        </p>
      </template>
      <p v-else class="text-[12px] text-ink-faint">主线已尽</p>
      <div class="ink-divider my-2.5" />
      <div class="space-y-1.5">
        <!-- 放不下时进度簇折到下一行:弹窗正文窄(200% 缩放约 113px),并排会把「1 枚」拆开 -->
        <div v-for="t in dailyRows" :key="t.id" class="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5 text-[12px]">
          <span class="min-w-0">
            <span :class="t.done ? 'text-ink-faint line-through' : 'text-ink-soft'">{{ t.desc }}</span>
            <span v-if="!t.done && rewardPreview(t.reward)" class="mt-0.5 block text-[10px] tabular text-azure">
              {{ rewardPreview(t.reward) }}
            </span>
          </span>
          <span class="ml-auto flex shrink-0 items-center gap-0.5">
            <span class="tabular text-[11px]" :class="t.done ? 'text-jade' : 'text-ink-faint'">
              {{ t.done ? '已成' : `${t.progress}/${t.target}` }}
            </span>
            <RouterLink
              v-if="!t.done && t.nav"
              :to="t.nav"
              class="-my-1 -mr-1 p-2 text-[13px] leading-none self-center text-ink-faint active:text-azure"
              :aria-label="`去办:${t.desc}`"
              @click="questsOpen = false"
              >›</RouterLink
            >
          </span>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onUnmounted, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useDongfuStore } from '@/stores/dongfu'
  import { useAdventureStore } from '@/stores/adventure'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useEndgameStore } from '@/stores/endgame'
  import { useMarketStore } from '@/stores/market'
  import { useApprenticeStore } from '@/stores/apprentice'
  import { marketRemainingSec } from '@/core/marketService'
  import { localDayNum } from '@/utils/time'
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
  import { useWallNow } from '@/composables/useWallClock'
  import { secsUntilNextMidnight } from '@/utils/time'
  import { formatCountdown } from '@/utils/format'
  import { weatherEffectText } from '@/ui/weatherText'
  import { generateCurrentGoal, type Goal } from '@/core/goal'
  import { currentMainQuestProgress } from '@/core/questProgress'
  import { currentFirstStep } from '@/core/firstStep'
  import GameIcon from '@/components/common/GameIcon.vue'
  import CultivationOrb from '@/components/common/CultivationOrb.vue'
  import InstallToHomeNotice from '@/components/common/InstallToHomeNotice.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const player = usePlayerStore()
  const dongfu = useDongfuStore()
  const adventure = useAdventureStore()
  const cultivation = useCultivationStore()
  const endgame = useEndgameStore()
  const market = useMarketStore()
  const apprentice = useApprenticeStore()
  const quests = useQuestsStore()

  // 法球尺寸须与模板容器 max-[380px] 断点一致(以下 108px)。
  // 须监听 change:横竖屏切换、窗口拖拽会改 matchMedia 结果,容器已缩、法球仍是 140px 会溢出
  const narrower = ref(false)
  const orbSize = computed<number>(() => (narrower.value ? 108 : 140))
  // 直接平铺,不用 {} 作用域块(script setup 里会被编译器提升重排)
  const orbMq = window.matchMedia('(max-width: 380px)')
  narrower.value = orbMq.matches
  const onOrbMqChange = (e: MediaQueryListEvent): void => {
    narrower.value = e.matches
  }
  orbMq.addEventListener('change', onOrbMqChange)
  onUnmounted(() => orbMq.removeEventListener('change', onOrbMqChange))

  /** 洞府入口实况:离线可攒小时 + 已启座数,与洞府页纪要 / 营造标题同源现算 */
  const offlineHrs = computed(() => dongfu.offlineCapHours)
  const builtCount = computed(() => BUILDINGS.filter(b => (dongfu.levels[b.id] ?? 0) > 0).length)

  /** 本世之界入口的一句话:与历练页同一条 worldView;未凝成时与本世之界页空态同词 */
  const worldBrief = computed(() => {
    const w = adventure.mortalWorld
    if (!w) return '此世未成'
    return worldView(w, id => id).title
  })

  // 修行目标:只给方向,不替玩家做决定
  const currentGoal = computed<Goal | null>(() => generateCurrentGoal(player))
  /** 新手第一步:只在开局这一段有,完全由存档推出,没有「已看过」字段 */
  const firstStep = computed(() => currentFirstStep())

  const statusText = computed(() =>
    homeStatusText({
      dead: player.dead,
      exploringSecret: player.secretRealm !== null,
      expedition: endgame.worldRun !== null,
      adventuring: adventure.sessionActive,
      regionName: adventure.currentRegion?.name ?? '',
      injured: cultivation.hasBuff('injury'),
      retreating: isRetreating(),
      expFull: player.expFull
    })
  )

  // 今日天时:确定性,每游戏日刷新,影响当日产出与渡劫
  const weather = computed(() => todayWeather())
  const weatherLine = computed(() => weatherEffectText(weather.value))

  const questsOpen = ref(false)
  const mainQuest = computed(() => MAIN_QUESTS[quests.mainIdx])
  /** 主线的「去办」落点:拿得准才给箭头(判据见 questNav) */
  const mainNav = computed(() => (mainQuest.value ? mainQuestNav(mainQuest.value.cond) : null))
  /** 主线进度读数,与发赏判定同源 */
  const mainProgress = computed(() => currentMainQuestProgress())

  const dailyRows = computed(() =>
    DAILY_TASKS.map(t => ({
      ...t,
      progress: Math.min(t.target, quests.dailyDelta(t.counterKey)),
      done: quests.daily.done.includes(t.id),
      nav: dailyTaskNav(t.counterKey)
    }))
  )

  /** 今日未成的日课数:与弹窗里的 dailyRows 同一份数据,不另算一遍 */
  const dailyLeft = computed(() => dailyRows.value.filter(t => !t.done).length)

  // 距重置倒计时属墙钟域:暂停时也须照常走向真实重置时刻
  const now = useWallNow()

  /**
   * 三个入口格的实况。六个格里原先只有两个带副信息,
   * 而这三格各自都有可数的状态 —— 打开对应页面才看得到。
   */
  /** 今日天道是否已应:判据与 endgame store 的闸门同一份(完成日 vs 今日日号) */
  /*
   * 今日天道这一格按墙钟日判,故须读 now.value —— 与同文件的 marketLeft / tilRollover 一样。
   * 写成 Date.now() 时 computed 没有响应式依赖:玩家开着首页跨过午夜,
   * 上面那行「距换日 N」会归零重计,这一格却还停在昨天的「已应」。
   */
  const dailyTrialLeft = computed(() => endgame.dailyDoneDay !== localDayNum(now.value))
  /**
   * 坊市还有多久换新:与坊市页同一条口径。
   * 货架还没同步过(stockedAt 为 0)时给 null —— 那时 remainingSec 也是 0,
   * 直接渲染会写成「刷新中」,与真实状态不符。
   */
  const marketLeft = computed<number | null>(() =>
    market.stockedAt > 0 ? marketRemainingSec(market.stockedAt, now.value) : null
  )
  /** 道童:几个闲着、共几个 */
  const apprTotal = computed(() => apprentice.apprentices.length)
  const apprIdle = computed(() => apprentice.apprentices.filter(a => !a.task).length)

  const tilRollover = computed(() => formatCountdown(secsUntilNextMidnight(now.value)))
</script>
