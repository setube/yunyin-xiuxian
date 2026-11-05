<template>
  <div class="card-ink space-y-2 px-4 py-3">
    <p class="text-[11px] text-ink-faint tabular">
      存档版本 v{{ SAVE_VERSION }} · 修行时长 {{ formatDuration(game.totalPlaySec) }}
    </p>
    <p class="text-[11px] tabular" :class="backupPrompt ? 'text-amber-ink' : 'text-ink-faint'">
      上次导出备份:{{ lastExportText }}
    </p>
    <p v-if="saveFailed" class="rounded-md border border-cinnabar/40 px-2 py-1.5 text-[11px] leading-relaxed text-cinnabar">
      存档写入失败
    </p>
    <!-- 坏档分片须常驻一条:启动提示只有 2.4 秒 -->
    <p
      v-if="corruptedNotice.length"
      class="rounded-md border border-cinnabar/40 px-2 py-1.5 text-[11px] leading-relaxed text-cinnabar"
    >
      存档损坏:{{ corruptedNotice.map(id => STORE_NAMES[id] ?? id).join('、') }} · 原档留在本机
      <button class="mt-1 block text-ink-faint underline" @click="ui.corruptedNotice = []">知道了</button>
    </p>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn-ghost !text-[12px]" @click="onExport">导出存档</button>
      <button class="btn-ghost !text-[12px]" @click="triggerImport">导入存档</button>
      <!-- 安卓 MIME 表通常不认 .save:须放行通用文件类型与扩展名,安全边界由 importSaveText 校验 -->
      <input ref="fileInput" type="file" accept="application/octet-stream,.save" class="hidden" @change="onFilePicked" />
    </div>
    <button class="btn-ghost w-full !border-cinnabar/40 !text-[12px] !text-cinnabar" @click="openReset">
      清空存档
    </button>

    <BaseModal :open="resetConfirm" title="清空存档" @close="closeReset">
      <p class="text-[13px] leading-relaxed text-ink-soft">
        <span class="text-cinnabar">清空</span>本机全部存档 · 含转世收获 · 不可逆
      </p>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="closeReset">再想想</button>
          <button class="btn-seal flex-1 !bg-cinnabar-deep" @click="confirmReset">确认清空</button>
        </div>
      </template>
    </BaseModal>

    <BaseModal :open="importConfirm" title="导入存档" @close="closeImport">
      <p class="text-[13px] leading-relaxed text-ink-soft">
        「{{ importName || '所选备份' }}」将<span class="text-cinnabar">整体覆盖</span>本机当前存档 · 不可逆
      </p>
      <div v-if="importInspect" class="mt-3 rounded-md bg-paper-deep/60 px-3 py-2 text-[11px] leading-relaxed">
        <p class="flex flex-wrap items-baseline gap-x-2 text-ink">
          <span class="font-kai text-[14px]">{{ importInspect.name }}</span>
          <span class="text-ink-faint">{{ importInspect.realmLabel }}</span>
        </p>
        <p class="mt-0.5 flex flex-wrap gap-x-2 tabular text-[10px]" :class="importInspect.tooNew ? 'text-cinnabar' : 'text-ink-faint'">
          <span>备份 v{{ importInspect.version }}</span>
          <!-- 带日期:三天前与一小时前的备份只差一个时刻,看不出哪份更新 -->
          <span v-if="importInspect.exportedAt !== null">导出 {{ formatStamp(importInspect.exportedAt) }}</span>
          <span v-else>无导出时刻</span>
          <span v-if="importInspect.tooNew">高于当前 v{{ SAVE_VERSION }}</span>
        </p>
      </div>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="closeImport">再想想</button>
          <button
            class="btn-seal flex-1 disabled:text-ink-faint"
            :disabled="importInspect?.tooNew === true"
            @click="confirmImport"
          >
            {{ importInspect?.tooNew === true ? '无法导入' : '确认导入' }}
          </button>
        </div>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onUnmounted, ref } from 'vue'
  import { useGameStore } from '@/stores/game'
  import { useSettingsStore } from '@/stores/settings'
  import { useUiStore } from '@/stores/ui'
  import { engine } from '@/core/engine'
  import { importSaveText, inspectImportText, resetGame, reloadGame, sealStorageWrites } from '@/core/save'
  import { readSaveFile, type SaveFileReadHandle } from '@/core/saveFileRead'
  import { exportSaveToDevice } from '@/core/savePlatform'
  import { formatLastExport, shouldPromptBackup } from '@/core/saveBackup'
  import { formatDuration, formatStamp } from '@/utils/format'
  import { SAVE_VERSION, STORE_NAMES, saveWriteFailure, subscribeSaveWriteFailure } from '@/utils/storage'
  import BaseModal from '@/components/common/BaseModal.vue'

  const settings = useSettingsStore()
  const game = useGameStore()
  const ui = useUiStore()

  const saveFailed = ref(saveWriteFailure() !== null)
  /** 被隔离的分片(启动时 preflightScan 记下) */
  const corruptedNotice = computed<string[]>(() => ui.corruptedNotice)

  /** 进页面取一次:computed 里读 Date.now() 不稳定;跨天误差可接受(重进即刷新) */
  const now = ref(Date.now())
  const lastExportText = computed(() => formatLastExport(settings.lastExportAt, now.value))
  /** 备份旧了且本档攒够天数时标琥珀(见 core/saveBackup.ts) */
  const backupPrompt = computed(() => shouldPromptBackup(settings.lastExportAt, game.createdAt, now.value))

  const resetConfirm = ref(false)
  /** 导入二步确认:选完文件只读进内存,确认后才覆盖(与「清空存档」同级破坏) */
  const importConfirm = ref(false)
  const importText = ref<string | null>(null)
  const importName = ref('')
  /** 待导入备份的身份与版本,确认前摊开 */
  const importInspect = ref<ReturnType<typeof inspectImportText> | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  let saveRead: SaveFileReadHandle | null = null
  /** 离页后读取可能才完成:不得再暂停引擎或写已销毁组件的状态 */
  let unmounted = false

  const unsubscribeSaveFailure = subscribeSaveWriteFailure(failure => {
    saveFailed.value = failure !== null
  })

  // 弹窗开着就离页时兜底恢复引擎
  onUnmounted(() => {
    unmounted = true
    unsubscribeSaveFailure()
    saveRead?.abort()
    saveRead = null
    if (resetConfirm.value || importConfirm.value) engine.resume()
  })

  /** Web/Electron 走浏览器下载,Android 走系统保存面板(见 savePlatform) */
  function onExport(): void {
    // 平台各自 toast 结果,此处只兜未捕获异常;返回 null 即已落盘,落盘才记时间戳
    void exportSaveToDevice()
      .then(err => {
        if (!err) settings.lastExportAt = Date.now()
      })
      .catch(() => ui.toast('导出失败', 'warn'))
  }

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
      if (!text.trim()) {
        ui.toast('文件为空', 'warn')
        return
      }
      importText.value = text
      importName.value = file.name
      importInspect.value = inspectImportText(text)
      importConfirm.value = true
      engine.pause()
    }, () => {
      if (unmounted) return
      saveRead = null
      ui.toast('文件无法读取', 'warn')
    }, {
      // 超大文件当场回执:读进内存才是伤害所在,与「读不出」分开报
      onTooLarge: () => {
        if (unmounted) return
        saveRead = null
        ui.toast('文件过大', 'warn')
      }
    })
    // 清空 input,允许重复选择同一文件
    if (fileInput.value) fileInput.value.value = ''
  }

  function closeImport(): void {
    importConfirm.value = false
    importText.value = null
    importName.value = ''
    importInspect.value = null
    engine.resume()
  }

  function confirmImport(): void {
    const text = importText.value
    importConfirm.value = false
    importText.value = null
    importName.value = ''
    if (text === null) return
    // 须先暂停引擎:防 persist 插件在导入后覆盖数据
    engine.pause()
    const err = importSaveText(text)
    if (err) {
      ui.toast(err, 'warn')
      engine.resume()
      return
    }
    ui.toast('导入成功', 'success')
    // 已写盘,立即封存:阻止 persist 插件把旧内存回写覆盖
    sealStorageWrites()
    setTimeout(reloadGame, 800)
  }
</script>
