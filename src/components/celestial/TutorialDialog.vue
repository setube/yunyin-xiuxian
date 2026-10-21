<template>
  <!-- Phase 30.9 S4:首次登真仙·终局导览 -->
  <BaseModal :open="open" title="登临真仙" :closable="false">
    <div class="space-y-2.5 text-[13px] leading-relaxed">
      <p class="font-kai text-ink">凡间所得,终有尽时。</p>
      <p class="text-ink-soft">
        玄铁、残页、灵石……到了此境,皆可献入
        <!-- 无 href 的 <a> 不在 Tab 序列里 —— 键盘用户走不到;它做的是按钮的事就写成按钮 -->
        <button
          type="button"
          class="-my-2 inline-block py-2 align-baseline text-azure underline underline-offset-2 active:opacity-60"
          @click="emit('close')"
        >
          天道熔炉
        </button>
        ,熔作道源。
      </p>
      <p class="text-ink-soft">
        道源,助你
        <b class="text-cinnabar">此世</b>
        问道——叩天界、立契约、踏试炼。
      </p>
      <p class="text-ink-soft">
        道源又可凝作道果,道果随神魂不灭,助你
        <b class="text-violet-ink">来世</b>
        更进一步。
      </p>
      <p class="mt-2 text-[11px] text-ink-faint">
        一句话:
        <!-- 标点跟着前一句走:单独成行会在窄屏上被折成孤零零一个句号 -->
        <span class="text-cinnabar">道源是此世拿来折腾的,</span>
        <span class="text-violet-ink">道果是几世以后仍受益的财富。</span>
      </p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/components/common/BaseModal.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>
