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

    <div class="space-y-2">
      <div v-for="v in VEINS" :key="v.id" class="flex items-center gap-2">
        <button
          class="btn-ghost flex-1 justify-between !py-1.5 !text-[12px]"
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
      </div>
    </div>

    <p class="mt-3 text-[10px] text-azure">
      当前加成:
      <template v-for="(val, key) in currentBonus" :key="key">
        <span v-if="typeof val === 'number' && val > 0" class="ml-1">
          {{ STAT_NAMES[key as AnyStatKey] ?? key }} +{{ formatPercent(val) }}
        </span>
      </template>
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
  const currentBonus = computed(() => dongfu.veinMods)

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
