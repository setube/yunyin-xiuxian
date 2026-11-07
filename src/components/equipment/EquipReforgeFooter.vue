<template>
  <!--
    无价签时(零词条或全封存)也写状态词。
    正常玩法每件至少留一个可重掷位,「无可重铸词条」只给旧档/异常数据兜底。
  -->
  <template v-if="reforgeCostVal || sealCostVal">
    <!--
      价目行常驻,按钮正文只留动作词。

      价签原先内联在「重铸词条」钮里:数字一长就把钮撑高 —— 375 宽实测未确认态 150.5×51、
      确认态 143.5×65.5,点一下再点回,钮忽大忽小,页脚整体高 220.8 与 235.3 之间来回、正文滚动盒跟着缩。
      320 宽更糟:123×84,「重铸词条」四个字被挤成竖排(每行一个字),那是排版事故不是换行。
      价签挪出钮外之后,两态都是「两枚等宽钮、单行主词」,几何不再随确认态变。
    -->
    <p class="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[10px] tabular text-ink-faint">
      <span v-if="reforgeCostVal" class="whitespace-nowrap">
        一炉 灵石 {{ formatGN(reforgeCostVal.stone) }} · 器灵尘×{{ reforgeCostVal.dust }}
      </span>
      <span v-if="sealCostVal" class="whitespace-nowrap">
        封存一词 灵石 {{ formatGN(sealCostVal) }}
        <span v-if="sealGap && sealGap.m > 0" class="text-cinnabar">灵石尚差 {{ formatGap(sealGap) }}</span>
      </span>
    </p>
    <!-- !py-2 不可降回 !py-1:盒高 27px,低于 28px 可点阈值(巡页判据会量弹窗内控件) -->
    <!-- min-h-11:两态同高。少了它,确认态两枚单行钮(34.5)与未确认态(封存格两行)差 5.5px -->
    <div class="flex gap-2 text-[11px]">
      <template v-if="reforgeArm !== inst?.uid">
        <button
          v-if="reforgeCostVal"
          class="btn-ghost min-h-11 flex-1 !py-2"
          :disabled="reforgeShortVal?.short != null"
          :aria-label="reforgeShortVal?.short ? `重铸词条 · ${reforgeShortText}` : undefined"
          :title="reforgeShortVal?.short ? reforgeShortText : undefined"
          @click="reforgeArm = inst?.uid ?? null"
        >
          重铸词条
        </button>
        <!--
          自动重铸的开关占住这一行右格:未确认态与确认态都是两枚等宽钮,行高等长。
          它原本在页脚最下一行与「转移词条」并排,移上来后页脚少一行(320×568 下正文只剩一小截)。
        -->
        <button
          v-if="reforgeCostVal"
          class="btn-ghost min-h-11 flex-1 !py-2"
          :aria-expanded="autoOpen"
          @click="emit('update:autoOpen', !autoOpen)"
        >
          {{ autoOpen ? '收起自动重铸' : '自动重铸' }}
        </button>
      </template>
      <template v-else>
        <!-- 取消在左、确认在右:与全站两步确认同一顺序(分解 / 熔尽 / 择道 / 立契) -->
        <button class="btn-ghost min-h-11 flex-1 !py-2 text-ink-faint" @click="reforgeArm = null">再想想</button>
        <button
          class="btn-seal min-h-11 flex-1 !py-2"
          :disabled="reforgeShortVal?.short != null"
          :aria-label="reforgeShortVal?.short ? `确认重铸 · ${reforgeShortText}` : undefined"
          :title="reforgeShortVal?.short ? reforgeShortText : undefined"
          @click="doReforge"
        >
          确认重铸
        </button>
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
    <div v-if="canTransferOut" class="flex gap-2">
      <button class="btn-ghost flex-1 !py-2 !text-[11px]" @click="emit('transfer')">
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
