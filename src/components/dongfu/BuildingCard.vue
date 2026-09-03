<template>
  <div class="card-ink flex flex-col px-3 py-3" :class="flashing ? 'card-flash' : ''" @animationend.self="flashing = false">
    <div class="flex items-start justify-between gap-2">
      <p class="min-w-0 truncate font-kai text-[14px] tracking-wider text-ink">{{ props.def.name }}</p>
      <p :key="level" class="shrink-0 text-[10px] text-ink-faint animate-ink-pop">
        {{ level > 0 ? `${level} 级` : '未启用' }}
      </p>
    </div>
    <p class="mt-2 grow text-[11px] leading-relaxed text-ink-faint">
      {{ level > 0 ? props.def.effectText(level) : props.def.desc }}
    </p>
    <button class="btn-ghost mt-2 w-full !py-1.5 !text-[12px]" :disabled="!info.canUpgrade" @click="upgradeBuilding(props.def.id)">
      <template v-if="info.canUpgrade">{{ level > 0 ? '升级' : '建造' }} · {{ formatGN(info.stone) }}石 {{ info.ore }}铁</template>
      <template v-else>{{ info.reason }}</template>
    </button>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { BuildingDef } from '@/types'
  import { useDongfuStore } from '@/stores/dongfu'
  import { buildingUpgradeInfo, upgradeBuilding } from '@/core/buildingService'
  import { formatGN } from '@/utils/format'

  const props = defineProps<{ def: BuildingDef }>()

  const dongfu = useDongfuStore()

  const level = computed(() => dongfu.levels[props.def.id] ?? 0)
  const info = computed(() => buildingUpgradeInfo(props.def.id))

  // 升级落成:整卡金光一闪(动画播完自清)
  const flashing = ref(false)
  watch(level, (nv, ov) => {
    if (nv > ov) flashing.value = true
  })
</script>
