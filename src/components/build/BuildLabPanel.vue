<template>
  <div>
    <SectionTitle title="流派实验室" hint="随机放养,读世界大势" />
    <div class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        在可达词条空间里随机放养一批构筑,对七类原型挨个对打 —— 看这个世界有没有万金油,
        战力高是不是真的就能打。检索较沉,点一下、等它跑完。
      </p>

      <!-- 未跑:点一下才开跑 -->
      <button v-if="!running && !report" class="btn-seal mt-2 w-full !py-2 !text-[12px]" @click="run">
        跑一遍检索
      </button>

      <!-- 跑着:进度条交代,顺手防误点 -->
      <div v-else-if="running" class="mt-2">
        <p class="flex items-center justify-between font-kai text-[10px] text-ink-faint">
          <span>检索中</span>
          <span class="tabular">{{ progress }} / {{ total }}</span>
        </p>
        <div class="track-ink mt-1 h-1.25 w-full overflow-hidden rounded-full">
          <div class="bar-fill h-full bg-azure" :style="{ width: `${total ? (progress / total) * 100 : 0}%` }" />
        </div>
      </div>

      <!-- 结果:读的是世界的大势,不是你的号 -->
      <div v-else-if="report" class="mt-2">
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
        <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ correlationLine }}</p>
        <button class="btn-ghost mt-2 w-full !py-2 !text-[11px]" @click="run">再检索一次</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { searchBuildsAsync } from '@/core/buildSearch'
  import type { SearchReport } from '@/core/buildSearch'
  import SectionTitle from '@/components/common/SectionTitle.vue'

  const running = ref(false)
  const progress = ref(0)
  const total = ref(0)
  const report = ref<SearchReport | null>(null)

  /** 一次「实验室」:固定种子 → 全服同一份大势,不随刷新变;分块让位,主线程不冻结 */
  async function run(): Promise<void> {
    if (running.value) return
    running.value = true
    progress.value = 0
    total.value = 0
    try {
      report.value = await searchBuildsAsync({
        n: 600,
        fightsPerArch: 16,
        seed: 20261004,
        yieldEvery: 24,
        onProgress: (d, t) => {
          progress.value = d
          total.value = t
        }
      })
    } finally {
      running.value = false
    }
  }

  /** 万金油按平均胜率取前二、点出名来;都是杂学配比就直说,不编名目 */
  const topUniversalNames = computed(() => {
    const tops = (report.value?.universals ?? [])
      .slice(0, 2)
      .map(r => r.identity)
      .filter(n => n && n !== '杂学')
    return tops.length ? `今次涌现:${tops.join('、')}` : '今次万金油多为杂学配比'
  })

  /** 相关的读法:别让玩家把 r 当名次 */
  const correlationLine = computed(() => {
    const r = report.value?.powerCorrelation ?? 0
    if (r > 0.6) return '战力高者胜率更稳,但也只是大势,相性仍分高下'
    if (r > 0.2) return '战力与胜率相关,但不是唯一准绳'
    return '战力几乎挑不出流派 —— 强弱在相性,不在面板'
  })
</script>
