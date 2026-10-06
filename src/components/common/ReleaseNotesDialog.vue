<template>
  <BaseModal :open="open" title="版本与更新" @close="$emit('close')">
    <div class="space-y-4 text-[12px] leading-relaxed">
      <p class="text-ink-faint">天道热更,皆有所记;凡破壁而来者,借此一观来路与去程。</p>

      <article v-for="note in RELEASE_NOTES" :key="note.version" class="card-ink px-3 py-3">
        <!-- 版本题名 -->
        <header class="flex items-center justify-between gap-2">
          <span class="font-kai text-[15px] tracking-[0.08em] text-ink">{{ note.title }}</span>
          <span class="shrink-0 rounded bg-cinnabar/10 px-1.5 py-0.5 text-[10px] text-cinnabar tabular">v{{ note.version }}</span>
        </header>
        <p class="mt-1 text-[10px] text-ink-faint tabular">{{ note.date }}</p>

        <!-- 开篇散文:保留空行节奏 -->
        <div class="mt-2 space-y-2">
          <p v-for="(line, i) in note.intro" :key="i" class="text-ink-soft">{{ line }}</p>
        </div>

        <!-- 实改点:一、二、三…逐条点账 -->
        <ul class="mt-3 space-y-2 border-t border-ink/7 pt-3">
          <li v-for="(c, i) in note.changes" :key="i" class="flex items-start gap-1.5">
            <span class="shrink-0 font-kai text-ink">·</span>
            <span class="min-w-0 text-ink-soft">{{ c }}</span>
          </li>
        </ul>

        <!-- 收尾与落款 -->
        <div v-if="note.closing?.length" class="mt-3 space-y-2 border-t border-ink/7 pt-3">
          <p v-for="(line, i) in note.closing" :key="i" class="text-ink-soft">{{ line }}</p>
        </div>
        <p v-if="note.sign" class="mt-3 pt-2 text-right font-kai text-[12px] tracking-widest text-ink-faint">
          {{ note.sign }}
        </p>
      </article>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="$emit('close')">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseModal from './BaseModal.vue'
  import { RELEASE_NOTES } from '@/ui/releaseNotes'

  defineProps<{
    open: boolean
  }>()

  defineEmits<{
    close: []
  }>()
</script>
