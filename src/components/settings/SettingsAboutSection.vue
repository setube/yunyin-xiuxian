<template>
  <!-- 关于:入口 + 四扇说明浮层 -->
  <div class="card-ink divide-y divide-ink/6 px-4">
    <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="aboutOpen = true">
      <span class="text-[13px] text-ink-soft">关于我们</span>
      <span class="text-[11px] text-ink-faint">查看 →</span>
    </button>
    <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="openRelease">
      <span class="flex items-center gap-2 text-[13px] text-ink-soft">
        版本与更新
        <span
          v-if="settings.hasUnseenRelease"
          class="rounded bg-cinnabar px-1 py-px text-[10px] leading-none text-paper"
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
  <!-- 数值体系(可解释性:各数值轴的复利倍率 / 净耗时 / 积余 / 命名出处) -->
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

  /** 打开发布说明即视为已阅:把「已看到的最新版」记下,新标记随之熄灭 */
  function openRelease(): void {
    settings.markReleaseSeen()
    releaseOpen.value = true
  }
</script>
