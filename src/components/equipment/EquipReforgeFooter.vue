<template>
  <!--
    空皮先交代去向:一件凡品掷出零条、或全封存的装备,重铸与封存整块会一起消失 ——
    玩家找不到「自动重铸」,只会觉得它没生效。这里把「为什么没有」说破。
    正常玩法封不完整(每件至少留一个可重掷位),词条全封的那一格是给
    旧档/异常数据兜底,别把「一颗词条也无」错安到它有词条的头上。
  -->
  <template v-if="reforgeCostVal || sealCostVal">
    <div class="flex gap-2 text-[11px]">
      <!-- 重铸是装备培养高频动作:!py-1 盒高仅 27px,低于 28px 可点阈值(弹窗内控件,巡页判据按「恰好打开的弹窗」才量得到它)。
           !py-2 抬到 35px;封存格是静态展示,但同排按钮提高后也跟着对齐,视觉仍是一整行 -->
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
        <div v-if="sealCostVal" class="flex flex-1 items-center justify-center rounded-md border border-azure/20 bg-azure/5 px-2 py-2 text-azure">
          封存一词 {{ formatGN(sealCostVal) }}
        </div>
      </template>
      <template v-else>
        <button
          class="btn-seal flex-1 !py-2"
          title="条数与数值一并重掷,封存的不动"
          :disabled="reforgeShortVal?.short != null"
          @click="doReforge"
        >
          重掷?{{ formatGN(reforgeCostVal?.stone ?? 0) }} · 尘×{{ reforgeCostVal?.dust ?? 0 }}
        </button>
        <button class="btn-ghost flex-1 !py-2 text-ink-faint" @click="reforgeArm = null">再想想</button>
      </template>
    </div>
    <!--
      重铸到底做什么,得在按下之前说清:条数与数值一并重掷(封存的不动),
      不限次数、成本只随「阶数」与「封存数」走 —— 与旧版"越洗越贵、上限十次"不同。
    -->
    <p v-if="reforgeCostVal" class="text-center text-[10px] leading-relaxed text-ink-faint">
      重掷未封存的词条:条数(≤{{ affixCap }} 条)与数值一并重掷,封存的不动 · 不限次数,成本随阶数与封存数走
    </p>
    <!--
      付不起时先说清差哪一样、差多少:灵石与器灵尘来路相反,
      一句「灵石或器灵尘不足」会把玩家指得两头都跑。
    -->
    <p v-if="reforgeShortVal?.short" class="text-center text-[10px] leading-relaxed text-cinnabar tabular">
      {{ reforgeShortText }}
    </p>
    <p v-if="inst" class="text-center text-[10px] text-ink-faint tabular">
      已重铸 {{ inst.reforgeCount ?? 0 }} 次 · 已封存 {{ (inst.sealedAffixIds ?? []).length }}/{{ sealCapacity(inst) }}
    </p>
    <!-- 自动重铸与词条转移并成一行:页脚不加高(320×568 下正文本就只剩一小截) -->
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
      {{ inst.affixes.length === 0 ? '此物一颗词条也无,无从重铸,也无可封存。想炼它,先有纹可刻。' : '词条已尽数封存,无从重铸' }}
    </p>
    <!-- 全封存的旧档件也能把词条转出去 -->
    <button v-if="canTransferOut" class="btn-ghost w-full !py-2 !text-[11px]" @click="emit('transfer')">{{ TRANSFER_LABELS.entry }}</button>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { qualityDef } from '@/data/qualities'
  import { reforgeEquipment, reforgeCost, reforgeShortfall, sealCapacity, sealCost } from '@/core/reforge'
  import { reforgeShortToast } from '@/ui/reforgeText'
  import { formatGN } from '@/utils/format'
  import { TRANSFER_LABELS } from '@/ui/affixTransferText'

  /**
   * 重铸与封存的页脚块 —— 自 EquipmentDetailDialog 迁入。
   *
   * 价签与动作全读 core/reforge(reforgeCost / sealCost / sealCapacity),
   * 条数上限读品质表,不在界面另写一份。重铸二步确认态按件 uid 记,换件自然失效。
   * 「自动重铸」的开关留在宿主:展开后的面板在正文里,与页脚不是同一个位置。
   */
  defineProps<{ autoOpen: boolean; canTransferOut: boolean }>()
  const emit = defineEmits<{ 'update:autoOpen': [value: boolean]; transfer: [] }>()

  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const reforgeCostVal = computed(() => (inst.value ? reforgeCost(inst.value) : null))
  /** 这一炉两样各差多少 —— 置灰与提示同读一份,不各自再算一遍 */
  const reforgeShortVal = computed(() => (reforgeCostVal.value ? reforgeShortfall(reforgeCostVal.value) : null))
  const reforgeShortText = computed(() => {
    const s = reforgeShortVal.value
    if (!s) return ''
    const parts: string[] = []
    if (s.stone.m > 0) parts.push(`灵石尚差 ${formatGN(s.stone)}`)
    if (s.dust > 0) parts.push(`器灵尘尚差 ${s.dust}`)
    return `${parts.join(' · ')} —— ${reforgeShortToast(s.short!)}`
  })
  const sealCostVal = computed(() => (inst.value ? sealCost(inst.value) : null))
  /** 这一件按品质能有多少条词条:上限来自品质表,不在界面里另写一份 */
  const affixCap = computed(() => (inst.value ? qualityDef(inst.value.quality).affixes[1] : 0))

  // 重铸一次就重掷所有未封存词条(条数+数值),成本不低、可能盖掉好roll —— 与分解同款二步确认
  const reforgeArm = ref<string | null>(null)

  function doReforge(): void {
    if (!inst.value) return
    reforgeEquipment(inst.value.uid)
    reforgeArm.value = null
  }
</script>
