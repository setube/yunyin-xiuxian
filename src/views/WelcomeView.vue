<template>
  <div class="stagger-in flex min-h-full flex-col items-center justify-center px-8 py-10">
    <!-- 游戏图标 -->
    <div class="grid h-24 w-24 place-items-center rounded-2xl bg-cinnabar shadow-lg shadow-cinnabar/30">
      <span class="font-kai text-[56px] leading-none text-paper">道</span>
    </div>

    <!-- 游戏名 -->
    <h1 class="mt-6 font-kai text-[40px] leading-tight tracking-[0.3em] text-ink">云隐修仙录</h1>
    <p class="mt-2 text-[12px] tracking-[0.5em] text-ink-faint">一念修行 · 云深不知处</p>

    <!-- 开始按钮 -->
    <button class="btn-seal mt-10 w-full max-w-72 !py-3.5 text-[17px] tracking-[0.3em]" @click="onStart">开 始 游 戏</button>

    <!-- 底部:隐私政策 / 导出导入恢复 / 关于 -->
    <div class="mt-6 flex items-center gap-3 text-[11px] text-ink-ghost">
      <button class="active:text-ink-soft" @click="privacyOpen = true">隐私政策</button>
      <span class="text-ink-ghost/40">·</span>
      <template v-if="!Capacitor.isNativePlatform()">
        <button class="active:text-ink-soft" @click="importOpen = true">导入存档</button>
        <span class="text-ink-ghost/40">·</span>
      </template>
      <button class="active:text-ink-soft" @click="aboutOpen = true">关于我们</button>
    </div>
    <input ref="fileInput" type="file" accept="application/json,.save" class="hidden" @change="onFilePicked" />

    <!-- 导入存档:确认文案 -->
    <BaseModal :open="importOpen" title="导入存档" @close="importOpen = false">
      <p class="text-[12px] leading-relaxed text-ink-faint">从设置页导出的存档文件可在此恢复。</p>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="importOpen = false">再想想</button>
          <button class="btn-seal flex-1" @click="triggerImport">选择存档文件</button>
        </div>
      </template>
    </BaseModal>

    <!-- 关于我们 -->
    <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />

    <!-- 隐私政策全文 -->
    <PrivacyDialog :open="privacyOpen" @close="privacyOpen = false" />

    <!-- 开始前的同意确认 -->
    <BaseModal :open="agreeOpen" title="进入前请确认" :closable="false">
      <p class="text-[12px] leading-relaxed text-ink-faint">
        游戏数据仅保存在你的浏览器本地,不上传服务器、不接入第三方统计。继续游玩前,请阅读并同意隐私政策。
      </p>
      <label class="mt-3 flex items-center gap-2">
        <input v-model="agreed" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        <span class="text-[12px] text-ink-soft">
          我已阅读并同意
          <button class="text-azure" @click.prevent="privacyOpen = true">《隐私政策》</button>
        </span>
      </label>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="agreeOpen = false">再想想</button>
          <button class="btn-seal flex-1" :disabled="!agreed" @click="confirmStart">同意并开始</button>
        </div>
      </template>
    </BaseModal>

    <!-- 开始前穿梭传送门特效(同意并开始后播放,播完进建号页) -->
    <WarpPortal ref="warpRef" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useSettingsStore } from '@/stores/settings'
  import { useUiStore } from '@/stores/ui'
  import { importSaveText, reloadGame, sealStorageWrites } from '@/core/save'
  import { engine } from '@/core/engine'
  import BaseModal from '@/components/common/BaseModal.vue'
  import PrivacyDialog from '@/components/common/PrivacyDialog.vue'
  import AboutDialog from '@/components/common/AboutDialog.vue'
  import WarpPortal from '@/components/common/WarpPortal.vue'
  import { Capacitor } from '@capacitor/core'

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
    // 穿梭传送门:播放约 2.5s 后进入建号页
    warpRef.value?.show({ title: '云深不知处', subtitle: '一念修行 · 仙路自此始' })
    setTimeout(() => {
      void router.push('/create')
    }, 2500)
  }

  // ---- 导入存档(与设置页同流程:先停引擎,导完重载) ----
  function triggerImport(): void {
    fileInput.value?.click()
  }

  function onFilePicked(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      engine.pause()
      const err = importSaveText(text)
      if (err) {
        ui.toast(err, 'warn')
        engine.resume() // 导入失败时恢复引擎
        return
      }
      ui.toast('存档导入成功,即将重入仙途', 'success')
      // 导入已写盘,立即封存:阻止 persist 插件把欢迎页旧内存(started=false)回写覆盖
      sealStorageWrites()
      setTimeout(reloadGame, 800)
    }
    reader.readAsText(file)
    if (fileInput.value) fileInput.value.value = ''
  }
</script>
