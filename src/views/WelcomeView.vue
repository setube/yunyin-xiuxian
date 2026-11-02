<template>
  <div class="stagger-in flex min-h-full flex-col items-center justify-center px-8 py-10">
    <!-- 印面在方块本身:seal-face 的夜主题底要盖住整块,套在字上会留一圈亮朱 -->
    <div class="seal-face grid h-24 w-24 place-items-center rounded-2xl bg-cinnabar shadow-lg shadow-cinnabar/30">
      <span class="font-kai text-[56px] leading-none">道</span>
    </div>

    <h1 class="mt-6 font-kai text-[40px] leading-tight tracking-[0.3em] text-ink">云隐修仙录</h1>
    <p class="mt-2 text-[12px] tracking-[0.5em] text-ink-faint">一念修行 · 云深不知处</p>

    <button class="btn-seal mt-10 w-full max-w-72 !py-3.5 text-[17px] tracking-[0.3em]" @click="onStart">开 始 游 戏</button>

    <div class="mt-6 flex items-center gap-3 text-[11px] text-ink-faint">
      <button class="inline-flex min-h-[28px] items-center active:text-ink-soft" @click="privacyOpen = true">隐私政策</button>
      <span class="text-ink-faint">·</span>
      <button class="inline-flex min-h-[28px] items-center active:text-ink-soft" @click="importOpen = true">导入存档</button>
      <span class="text-ink-faint">·</span>
      <button class="inline-flex min-h-[28px] items-center active:text-ink-soft" @click="aboutOpen = true">关于我们</button>
    </div>
    <!-- 安卓 MIME 表通常不认 .save;安全边界由 importSaveText 校验 -->
    <input ref="fileInput" type="file" accept="application/octet-stream,.save" class="hidden" @change="onFilePicked" />

    <BaseModal :open="importOpen" title="导入存档" @close="importOpen = false">
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="importOpen = false">再想想</button>
          <button class="btn-seal flex-1" @click="triggerImport">选择存档文件</button>
        </div>
      </template>
    </BaseModal>

    <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />

    <PrivacyDialog :open="privacyOpen" @close="privacyOpen = false" />

    <BaseModal :open="agreeOpen" title="进入确认" :closable="false">
      <p class="text-[12px] leading-relaxed text-ink-faint">游戏数据仅存本机 · 流量统计不含游戏数据</p>
      <label class="mt-3 flex items-center gap-2">
        <input v-model="agreed" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        <span class="text-[12px] text-ink-soft">
          我已阅读并同意
          <!-- 行内按钮命中区只有 17px;内联块给拇指 30px 靶面 -->
          <button class="inline-block py-1.5 text-azure" @click.prevent="privacyOpen = true">《隐私政策》</button>
        </span>
      </label>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="agreeOpen = false">再想想</button>
          <button class="btn-seal flex-1" :disabled="!agreed" @click="confirmStart">同意并开始</button>
        </div>
      </template>
    </BaseModal>

    <WarpPortal ref="warpRef" />
  </div>
</template>

<script setup lang="ts">
  import { onUnmounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useSettingsStore } from '@/stores/settings'
  import { useUiStore } from '@/stores/ui'
  import { importSaveText, reloadGame, sealStorageWrites } from '@/core/save'
  import { readSaveFile, type SaveFileReadHandle } from '@/core/saveFileRead'
  import { engine } from '@/core/engine'
  import BaseModal from '@/components/common/BaseModal.vue'
  import PrivacyDialog from '@/components/common/PrivacyDialog.vue'
  import AboutDialog from '@/components/common/AboutDialog.vue'
  import WarpPortal from '@/components/common/WarpPortal.vue'

  const router = useRouter()
  const settings = useSettingsStore()
  const ui = useUiStore()

  const privacyOpen = ref(false)
  const agreeOpen = ref(false)
  const agreed = ref(false)
  const importOpen = ref(false)
  const aboutOpen = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)
  const warpRef = ref<InstanceType<typeof WarpPortal> | null>(null)
  let enterTimer: ReturnType<typeof setTimeout> | undefined
  let saveRead: SaveFileReadHandle | null = null
  /** 离页后读取可能才完成:不得再暂停引擎或写已销毁组件的状态 */
  let unmounted = false

  function onStart(): void {
    if (settings.privacyAccepted) {
      void router.push('/create')
      return
    }
    agreeOpen.value = true
  }

  function confirmStart(): void {
    settings.privacyAccepted = true
    agreeOpen.value = false
    warpRef.value?.show({ title: '云深不知处', subtitle: '仙路自此始' })
    enterTimer = setTimeout(() => {
      void router.push('/create')
    }, 2500)
  }

  // 导入存档:与设置页同流程(先停引擎,导完重载)
  function triggerImport(): void {
    fileInput.value?.click()
  }

  function onFilePicked(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    saveRead?.abort()
    saveRead = readSaveFile(file, text => {
      if (unmounted) return
      saveRead = null
      engine.pause()
      const err = importSaveText(text)
      if (err) {
        ui.toast(err, 'warn')
        engine.resume()
        return
      }
      ui.toast('导入成功', 'success')
      // 立即封存,阻止 persist 插件把欢迎页旧内存(started=false)回写覆盖
      sealStorageWrites()
      setTimeout(reloadGame, 800)
    }, () => {
      if (unmounted) return
      saveRead = null
      ui.toast('文件无法读取', 'warn')
    })
    if (fileInput.value) fileInput.value.value = ''
  }

  onUnmounted(() => {
    unmounted = true
    if (enterTimer !== undefined) clearTimeout(enterTimer)
    saveRead?.abort()
    saveRead = null
  })
</script>
