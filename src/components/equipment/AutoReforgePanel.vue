<template>
  <!-- 不可嵌进天机推演段(v-if="canWhatIf",真仙+未装备才渲染):重铸人人在用 -->
  <div v-if="reforgeCostVal" class="mt-3 rounded-md border border-ink/15 bg-paper-deep/50 px-3 py-2">
    <p class="mb-1 text-[11px] text-ink-soft">
      任一命中即停 · 已选 {{ autoTargets.length }}/{{ AUTO_REFORGE_MAX_TARGETS }}
    </p>
    <div class="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
      <div v-for="group in rarityGroups" :key="group.rarity">
        <p class="flex items-center gap-1.5 text-[9px] tracking-widest" :style="{ color: AFFIX_RARITY_META[group.rarity].color }">
          <span class="h-px w-3 shrink-0" :style="{ background: AFFIX_RARITY_META[group.rarity].color }"></span>
          {{ AFFIX_RARITY_META[group.rarity].name }} · {{ group.items.length }} 条
        </p>
        <div class="mt-1 grid grid-cols-3 gap-1">
          <!-- 点名弹框;设为目标在弹框里做 -->
          <button
            v-for="af in group.items"
            :key="af.id"
            class="min-h-[28px] rounded px-1 py-1 text-[10px] leading-tight"
            :class="isAutoTarget(af.id) ? 'border' : 'bg-ink/4'"
            :style="isAutoTarget(af.id)
              ? { borderColor: AFFIX_RARITY_META[af.rarity].color, color: AFFIX_RARITY_META[af.rarity].color }
              : { color: 'var(--color-ink-faint)' }"
            :title="`查看「${af.name}」`"
            @click="openCodex(af.id)"
          >
            <span v-if="isAutoTarget(af.id)" class="mr-0.5">选</span>{{ af.name }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="autoTargets.length" class="mt-1.5 space-y-0.5">
      <p v-for="t in autoTargets" :key="t.affixId" class="flex items-center gap-2 text-[10px]">
        <!--
          词条名在 w-10(40px)里放不下五个字:实测「装备掉落率」scrollWidth 50 / clientWidth 40,
          屏上只剩「装备掉…」。而这是一个**按名字认的词条** —— 玩家要对照到底在给哪一条设阈值。
          触屏没有 hover,title 帮不上;读屏读到的又是被截断的可见文字。
          故把完整名字放进可访问名(与货架副标题同一做法),title 仍留作桌面端悬停。
        -->
        <button
          type="button"
          class="flex min-h-[28px] w-10 shrink-0 items-center truncate text-left font-kai"
          :style="{ color: targetColor(t.affixId) }"
          :aria-label="`查看「${affixDef(t.affixId)?.name ?? t.affixId}」词条`"
          :title="`查看「${affixDef(t.affixId)?.name ?? t.affixId}」`"
          @click="openCodex(t.affixId)"
        >
          {{ affixDef(t.affixId)?.name ?? t.affixId }}
        </button>
        <input
          v-model.number="t.minRoll"
          type="range"
          min="0"
          max="1"
          step="0.05"
          class="grow accent-cinnabar"
          :aria-label="`「${affixDef(t.affixId)?.name ?? t.affixId}」数值下限`"
        />
        <span class="w-12 shrink-0 text-right tabular text-ink-faint">≥{{ Math.round((t.minRoll ?? 0) * 100) }}%</span>
      </p>
    </div>
    <!--
      预算行:读数一段、按钮一段;按钮段宁可整段折到下一行,也不与读数抢宽度。

      原先整行是一个 flex:320 宽下「至多洗」被压成竖排(13px 宽 × 45px 高),「开 洗」只剩 37px。
      拆成两段后,窄屏下按钮整段换行,读数始终读得通。
    -->
    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span class="shrink-0 whitespace-nowrap text-[10px] text-ink-faint">至多洗</span>
      <input
        v-model.number="autoBudget"
        type="number"
        :min="1"
        :max="AUTO_REFORGE_MAX_BUDGET"
        class="w-16 shrink-0 rounded border border-ink/15 bg-paper/70 px-1 py-0.5 text-[11px] tabular"
        aria-label="至多洗炼次数"
      />
      <span class="shrink-0 whitespace-nowrap text-[10px] text-ink-faint">次</span>
      <!-- 每洗一炉的价签独占一段:它带着两个长数字,与预算读数挤同一行时会被截成两截 -->
      <span class="whitespace-nowrap text-[10px] text-ink-faint tabular">
        每洗 灵石 {{ formatGN(reforgeCostVal.stone) }} · 器灵尘×{{ reforgeCostVal.dust }}
      </span>
      <!--
        按钮段:两态都是「主钮独占一行」,行高与宽度不随确认态变。
        确认钮正文带整批总账(两个长数字),与「再想想」并排时 320 宽要 350px —— 会溢出面板;
        故确认态把「再想想」与总账分行,总账另起一行写在钮下方。
      -->
      <template v-if="!autoArm">
        <button
          class="btn-seal ml-auto shrink-0 !px-3 !py-1.5 !text-[11px]"
          :disabled="!autoTargets.length"
          :title="autoTargets.length ? undefined : TRANSFER_LABELS.pendingTarget"
          @click="autoArm = true"
        >
          开 洗
        </button>
      </template>
      <template v-else>
        <span class="ml-auto flex w-full items-center justify-end gap-1.5">
          <button class="btn-ghost shrink-0 !px-2.5 !py-1.5 !text-[11px] text-ink-faint" @click="autoArm = false">再想想</button>
          <button
            class="btn-seal shrink-0 !px-3 !py-1.5 !text-[11px]"
            :disabled="autoMaxGap?.short != null"
            :title="autoMaxShortText"
            @click="runAutoReforge"
          >
            确认开洗
          </button>
        </span>
        <!--
          整批总账:预算 × 单炉价,与服务层同一份 autoMaxCost。
          单位与数字之间留一个空格(全站规约,见 utils/format.formatYears 的注),
          且与重铸、强化那几处同写「灵石」「器灵尘」全称。
        -->
        <p class="w-full text-right text-[10px] leading-relaxed text-ink-faint tabular">
          至多 灵石 {{ autoMaxCost ? formatGN(autoMaxCost.stone) : '0' }} · 器灵尘×{{ autoMaxCost?.dust ?? 0 }}
        </p>
        <p v-if="autoMaxGap?.short" class="w-full text-right text-[10px] leading-relaxed text-cinnabar tabular">
          {{ autoMaxShortText }}
        </p>
      </template>
    </div>
  </div>

  <AffixInfoSheet
    :open="codexOpen"
    :affix-id="codexAffixId ?? ''"
    :targetable="true"
    :selected="codexSelected"
    :can-select="codexCanSelect"
    @toggle-target="toggleAutoTarget"
    @close="codexOpen = false"
  />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { affixDef } from '@/data/affixes'
  import { AFFIX_RARITY_META } from '@/data/statNames'
  import { AUTO_REFORGE_MAX_BUDGET, AUTO_REFORGE_MAX_TARGETS } from '@/core/reforge'
  import { formatGN } from '@/utils/format'
  import { useAutoReforge } from '@/composables/useAutoReforge'
  import { TRANSFER_LABELS } from '@/ui/affixTransferText'
  import { reforgeGapText } from '@/ui/reforgeText'
  import AffixInfoSheet from './AffixInfoSheet.vue'

  /**
   * 目标、预算、至多花销与开洗结账读宿主传下的同一份账(useAutoReforge)。
   * 词条弹框须盖在详情之上,不能塞进正文滚动盒。
   */
  const props = defineProps<{ flow: ReturnType<typeof useAutoReforge> }>()
  const {
    reforgeCostVal,
    autoBudget,
    autoTargets,
    autoArm,
    rarityGroups,
    autoMaxCost,
    autoMaxGap,
    isAutoTarget,
    targetColor,
    toggleAutoTarget,
    runAutoReforge
  } = props.flow

  /** 词条信息弹框:看词条信息的唯一入口 */
  const codexOpen = ref(false)
  const codexAffixId = ref<string | null>(null)
  function openCodex(affixId: string): void {
    codexAffixId.value = affixId
    codexOpen.value = true
  }

  const codexSelected = computed(() => codexAffixId.value !== null && isAutoTarget(codexAffixId.value))
  const codexCanSelect = computed(() => autoTargets.value.length < AUTO_REFORGE_MAX_TARGETS)

  const autoMaxShortText = computed(() => {
    const gap = autoMaxGap.value
    if (!gap?.short) return undefined
    return reforgeGapText(gap.stone, gap.dust)
  })
</script>
