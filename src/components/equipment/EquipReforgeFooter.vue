<template>
  <!--
    无价签时(零词条或全封存)也写状态词。
    正常玩法每件至少留一个可重掷位,「无可重铸词条」只给旧档/异常数据兜底。
  -->
  <template v-if="reforgeCostVal || sealCostVal">
    <div class="flex gap-2 text-[11px]">
      <!-- !py-2 不可降回 !py-1:盒高 27px,低于 28px 可点阈值(巡页判据会量弹窗内控件) -->
      <template v-if="reforgeArm !== inst?.uid">
        <button
          v-if="reforgeCostVal"
          class="btn-ghost flex-1 !py-2"
          :disabled="reforgeShortVal?.short != null"
          @click="reforgeArm = inst?.uid ?? null"
        >
          重铸词条
          <span class="ml-1 tabular text-[10px] text-ink-faint">
            {{ formatGN(reforgeCostVal.stone) }} · 尘×{{ reforgeCostVal.dust }}
          </span>
        </button>
        <div
          v-if="sealCostVal"
          class="flex flex-1 flex-col items-center justify-center rounded-md border border-azure/20 px-2 py-2 text-ink"
        >
          <span>封存一词 {{ formatGN(sealCostVal) }}</span>
          <span v-if="sealGap && sealGap.m > 0" class="text-[9px] text-cinnabar tabular">
            灵石尚差 {{ formatGap(sealGap) }}
          </span>
        </div>
      </template>
      <template v-else>
        <button
          class="btn-seal flex-1 !py-2"
          :disabled="reforgeShortVal?.short != null"
          @click="doReforge"
        >
          确认重铸 {{ formatGN(reforgeCostVal?.stone ?? 0) }} · 尘×{{ reforgeCostVal?.dust ?? 0 }}
        </button>
        <button class="btn-ghost flex-1 !py-2 text-ink-faint" @click="reforgeArm = null">再想想</button>
      </template>
    </div>
    <!-- 条数上限在正文「n / 上限 条」,此处不重复 -->
    <p v-if="reforgeCostVal" class="text-center text-[10px] leading-relaxed text-ink-faint">
      条数与数值重掷 · 封存不动
    </p>
    <p v-if="reforgeShortVal?.short" class="text-center text-[10px] leading-relaxed text-cinnabar tabular">
      {{ reforgeShortText }}
    </p>
    <p v-if="inst" class="text-center text-[10px] text-ink-faint tabular">
      已重铸 {{ inst.reforgeCount ?? 0 }} 次 · 已封存 {{ (inst.sealedAffixIds ?? []).length }}/{{ sealCapacity(inst) }}
    </p>
    <!-- 并成一行:页脚不可加高(320×568 下正文本就只剩一小截) -->
    <div class="flex gap-2">
      <button v-if="reforgeCostVal" class="btn-ghost flex-1 !py-2 !text-[11px]" @click="emit('update:autoOpen', !autoOpen)">
        {{ autoOpen ? '收起自动重铸' : '自动重铸' }}
      </button>
      <button v-if="canTransferOut" class="btn-ghost flex-1 !py-2 !text-[11px]" @click="emit('transfer')">
        {{ TRANSFER_LABELS.entry }}
      </button>
    </div>
  </template>
  <template v-else-if="inst">
    <p class="text-center text-[10px] leading-relaxed text-ink-faint">
      {{ inst.affixes.length === 0 ? '暂无词条' : '无可重铸词条' }}
    </p>
    <!-- 全封存的旧档件也能把词条转出去 -->
    <button v-if="canTransferOut" class="btn-ghost w-full !py-2 !text-[11px]" @click="emit('transfer')">{{ TRANSFER_LABELS.entry }}</button>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { reforgeEquipment, reforgeCost, reforgeShortfall, sealCapacity, sealCost, sealShortfall } from '@/core/reforge'
  import { formatGN, formatGap } from '@/utils/format'
  import { TRANSFER_LABELS } from '@/ui/affixTransferText'

  /**
   * 价签与动作全读 core/reforge,不在界面另写。
   * 重铸二步确认态按件 uid 记,换件即失效。
   * 自动重铸开关状态在宿主:面板在正文,不在页脚。
   */
  defineProps<{ autoOpen: boolean; canTransferOut: boolean }>()
  const emit = defineEmits<{ 'update:autoOpen': [value: boolean]; transfer: [] }>()

  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const reforgeCostVal = computed(() => (inst.value ? reforgeCost(inst.value) : null))
  /** 置灰与提示同读这一份缺口 */
  const reforgeShortVal = computed(() => (reforgeCostVal.value ? reforgeShortfall(reforgeCostVal.value) : null))
  /** 分项列差额,不拼 toast 那一句(同一笔差额会写两遍) */
  const reforgeShortText = computed(() => {
    const s = reforgeShortVal.value
    if (!s) return ''
    const parts: string[] = []
    if (s.stone.m > 0) parts.push(`灵石尚差 ${formatGap(s.stone)}`)
    if (s.dust > 0) parts.push(`器灵尘尚差 ${s.dust}`)
    return parts.join(' · ')
  })
  const sealCostVal = computed(() => (inst.value ? sealCost(inst.value) : null))
  /** 封存石差:封满为 null,付得起为 0;与封存钮、服务拒因同源 */
  const sealGap = computed(() => (inst.value ? sealShortfall(inst.value) : null))

  // 二步确认(与分解同款):重铸重掷全部未封存词条,可能盖掉好 roll
  const reforgeArm = ref<string | null>(null)

  function doReforge(): void {
    if (!inst.value) return
    reforgeEquipment(inst.value.uid)
    reforgeArm.value = null
  }
</script>
