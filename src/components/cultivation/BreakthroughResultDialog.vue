<template>
  <!-- 突破成功:全屏墨色冲击波 -->
  <Teleport to="body">
    <div v-if="view?.success" class="ink-wave" />
  </Teleport>
  <BaseModal :open="view !== null" :closable="false" aria-label="突破结果">
    <div v-if="view" class="text-center">
      <div class="relative mx-auto mt-2 h-20 w-20">
        <div v-if="view.success" class="ink-burst">
          <span v-for="i in 10" :key="i" />
        </div>
        <span v-if="view.success" class="burst-ring" />
        <div
          class="grid h-20 w-20 place-items-center rounded-full border-2 font-kai text-4xl animate-ink-pop"
          :class="
            view.success ? 'border-cinnabar text-cinnabar bg-cinnabar/5 animate-glow-pulse' : 'border-ink-faint text-ink-faint bg-ink/5'
          "
        >
          {{ view.success ? '破' : '滞' }}
        </div>
      </div>
      <p class="mt-3 font-kai text-lg tracking-[0.3em] text-ink">
        {{ view.success ? '突破成功' : '突破失败' }}
      </p>
      <p class="mt-1 text-[13px] text-ink-soft">
        {{ view.fromLabel }}
        <span class="mx-1 text-ink-faint">→</span>
        <span :class="view.success ? 'text-cinnabar font-kai' : 'text-ink-faint'">{{ view.toLabel }}</span>
      </p>
      <!--
        天劫波次:每道雷落定后的余血落成一根柱,柱高以本场最高者为满格。
        原先这里只有一串同形灰字,二十道雷就是二十行,哪道最险得自己逐行比。
        柱与下面的字同源(都取自战报原文,见 ui/tribWave.ts)。
      -->
      <div
        v-if="waves.length"
        class="trib-waves mt-3 flex items-end gap-1 rounded-md bg-ink/4 px-3 py-2"
        :aria-label="`天劫共 ${waves.length} 道`"
        role="img"
      >
        <span
          v-for="w in waves"
          :key="w.index"
          class="trib-wave"
          :class="{ 'trib-wave--danger': w.hpPct > 0 && w.hpPct < TRIB_DANGER_PCT, 'trib-wave--fallen': w.hpPct === 0 }"
          :style="{ height: `${barPct(w)}%` }"
          :title="`第 ${w.index} 道 · 余血 ${Math.round(w.hpPct * 100)}%`"
        />
      </div>
      <p v-if="worst" class="mt-1 text-[10px] text-ink-faint tabular">
        共 {{ waves.length }} 道 · 最险一道余血 {{ Math.round(worst.hpPct * 100) }}%
      </p>
      <div v-if="view.tribulationLog.length" class="mt-3 max-h-40 overflow-y-auto rounded-md bg-ink/4 px-3 py-2 text-left">
        <p v-for="(line, i) in view.tribulationLog" :key="i" class="py-0.5 text-[12px] leading-relaxed text-ink-soft">
          {{ line }}
        </p>
      </div>
      <p v-if="view.message" class="mt-3 text-[12px] leading-relaxed text-ink-faint">{{ view.message }}</p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="close">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { tribBarPct, tribPeak, tribWaves, tribWorst, TRIB_DANGER_PCT, type TribWave } from '@/ui/tribWave'
  import BaseModal from '@/components/common/BaseModal.vue'

  const ui = useUiStore()

  const view = computed(() => ui.breakthrough)
  /** 逐道余血:从战报原文里认,不从别处推算 */
  const waves = computed(() => tribWaves(view.value?.tribulationLog ?? []))
  const peak = computed(() => tribPeak(waves.value))
  const worst = computed(() => tribWorst(waves.value))
  function barPct(w: TribWave): number {
    return tribBarPct(w, peak.value)
  }

  function close(): void {
    ui.breakthrough = null
  }
</script>
