<template>
  <div>
    <SectionTitle title="流派实验室" />
    <div class="card-ink px-4 py-3">
      <p v-if="error" class="mb-2 text-[10px] text-cinnabar">{{ error }}</p>

      <!-- 未跑(含失败后) -->
      <button v-if="!running && !report" class="btn-seal w-full !py-2 !text-[12px]" @click="run">
        跑一遍检索
      </button>

      <div v-else-if="running">
        <p class="flex items-center justify-between font-kai text-[10px] text-ink-faint">
          <span>检索中</span>
          <span class="tabular">{{ progress }} / {{ total }}</span>
        </p>
        <div class="track-ink mt-1 h-1.25 w-full overflow-hidden rounded-full">
          <div class="bar-fill h-full bg-azure" :style="{ width: `${total ? (progress / total) * 100 : 0}%` }" />
        </div>
      </div>

      <!-- 结果:世界的大势,不是玩家的号 -->
      <div v-else-if="report">
        <p class="flex items-baseline justify-between gap-2 text-[11px]">
          <span class="text-ink-faint">万金油</span>
          <span class="tabular" :class="report.universals.length ? 'text-jade' : 'text-ink-faint'">
            {{ report.universals.length }} 套<template v-if="report.universals.length"> · 通吃四墙</template>
          </span>
        </p>
        <p v-if="report.universals.length" class="mt-0.5 text-[10px] text-ink-faint">{{ topUniversalNames }}</p>
        <p class="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
          <span class="text-ink-faint">陷阱</span>
          <span class="tabular text-ink-soft">{{ report.traps.length }} 套 · 全场景皆输</span>
        </p>
        <div class="ink-divider my-1.5" />
        <p class="flex items-baseline justify-between gap-2 text-[11px]">
          <span class="text-ink-faint">战力 × 胜率相关</span>
          <span class="tabular text-ink-soft">{{ Math.round(report.powerCorrelation * 100) }}%</span>
        </p>
        <button class="btn-ghost mt-2 w-full !py-2 !text-[11px]" @click="run">再检索一次</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onUnmounted, ref } from 'vue'
  import { searchBuildsAsync } from '@/core/buildSearch'
  import type { SearchReport } from '@/core/buildSearch'
  import SectionTitle from '@/components/common/SectionTitle.vue'

  const running = ref(false)
  const progress = ref(0)
  const total = ref(0)
  const report = ref<SearchReport | null>(null)
  const error = ref('')

  // 卸载即停:不再写已销毁组件的状态
  let isUnmounted = false
  onUnmounted(() => {
    isUnmounted = true
  })

  /** 固定种子 → 全服同一份大势,不随刷新变;分块让位,主线程不冻结 */
  async function run(): Promise<void> {
    if (running.value) return
    running.value = true
    // 先清旧报告:失败时旧结果不得冒充本次结论
    error.value = ''
    report.value = null
    progress.value = 0
    total.value = 0
    try {
      const result = await searchBuildsAsync({
        n: 600,
        fightsPerArch: 16,
        seed: 20261004,
        /*
         * 每评完 8 套让出一次主线程。
         * 实测每套 16 场:让出一次要等 24 套时单块 236ms —— 远超 100ms 的卡顿阈值,
         * 玩家点「跑一遍检索」会看到整页僵住。8 套约 79ms,总耗时不变(实测 5923 vs 5901ms)。
         */
        yieldEvery: 8,
        // 只挡回写不够,离页须中止模拟本身
        shouldStop: () => isUnmounted,
        onProgress: (d, t) => {
          if (isUnmounted) return
          progress.value = d
          total.value = t
        }
      })
      // null = 离页取消,不算检索失败
      if (isUnmounted || result === null) return
      report.value = result
    } catch {
      if (isUnmounted) return
      error.value = '检索失败'
    } finally {
      if (!isUnmounted) running.value = false
    }
  }

  /** 万金油按平均胜率取前二;无名目报「杂学」 */
  const topUniversalNames = computed(() => {
    const tops = (report.value?.universals ?? [])
      .slice(0, 2)
      .map(r => r.identity)
      .filter(n => n && n !== '杂学')
    return `涌现:${tops.length ? tops.join('、') : '杂学'}`
  })
</script>
