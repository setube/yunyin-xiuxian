<template>
  <div class="card-ink px-4 py-3">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="font-kai text-[14px] tracking-[0.25em] text-ink">灵脉投资</h3>
      <span class="text-[11px] text-ink-faint tabular">
        {{ veinTotal }}/{{ VEIN_TOTAL_CAPACITY }}
      </span>
    </div>
    <p class="mb-3 text-[11px] leading-relaxed text-ink-soft">
      炼化灵石永久强化洞府灵脉,获得全局属性加成。每条灵脉可投30点上限。
    </p>

    <div class="space-y-2.5">
      <div v-for="v in VEINS" :key="v.id" class="space-y-1">
        <button
          class="btn-ghost flex w-full items-center justify-between !py-1.5 !text-[12px]"
          :disabled="!canInvest(v.id)"
          @click="doInvest(v.id)"
        >
          <span>{{ v.name }}</span>
          <span class="tabular text-[11px]">
            <span :class="currentLevel(v.id) >= VEIN_SIDE_CAP ? 'text-jade' : 'text-ink-faint'">
              {{ currentLevel(v.id) }}/{{ VEIN_SIDE_CAP }}
            </span>
            <span class="ml-1.5 text-ink-ghost">{{ formatGN(investCost) }}</span>
          </span>
        </button>
        <!-- 每条脉都要自陈作用:此前只显示名字与价格,玩家无从判断该投哪条 -->
        <p class="px-0.5 text-[10px] leading-relaxed text-ink-faint">
          {{ v.desc }}
          <span v-if="currentLevel(v.id) > 0" class="text-azure">· {{ v.effectText(currentLevel(v.id)) }}</span>
        </p>
      </div>
    </div>

    <p class="mt-3 text-[10px] text-azure">
      当前加成:
      <span v-if="!bonusRows.length" class="ml-1 text-ink-faint">尚无</span>
      <span v-for="row in bonusRows" :key="row.label" class="ml-1">
        {{ row.label }} {{ row.sign }}{{ formatPercent(row.value) }}
      </span>
    </p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { VEINS, type VeinId } from '@/data/veins'
  import { investVein, veinPointCost } from '@/core/veinService'
  import { VEIN_TOTAL_CAPACITY, VEIN_SIDE_CAP, VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { STAT_NAMES } from '@/ui/statNames'
  import { formatGN, formatPercent } from '@/utils/format'
  import type { AnyStatKey } from '@/types'

  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  const investCost = computed(() => veinPointCost())
  const veinTotal = computed(() => dongfu.veinTotal)
  /**
   * 当前加成 —— 必须把不走 StatMods 的那一条也算进来。
   *
   * 寒冥灵脉的 perPoint 是空对象:它的效果是「功法参悟省悟道点」,
   * 走 dongfu.insightDiscount,不进 veinMods。此前这里只读 veinMods,
   * 于是投了满脉也一个字都不显示 —— 玩家因此不知道它有没有用
   */
  const bonusRows = computed(() => {
    const rows: { label: string; value: number; sign: string }[] = []
    for (const [k, v] of Object.entries(dongfu.veinMods)) {
      if (typeof v === 'number' && v > 0) {
        rows.push({ label: STAT_NAMES[k as AnyStatKey] ?? k, value: v, sign: '+' })
      }
    }
    // 参悟折扣是减耗,故记负号
    if (dongfu.insightDiscount > 0) {
      rows.push({ label: '参悟省耗', value: Math.min(0.5, dongfu.insightDiscount), sign: '−' })
    }
    return rows
  })

  function currentLevel(veinId: VeinId): number {
    return dongfu.veinPoints[veinId] ?? 0
  }

  function canInvest(veinId: VeinId): boolean {
    if (player.major < VEIN_UNLOCK_MAJOR) return false
    const level = currentLevel(veinId)
    if (level >= VEIN_SIDE_CAP) return false
    return veinTotal.value < VEIN_TOTAL_CAPACITY
  }

  function doInvest(veinId: VeinId): void {
    investVein(veinId)
  }
</script>
