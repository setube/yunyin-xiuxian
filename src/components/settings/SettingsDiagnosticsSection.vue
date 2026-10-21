<template>
  <!-- 诊断:异常留档。手机上根本没有控制台,这里把「已记录」坐实。 -->
  <div class="card-ink space-y-2 px-4 py-3">
    <p class="text-[11px] leading-relaxed text-ink-faint">
      <template v-if="diag.errors.length">最近留存的差错 {{ diag.errors.length }} 笔(至多 {{ DIAG_MAX }} 笔)</template>
      <template v-else>还没出过岔子。若有意外,这里会自行记下一笔,可连同「导出存档」一起发给我们。</template>
    </p>
    <p v-if="latestError" class="rounded-md bg-ink/4 px-2 py-1.5 text-[10px] leading-relaxed text-ink-soft">
      <span class="tabular text-ink-faint">{{ formatClock(latestError.at) }}</span>
      <span v-if="latestError.count > 1" class="ml-1 text-ink-faint">×{{ latestError.count }}</span>
      <span class="ml-1 break-all">{{ latestError.message }}</span>
      <span v-if="latestError.route" class="ml-1 text-ink-faint">{{ latestError.route }}</span>
    </p>
    <div v-if="diag.errors.length" class="grid grid-cols-2 gap-2">
      <button class="btn-ghost !text-[12px]" @click="copyDiag">复制差错留档</button>
      <button class="btn-ghost !text-[12px]" @click="diag.clear()">清空留档</button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { DIAG_MAX, useDiagStore } from '@/stores/diag'
  import { formatClock } from '@/utils/format'

  const ui = useUiStore()
  const diag = useDiagStore()

  /** 最近一条异常(诊断块里只展示这一条,其余随复制/导出带走) */
  const latestError = computed(() => diag.errors[diag.errors.length - 1] ?? null)

  /** 复制用的全文:一条一行,带时间与路由,便于直接贴进聊天窗 */
  const diagText = computed(() =>
    diag.errors
      .map(e => `${formatClock(e.at)} · ${e.info || '异常'} · ${e.message}${e.count > 1 ? ` ×${e.count}` : ''}${e.route ? ` @${e.route}` : ''}`)
      .join('\n')
  )

  async function copyDiag(): Promise<void> {
    try {
      await navigator.clipboard.writeText(diagText.value)
      ui.toast('异常记录已复制', 'success')
    } catch {
      // 剪贴板在非安全上下文(file:// 等)不可用 —— 说清退路,别让人以为记录丢了
      ui.toast('复制失败 —— 异常记录就在「导出存档」里,可整份发给我们', 'warn')
    }
  }
</script>
