<template>
  <BaseModal :open="decomposeOpen" title="一键分解" @close="emit('close-decompose')">
    <p class="text-[11px] leading-relaxed text-ink-faint">仅行囊现存 · 已装备、已上锁除外</p>
    <div class="mt-2 space-y-1">
      <label
        v-for="row in decomposeRows"
        :key="row.rank"
        class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
        :class="settings.decomposeRanks.includes(row.rank) ? 'bg-paper-deep/80' : ''"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-cinnabar"
          :checked="settings.decomposeRanks.includes(row.rank)"
          @change="toggleRank(row.rank)"
        />
        <span class="font-kai text-[13px]" :style="{ color: row.color }">{{ row.name }}</span>
        <span class="ml-auto tabular text-[11px] text-ink-faint">
          现存 {{ row.count }} 件
          <template v-if="row.count > 0">· {{ row.text }}</template>
        </span>
      </label>
    </div>
    <p v-if="decomposeTotal > 0" class="mt-2 text-right text-[11px] text-cinnabar tabular">
      将化尘 {{ decomposeTotal }} 件 · 可得 {{ batchYieldText(decomposePlanned) }}
    </p>
    <template #footer>
      <button class="btn-seal w-full" :disabled="decomposeTotal === 0" @click="confirmDecompose">
        分 解{{ decomposeTotal > 0 ? `(${decomposeTotal} 件)` : '' }}
      </button>
    </template>
  </BaseModal>

  <BaseModal :open="smartOpen" title="智能收纳" @close="emit('close-smart')">
    <p class="text-[11px] leading-relaxed text-ink-faint">新掉落:无缘即化尘 · 满包顶走最弱无缘件</p>
    <div
      class="mt-2.5 rounded-md px-3 py-2 text-[10px] leading-relaxed"
      :class="settings.smartKeep.enabled ? 'text-jade' : 'bg-ink/4 text-ink-faint'"
    >
      {{ smartStatusLine }}
    </div>

    <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">规则 · 门槛</p>
    <div class="rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1">
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[13px] text-ink-soft">启用智能收纳</span>
        <input v-model="settings.smartKeep.enabled" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <div class="border-t border-ink/6 py-1.5">
        <p class="mb-1.5 text-[12px] text-ink-soft">品质线 · {{ KEEP_QUALITY_CHOICES.find(q => q.rank === settings.smartKeep.minQuality)?.name ?? '灵品' }}以上</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="q in KEEP_QUALITY_CHOICES"
            :key="q.rank"
            class="chip-ink !py-2 text-[10px]"
            :class="settings.smartKeep.minQuality === q.rank ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            :aria-pressed="settings.smartKeep.minQuality === q.rank"
            @click="settings.smartKeep.minQuality = q.rank"
          >
            {{ q.name }}
          </button>
        </div>
      </div>
      <div class="border-t border-ink/6 py-1.5">
        <p class="mb-1.5 text-[12px] text-ink-soft">
          阶级线 · {{ settings.smartKeep.keepMinTier > 0 ? `${settings.smartKeep.keepMinTier} 阶以上 · 双线皆满才留` : '不设' }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in KEEP_TIER_CHOICES"
            :key="t"
            class="chip-ink !py-2 text-[10px]"
            :class="settings.smartKeep.keepMinTier === t ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            :aria-pressed="settings.smartKeep.keepMinTier === t"
            @click="settings.smartKeep.keepMinTier = t"
          >
            {{ t === 0 ? '不设' : `${t} 阶` }}
          </button>
        </div>
      </div>
    </div>

    <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">识宝</p>
    <div class="rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1">
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">主流派核心词条件</span>
        <input v-model="settings.smartKeep.keepCoreAffix" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">组合技部件</span>
        <input v-model="settings.smartKeep.keepComboPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">成套共鸣件</span>
        <input v-model="settings.smartKeep.keepSetPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">词条近满件</span>
        <input v-model="settings.smartKeep.keepPerfectRolls" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
    </div>
    <p class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">强化、重铸、转入过或带封存的件不动</p>

    <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">与「一键分解」勾选无关</p>
    <template #footer>
      <template v-if="!cleanConfirm">
        <!--
          禁用态只由 :disabled 决定,不再叠 opacity-45:
          .btn-ghost:disabled 刻意「压色不压字」(实测 5.55:1),叠一层 45% 透明后
          跌到 1.84:1 —— 而那行字正是「为什么按不了」。
        -->
        <button
          class="btn-ghost w-full !text-[12px]"
          :disabled="cleanCount === 0"
          @click="cleanConfirm = true"
        >
          清理行囊({{ cleanCount }} 件)
        </button>
      </template>
      <template v-else>
        <p class="mb-1 text-center text-[11px] text-cinnabar tabular">
          将化尘 {{ cleanCount }} 件 · 可得 {{ batchYieldText(cleanYield) }} · 不可逆
        </p>
        <div class="mb-2 max-h-36 overflow-y-auto rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1.5">
          <p
            v-for="t in cleanPreview.slice(0, SWEEP_PREVIEW_LIMIT)"
            :key="t.item.uid"
            class="flex items-baseline justify-between gap-2 py-1 text-[10px]"
          >
            <span class="min-w-0 truncate font-kai" :style="{ color: qualityTextColor(t.item.quality) }">
              {{ equipmentTemplate(t.item.templateId)?.name ?? '旧物' }}
            </span>
            <span class="shrink-0 text-ink-faint tabular">{{ t.item.tier }} 阶 · {{ t.reason }}</span>
          </p>
          <p v-if="cleanPreview.length > SWEEP_PREVIEW_LIMIT" class="mt-0.5 border-t border-ink/6 pt-0.5 text-[9px] text-ink-faint">
            … 另 {{ cleanPreview.length - SWEEP_PREVIEW_LIMIT }} 件
          </p>
          <p v-if="!cleanPreview.length" class="py-0.5 text-[10px] text-jade">无可化尘</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1 !text-[12px]" @click="cleanConfirm = false">再想想</button>
          <button class="btn-seal flex-1 !text-[12px]" @click="smartClean()">清理化尘</button>
        </div>
      </template>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { QUALITIES, qualityTextColor } from '@/data/qualities'
  import { MAX_EQUIP_TIER, equipmentTemplate } from '@/data/equipment'
  import { useInventoryStore } from '@/stores/inventory'
  import { useSettingsStore } from '@/stores/settings'
  import { useUiStore } from '@/stores/ui'
  import { batchYieldText, type DecomposeBatch, decomposeBatch, decomposeByRanks, decomposePreview } from '@/core/forge'
  import { sweepTargets } from '@/core/smartKeep'
  import { salvageOf } from '@/core/salvage'
  import { add, gnZero } from '@/utils/gnum'
  import { decomposeEmptyToast, smartCleanToast } from '@/ui/inventoryText'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 分解只认勾选档、须亲手动;收纳只判掉落后的去留,两者互不干扰。
   * 开关归宿主,此处只认 props、回传关闭。
   */
  defineProps<{ decomposeOpen: boolean; smartOpen: boolean }>()
  const emit = defineEmits<{ 'close-decompose': []; 'close-smart': [] }>()

  const inventory = useInventoryStore()
  const settings = useSettingsStore()
  const ui = useUiStore()

  /** 各品质档现存件数与返还,与服务同一套算法 */
  const decomposeRows = computed(() =>
    QUALITIES.map(q => {
      const got = decomposePreview([q.rank])
      return { rank: q.rank, name: q.name, color: qualityTextColor(q.id), count: got.count, text: batchYieldText(got) }
    })
  )

  const decomposeTotal = computed(() =>
    decomposeRows.value.filter(r => settings.decomposeRanks.includes(r.rank)).reduce((sum, r) => sum + r.count, 0)
  )

  const decomposePlanned = computed(() => decomposePreview(settings.decomposeRanks))

  function toggleRank(rank: number): void {
    const adding = !settings.decomposeRanks.includes(rank)
    settings.decomposeRanks = adding
      ? [...settings.decomposeRanks, rank].sort((a, b) => a - b)
      : settings.decomposeRanks.filter(r => r !== rank)
    // 勾选只标记,点「分 解」才销毁
  }

  function confirmDecompose(): void {
    // 总账 toast 由服务报,不逐件弹
    if (decomposeByRanks(settings.decomposeRanks) === 0) ui.toast(decomposeEmptyToast(), 'info')
    emit('close-decompose')
  }

  const KEEP_QUALITY_CHOICES = QUALITIES.map(q => ({ rank: q.rank, name: q.name }))
  /** 阶级自留线常用档:0 = 不设;顶格同源 MAX_EQUIP_TIER */
  const KEEP_TIER_CHOICES = [0, 8, 12, 16, 20, 24, 28, MAX_EQUIP_TIER]

  /** 清理预告清单条数上限,超出收成「另 N 件」 */
  const SWEEP_PREVIEW_LIMIT = 6

  /** 将化之件;预览与下手同一份名单 */
  const cleanPreview = computed(() => sweepTargets(inventory.bagItems))
  const cleanCount = computed(() => cleanPreview.value.length)
  /** 清理收益:纯算不化,与一键分解的 preview 同口径 */
  const cleanYield = computed<DecomposeBatch>(() => {
    const total: DecomposeBatch = { count: 0, dust: 0, stone: gnZero() }
    for (const t of cleanPreview.value) {
      const gain = salvageOf(t.item)
      total.count += 1
      total.dust += gain.dust
      total.stone = add(total.stone, gain.stone)
    }
    return total
  })

  const smartStatusLine = computed(() => {
    const sk = settings.smartKeep
    if (!sk.enabled) return '未启用'
    const keepName = KEEP_QUALITY_CHOICES.find(q => q.rank === sk.minQuality)?.name ?? '灵品'
    const tierLine = sk.keepMinTier > 0 ? `且 ${sk.keepMinTier} 阶以上` : ''
    const tags = [
      sk.keepCoreAffix && '核心',
      sk.keepComboPiece && '组合',
      sk.keepSetPiece && '成套',
      sk.keepPerfectRolls && '近满'
    ].filter(Boolean)
    const grace = tags.length ? ` · 或带${tags.join('/')}` : ''
    return `留:${keepName}以上${tierLine}${grace} · 余者化尘`
  })

  /** 清理二步确认态 */
  const cleanConfirm = ref(false)

  /**
   * 点下时现算名单(与确认页同源):sweepTargets 恰按 decomposeBatch 成功的「件在包且未锁」筛。
   * toast 报 decomposeBatch 实得,不报预览数。
   */
  function smartClean(): void {
    cleanConfirm.value = false
    const snapshot = sweepTargets(inventory.bagItems)
    const got = decomposeBatch(snapshot.map(t => t.item))
    // 有化尘报 success,否则 info(与一键换装同族口径)
    ui.toast(smartCleanToast(got.count, batchYieldText(got)), got.count > 0 ? 'success' : 'info')
    emit('close-smart')
  }
</script>
