<template>
  <!-- 天道熔炉 -->
  <BaseModal :open="open" title="天道熔炉" @close="emit('close')">
    <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">
      前尘俗物,皆可熔作道源。灵草唯仙品以上可入炉(凡/灵品只走坊市换灵石)。
    </p>
    <div class="card-ink divide-y divide-ink/6 px-4">
      <div v-for="row in furnaceRows" :key="row.rate.resource" class="py-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[12px] text-ink-soft">{{
            row.rate.resource === "herb"
              ? `灵草(仙品+存 ${formatNum(row.have)})`
              : `${row.rate.name}(存 ${formatNum(row.have)})`
          }}</span>
          <!-- 全熔防误触:文案亮出『整包』与可得道源(不再是『按 25:1 换』的可兑换暗示),再按一下才熔 -->
          <button
            class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
            :disabled="furnacePreview(row.rate) <= 0"
            @click="furnaceConfirm = row.rate.resource"
          >
            熔尽本包 → {{ furnacePreview(row.rate) }} 道源
          </button>
        </div>
        <div
          v-if="furnaceConfirm === row.rate.resource"
          class="mt-1.5 rounded-md bg-cinnabar/5 px-3 py-2"
        >
          <p class="text-[10px] leading-relaxed text-cinnabar">
            将以
            <span class="tabular"
              >{{ row.rate.name }} ×{{ formatNum(furnacePreview(row.rate) * row.rate.per) }}</span
            >
            熔作
            <span class="tabular">+{{ furnacePreview(row.rate) }}</span> 缕道源,余
            <span class="tabular">{{
              formatNum(row.have - furnacePreview(row.rate) * row.rate.per)
            }}</span>
            保留 —— 此举不可逆,所熔资源再无炼丹/锻造/参悟之途。
          </p>
          <div class="mt-1.5 flex justify-end gap-2">
            <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="furnaceConfirm = null">
              再想想
            </button>
            <button class="btn-seal !px-3 !py-2 !text-[11px] tabular" @click="doFurnace(row.rate)">
              确认熔尽
            </button>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between py-2.5">
        <span class="text-[12px] text-ink-soft">灵石(存 {{ formatGN(resources.spiritStone) }})</span>
        <button
          class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
          :disabled="stoneShort.m > 0"
          :title="stoneShort.m > 0 ? `灵石尚差 ${formatGN(stoneShort)}` : undefined"
          @click="furnaceConvertStone()"
        >
          {{
            stoneShort.m > 0
              ? `熔铸(灵石尚差 ${formatGN(stoneShort)})`
              : `${formatGN(furnaceStoneCost())} → ${FURNACE_STONE_DAO_SOURCE} 道源`
          }}
        </button>
      </div>
      <div class="py-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[12px] text-ink-soft">道源凝道果(跨世保留)</span>
          <button
            class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
            :disabled="fruitShort.short.m > 0"
            :title="fruitShort.reason ?? undefined"
            @click="doCondense()"
          >
            {{
              fruitShort.short.m > 0
                ? `道果 +1(道源尚差 ${daoSourceShortText(DAO_SOURCE_PER_FRUIT, endgame.daoSource)})`
                : `${DAO_SOURCE_PER_FRUIT} 道源 → 道果 +1`
            }}
          </button>
        </div>
        <!-- S3 链路:本次凝聚后,下世收益变化 -->
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint tabular">
          当前 {{ fruitInfo.total }} 枚 · 有效 {{ fruitCountLabel(fruitInfo.effective) }}
          <span class="text-gold-ink"
            >→ 凝后 {{ fruitCountLabel(fruitInfo.nextEffective) }}(+{{ fruitInfo.deltaPct }}%)</span
          >
          · 边际收益渐减
        </p>
      </div>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 炉</button>
    </template>
  </BaseModal>

  <!-- 首次凝道果:把「跨世保留的到底是什么」讲一次 -->
  <BaseModal :open="fruitDialogOpen" title="道果" @close="fruitDialogOpen = false">
    <div class="space-y-2.5 text-[12px] leading-relaxed">
      <p class="text-ink-soft">{{ fruitDialog.intro }}</p>
      <div>
        <p class="font-kai text-[12px] tracking-wider text-ink">用途</p>
        <p class="text-ink-faint">{{ fruitDialog.usages.join(" · ") }}</p>
      </div>
      <div>
        <p class="font-kai text-[12px] tracking-wider text-ink">来处</p>
        <p class="text-ink-faint">{{ fruitDialog.gains.join(" · ") }}</p>
      </div>
      <p class="border-l-2 border-violet-ink/60 pl-2 text-[11px] text-violet-ink">
        {{ fruitDialog.lifecycle }}
      </p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="fruitDialogOpen = false">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import {
  DAO_SOURCE_PER_FRUIT,
  FURNACE_RATES,
  FURNACE_STONE_DAO_SOURCE,
  type FurnaceRate
} from '@/data/endgame'
import {
  condenseDaoFruit,
  furnaceConvert,
  furnaceConvertStone,
  furnaceStoneCost
} from '@/core/endgameService'
import {
  daoFruitDialog,
  fruitCountLabel,
  fruitMarginalInfo,
  markFruitTutorialSeen,
  shouldShowFruitTutorial
} from '@/core/resourceGuidance'
import { formatGN, formatNum } from '@/utils/format'
import { gnZero, subClamp } from '@/utils/gnum'
import { daoSourceShortfall, daoSourceShortText } from '@/core/daoSource'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const resources = useResourcesStore()
const player = usePlayerStore()
const endgame = useEndgameStore()

/** 熔炉全熔确认态(按资源键)。熔炉弹窗关闭即复位,不残留旧行 */
const furnaceConfirm = ref<FurnaceRate['resource'] | null>(null)
watch(
  () => props.open,
  open => {
    if (!open) furnaceConfirm.value = null
  }
)

/** 全熔一包可得道源(预览,与 furnaceConvert 同口径 floor(have/per));灵草按仙品+计 */
const furnaceRows = computed(() =>
  FURNACE_RATES.map(rate => ({
    rate,
    have: rate.resource === 'herb' ? resources.herbMeltable : (resources[rate.resource] as number)
  }))
)
function furnacePreview(rate: FurnaceRate): number {
  return Math.floor(furnaceRows.value.find(r => r.rate.resource === rate.resource)!.have / rate.per)
}
function doFurnace(rate: FurnaceRate): void {
  furnaceConfirm.value = null
  furnaceConvert(rate)
}

const fruitInfo = computed(() => fruitMarginalInfo())
const fruitShort = computed(() => daoSourceShortfall(DAO_SOURCE_PER_FRUIT, endgame.daoSource))
/** 灵石熔铸缺石 —— 与 furnaceConvertStone 的 spendStone 同读一份价签 */
const stoneShort = computed(() => {
  const cost = furnaceStoneCost()
  return resources.hasStone(cost) ? gnZero() : subClamp(cost, resources.spiritStone)
})

/**
 * 凝道果 —— 首次成功时把「道果是什么」讲一次。
 *
 * shouldShowFruitTutorial / daoFruitDialog 写好了却无人调用:
 * 玩家第一次凝出道果(整套轮回经济的核心货币)时,没有任何解释。
 */
const fruitDialogOpen = ref(false)
const fruitDialog = computed(() => daoFruitDialog())
function doCondense(): void {
  const before = player.reincarnation.daoFruit
  // 标志序陷阱:condenseDaoFruit 首次成功时自己就置 daoFruitTutorialSeen=true,
  // 若在它之后才读 shouldShowFruitTutorial(),判定恒为假 —— 这条「首次凝道果」
  // 教学弹窗就永不弹出。必须先于凝果采样。
  const firstFruit = shouldShowFruitTutorial()
  condenseDaoFruit()
  if (player.reincarnation.daoFruit === before) return
  if (firstFruit) {
    fruitDialogOpen.value = true
    markFruitTutorialSeen()
  }
}
</script>
