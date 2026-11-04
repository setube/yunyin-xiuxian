<template>
  <!-- 首次登真仙·终局导览 -->
  <BaseModal :open="open" title="登临真仙" :closable="false">
    <div class="space-y-2.5 text-[13px] leading-relaxed">
      <p class="text-ink-soft">
        玄铁、残页、灵石等 →
        <!-- 须是 button:无 href 的 <a> 不在 Tab 序列里 -->
        <button
          type="button"
          class="-my-2 inline-block py-2 align-baseline text-azure underline underline-offset-2 active:opacity-60"
          @click="emit('close')"
        >
          天道熔炉
        </button>
        → 道源
      </p>
      <!--
        生命周期这一条与两扇说明弹窗同源(见 ui/resourceTone):
        「此世 / 跨世」这组对照原在这里另写一份,色也各写一个 —— 同一件事两套说法。
      -->
      <p v-for="row in LIFECYCLE_ROWS" :key="row.key" class="flex items-baseline gap-1.5 text-ink-soft">
        <span class="res-tone__seal shrink-0 font-kai" :class="`res-tone--${row.tone.tone}`" aria-hidden="true">{{ row.tone.seal }}</span>
        <span class="min-w-0">
          <b :class="`res-tone res-tone--${row.tone.tone}`">{{ row.tone.label }}</b>{{ row.text }}
        </span>
      </p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/components/common/BaseModal.vue'
import { resourceTone } from '@/ui/resourceTone'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

/** 两条生命周期的对照:说法与色都取 ui/resourceTone,不在这里另写一份 */
const LIFECYCLE_ROWS = [
  { key: 'source', tone: resourceTone('action'), text: '消耗 · 远征、立契、试炼' },
  { key: 'fruit', tone: resourceTone('permanent'), text: '保留 · 由道源凝成' }
] as const
</script>
