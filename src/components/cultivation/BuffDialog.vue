<template>
  <BaseModal :open="def !== undefined" :title="def?.name ?? ''" @close="close">
    <template v-if="def">
      <p class="flex items-center gap-2">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md" :class="isInjury ? 'bg-cinnabar/10 text-cinnabar' : 'bg-jade/10 text-jade'">
          <GameIcon :name="def.icon" :size="17" />
        </span>
        <span>
          <span class="block font-kai text-[14px] tracking-widest text-ink">{{ def.name }}</span>
          <span class="block text-[11px]" :class="isInjury ? 'text-cinnabar' : 'text-jade'">{{ kindText }}</span>
        </span>
      </p>

      <p class="mt-2.5 text-[12px] leading-relaxed text-ink-faint">{{ def.desc }}</p>

      <div class="ink-divider my-3" />

      <p class="mb-1.5 text-[11px] tracking-widest text-ink-ghost">效果</p>
      <div class="space-y-1">
        <p v-for="row in modRows" :key="row.key" class="flex justify-between text-[13px]">
          <span class="text-ink-soft">{{ row.label }}</span>
          <span class="tabular" :class="row.good ? 'text-jade' : 'text-cinnabar'">{{ row.text }}</span>
        </p>
      </div>

      <div class="ink-divider my-3" />

      <p class="flex justify-between text-[13px]">
        <span class="text-ink-soft">剩余</span>
        <!-- 剩余每秒在走:定宽(见 utils/format.formatCountdown),否则这一行的数字一直在跳 -->
        <span class="countdown-slot tabular">{{ formatCountdown(remainSec) }}</span>
      </p>
      <p v-if="stackCount > 1" class="mt-1 flex justify-between text-[13px]">
        <span class="text-ink-soft">已叠</span>
        <span class="tabular text-ink-faint">{{ stackCount }} 份</span>
      </p>
      <p class="mt-1 flex justify-between text-[13px]">
        <span class="text-ink-soft">全程</span>
        <!-- formatDuration 收秒;totalMs 是毫秒,转一下 -->
        <span class="tabular text-ink-faint">{{ formatDuration(totalMs / 1000) }}</span>
      </p>
      <ProgressBar class="mt-2" :value="remainRatio" :color="isInjury ? 'var(--color-cinnabar)' : 'var(--color-jade)'" :height="6" />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useNow } from '@/composables/useNow'
  import { buffDef } from '@/data/buffs'
  import { STAT_NAMES, statValueText } from '@/ui/statNames'
  import { formatCountdown, formatDuration } from '@/utils/format'
  import type { AnyStatKey } from '@/types'
  import BaseModal from '@/components/common/BaseModal.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const ui = useUiStore()
  const cultivation = useCultivationStore()
  const now = useNow()

  const def = computed(() => (ui.buffDetailId ? buffDef(ui.buffDetailId) : undefined))
  const isInjury = computed(() => def.value?.kind === 'injury')

  const KIND_TEXT: Record<string, string> = {
    pill: '丹药之效',
    blessing: '天赐之福',
    injury: '负面状态'
  }
  const kindText = computed(() => KIND_TEXT[def.value?.kind ?? ''] ?? '')

  /** 剩余秒数(随引擎实时递减) */
  /** 当前打开的这条 buff 实例(老档案可能没有 added,回退按单份计) */
  const inst = computed(() =>
    ui.buffDetailId ? cultivation.buffs.find(b => b.defId === ui.buffDetailId) ?? null : null
  )

  /** 剩余秒数(随引擎实时递减) */
  const remainSec = computed(() => {
    if (!inst.value) return 0
    return Math.max(0, (inst.value.endsAt - now.value) / 1000)
  })

  /**
   * 本条实例的累计时长(毫秒):有时长叠加(同一状态卒过多次)时它是
   * 叠起来的本命 total(added),兜底才是单份 durationSec —— 「全程」与
   * 进度条都按这份算,叠 2 份时不会看剩 40 分钟却显示全程 20 分钟。
   */
  const totalMs = computed(() => {
    const dur = def.value?.durationSec ?? 0
    if (dur <= 0) return 0
    return (inst.value?.added ?? dur * 1000)
  })

  /** 已叠份数(向上取整防 1.06 份这种只差几秒的误判;老档无 added → 恒 1) */
  const stackCount = computed(() => {
    const dur = def.value?.durationSec ?? 0
    if (dur <= 0) return 1
    return Math.max(1, Math.round(totalMs.value / 1000 / dur))
  })

  const remainRatio = computed(() => {
    const total = totalMs.value
    return total > 0 ? Math.min(1, remainSec.value * 1000 / total) : 0
  })

  /** Buff 词条全为比率;正向增益记绿,减益记朱 */
  const modRows = computed(() =>
    Object.entries(def.value?.mods ?? {}).map(([key, value]) => {
      const v = value as number
      return { key, label: STAT_NAMES[key as AnyStatKey] ?? key, text: statValueText(key, v), good: v > 0 }
    })
  )

  function close(): void {
    ui.buffDetailId = null
  }
</script>
