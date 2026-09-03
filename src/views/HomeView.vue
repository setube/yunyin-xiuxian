<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
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
          <p class="text-[11px]" :class="player.lifespanRatio < 0.15 ? 'text-cinnabar' : 'text-ink-faint'">
            {{ statusText }}
          </p>
          <!-- 今日天时:确定性环境,影响当日产出与渡劫 -->
          <div class="mt-3 flex items-center gap-1.5">
            <GameIcon name="sparkles" :size="13" class="shrink-0 text-gold-ink" />
            <span class="font-kai text-[12px] tracking-widest text-ink">{{ weather.name }}</span>
          </div>
          <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ weather.desc }}</p>
        </div>
        <!-- 修炼法球 · 灵气法阵环绕 -->
        <div class="relative mr-1 -mt-1 h-35 w-35 shrink-0">
          <CultivationOrb :active="true" :full="player.expFull" :progress="player.expProgress">
            <span class="text-[17px]">☯</span>
          </CultivationOrb>
        </div>
      </div>
    </div>

    <!-- 天界入口(真仙) -->
    <RouterLink
      v-if="player.major >= 9"
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
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ mainQuest.desc }}(达成后自动领赏)</p>
        </template>
        <p v-else class="text-[12px] text-ink-faint">主线已尽,前路由你自己书写。</p>
        <div class="ink-divider my-2.5" />
        <div class="space-y-1.5">
          <p v-for="t in dailyRows" :key="t.id" class="flex items-center justify-between text-[12px]">
            <span :class="t.done ? 'text-ink-ghost line-through' : 'text-ink-soft'">{{ t.desc }}</span>
            <span class="tabular text-[11px]" :class="t.done ? 'text-jade' : 'text-ink-faint'">
              {{ t.done ? '已成' : `${t.progress}/${t.target}` }}
            </span>
          </p>
        </div>
      </div>
    </section>

    <!-- 洞府入口 -->
    <RouterLink to="/dongfu" class="card-ink flex items-center justify-between gap-3 px-4 py-3 active:scale-99">
      <span class="min-w-0 flex-1">
        <span class="block font-kai text-[14px] tracking-widest text-ink">洞府营造</span>
        <span class="block truncate text-[10px] leading-relaxed text-ink-faint">经营家业,道途更稳</span>
      </span>
      <span class="shrink-0 text-[12px] text-ink-faint">›</span>
    </RouterLink>

    <!-- 灵脉投资:金丹后开放,紧随洞府营造 -->
    <button
      v-if="player.major >= VEIN_UNLOCK_MAJOR"
      class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-99"
      @click="veinOpen = true"
    >
      <span class="min-w-0 flex-1">
        <span class="block font-kai text-[14px] tracking-widest text-ink">灵脉投资</span>
        <span class="block truncate text-[10px] leading-relaxed text-ink-faint">引地脉入洞府,择一主脉而修</span>
      </span>
      <span class="shrink-0 text-[12px] text-ink-faint">›</span>
    </button>

    <!-- 灵脉弹窗:组件自带标题卡,弹窗标题留空避免重复 -->
    <BaseModal :open="veinOpen" title="" wide @close="veinOpen = false">
      <VeinInvestCard />
      <template #footer>
        <button class="btn-seal w-full" @click="veinOpen = false">收 起</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useAdventureStore } from '@/stores/adventure'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useQuestsStore } from '@/stores/quests'
  import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
  import { VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { todayWeather } from '@/core/weather'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import VeinInvestCard from '@/components/dongfu/VeinInvestCard.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import CultivationOrb from '@/components/common/CultivationOrb.vue'

  const player = usePlayerStore()
  /** 灵脉投资弹窗 —— 卡片自洞府页移来,紧随洞府营造 */
  const veinOpen = ref(false)
  const adventure = useAdventureStore()
  const cultivation = useCultivationStore()
  const quests = useQuestsStore()

  const statusText = computed(() => {
    if (player.dead) return '陨落'
    if (adventure.sessionActive) return `历练中 · ${adventure.currentRegion?.name ?? ''}`
    if (cultivation.hasBuff('injury')) return '疗伤中'
    return '闭关修炼中'
  })

  // Phase 31 A1:今日天时(确定性,refreshed 每游戏日)
  const weather = computed(() => todayWeather())

  const mainQuest = computed(() => MAIN_QUESTS[quests.mainIdx])

  const dailyRows = computed(() =>
    DAILY_TASKS.map(t => ({
      ...t,
      progress: Math.min(t.target, quests.dailyDelta(t.counterKey)),
      done: quests.daily.done.includes(t.id)
    }))
  )
</script>
