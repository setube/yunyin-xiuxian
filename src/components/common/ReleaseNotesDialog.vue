<template>
  <BaseModal :open="open" title="版本与更新" @close="$emit('close')">
    <div class="space-y-4 text-[12px] leading-relaxed">
      <article v-for="note in RELEASE_NOTES" :key="note.version" class="card-ink px-3 py-3">
        <header class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            :aria-expanded="openVersions[note.version]"
            @click="toggleVersion(note.version)"
          >
            <span class="truncate font-kai text-[15px] tracking-[0.08em] text-ink">{{ note.title }}</span>
            <span class="flex shrink-0 items-center gap-1.5">
              <span class="shrink-0 rounded border border-cinnabar/40 bg-cinnabar/10 px-1.5 py-0.5 text-[10px] text-ink tabular">v{{ note.version }}</span>
              <span
                class="grid h-5 w-5 shrink-0 place-items-center transition-transform duration-200"
                :class="openVersions[note.version] ? 'rotate-180' : ''"
              >
                <GameIcon name="chevron-down" :size="14" class="text-ink-faint" />
              </span>
            </span>
          </button>
        </header>
        <p class="mt-1 text-[10px] text-ink-faint tabular">{{ note.date }}</p>

        <div v-show="openVersions[note.version]">
          <div class="mt-2 space-y-2">
            <p v-for="(line, i) in note.intro" :key="i" class="text-ink-soft">{{ line }}</p>
          </div>

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
        </div>
      </article>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="$emit('close')">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import BaseModal from './BaseModal.vue'
  import GameIcon from './GameIcon.vue'
  import { RELEASE_NOTES } from '@/ui/releaseNotes'

  defineProps<{
    open: boolean
  }>()

  defineEmits<{
    close: []
  }>()

  /** 细则展开态:默认只展开最近一版(RELEASE_NOTES 新在前) */
  const openVersions = ref<Record<string, boolean>>(
    Object.fromEntries(RELEASE_NOTES.map((n, i) => [n.version, i === 0]))
  )
  function toggleVersion(version: string): void {
    openVersions.value = { ...openVersions.value, [version]: !openVersions.value[version] }
  }
</script>
