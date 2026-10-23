<template>
  <!-- 存档:版本 / 备份 / 写盘失败 / 坏档 / 导出导入 / 重置 -->
  <div class="card-ink space-y-2 px-4 py-3">
    <p class="text-[11px] text-ink-faint tabular">
      存档版本 v{{ SAVE_VERSION }} · 修行时长 {{ formatDuration(game.totalPlaySec) }}
    </p>
    <!--
      备份这件事没人提醒就不会做,而它恰恰是丢档前唯一的保险 —— 故常驻一行;
      备份旧了、这一档又确实攒了东西时,才把那句「建议导出一份」说出来(见 core/saveBackup.ts)。
    -->
    <p class="text-[11px] tabular" :class="backupPrompt ? 'text-amber-ink' : 'text-ink-faint'">
      上次导出备份:{{ lastExportText }}
      <span v-if="backupPrompt" class="leading-relaxed">
        · 建议导出一份 —— 安卓清应用数据、iOS 七天不打开都会把进度带走
      </span>
    </p>
    <!-- 写盘失败时这里必须说话:玩家可能正玩得兴起,却不知道进度没进档 -->
    <p v-if="saveFailed" class="rounded-md border border-cinnabar/40 bg-cinnabar/8 px-2 py-1.5 text-[11px] leading-relaxed text-cinnabar">
      上次存档没能存下 —— 本机容量可能已满。请先「导出存档」留一份,再清理本机空间或换设备导入。
    </p>
    <!--
      坏掉的分片只说一次(启动时一条 2.4 秒的提示)是不够的:
      玩家多半是先发现「我的灵石怎么没了」,再回来找原因。
      故这里常驻一条:哪一片坏了、原档还在哪儿、以及最该做的那件事(导入备份)。
    -->
    <p
      v-if="corruptedNotice.length"
      class="rounded-md border border-cinnabar/40 bg-cinnabar/8 px-2 py-1.5 text-[11px] leading-relaxed text-cinnabar"
    >
      启动时发现有档案未能读全,已尽力修复,损失的只是未能同步的那一段:{{
        corruptedNotice.map(id => STORE_NAMES[id] ?? id).join('、')
      }}。原档并未删除,仍留在本机 —— 若有导出备份,可在下方导入复原。
      <button class="mt-1 block text-ink-faint underline" @click="ui.corruptedNotice = []">知道了</button>
    </p>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn-ghost !text-[12px]" @click="onExport">导出存档</button>
      <button class="btn-ghost !text-[12px]" @click="triggerImport">导入存档</button>
      <!-- 安卓 MIME 表通常不认 .save;放行通用文件类型与扩展名,安全边界仍由 importSaveText 校验 -->
      <input ref="fileInput" type="file" accept="application/octet-stream,.save" class="hidden" @change="onFilePicked" />
    </div>
    <button class="btn-ghost w-full !border-cinnabar/40 !text-[12px] !text-cinnabar" @click="openReset">
      散尽修为,重入轮回(清空存档)
    </button>

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
          <button class="btn-seal flex-1 !bg-cinnabar-deep" @click="confirmReset">道心已决</button>
        </div>
      </template>
    </BaseModal>

    <!-- 导入确认(弹窗期间引擎暂停;与重置同级破坏,给一次反悔机会) -->
    <BaseModal :open="importConfirm" title="导入存档" @close="closeImport">
      <p class="text-[13px] leading-relaxed text-ink-soft">
        导入「{{ importName || '所选备份' }}」会
        <span class="text-cinnabar">整体覆盖</span>
        本机当前存档,且不可回退。旧档若无备份将不复存在 —— 建议先导出存档留底。
      </p>
      <!-- 备份是谁的、什么版本、什么时间导的:整体覆盖前先摊个底细(决策前摊数字) -->
      <div v-if="importInspect" class="mt-3 rounded-md bg-paper-deep/60 px-3 py-2 text-[11px] leading-relaxed">
        <p class="flex flex-wrap items-baseline gap-x-2 text-ink">
          <span class="font-kai text-[14px]">{{ importInspect.name }}</span>
          <span class="text-ink-faint">{{ importInspect.realmLabel }}</span>
        </p>
        <p class="mt-0.5 flex flex-wrap gap-x-2 tabular text-[10px]" :class="importInspect.tooNew ? 'text-cinnabar' : 'text-ink-faint'">
          <span>备份 v{{ importInspect.version }}</span>
          <span>导出 {{ formatClock(importInspect.exportedAt) }}</span>
          <span v-if="importInspect.tooNew">高于当前 v{{ SAVE_VERSION }},无法导入</span>
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
            {{ importInspect?.tooNew === true ? '无法导入(版本过高)' : '覆盖导入' }}
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
  import { formatClock, formatDuration } from '@/utils/format'
  import { SAVE_VERSION, STORE_NAMES, saveWriteFailure, subscribeSaveWriteFailure } from '@/utils/storage'
  import BaseModal from '@/components/common/BaseModal.vue'

  const settings = useSettingsStore()
  const game = useGameStore()
  const ui = useUiStore()

  /** 写盘失败状态:进页面先读一次,之后随订阅翻转 */
  const saveFailed = ref(saveWriteFailure() !== null)
  /** 被隔离的分片(启动时 preflightScan 记下的那份) */
  const corruptedNotice = computed<string[]>(() => ui.corruptedNotice)

  /**
   * 备份那一行用的「现在」。进页面取一次即可 —— 这一页不是秒表,而每渲染一次就算一次
   * Date.now() 反而会让 computed 不稳定。跨天挂着不动属于可接受的误差(重进页面即刷新)。
   */
  const now = ref(Date.now())
  const lastExportText = computed(() => formatLastExport(settings.lastExportAt, now.value))
  /** 该不该说出「建议导出一份」(备份旧了 + 这一档攒够了天数,见 core/saveBackup.ts) */
  const backupPrompt = computed(() => shouldPromptBackup(settings.lastExportAt, game.createdAt, now.value))

  const resetConfirm = ref(false)
  /** 导入二步确认:选完文件只读进内存,等玩家点头才真正覆盖(与「散尽修为」同级破坏) */
  const importConfirm = ref(false)
  const importText = ref<string | null>(null)
  const importName = ref('')
  /** 这份待导入备份的身份与版本(确认前摊开):是谁的档、什么版本、何时导出、是否高于当前 */
  const importInspect = ref<ReturnType<typeof inspectImportText> | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  let saveRead: SaveFileReadHandle | null = null
  /** 离页后文件读取可能才完成;不能再暂停引擎,也不能写已销毁组件的状态 */
  let unmounted = false

  const unsubscribeSaveFailure = subscribeSaveWriteFailure(failure => {
    saveFailed.value = failure !== null
  })

  // 弹窗开着就离开页面时兜底恢复
  onUnmounted(() => {
    unmounted = true
    unsubscribeSaveFailure()
    saveRead?.abort()
    saveRead = null
    if (resetConfirm.value || importConfirm.value) engine.resume()
  })

  /** 导出存档:Web/Electron 走浏览器下载,Android 走系统保存面板(见 savePlatform) */
  function onExport(): void {
    // 两个平台各自会 toast 结果;这里再兜一层,免得异常冒成未捕获的 Promise。
    // 只有真的落盘了才记账(返回 null 即成功)—— 没导出成功却把时间戳往前推,
    // 等于用一行「今天」把玩家骗过去,那比不提醒更糟。
    void exportSaveToDevice()
      .then(err => {
        if (!err) settings.lastExportAt = Date.now()
      })
      .catch(() => ui.toast('导出没能完成,请稍后再试', 'warn'))
  }

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
        ui.toast('这个文件是空的,换一个再试', 'warn')
        return
      }
      // 先只读进内存,不落地:等玩家在确认弹窗点头,才真正覆盖当前存档。
      // 导入与「散尽修为」同级破坏 —— 一选文件就写盘,旧档连反悔的机会都没有。
      importText.value = text
      importName.value = file.name
      importInspect.value = inspectImportText(text)
      importConfirm.value = true
      engine.pause()
    }, () => {
      if (unmounted) return
      saveRead = null
      ui.toast('这个文件读不出来,换一个再试', 'warn')
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
</script>
