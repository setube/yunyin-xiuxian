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
          <input v-model.number="settings.musicVol" type="range" min="0" max="100" aria-label="背景音乐音量" class="grow accent-cinnabar" />
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
          <input v-model.number="settings.sfxVol" type="range" min="0" max="100" aria-label="音效音量" class="grow accent-cinnabar" />
          <span class="w-7 text-right text-[10px] tabular text-ink-faint">{{ settings.sfxVol }}</span>
        </div>
      </div>
      <label class="flex items-center justify-between py-3">
        <span class="text-[13px] text-ink-soft">减少动效</span>
        <input v-model="settings.reduceMotion" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <div class="py-3">
        <label class="flex items-center justify-between">
          <span class="text-[13px] text-ink-soft">遇事勿扰</span>
          <input v-model="settings.dndEvents" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
          历练撞见际遇/机缘/奇缘不再弹窗,自动按默认好愿了结 —— 奖励照拿,只是不再卡手。
        </p>
      </div>
      <div class="flex items-center justify-between py-3">
        <span class="text-[13px] text-ink-soft">夜间模式</span>
        <div role="group" aria-label="夜间模式" class="flex gap-1">
          <button
            v-for="o in THEME_OPTIONS"
            :key="o.id"
            :aria-pressed="settings.theme === o.id"
            class="chip-ink !py-1.5"
            :class="settings.theme === o.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="settings.theme = o.id"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
      <div class="flex items-center justify-between py-3">
        <span class="text-[13px] text-ink-soft">战报速度</span>
        <div role="group" aria-label="战报速度" class="flex gap-1">
          <button
            v-for="s in [1, 2, 4] as const"
            :key="s"
            :aria-pressed="settings.battleSpeed === s"
            class="chip-ink !py-1.5"
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
        上次写入存档失败 —— 浏览器存储可能已满。请先「导出存档」留一份,再清理浏览器数据或换设备导入。
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
        启动时发现 {{ corruptedNotice.length }} 个存档分片损坏,已隔离修复:{{
          corruptedNotice.map(id => STORE_NAMES[id] ?? id).join('、')
        }}。损坏的原档没有删除,仍留在本机(键名
        <span class="break-all">{{ corruptKeys }}</span>)—— 若手上还有导出的备份,可在此导入恢复。
        <button class="mt-1 block text-ink-faint underline" @click="ui.corruptedNotice = []">知道了</button>
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn-ghost !text-[12px]" @click="onExport">导出存档</button>
        <button class="btn-ghost !text-[12px]" @click="triggerImport">导入存档</button>
        <input ref="fileInput" type="file" accept="application/json,.save" class="hidden" @change="onFilePicked" />
      </div>
      <button class="btn-ghost w-full !border-cinnabar/40 !text-[12px] !text-cinnabar" @click="openReset">
        散尽修为,重入轮回(清空存档)
      </button>
    </div>

    <!--
      诊断:异常留档。

      从前全局异常只 toast 一句「出现异常,已记录」—— 手机上根本没有控制台,
      那句「已记录」无处可查。这里把它坐实:最近 20 条、可复制、也随「导出存档」一起走。
    -->
    <SectionTitle title="诊断" />
    <div class="card-ink space-y-2 px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        <template v-if="diag.errors.length">最近记录了 {{ diag.errors.length }} 条异常(最多留 {{ DIAG_MAX }} 条)</template>
        <template v-else>未记录到异常。真出问题时这里会自动留一条,可连同「导出存档」一起发给我们。</template>
      </p>
      <p v-if="latestError" class="rounded-md bg-ink/4 px-2 py-1.5 text-[10px] leading-relaxed text-ink-soft">
        <span class="tabular text-ink-faint">{{ formatClock(latestError.at) }}</span>
        <span v-if="latestError.count > 1" class="ml-1 text-ink-faint">×{{ latestError.count }}</span>
        <span class="ml-1 break-all">{{ latestError.message }}</span>
        <span v-if="latestError.route" class="ml-1 text-ink-ghost">{{ latestError.route }}</span>
      </p>
      <div v-if="diag.errors.length" class="grid grid-cols-2 gap-2">
        <button class="btn-ghost !text-[12px]" @click="copyDiag">复制异常记录</button>
        <button class="btn-ghost !text-[12px]" @click="diag.clear()">清空记录</button>
      </div>
    </div>

    <!-- iOS 专属:装到主屏幕才躲得过系统清存储(非 iOS 不显示,见组件注释) -->
    <InstallToHomeNotice permanent />

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
      <button class="flex w-full items-center justify-between py-3 active:opacity-60" @click="progressionOpen = true">
        <span class="text-[13px] text-ink-soft">数值体系</span>
        <span class="text-[11px] text-ink-faint">查看 →</span>
      </button>
    </div>

    <!-- 关于我们 -->
    <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />

    <!-- 隐私政策 -->
    <PrivacyDialog :open="privacyOpen" @close="privacyOpen = false" />

    <!-- 数值体系(可解释性:各数值轴的复利倍率 / 净耗时 / 积余 / 命名出处) -->
    <ProgressionDialog :open="progressionOpen" @close="progressionOpen = false" />

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
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, onUnmounted } from 'vue'
  import { useSettingsStore } from '@/stores/settings'
  import { useGameStore } from '@/stores/game'
  import { useUiStore } from '@/stores/ui'
  import { engine } from '@/core/engine'
  import { importSaveText, resetGame, reloadGame, sealStorageWrites } from '@/core/save'
  import { exportSaveToDevice } from '@/core/savePlatform'
  import { formatLastExport, shouldPromptBackup } from '@/core/saveBackup'
  import { formatDuration } from '@/utils/format'
  import { SAVE_VERSION, STORE_NAMES, saveWriteFailure, storageKey, subscribeSaveWriteFailure } from '@/utils/storage'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import PrivacyDialog from '@/components/common/PrivacyDialog.vue'
  import AboutDialog from '@/components/common/AboutDialog.vue'
  import ProgressionDialog from '@/components/common/ProgressionDialog.vue'
  import InstallToHomeNotice from '@/components/common/InstallToHomeNotice.vue'
  import { DIAG_MAX, useDiagStore } from '@/stores/diag'

  const settings = useSettingsStore()
  const game = useGameStore()
  const ui = useUiStore()
  const diag = useDiagStore()

  /** 写盘失败状态:进页面先读一次,之后随订阅翻转 */
  const saveFailed = ref(saveWriteFailure() !== null)
  /** 被隔离的分片(启动时 preflightScan 记下的那份) */
  const corruptedNotice = computed<string[]>(() => ui.corruptedNotice)
  /** 原档留在哪些备份键里 —— 说得出键名,玩家(或帮他的人)才找得回来 */
  const corruptKeys = computed(() => corruptedNotice.value.map(id => `corrupt.${storageKey(id)}`).join('、'))

  /** 最近一条异常(诊断块里只展示这一条,其余随复制/导出带走) */
  const latestError = computed(() => diag.errors[diag.errors.length - 1] ?? null)

  /** 复制用的全文:一条一行,带时间与路由,便于直接贴进聊天窗 */
  const diagText = computed(() =>
    diag.errors
      .map(e => `${formatClock(e.at)} · ${e.info || '异常'} · ${e.message}${e.count > 1 ? ` ×${e.count}` : ''}${e.route ? ` @${e.route}` : ''}`)
      .join('\n')
  )

  /** 月-日 时:分 —— 诊断只需要定位到"哪一次",不需要秒 */
  function formatClock(at: number): string {
    const d = new Date(at)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async function copyDiag(): Promise<void> {
    try {
      await navigator.clipboard.writeText(diagText.value)
      ui.toast('异常记录已复制', 'success')
    } catch {
      // 剪贴板在非安全上下文(file:// 等)不可用 —— 说清退路,别让人以为记录丢了
      ui.toast('复制失败 —— 异常记录就在「导出存档」里,可整份发给我们', 'warn')
    }
  }
  const unsubscribeSaveFailure = subscribeSaveWriteFailure(failure => {
    saveFailed.value = failure !== null
  })

  /**
   * 备份那一行用的「现在」。进页面取一次即可 —— 这一页不是秒表,而每渲染一次就算一次
   * Date.now() 反而会让 computed 不稳定。跨天挂着不动属于可接受的误差(重进页面即刷新)。
   */
  const now = ref(Date.now())
  const lastExportText = computed(() => formatLastExport(settings.lastExportAt, now.value))
  /** 该不该说出「建议导出一份」(备份旧了 + 这一档攒够了天数,见 core/saveBackup.ts) */
  const backupPrompt = computed(() => shouldPromptBackup(settings.lastExportAt, game.createdAt, now.value))

  const THEME_OPTIONS = [
    { id: 'auto', label: '跟随系统' },
    { id: 'light', label: '日间' },
    { id: 'dark', label: '夜间' }
  ] as const

  const resetConfirm = ref(false)
  const privacyOpen = ref(false)
  const aboutOpen = ref(false)
  const progressionOpen = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)

  /** 导出存档:Web/Electron 走浏览器下载,原生端写 Documents(见 savePlatform) */
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

  // 弹窗开着就离开页面时兜底恢复
  onUnmounted(() => {
    unsubscribeSaveFailure()
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
    // 读文件本身也可能失败(权限/磁盘)—— 静默就等于「点了没反应」
    reader.onerror = () => ui.toast('这个文件读不出来,换一个再试', 'warn')
    reader.readAsText(file)
    // 清空 input,允许重复选择同一文件
    if (fileInput.value) fileInput.value.value = ''
  }
</script>
