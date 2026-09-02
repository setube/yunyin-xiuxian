<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <SectionTitle title="设置" />

    <!-- 偏好 -->
    <div class="card-ink divide-y divide-ink/7 px-4">
      <div class="py-3">
        <label class="flex items-center justify-between">
          <span class="text-[13px] text-ink-soft">背景音乐</span>
          <input v-model="settings.musicOn" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <div v-if="settings.musicOn" class="mt-2 flex items-center gap-2">
          <span class="text-[10px] text-ink-ghost">轻</span>
          <input v-model.number="settings.musicVol" type="range" min="0" max="100" class="grow accent-cinnabar" />
          <span class="w-7 text-right text-[10px] tabular text-ink-faint">{{ settings.musicVol }}</span>
        </div>
      </div>
      <div class="py-3">
        <label class="flex items-center justify-between">
          <span class="text-[13px] text-ink-soft">音效</span>
          <input v-model="settings.sfxOn" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <div v-if="settings.sfxOn" class="mt-2 flex items-center gap-2">
          <span class="text-[10px] text-ink-ghost">轻</span>
          <input v-model.number="settings.sfxVol" type="range" min="0" max="100" class="grow accent-cinnabar" />
          <span class="w-7 text-right text-[10px] tabular text-ink-faint">{{ settings.sfxVol }}</span>
        </div>
      </div>
      <label class="flex items-center justify-between py-3">
        <span class="text-[13px] text-ink-soft">减少动效</span>
        <input v-model="settings.reduceMotion" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <div class="flex items-center justify-between py-3">
        <span class="text-[13px] text-ink-soft">夜间模式</span>
        <div class="flex gap-1">
          <button
            v-for="o in THEME_OPTIONS"
            :key="o.id"
            class="chip-ink"
            :class="settings.theme === o.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="settings.theme = o.id"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
      <div class="flex items-center justify-between py-3">
        <span class="text-[13px] text-ink-soft">战报速度</span>
        <div class="flex gap-1">
          <button
            v-for="s in [1, 2, 4] as const"
            :key="s"
            class="chip-ink"
            :class="settings.battleSpeed === s ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="settings.battleSpeed = s"
          >
            ×{{ s }}
          </button>
        </div>
      </div>
    </div>

    <!-- 存档 -->
    <SectionTitle title="存档" />
    <div class="card-ink space-y-2 px-4 py-3">
      <p class="text-[11px] text-ink-faint tabular">存档版本 v{{ SAVE_VERSION }} · 修行时长 {{ formatDuration(game.totalPlaySec) }}</p>
      <template v-if="!Capacitor.isNativePlatform()">
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-ghost text-[12px]!" @click="downloadSave()">导出存档</button>
          <button class="btn-ghost text-[12px]!" @click="triggerImport">导入存档</button>
          <input ref="fileInput" type="file" accept="application/json,.save" class="hidden" @change="onFilePicked" />
        </div>
      </template>
      <button class="btn-ghost w-full border-cinnabar/40! text-[12px]! text-cinnabar!" @click="openReset">
        散尽修为,重入轮回(清空存档)
      </button>
    </div>

    <!-- 关于 -->
    <SectionTitle title="关于" />
    <div class="card-ink divide-y divide-ink/7 px-4">
      <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="aboutOpen = true">
        <span class="text-[13px] text-ink-soft">关于我们</span>
        <span class="text-[11px] text-ink-faint">查看 →</span>
      </button>
      <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="privacyOpen = true">
        <span class="text-[13px] text-ink-soft">隐私政策</span>
        <span class="text-[11px] text-ink-faint">查看 →</span>
      </button>
    </div>

    <!-- 关于我们 -->
    <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />

    <!-- 隐私政策 -->
    <PrivacyDialog :open="privacyOpen" @close="privacyOpen = false" />

    <!-- 重置确认(弹窗期间引擎暂停) -->
    <BaseModal :open="resetConfirm" title="重置游戏" @close="closeReset">
      <p class="text-[13px] leading-relaxed text-ink-soft">
        此举将
        <span class="text-cinnabar">彻底抹去</span>
        本机的一切修行痕迹,包括转世收获,且无法恢复。
      </p>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="closeReset">再想想</button>
          <button class="btn-seal flex-1 bg-cinnabar-deep!" @click="confirmReset">道心已决</button>
        </div>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, onUnmounted } from 'vue'
  import { useSettingsStore } from '@/stores/settings'
  import { useGameStore } from '@/stores/game'
  import { useUiStore } from '@/stores/ui'
  import { engine } from '@/core/engine'
  import { downloadSave, importSaveText, resetGame, reloadGame, sealStorageWrites } from '@/core/save'
  import { formatDuration } from '@/utils/format'
  import { SAVE_VERSION } from '@/utils/storage'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import PrivacyDialog from '@/components/common/PrivacyDialog.vue'
  import AboutDialog from '@/components/common/AboutDialog.vue'
  import { Capacitor } from '@capacitor/core'

  const settings = useSettingsStore()
  const game = useGameStore()
  const ui = useUiStore()

  const THEME_OPTIONS = [
    { id: 'auto', label: '跟随系统' },
    { id: 'light', label: '日间' },
    { id: 'dark', label: '夜间' }
  ] as const

  const resetConfirm = ref(false)
  const privacyOpen = ref(false)
  const aboutOpen = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)

  // ---- 重置流程:弹窗期间暂停心跳,取消则恢复 ----
  function openReset(): void {
    resetConfirm.value = true
    engine.pause()
  }

  function closeReset(): void {
    resetConfirm.value = false
    engine.resume()
  }

  function confirmReset(): void {
    resetGame()
  }

  // 弹窗开着就离开页面时兜底恢复
  onUnmounted(() => {
    if (resetConfirm.value) engine.resume()
  })

  function triggerImport(): void {
    fileInput.value?.click()
  }

  function onFilePicked(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      // 先暂停引擎,防止 Pinia persist 插件在导入后覆盖数据
      engine.pause()
      const err = importSaveText(text)
      if (err) {
        ui.toast(err, 'warn')
        engine.resume() // 导入失败时恢复引擎
        return
      }
      ui.toast('存档导入成功,即将重新入定', 'success')
      // 导入已写盘,立即封存:阻止 persist 插件把旧内存回写覆盖
      sealStorageWrites()
      setTimeout(reloadGame, 800)
    }
    reader.readAsText(file)
    // 清空 input,允许重复选择同一文件
    if (fileInput.value) fileInput.value.value = ''
  }
</script>
