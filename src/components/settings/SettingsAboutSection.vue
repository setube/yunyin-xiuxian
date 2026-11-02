<template>
  <div class="card-ink divide-y divide-ink/6 px-4">
    <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="aboutOpen = true">
      <span class="text-[13px] text-ink-soft">关于我们</span>
      <span class="text-[11px] text-ink-faint">查看 →</span>
    </button>
    <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="openRelease">
      <span class="flex items-center gap-2 text-[13px] text-ink-soft">
        版本与更新
        <!-- role="img":裸 span 属 generic,不接 aria-label,读屏听不到「有新版本」 -->
        <span
          v-if="settings.hasUnseenRelease"
          role="img"
          class="rounded bg-cinnabar px-1 py-px text-[10px] leading-none seal-face"
          aria-label="有新版本"
        >新</span>
      </span>
      <span class="text-[11px] text-ink-faint">查看 →</span>
    </button>
    <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="privacyOpen = true">
      <span class="text-[13px] text-ink-soft">隐私政策</span>
      <span class="text-[11px] text-ink-faint">查看 →</span>
    </button>
    <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="progressionOpen = true">
      <span class="text-[13px] text-ink-soft">数值体系</span>
      <span class="text-[11px] text-ink-faint">查看 →</span>
    </button>
  </div>

  <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />
  <ReleaseNotesDialog :open="releaseOpen" @close="releaseOpen = false" />
  <PrivacyDialog :open="privacyOpen" @close="privacyOpen = false" />
  <ProgressionDialog :open="progressionOpen" @close="progressionOpen = false" />
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useSettingsStore } from '@/stores/settings'
  import AboutDialog from '@/components/common/AboutDialog.vue'
  import ReleaseNotesDialog from '@/components/common/ReleaseNotesDialog.vue'
  import PrivacyDialog from '@/components/common/PrivacyDialog.vue'
  import ProgressionDialog from '@/components/common/ProgressionDialog.vue'

  const settings = useSettingsStore()

  const aboutOpen = ref(false)
  const releaseOpen = ref(false)
  const privacyOpen = ref(false)
  const progressionOpen = ref(false)

  function openRelease(): void {
    settings.markReleaseSeen()
    releaseOpen.value = true
  }
</script>
