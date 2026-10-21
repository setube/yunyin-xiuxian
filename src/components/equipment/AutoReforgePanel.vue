<template>
  <!--
    自动重铸:洗到指定词条即停(玩家反馈,可多选、可给最低值)。
    注意它**不属于**上方的天机推演(修士实验室) —— 那是真仙+未装备才有的
    v-if="canWhatIf" 段;重铸是凡人也在用的功能,若嵌在里面,普通玩家点开
    开关只会变字、词条格子与「开洗」永远不渲染(实测即玩家反馈的「没生效」)。
  -->
  <div v-if="reforgeCostVal" class="mt-3 rounded-md border border-ink/15 bg-paper-deep/50 px-3 py-2">
    <p class="mb-1 text-[11px] text-ink-soft">
      点词条看效果与区间,在弹框里设为目标(任一命中即停 · 已选 {{ autoTargets.length }}/{{ AUTO_REFORGE_MAX_TARGETS }})
    </p>
    <!-- 四档品质成组:传世在前、空组不占位 —— 一眼分出「撞大运的目标」与「随手可得」;
         组色用词条自身的品质色(与装备卡片同源),选中的下一颗整颗亮成「你的目标章」 -->
    <div class="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
      <div v-for="group in rarityGroups" :key="group.rarity">
        <p class="flex items-center gap-1.5 text-[9px] tracking-widest" :style="{ color: AFFIX_RARITY_META[group.rarity].color }">
          <span class="h-px w-3 shrink-0" :style="{ background: AFFIX_RARITY_META[group.rarity].color }"></span>
          {{ AFFIX_RARITY_META[group.rarity].name }} · {{ group.items.length }} 条
        </p>
        <div class="mt-1 grid grid-cols-3 gap-1">
          <!-- 点词条名即弹框看它的效果与区间;设为目标改在弹框里做(玩家反馈:不要词条表,点哪条看哪条) -->
          <button
            v-for="af in group.items"
            :key="af.id"
            class="min-h-[28px] rounded px-1 py-1 text-[10px] leading-tight"
            :class="isAutoTarget(af.id) ? 'border' : 'bg-ink/4'"
            :style="isAutoTarget(af.id)
              ? { borderColor: AFFIX_RARITY_META[af.rarity].color, color: AFFIX_RARITY_META[af.rarity].color }
              : { color: 'var(--color-ink-faint)' }"
            :title="`查看「${af.name}」效果与区间`"
            @click="openCodex(af.id)"
          >
            <span v-if="isAutoTarget(af.id)" class="mr-0.5">选</span>{{ af.name }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="autoTargets.length" class="mt-1.5 space-y-0.5">
      <!-- 已选目标回声品质色:它从哪一档领出来,这里就还它本来的颜色 -->
      <p v-for="t in autoTargets" :key="t.affixId" class="flex items-center gap-2 text-[10px]">
        <!-- 点已选词条名:钉开那张词条图,回来看清效果与区间再决定要不要留着这条目标 -->
        <button
          type="button"
          class="flex min-h-[28px] w-10 shrink-0 items-center truncate text-left font-kai"
          :style="{ color: targetColor(t.affixId) }"
          :title="`查看词条:${affixDef(t.affixId)?.name ?? t.affixId}`"
          @click="openCodex(t.affixId)"
        >
          {{ affixDef(t.affixId)?.name ?? t.affixId }}
        </button>
        <input v-model.number="t.minRoll" type="range" min="0" max="1" step="0.05" class="grow accent-cinnabar" />
        <span class="w-12 shrink-0 text-right tabular text-ink-faint">≥{{ Math.round((t.minRoll ?? 0) * 100) }}%</span>
      </p>
    </div>
    <div class="mt-1.5 flex items-center gap-2">
      <span class="text-[10px] text-ink-faint tabular">至多洗</span>
      <input
        v-model.number="autoBudget"
        type="number"
        :min="1"
        :max="AUTO_REFORGE_MAX_BUDGET"
        class="w-16 rounded border border-ink/15 bg-paper/70 px-1 py-0.5 text-[11px] tabular"
      />
      <span class="text-[10px] text-ink-faint tabular">次 · 每洗 {{ formatGN(reforgeCostVal.stone) }} 尘×{{ reforgeCostVal.dust }}</span>
      <template v-if="!autoArm">
        <button
          class="btn-seal ml-auto !px-3 !py-1.5 !text-[11px]"
          :disabled="!autoTargets.length"
          :title="autoTargets.length ? undefined : '先点一条要洗到的词条'"
          @click="autoArm = true"
        >
          开 洗
        </button>
      </template>
      <template v-else>
        <button
          class="btn-seal ml-auto !px-3 !py-1.5 !text-[11px]"
          :disabled="autoMaxGap?.short != null"
          :title="autoMaxShortText"
          @click="runAutoReforge"
        >
          洗?至多 灵石{{ autoMaxCost ? formatGN(autoMaxCost.stone) : '0' }}·尘×{{ autoMaxCost?.dust ?? 0 }}
        </button>
        <span v-if="autoMaxGap?.short" class="w-full text-[10px] leading-relaxed text-cinnabar tabular">
          {{ autoMaxShortText }}
        </span>
        <button class="btn-ghost !px-2.5 !py-1.5 !text-[11px] text-ink-faint" @click="autoArm = false">再想想</button>
      </template>
    </div>
  </div>

  <!-- 词条信息:点哪条弹哪条 —— 名/效果/数值区间/部位/门槛;设目标也在这扇框(顶层弹框盖在详情之上) -->
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
  import AffixInfoSheet from './AffixInfoSheet.vue'

  /**
   * 自动重铸面板 —— 自 EquipmentDetailDialog 迁入。
   *
   * 目标勾选、预算、至多花销与开洗结账都读宿主传下来的同一份账(useAutoReforge),
   * 面板只补自己那扇「词条图」的开合(点哪条看哪条,设目标也在这里)。
   * 面板同时渲染顶层词条弹框:它必须盖在详情之上,故不能塞进正文滚动盒。
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

  /** 词条信息弹框:点哪条就钉哪条(词条表已按反馈移除,这是看词条信息的唯一入口) */
  const codexOpen = ref(false)
  const codexAffixId = ref<string | null>(null)
  function openCodex(affixId: string): void {
    codexAffixId.value = affixId
    codexOpen.value = true
  }

  /** 弹框里这条当前是不是自动重铸目标;目标未满三才有「再设」(满的位子只留给取消) */
  const codexSelected = computed(() => codexAffixId.value !== null && isAutoTarget(codexAffixId.value))
  const codexCanSelect = computed(() => autoTargets.value.length < AUTO_REFORGE_MAX_TARGETS)

  const autoMaxShortText = computed(() => {
    const gap = autoMaxGap.value
    if (!gap?.short) return undefined
    const parts: string[] = []
    if (gap.stone.m > 0) parts.push(`灵石尚差 ${formatGN(gap.stone)}`)
    if (gap.dust > 0) parts.push(`器灵尘尚差 ${gap.dust}`)
    return parts.join(' · ')
  })
</script>
