<template>
  <div>
    <!-- 场次导航:多场连战逐场看 -->
    <div v-if="rows.length > 1" class="mb-2 flex flex-wrap items-center gap-1">
      <button
        v-for="(fight, i) in rows"
        :key="i"
        class="rounded px-1.5 py-0.5 text-[10px] transition-colors"
        :class="
          i === current
            ? 'bg-cinnabar/85 text-paper'
            : fight.win
              ? 'border border-ink/20 text-ink-faint'
              : 'border border-cinnabar/40 text-cinnabar'
        "
        @click="select(i)"
      >
        {{ i + 1 }}
      </button>
    </div>

    <!-- 对阵与血条 -->
    <div v-if="row" class="card-ink px-3 py-2.5">
      <div class="flex items-center justify-between gap-2 text-[11px]">
        <span class="min-w-0 truncate font-kai text-ink">{{ playerName }}</span>
        <span class="shrink-0 text-[10px] text-ink-ghost">第 {{ current + 1 }} 战 · {{ row.rounds }} 回合</span>
        <span class="min-w-0 truncate text-right font-kai text-cinnabar">{{ row.foeName }}</span>
      </div>
      <div class="mt-1.5 flex items-center gap-2">
        <div class="track-ink h-1.5 flex-1">
          <div class="bar-fill h-full bg-jade" :style="{ width: `${Math.max(0, php * 100)}%` }" />
        </div>
        <div class="track-ink h-1.5 flex-1">
          <div class="bar-fill h-full bg-cinnabar" :style="{ width: `${Math.max(0, ehp * 100)}%` }" />
        </div>
      </div>
    </div>

    <!-- 战报 -->
    <div ref="logBox" class="mt-2 max-h-40 overflow-y-auto rounded-md border border-ink/10 bg-paper-deep/40 px-3 py-2">
      <p v-for="(entry, i) in displayed" :key="i" class="py-0.5 text-[11px] leading-relaxed" :class="KIND_COLOR[entry.t]">
        {{ entry.text }}
      </p>
      <p v-if="displayed.length === 0" class="py-2 text-center text-[11px] text-ink-ghost">此战无录</p>
    </div>

    <!-- 播放控制 -->
    <div class="mt-2 flex items-center justify-between gap-2">
      <span class="text-[10px] text-ink-ghost">{{ displayed.length }} / {{ logs.length }}</span>
      <div class="flex gap-1">
        <button v-if="!finished" class="btn-ghost !px-2.5 !py-1 !text-[11px]" @click="skip()">略过</button>
        <button v-else class="btn-ghost !px-2.5 !py-1 !text-[11px]" @click="replay()">重播</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
  import type { CombatLogEntry } from '@/types'
  import type { GauntletFightRow } from '@/core/gauntlet'
  import { COMBAT_PLAYBACK_BASE_MS, COMBAT_PLAYBACK_MIN_MS } from '@/data/constants'
  import { useSettingsStore } from '@/stores/settings'

  const props = defineProps<{
    rows: GauntletFightRow[]
    playerName: string
  }>()

  const settings = useSettingsStore()

  const current = ref(0)
  const displayed = ref<CombatLogEntry[]>([])
  const php = ref(1)
  const ehp = ref(1)
  const logBox = ref<HTMLElement | null>(null)
  let timer: number | undefined

  const row = computed(() => props.rows[current.value])
  const logs = computed(() => row.value?.logs ?? [])
  const finished = computed(() => displayed.value.length >= logs.value.length)

  const KIND_COLOR: Record<CombatLogEntry['t'], string> = {
    atk: 'text-ink-soft',
    skill: 'text-azure',
    crit: 'text-cinnabar',
    shield: 'text-gold-ink',
    heal: 'text-jade',
    dodge: 'text-ink-faint',
    proc: 'text-violet-ink',
    info: 'text-ink-faint',
    win: 'text-jade font-kai',
    lose: 'text-cinnabar font-kai'
  }

  function stop(): void {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  /** 按日志里的血量快照推进血条(战报自带 php/ehp,不必重算战斗) */
  function applyEntry(entry: CombatLogEntry): void {
    if (typeof entry.php === 'number') php.value = entry.php
    if (typeof entry.ehp === 'number') ehp.value = entry.ehp
  }

  async function scrollToEnd(): Promise<void> {
    await nextTick()
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
  }

  function play(): void {
    stop()
    displayed.value = []
    php.value = 1
    ehp.value = 1
    const all = logs.value
    if (all.length === 0) return
    // 关动效时直接给结果,不逐条播
    if (settings.reduceMotion) {
      skip()
      return
    }
    let i = 0
    const interval = Math.max(COMBAT_PLAYBACK_MIN_MS, COMBAT_PLAYBACK_BASE_MS / settings.battleSpeed)
    timer = window.setInterval(() => {
      const entry = all[i]
      if (!entry) {
        stop()
        return
      }
      displayed.value = [...displayed.value, entry]
      applyEntry(entry)
      void scrollToEnd()
      i += 1
      if (i >= all.length) stop()
    }, interval)
  }

  function skip(): void {
    stop()
    displayed.value = [...logs.value]
    for (const entry of logs.value) applyEntry(entry)
    void scrollToEnd()
  }

  function replay(): void {
    play()
  }

  function select(i: number): void {
    current.value = i
    play()
  }

  // 换了一场(或换了一份战报)就从头播
  watch(
    () => props.rows,
    () => {
      current.value = 0
      play()
    },
    { immediate: true }
  )

  onUnmounted(stop)
</script>
